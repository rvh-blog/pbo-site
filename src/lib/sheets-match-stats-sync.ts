import { readSheetRange, batchWriteToSheet, isSyncEnabled } from "./sheets-sync";
import { db } from "@/lib/db";
import {
  seasonCoaches,
  matches,
  divisions,
} from "@/lib/schema";
import { eq } from "drizzle-orm";

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
const S11_FIXTURES_PER_WEEK = 8;

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
const REPLAY_ROW_OFFSET = 9;

interface MatchData {
  matchId: number;
  week: number;
  replayUrl: string | null;
  team1Name: string;
  team2Name: string;
  team1SheetName: string; // Name used in sheet (replacement name if coach was replaced)
  team2SheetName: string;
  team1SeasonCoachId: number;
  team2SeasonCoachId: number;
  team1ReplacedById: number | null;
  team2ReplacedById: number | null;
  team1Pokemon: { name: string; kills: number; deaths: number }[];
  team2Pokemon: { name: string; kills: number; deaths: number }[];
}

interface SheetFixturePosition {
  row: number; // 1-indexed row of fixture start
  col: number; // 0-indexed column of week start
  team1Name: string;
  team2Name: string;
}

/**
 * Build a mapping from DB Pokemon names to Sheet display names
 * by reading the Pokédex sheet (same as roster sync)
 */
async function buildPokemonNameMapping(
  spreadsheetId: string
): Promise<Map<string, string>> {
  const mapping = new Map<string, string>();

  const pokedexData = await readSheetRange(spreadsheetId, "Pokédex!A1:T1500");
  if (!pokedexData) return mapping;

  for (let i = 1; i < pokedexData.length; i++) {
    const row = pokedexData[i];
    if (!row) continue;

    const smogonName = String(row[9] || ""); // Column J - Smogon Name
    const displayName = String(row[18] || ""); // Column S - Pokémon (display name)

    if (smogonName && displayName && displayName !== "-") {
      mapping.set(smogonName.toLowerCase(), displayName);
    }
  }

  // Manual mappings (same as roster sync)
  const manualMappings: Record<string, string> = {
    // Ogerpon forms
    "Ogerpon-Teal": "Ogerpon-T",
    "Ogerpon-Wellspring": "Ogerpon-W",
    "Ogerpon-Hearthflame": "Ogerpon-H",
    "Ogerpon-Cornerstone": "Ogerpon-C",
    // Thundurus/Tornadus/Landorus/Enamorus - base form is just the name
    "Thundurus-Incarnate": "Thundurus",
    "Tornadus-Incarnate": "Tornadus",
    "Landorus-Incarnate": "Landorus",
    "Enamorus-Incarnate": "Enamorus",
    // Ursaluna forms - sheet has same smogon name for both, so we need explicit mappings
    "Ursaluna": "Ursaluna",
    "Ursaluna-Bloodmoon": "Ursaluna-BM",
    // Mimikyu - sheet uses base name without form suffix
    "Mimikyu-Disguised": "Mimikyu",
    "Mimikyu-Busted": "Mimikyu",
    // Regional forms - our format vs sheet format
    "Slowking-Galar": "Galarian Slowking",
    "Slowbro-Galar": "Galarian Slowbro",
    "Articuno-Galar": "Galarian Articuno",
    "Zapdos-Galar": "Galarian Zapdos",
    "Moltres-Galar": "Galarian Moltres",
    "Exeggutor-Alola": "Alolan Exeggutor",
    "Ninetales-Alola": "Alolan Ninetales",
    "Muk-Alola": "Alolan Muk",
    "Raichu-Alola": "Alolan Raichu",
    "Sandslash-Alola": "Alolan Sandslash",
    "Marowak-Alola": "Alolan Marowak",
    "Samurott-Hisui": "Hisuian Samurott",
    "Arcanine-Hisui": "Hisuian Arcanine",
    "Typhlosion-Hisui": "Hisuian Typhlosion",
    "Lilligant-Hisui": "Hisuian Lilligant",
    "Zoroark-Hisui": "Hisuian Zoroark",
    "Braviary-Hisui": "Hisuian Braviary",
    "Goodra-Hisui": "Hisuian Goodra",
    "Decidueye-Hisui": "Hisuian Decidueye",
    "Electrode-Hisui": "Hisuian Electrode",
    "Voltorb-Hisui": "Hisuian Voltorb",
    "Qwilfish-Hisui": "Hisuian Qwilfish",
    "Sneasel-Hisui": "Hisuian Sneasel",
    "Avalugg-Hisui": "Hisuian Avalugg",
    "Sliggoo-Hisui": "Hisuian Sliggoo",
    "Growlithe-Hisui": "Hisuian Growlithe",
    // Paldean forms
    "Tauros-Paldea-Combat": "Paldean Tauros",
    "Tauros-Paldea-Blaze": "Paldean Tauros (Fire)",
    "Tauros-Paldea-Aqua": "Paldean Tauros (Water)",
    "Wooper-Paldea": "Paldean Wooper",
    // More Galarian forms
    "Weezing-Galar": "Galarian Weezing",
    "Mr. Mime-Galar": "Galarian Mr. Mime",
    "Rapidash-Galar": "Galarian Rapidash",
    "Ponyta-Galar": "Galarian Ponyta",
    "Corsola-Galar": "Galarian Corsola",
    "Darmanitan-Galar": "Galarian Darmanitan",
    "Darmanitan-Galar-Zen": "Galarian Darmanitan-Zen",
    "Stunfisk-Galar": "Galarian Stunfisk",
    "Yamask-Galar": "Galarian Yamask",
    "Linoone-Galar": "Galarian Linoone",
    "Zigzagoon-Galar": "Galarian Zigzagoon",
    "Meowth-Galar": "Galarian Meowth",
    "Farfetch'd-Galar": "Galarian Farfetch'd",
    // More Alolan forms
    "Rattata-Alola": "Alolan Rattata",
    "Raticate-Alola": "Alolan Raticate",
    "Vulpix-Alola": "Alolan Vulpix",
    "Sandshrew-Alola": "Alolan Sandshrew",
    "Diglett-Alola": "Alolan Diglett",
    "Dugtrio-Alola": "Alolan Dugtrio",
    "Meowth-Alola": "Alolan Meowth",
    "Persian-Alola": "Alolan Persian",
    "Geodude-Alola": "Alolan Geodude",
    "Graveler-Alola": "Alolan Graveler",
    "Golem-Alola": "Alolan Golem",
    "Grimer-Alola": "Alolan Grimer",
    // Basculin forms
    "Basculin-Red-Striped": "Basculin",
    "Basculin-Blue-Striped": "Basculin-White-Striped",
    // Lycanroc forms
    "Lycanroc-Midday": "Lycanroc-Midday",
    "Lycanroc-Midnight": "Lycanroc-Midnight",
    "Lycanroc-Dusk": "Lycanroc-Dusk",
    // Indeedee
    "Indeedee-Male": "Indeedee",
    "Indeedee-Female": "Indeedee-F",
    // Meowstic
    "Meowstic-Male": "Meowstic",
    "Meowstic-Female": "Meowstic-Female",
    // Giratina
    "Giratina-Altered": "Giratina-Altered",
    "Giratina-Origin": "Giratina-Origin",
    // Urshifu - sheet uses full form names
    "Urshifu-Single-Strike": "Urshifu-Single-Strike",
    "Urshifu-Rapid-Strike": "Urshifu-Rapid-Strike",
    // Zygarde
    "Zygarde-50%": "Zygarde-50%",
    "Zygarde-10%": "Zygarde-10%",
    "Zygarde-Complete": "Zygarde-Complete",
    // Wormadam
    "Wormadam-Plant": "Wormadam-Plant",
    "Wormadam-Sandy": "Wormadam-Sandy",
    "Wormadam-Trash": "Wormadam-Trash",
    // Rotom forms
    "Rotom-Heat": "Rotom-Heat",
    "Rotom-Wash": "Rotom-Wash",
    "Rotom-Frost": "Rotom-Frost",
    "Rotom-Fan": "Rotom-Fan",
    "Rotom-Mow": "Rotom-Mow",
    // Deoxys
    "Deoxys-Normal": "Deoxys",
    "Deoxys-Attack": "Deoxys-Attack",
    "Deoxys-Defense": "Deoxys-Defense",
    "Deoxys-Speed": "Deoxys-Speed",
    // Shaymin
    "Shaymin-Land": "Shaymin",
    "Shaymin-Sky": "Shaymin-Sky",
    // Kyurem
    "Kyurem-Black": "Kyurem-Black",
    "Kyurem-White": "Kyurem-White",
    // Necrozma
    "Necrozma-Dusk-Mane": "Necrozma-Dusk-Mane",
    "Necrozma-Dawn-Wings": "Necrozma-Dawn-Wings",
    // Calyrex
    "Calyrex-Ice-Rider": "Calyrex-Ice",
    "Calyrex-Shadow-Rider": "Calyrex-Shadow",
    // Aegislash - sheet uses base form
    "Aegislash-Shield": "Aegislash",
    "Aegislash-Blade": "Aegislash-Blade",
    // Terapagos - base form in Pokedex maps to "Pagogo" but we want "Terapagos"
    "Terapagos": "Terapagos",
    "Terapagos-Terastal": "Terapagos",
    "Terapagos-Stellar": "Terapagos-Stellar",
  };

  for (const [dbName, sheetName] of Object.entries(manualMappings)) {
    mapping.set(dbName.toLowerCase(), sheetName);
  }

  return mapping;
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
  fixturesPerWeek: number
): Promise<Map<string, SheetFixturePosition>> {
  const positions = new Map<string, SheetFixturePosition>();

  // Read the Match Stats sheet - need enough range to cover all weeks and fixtures
  // 8 weeks * 14 cols = 112 cols. S11+ can use 8 fixtures (16 teams);
  // legacy seasons keep the 7-fixture template.
  const fixtureRangeEndRow = fixturesPerWeek >= S11_FIXTURES_PER_WEEK ? 110 : 100;
  const data = await readSheetRange(spreadsheetId, `Match Stats!A1:DZ${fixtureRangeEndRow}`);
  if (!data) return positions;

  // Iterate through each week and fixture
  for (let week = 1; week <= 8; week++) {
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
async function getDivisionMatches(divisionId: number): Promise<MatchData[]> {
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
      replayUrl: match.replayUrl,
      team1Name: coach1.teamName,
      team2Name: coach2.teamName,
      team1SheetName: getSheetName(match.coach1SeasonId),
      team2SheetName: getSheetName(match.coach2SeasonId),
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
    const fixturesPerWeek = seasonNumber >= 11 ? S11_FIXTURES_PER_WEEK : LEGACY_FIXTURES_PER_WEEK;

    // 1-3. Fetch data (use pre-built mapping if provided)
    console.log("Fetching fixture positions and match data...");
    const [pokemonNameMapping, fixturePositions, matchDataList] = await Promise.all([
      options?.pokemonNameMapping
        ? Promise.resolve(options.pokemonNameMapping)
        : buildPokemonNameMapping(spreadsheetId),
      getFixturePositions(spreadsheetId, fixturesPerWeek),
      getDivisionMatches(divisionId),
    ]);
    console.log(`Loaded ${pokemonNameMapping.size} Pokemon mappings, ${fixturePositions.size} fixtures, ${matchDataList.length} matches`);

    // 4. Build batch updates
    const updates: { range: string; values: (string | number | null)[][] }[] =
      [];

    // Track which fixture keys have data in the database
    const fixturesWithData = new Set<string>();

    for (const match of matchDataList) {
      // Find the fixture position using sheet-facing team names
      // (replacement team names are used in the sheet for all weeks)
      const key1 = `${match.week}:${[match.team1SheetName, match.team2SheetName].sort().join("|")}`;
      const position = fixturePositions.get(key1);

      // Skip matches that have no pokemon data (not played yet)
      if (match.team1Pokemon.length === 0 && match.team2Pokemon.length === 0) {
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
