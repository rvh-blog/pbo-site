import { openMaintenanceDb, assertProductionWriteAllowed } from "./maintenance-db.mjs";
import { getMegaBaseSpecies, getMegaStoneName, isMegaPokemonName } from "../src/lib/mega-stones.ts";
import { inferMegaItemForRosterPokemon } from "../src/lib/mega-item-inference.ts";

// Dry-run by default. Use --write only against a reviewed local DB copy.
const databasePath = process.argv.find((argument) => argument.startsWith("--db="))?.slice(5)
  || process.env.DATABASE_PATH
  || "pbo.db";
const requestedSeason = process.argv.find((argument) => argument.startsWith("--season="))?.slice(9);
const dryRun = !process.argv.includes("--write");
const verbose = process.argv.includes("--verbose");

if (!dryRun) assertProductionWriteAllowed(databasePath);

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

function parsePokemonIds(value) {
  return parseJsonArray(value, "transaction Pokemon list").map(Number).filter(Number.isFinite);
}

function isAssumedReveal(reveal) {
  return /^assumed\b/i.test(String(reveal?.source || "").trim());
}

function isKnownStonelessMega(species) {
  const baseSpecies = getMegaBaseSpecies(species);
  return baseSpecies?.toLowerCase().replace(/[^a-z0-9]/g, "") === "rayquaza";
}

function canonicalizeAssumedMegaReveals(reveals, expectedStone, canCorrect) {
  if (!canCorrect) return { reveals, changed: false };

  let changed = false;
  const normalized = [];
  for (const reveal of reveals) {
    if (!isAssumedReveal(reveal)) {
      normalized.push(reveal);
      continue;
    }

    if (!expectedStone) {
      changed = true;
      continue;
    }

    if (reveal.item !== expectedStone) changed = true;
    normalized.push({ ...reveal, item: expectedStone });
  }
  return { reveals: normalized, changed };
}

function megaReviewKey(line) {
  const match = String(line || "").match(/^Mega (?:item|Stone) check \(team (\d+), [^)]* (\d+)\):/i);
  return match ? `${match[1]}:${match[2]}` : null;
}

function buildTeamTransactions(rows) {
  const byTeam = new Map();
  const add = (teamId, transaction) => {
    if (!teamId) return;
    const list = byTeam.get(teamId) || [];
    list.push(transaction);
    byTeam.set(teamId, list);
  };
  for (const row of rows) {
    const pokemonIn = parsePokemonIds(row.pokemon_in);
    const pokemonOut = parsePokemonIds(row.pokemon_out);
    add(row.season_coach_id, { ...row, pokemonIn, pokemonOut });
    if (row.type === "P2P_TRADE" && row.trading_partner_season_coach_id) {
      add(row.trading_partner_season_coach_id, {
        ...row,
        season_coach_id: row.trading_partner_season_coach_id,
        pokemonIn: pokemonOut,
        pokemonOut: pokemonIn,
      });
    }
  }
  return byTeam;
}

function rosterAtMatchWeek(currentRosterIds, transactions, matchWeek) {
  const roster = new Set(currentRosterIds);
  for (const transaction of transactions
    .filter((candidate) => candidate.week > matchWeek)
    .sort((a, b) => b.week - a.week || b.id - a.id)) {
    if (["FA_PICKUP", "FA_SWAP", "P2P_TRADE"].includes(transaction.type)) {
      for (const id of transaction.pokemonIn) roster.delete(id);
    }
    if (["FA_DROP", "FA_SWAP", "P2P_TRADE"].includes(transaction.type)) {
      for (const id of transaction.pokemonOut) roster.add(id);
    }
  }
  return roster;
}

const db = openMaintenanceDb(databasePath);
const seasons = requestedSeason
  ? await db.all("SELECT id, season_number FROM seasons WHERE season_number = ?", [Number(requestedSeason)])
  : await db.all("SELECT id, season_number FROM seasons ORDER BY season_number");
if (seasons.length === 0) {
  db.client.close();
  throw new Error(`No matching season found for ${requestedSeason || "all seasons"}`);
}

const itemUpdates = [];
const reviewUpdates = new Map();
let scanned = 0;
let rosterExcluded = 0;

for (const season of seasons) {
  const matches = await db.all(`
    SELECT id, week, coach1_season_id, coach2_season_id
    FROM matches WHERE season_id = ? AND is_forfeit = 0
  `, [season.id]);
  const matchById = new Map(matches.map((match) => [match.id, match]));
  const rosterIdsByTeam = new Map();
  for (const row of await db.all(`
    SELECT r.season_coach_id, r.pokemon_id FROM rosters r
    JOIN season_coaches sc ON sc.id = r.season_coach_id
    JOIN divisions d ON d.id = sc.division_id
    WHERE d.season_id = ?
  `, [season.id])) {
    const ids = rosterIdsByTeam.get(row.season_coach_id) || [];
    ids.push(row.pokemon_id);
    rosterIdsByTeam.set(row.season_coach_id, ids);
  }
  const transactionsByTeam = buildTeamTransactions(await db.all(`
    SELECT id, type, week, season_coach_id, trading_partner_season_coach_id,
           pokemon_in, pokemon_out FROM transactions WHERE season_id = ?
  `, [season.id]));

  const rows = await db.all(`
    SELECT mp.id, mp.match_id, mp.season_coach_id, mp.pokemon_id, mp.revealed_items,
           p.name AS pokemon_name, p.display_name AS pokemon_display_name, sc.team_name,
           m.week, m.needs_review, m.review_notes
    FROM match_pokemon mp
    JOIN matches m ON m.id = mp.match_id
    JOIN pokemon p ON p.id = mp.pokemon_id
    JOIN season_coaches sc ON sc.id = mp.season_coach_id
    WHERE m.season_id = ? AND m.is_forfeit = 0
      AND mp.season_coach_id IN (m.coach1_season_id, m.coach2_season_id)
    ORDER BY m.week, m.id, mp.id
  `, [season.id]);

  for (const row of rows) {
    const species = row.pokemon_display_name || row.pokemon_name;
    const storedItems = parseJsonArray(row.revealed_items, `match_pokemon ${row.id}`);
    const parserMegaEvidence = storedItems.some((item) => /^assumed\b/i.test(item?.source || "") && /mega/i.test(item?.source || ""));
    const isMegaForm = isMegaPokemonName(species);
    const expectedStone = isMegaForm ? getMegaStoneName(species) : null;
    const knownStonelessMega = isMegaForm && isKnownStonelessMega(species);
    if ((!isMegaForm && !parserMegaEvidence) || (isMegaForm && !expectedStone && !knownStonelessMega && !parserMegaEvidence)) continue;
    scanned++;
    const match = matchById.get(row.match_id);
    if (!match || match.week == null) continue;
    const roster = rosterAtMatchWeek(
      rosterIdsByTeam.get(row.season_coach_id) || [],
      transactionsByTeam.get(row.season_coach_id) || [],
      match.week,
    );
    if (!roster.has(row.pokemon_id)) {
      rosterExcluded++;
      continue;
    }
    const normalized = canonicalizeAssumedMegaReveals(
      storedItems,
      expectedStone,
      isMegaForm && (Boolean(expectedStone) || knownStonelessMega),
    );
    const inference = inferMegaItemForRosterPokemon({
      pokemonId: row.pokemon_id,
      name: row.pokemon_name,
      displayName: row.pokemon_display_name,
    }, normalized.reveals);
    if (normalized.changed || inference.assumed) {
      itemUpdates.push({ ...row, items: inference.revealedItems, stone: inference.expectedStone, seasonNumber: season.season_number });
      if (verbose) console.log(`${normalized.changed ? "REPAIR" : "PLAN"} S${season.season_number} match ${row.match_id}: ${row.team_name} ${species} -> ${inference.expectedStone || "no stone"}`);
    }
    const review = reviewUpdates.get(row.match_id) || {
      existingNeedsReview: Boolean(row.needs_review),
      existingNotes: row.review_notes || "",
      clearKeys: new Set(),
      conflicts: new Set(),
      staleNotesRemoved: false,
    };
    review.clearKeys.add(`${row.season_coach_id}:${row.pokemon_id}`);
    if (inference.conflict) {
      review.conflicts.add(`Mega item check (team ${row.season_coach_id}, Pokémon ${row.pokemon_id}): ${inference.conflict}`);
      if (verbose) console.log(`REVIEW S${season.season_number} match ${row.match_id}: ${inference.conflict}`);
    }
    reviewUpdates.set(row.match_id, review);
  }
}

const statements = dryRun ? [] : itemUpdates.map((row) => ({
  sql: "UPDATE match_pokemon SET revealed_items = ? WHERE id = ?",
  args: [JSON.stringify(row.items), row.id],
}));
for (const [matchId, review] of reviewUpdates) {
  const existingNotes = String(review.existingNotes || "")
    .split(/\r?\n/)
    .map((note) => note.trim())
    .filter(Boolean);
  const retainedNotes = existingNotes.filter((note) => {
    const key = megaReviewKey(note);
    return !key || !review.clearKeys.has(key);
  });
  review.staleNotesRemoved = retainedNotes.length !== existingNotes.length;
  const mergedNotes = [...new Set([...retainedNotes, ...review.conflicts])];
  const hasRetainedNotes = retainedNotes.length > 0;
  const hasConflicts = review.conflicts.size > 0;
  const nextNeedsReview = hasConflicts || hasRetainedNotes || (!review.existingNotes && review.existingNeedsReview);
  const originalNotes = String(review.existingNotes || "").trim();
  if (!dryRun && (nextNeedsReview !== review.existingNeedsReview || mergedNotes.join("\n") !== originalNotes)) {
    statements.push({
      sql: "UPDATE matches SET needs_review = ?, review_notes = ? WHERE id = ?",
      args: [nextNeedsReview ? 1 : 0, mergedNotes.length > 0 ? mergedNotes.join("\n") : null, matchId],
    });
  }
}
if (!dryRun) {
  await db.batch(statements);
}

db.client.close();
console.log(`${dryRun ? "Planned" : "Backfilled"} ${itemUpdates.length} Mega Stone item rows across ${seasons.length} season(s)`);
console.log(`Scanned ${scanned} roster-linked Mega appearances; excluded ${rosterExcluded} Mega rows without historical roster confirmation`);
const reviewConflictCount = [...reviewUpdates.values()].filter((review) => review.conflicts.size > 0).length;
const staleReviewCount = [...reviewUpdates.values()].filter((review) => review.staleNotesRemoved).length;
console.log(`${dryRun ? "Planned" : "Updated"} ${staleReviewCount} match review record(s) after removing stale Mega item notes`);
console.log(`${dryRun ? "Would flag" : "Flagged"} ${reviewConflictCount} match review record(s) for remaining explicit item conflicts`);
