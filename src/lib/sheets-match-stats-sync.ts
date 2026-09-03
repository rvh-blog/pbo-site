import { readSheetRange, batchWriteToSheet, isSyncEnabled } from "./sheets-sync";
import { isDoubleForfeitResult } from "./match-result-utils";
import { db } from "@/lib/db";
import {
  seasonCoaches,
  matches,
  divisions,
} from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getSeasonFormat, LEGACY_REGULAR_SEASON_WEEKS, SEASON_11_FIXTURES_PER_WEEK } from "@/lib/season-format";
import {
  buildPokemonNameMapping,
  convertPokemonName,
  sheetNameMappingOptionsForSeason,
} from "@/lib/sheets-pokemon-name-mapping";

// Match Stats sheet structure:
// - Week columns: C(2), Q(16), AE(30), AS(44), BG(58), BU(72), CI(86), CW(100) - 14 columns apart
// - Fixture rows: 5, 18, 31, 44, 57, 70, 83, then S11+ also uses 96
// - Seasons 10 and before use 7 fixtures per week; Season 11+ supports 8 fixtures for 16-team divisions
// - Per fixture layout (10 rows):
//   - Row 0: Team names (formula - don't touch)
//   - Row 1: Headers (Pokemon, K, D, D, K, Pokemon)
//   - Rows 2-7: 6 Pokemon data
//   - Row 8: Result formula (don't touch)
//   - Row 9: Replay link

const WEEK_START_COL = 2; // Column C = index 2
const WEEK_COL_SPACING = 14; // 14 columns between week starts
const FIXTURE_START_ROW = 5; // First fixture at row 5 (1-indexed)
const FIXTURE_ROW_SPACING = 13; // 13 rows between fixtures
const LEGACY_FIXTURES_PER_WEEK = 7;

// Column offsets within a fixture (from week start column):
// Team 1: Pokemon=0, Kills=1, Deaths=2
// Team 2: Deaths=4, Kills=5, Pokemon=6
const T1_POKEMON_OFFSET = 0;
const T1_KILLS_OFFSET = 1;
const T1_DEATHS_OFFSET = 2;
const T2_DEATHS_OFFSET = 4;
const T2_KILLS_OFFSET = 5;
const T2_POKEMON_OFFSET = 6;

// Pokemon data rows are 2-7 (0-indexed from fixture start, so +2 to +7)
const POKEMON_ROW_START = 2;
const POKEMON_ROW_COUNT = 6;
const RESULT_ROW_OFFSET = 8;
const REPLAY_ROW_OFFSET = 9;
const TEAM_SHEET_SCHEDULE_START_ROW = 23;
const TEAM_SHEET_RESULT_COL = "M";

// Result cells normally contain formulas that infer W/L from the differential.
// A selected website winner is authoritative even when both differentials are
// zero, so completed fixtures receive explicit W/L values during sync.
const T1_RESULT_OFFSET = 0;
const T2_RESULT_OFFSET = 6;

interface MatchData {
  matchId: number;
  week: number;
  winnerId: number | null;
  isForfeit: boolean;
  coach1Differential: number;
  coach2Differential: number;
  replayUrl: string | null;
  team1Name: string;
  team2Name: string;
  team1SheetName: string; // Name used in sheet (replacement name if coach was replaced)
  team2SheetName: string;
  team1SheetTab: string;
  team2SheetTab: string;
  team1SeasonCoachId: number;
  team2SeasonCoachId: number;
  team1ReplacedById: number | null;
  team2ReplacedById: number | null;
  team1Pokemon: { name: string; kills: number; deaths: number }[];
  team2Pokemon: { name: string; kills: number; deaths: number }[];
}

interface SheetFixturePosition {
  week: number;
  row: number; // 1-indexed row of fixture start
  col: number; // 0-indexed column of week start
  team1Name: string;
  team2Name: string;
}

async function getTeamSheetTabMapping(
  spreadsheetId: string
): Promise<Map<string, string>> {
  const mapping = new Map<string, string>();
  const data = await readSheetRange(spreadsheetId, "Source!H21:Q40");
  if (!data) return mapping;

  for (const row of data) {
    const teamName = row?.[1];
    const sheetTab = row?.[6];
    if (typeof teamName === "string" && typeof sheetTab === "string") {
      const normalizedName = teamName.trim().toLowerCase();
      if (normalizedName && teamName !== "Team Name") {
        mapping.set(normalizedName, sheetTab.trim());
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
 * Get all fixture positions from the Match Stats sheet
 * by reading team names from each fixture's header row
 */
async function getFixturePositions(
  spreadsheetId: string,
  fixturesPerWeek: number,
  regularWeeks: number
): Promise<Map<string, SheetFixturePosition>> {
  const positions = new Map<string, SheetFixturePosition>();

  // Read the Match Stats sheet - enough rows for 16-team divisions and the
  // fixed 8-week regular season.
  const fixtureRangeEndRow = fixturesPerWeek >= SEASON_11_FIXTURES_PER_WEEK ? 110 : 100;
  const fixtureRangeEndCol = colIdxToLetter(WEEK_START_COL + Math.max(regularWeeks - 1, 0) * WEEK_COL_SPACING + T2_POKEMON_OFFSET);
  const data = await readSheetRange(spreadsheetId, `Match Stats!A1:${fixtureRangeEndCol}${fixtureRangeEndRow}`);
  if (!data) return positions;

  // Iterate through each week and fixture
  for (let week = 1; week <= regularWeeks; week++) {
    const weekColIdx = WEEK_START_COL + (week - 1) * WEEK_COL_SPACING;

    for (let fixture = 0; fixture < fixturesPerWeek; fixture++) {
      const fixtureRowIdx = FIXTURE_START_ROW + fixture * FIXTURE_ROW_SPACING - 1; // -1 for 0-indexed
      const row = data[fixtureRowIdx];
      if (!row) continue;

      // Team names are in the fixture header row at weekCol (T1) and weekCol+4 (T2)
      // Layout: C=T1Name, D=empty, E=0, F=empty, G=T2Name
      const team1Name = String(row[weekColIdx] || "").trim();
      const team2Name = String(row[weekColIdx + 4] || "").trim();

      if (team1Name && team2Name) {
        // Create key from both team names (sorted to handle order variations)
        const key = `${week}:${[team1Name, team2Name].sort().join("|")}`;
        positions.set(key, {
          week,
          row: fixtureRowIdx + 1, // Convert back to 1-indexed
          col: weekColIdx,
          team1Name,
          team2Name,
        });
      }
    }
  }

  return positions;
}

/**
 * Get match data with pokemon stats for a division
 */
async function getDivisionMatches(
  divisionId: number,
  teamSheetTabMapping: Map<string, string>
): Promise<MatchData[]> {
  // Fetch matches and coaches in parallel
  const [divisionMatches, allCoaches] = await Promise.all([
    db.query.matches.findMany({
      where: eq(matches.divisionId, divisionId),
      with: {
        coach1: true,
        coach2: true,
        matchPokemon: {
          with: {
            pokemon: true,
          },
        },
      },
    }),
    db.query.seasonCoaches.findMany({
      where: eq(seasonCoaches.divisionId, divisionId),
    }),
  ]);

  const coachMap = new Map(allCoaches.map((c) => [c.id, c]));

  // Build a mapping from coach ID to the "sheet name" — if a coach was replaced,
  // the sheet uses the replacement's team name for all matches (including pre-replacement ones)
  function getSheetName(coachId: number): string {
    const coach = coachMap.get(coachId);
    if (!coach) return "";
    if (coach.replacedById) {
      const replacement = coachMap.get(coach.replacedById);
      if (replacement) return replacement.teamName;
    }
    return coach.teamName;
  }

  function getSheetTab(coachId: number): string {
    const coach = coachMap.get(coachId);
    if (!coach) return "";
    const sheetName = getSheetName(coachId).toLowerCase().trim();
    const mappedSheetTab = teamSheetTabMapping.get(sheetName);
    if (mappedSheetTab) return mappedSheetTab;
    if (coach.replacedById) {
      const replacement = coachMap.get(coach.replacedById);
      if (replacement?.teamAbbreviation) return replacement.teamAbbreviation;
    }
    return coach.teamAbbreviation || "";
  }

  const matchDataList: MatchData[] = [];

  for (const match of divisionMatches) {
    if (match.week > 100) continue; // Skip playoff matches

    const coach1 = coachMap.get(match.coach1SeasonId);
    const coach2 = coachMap.get(match.coach2SeasonId);

    if (!coach1 || !coach2) continue;

    // Get Pokemon for each team
    let team1Pokemon = match.matchPokemon
      .filter((mp) => mp.seasonCoachId === match.coach1SeasonId)
      .map((mp) => ({
        name: mp.pokemon.displayName || mp.pokemon.name,
        kills: mp.kills || 0,
        deaths: mp.deaths || 0,
      }));

    let team2Pokemon = match.matchPokemon
      .filter((mp) => mp.seasonCoachId === match.coach2SeasonId)
      .map((mp) => ({
        name: mp.pokemon.displayName || mp.pokemon.name,
        kills: mp.kills || 0,
        deaths: mp.deaths || 0,
      }));

    // Handle forfeits: generate synthetic Abra entries based on differentials
    // Convention: Abra with kills = winner's differential, deaths = for the loser
    if (match.isForfeit && match.winnerId && team1Pokemon.length === 0 && team2Pokemon.length === 0) {
      const coach1IsWinner = match.winnerId === match.coach1SeasonId;
      // Use absolute value of the positive differential for kills/deaths (default to 3 if not set)
      const differential = Math.abs(coach1IsWinner
        ? (match.coach1Differential ?? 3)
        : (match.coach2Differential ?? 3));

      if (coach1IsWinner) {
        // Coach1 won: Abra with kills for coach1, Abra with deaths for coach2
        team1Pokemon = [{ name: "Abra", kills: differential, deaths: 0 }];
        team2Pokemon = [{ name: "Abra", kills: 0, deaths: differential }];
      } else {
        // Coach2 won: Abra with deaths for coach1, Abra with kills for coach2
        team1Pokemon = [{ name: "Abra", kills: 0, deaths: differential }];
        team2Pokemon = [{ name: "Abra", kills: differential, deaths: 0 }];
      }
    }

    matchDataList.push({
      matchId: match.id,
      week: match.week,
      winnerId: match.winnerId,
      isForfeit: match.isForfeit === true,
      coach1Differential: match.coach1Differential ?? 0,
      coach2Differential: match.coach2Differential ?? 0,
      replayUrl: match.replayUrl,
      team1Name: coach1.teamName,
      team2Name: coach2.teamName,
      team1SheetName: getSheetName(match.coach1SeasonId),
      team2SheetName: getSheetName(match.coach2SeasonId),
      team1SheetTab: getSheetTab(match.coach1SeasonId),
      team2SheetTab: getSheetTab(match.coach2SeasonId),
      team1SeasonCoachId: match.coach1SeasonId,
      team2SeasonCoachId: match.coach2SeasonId,
      team1ReplacedById: coach1.replacedById,
      team2ReplacedById: coach2.replacedById,
      team1Pokemon,
      team2Pokemon,
    });
  }

  return matchDataList;
}

/**
 * Sync match stats from database to Google Sheet
 * @param options.pokemonNameMapping - Pre-built mapping to avoid duplicate API call
 * @param options.skipSyncCheck - Skip isSyncEnabled check (caller already verified)
 */
export async function syncMatchStatsToSheet(
  spreadsheetId: string,
  divisionId: number,
  options?: {
    pokemonNameMapping?: Map<string, string>;
    skipSyncCheck?: boolean;
  }
): Promise<{ success: boolean; matchesUpdated: number; errors: string[] }> {
  const errors: string[] = [];
  let matchesUpdated = 0;

  try {
    // 0. Check if sync is enabled (unless caller already checked)
    if (!options?.skipSyncCheck) {
      const syncEnabled = await isSyncEnabled(spreadsheetId);
      if (!syncEnabled) {
        console.log("Sync is disabled in Config tab, skipping match stats sync");
        return { success: true, matchesUpdated: 0, errors: [] };
      }
    }

    const division = await db.query.divisions.findFirst({
      where: eq(divisions.id, divisionId),
      with: { season: true },
    });
    const seasonNumber = division?.season?.seasonNumber ?? 0;
    const seasonFormat = getSeasonFormat(seasonNumber);
    const fixturesPerWeek = seasonFormat.fixturesPerRegularWeek ?? LEGACY_FIXTURES_PER_WEEK;
    const regularSeasonWeeks = seasonFormat.regularSeasonWeeks ?? LEGACY_REGULAR_SEASON_WEEKS;

    // 1-3. Fetch data in parallel.
    console.log("Fetching fixture positions and match data...");
    const [pokemonNameMapping, fixturePositions, teamSheetTabMapping] = await Promise.all([
      options?.pokemonNameMapping
        ? Promise.resolve(options.pokemonNameMapping)
        : buildPokemonNameMapping(spreadsheetId, sheetNameMappingOptionsForSeason(seasonNumber)),
      getFixturePositions(spreadsheetId, fixturesPerWeek, regularSeasonWeeks),
      getTeamSheetTabMapping(spreadsheetId),
    ]);
    const matchDataList = await getDivisionMatches(divisionId, teamSheetTabMapping);

    console.log(`Loaded ${pokemonNameMapping.size} Pokemon mappings, ${fixturePositions.size} fixtures, ${matchDataList.length} matches`);

    // 4. Build batch updates
    const updates: { range: string; values: (string | number | null)[][] }[] =
      [];

    // Track which fixture keys have data in the database
    const fixturesWithData = new Set<string>();
    const teamSheetTabsByName = new Map<string, string>();
    for (const match of matchDataList) {
      if (match.team1SheetTab) {
        teamSheetTabsByName.set(match.team1SheetName.toLowerCase().trim(), match.team1SheetTab);
      }
      if (match.team2SheetTab) {
        teamSheetTabsByName.set(match.team2SheetName.toLowerCase().trim(), match.team2SheetTab);
      }
    }

    const queueTeamSheetResult = (sheetTab: string, result: string, week: number) => {
      if (!sheetTab || week < 1 || week > regularSeasonWeeks) return;
      const row = TEAM_SHEET_SCHEDULE_START_ROW + week - 1;
      const escapedTab = sheetTab.replace(/'/g, "''");
      updates.push({
        range: `'${escapedTab}'!${TEAM_SHEET_RESULT_COL}${row}`,
        values: [[result]],
      });
    };

    const queueTeamSheetResultFormula = (sheetTab: string, week: number) => {
      if (!sheetTab || week < 1 || week > regularSeasonWeeks) return;
      const row = TEAM_SHEET_SCHEDULE_START_ROW + week - 1;
      const escapedTab = sheetTab.replace(/'/g, "''");
      updates.push({
        range: `'${escapedTab}'!${TEAM_SHEET_RESULT_COL}${row}`,
        values: [[`=IFS(N${row}="", "", N${row}>0, "W", N${row}<0, "L")`]],
      });
    };

    for (const match of matchDataList) {
      // Find the fixture position using sheet-facing team names
      // (replacement team names are used in the sheet for all weeks)
      const key1 = `${match.week}:${[match.team1SheetName, match.team2SheetName].sort().join("|")}`;
      const position = fixturePositions.get(key1);

      // A winner or double loss marks the fixture as completed even when no
      // Pokemon rows were supplied. Double losses must reach Schedule Cutout
      // as L/L instead of being treated as an empty fixture.
      const isDoubleForfeit = isDoubleForfeitResult(match.winnerId, match.isForfeit);
      if (match.winnerId === null && !isDoubleForfeit && match.team1Pokemon.length === 0 && match.team2Pokemon.length === 0) {
        continue;
      }

      // Mark this fixture as having data
      fixturesWithData.add(key1);

      if (!position) {
        errors.push(
          `Fixture not found: Week ${match.week}, ${match.team1SheetName} vs ${match.team2SheetName}` +
          (match.team1Name !== match.team1SheetName || match.team2Name !== match.team2SheetName
            ? ` (DB: ${match.team1Name} vs ${match.team2Name})`
            : "")
        );
        continue;
      }

      // Determine if teams are in the correct order in the sheet
      const teamsReversed = position.team1Name !== match.team1SheetName;

      const sheetTeam1Pokemon = teamsReversed
        ? match.team2Pokemon
        : match.team1Pokemon;
      const sheetTeam2Pokemon = teamsReversed
        ? match.team1Pokemon
        : match.team2Pokemon;

      // The normal sheet formulas infer W/L from a non-zero differential.
      // Replace result and differential cells with the official website data
      // so a completed 0-0 fixture can remain 0-0 after a prior double FF was
      // synced into the same fixture.
      const resultRowNum = position.row + RESULT_ROW_OFFSET;
      const t1ResultCol = colIdxToLetter(position.col + T1_RESULT_OFFSET);
      const t2ResultCol = colIdxToLetter(position.col + T2_RESULT_OFFSET);
      if (match.winnerId !== null) {
        const sheetTeam1Won = teamsReversed
          ? match.winnerId === match.team2SeasonCoachId
          : match.winnerId === match.team1SeasonCoachId;
        const sheetTeam1Differential = teamsReversed
          ? match.coach2Differential
          : match.coach1Differential;
        const sheetTeam2Differential = teamsReversed
          ? match.coach1Differential
          : match.coach2Differential;
        const t1DifferentialCol = colIdxToLetter(position.col + T1_KILLS_OFFSET);
        const t2DifferentialCol = colIdxToLetter(position.col + T2_DEATHS_OFFSET);
        updates.push({
          range: `'Match Stats'!${t1DifferentialCol}${resultRowNum}`,
          values: [[sheetTeam1Differential]],
        });
        updates.push({
          range: `'Match Stats'!${t2DifferentialCol}${resultRowNum}`,
          values: [[sheetTeam2Differential]],
        });
        updates.push({
          range: `'Match Stats'!${t1ResultCol}${resultRowNum}`,
          values: [[sheetTeam1Won ? "W" : "L"]],
        });
        updates.push({
          range: `'Match Stats'!${t2ResultCol}${resultRowNum}`,
          values: [[sheetTeam1Won ? "L" : "W"]],
        });
        queueTeamSheetResult(
          match.team1SheetTab,
          match.winnerId === match.team1SeasonCoachId ? "W" : "L",
          match.week
        );
        queueTeamSheetResult(
          match.team2SheetTab,
          match.winnerId === match.team2SeasonCoachId ? "W" : "L",
          match.week
        );
      } else if (isDoubleForfeit) {
        updates.push({
          range: `'Match Stats'!${t1ResultCol}${resultRowNum}`,
          values: [["L"]],
        });
        updates.push({
          range: `'Match Stats'!${t2ResultCol}${resultRowNum}`,
          values: [["L"]],
        });

        // Team sheets derive wins, losses, differential, and GP from these
        // Match Stats differential cells. Write the official website values
        // for a double loss because there are no Pokemon rows to calculate
        // them from. Respect the sheet's displayed team order when a fixture
        // is reversed relative to the database.
        const sheetTeam1Differential = teamsReversed
          ? match.coach2Differential
          : match.coach1Differential;
        const sheetTeam2Differential = teamsReversed
          ? match.coach1Differential
          : match.coach2Differential;
        const t1DifferentialCol = colIdxToLetter(position.col + T1_KILLS_OFFSET);
        const t2DifferentialCol = colIdxToLetter(position.col + T2_DEATHS_OFFSET);
        updates.push({
          range: `'Match Stats'!${t1DifferentialCol}${resultRowNum}`,
          values: [[sheetTeam1Differential]],
        });
        updates.push({
          range: `'Match Stats'!${t2DifferentialCol}${resultRowNum}`,
          values: [[sheetTeam2Differential]],
        });
        queueTeamSheetResult(match.team1SheetTab, "L", match.week);
        queueTeamSheetResult(match.team2SheetTab, "L", match.week);
      }

      // Write Team 1 Pokemon data (cols C, D, E for Pokemon, Kills, Deaths)
      for (let i = 0; i < POKEMON_ROW_COUNT; i++) {
        const poke = sheetTeam1Pokemon[i];
        const rowNum = position.row + POKEMON_ROW_START + i;

        if (poke) {
          // Pokemon name
          const pokemonCol = colIdxToLetter(position.col + T1_POKEMON_OFFSET);
          updates.push({
            range: `'Match Stats'!${pokemonCol}${rowNum}`,
            values: [[convertPokemonName(poke.name, pokemonNameMapping)]],
          });

          // Kills
          const killsCol = colIdxToLetter(position.col + T1_KILLS_OFFSET);
          updates.push({
            range: `'Match Stats'!${killsCol}${rowNum}`,
            values: [[poke.kills]],
          });

          // Deaths
          const deathsCol = colIdxToLetter(position.col + T1_DEATHS_OFFSET);
          updates.push({
            range: `'Match Stats'!${deathsCol}${rowNum}`,
            values: [[poke.deaths]],
          });
        } else {
          // Clear empty slots
          const pokemonCol = colIdxToLetter(position.col + T1_POKEMON_OFFSET);
          const killsCol = colIdxToLetter(position.col + T1_KILLS_OFFSET);
          const deathsCol = colIdxToLetter(position.col + T1_DEATHS_OFFSET);
          updates.push({
            range: `'Match Stats'!${pokemonCol}${rowNum}`,
            values: [[""]],
          });
          updates.push({
            range: `'Match Stats'!${killsCol}${rowNum}`,
            values: [[""]],
          });
          updates.push({
            range: `'Match Stats'!${deathsCol}${rowNum}`,
            values: [[""]],
          });
        }
      }

      // Write Team 2 Pokemon data (cols G, H, I for Deaths, Kills, Pokemon)
      for (let i = 0; i < POKEMON_ROW_COUNT; i++) {
        const poke = sheetTeam2Pokemon[i];
        const rowNum = position.row + POKEMON_ROW_START + i;

        if (poke) {
          // Pokemon name
          const pokemonCol = colIdxToLetter(position.col + T2_POKEMON_OFFSET);
          updates.push({
            range: `'Match Stats'!${pokemonCol}${rowNum}`,
            values: [[convertPokemonName(poke.name, pokemonNameMapping)]],
          });

          // Kills
          const killsCol = colIdxToLetter(position.col + T2_KILLS_OFFSET);
          updates.push({
            range: `'Match Stats'!${killsCol}${rowNum}`,
            values: [[poke.kills]],
          });

          // Deaths
          const deathsCol = colIdxToLetter(position.col + T2_DEATHS_OFFSET);
          updates.push({
            range: `'Match Stats'!${deathsCol}${rowNum}`,
            values: [[poke.deaths]],
          });
        } else {
          // Clear empty slots
          const pokemonCol = colIdxToLetter(position.col + T2_POKEMON_OFFSET);
          const killsCol = colIdxToLetter(position.col + T2_KILLS_OFFSET);
          const deathsCol = colIdxToLetter(position.col + T2_DEATHS_OFFSET);
          updates.push({
            range: `'Match Stats'!${pokemonCol}${rowNum}`,
            values: [[""]],
          });
          updates.push({
            range: `'Match Stats'!${killsCol}${rowNum}`,
            values: [[""]],
          });
          updates.push({
            range: `'Match Stats'!${deathsCol}${rowNum}`,
            values: [[""]],
          });
        }
      }

      // Write replay link (row 9 from fixture start) as HYPERLINK formula
      if (match.replayUrl) {
        const replayRowNum = position.row + REPLAY_ROW_OFFSET;
        const replayCol = colIdxToLetter(position.col);
        updates.push({
          range: `'Match Stats'!${replayCol}${replayRowNum}`,
          values: [[`=HYPERLINK("${match.replayUrl}","Replay")`]],
        });
      }

      matchesUpdated++;
    }

    // 5. Clear fixtures that no longer have results in the database
    for (const [fixtureKey, position] of fixturePositions.entries()) {
      if (fixturesWithData.has(fixtureKey)) {
        continue; // This fixture has data, skip
      }

      // Clear all Pokemon slots for both teams
      for (let i = 0; i < POKEMON_ROW_COUNT; i++) {
        const rowNum = position.row + POKEMON_ROW_START + i;

        // Team 1 columns
        const t1PokemonCol = colIdxToLetter(position.col + T1_POKEMON_OFFSET);
        const t1KillsCol = colIdxToLetter(position.col + T1_KILLS_OFFSET);
        const t1DeathsCol = colIdxToLetter(position.col + T1_DEATHS_OFFSET);
        updates.push({ range: `'Match Stats'!${t1PokemonCol}${rowNum}`, values: [[""]] });
        updates.push({ range: `'Match Stats'!${t1KillsCol}${rowNum}`, values: [[""]] });
        updates.push({ range: `'Match Stats'!${t1DeathsCol}${rowNum}`, values: [[""]] });

        // Team 2 columns
        const t2PokemonCol = colIdxToLetter(position.col + T2_POKEMON_OFFSET);
        const t2KillsCol = colIdxToLetter(position.col + T2_KILLS_OFFSET);
        const t2DeathsCol = colIdxToLetter(position.col + T2_DEATHS_OFFSET);
        updates.push({ range: `'Match Stats'!${t2PokemonCol}${rowNum}`, values: [[""]] });
        updates.push({ range: `'Match Stats'!${t2KillsCol}${rowNum}`, values: [[""]] });
        updates.push({ range: `'Match Stats'!${t2DeathsCol}${rowNum}`, values: [[""]] });
      }

      // Clear replay link
      const replayRowNum = position.row + REPLAY_ROW_OFFSET;
      const replayCol = colIdxToLetter(position.col);
      updates.push({ range: `'Match Stats'!${replayCol}${replayRowNum}`, values: [[""]] });

      // Restore the template result formulas when a result is removed. This
      // keeps the fixture ready for a future result and avoids stale W/L text.
      const resultRowNum = position.row + RESULT_ROW_OFFSET;
      const t1ResultCol = colIdxToLetter(position.col + T1_RESULT_OFFSET);
      const t1DiffCol = colIdxToLetter(position.col + T1_KILLS_OFFSET);
      const t1DeathsCol = colIdxToLetter(position.col + T1_DEATHS_OFFSET);
      const t2ResultCol = colIdxToLetter(position.col + T2_POKEMON_OFFSET);
      const t2DiffCol = colIdxToLetter(position.col + T2_DEATHS_OFFSET);
      const t2PokemonCheckRow = position.row + POKEMON_ROW_START + 1;
      updates.push({
        range: `'Match Stats'!${t1DiffCol}${resultRowNum}`,
        values: [[`=IF(ISBLANK(${t1ResultCol}${t2PokemonCheckRow})=TRUE, "", ${t2DiffCol}${position.row}-${t1DeathsCol}${position.row})`]],
      });
      updates.push({
        range: `'Match Stats'!${t2DiffCol}${resultRowNum}`,
        values: [[`=IF(ISBLANK(${t2ResultCol}${t2PokemonCheckRow})=TRUE, "", ${t1DeathsCol}${position.row}-${t2DiffCol}${position.row})`]],
      });
      updates.push({
        range: `'Match Stats'!${t1ResultCol}${resultRowNum}`,
        values: [[`=IFS(${t1DiffCol}${resultRowNum}=0, "", ${t1DiffCol}${resultRowNum}="", "", ${t1DiffCol}${resultRowNum}>0, "W", ${t1DiffCol}${resultRowNum}<0, "L")`]],
      });
      updates.push({
        range: `'Match Stats'!${t2ResultCol}${resultRowNum}`,
        values: [[`=IFS(${t2DiffCol}${resultRowNum}=0, "", ${t2DiffCol}${resultRowNum}="", "", ${t2DiffCol}${resultRowNum}>0, "W", ${t2DiffCol}${resultRowNum}<0, "L")`]],
      });

      queueTeamSheetResultFormula(
        teamSheetTabsByName.get(position.team1Name.toLowerCase().trim()) || "",
        position.week
      );
      queueTeamSheetResultFormula(
        teamSheetTabsByName.get(position.team2Name.toLowerCase().trim()) || "",
        position.week
      );
    }

    // 6. Execute batch update
    if (updates.length > 0) {
      console.log(`Executing ${updates.length} range updates...`);
      await batchWriteToSheet(spreadsheetId, updates);
    }

    return { success: true, matchesUpdated, errors };
  } catch (error) {
    console.error("Error syncing match stats:", error);
    return {
      success: false,
      matchesUpdated,
      errors: [...errors, String(error)],
    };
  }
}
