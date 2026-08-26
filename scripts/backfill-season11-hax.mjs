import Database from "better-sqlite3";

const MIN_SEASON = 11;
const DATABASE_PATH = process.env.DATABASE_PATH || "pbo.db";
const SCRAPE_URL = process.env.REPLAY_SCRAPE_URL || "http://127.0.0.1:3000/api/replay-scrape";
const dryRun = !process.argv.includes("--apply");
const quiet = process.argv.includes("--quiet");

const HAX_FIELDS = [
  "favorableCrits",
  "favorableMisses",
  "favorableFlinches",
  "favorableParalysis",
  "favorableFreezes",
  "favorableBurns",
  "favorableSleep",
  "favorableConfusions",
  "favorableConfusionSelfHits",
];

function nameKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function generatedReplayKeys(value) {
  const key = nameKey(value);
  if (!key) return [];

  const keys = new Set([key]);
  const megaBase = key.replace(/mega(?:x|y|z)?$/, "");
  if (megaBase !== key) keys.add(megaBase);
  const battleStateBase = key.replace(/(?:incarnate|average|standard|hero|disguised)$/, "");
  if (battleStateBase !== key) keys.add(battleStateBase);
  if (key.startsWith("gourgeist")) keys.add("gourgeist");
  if (key === "floettemega") keys.add("floetteeternal");
  if (key === "urshifusinglestrike") keys.add("urshifu");
  return [...keys];
}

const acceptedNamesByPokemonId = new Map();

function addAcceptedName(pokemonId, value) {
  const names = acceptedNamesByPokemonId.get(pokemonId) || [];
  names.push(value);
  acceptedNamesByPokemonId.set(pokemonId, names);
}

function rowKeys(row) {
  return [
    row.pokemon_name,
    row.pokemon_display_name,
    ...(acceptedNamesByPokemonId.get(row.pokemon_id) || []),
  ].flatMap(generatedReplayKeys);
}

function findTeamMatch(team, row) {
  const keys = new Set(rowKeys(row));
  return team.find((pokemon) =>
    generatedReplayKeys(pokemon.name).some((key) => keys.has(key))
  ) || null;
}

function teamScore(team, rows) {
  return rows.reduce((score, row) => score + (findTeamMatch(team, row) ? 1 : 0), 0);
}

function usesExpandedHaxRules(match) {
  return match.id === 3586 ||
    match.season_number > 11 ||
    (match.season_number === 11 && match.week >= 6);
}

async function scrapeReplay(match) {
  const response = await fetch(SCRAPE_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      replayUrl: match.replay_url,
      expandedHaxRules: usesExpandedHaxRules(match),
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || `Replay scrape failed with ${response.status}`);
  }
  return payload;
}

const db = new Database(DATABASE_PATH);
db.pragma("busy_timeout = 30000");

const requiredColumns = [
  "favorable_crits",
  "favorable_misses",
  "favorable_flinches",
  "favorable_paralysis",
  "favorable_freezes",
  "favorable_burns",
  "favorable_sleep",
  "favorable_confusions",
  "favorable_confusion_self_hits",
  "favorable_events",
];
const existingColumns = new Set(
  db.prepare("SELECT name FROM pragma_table_info('match_pokemon')").all().map((row) => row.name)
);
const missingColumns = requiredColumns.filter((column) => !existingColumns.has(column));
if (missingColumns.length > 0) {
  db.close();
  throw new Error(`match_pokemon is missing required columns: ${missingColumns.join(", ")}`);
}

const tableExists = db.prepare(
  "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
);
if (tableExists.get("pokemon_name_aliases")) {
  for (const row of db.prepare("SELECT pokemon_id, alias FROM pokemon_name_aliases").all()) {
    addAcceptedName(row.pokemon_id, row.alias);
  }
}
if (tableExists.get("pokemon_name_collapses")) {
  for (const row of db.prepare(
    "SELECT target_pokemon_id AS pokemon_id, source_name AS alias FROM pokemon_name_collapses"
  ).all()) {
    addAcceptedName(row.pokemon_id, row.alias);
  }
}

const matches = db.prepare(`
  SELECT
    m.id,
    m.week,
    m.replay_url,
    m.coach1_season_id,
    m.coach2_season_id,
    s.season_number
  FROM matches m
  JOIN seasons s ON s.id = m.season_id
  WHERE m.winner_id IS NOT NULL
    AND m.is_forfeit = 0
    AND m.replay_url IS NOT NULL
    AND TRIM(m.replay_url) != ''
    AND s.season_number >= ?
  ORDER BY s.season_number, m.id
`).all(MIN_SEASON);

const rowsByMatch = db.prepare(`
  SELECT
    mp.id,
    mp.season_coach_id,
    mp.pokemon_id,
    mp.favorable_events,
    p.name AS pokemon_name,
    p.display_name AS pokemon_display_name
  FROM match_pokemon mp
  JOIN pokemon p ON p.id = mp.pokemon_id
  WHERE mp.match_id = ?
`);

const updateHax = db.prepare(`
  UPDATE match_pokemon SET
    favorable_crits = ?,
    favorable_misses = ?,
    favorable_flinches = ?,
    favorable_paralysis = ?,
    favorable_freezes = ?,
    favorable_burns = ?,
    favorable_sleep = ?,
    favorable_confusions = ?,
    favorable_confusion_self_hits = ?,
    favorable_events = ?
  WHERE id = ?
`);

let processed = 0;
let matchesChanged = 0;
let rowsChanged = 0;
let fakeOutFlinchesRemoved = 0;
let failed = 0;
let skippedAmbiguous = 0;
let unmatched = 0;

for (const match of matches) {
  try {
    const replay = await scrapeReplay(match);
    const p1Team = Array.isArray(replay.p1Team) ? replay.p1Team : [];
    const p2Team = Array.isArray(replay.p2Team) ? replay.p2Team : [];
    const matchRows = rowsByMatch.all(match.id);
    const coach1Rows = matchRows.filter((row) => row.season_coach_id === match.coach1_season_id);
    const coach2Rows = matchRows.filter((row) => row.season_coach_id === match.coach2_season_id);
    const p1IsCoach1Score = teamScore(p1Team, coach1Rows) + teamScore(p2Team, coach2Rows);
    const p1IsCoach2Score = teamScore(p1Team, coach2Rows) + teamScore(p2Team, coach1Rows);

    if (p1IsCoach1Score === p1IsCoach2Score) {
      skippedAmbiguous++;
      console.warn(`SKIP ambiguous S${match.season_number} match ${match.id}`);
      continue;
    }

    const p1IsCoach1 = p1IsCoach1Score > p1IsCoach2Score;
    const teamBySeasonCoach = new Map([
      [match.coach1_season_id, p1IsCoach1 ? p1Team : p2Team],
      [match.coach2_season_id, p1IsCoach1 ? p2Team : p1Team],
    ]);
    const updates = [];

    for (const row of matchRows) {
      const replayPokemon = findTeamMatch(teamBySeasonCoach.get(row.season_coach_id) || [], row);
      if (!replayPokemon) {
        unmatched++;
        console.warn(
          `UNMATCHED S${match.season_number} match ${match.id}: ${row.pokemon_display_name || row.pokemon_name}`
        );
        continue;
      }

      const oldEvents = row.favorable_events ? JSON.parse(row.favorable_events) : null;
      const newEvents = usesExpandedHaxRules(match)
        ? (Array.isArray(replayPokemon.favorableEvents) ? replayPokemon.favorableEvents : [])
        : oldEvents;
      const oldFlinches = Array.isArray(oldEvents)
        ? oldEvents.filter((event) => event?.type === "flinch").length
        : null;
      const newFlinches = Number(replayPokemon.favorableFlinches ?? 0);
      if (oldFlinches !== null && oldFlinches > newFlinches) {
        fakeOutFlinchesRemoved += oldFlinches - newFlinches;
      }

      updates.push({
        rowId: row.id,
        values: HAX_FIELDS.map((field) => Number(replayPokemon[field] ?? 0)),
        events: newEvents,
      });
    }

    if (!dryRun && updates.length > 0) {
      db.transaction((pendingUpdates) => {
        for (const update of pendingUpdates) {
          updateHax.run(...update.values, JSON.stringify(update.events), update.rowId);
        }
      })(updates);
    }

    processed++;
    if (updates.length > 0) matchesChanged++;
    rowsChanged += updates.length;
    if (!quiet) {
      console.log(
        `${dryRun ? "PLAN" : "DONE"} S${match.season_number} match ${match.id}: ${updates.length} Pokémon rows`
      );
    }
  } catch (error) {
    failed++;
    console.error(
      `FAIL S${match.season_number} match ${match.id}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

db.close();
console.log(
  [
    `${dryRun ? "Planned" : "Completed"} ${processed}/${matches.length} Season 11+ replay matches`,
    `${matchesChanged} matches and ${rowsChanged} Pokémon rows mapped`,
    `${fakeOutFlinchesRemoved} stored flinch events removed`,
    `${skippedAmbiguous} ambiguous matches skipped`,
    `${unmatched} Pokémon rows unmatched`,
    `${failed} replay failures`,
  ].join("; ")
);
if (failed > 0 || skippedAmbiguous > 0 || unmatched > 0) process.exitCode = 1;
