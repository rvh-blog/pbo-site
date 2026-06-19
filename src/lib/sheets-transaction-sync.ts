import { readSheetRange, batchWriteToSheet, isSyncEnabled } from "./sheets-sync";
import { db } from "@/lib/db";
import { transactions, seasonCoaches, pokemon, divisions } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

// Transaction area in Source sheet:
// - Row 3: Headers
// - Row 4+: Data
// - Col U (idx 0): Team 1 abbreviation
// - Col X (idx 3): Pokemon 1 name
// - Col AC (idx 8): Team 2 abbreviation (for trades)
// - Col AF (idx 11): Pokemon 2 name (for trades)
// - Col AK (idx 16): Transaction type

const TX_START_ROW = 4; // Data starts at row 4
const TX_START_COL = 19; // Column T = index 19 (for Week)

// Column offsets from T
const WEEK_OFFSET = 0; // T
const TEAM1_OFFSET = 1; // U
const POKEMON1_OFFSET = 4; // X
const TEAM2_OFFSET = 9; // AC
const POKEMON2_OFFSET = 12; // AF
const TYPE_OFFSET = 17; // AK

// Sheet transaction types: "Grace Period", "Free Agent", "Trade", "Tera Change", "Dropped"

interface TransactionRow {
  week: number;
  team1Abbrev: string;
  pokemon1Name: string;
  team2Abbrev: string;
  pokemon2Name: string;
  type: string;
}

/**
 * Get team name -> sheet abbreviation mapping from the sheet (H21:Q37 area)
 * Column I has team name, Column N has abbreviation
 */
async function getTeamAbbreviationMapping(
  spreadsheetId: string
): Promise<Map<string, string>> {
  const mapping = new Map<string, string>();

  // Read the team table - I=team name (idx 1), N=abbreviation (idx 6)
  const data = await readSheetRange(spreadsheetId, "Source!H21:Q40");
  if (!data) return mapping;

  for (const row of data) {
    if (row && row[1] && row[6]) {
      const teamName = String(row[1]).trim();
      const abbrev = String(row[6]).trim();
      if (teamName && abbrev && teamName !== "Team Name") {
        mapping.set(teamName.toLowerCase(), abbrev);
      }
    }
  }

  return mapping;
}

/**
 * Convert column index to column letter
 */
function colIdxToLetter(idx: number): string {
  let result = "";
  while (idx >= 0) {
    result = String.fromCharCode(65 + (idx % 26)) + result;
    idx = Math.floor(idx / 26) - 1;
  }
  return result;
}

/**
 * Batch fetch Pokemon names by IDs
 */
async function batchGetPokemonNames(
  pokemonIds: number[]
): Promise<Map<number, string>> {
  if (pokemonIds.length === 0) return new Map();

  const { inArray } = await import("drizzle-orm");
  const pokeList = await db.query.pokemon.findMany({
    where: inArray(pokemon.id, pokemonIds),
  });

  const nameMap = new Map<number, string>();
  for (const poke of pokeList) {
    nameMap.set(poke.id, poke.displayName || poke.name);
  }
  return nameMap;
}

/**
 * Get Pokemon IDs from array field (already parsed by drizzle)
 */
function getPokemonIds(arr: number[] | null): number[] {
  if (!arr) return [];
  if (Array.isArray(arr)) return arr;
  return [];
}

/**
 * Get all transactions for a division and convert to sheet format
 *
 * Transaction format:
 * - Team 1 = team the Pokemon belonged to BEFORE (empty for FA pickup from pool)
 * - Pokemon 1 = the Pokemon being dropped/moved out
 * - Team 2 = team the Pokemon belongs to AFTER (empty for drops)
 * - Pokemon 2 = the Pokemon being picked up/moved in
 * - Type = "Grace Period" (if !counts_against_limit), "Free Agent", "Trade", "Tera Change", or "Dropped"
 */
async function getDivisionTransactions(
  divisionId: number,
  pokemonNameMapping: Map<string, string>,
  teamAbbrevMapping: Map<string, string>
): Promise<TransactionRow[]> {
  // Get the division to find season ID
  const division = await db.query.divisions.findFirst({
    where: eq(divisions.id, divisionId),
  });
  if (!division) return [];

  // Fetch transactions and coaches in parallel
  const [txList, coachList] = await Promise.all([
    db.query.transactions.findMany({
      where: eq(transactions.seasonId, division.seasonId),
    }),
    db.query.seasonCoaches.findMany({
      where: eq(seasonCoaches.divisionId, divisionId),
    }),
  ]);

  const coachIds = new Set(coachList.map((c) => c.id));
  const coachIdToTeamName = new Map(coachList.map((c) => [c.id, c.teamName]));

  // Filter to only transactions for coaches in this division
  // Skip grace period transactions (countsAgainstLimit=false) entirely — the sheet
  // layout only has room for the 12 "paid" transactions per team.
  const divisionTxs = txList.filter((tx) => coachIds.has(tx.seasonCoachId) && tx.countsAgainstLimit !== false);

  // Collect all Pokemon IDs that need names
  const allPokemonIds = new Set<number>();
  for (const tx of divisionTxs) {
    if (tx.oldTeraCaptainId) allPokemonIds.add(tx.oldTeraCaptainId);
    if (tx.newTeraCaptainId) allPokemonIds.add(tx.newTeraCaptainId);
    for (const id of getPokemonIds(tx.pokemonIn)) allPokemonIds.add(id);
    for (const id of getPokemonIds(tx.pokemonOut)) allPokemonIds.add(id);
  }

  // Batch fetch all Pokemon names in one query
  const pokemonNameById = await batchGetPokemonNames([...allPokemonIds]);

  // Helper to get Pokemon name from pre-fetched map
  const getPokeName = (id: number): string =>
    pokemonNameById.get(id) || `Pokemon #${id}`;

  // Helper to get sheet abbreviation from team name
  const getSheetAbbrev = (coachId: number): string => {
    const teamName = coachIdToTeamName.get(coachId);
    if (!teamName) return "";
    return teamAbbrevMapping.get(teamName.toLowerCase()) || "";
  };


  const rows: TransactionRow[] = [];

  for (const tx of divisionTxs) {
    const teamAbbrev = getSheetAbbrev(tx.seasonCoachId);

    switch (tx.type) {
      case "TERA_SWAP": {
        const oldTeraName = tx.oldTeraCaptainId
          ? convertPokemonName(getPokeName(tx.oldTeraCaptainId), pokemonNameMapping)
          : "";
        const newTeraName = tx.newTeraCaptainId
          ? convertPokemonName(getPokeName(tx.newTeraCaptainId), pokemonNameMapping)
          : "";

        if (oldTeraName && newTeraName) {
          // Swap: old on left, new on right
          rows.push({
            week: tx.week,
            team1Abbrev: teamAbbrev,
            pokemon1Name: oldTeraName,
            team2Abbrev: teamAbbrev,
            pokemon2Name: newTeraName,
            type: "Tera Change",
          });
        } else if (newTeraName) {
          // TC add only: pokemon in left cell only (TC removes are not synced to sheet)
          rows.push({
            week: tx.week,
            team1Abbrev: teamAbbrev,
            pokemon1Name: newTeraName,
            team2Abbrev: teamAbbrev,
            pokemon2Name: "",
            type: "Tera Change",
          });
        }
        break;
      }

      case "FA_DROP": {
        // Dropped: Team 1 = dropping team, Team 2 = empty (going to FA pool)
        // Use "Grace Period" if it doesn't count against limit, otherwise "Dropped"
        const droppedIds = getPokemonIds(tx.pokemonOut);
        for (const pokeId of droppedIds) {
          rows.push({
            week: tx.week,
            team1Abbrev: teamAbbrev,
            pokemon1Name: convertPokemonName(getPokeName(pokeId), pokemonNameMapping),
            team2Abbrev: "",
            pokemon2Name: "",
            type: "Dropped",
          });
        }
        break;
      }

      case "FA_PICKUP": {
        // Free Agent pickup: Team on both sides (left = team, right = team)
        const addedIds = getPokemonIds(tx.pokemonIn);
        for (const pokeId of addedIds) {
          rows.push({
            week: tx.week,
            team1Abbrev: teamAbbrev,
            pokemon1Name: convertPokemonName(getPokeName(pokeId), pokemonNameMapping),
            team2Abbrev: teamAbbrev,
            pokemon2Name: "",
            type: "Free Agent",
          });
        }
        break;
      }

      case "FA_SWAP": {
        // FA Swap = drop + pickup in single row
        // Team on both sides, Pokemon 1 = dropped, Pokemon 2 = picked up
        const droppedIds = getPokemonIds(tx.pokemonOut);
        const addedIds = getPokemonIds(tx.pokemonIn);

        const maxLen = Math.max(droppedIds.length, addedIds.length);
        for (let i = 0; i < maxLen; i++) {
          const droppedId = droppedIds[i];
          const addedId = addedIds[i];
          const droppedName = droppedId
            ? convertPokemonName(getPokeName(droppedId), pokemonNameMapping)
            : "";
          const addedName = addedId
            ? convertPokemonName(getPokeName(addedId), pokemonNameMapping)
            : "";

          rows.push({
            week: tx.week,
            team1Abbrev: teamAbbrev,
            pokemon1Name: droppedName,
            team2Abbrev: teamAbbrev,
            pokemon2Name: addedName,
            type: "Free Agent",
          });
        }
        break;
      }

      case "P2P_TRADE": {
        // Trade: Team 1 gives Pokemon 1, Team 2 gives Pokemon 2
        // Grace period trades are marked as "Grace Period"
        const givenIds = getPokemonIds(tx.pokemonOut);
        const receivedIds = getPokemonIds(tx.pokemonIn);
        const partnerAbbrev = tx.tradingPartnerSeasonCoachId
          ? getSheetAbbrev(tx.tradingPartnerSeasonCoachId)
          : "";
        const tradeType = "Trade";

        // Each Pokemon traded creates a row
        const maxLen = Math.max(givenIds.length, receivedIds.length);
        for (let i = 0; i < maxLen; i++) {
          const givenId = givenIds[i];
          const receivedId = receivedIds[i];
          const givenName = givenId
            ? convertPokemonName(getPokeName(givenId), pokemonNameMapping)
            : "";
          const receivedName = receivedId
            ? convertPokemonName(getPokeName(receivedId), pokemonNameMapping)
            : "";

          rows.push({
            week: tx.week,
            team1Abbrev: teamAbbrev,
            pokemon1Name: givenName,
            team2Abbrev: partnerAbbrev,
            pokemon2Name: receivedName,
            type: tradeType,
          });
        }
        break;
      }
    }
  }

  // Sort by week ascending, then by transaction insertion order
  rows.sort((a, b) => a.week - b.week);

  return rows;
}

/**
 * Convert DB Pokemon name to Sheet display name
 */
function convertPokemonName(
  dbName: string,
  mapping: Map<string, string>
): string {
  const mapped = mapping.get(dbName.toLowerCase());
  if (mapped) return mapped;
  return dbName;
}

/**
 * Sync transactions from database to Google Sheet Source tab
 */
export async function syncTransactionsToSheet(
  spreadsheetId: string,
  divisionId: number,
  options?: {
    pokemonNameMapping?: Map<string, string>;
    skipSyncCheck?: boolean;
  }
): Promise<{ success: boolean; transactionsUpdated: number; errors: string[] }> {
  const errors: string[] = [];
  let transactionsUpdated = 0;

  try {
    // Check if sync is enabled (unless caller already checked)
    if (!options?.skipSyncCheck) {
      const syncEnabled = await isSyncEnabled(spreadsheetId);
      if (!syncEnabled) {
        console.log("Sync is disabled in Config tab, skipping transaction sync");
        return { success: true, transactionsUpdated: 0, errors: [] };
      }
    }

    // Use provided Pokemon name mapping or build one
    const pokemonNameMapping =
      options?.pokemonNameMapping || new Map<string, string>();

    // Build team abbreviation mapping from the sheet
    console.log("Building team abbreviation mapping...");
    const teamAbbrevMapping = await getTeamAbbreviationMapping(spreadsheetId);
    console.log(`Loaded ${teamAbbrevMapping.size} team abbreviation mappings`);

    console.log("Fetching transactions for division...");
    const txRows = await getDivisionTransactions(divisionId, pokemonNameMapping, teamAbbrevMapping);
    console.log(`Found ${txRows.length} transaction rows to sync`);

    // Build batch updates
    const updates: { range: string; values: (string | number | null)[][] }[] = [];

    // Write transaction rows starting at row 4
    for (let i = 0; i < txRows.length; i++) {
      const row = txRows[i];
      const rowNum = TX_START_ROW + i;

      // Week (Col T)
      const weekCol = colIdxToLetter(TX_START_COL + WEEK_OFFSET);
      updates.push({
        range: `'Source'!${weekCol}${rowNum}`,
        values: [[row.week - 1]],
      });

      // Team 1 abbreviation (Col U)
      const team1Col = colIdxToLetter(TX_START_COL + TEAM1_OFFSET);
      updates.push({
        range: `'Source'!${team1Col}${rowNum}`,
        values: [[row.team1Abbrev]],
      });

      // Pokemon 1 name (Col X)
      const poke1Col = colIdxToLetter(TX_START_COL + POKEMON1_OFFSET);
      updates.push({
        range: `'Source'!${poke1Col}${rowNum}`,
        values: [[row.pokemon1Name]],
      });

      // Team 2 abbreviation (Col AC)
      const team2Col = colIdxToLetter(TX_START_COL + TEAM2_OFFSET);
      updates.push({
        range: `'Source'!${team2Col}${rowNum}`,
        values: [[row.team2Abbrev]],
      });

      // Pokemon 2 name (Col AF)
      const poke2Col = colIdxToLetter(TX_START_COL + POKEMON2_OFFSET);
      updates.push({
        range: `'Source'!${poke2Col}${rowNum}`,
        values: [[row.pokemon2Name]],
      });

      // Transaction type (Col AK)
      const typeCol = colIdxToLetter(TX_START_COL + TYPE_OFFSET);
      updates.push({
        range: `'Source'!${typeCol}${rowNum}`,
        values: [[row.type]],
      });

      transactionsUpdated++;
    }

    // Clear any remaining rows (up to a reasonable max, e.g., 200 rows)
    const MAX_TX_ROWS = 200;
    for (let i = txRows.length; i < MAX_TX_ROWS; i++) {
      const rowNum = TX_START_ROW + i;

      const weekCol = colIdxToLetter(TX_START_COL + WEEK_OFFSET);
      const team1Col = colIdxToLetter(TX_START_COL + TEAM1_OFFSET);
      const poke1Col = colIdxToLetter(TX_START_COL + POKEMON1_OFFSET);
      const team2Col = colIdxToLetter(TX_START_COL + TEAM2_OFFSET);
      const poke2Col = colIdxToLetter(TX_START_COL + POKEMON2_OFFSET);
      const typeCol = colIdxToLetter(TX_START_COL + TYPE_OFFSET);

      updates.push({ range: `'Source'!${weekCol}${rowNum}`, values: [[""]] });
      updates.push({ range: `'Source'!${team1Col}${rowNum}`, values: [[""]] });
      updates.push({ range: `'Source'!${poke1Col}${rowNum}`, values: [[""]] });
      updates.push({ range: `'Source'!${team2Col}${rowNum}`, values: [[""]] });
      updates.push({ range: `'Source'!${poke2Col}${rowNum}`, values: [[""]] });
      updates.push({ range: `'Source'!${typeCol}${rowNum}`, values: [[""]] });
    }

    // Execute batch update
    if (updates.length > 0) {
      console.log(`Executing ${updates.length} transaction updates...`);
      await batchWriteToSheet(spreadsheetId, updates);
    }

    return { success: true, transactionsUpdated, errors };
  } catch (error) {
    console.error("Error syncing transactions:", error);
    return {
      success: false,
      transactionsUpdated,
      errors: [...errors, String(error)],
    };
  }
}
