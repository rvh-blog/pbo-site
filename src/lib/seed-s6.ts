import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and } from "drizzle-orm";
import * as schema from "./schema";
import * as fs from "fs";

const sqlite = new Database("./data/pbo.db");

// Proper CSV parser that handles quoted fields with newlines
function parseCSV(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        // Escaped quote
        currentField += '"';
        i++;
      } else if (char === '"') {
        // End of quoted field
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        // Start of quoted field
        inQuotes = true;
      } else if (char === ',') {
        // Field separator
        currentRow.push(currentField);
        currentField = "";
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        // Row separator
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
        if (char === '\r') i++; // Skip \n after \r
      } else if (char !== '\r') {
        currentField += char;
      }
    }
  }

  // Handle last field/row
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}
const db = drizzle(sqlite, { schema });

const S6_BUDGET = 1100;
const DIVISIONS = ["Stargazer", "Sunset", "Neon"];
const SEASON_NUMBER = 6;
const SEASON_NAME = "Season 6";

// Pokemon name normalization
function normalizePokeNameForDB(name: string): string {
  const mappings: Record<string, string> = {
    // Iron Pokemon
    "iron moth": "iron-moth",
    "iron valiant": "iron-valiant",
    "iron treads": "iron-treads",
    "iron bundle": "iron-bundle",
    "iron jugulis": "iron-jugulis",
    "iron hands": "iron-hands",
    "iron crown": "iron-crown",
    "iron boulder": "iron-boulder",
    "iron thorns": "iron-thorns",
    "iron leaves": "iron-leaves",
    // Galarian forms
    "galarian zapdos": "zapdos-galar",
    "galarian moltres": "moltres-galar",
    "galarian slowking": "slowking-galar",
    "galarian slowbro": "slowbro-galar",
    "galarian weezing": "weezing-galar",
    "galarian articuno": "articuno-galar",
    "zapdos-galar": "zapdos-galar",
    "moltres-galar": "moltres-galar",
    "slowking-galar": "slowking-galar",
    "weezing-galar": "weezing-galar",
    "articuno-galar": "articuno-galar",
    // Alolan forms
    "alolan muk": "muk-alola",
    "alolan ninetales": "ninetales-alola",
    "muk-alola": "muk-alola",
    "ninetales-alola": "ninetales-alola",
    "sandslash-alola": "sandslash-alola",
    "exeggutor-alola": "exeggutor-alola",
    "raichu-alola": "raichu-alola",
    "persian-alola": "persian-alola",
    "electrode-hisui": "electrode-hisui",
    // Hisuian forms
    "samurott-hisui": "samurott-hisui",
    "qwilfish-hisui": "qwilfish-hisui",
    "zoroark-hisui": "zoroark-hisui",
    "goodra-hisui": "goodra-hisui",
    "arcanine-hisui": "arcanine-hisui",
    "decidueye-hisui": "decidueye-hisui",
    "braviary-hisui": "braviary-hisui",
    "lilligant-hisui": "lilligant-hisui",
    "typhlosion-hisui": "typhlosion-hisui",
    "sneasel-hisui": "sneasel-hisui",
    "avalugg-hisui": "avalugg-hisui",
    "sliggoo-hisui": "sliggoo-hisui",
    // Ogerpon forms
    "ogerpon": "ogerpon",
    "ogerpon-teal": "ogerpon",
    "ogerpon-wellspring": "ogerpon-wellspring-mask",
    "ogerpon-hearthflame": "ogerpon-hearthflame-mask",
    "ogerpon-cornerstone": "ogerpon-cornerstone-mask",
    // Incarnate/Therian forms
    "tornadus-therian": "tornadus-therian",
    "landorus-therian": "landorus-therian",
    "thundurus-therian": "thundurus-therian",
    "enamorus-therian": "enamorus-therian",
    "landorus": "landorus-incarnate",
    "thundurus": "thundurus-incarnate",
    "tornadus": "tornadus-incarnate",
    "enamorus": "enamorus-incarnate",
    // Bloodmoon
    "ursaluna-bloodmoon": "ursaluna-bloodmoon",
    // Lycanroc forms
    "lycanroc-dusk": "lycanroc-dusk",
    "lycanroc-midday": "lycanroc-midday",
    "lycanroc-midnight": "lycanroc-midnight",
    "lycanroc": "lycanroc-midday",
    // Deoxys forms
    "deoxys-speed": "deoxys-speed",
    "deoxys-defense": "deoxys-defense",
    "deoxys-attack": "deoxys-attack",
    // Rotom forms
    "rotom-mow": "rotom-mow",
    "rotom-heat": "rotom-heat",
    "rotom-wash": "rotom-wash",
    "rotom-frost": "rotom-frost",
    "rotom-fan": "rotom-fan",
    // Paldean forms
    "tauros-paldea": "tauros-paldea-combat-breed",
    "tauros-paldea-fire": "tauros-paldea-blaze-breed",
    "tauros-paldea-water": "tauros-paldea-aqua-breed",
    // Paradox Pokemon
    "gouging fire": "gouging-fire",
    "raging bolt": "raging-bolt",
    "great tusk": "great-tusk",
    "sandy shocks": "sandy-shocks",
    "roaring moon": "roaring-moon",
    "walking wake": "walking-wake",
    "scream tail": "scream-tail",
    "flutter mane": "flutter-mane",
    "brute bonnet": "brute-bonnet",
    "slither wing": "slither-wing",
    // Other forms
    "keldeo": "keldeo-ordinary",
    "meloetta": "meloetta-aria",
    "palafin": "palafin-hero",
    "basculegion": "basculegion-male",
    "hoopa": "hoopa-confined",
    "hoopa-unbound": "hoopa-unbound",
    "shaymin": "shaymin-land",
    "toxtricity": "toxtricity-amped",
    "meowstic": "meowstic-male",
    "dudunsparce": "dudunsparce-two-segment",
    "squawkabilly": "squawkabilly-blue-plumage",
    "indeedee": "indeedee-male",
    "oinkologne": "oinkologne-male",
    "maushold": "maushold-family-of-four",
    "tatsugiri": "tatsugiri-curly",
    "mimikyu": "mimikyu-disguised",
    "aegislash": "aegislash-shield",
    "oricorio-baile": "oricorio-baile",
    "oricorio-pom-pom": "oricorio-pom-pom",
    "oricorio-pa'u": "oricorio-pau",
    "oricorio-sensu": "oricorio-sensu",
    "wormadam": "wormadam-plant",
    "minior": "minior-red-meteor",
    "terapagos": "terapagos",
    "zorua-hisui": "zorua-hisui",
  };

  const lower = name.toLowerCase().trim();
  return mappings[lower] || lower.replace(/ /g, "-");
}

interface TeamData {
  teamName: string;
  abbreviation: string;
  coachName: string;
  pokemon: { name: string; price: number; isTeraCaptain: boolean }[];
  remainingBudget: number;
}

interface MatchData {
  week: number;
  team1Name: string;
  team2Name: string;
  team1Diff: number;
  team2Diff: number;
  winner: "team1" | "team2" | null;
  team1Pokemon: { name: string; kills: number; deaths: number }[];
  team2Pokemon: { name: string; kills: number; deaths: number }[];
}

interface PokemonMatchStat {
  name: string;
  kills: number;
  deaths: number;
}

interface TeamWeekResult {
  teamName: string;
  result: "W" | "L" | null;
  differential: number;
  killedPokemon: string[]; // Opponent's Pokemon that were killed
  pokemonStats: PokemonMatchStat[]; // Pokemon brought to this match with K/D
}

// Known coach mappings for teams with missing data
const MISSING_COACH_MAPPINGS: Record<string, string> = {
  "Caborca Gengars": "holiss77",
};

// Parse S6 Rosters CSV format
function parseRostersCSV(divisionName: string): TeamData[] {
  const fileMap: Record<string, string> = {
    "Stargazer": "./data/S6/PBO Stargazer Doc S6 - Rosters.csv",
    "Sunset": "./data/S6/PBO Sunset Doc S6 - Rosters.csv",
    "Neon": "./data/S6/PBO Neon Doc S6  - Rosters.csv",
  };

  const filePath = fileMap[divisionName];
  if (!filePath || !fs.existsSync(filePath)) {
    console.error(`Rosters file not found for ${divisionName}`);
    return [];
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = parseCSV(content);

  const teams: TeamData[] = [];

  // Find team header rows dynamically (rows with team name in col 3 and "Pokemon" in col 5)
  // Left team: name at col 3, pokemon at col 5, price at col 9
  // Right team: name at col 25, pokemon at col 27, price at col 31
  const teamStartRows: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const row = lines[i];
    if (row && row[3]?.trim() && row[5]?.trim() === "Pokemon") {
      teamStartRows.push(i);
    }
  }
  console.log(`  Found ${teamStartRows.length} team blocks at rows: ${teamStartRows.join(", ")}`);

  interface TeamConfig {
    nameCol: number;
    pokeCol: number;
    priceCol: number;
    taCol: number;
    sdCol: number;
    tcCols: number[]; // Columns containing tera types (3 cols after price)
  }

  // Left team: price at col 9, tera types at cols 10-12
  // Right team: price at col 31, tera types at cols 32-34
  const leftTeam: TeamConfig = { nameCol: 3, pokeCol: 5, priceCol: 9, taCol: 3, sdCol: 3, tcCols: [10, 11, 12] };
  const rightTeam: TeamConfig = { nameCol: 25, pokeCol: 27, priceCol: 31, taCol: 25, sdCol: 25, tcCols: [32, 33, 34] };

  for (const startRow of teamStartRows) {
    // Process both left and right teams
    for (const config of [leftTeam, rightTeam]) {
      const teamRow = lines[startRow];
      if (!teamRow) continue;

      // Team name
      const teamName = teamRow[config.nameCol]?.trim();
      if (!teamName || teamName === "") continue;

      // Find TA and SD in rows startRow+1 to startRow+10
      let abbreviation = "";
      let coachName = "";

      for (let i = 1; i <= 10; i++) {
        const row = lines[startRow + i];
        if (!row) continue;

        if (row[config.taCol]?.trim() === "TA") {
          abbreviation = row[config.taCol + 1]?.trim() || "";
        }
        if (row[config.sdCol]?.trim() === "SD") {
          let rawCoach = row[config.sdCol + 1]?.trim() || "";
          // Clean up coach name (remove quotes, newlines, extra whitespace)
          rawCoach = rawCoach.replace(/^["']|["']$/g, "").replace(/[\n\r]/g, " ").trim();
          if (rawCoach) {
            coachName = rawCoach;
          }
        }
      }

      if (!coachName) {
        // Check for known missing coach mappings
        if (MISSING_COACH_MAPPINGS[teamName]) {
          coachName = MISSING_COACH_MAPPINGS[teamName];
          console.log(`  Using fallback coach for ${teamName}: ${coachName}`);
        } else {
          console.log(`  Skipping ${teamName} - no coach found`);
          continue;
        }
      }

      // Clean up coach name one more time
      coachName = coachName.replace(/^["']|["']$/g, "").trim();

      // Parse Pokemon from rows startRow+1 to startRow+12
      const pokemon: TeamData["pokemon"] = [];
      for (let i = 1; i <= 12; i++) {
        const row = lines[startRow + i];
        if (!row) continue;

        const pokeName = row[config.pokeCol]?.trim();
        const priceStr = row[config.priceCol]?.trim();

        if (!pokeName || pokeName === "" || pokeName === "Points Left:") continue;
        if (pokeName === "Pokemon") continue; // Skip header if seen again

        const price = parseInt(priceStr || "0") || 0;
        if (price > 0 && pokeName.length > 1) {
          // Check for Tera Captain - has tera types in tcCols
          const teraTypes = config.tcCols
            .map(col => row[col]?.trim() || "")
            .filter(t => t && !t.match(/^\d+$/) && t.length > 1);
          const isTeraCaptain = teraTypes.length > 0;

          pokemon.push({ name: pokeName, price, isTeraCaptain });
        }
      }

      // Find remaining budget (Points Left row)
      let remainingBudget = 0;
      for (let i = 10; i <= 15; i++) {
        const row = lines[startRow + i];
        if (!row) continue;
        if (row[config.pokeCol]?.trim() === "Points Left:") {
          remainingBudget = parseInt(row[config.priceCol]?.trim() || "0") || 0;
          break;
        }
      }

      if (pokemon.length > 0) {
        teams.push({
          teamName,
          abbreviation,
          coachName,
          pokemon,
          remainingBudget,
        });
        console.log(`  Parsed team: ${teamName} (${coachName}) - ${pokemon.length} Pokemon`);
      }
    }
  }

  return teams;
}

// Parse S6 Draft Board for Pokemon prices
function parseDraftBoardCSV(): Map<string, number> {
  const filePath = "./data/S6/PBO Stargazer Doc S6 - Draft Board (No Sprites).csv";
  if (!fs.existsSync(filePath)) {
    console.error("Draft Board file not found");
    return new Map();
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = parseCSV(content);

  const prices = new Map<string, number>();

  // Row 2 has tier headers at cols: 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 57, 62, 67, 72, 77, 82, 87, 92
  // Pokemon name is at header_col + 1, team abbr at header_col + 2
  const tierCols: { priceCol: number; pokeCol: number; price: number }[] = [
    { priceCol: 7, pokeCol: 8, price: 180 },
    { priceCol: 12, pokeCol: 13, price: 170 },
    { priceCol: 17, pokeCol: 18, price: 160 },
    { priceCol: 22, pokeCol: 23, price: 150 },
    { priceCol: 27, pokeCol: 28, price: 140 },
    { priceCol: 32, pokeCol: 33, price: 130 },
    { priceCol: 37, pokeCol: 38, price: 120 },
    { priceCol: 42, pokeCol: 43, price: 110 },
    { priceCol: 47, pokeCol: 48, price: 100 },
    { priceCol: 52, pokeCol: 53, price: 90 },
    { priceCol: 57, pokeCol: 58, price: 80 },
    { priceCol: 62, pokeCol: 63, price: 70 },
    { priceCol: 67, pokeCol: 68, price: 60 },
    { priceCol: 72, pokeCol: 73, price: 50 },
    { priceCol: 77, pokeCol: 78, price: 40 },
    { priceCol: 82, pokeCol: 83, price: 30 },
    { priceCol: 87, pokeCol: 88, price: 20 },
    { priceCol: 92, pokeCol: 93, price: 10 },
  ];

  console.log(`Using ${tierCols.length} tier columns`);

  // Parse Pokemon from rows 3+
  for (let rowIdx = 3; rowIdx < lines.length; rowIdx++) {
    const row = lines[rowIdx];
    if (!row) continue;

    for (const tier of tierCols) {
      const pokeName = row[tier.pokeCol]?.trim();
      if (!pokeName || pokeName === "" || pokeName === "#N/A") continue;
      if (pokeName.length < 3) continue; // Skip short entries

      const normalizedName = normalizePokeNameForDB(pokeName);
      if (!prices.has(normalizedName)) {
        prices.set(normalizedName, tier.price);
      }
    }
  }

  return prices;
}

// Parse Match Stats to get weekly results
function parseMatchStatsCSV(divisionName: string): Map<string, TeamWeekResult[]> {
  const fileMap: Record<string, string> = {
    "Stargazer": "./data/S6/PBO Stargazer Doc S6 - Match Stats.csv",
    "Sunset": "./data/S6/PBO Sunset Doc S6 - Match Stats.csv",
    "Neon": "./data/S6/PBO Neon Doc S6  - Match Stats.csv",
  };

  const filePath = fileMap[divisionName];
  if (!filePath || !fs.existsSync(filePath)) {
    return new Map();
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = parseCSV(content);

  const teamResults = new Map<string, TeamWeekResult[]>();

  // Teams start at rows 3, 11, 19, 27... (every 8 rows starting at 3)
  // Each team block is 8 rows
  const teamStartRows: number[] = [];
  for (let i = 3; i < 120; i += 8) {
    teamStartRows.push(i);
  }

  // Week columns:
  // Result at col 3 + (N-1)*10, diff at col 4 + (N-1)*10
  // Brought at col 5 + (N-1)*10, K at col 9 + (N-1)*10, D at col 11 + (N-1)*10
  const getWeekCols = (weekNum: number) => ({
    resultCol: 3 + (weekNum - 1) * 10,
    diffCol: 4 + (weekNum - 1) * 10,
    broughtCol: 5 + (weekNum - 1) * 10,
    killsCol: 9 + (weekNum - 1) * 10,
    deathsCol: 11 + (weekNum - 1) * 10,
  });

  for (const startRow of teamStartRows) {
    const teamHeaderRow = lines[startRow];
    if (!teamHeaderRow) continue;

    // Team name is at column 3
    const teamName = teamHeaderRow[3]?.trim();
    if (!teamName || teamName === "" || teamName === "Brought") continue;

    const weeklyResults: TeamWeekResult[] = [];

    // Result row is at startRow + 6 (the row with Win/Lose)
    const resultRow = lines[startRow + 6];
    if (!resultRow) continue;

    for (let week = 1; week <= 8; week++) {
      const { resultCol, diffCol, broughtCol, killsCol, deathsCol } = getWeekCols(week);
      const resultStr = resultRow[resultCol]?.trim();

      if (!resultStr || resultStr === "" || resultStr === "0") {
        weeklyResults.push({
          teamName,
          result: null,
          differential: 0,
          killedPokemon: [],
          pokemonStats: [],
        });
        continue;
      }

      const isWin = resultStr === "Win";
      const isLoss = resultStr === "Lose";

      // Differential is in next column
      const diffStr = resultRow[diffCol]?.trim();
      const differential = parseInt(diffStr?.replace(/[^\d-]/g, "") || "0") || 0;

      // Collect killed Pokemon and Pokemon stats from rows startRow+1 to startRow+6
      const killedPokemon: string[] = [];
      const pokemonStats: PokemonMatchStat[] = [];

      for (let pokeRow = 1; pokeRow <= 6; pokeRow++) {
        const row = lines[startRow + pokeRow];
        if (!row) continue;

        // "Killed" column is at diffCol + 3 (position of "Killed" header)
        const killedName = row[diffCol + 3]?.trim();
        if (killedName && killedName !== "" && killedName.length > 2) {
          killedPokemon.push(killedName);
        }

        // Pokemon brought with K/D stats
        const pokeName = row[broughtCol]?.trim();
        const killsStr = row[killsCol]?.trim();
        const deathsStr = row[deathsCol]?.trim();

        if (pokeName && pokeName.length > 2) {
          const kills = parseInt(killsStr || "0") || 0;
          const deaths = parseInt(deathsStr || "0") || 0;
          pokemonStats.push({ name: pokeName, kills, deaths });
        }
      }

      weeklyResults.push({
        teamName,
        result: isWin ? "W" : isLoss ? "L" : null,
        differential,
        killedPokemon,
        pokemonStats,
      });
    }

    teamResults.set(teamName, weeklyResults);
  }

  return teamResults;
}

// Reconstruct matches from team results
function reconstructMatches(
  teamResults: Map<string, TeamWeekResult[]>,
  teamRosters: Map<string, string[]>
): MatchData[] {
  const matches: MatchData[] = [];
  const teams = Array.from(teamResults.keys());
  const matchedPairs = new Set<string>();

  for (let week = 0; week < 8; week++) {
    for (let i = 0; i < teams.length; i++) {
      const team1 = teams[i];
      const team1Results = teamResults.get(team1);
      if (!team1Results || !team1Results[week]) continue;

      const team1Week = team1Results[week];
      if (!team1Week.result) continue;

      // Find opponent by matching differential
      for (let j = i + 1; j < teams.length; j++) {
        const team2 = teams[j];
        const pairKey = `${week}-${team1}-${team2}`;
        if (matchedPairs.has(pairKey)) continue;

        const team2Results = teamResults.get(team2);
        if (!team2Results || !team2Results[week]) continue;

        const team2Week = team2Results[week];
        if (!team2Week.result) continue;

        // Check if differentials are opposite
        const diffMatch =
          (team1Week.result === "W" && team2Week.result === "L" && team1Week.differential === -team2Week.differential) ||
          (team1Week.result === "L" && team2Week.result === "W" && team1Week.differential === -team2Week.differential);

        if (diffMatch) {
          matchedPairs.add(pairKey);

          const winner = team1Week.result === "W" ? "team1" : "team2";

          matches.push({
            week: week + 1,
            team1Name: team1,
            team2Name: team2,
            team1Diff: team1Week.differential,
            team2Diff: team2Week.differential,
            winner,
            team1Pokemon: team1Week.pokemonStats,
            team2Pokemon: team2Week.pokemonStats,
          });

          break;
        }
      }
    }
  }

  return matches;
}

async function seedS6() {
  console.log(`\n========================================`);
  console.log(`Seeding ${SEASON_NAME}...`);
  console.log(`========================================\n`);

  // Check if Season 6 already exists
  let season6 = await db.query.seasons.findFirst({
    where: eq(schema.seasons.name, SEASON_NAME),
  });

  if (!season6) {
    console.log(`Creating ${SEASON_NAME}...`);
    const [newSeason] = await db
      .insert(schema.seasons)
      .values({
        name: SEASON_NAME,
        draftBudget: S6_BUDGET,
        isCurrent: false,
        isPublic: true,
        seasonNumber: SEASON_NUMBER,
      })
      .returning();
    season6 = newSeason;
  }

  console.log(`${SEASON_NAME} ID: ${season6.id}`);

  // Parse Pokemon prices from Draft Board
  console.log("\nParsing Pokemon prices from Draft Board...");
  const draftPrices = parseDraftBoardCSV();
  console.log(`Found ${draftPrices.size} Pokemon prices from draft board`);

  // Get all Pokemon from database
  const allPokemon = await db.query.pokemon.findMany();
  const pokemonByName = new Map<string, number>();
  for (const p of allPokemon) {
    pokemonByName.set(p.name.toLowerCase(), p.id);
  }

  // Check existing S6 prices
  const existingS6Prices = await db.query.seasonPokemonPrices.findMany({
    where: eq(schema.seasonPokemonPrices.seasonId, season6.id),
  });

  if (existingS6Prices.length === 0) {
    console.log(`Seeding Pokemon prices for ${SEASON_NAME}...`);
    let pricesAdded = 0;
    const unmatchedPokemon: string[] = [];

    for (const [pokeName, price] of draftPrices) {
      const pokemonId = pokemonByName.get(pokeName);

      if (!pokemonId) {
        unmatchedPokemon.push(`${pokeName}`);
        continue;
      }

      await db.insert(schema.seasonPokemonPrices).values({
        seasonId: season6.id,
        pokemonId,
        price,
        teraCaptainCost: null, // S6 didn't have TC costs in the same way
      });
      pricesAdded++;
    }

    console.log(`Added ${pricesAdded} Pokemon prices`);
    if (unmatchedPokemon.length > 0) {
      console.log(`\nUnmatched Pokemon (${unmatchedPokemon.length}):`);
      unmatchedPokemon.slice(0, 20).forEach((p) => console.log(`  - ${p}`));
      if (unmatchedPokemon.length > 20) {
        console.log(`  ... and ${unmatchedPokemon.length - 20} more`);
      }
    }
  } else {
    console.log(`${SEASON_NAME} already has ${existingS6Prices.length} Pokemon prices`);
  }

  // Reload prices for roster seeding
  const pokemonPrices = await db.query.seasonPokemonPrices.findMany({
    where: eq(schema.seasonPokemonPrices.seasonId, season6.id),
    with: { pokemon: true },
  });

  const priceMap = new Map<string, { pokemonId: number; price: number }>();
  for (const pp of pokemonPrices) {
    priceMap.set(pp.pokemon.name.toLowerCase(), {
      pokemonId: pp.pokemonId,
      price: pp.price,
    });
  }

  console.log(`\nLoaded ${priceMap.size} Pokemon prices for roster seeding`);

  // Get existing team logos for matching
  const existingSeasonCoaches = await db.query.seasonCoaches.findMany();
  const teamLogos = new Map<string, string>();
  for (const sc of existingSeasonCoaches) {
    if (sc.teamLogoUrl) {
      teamLogos.set(sc.teamName.toLowerCase(), sc.teamLogoUrl);
    }
  }
  console.log(`Found ${teamLogos.size} existing team logos`);

  // Seed each division
  for (const divisionName of DIVISIONS) {
    console.log(`\n----------------------------------------`);
    console.log(`Seeding ${divisionName} division...`);
    console.log(`----------------------------------------`);

    // Get or create division
    let division = await db.query.divisions.findFirst({
      where: and(
        eq(schema.divisions.seasonId, season6.id),
        eq(schema.divisions.name, divisionName)
      ),
    });

    if (!division) {
      console.log(`Creating ${divisionName} division...`);
      const [newDiv] = await db
        .insert(schema.divisions)
        .values({ seasonId: season6.id, name: divisionName })
        .returning();
      division = newDiv;
    }

    console.log(`${divisionName} division ID: ${division.id}`);

    // Clear existing data for this division
    const existingDivCoaches = await db.query.seasonCoaches.findMany({
      where: eq(schema.seasonCoaches.divisionId, division.id),
    });

    const existingMatches = await db.query.matches.findMany({
      where: eq(schema.matches.divisionId, division.id),
    });

    for (const m of existingMatches) {
      await db.delete(schema.matchPokemon).where(eq(schema.matchPokemon.matchId, m.id));
    }
    await db.delete(schema.matches).where(eq(schema.matches.divisionId, division.id));

    for (const sc of existingDivCoaches) {
      await db.delete(schema.rosters).where(eq(schema.rosters.seasonCoachId, sc.id));
    }
    await db.delete(schema.seasonCoaches).where(eq(schema.seasonCoaches.divisionId, division.id));

    console.log("Cleared existing data for division");

    // Parse rosters
    console.log("\nParsing rosters...");
    const teams = parseRostersCSV(divisionName);
    console.log(`Found ${teams.length} teams`);

    // Create teams and rosters
    const teamToSeasonCoachId = new Map<string, number>();
    const teamRosters = new Map<string, string[]>();
    let teamsProcessed = 0;
    let rosterEntriesAdded = 0;

    for (const team of teams) {
      console.log(`\nProcessing: ${team.teamName} (${team.coachName})`);

      // Create or get coach
      let coach = await db.query.coaches.findFirst({
        where: eq(schema.coaches.name, team.coachName),
      });

      if (!coach) {
        const [newCoach] = await db
          .insert(schema.coaches)
          .values({ name: team.coachName })
          .returning();
        coach = newCoach;
        console.log(`  Created new coach: ${team.coachName}`);
      } else {
        console.log(`  Matched existing coach: ${team.coachName} (ID: ${coach.id})`);
      }

      // Check for existing team logo
      const existingLogo = teamLogos.get(team.teamName.toLowerCase());

      // Create season coach
      const [seasonCoach] = await db
        .insert(schema.seasonCoaches)
        .values({
          coachId: coach.id,
          divisionId: division.id,
          teamName: team.teamName,
          teamAbbreviation: team.abbreviation,
          remainingBudget: team.remainingBudget,
          teamLogoUrl: existingLogo || null,
          isActive: true,
        })
        .returning();

      if (existingLogo) {
        console.log(`  Using existing logo for ${team.teamName}`);
      }

      teamToSeasonCoachId.set(team.teamName, seasonCoach.id);

      // Track roster Pokemon for match reconstruction
      const rosterPokemonNames: string[] = [];
      let tcCount = 0;

      // Add roster entries
      for (let i = 0; i < team.pokemon.length; i++) {
        const poke = team.pokemon[i];
        const normalizedName = normalizePokeNameForDB(poke.name);
        const priceInfo = priceMap.get(normalizedName);

        rosterPokemonNames.push(poke.name);

        if (!priceInfo) {
          // Try to find Pokemon by direct lookup
          const pokemonId = pokemonByName.get(normalizedName);
          if (pokemonId) {
            await db.insert(schema.rosters).values({
              seasonCoachId: seasonCoach.id,
              pokemonId,
              price: poke.price,
              draftOrder: i + 1,
              isTeraCaptain: poke.isTeraCaptain,
            });
            rosterEntriesAdded++;
            if (poke.isTeraCaptain) tcCount++;
          } else {
            console.error(`  WARNING: Pokemon "${poke.name}" (${normalizedName}) not found!`);
          }
          continue;
        }

        await db.insert(schema.rosters).values({
          seasonCoachId: seasonCoach.id,
          pokemonId: priceInfo.pokemonId,
          price: poke.price,
          draftOrder: i + 1,
          isTeraCaptain: poke.isTeraCaptain,
        });
        rosterEntriesAdded++;
        if (poke.isTeraCaptain) tcCount++;
      }

      teamRosters.set(team.teamName, rosterPokemonNames);

      teamsProcessed++;
      console.log(`  Added ${team.pokemon.length} Pokemon (${tcCount} TCs), remaining budget: ${team.remainingBudget}`);
    }

    console.log(`\nTeams processed: ${teamsProcessed}`);
    console.log(`Roster entries added: ${rosterEntriesAdded}`);

    // Parse match stats and reconstruct matches
    console.log("\nParsing match stats...");
    const teamResults = parseMatchStatsCSV(divisionName);
    console.log(`Found stats for ${teamResults.size} teams`);

    const matches = reconstructMatches(teamResults, teamRosters);
    console.log(`Reconstructed ${matches.length} matches`);

    // Insert matches with Pokemon stats
    let matchesAdded = 0;
    let pokemonStatsAdded = 0;

    for (const match of matches) {
      const team1ScId = teamToSeasonCoachId.get(match.team1Name);
      const team2ScId = teamToSeasonCoachId.get(match.team2Name);

      if (!team1ScId || !team2ScId) {
        console.log(`  Skipping match: ${match.team1Name} vs ${match.team2Name} (team not found)`);
        continue;
      }

      const winnerId = match.winner === "team1" ? team1ScId : match.winner === "team2" ? team2ScId : null;

      const [insertedMatch] = await db.insert(schema.matches).values({
        seasonId: season6.id,
        divisionId: division.id,
        week: match.week,
        coach1SeasonId: team1ScId,
        coach2SeasonId: team2ScId,
        winnerId,
        coach1Differential: match.team1Diff,
        coach2Differential: match.team2Diff,
        isForfeit: false,
      }).returning();

      matchesAdded++;

      // Insert Pokemon stats for team 1
      for (const pokeStat of match.team1Pokemon) {
        const normalizedName = normalizePokeNameForDB(pokeStat.name);
        const pokemonId = pokemonByName.get(normalizedName);
        if (pokemonId) {
          await db.insert(schema.matchPokemon).values({
            matchId: insertedMatch.id,
            seasonCoachId: team1ScId,
            pokemonId,
            kills: pokeStat.kills,
            deaths: pokeStat.deaths,
          });
          pokemonStatsAdded++;
        }
      }

      // Insert Pokemon stats for team 2
      for (const pokeStat of match.team2Pokemon) {
        const normalizedName = normalizePokeNameForDB(pokeStat.name);
        const pokemonId = pokemonByName.get(normalizedName);
        if (pokemonId) {
          await db.insert(schema.matchPokemon).values({
            matchId: insertedMatch.id,
            seasonCoachId: team2ScId,
            pokemonId,
            kills: pokeStat.kills,
            deaths: pokeStat.deaths,
          });
          pokemonStatsAdded++;
        }
      }
    }

    console.log(`Matches added: ${matchesAdded}`);
    console.log(`Pokemon stats added: ${pokemonStatsAdded}`);
  }

  console.log(`\n========================================`);
  console.log(`${SEASON_NAME} seed complete!`);
  console.log(`========================================`);

  process.exit(0);
}

seedS6().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
