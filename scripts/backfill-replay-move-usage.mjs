import Database from "better-sqlite3";

const MIN_SEASON = Number(process.env.MOVE_USAGE_MIN_SEASON || "9");
const TARGET_SEASON = process.env.MOVE_USAGE_SEASON
  ? Number(process.env.MOVE_USAGE_SEASON)
  : null;
const DATABASE_PATH = process.env.DATABASE_PATH || "pbo.db";
const SCRAPE_URL = process.env.REPLAY_SCRAPE_URL || "http://127.0.0.1:3000/api/replay-scrape";
const dryRun = !process.argv.includes("--apply");
const quiet = process.argv.includes("--quiet");

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
  const battleStateBase = key.replace(
    /(?:incarnate|average|standard|hero|disguised)$/,
    ""
  );
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

async function scrapeReplay(replayUrl) {
  const response = await fetch(SCRAPE_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ replayUrl }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || `Replay scrape failed with ${response.status}`);
  }
  return payload;
}

const db = new Database(DATABASE_PATH);
db.pragma("busy_timeout = 30000");

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

const seasonFilter = TARGET_SEASON === null
  ? "s.season_number >= ?"
  : "s.season_number = ?";
const seasonValue = TARGET_SEASON ?? MIN_SEASON;
const matches = db.prepare(`
  SELECT m.id, m.replay_url, m.coach1_season_id, m.coach2_season_id
  FROM matches m
  JOIN seasons s ON s.id = m.season_id
  WHERE m.winner_id IS NOT NULL
    AND m.is_forfeit = 0
    AND m.replay_url IS NOT NULL
    AND m.replay_url != ''
    AND ${seasonFilter}
    AND EXISTS (
      SELECT 1
      FROM match_pokemon pending
      WHERE pending.match_id = m.id
        AND pending.moves_used IS NULL
    )
  ORDER BY m.id
`).all(seasonValue);

const rowsByMatch = db.prepare(`
  SELECT mp.id, mp.season_coach_id, mp.pokemon_id,
    p.name AS pokemon_name, p.display_name AS pokemon_display_name
  FROM match_pokemon mp
  JOIN pokemon p ON p.id = mp.pokemon_id
  WHERE mp.match_id = ?
`);

const updateMoveUsage = db.prepare("UPDATE match_pokemon SET moves_used = ? WHERE id = ?");
let processed = 0;
let updated = 0;
let failed = 0;
let unmatched = 0;

for (const match of matches) {
  try {
    const replay = await scrapeReplay(match.replay_url);
    const p1Team = Array.isArray(replay.p1Team) ? replay.p1Team : [];
    const p2Team = Array.isArray(replay.p2Team) ? replay.p2Team : [];
    const matchRows = rowsByMatch.all(match.id);
    const coach1Rows = matchRows.filter((row) => row.season_coach_id === match.coach1_season_id);
    const coach2Rows = matchRows.filter((row) => row.season_coach_id === match.coach2_season_id);
    const p1IsCoach1 = teamScore(p1Team, coach1Rows) + teamScore(p2Team, coach2Rows)
      >= teamScore(p1Team, coach2Rows) + teamScore(p2Team, coach1Rows);
    const teamBySeasonCoach = new Map([
      [match.coach1_season_id, p1IsCoach1 ? p1Team : p2Team],
      [match.coach2_season_id, p1IsCoach1 ? p2Team : p1Team],
    ]);

    const updateRows = [];
    for (const row of matchRows) {
      const replayPokemon = findTeamMatch(teamBySeasonCoach.get(row.season_coach_id) || [], row);
      if (!replayPokemon) {
        unmatched++;
        console.warn(
          `UNMATCHED match ${match.id}: ${row.pokemon_display_name || row.pokemon_name}`
        );
        continue;
      }
      // An empty object means the Pokemon was selected but never recorded a move.
      updateRows.push({ rowId: row.id, movesUsed: replayPokemon.movesUsed || {} });
    }

    if (!dryRun) {
      const transaction = db.transaction((updates) => {
        for (const update of updates) {
          updateMoveUsage.run(JSON.stringify(update.movesUsed), update.rowId);
        }
      });
      transaction(updateRows);
    }

    processed++;
    updated += updateRows.length;
    if (!quiet) {
      console.log(`${dryRun ? "PLAN" : "DONE"} match ${match.id}: ${updateRows.length} Pokemon rows`);
    }
  } catch (error) {
    failed++;
    console.error(`FAIL match ${match.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

db.close();
console.log(
  `Processed ${processed}/${matches.length} matches; updated ${updated} rows; unmatched ${unmatched}; failed ${failed}.`
);
if (failed > 0 || unmatched > 0) process.exitCode = 1;
