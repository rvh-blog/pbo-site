import { readSheetRange, batchWriteToSheet, isSyncEnabled, getSheetIdMap, batchUpdateFormatting } from "./sheets-sync";
import type { sheets_v4 } from "googleapis";
import { db } from "@/lib/db";
import {
  seasonCoaches,
  rosters,
  pokemon,
  coaches,
  matches,
  transactions,
  divisions,
} from "@/lib/schema";
import { eq, inArray } from "drizzle-orm";
import {
  buildPokemonNameMapping,
  convertPokemonName,
  sheetNameMappingOptionsForSeason,
} from "@/lib/sheets-pokemon-name-mapping";

export { buildPokemonNameMapping };

interface TeamRosterData {
  teamAbbr: string;
  teamName: string;
  coachName: string;
  seasonCoachId: number;
  replacedById: number | null;
  pokemon: {
    name: string;
    isTera: boolean;
    price: number;
    draftOrder: number | null;
  }[];
}

interface SheetTeamPosition {
  teamName: string;
  abbr: string;
  abbrColIdx: number;
  headerRow: number; // 2 or 18 (1-indexed)
}

/**
 * Find all team positions in the Rosters sheet by looking for abbreviations
 */
async function findTeamPositions(
  spreadsheetId: string
): Promise<Map<string, SheetTeamPosition>> {
  const positions = new Map<string, SheetTeamPosition>();

  const data = await readSheetRange(spreadsheetId, "Rosters!A1:BZ35");
  if (!data) return positions;

  const processRow = (row: unknown[], headerRow: number) => {
    if (!row) return;
    row.forEach((cell: unknown, idx: number) => {
      if (cell && typeof cell === "string" && /^[A-Z0-9_]{2,5}$/.test(cell)) {
        const teamNameIdx = idx - 4;
        const teamName = teamNameIdx >= 0 ? row[teamNameIdx] : null;
        if (teamName && typeof teamName === "string") {
          const normalizedName = teamName.toLowerCase().trim();
          positions.set(normalizedName, {
            teamName,
            abbr: cell,
            abbrColIdx: idx,
            headerRow,
          });
        }
      }
    });
  };

  processRow(data[1], 2);
  processRow(data[17], 18);

  return positions;
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
 * Get the last completed week for a specific team
 */
function getTeamLastCompletedWeek(
  teamId: number,
  allMatches: { week: number; coach1SeasonId: number; coach2SeasonId: number; winnerId: number | null }[]
): number {
  return allMatches
    .filter(
      (m) =>
        m.week <= 100 &&
        m.winnerId !== null &&
        (m.coach1SeasonId === teamId || m.coach2SeasonId === teamId)
    )
    .reduce((max, m) => Math.max(max, m.week), 0);
}

function sortPokemonForSheet<
  T extends { name: string; price: number; draftOrder: number | null }
>(pokemonSlots: T[]): T[] {
  return [...pokemonSlots].sort((a, b) => {
    if (b.price !== a.price) return b.price - a.price;
    const draftOrderDiff = (a.draftOrder ?? 999) - (b.draftOrder ?? 999);
    if (draftOrderDiff !== 0) return draftOrderDiff;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Get roster data for a division from the database with timesynced logic
 * Each team's roster is synced based on THEIR last completed match
 *
 * Time-sync logic uses transactions directly:
 * - Start with current roster
 * - Reverse any transactions that happened AFTER the team's effective week
 */
async function getDivisionRosters(
  divisionId: number
): Promise<TeamRosterData[]> {
  // Fetch division, matches, and teams in parallel
  const [division, allMatches, teamsData] = await Promise.all([
    db.query.divisions.findFirst({
      where: eq(divisions.id, divisionId),
    }),
    db.query.matches.findMany({
      where: eq(matches.divisionId, divisionId),
    }),
    db
      .select({
        seasonCoachId: seasonCoaches.id,
        teamName: seasonCoaches.teamName,
        teamAbbreviation: seasonCoaches.teamAbbreviation,
        coachName: coaches.name,
        replacedById: seasonCoaches.replacedById,
        isActive: seasonCoaches.isActive,
      })
      .from(seasonCoaches)
      .innerJoin(coaches, eq(seasonCoaches.coachId, coaches.id))
      .where(eq(seasonCoaches.divisionId, divisionId)),
  ]);

  if (!division) {
    throw new Error(`Division ${divisionId} not found`);
  }

  // Fetch transactions (depends on division.seasonId) and all rosters in parallel
  const seasonCoachIds = teamsData.map((t) => t.seasonCoachId);
  const [allTransactions, allRosterEntries] = await Promise.all([
    db.query.transactions.findMany({
      where: eq(transactions.seasonId, division.seasonId),
    }),
    // Batch fetch all rosters for all teams at once
    seasonCoachIds.length > 0
      ? db
          .select({
            seasonCoachId: rosters.seasonCoachId,
            rosterId: rosters.id,
            pokemonId: rosters.pokemonId,
            pokemonName: pokemon.name,
            displayName: pokemon.displayName,
            price: rosters.price,
            isTera: rosters.isTeraCaptain,
            draftOrder: rosters.draftOrder,
          })
          .from(rosters)
          .innerJoin(pokemon, eq(rosters.pokemonId, pokemon.id))
          .where(
            seasonCoachIds.length === 1
              ? eq(rosters.seasonCoachId, seasonCoachIds[0])
              : inArray(rosters.seasonCoachId, seasonCoachIds)
          )
      : Promise.resolve([]),
  ]);

  // Group roster entries by seasonCoachId for O(1) lookup
  const rostersByCoach = new Map<number, typeof allRosterEntries>();
  for (const entry of allRosterEntries) {
    const existing = rostersByCoach.get(entry.seasonCoachId) || [];
    existing.push(entry);
    rostersByCoach.set(entry.seasonCoachId, existing);
  }

  const rosterResults: TeamRosterData[] = [];

  for (const team of teamsData) {
    // Calculate this team's effective week based on THEIR last completed match
    const teamLastCompletedWeek = getTeamLastCompletedWeek(team.seasonCoachId, allMatches);
    // For replacement teams, effectiveWeek must be at least their first scheduled match week
    const teamMatches = allMatches.filter(
      (m) => m.week <= 100 && (m.coach1SeasonId === team.seasonCoachId || m.coach2SeasonId === team.seasonCoachId)
    );
    const firstMatchWeek = teamMatches.reduce((min, m) => Math.min(min, m.week), Infinity);
    const effectiveWeek = Math.max(teamLastCompletedWeek + 1, firstMatchWeek === Infinity ? 1 : firstMatchWeek);

    // Get current roster entries for this team from batched data
    const entries = (rostersByCoach.get(team.seasonCoachId) || [])
      .sort((a, b) => {
        if (b.price !== a.price) return b.price - a.price;
        const draftOrderDiff = (a.draftOrder ?? 999) - (b.draftOrder ?? 999);
        if (draftOrderDiff !== 0) return draftOrderDiff;
        return (a.displayName || a.pokemonName).localeCompare(b.displayName || b.pokemonName);
      });

    // Get coach's transactions sorted by week desc, id desc (newest first)
    // Include partner P2P trades with pokemonIn/pokemonOut swapped to reflect this coach's perspective
    const coachTransactions = [
      ...allTransactions.filter((tx) => tx.seasonCoachId === team.seasonCoachId),
      ...allTransactions
        .filter((tx) => tx.type === "P2P_TRADE" && tx.tradingPartnerSeasonCoachId === team.seasonCoachId)
        .map((tx) => ({ ...tx, pokemonIn: tx.pokemonOut, pokemonOut: tx.pokemonIn })),
    ].sort((a, b) => (b.week !== a.week ? b.week - a.week : b.id - a.id));

    // Build sets of Pokemon to track time-synced state
    const currentPokemonIds = new Set<number>(entries.map((e) => e.pokemonId));
    const teraCaptainPokemonIds = new Set<number>(
      entries.filter((e) => e.isTera).map((e) => e.pokemonId)
    );

    // Reverse future transactions (week > effectiveWeek) to get roster at effectiveWeek
    for (const tx of coachTransactions) {
      if (tx.week <= effectiveWeek) break; // Past this point, transactions are applied

      // Reverse this transaction's effect on roster
      switch (tx.type) {
        case "FA_PICKUP":
        case "FA_SWAP": {
          // Remove Pokemon that were picked up in the future
          const addedIds = tx.pokemonIn as number[] | null;
          if (addedIds) {
            for (const id of addedIds) {
              currentPokemonIds.delete(id);
            }
          }
          // Re-add Pokemon that were dropped in the future
          const droppedIds = tx.pokemonOut as number[] | null;
          if (droppedIds) {
            for (const id of droppedIds) {
              currentPokemonIds.add(id);
            }
          }
          break;
        }
        case "FA_DROP": {
          // Re-add Pokemon that were dropped in the future
          const droppedIds = tx.pokemonOut as number[] | null;
          if (droppedIds) {
            for (const id of droppedIds) {
              currentPokemonIds.add(id);
            }
          }
          break;
        }
        case "P2P_TRADE": {
          // Reverse trade: remove received Pokemon, add given Pokemon
          const receivedIds = tx.pokemonIn as number[] | null;
          const givenIds = tx.pokemonOut as number[] | null;
          if (receivedIds) {
            for (const id of receivedIds) {
              currentPokemonIds.delete(id);
            }
          }
          if (givenIds) {
            for (const id of givenIds) {
              currentPokemonIds.add(id);
            }
          }
          break;
        }
      }

      // Reverse tera captain changes
      if (tx.newTeraCaptainId) {
        teraCaptainPokemonIds.delete(tx.newTeraCaptainId);
      }
      if (tx.oldTeraCaptainId) {
        teraCaptainPokemonIds.add(tx.oldTeraCaptainId);
      }
    }

    // Build final roster from current entries + any Pokemon we need to restore
    // First, filter current entries to only include Pokemon that should be on roster
    const filteredEntries = entries.filter((e) => currentPokemonIds.has(e.pokemonId));

    // For Pokemon that were dropped/traded but need to be restored, we need to fetch them
    const missingPokemonIds = [...currentPokemonIds].filter(
      (id) => !entries.some((e) => e.pokemonId === id)
    );

    // Fetch missing Pokemon info
    let restoredPokemon: { pokemonId: number; name: string; displayName: string | null }[] = [];
    if (missingPokemonIds.length > 0) {
      const missingPokemon = await db
        .select({
          pokemonId: pokemon.id,
          name: pokemon.name,
          displayName: pokemon.displayName,
        })
        .from(pokemon)
        .where(
          missingPokemonIds.length === 1
            ? eq(pokemon.id, missingPokemonIds[0])
            : eq(pokemon.id, missingPokemonIds[0]) // Will be handled by inArray below
        );

      // If multiple Pokemon, fetch all
      if (missingPokemonIds.length > 1) {
        const { inArray } = await import("drizzle-orm");
        restoredPokemon = await db
          .select({
            pokemonId: pokemon.id,
            name: pokemon.name,
            displayName: pokemon.displayName,
          })
          .from(pokemon)
          .where(inArray(pokemon.id, missingPokemonIds));
      } else {
        restoredPokemon = missingPokemon;
      }
    }

    // Combine filtered entries with restored Pokemon
    const finalPokemon = sortPokemonForSheet([
      ...filteredEntries.map((e) => ({
        name: e.displayName || e.pokemonName,
        isTera: teraCaptainPokemonIds.has(e.pokemonId),
        price: e.price,
        draftOrder: e.draftOrder,
      })),
      ...restoredPokemon.map((p) => ({
        name: p.displayName || p.name,
        isTera: teraCaptainPokemonIds.has(p.pokemonId),
        price: 0,
        draftOrder: null,
      })),
    ]);

    rosterResults.push({
      teamAbbr: team.teamAbbreviation || "",
      teamName: team.teamName,
      coachName: team.coachName,
      seasonCoachId: team.seasonCoachId,
      replacedById: team.replacedById,
      pokemon: finalPokemon,
    });
  }

  return rosterResults;
}

/**
 * Sync roster data from database to Google Sheet
 * @param options.pokemonNameMapping - Pre-built mapping to avoid duplicate API call
 * @param options.skipSyncCheck - Skip isSyncEnabled check (caller already verified)
 */
export async function syncRostersToSheet(
  spreadsheetId: string,
  divisionId: number,
  options?: {
    pokemonNameMapping?: Map<string, string>;
    skipSyncCheck?: boolean;
  }
): Promise<{ success: boolean; teamsUpdated: number; errors: string[] }> {
  const errors: string[] = [];
  let teamsUpdated = 0;

  try {
    // 0. Check if sync is enabled (unless caller already checked)
    if (!options?.skipSyncCheck) {
      const syncEnabled = await isSyncEnabled(spreadsheetId);
      if (!syncEnabled) {
        console.log("Sync is disabled in Config tab, skipping roster sync");
        return { success: true, teamsUpdated: 0, errors: [] };
      }
    }

    // 1-3. Fetch data (use pre-built mapping if provided)
    console.log("Fetching team positions and roster data...");
    const [pokemonNameMapping, teamPositions, rostersData] = await Promise.all([
      options?.pokemonNameMapping
        ? Promise.resolve(options.pokemonNameMapping)
        : db.query.divisions.findFirst({ where: eq(divisions.id, divisionId), with: { season: true } })
            .then((division) => buildPokemonNameMapping(
              spreadsheetId,
              sheetNameMappingOptionsForSeason(division?.season?.seasonNumber)
            )),
      findTeamPositions(spreadsheetId),
      getDivisionRosters(divisionId),
    ]);
    console.log(`Loaded ${pokemonNameMapping.size} Pokemon mappings, ${teamPositions.size} team positions, ${rostersData.length} rosters`);

    // 4. Build batch updates (Pokemon names and tera markers, no tier points)
    const updates: { range: string; values: (string | number | null)[][] }[] = [];

    for (const roster of rostersData) {
      // Skip replaced teams — they're no longer in the sheet
      if (roster.replacedById) {
        continue;
      }

      // Match by team name, fallback to matching by abbreviation
      const normalizedName = roster.teamName.toLowerCase().trim();
      let position = teamPositions.get(normalizedName);
      if (!position && roster.teamAbbr) {
        // Fallback: find by abbreviation match
        for (const pos of teamPositions.values()) {
          if (pos.abbr === roster.teamAbbr) {
            position = pos;
            break;
          }
        }
      }
      if (!position) {
        errors.push(`Team "${roster.teamName}" (${roster.teamAbbr}) not found in sheet`);
        continue;
      }

      const { abbrColIdx, headerRow } = position;

      // Calculate columns (6-column layout per team):
      // Price: abbr - 5 (ARRAYFORMULA, written once via write-cost-formulas.ts)
      // TierPts: abbr - 4 (ARRAYFORMULA, existing in sheet)
      // Pokemon name: abbr - 3
      // (empty): abbr - 2
      // Tera marker: abbr - 1
      // Abbreviation: abbr
      const pokemonColIdx = abbrColIdx - 3;
      const teraColIdx = abbrColIdx - 1;
      const pokemonCol = colIdxToLetter(pokemonColIdx);
      const teraCol = colIdxToLetter(teraColIdx);

      // Pokemon rows start 2 rows after header
      const pokemonStartRow = headerRow + 2;

      // Prepare pokemon data (pad to 12 slots to clear any old data in rows 11-12)
      // Sheet formula range is 12 rows (e.g., D4:D15), so we write 12 rows
      const pokemonData = roster.pokemon.slice(0, 12);
      while (pokemonData.length < 12) {
        pokemonData.push({ name: "", isTera: false, price: 0, draftOrder: null });
      }

      // Add pokemon names update (converted to sheet names)
      updates.push({
        range: `Rosters!${pokemonCol}${pokemonStartRow}:${pokemonCol}${pokemonStartRow + 11}`,
        values: pokemonData.map((p) => [
          p.name ? convertPokemonName(p.name, pokemonNameMapping) : "",
        ]),
      });

      // Add tera markers update
      updates.push({
        range: `Rosters!${teraCol}${pokemonStartRow}:${teraCol}${pokemonStartRow + 11}`,
        values: pokemonData.map((p) => [p.isTera ? "T" : ""]),
      });

      teamsUpdated++;
    }

    // 5. Execute batch update for values
    if (updates.length > 0) {
      console.log(`Executing ${updates.length} range updates...`);
      await batchWriteToSheet(spreadsheetId, updates);
    }

    // 6. Sync tera captain borders on team sheets
    try {
      await syncTeraBordersToTeamSheets(spreadsheetId, rostersData);
    } catch (borderErr) {
      console.error("Error syncing tera borders:", borderErr);
      errors.push(`Tera border sync failed: ${String(borderErr)}`);
    }

    return { success: true, teamsUpdated, errors };
  } catch (error) {
    console.error("Error syncing rosters:", error);
    return {
      success: false,
      teamsUpdated,
      errors: [...errors, String(error)],
    };
  }
}

// ── Tera Captain Border Sync on Team Sheets ──

/**
 * Get team name -> sheet abbreviation mapping from the Source tab (H21:Q40 area).
 * Column I has team name, Column N has abbreviation.
 * These abbreviations match the team sheet tab names.
 */
async function getTeamAbbreviationMapping(
  spreadsheetId: string
): Promise<Map<string, string>> {
  const mapping = new Map<string, string>();
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

// 0-indexed column positions for each pokemon slot on team sheets
const ROW_9_COLS = [2, 7, 12, 36, 41, 46]; // C, H, M, AK, AP, AU
const ROW_17_COLS = [4, 9, 14, 34, 39, 44]; // E, J, O, AI, AN, AS

function buildBorderStyle(style: string, color: { red: number; green: number; blue: number }) {
  return { style, width: 1, color };
}

function buildUpdateBordersRequest(
  sheetId: number,
  startRow: number,
  startCol: number,
  borderObj: ReturnType<typeof buildBorderStyle>
) {
  const border = borderObj.style === "NONE" ? { style: "NONE" } : borderObj;
  return {
    updateBorders: {
      range: {
        sheetId,
        startRowIndex: startRow,
        endRowIndex: startRow + 7,
        startColumnIndex: startCol,
        endColumnIndex: startCol + 4,
      },
      top: border,
      bottom: border,
      left: border,
      right: border,
    },
  };
}

/**
 * Sync tera captain borders on individual team sheets.
 * Thick green borders for tera captains, medium gray for regular, clear for empty.
 */
async function syncTeraBordersToTeamSheets(
  spreadsheetId: string,
  rostersData: TeamRosterData[]
) {
  // Fetch sheet IDs and the Source tab's team name → abbreviation mapping in parallel
  const [sheetIdMap, teamAbbrevMapping] = await Promise.all([
    getSheetIdMap(spreadsheetId),
    getTeamAbbreviationMapping(spreadsheetId),
  ]);

  const REGULAR_BORDER = buildBorderStyle("SOLID_MEDIUM", { red: 0.85, green: 0.85, blue: 0.85 }); // #D9D9D9
  const TERA_BORDER = buildBorderStyle("SOLID_THICK", { red: 0, green: 1, blue: 0 }); // #00FF00
  const EMPTY_BORDER = buildBorderStyle("NONE", { red: 0, green: 0, blue: 0 });

  const requests: sheets_v4.Schema$Request[] = [];

  for (const roster of rostersData) {
    // Skip replaced teams — they're no longer in the sheet
    if (roster.replacedById) {
      continue;
    }

    // Look up the sheet abbreviation from Source tab mapping
    const sheetAbbr = teamAbbrevMapping.get(roster.teamName.toLowerCase());
    if (!sheetAbbr) {
      console.log(`Team "${roster.teamName}" not found in Source abbreviation mapping, skipping tera borders`);
      continue;
    }

    const sheetId = sheetIdMap.get(sheetAbbr);
    if (sheetId === undefined) {
      console.log(`Team sheet "${sheetAbbr}" not found, skipping tera borders`);
      continue;
    }

    // Pad to 12 slots
    const pokemonSlots = roster.pokemon.slice(0, 12);
    while (pokemonSlots.length < 12) {
      pokemonSlots.push({ name: "", isTera: false, price: 0, draftOrder: null });
    }

    for (let i = 0; i < 12; i++) {
      const isTopSection = i < 6;
      const cols = isTopSection ? ROW_9_COLS : ROW_17_COLS;
      const slotIdx = isTopSection ? i : i - 6;
      const startCol = cols[slotIdx];
      // 0-indexed: top section rows 2-8 (sheet rows 3-9), bottom section rows 10-16 (sheet rows 11-17)
      // 7 rows tall per pokemon card
      const startRow = isTopSection ? 2 : 10;

      const slot = pokemonSlots[i];
      let border: ReturnType<typeof buildBorderStyle>;
      if (!slot.name) {
        border = EMPTY_BORDER;
      } else if (slot.isTera) {
        border = TERA_BORDER;
      } else {
        border = REGULAR_BORDER;
      }

      requests.push(buildUpdateBordersRequest(sheetId, startRow, startCol, border));
    }
  }

  if (requests.length > 0) {
    console.log(`Syncing tera borders: ${requests.length} border updates across team sheets`);
    await batchUpdateFormatting(spreadsheetId, requests);
  }
}
