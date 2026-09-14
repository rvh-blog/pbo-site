import { openMaintenanceDb, assertProductionWriteAllowed } from "./maintenance-db.mjs";
import { getOgerponMaskName } from "../src/lib/ogerpon-masks.ts";
import { inferRequiredItemForRosterPokemon } from "../src/lib/mega-item-inference.ts";

// Dry-run by default. Use --write only against a reviewed local DB copy.
const databasePath = process.argv.find((argument) => argument.startsWith("--db="))?.slice(5)
  || process.env.DATABASE_PATH
  || "pbo.db";
const requestedSeason = process.argv.find((argument) => argument.startsWith("--season="))?.slice(9);
const dryRun = !process.argv.includes("--write");
const verbose = process.argv.includes("--verbose");

if (!dryRun) assertProductionWriteAllowed(databasePath, "OGERPON_MASKS");

function parseJsonArray(value, label) {
  if (value == null || value === "") return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) throw new Error("expected an array");
    return parsed;
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const db = openMaintenanceDb(databasePath);
const seasons = requestedSeason
  ? await db.all("SELECT id, season_number FROM seasons WHERE season_number = ? AND season_number BETWEEN 5 AND 11", [Number(requestedSeason)])
  : await db.all("SELECT id, season_number FROM seasons WHERE season_number BETWEEN 5 AND 11 ORDER BY season_number");
if (seasons.length === 0) {
  db.client.close();
  throw new Error(`No matching Season 5–11 season found for ${requestedSeason || "the requested range"}`);
}

const itemUpdates = [];
const reviewUpdates = new Map();
let scanned = 0;
let alreadyPresent = 0;

for (const season of seasons) {
  const rows = await db.all(`
    SELECT mp.id, mp.match_id, mp.season_coach_id, mp.pokemon_id, mp.revealed_items,
           p.name AS pokemon_name, p.display_name AS pokemon_display_name,
           sc.team_name, m.week
    FROM match_pokemon mp
    JOIN matches m ON m.id = mp.match_id
    JOIN pokemon p ON p.id = mp.pokemon_id
    JOIN season_coaches sc ON sc.id = mp.season_coach_id
    WHERE m.season_id = ?
      AND mp.season_coach_id IN (m.coach1_season_id, m.coach2_season_id)
    ORDER BY m.week, m.id, mp.id
  `, [season.id]);

  for (const row of rows) {
    const species = row.pokemon_display_name || row.pokemon_name;
    const expectedMask = getOgerponMaskName(species);
    if (!expectedMask) continue;
    scanned++;

    const storedItems = parseJsonArray(row.revealed_items, `match_pokemon ${row.id} revealed_items`);
    const inference = inferRequiredItemForRosterPokemon({
      pokemonId: row.pokemon_id,
      name: row.pokemon_name,
      displayName: row.pokemon_display_name,
    }, storedItems);

    if (inference.conflict) {
      const note = `Ogerpon mask check (team ${row.season_coach_id}, Pokémon ${row.pokemon_id}): ${inference.conflict}`;
      const notes = reviewUpdates.get(row.match_id) || new Set();
      notes.add(note);
      reviewUpdates.set(row.match_id, notes);
      if (verbose) console.log(`REVIEW S${season.season_number} match ${row.match_id}: ${note}`);
      continue;
    }

    if (!inference.assumed) {
      alreadyPresent++;
      continue;
    }

    itemUpdates.push({
      id: row.id,
      matchId: row.match_id,
      teamName: row.team_name,
      species,
      seasonNumber: season.season_number,
      items: inference.revealedItems,
      expectedMask,
    });
    if (verbose) {
      console.log(`PLAN S${season.season_number} match ${row.match_id}: ${row.team_name} ${species} -> ${expectedMask}`);
    }
  }
}

if (!dryRun) {
  const statements = itemUpdates.map((row) => ({
    sql: "UPDATE match_pokemon SET revealed_items = ? WHERE id = ?",
    args: [JSON.stringify(row.items), row.id],
  }));
  for (const [matchId, notes] of reviewUpdates) {
    const existing = (await db.get("SELECT review_notes FROM matches WHERE id = ?", [matchId]))?.review_notes || "";
    const merged = [...new Set([existing, ...notes].filter(Boolean))].join("\n");
    statements.push({
      sql: "UPDATE matches SET needs_review = 1, review_notes = ? WHERE id = ?",
      args: [merged || null, matchId],
    });
  }
  await db.batch(statements);
}

db.client.close();
console.log(`${dryRun ? "Planned" : "Backfilled"} ${itemUpdates.length} Ogerpon mask item rows across ${seasons.length} season(s)`);
console.log(`Scanned ${scanned} masked Ogerpon appearances; ${alreadyPresent} already had the matching mask`);
console.log(`${dryRun ? "Planned" : "Flagged"} ${reviewUpdates.size} match review record(s) for conflicting item evidence`);

