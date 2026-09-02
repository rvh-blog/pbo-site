import Database from "better-sqlite3";
import { getMegaStoneName } from "../src/lib/mega-stones.ts";

// This backfill is deliberately fixed to Season 11. It is dry-run by default;
// pass --write only when operating on a verified local database copy.
const SEASON_NUMBER = 11;
const databasePath = process.argv.find((argument) => argument.startsWith("--db="))?.slice(5)
  || process.env.DATABASE_PATH
  || "pbo.db";
const dryRun = !process.argv.includes("--write");
const verbose = process.argv.includes("--verbose");

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

function addTransactionForTeam(transactionsByTeam, teamId, transaction) {
  if (!teamId) return;
  const transactions = transactionsByTeam.get(teamId) || [];
  transactions.push(transaction);
  transactionsByTeam.set(teamId, transactions);
}

function buildTeamTransactions(rows) {
  const transactionsByTeam = new Map();

  for (const row of rows) {
    const pokemonIn = parsePokemonIds(row.pokemon_in);
    const pokemonOut = parsePokemonIds(row.pokemon_out);
    addTransactionForTeam(transactionsByTeam, row.season_coach_id, {
      ...row,
      pokemonIn,
      pokemonOut,
    });

    // A P2P trade is stored from the initiating team’s perspective. Add the
    // inverse view for the trading partner, matching roster-utils semantics.
    if (row.type === "P2P_TRADE" && row.trading_partner_season_coach_id) {
      addTransactionForTeam(transactionsByTeam, row.trading_partner_season_coach_id, {
        ...row,
        season_coach_id: row.trading_partner_season_coach_id,
        pokemonIn: pokemonOut,
        pokemonOut: pokemonIn,
      });
    }
  }

  return transactionsByTeam;
}

function getRosterAtMatchWeek(currentRosterIds, transactions, matchWeek) {
  const roster = new Set(currentRosterIds);
  const futureTransactions = transactions
    .filter((transaction) => transaction.week > matchWeek)
    .sort((a, b) => b.week - a.week || b.id - a.id);

  for (const transaction of futureTransactions) {
    if (transaction.type === "FA_PICKUP" || transaction.type === "FA_SWAP" || transaction.type === "P2P_TRADE") {
      for (const pokemonId of transaction.pokemonIn) roster.delete(pokemonId);
    }
    if (transaction.type === "FA_DROP" || transaction.type === "FA_SWAP" || transaction.type === "P2P_TRADE") {
      for (const pokemonId of transaction.pokemonOut) roster.add(pokemonId);
    }
  }

  return roster;
}

const db = new Database(databasePath);
db.pragma("busy_timeout = 30000");

const season = db
  .prepare("SELECT id FROM seasons WHERE season_number = ?")
  .get(SEASON_NUMBER);
if (!season) {
  db.close();
  throw new Error(`Season ${SEASON_NUMBER} was not found`);
}

const matches = db.prepare(`
  SELECT id, week, coach1_season_id, coach2_season_id
  FROM matches
  WHERE season_id = ? AND is_forfeit = 0
`).all(season.id);
const matchById = new Map(matches.map((match) => [match.id, match]));

const rosterRows = db.prepare(`
  SELECT r.season_coach_id, r.pokemon_id
  FROM rosters r
  JOIN season_coaches sc ON sc.id = r.season_coach_id
  JOIN divisions d ON d.id = sc.division_id
  WHERE d.season_id = ?
`).all(season.id);
const rosterIdsByTeam = new Map();
for (const row of rosterRows) {
  const ids = rosterIdsByTeam.get(row.season_coach_id) || [];
  ids.push(row.pokemon_id);
  rosterIdsByTeam.set(row.season_coach_id, ids);
}

const transactionRows = db.prepare(`
  SELECT id, type, week, season_coach_id, trading_partner_season_coach_id,
         pokemon_in, pokemon_out
  FROM transactions
  WHERE season_id = ?
`).all(season.id);
const transactionsByTeam = buildTeamTransactions(transactionRows);

const megaRows = db.prepare(`
  SELECT
    mp.id,
    mp.match_id,
    mp.season_coach_id,
    mp.pokemon_id,
    mp.revealed_items,
    p.name AS pokemon_name,
    p.display_name AS pokemon_display_name,
    sc.team_name
  FROM match_pokemon mp
  JOIN matches m ON m.id = mp.match_id
  JOIN pokemon p ON p.id = mp.pokemon_id
  JOIN season_coaches sc ON sc.id = mp.season_coach_id
  WHERE m.season_id = ?
    AND m.is_forfeit = 0
    AND mp.season_coach_id IN (m.coach1_season_id, m.coach2_season_id)
    AND (
      instr(lower(p.name), 'mega') > 0
      OR instr(lower(coalesce(p.display_name, p.name)), 'mega') > 0
    )
    AND (mp.revealed_items IS NULL OR length(trim(mp.revealed_items)) = 0 OR trim(mp.revealed_items) = '[]')
  ORDER BY m.week, m.id, mp.id
`).all(season.id);

const updateItems = db.prepare("UPDATE match_pokemon SET revealed_items = ? WHERE id = ?");
const updates = [];
const excluded = [];

for (const row of megaRows) {
  const match = matchById.get(row.match_id);
  if (!match || match.week == null) {
    excluded.push({ ...row, reason: "match has no week" });
    continue;
  }

  let storedItems;
  try {
    storedItems = parseJsonArray(row.revealed_items, `match_pokemon ${row.id} revealed_items`);
  } catch (error) {
    excluded.push({ ...row, reason: error.message });
    continue;
  }
  if (storedItems.length > 0) continue;

  const rosterAtMatch = getRosterAtMatchWeek(
    rosterIdsByTeam.get(row.season_coach_id) || [],
    transactionsByTeam.get(row.season_coach_id) || [],
    match.week
  );
  const pokemonName = row.pokemon_display_name || row.pokemon_name;
  const megaStone = getMegaStoneName(pokemonName);
  if (!megaStone) {
    excluded.push({ ...row, reason: "Mega form has no derivable stone" });
    continue;
  }
  if (!rosterAtMatch.has(row.pokemon_id)) {
    excluded.push({ ...row, reason: "Mega form is not on the team roster at match week" });
    continue;
  }

  const inferredItems = [{
    item: megaStone,
    turn: 0,
    source: "assumed from team roster",
  }];
  updates.push({ ...row, megaStone, inferredItems });

  if (verbose) {
    console.log(`PLAN S${SEASON_NUMBER} match ${row.match_id}: ${row.team_name} ${pokemonName} -> ${megaStone}`);
  }
}

if (!dryRun && updates.length > 0) {
  db.transaction((pendingUpdates) => {
    for (const update of pendingUpdates) {
      updateItems.run(JSON.stringify(update.inferredItems), update.id);
    }
  })(updates);
}

db.close();

console.log(`${dryRun ? "Planned" : "Backfilled"} ${updates.length} Season ${SEASON_NUMBER} Mega Stone rows`);
console.log(`Scanned ${megaRows.length} empty Mega-form rows; excluded ${excluded.length} without a team-roster confirmation`);
if (updates.length > 0) {
  console.log(`Distinct inferred stones: ${new Set(updates.map((update) => update.megaStone)).size}`);
}
if (excluded.length > 0 && verbose) {
  for (const row of excluded) {
    console.log(`EXCLUDED match_pokemon ${row.id}: ${row.team_name} ${row.pokemon_display_name || row.pokemon_name} (${row.reason})`);
  }
}
