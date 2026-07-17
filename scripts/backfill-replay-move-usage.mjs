import Database from "better-sqlite3";

const MIN_SEASON = Number(process.env.MOVE_USAGE_MIN_SEASON || "9");
const DATABASE_PATH = process.env.DATABASE_PATH || "pbo.db";
const SCRAPE_URL = process.env.REPLAY_SCRAPE_URL || "http://127.0.0.1:3000/api/replay-scrape";
const dryRun = process.argv.includes("--dry-run");

function nameKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function rowKeys(row) {
  return [row.pokemon_name, row.pokemon_display_name].map(nameKey).filter(Boolean);
}

function findTeamMatch(team, row) {
  const keys = new Set(rowKeys(row));
  return team.find((pokemon) => keys.has(nameKey(pokemon.name))) || null;
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

const matches = db.prepare(`
  SELECT m.id, m.replay_url, m.coach1_season_id, m.coach2_season_id
  FROM matches m
  JOIN seasons s ON s.id = m.season_id
  WHERE m.winner_id IS NOT NULL
    AND m.is_forfeit = 0
    AND m.replay_url IS NOT NULL
    AND m.replay_url != ''
    AND s.season_number >= ?
  ORDER BY m.id
`).all(MIN_SEASON);

const rowsByMatch = db.prepare(`
  SELECT mp.id, mp.season_coach_id, p.name AS pokemon_name, p.display_name AS pokemon_display_name
  FROM match_pokemon mp
  JOIN pokemon p ON p.id = mp.pokemon_id
  WHERE mp.match_id = ?
`);

const updateMoveUsage = db.prepare("UPDATE match_pokemon SET moves_used = ? WHERE id = ?");
let processed = 0;
let updated = 0;
let failed = 0;

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
      // Keep every selected Pokemon in the aggregate. An empty object means the
      // replay did not record a move for that row (for example, it never entered
      // the field or the replay used a different form), rather than omitting the
      // Pokemon from the season/division totals entirely.
      updateRows.push({ rowId: row.id, movesUsed: replayPokemon?.movesUsed || {} });
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
    console.log(`${dryRun ? "PLAN" : "DONE"} match ${match.id}: ${updateRows.length} Pokemon rows`);
  } catch (error) {
    failed++;
    console.error(`FAIL match ${match.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

db.close();
console.log(`Processed ${processed}/${matches.length} matches; updated ${updated} rows; failed ${failed}.`);
if (failed > 0) process.exitCode = 1;
