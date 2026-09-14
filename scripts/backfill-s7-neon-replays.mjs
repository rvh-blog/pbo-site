import { openMaintenanceDb, assertProductionWriteAllowed } from "./maintenance-db.mjs";
import {
  sunsetManualReviewMatchHints,
  sunsetReplayEntries,
  sunsetSourceAliasHints,
  sunsetSourceReviewHints,
} from "./backfill-s7-sunset-replays-config.mjs";
import {
  stargazerManualReviewMatchHints,
  stargazerReplayEntries,
  stargazerSourceAliasHints,
  stargazerSourceReviewHints,
} from "./backfill-s7-stargazer-replays-config.mjs";
import {
  neonS8ManualReviewMatchHints,
  neonS8ReplayEntries,
  neonS8SourceAliasHints,
  neonS8SourceReviewHints,
} from "./backfill-s8-neon-replays-config.mjs";
import {
  sunsetS8ManualReviewMatchHints,
  sunsetS8ReplayEntries,
  sunsetS8SourceAliasHints,
  sunsetS8SourceReviewHints,
} from "./backfill-s8-sunset-replays-config.mjs";
import {
  stargazerS8ManualReviewMatchHints,
  stargazerS8ReplayEntries,
  stargazerS8SourceAliasHints,
  stargazerS8SourceReviewHints,
} from "./backfill-s8-stargazer-replays-config.mjs";

const DATABASE_PATH = process.env.DATABASE_PATH || "pbo.db";
const SCRAPE_URL =
  process.env.REPLAY_SCRAPE_URL || "http://127.0.0.1:3000/api/replay-scrape";
const apply = process.argv.includes("--apply");
const summaryOnly = process.argv.includes("--summary-only");
const seasonNumber = Number.parseInt(process.env.BACKFILL_SEASON || "7", 10);
const backfillDivision = String(process.env.BACKFILL_DIVISION || "neon")
  .trim()
  .toLowerCase();
const isNeonS8Backfill = seasonNumber === 8 && backfillDivision === "neon";
const isSunsetS8Backfill = seasonNumber === 8 && backfillDivision === "sunset";
const isStargazerS8Backfill = seasonNumber === 8 && backfillDivision === "stargazer";
const isSunsetBackfill = backfillDivision === "sunset";
const isStargazerBackfill = backfillDivision === "stargazer";
const backfillDivisionName = backfillDivision;
const backfillLabel =
  backfillDivision === "sunset"
    ? "Sunset"
    : backfillDivision === "stargazer"
      ? "Stargazer"
      : "Neon";

if (apply) {
  assertProductionWriteAllowed(
    DATABASE_PATH,
    `${backfillDivision.toUpperCase()}_S${seasonNumber}`
  );
}

const ALLOWED_FORMATS = new Set([
  "[Gen 9] Draft",
  // Seasons 5-10 used the Paldea Dex Draft ruleset with Tera enabled.
  "[Gen 9] Tera Preview Draft",
  "[Gen 9] Paldea Dex Draft",
]);

function report(...args) {
  if (!summaryOnly) console.log(...args);
}

// Source order is retained from each season/division Discord/Google Sheet
// dump. The week hint disambiguates regular fixtures from the same team
// pairing in the playoff bracket. The importer still verifies the fixture
// from replay teams.
const replayEntries = [
  // Week 1
  { week: 1, url: "https://replay.pokemonshowdown.com/gen9draft-2229504708" },
  { week: 1, url: "https://replay.pokemonshowdown.com/gen9draft-2229638204" },
  { week: 1, url: "https://replay.pokemonshowdown.com/gen9draft-2231024844" },
  { week: 1, url: "https://replay.pokemonshowdown.com/gen9draft-2231081772" },
  { week: 1, url: "https://replay.pokemonshowdown.com/gen9draft-2231106678" },
  { week: 1, url: "https://replay.pokemonshowdown.com/gen9draft-2231552505-7fs9kyzb25iyv91239adp3eo4xf9ll4pw" },
  { week: 1, url: "https://replay.pokemonshowdown.com/gen9draft-2232277148" },

  // Week 2
  { week: 2, url: "https://replay.pokemonshowdown.com/gen9draft-2235618229" },
  { week: 2, url: "https://replay.pokemonshowdown.com/gen9draft-2235638956" },
  { week: 2, url: "https://replay.pokemonshowdown.com/gen9draft-2235668361" },
  { week: 2, url: "https://replay.pokemonshowdown.com/gen9draft-2235679854" },
  { week: 2, url: "https://replay.pokemonshowdown.com/gen9draft-2236296273" },
  { week: 2, url: "https://replay.pokemonshowdown.com/gen9ubers-2236305887" },
  { week: 2, url: "https://replay.pokemonshowdown.com/gen9draft-2236700077" },

  // Week 3
  { week: 3, url: "https://replay.pokemonshowdown.com/gen9draft-2238175368" },
  { week: 3, url: "https://replay.pokemonshowdown.com/gen9draft-2240219339" },
  { week: 3, url: "https://replay.pokemonshowdown.com/gen9draft-2240771852" },
  { week: 3, url: "https://replay.pokemonshowdown.com/gen9draft-2241351650" },
  { week: 3, url: "https://replay.pokemonshowdown.com/gen9draft-2241446142" },
  { week: 3, url: "https://replay.pokemonshowdown.com/gen9draft-2241482041" },

  // Week 4
  { week: 4, url: "https://replay.pokemonshowdown.com/gen9draft-2243374282" },
  { week: 4, url: "https://replay.pokemonshowdown.com/gen9draft-2244164187" },
  { week: 4, url: "https://replay.pokemonshowdown.com/gen9draft-2244709046" },
  { week: 4, url: "https://replay.pokemonshowdown.com/gen9draft-2245975592" },
  { week: 4, url: "https://replay.pokemonshowdown.com/gen9draft-2246517536" },

  // Week 5
  { week: 5, url: "https://replay.pokemonshowdown.com/gen9draft-2247960933-sfxbp5suqm3ud98wsmtdo1eah1iaugwpw" },
  { week: 5, url: "https://replay.pokemonshowdown.com/gen9draft-2248667579" },
  { week: 5, url: "https://replay.pokemonshowdown.com/gen9draft-2249266782" },
  { week: 5, url: "https://replay.pokemonshowdown.com/gen9draft-2249329434" },
  { week: 5, url: "https://replay.pokemonshowdown.com/gen9draft-2249914813" },
  { week: 5, url: "https://replay.pokemonshowdown.com/gen9draft-2251144433" },

  // Week 6
  { week: 6, url: "https://replay.pokemonshowdown.com/gen9draft-2252258567" },
  { week: 6, url: "https://replay.pokemonshowdown.com/gen9draft-2253738945" },
  { week: 6, url: "https://replay.pokemonshowdown.com/gen9draft-2254696436" },
  { week: 6, url: "https://replay.pokemonshowdown.com/gen9draft-2254837141" },
  { week: 6, url: "https://replay.pokemonshowdown.com/gen9draft-2254868416" },
  { week: 6, url: "https://replay.pokemonshowdown.com/gen9draft-2255601804" },

  // Week 7
  { week: 7, url: "https://replay.pokemonshowdown.com/gen9draft-2256315705" },
  { week: 7, url: "https://replay.pokemonshowdown.com/gen9draft-2258246753" },
  { week: 7, url: "https://replay.pokemonshowdown.com/gen9draft-2258326123" },
  { week: 7, url: "https://replay.pokemonshowdown.com/gen9draft-2259375143" },
  { week: 7, url: "https://replay.pokemonshowdown.com/gen9draft-2259381020" },
  { week: 7, url: "https://replay.pokemonshowdown.com/gen9draft-2259395724" },

  // Week 8
  { week: 8, url: "https://replay.pokemonshowdown.com/gen9draft-2261321670" },
  { week: 8, url: "https://replay.pokemonshowdown.com/gen9draft-2261983969" },
  { week: 8, url: "https://replay.pokemonshowdown.com/gen9draft-2262089877" },
  { week: 8, url: "https://replay.pokemonshowdown.com/gen9draft-2262547190" },
  { week: 8, url: "https://replay.pokemonshowdown.com/gen9draft-2263127317" },
  { week: 8, url: "https://replay.pokemonshowdown.com/gen9draft-2263807093" },

  // Playoff round 1
  { week: 101, url: "https://replay.pokemonshowdown.com/gen9draft-2266967658" },
  { week: 101, url: "https://replay.pokemonshowdown.com/gen9draft-2267469131" },
  { week: 101, url: "https://replay.pokemonshowdown.com/gen9draft-2268048367" },

  // Playoff round 2
  { week: 102, url: "https://replay.pokemonshowdown.com/gen9draft-2270727977" },
  { week: 102, url: "https://replay.pokemonshowdown.com/gen9draft-2275766003" },

  // Playoff round 3
  { week: 103, url: "https://replay.pokemonshowdown.com/gen9draft-2281835139" },
];

// These are source-context annotations, not replacements for replay or PBO
// data. They deliberately make known normalizations visible on the live match.
const sourceReviewHints = new Map([
  [
    "https://replay.pokemonshowdown.com/gen9ubers-2236305887",
    "Manual review requested: supplied replay is [Gen 9] Ubers rather than a Draft-format replay.",
  ],
  [
    "https://replay.pokemonshowdown.com/gen9draft-2229504708",
    "Source uses player alias holiss77; existing PBO identity is holiss7795/Caborca Gengars.",
  ],
  [
    "https://replay.pokemonshowdown.com/gen9draft-2229638204",
    "Source uses player alias platanopower420; existing PBO identity is platano_power_420/Chicago Chimchars.",
  ],
  [
    "https://replay.pokemonshowdown.com/gen9draft-2231106678",
    "Source labels the team BC Pyroars; canonical Season 7 team is BC Litleos.",
  ],
  [
    "https://replay.pokemonshowdown.com/gen9draft-2235618229",
    "Source labels the teams BC Pyroars and Richmond Registeels; canonical teams are BC Litleos and Richmond Raging Bolts.",
  ],
  [
    "https://replay.pokemonshowdown.com/gen9draft-2235638956",
    "Source labels Boston Banettes; canonical Season 7 team is Boston Babettes.",
  ],
  [
    "https://replay.pokemonshowdown.com/gen9draft-2236296273",
    "Source labels Icirrus City; canonical Season 7 team is St. Louis Solgaleos.",
  ],
  [
    "https://replay.pokemonshowdown.com/gen9draft-2244164187",
    "Source labels BC Pyroars; canonical Season 7 team is BC Litleos.",
  ],
  [
    "https://replay.pokemonshowdown.com/gen9draft-2252258567",
    "Source contains the spelling Geinhausen Gengars; canonical team is Gelnhausen Gengars.",
  ],
  [
    "https://replay.pokemonshowdown.com/gen9draft-2253738945",
    "Source contains Carborca Gengars and Boston Bulbasaur; canonical teams are Caborca Gengars and Boston Bulbasaurs.",
  ],
  [
    "https://replay.pokemonshowdown.com/gen9draft-2254837141",
    "Source labels Richmond Registeels; canonical Season 7 team is Richmond Raging Bolts.",
  ],
  [
    "https://replay.pokemonshowdown.com/gen9draft-2255601804",
    "Source labels Icirrus City and DR. Chicago Chimchars; canonical teams are St. Louis Solgaleos and Chicago Chimchars.",
  ],
  [
    "https://replay.pokemonshowdown.com/gen9draft-2261321670",
    "Source labels Icirrus City; canonical Season 7 team is St. Louis Solgaleos.",
  ],
]);

// These are historical PBO force-win records from the source dump. They have
// no replay to parse, but should still be visible for manual review after the
// backfill reaches the live site. Keep the official result/differential intact.
const manualReviewMatchHints = new Map([
  [
    1167,
    "Historical source records a force win in the Detroit Zoroarks vs BC Litleos fixture (source message attributes it to Bee); verify the old PBO differential rule.",
  ],
  [
    1190,
    "Historical source records a force win for Caborca Gengars over Dallas Dynamax; verify the old PBO differential rule.",
  ],
  [
    1193,
    "Historical source records Uncertain Unowns +3 over Detroit Zoroarks -4; verify the old PBO differential/force-win rule.",
  ],
]);

const activeReplayEntries = isNeonS8Backfill
  ? neonS8ReplayEntries
  : isSunsetS8Backfill
    ? sunsetS8ReplayEntries
    : isStargazerS8Backfill
      ? stargazerS8ReplayEntries
  : isSunsetBackfill
    ? sunsetReplayEntries
    : isStargazerBackfill
      ? stargazerReplayEntries
      : replayEntries;
const activeSourceReviewHints = isNeonS8Backfill
  ? neonS8SourceReviewHints
  : isSunsetS8Backfill
    ? sunsetS8SourceReviewHints
  : isStargazerS8Backfill
    ? stargazerS8SourceReviewHints
  : isSunsetBackfill
    ? sunsetSourceReviewHints
    : isStargazerBackfill
      ? stargazerSourceReviewHints
      : sourceReviewHints;
const activeSourceAliasHints = isNeonS8Backfill
  ? neonS8SourceAliasHints
  : isSunsetS8Backfill
    ? sunsetS8SourceAliasHints
  : isStargazerS8Backfill
    ? stargazerS8SourceAliasHints
  : isSunsetBackfill
    ? sunsetSourceAliasHints
    : isStargazerBackfill
      ? stargazerSourceAliasHints
      : new Map();
const activeManualReviewMatchHints = isNeonS8Backfill
  ? neonS8ManualReviewMatchHints
  : isSunsetS8Backfill
    ? sunsetS8ManualReviewMatchHints
  : isStargazerS8Backfill
    ? stargazerS8ManualReviewMatchHints
  : isSunsetBackfill
    ? sunsetManualReviewMatchHints
    : isStargazerBackfill
      ? stargazerManualReviewMatchHints
      : manualReviewMatchHints;

function nameKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/^mega/, "")
    .replace(/mega(?:x|y|z)?$/, "")
    .replace(/(?:incarnate|average|standard|hero|disguised|busted)$/, "")
    .replace(/^oricorio$/, "oricoriobaile")
    .replace(/^palafinhero$/, "palafin")
    .replace(/^mimikyu(?:disguised|busted)$/, "mimikyu")
    .replace(/^urshifu(?:rapidstrike|singlestrike)$/, "urshifu")
    .replace(/^gourgeist(?:average|small|large|super)$/, "gourgeist");
}

async function tableExists(database, name) {
  return Boolean(
    await database.get(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
      [name]
    )
  );
}

async function acceptedNamesByPokemonId(database) {
  const accepted = new Map();
  const add = (pokemonId, value) => {
    const names = accepted.get(pokemonId) || [];
    names.push(value);
    accepted.set(pokemonId, names);
  };

  if (await tableExists(database, "pokemon_name_aliases")) {
    for (const row of await database.all("SELECT pokemon_id, alias FROM pokemon_name_aliases")) {
      add(row.pokemon_id, row.alias);
    }
  }

  if (await tableExists(database, "pokemon_name_collapses")) {
    for (const row of await database.all(
      "SELECT target_pokemon_id AS pokemon_id, source_name AS alias FROM pokemon_name_collapses"
    )) {
      add(row.pokemon_id, row.alias);
    }
  }

  return accepted;
}

function rowKeys(row, accepted) {
  return [
    row.pokemon_name,
    row.pokemon_display_name,
    ...(accepted.get(row.pokemon_id) || []),
  ]
    .flatMap((value) => [nameKey(value)])
    .filter(Boolean);
}

function distinctMatch(replayTeam, rows, accepted) {
  const used = new Set();
  const matches = [];
  for (const pokemon of replayTeam || []) {
    const replayKey = nameKey(pokemon.name);
    const row = rows.find(
      (candidate) =>
        !used.has(candidate.id ?? `${candidate.season_coach_id}:${candidate.pokemon_id}`) &&
        rowKeys(candidate, accepted).includes(replayKey)
    );
    if (row) {
      used.add(row.id ?? `${row.season_coach_id}:${row.pokemon_id}`);
      matches.push({ row, pokemon });
    }
  }
  return { score: matches.length, matches };
}

function buildStoredEventStatements(matchId, events, eventTableExists) {
  if (!eventTableExists || !Array.isArray(events)) return [];

  return [
    { sql: "DELETE FROM battle_events WHERE match_id = ?", args: [matchId] },
    ...events.map((event) => ({
      sql: `
        INSERT INTO battle_events (
          match_id, turn, sequence, event_type, player, actor_nickname,
          target_player, target_nickname, pokemon_name, move_name, item_name,
          ability_name, status_name, field_name, value, source, raw_line, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        matchId,
        event.turn ?? 0,
        event.sequence ?? 0,
        event.eventType ?? "unknown",
        event.player ?? null,
        event.actorNickname ?? null,
        event.targetPlayer ?? null,
        event.targetNickname ?? null,
        event.pokemonName ?? null,
        event.moveName ?? null,
        event.itemName ?? null,
        event.abilityName ?? null,
        event.statusName ?? null,
        event.fieldName ?? null,
        event.value ?? null,
        event.source ?? null,
        event.rawLine ?? "",
        event.metadata ? JSON.stringify(event.metadata) : null,
      ],
    })),
  ];
}

function eventCause(event) {
  const cause = String(event.cause || "").toLowerCase();
  if (cause.includes("stealth rock") || cause.includes("spikes")) return "hazard";
  if (cause.includes("sandstorm") || cause.includes("hail")) return "weather";
  if (
    ["psn", "tox", "brn"].includes(cause) ||
    cause.includes("leech seed") ||
    cause.includes("salt cure") ||
    cause.includes("curse")
  ) {
    return "status";
  }
  if (cause.includes("recoil") || cause.includes("life orb")) return "recoil";
  if (
    cause.includes("rocky helmet") ||
    cause.includes("rough skin") ||
    cause.includes("iron barbs")
  ) {
    return "contact";
  }
  if (cause.includes("future sight") || cause.includes("doom desire")) return "move";
  return "move";
}

function buildKillEventStatements(
  match,
  replay,
  mappedRows,
  p1IsCoach1,
  moveIdByName,
  killEventsEnabled
) {
  if (!killEventsEnabled) return [];

  const byCoachAndName = new Map();
  for (const { row } of mappedRows) {
    byCoachAndName.set(`${row.season_coach_id}:${nameKey(row.pokemon_name)}`, row);
    if (row.pokemon_display_name) {
      byCoachAndName.set(
        `${row.season_coach_id}:${nameKey(row.pokemon_display_name)}`,
        row
      );
    }
  }

  const p1Coach = p1IsCoach1 ? match.coach1_season_id : match.coach2_season_id;
  const p2Coach = p1IsCoach1 ? match.coach2_season_id : match.coach1_season_id;
  const coachForPlayer = (player) => (player === "p1" ? p1Coach : p2Coach);
  const keyEvents = Array.isArray(replay.keyEvents) ? replay.keyEvents : [];
  const statements = [
    { sql: "DELETE FROM kill_events WHERE match_id = ?", args: [match.id] },
  ];
  for (const event of keyEvents.filter(
    (entry) => entry.type === "faint" && entry.pokemon
  )) {
    const victimCoach = coachForPlayer(event.player);
    const victim = byCoachAndName.get(
      `${victimCoach}:${nameKey(event.pokemon)}`
    );
    if (!victim) continue;

    const killerCoach = event.killerPlayer
      ? coachForPlayer(event.killerPlayer)
      : null;
    const killer = killerCoach && event.killer
      ? byCoachAndName.get(`${killerCoach}:${nameKey(event.killer)}`)
      : null;
    const moveName = event.move || null;
    const moveKey = moveName ? moveName.toLowerCase() : null;
    const moveId = moveKey
      ? moveIdByName.get(moveKey) ||
        moveIdByName.get(moveKey.replace(/\s+/g, "-")) ||
        null
      : null;

    statements.push({
      sql: `
        INSERT INTO kill_events (
          match_id, turn, killer_pokemon_id, killer_season_coach_id,
          victim_pokemon_id, victim_season_coach_id, move_id, move_name, cause
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        match.id,
        event.turn || 0,
        killer?.pokemon_id || null,
        killerCoach,
        victim.pokemon_id,
        victimCoach,
        moveId,
        moveName,
        eventCause(event),
      ],
    });
  }
  return statements;
}

async function scrapeReplay(replayUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(SCRAPE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ replayUrl }),
      signal: controller.signal,
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || `Replay scrape failed with ${response.status}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

const database = openMaintenanceDb(DATABASE_PATH);

for (const [table, column] of [
  ["matches", "needs_review"],
  ["matches", "review_notes"],
  ["match_pokemon", "moves_used"],
  ["match_pokemon", "revealed_items"],
]) {
  const columns = new Set(
    (await database.all(`PRAGMA table_info(${table})`)).map((row) => String(row.name))
  );
  if (!columns.has(column)) {
    database.client.close();
    throw new Error(`${table}.${column} is missing; run database migrations first`);
  }
}

const season = await database.get(
  "SELECT id, season_number FROM seasons WHERE season_number = ? LIMIT 1",
  [seasonNumber]
);
if (!season) {
  database.client.close();
  throw new Error(`Season ${seasonNumber} was not found`);
}

const division = await database.get(
  "SELECT id, name FROM divisions WHERE season_id = ? AND lower(trim(name)) = ? LIMIT 1",
  [season.id, backfillDivisionName]
);
if (!division) {
  database.client.close();
  throw new Error(`Season ${seasonNumber} ${backfillLabel} was not found`);
}

const accepted = await acceptedNamesByPokemonId(database);
const matches = await database.all(`
    SELECT
      m.*, d.name AS division_name, s.season_number,
      c1.team_name AS coach1_name, c2.team_name AS coach2_name,
      w.team_name AS winner_name
    FROM matches m
    JOIN divisions d ON d.id = m.division_id
    JOIN seasons s ON s.id = m.season_id
    JOIN season_coaches c1 ON c1.id = m.coach1_season_id
    JOIN season_coaches c2 ON c2.id = m.coach2_season_id
    LEFT JOIN season_coaches w ON w.id = m.winner_id
    WHERE m.season_id = ? AND m.division_id = ?
    ORDER BY m.week, m.id
  `, [season.id, division.id]);

const rowsByMatch = `
  SELECT
    mp.*, p.name AS pokemon_name, p.display_name AS pokemon_display_name
  FROM match_pokemon mp
  JOIN pokemon p ON p.id = mp.pokemon_id
  WHERE mp.match_id = ?
`;

const rosterRows = await database.all(`
  SELECT
    r.season_coach_id, r.pokemon_id, p.name AS pokemon_name,
    p.display_name AS pokemon_display_name
  FROM rosters r
  JOIN season_coaches sc ON sc.id = r.season_coach_id
  JOIN pokemon p ON p.id = r.pokemon_id
  WHERE sc.division_id = ?
` , [division.id]);
const rosterRowsByCoach = new Map();
for (const row of rosterRows) {
  const rows = rosterRowsByCoach.get(row.season_coach_id) || [];
  rows.push(row);
  rosterRowsByCoach.set(row.season_coach_id, rows);
}

function supplementMatchRows(match, rows, seasonCoachId) {
  const existingPokemonIds = new Set(
    rows
      .filter((row) => row.season_coach_id === seasonCoachId)
      .map((row) => row.pokemon_id)
  );
  const fallbackRows = (rosterRowsByCoach.get(seasonCoachId) || [])
    .filter((row) => !existingPokemonIds.has(row.pokemon_id))
    .map((row) => ({
      ...row,
      id: null,
      match_id: match.id,
      kills: 0,
      deaths: 0,
    }));
  return [
    ...rows.filter((row) => row.season_coach_id === seasonCoachId),
    ...fallbackRows,
  ];
}

const updateMatch = `
  UPDATE matches SET
    replay_url = ?,
    needs_review = ?,
    review_notes = ?,
    played_at = COALESCE(?, played_at),
    started_at = COALESCE(?, started_at),
    ended_at = COALESCE(?, ended_at),
    turn_snapshots = COALESCE(?, turn_snapshots),
    key_events = COALESCE(?, key_events),
    zoroark_involved = CASE WHEN ? = 1 THEN 1 ELSE zoroark_involved END
  WHERE id = ?
`;

const updatePokemon = `
  UPDATE match_pokemon SET
    kills = ?, deaths = ?, damage_dealt = ?, damage_dealt_indirect = ?,
    damage_taken = ?, damage_taken_indirect = ?, turns_active = ?,
    hazard_damage_taken = ?, setup_moves_used = ?, favorable_crits = ?,
    favorable_misses = ?, favorable_flinches = ?, favorable_paralysis = ?,
    favorable_freezes = ?, favorable_burns = ?, favorable_sleep = ?,
    favorable_confusions = ?, favorable_confusion_self_hits = ?,
    favorable_events = ?, hp_restored = ?, moves_used = ?, revealed_items = ?
  WHERE id = ?
`;

const insertMatchPokemon = `
  INSERT INTO match_pokemon (
    match_id, season_coach_id, pokemon_id, kills, deaths
  ) VALUES (?, ?, ?, 0, 0)
  RETURNING id
`;

const replayAlreadyUsed =
  "SELECT id FROM matches WHERE replay_url = ? AND id != ? LIMIT 1";
const battleEventsEnabled = await tableExists(database, "battle_events");
const killEventsEnabled = await tableExists(database, "kill_events");
const moveIdByName = new Map(
  (await database.all("SELECT id, name, display_name FROM moves"))
    .flatMap((move) => [
      [String(move.name || "").toLowerCase(), move.id],
      [String(move.display_name || "").toLowerCase(), move.id],
    ])
    .filter(([name]) => name)
);

const candidates = [];
for (const match of matches) {
  const rows = await database.all(rowsByMatch, [match.id]);
  candidates.push({
    match,
    rows: [
      ...supplementMatchRows(match, rows, match.coach1_season_id),
      ...supplementMatchRows(match, rows, match.coach2_season_id),
    ],
  });
}
const seenMatchIds = new Set();
const seenUrls = new Set();
let clean = 0;
let reviewed = 0;
let failed = 0;
let updatedRows = 0;
let storedEvents = 0;
let missingReplays = 0;

for (const entry of activeReplayEntries) {
  if (seenUrls.has(entry.url)) {
    reviewed++;
    report(`REVIEW duplicate replay URL in manifest: ${entry.url}`);
    continue;
  }
  seenUrls.add(entry.url);

  let replay;
  try {
    replay = await scrapeReplay(entry.url);
  } catch (error) {
    failed++;
    report(
      `REVIEW replay ${entry.url}: parse failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    continue;
  }

  const hintedCandidates = candidates.filter(
    ({ match }) => match.week === entry.week
  );
  const pool = hintedCandidates.length > 0 ? hintedCandidates : candidates;
  const scored = pool
    .map(({ match, rows }) => {
      const rows1 = rows.filter(
        (row) => row.season_coach_id === match.coach1_season_id
      );
      const rows2 = rows.filter(
        (row) => row.season_coach_id === match.coach2_season_id
      );
      const direct =
        distinctMatch(replay.p1Team, rows1, accepted).score +
        distinctMatch(replay.p2Team, rows2, accepted).score;
      const swapped =
        distinctMatch(replay.p1Team, rows2, accepted).score +
        distinctMatch(replay.p2Team, rows1, accepted).score;
      return {
        match,
        rows,
        rows1,
        rows2,
        direct,
        swapped,
        score: Math.max(direct, swapped),
      };
    })
    .sort((a, b) => b.score - a.score || a.match.id - b.match.id);

  const best = scored[0];
  const second = scored[1];
  const reasons = [];
  if (!hintedCandidates.length) {
    reasons.push(`No fixture matched source week hint ${entry.week}`);
  }
  if (!best || best.score < 8) {
    reasons.push(`Low roster mapping confidence (${best?.score || 0}/12)`);
  }
  if (best && second && best.score === second.score) {
    reasons.push(`Ambiguous fixture mapping (${best.score}/${second.score})`);
  }
  if (!best || best.score < 8 || (second && best.score === second.score)) {
    reviewed++;
    report(
      `REVIEW replay ${entry.url}: ${reasons.join("; ") || "no fixture"}`
    );
    continue;
  }

  const match = best.match;
  if (seenMatchIds.has(match.id)) {
    reviewed++;
    report(
      `REVIEW match ${match.id} ${match.coach1_name} vs ${match.coach2_name}: multiple replay candidates`
    );
    continue;
  }
  seenMatchIds.add(match.id);

  const duplicate = await database.get(replayAlreadyUsed, [entry.url, match.id]);
  if (duplicate) reasons.push(`Replay is already attached to match ${duplicate.id}`);

  const p1IsCoach1 = best.direct >= best.swapped;
  const replayTeam1 = p1IsCoach1 ? replay.p1Team : replay.p2Team;
  const replayTeam2 = p1IsCoach1 ? replay.p2Team : replay.p1Team;
  const p1Coach = p1IsCoach1 ? match.coach1_season_id : match.coach2_season_id;
  const p2Coach = p1IsCoach1 ? match.coach2_season_id : match.coach1_season_id;
  const replayWinnerId =
    replay.winner === "p1"
      ? p1Coach
      : replay.winner === "p2"
        ? p2Coach
        : null;

  const team1Map = distinctMatch(replayTeam1, best.rows1, accepted);
  const team2Map = distinctMatch(replayTeam2, best.rows2, accepted);
  const mappedRows = [...team1Map.matches, ...team2Map.matches];
  const newlyIntroducedRows = mappedRows.filter(({ row }) => row.id === null);
  if (newlyIntroducedRows.length > 0) {
    reasons.push(
      `Replay included ${newlyIntroducedRows.map(({ pokemon }) => pokemon.name).join(", ")} not present in existing match Pokemon rows; added for review`
    );
  }

  if (replay.tier && !ALLOWED_FORMATS.has(replay.tier)) {
    reasons.push(`Unexpected replay format: ${replay.tier}`);
  }
  if (replayWinnerId !== match.winner_id) {
    reasons.push(
      `Replay winner conflicts with official result (${replayWinnerId || "none"} vs ${match.winner_id || "none"})`
    );
  }

  const coach1Remaining = p1IsCoach1 ? replay.p1Remaining : replay.p2Remaining;
  const coach2Remaining = p1IsCoach1 ? replay.p2Remaining : replay.p1Remaining;
  const replayDiff1 =
    replayWinnerId === match.coach1_season_id
      ? coach1Remaining
      : replayWinnerId === match.coach2_season_id
        ? -coach2Remaining
        : 0;
  const replayDiff2 =
    replayWinnerId === match.coach2_season_id
      ? coach2Remaining
      : replayWinnerId === match.coach1_season_id
        ? -coach1Remaining
        : 0;
  if (
    replayDiff1 !== match.coach1_differential ||
    replayDiff2 !== match.coach2_differential
  ) {
    reasons.push(
      `Replay differential ${replayDiff1}/${replayDiff2} conflicts with official ${match.coach1_differential}/${match.coach2_differential}`
    );
  }
  if (replay.zoroarkInvolved) {
    reasons.push("Zoroark/Illusion detected; KO and move attribution needs review");
  }
  if (mappedRows.length < 12) {
    reasons.push(`Only ${mappedRows.length}/12 Pokemon rows mapped`);
  }
  if (activeSourceReviewHints.has(entry.url)) {
    reasons.push(activeSourceReviewHints.get(entry.url));
  }
  for (const username of [replay.p1Username, replay.p2Username]) {
    const aliasHint = activeSourceAliasHints.get(nameKey(username));
    if (aliasHint) reasons.push(aliasHint);
  }

  for (const { row, pokemon } of mappedRows) {
    if (pokemon.kills !== row.kills || pokemon.deaths !== row.deaths) {
      reasons.push(
        `${row.pokemon_display_name || row.pokemon_name} official K/D ${row.kills}-${row.deaths}, replay parser ${pokemon.kills}-${pokemon.deaths}`
      );
    }
  }

  const uniqueReasons = [...new Set(reasons)];
  const needsReview = Boolean(match.needs_review) || uniqueReasons.length > 0;
  const previousNotes = match.review_notes ? [match.review_notes] : [];
  const reviewNotes = [...new Set([...previousNotes, ...uniqueReasons])];
  const note = reviewNotes.length > 0 ? reviewNotes.join("; ") : null;
  if (apply) {
    const statements = [
      {
        sql: updateMatch,
        args: [
        entry.url,
        needsReview ? 1 : 0,
        note,
        replay.startedAt || null,
        replay.startedAt || null,
        replay.endedAt || null,
        JSON.stringify(replay.turnSnapshots || []),
        JSON.stringify(replay.keyEvents || []),
        replay.zoroarkInvolved ? 1 : 0,
        match.id
        ],
      },
    ];

    // Replay-derived fields are still stored on reviewed matches so move,
    // item, and Experimental Stats coverage is not silently discarded. The
    // official winner/differential remain untouched in the matches table.
    for (const { row, pokemon } of mappedRows) {
      let rowId = row.id;
      if (!rowId) {
        const inserted = await database.get(insertMatchPokemon, [
          match.id,
          row.season_coach_id,
          row.pokemon_id,
        ]);
        rowId = inserted?.id;
      }
      if (!rowId) {
        throw new Error(
          `Could not create match Pokemon row for match ${match.id} and Pokemon ${row.pokemon_id}`
        );
      }
      statements.push({
        sql: updatePokemon,
        args: [
          pokemon.kills ?? 0,
          pokemon.deaths ?? 0,
          pokemon.damageDealt ?? null,
          pokemon.damageDealtIndirect ?? null,
          pokemon.damageTaken ?? null,
          pokemon.damageTakenIndirect ?? null,
          pokemon.turnsActive ?? null,
          pokemon.hazardDamageTaken ?? null,
          pokemon.setupMovesUsed ?? null,
          pokemon.favorableCrits ?? null,
          pokemon.favorableMisses ?? null,
          pokemon.favorableFlinches ?? null,
          pokemon.favorableParalysis ?? null,
          pokemon.favorableFreezes ?? null,
          pokemon.favorableBurns ?? null,
          pokemon.favorableSleep ?? null,
          pokemon.favorableConfusions ?? null,
          pokemon.favorableConfusionSelfHits ?? null,
          JSON.stringify(pokemon.favorableEvents || []),
          pokemon.hpRestored ?? null,
          JSON.stringify(pokemon.movesUsed || {}),
          JSON.stringify(pokemon.revealedItems || []),
          rowId
        ],
      });
    }

    statements.push(
      ...buildKillEventStatements(
        match,
        replay,
        mappedRows,
        p1IsCoach1,
        moveIdByName,
        killEventsEnabled
      ),
      ...buildStoredEventStatements(
        match.id,
        Array.isArray(replay.battleEvents) ? replay.battleEvents : [],
        battleEventsEnabled
      )
    );
    await database.batch(statements);
  }

  updatedRows += mappedRows.length;
  storedEvents += Array.isArray(replay.battleEvents)
    ? replay.battleEvents.length
    : 0;
  if (needsReview) {
    reviewed++;
    report(
      `REVIEW ${apply ? "APPLIED" : "PLANNED"} S${seasonNumber} ${backfillLabel} W${entry.week} ${match.coach1_name} vs ${match.coach2_name}: ${note}`
    );
  } else {
    clean++;
    report(
      `${apply ? "APPLIED" : "PLANNED"} S${seasonNumber} ${backfillLabel} W${entry.week} ${match.coach1_name} vs ${match.coach2_name}`
    );
  }
}

const markManualReview = `
  UPDATE matches
  SET needs_review = 1,
      review_notes = CASE
        WHEN review_notes IS NULL OR review_notes = '' THEN ?
        WHEN instr(review_notes, ?) > 0 THEN review_notes
        ELSE review_notes || '; ' || ?
      END
  WHERE id = ?
`;
const reviewStatements = [];

for (const [matchId, message] of activeManualReviewMatchHints) {
  const match = matches.find(({ id }) => id === matchId);
  if (!match) {
    report(`REVIEW historical force-win hint targets missing match ${matchId}`);
    continue;
  }
  if (apply) {
    reviewStatements.push({
      sql: markManualReview,
      args: [message, message, message, matchId],
    });
  }
  reviewed++;
  report(`REVIEW ${apply ? "APPLIED" : "PLANNED"} historical match ${matchId}: ${message}`);
}

const markMissing = `
  UPDATE matches
  SET needs_review = 1,
      review_notes = CASE
        WHEN review_notes IS NULL OR review_notes = '' THEN ?
        WHEN instr(review_notes, ?) > 0 THEN review_notes
        ELSE review_notes || '; ' || ?
      END
  WHERE id = ?
`;

for (const { match } of candidates) {
  if (seenMatchIds.has(match.id)) continue;
  if (match.replay_url) continue;
  // Do not treat forfeits as missing replay data. A completed playoff fixture
  // without a supplied replay is still useful review information.
  if (match.is_forfeit) continue;

  const message = `No replay was supplied for this completed ${backfillLabel} S${seasonNumber} match`;
  missingReplays++;
  if (apply) {
    reviewStatements.push({
      sql: markMissing,
      args: [message, message, message, match.id],
    });
  }
  report(`REVIEW missing replay S${seasonNumber} ${backfillLabel} W${match.week} match ${match.id}`);
}

if (apply) await database.batch(reviewStatements);
database.client.close();

console.log(
  [
    `${apply ? "Applied" : "Planned"} ${activeReplayEntries.length} supplied replay entries`,
    `${clean} clean`,
    `${reviewed} reviewed`,
    `${updatedRows} Pokemon rows mapped`,
    `${storedEvents} battle events found`,
    `${missingReplays} completed matches without supplied replay evidence`,
    `${failed} replay failures`,
    `target fixtures ${matches.length}`,
  ].join("; ")
);

if (failed > 0) process.exitCode = 1;
