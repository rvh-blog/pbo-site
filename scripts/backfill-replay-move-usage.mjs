import { openMaintenanceDb, assertProductionWriteAllowed } from "./maintenance-db.mjs";

const MIN_SEASON = Number(process.env.MOVE_USAGE_MIN_SEASON || "5");
const TARGET_SEASON = process.env.MOVE_USAGE_SEASON
  ? Number(process.env.MOVE_USAGE_SEASON)
  : null;
const DATABASE_PATH = process.env.DATABASE_PATH || "pbo.db";
const SCRAPE_URL = process.env.REPLAY_SCRAPE_URL || "http://127.0.0.1:3000/api/replay-scrape";
const dryRun = !process.argv.includes("--apply");
const quiet = process.argv.includes("--quiet");
const includeAlreadyTracked = process.argv.includes("--all");
const reportChanges = process.argv.includes("--report-changes");
const onlyZoroarkReplays = process.argv.includes("--zoroark-only");

if (!dryRun) {
  assertProductionWriteAllowed(DATABASE_PATH, "MOVE_USAGE");
}

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
    /(?:incarnate|average|standard|hero|disguised|busted)$/,
    ""
  );
  if (battleStateBase !== key) keys.add(battleStateBase);
  if (key.startsWith("gourgeist")) keys.add("gourgeist");
  if (key === "floettemega") keys.add("floetteeternal");
  if (key === "urshifusinglestrike" || key === "urshifurapidstrike") keys.add("urshifu");
  return [...keys];
}

function normalizedMoveMap(value) {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  return Object.fromEntries(
    Object.entries(parsed)
      .map(([name, uses]) => [name.trim().replace(/\s+/g, " "), Number(uses)])
      .filter(([name, uses]) => name && Number.isFinite(uses) && uses > 0)
      .sort(([nameA], [nameB]) => nameA.localeCompare(nameB))
  );
}

function moveMapsEqual(current, next) {
  return JSON.stringify(normalizedMoveMap(current)) === JSON.stringify(normalizedMoveMap(next));
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

const db = openMaintenanceDb(DATABASE_PATH);

if (await db.get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1", ["pokemon_name_aliases"])) {
  for (const row of await db.all("SELECT pokemon_id, alias FROM pokemon_name_aliases")) {
    addAcceptedName(row.pokemon_id, row.alias);
  }
}
if (await db.get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1", ["pokemon_name_collapses"])) {
  for (const row of await db.all(
    "SELECT target_pokemon_id AS pokemon_id, source_name AS alias FROM pokemon_name_collapses"
  )) {
    addAcceptedName(row.pokemon_id, row.alias);
  }
}

const seasonFilter = TARGET_SEASON === null
  ? "s.season_number >= ?"
  : "s.season_number = ?";
const seasonValue = TARGET_SEASON ?? MIN_SEASON;
const matches = await db.all(`
  SELECT m.id, m.replay_url, m.coach1_season_id, m.coach2_season_id
  FROM matches m
  JOIN seasons s ON s.id = m.season_id
  WHERE m.winner_id IS NOT NULL
    AND m.is_forfeit = 0
    AND m.replay_url IS NOT NULL
    AND m.replay_url != ''
    AND ${seasonFilter}
    AND (${includeAlreadyTracked ? "1 = 1" : `(
      NOT EXISTS (
        SELECT 1
        FROM match_pokemon existing
        WHERE existing.match_id = m.id
      )
      OR EXISTS (
        SELECT 1
        FROM match_pokemon pending
        WHERE pending.match_id = m.id
          AND pending.moves_used IS NULL
      )
    )`})
  ORDER BY m.id
`, [seasonValue]);

const rowsByMatch = `
  SELECT mp.id, mp.season_coach_id, mp.pokemon_id, mp.moves_used,
    p.name AS pokemon_name, p.display_name AS pokemon_display_name
  FROM match_pokemon mp
  JOIN pokemon p ON p.id = mp.pokemon_id
  WHERE mp.match_id = ?
`;

const flagMatchReview = `
  UPDATE matches
  SET needs_review = 1,
      review_notes = CASE
        WHEN review_notes IS NULL OR TRIM(review_notes) = '' THEN ?
        WHEN instr(review_notes, ?) > 0 THEN review_notes
        ELSE review_notes || '; ' || ?
      END
  WHERE id = ?
`;
let processed = 0;
let updated = 0;
let unchanged = 0;
let failed = 0;
let unmatched = 0;

for (const match of matches) {
  try {
    const matchRows = await db.all(rowsByMatch, [match.id]);
    if (matchRows.length === 0) {
      const note = "Move usage backfill: completed replay has no match Pokemon rows";
      if (!dryRun) await db.execute(flagMatchReview, [note, note, note, match.id]);
      console.warn(`REVIEW match ${match.id}: ${note}`);
      processed++;
      continue;
    }

    const replay = await scrapeReplay(match.replay_url);
    if (onlyZoroarkReplays && !replay.zoroarkInvolved) continue;
    const p1Team = Array.isArray(replay.p1Team) ? replay.p1Team : [];
    const p2Team = Array.isArray(replay.p2Team) ? replay.p2Team : [];
    const coach1Rows = matchRows.filter((row) => row.season_coach_id === match.coach1_season_id);
    const coach2Rows = matchRows.filter((row) => row.season_coach_id === match.coach2_season_id);
    const p1IsCoach1 = teamScore(p1Team, coach1Rows) + teamScore(p2Team, coach2Rows)
      >= teamScore(p1Team, coach2Rows) + teamScore(p2Team, coach1Rows);
    const teamBySeasonCoach = new Map([
      [match.coach1_season_id, p1IsCoach1 ? p1Team : p2Team],
      [match.coach2_season_id, p1IsCoach1 ? p2Team : p1Team],
    ]);

    const updateRows = [];
    const unmatchedNames = [];
    for (const row of matchRows) {
      const replayPokemon = findTeamMatch(teamBySeasonCoach.get(row.season_coach_id) || [], row);
      if (!replayPokemon) {
        unmatched++;
        unmatchedNames.push(row.pokemon_display_name || row.pokemon_name);
        console.warn(
          `UNMATCHED match ${match.id}: ${row.pokemon_display_name || row.pokemon_name}`
        );
        continue;
      }
      // An empty object means the Pokemon was selected but never recorded a move.
      const movesUsed = normalizedMoveMap(replayPokemon.movesUsed || {});
      // Preserve NULL as a distinct state from an explicitly parsed Pokemon
      // that never issued a move. This lets the backfill mark every matched
      // roster row as processed, including unused bench Pokemon.
      if (row.moves_used !== null && moveMapsEqual(row.moves_used, movesUsed)) {
        unchanged++;
        continue;
      }
      updateRows.push({
        rowId: row.id,
        pokemonName: row.pokemon_display_name || row.pokemon_name,
        previousMovesUsed: normalizedMoveMap(row.moves_used),
        movesUsed,
      });
    }

    if (!dryRun) {
      const statements = updateRows.map((update) => ({
        sql: "UPDATE match_pokemon SET moves_used = ? WHERE id = ?",
        args: [JSON.stringify(update.movesUsed), update.rowId],
      }));
      if (unmatchedNames.length > 0) {
        const note = `Move usage backfill: ${unmatchedNames.length} Pokemon row(s) could not be matched to the replay team (${unmatchedNames.join(", ")})`;
        statements.push({ sql: flagMatchReview, args: [note, note, note, match.id] });
      }
      await db.batch(statements);
    }

    processed++;
    updated += updateRows.length;
    if (reportChanges) {
      for (const update of updateRows) {
        console.log(
          `CHANGE match ${match.id} row ${update.rowId} ${update.pokemonName}: ${JSON.stringify(update.previousMovesUsed)} -> ${JSON.stringify(update.movesUsed)}`
        );
      }
    }
    if (!quiet) {
      console.log(`${dryRun ? "PLAN" : "DONE"} match ${match.id}: ${updateRows.length} changed Pokemon rows`);
    }
  } catch (error) {
    failed++;
    console.error(`FAIL match ${match.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

db.client.close();
console.log(
  `Processed ${processed}/${matches.length} matches; ${dryRun ? "would update" : "updated"} ${updated} rows; unchanged ${unchanged}; unmatched ${unmatched}; failed ${failed}.`
);
if (failed > 0 || unmatched > 0) process.exitCode = 1;
