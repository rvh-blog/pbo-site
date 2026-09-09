import Database from "better-sqlite3";

const apply = process.argv.includes("--apply");
const limitArg = process.argv.find((argument) => argument.startsWith("--limit="));
const limit = limitArg ? Math.max(1, Number(limitArg.split("=")[1]) || 1) : Number.POSITIVE_INFINITY;
const siteUrl = (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
const dbPath = process.env.DATABASE_PATH || "pbo.db";
const database = new Database(dbPath);
database.pragma("busy_timeout = 30000");

const matches = database.prepare("SELECT id, replay_url FROM matches WHERE replay_url IS NOT NULL AND replay_url <> '' ORDER BY id DESC").all();
const hasEvents = database.prepare("SELECT 1 FROM battle_events WHERE match_id = ? LIMIT 1");
const insert = database.prepare(`INSERT INTO battle_events (
  match_id, turn, sequence, event_type, player, actor_nickname, target_player,
  target_nickname, pokemon_name, move_name, item_name, ability_name, status_name,
  field_name, value, source, raw_line, metadata
) VALUES (@matchId, @turn, @sequence, @eventType, @player, @actorNickname,
  @targetPlayer, @targetNickname, @pokemonName, @moveName, @itemName,
  @abilityName, @statusName, @fieldName, @value, @source, @rawLine, @metadata)`);
const insertMany = database.transaction((matchId, events) => {
  for (const event of events) insert.run({
    matchId,
    turn: event.turn ?? 0,
    sequence: event.sequence ?? 0,
    eventType: event.eventType ?? "unknown",
    player: event.player ?? null,
    actorNickname: event.actorNickname ?? null,
    targetPlayer: event.targetPlayer ?? null,
    targetNickname: event.targetNickname ?? null,
    pokemonName: event.pokemonName ?? null,
    moveName: event.moveName ?? null,
    itemName: event.itemName ?? null,
    abilityName: event.abilityName ?? null,
    statusName: event.statusName ?? null,
    fieldName: event.fieldName ?? null,
    value: event.value ?? null,
    source: event.source ?? null,
    rawLine: event.rawLine ?? "",
    metadata: event.metadata ? JSON.stringify(event.metadata) : null,
  });
});

let inspected = 0;
let eligible = 0;
let stored = 0;
let failed = 0;
for (const match of matches) {
  if (eligible >= limit) break;
  inspected += 1;
  if (hasEvents.get(match.id)) continue;
  eligible += 1;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const response = await fetch(`${siteUrl}/api/replay-scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replayUrl: match.replay_url }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`Replay API returned HTTP ${response.status}`);
    const payload = await response.json();
    const events = Array.isArray(payload.battleEvents) ? payload.battleEvents : [];
    if (apply && events.length) insertMany(match.id, events);
    stored += events.length;
    console.log(`${apply ? "Stored" : "Would store"} ${events.length} events for match ${match.id}`);
  } catch (error) {
    failed += 1;
    console.error(`Match ${match.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

database.close();
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", siteUrl, inspected, eligible, events: stored, failed }, null, 2));

