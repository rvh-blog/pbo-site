import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and } from "drizzle-orm";
import * as schema from "./schema";
import * as fs from "fs";

const sqlite = new Database("./data/pbo.db");
const db = drizzle(sqlite, { schema });

const S5_BUDGET = 1200;
const DIVISIONS = ["Unova", "Kalos"];
const SEASON_NUMBER = 5;
const SEASON_NAME = "Season 5";

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
        currentField += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = "";
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
        if (char === '\r') i++;
      } else if (char !== '\r') {
        currentField += char;
      }
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

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
    // Alolan forms
    "alolan muk": "muk-alola",
    "alolan ninetales": "ninetales-alola",
    "alolan persian": "persian-alola",
    "alolan sandslash": "sandslash-alola",
    "alolan vulpix": "vulpix-alola",
    "alolan exeggutor": "exeggutor-alola",
    "alolan raichu": "raichu-alola",
    // Hisuian forms
    "hisuian electrode": "electrode-hisui",
    "hisuian zoroark": "zoroark-hisui",
    "hisuian goodra": "goodra-hisui",
    "hisuian arcanine": "arcanine-hisui",
    "hisuian decidueye": "decidueye-hisui",
    "hisuian braviary": "braviary-hisui",
    "hisuian lilligant": "lilligant-hisui",
    "hisuian typhlosion": "typhlosion-hisui",
    "hisuian avalugg": "avalugg-hisui",
    "hisuian samurott": "samurott-hisui",
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
    "enamorus-incarnate": "enamorus-incarnate",
    "landorus": "landorus-incarnate",
    "thundurus": "thundurus-incarnate",
    "tornadus": "tornadus-incarnate",
    "enamorus": "enamorus-incarnate",
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
    // Paldean forms
    "paldean tauros": "tauros-paldea-combat-breed",
    "paldean tauros aqua": "tauros-paldea-aqua-breed",
    "paldean tauros blaze": "tauros-paldea-blaze-breed",
    "paldean wooper": "wooper-paldea",
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
    "lycanroc": "lycanroc-midday",
    "lycanroc-dusk": "lycanroc-dusk",
    "lycanroc-midnight": "lycanroc-midnight",
    "deoxys-speed": "deoxys-speed",
    "deoxys-defense": "deoxys-defense",
    "deoxys-attack": "deoxys-attack",
    "rotom-mow": "rotom-mow",
    "rotom-heat": "rotom-heat",
    "rotom-wash": "rotom-wash",
    "rotom-frost": "rotom-frost",
    "rotom-fan": "rotom-fan",
    "urshifu": "urshifu-single-strike",
    "urshifu-rapid-strike": "urshifu-rapid-strike",
    "calyrex": "calyrex",
  };

  const lower = name.toLowerCase().trim();
  return mappings[lower] || lower.replace(/ /g, "-");
}

interface CoachData {
  coachName: string;
  pokemon: { name: string; price: number }[];
  remainingBudget: number;
}

interface MatchData {
  week: number;
  coach1Name: string;
  coach2Name: string;
  coach1Result: "W" | "L";
  coach1Diff: number;
  coach2Diff: number;
  coach1Pokemon: { name: string; kills: number; deaths: number }[];
  coach2Pokemon: { name: string; kills: number; deaths: number }[];
}

// Parse S5 Rosters CSV format
function parseRostersCSV(divisionName: string): CoachData[] {
  const fileMap: Record<string, string> = {
    "Unova": "./data/S5/PBO Unova S5  - Rosters.csv",
    "Kalos": "./data/S5/PBO Kalos DOC S5 - Rosters.csv",
  };

  const filePath = fileMap[divisionName];
  if (!filePath || !fs.existsSync(filePath)) {
    console.error(`Rosters file not found for ${divisionName}`);
    return [];
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = parseCSV(content);

  const coaches: CoachData[] = [];

  // Find coach rows (rows with "Coach:" in col 5)
  const coachRowIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i][5]?.trim() === "Coach:") {
      coachRowIndices.push(i);
    }
  }

  console.log(`  Found ${coachRowIndices.length} coach row blocks`);

  // Coach columns: name at 9, 15, 21, 27, 33, 39, 45, 51 (every 6 cols)
  // Price columns: 7, 13, 19, 25, 31, 37, 43, 49
  const coachOffsets = [
    { nameCol: 9, priceCol: 7 },
    { nameCol: 15, priceCol: 13 },
    { nameCol: 21, priceCol: 19 },
    { nameCol: 27, priceCol: 25 },
    { nameCol: 33, priceCol: 31 },
    { nameCol: 39, priceCol: 37 },
    { nameCol: 45, priceCol: 43 },
    { nameCol: 51, priceCol: 49 },
  ];

  for (const coachRowIdx of coachRowIndices) {
    const coachRow = lines[coachRowIdx];

    for (const offset of coachOffsets) {
      const coachName = coachRow[offset.nameCol]?.trim();
      if (!coachName || coachName === "") continue;

      // Parse Pokemon from rows coachRowIdx+1 to coachRowIdx+11 (Pick #1 to Pick #11)
      const pokemon: CoachData["pokemon"] = [];
      for (let pickRow = 1; pickRow <= 11; pickRow++) {
        const row = lines[coachRowIdx + pickRow];
        if (!row) continue;

        const pokeName = row[offset.nameCol]?.trim();
        const priceStr = row[offset.priceCol]?.trim();

        if (!pokeName || pokeName === "") continue;
        const price = parseInt(priceStr || "0") || 0;

        if (price > 0 && pokeName.length > 1) {
          pokemon.push({ name: pokeName, price });
        }
      }

      // Get remaining budget from Pts.Rem. row (coachRowIdx + 13)
      const ptsRemRow = lines[coachRowIdx + 13];
      const remainingBudget = parseInt(ptsRemRow?.[offset.priceCol]?.trim() || "0") || 0;

      if (pokemon.length > 0) {
        coaches.push({
          coachName,
          pokemon,
          remainingBudget,
        });
        console.log(`  Parsed coach: ${coachName} - ${pokemon.length} Pokemon`);
      }
    }
  }

  return coaches;
}

// Parse S5 Draft Board for Pokemon prices
function parseDraftBoardCSV(): Map<string, number> {
  const filePath = "./data/S5/PBO Unova S5  - Draft Board.csv";
  if (!fs.existsSync(filePath)) {
    console.error("Draft Board file not found");
    return new Map();
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = parseCSV(content);

  const prices = new Map<string, number>();

  // Row 2 has tier headers: "180 Points" at col 11, "170 Points" at col 14, etc.
  // Pokemon are in rows 4+ in the columns after the price header
  const tierCols: { headerCol: number; pokeCol: number; price: number }[] = [
    { headerCol: 11, pokeCol: 12, price: 180 },
    { headerCol: 14, pokeCol: 15, price: 170 },
    { headerCol: 17, pokeCol: 18, price: 160 },
    { headerCol: 20, pokeCol: 21, price: 150 },
    { headerCol: 23, pokeCol: 24, price: 140 },
    { headerCol: 26, pokeCol: 27, price: 130 },
    { headerCol: 29, pokeCol: 30, price: 120 },
    { headerCol: 32, pokeCol: 33, price: 110 },
    { headerCol: 35, pokeCol: 36, price: 100 },
    { headerCol: 38, pokeCol: 39, price: 90 },
    { headerCol: 41, pokeCol: 42, price: 80 },
    { headerCol: 44, pokeCol: 45, price: 70 },
    { headerCol: 47, pokeCol: 48, price: 60 },
    { headerCol: 50, pokeCol: 51, price: 50 },
    { headerCol: 53, pokeCol: 54, price: 40 },
    { headerCol: 56, pokeCol: 57, price: 30 },
    { headerCol: 59, pokeCol: 60, price: 20 },
    { headerCol: 62, pokeCol: 63, price: 10 },
  ];

  // Parse Pokemon from rows 4+
  for (let rowIdx = 4; rowIdx < lines.length; rowIdx++) {
    const row = lines[rowIdx];
    if (!row) continue;

    for (const tier of tierCols) {
      const pokeName = row[tier.pokeCol]?.trim();
      if (!pokeName || pokeName === "" || pokeName === "#N/A") continue;
      if (pokeName.length < 3) continue;

      const normalizedName = normalizePokeNameForDB(pokeName);
      if (!prices.has(normalizedName)) {
        prices.set(normalizedName, tier.price);
      }
    }
  }

  return prices;
}

// Parse S5 Match Stats CSV format
function parseMatchStatsCSV(divisionName: string): MatchData[] {
  const fileMap: Record<string, string> = {
    "Unova": "./data/S5/PBO Unova S5  - Match Stats.csv",
    "Kalos": "./data/S5/PBO Kalos DOC S5 - Match Stats.csv",
  };

  const filePath = fileMap[divisionName];
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = parseCSV(content);

  const matches: MatchData[] = [];

  // Week columns start at: 3, 14, 25, 36, 47, 58, 69, 80, 91, 102 (every 11 cols)
  const weekOffsets: number[] = [];
  const row5 = lines[5];
  for (let j = 0; j < (row5?.length || 0); j++) {
    if (row5[j]?.includes("Week")) {
      weekOffsets.push(j);
    }
  }

  console.log(`  Found ${weekOffsets.length} weeks`);

  // Find match header rows (rows with W/L in col offset+2 or offset+6)
  // Match rows: 6, 15, 24, 33, 42, 51, 60 (every 9 rows starting from 6)
  const matchStartRows: number[] = [];
  for (let i = 6; i < lines.length; i++) {
    const row = lines[i];
    // Check first week column for W/L indicator
    if (row && (row[5] === "W" || row[5] === "L")) {
      matchStartRows.push(i);
    }
  }

  console.log(`  Found ${matchStartRows.length} match rows per week`);

  for (let weekIdx = 0; weekIdx < weekOffsets.length; weekIdx++) {
    const weekOffset = weekOffsets[weekIdx];
    const week = weekIdx + 1;

    for (const matchRow of matchStartRows) {
      const row = lines[matchRow];
      if (!row) continue;

      // Match structure relative to week offset:
      // offset+1: Coach1 name
      // offset+2: Result (W/L)
      // offset+3: Differential
      // offset+4: "vs."
      // offset+5: Differential (Coach2)
      // offset+6: Result (W/L)
      // offset+7: Coach2 name
      const coach1Name = row[weekOffset + 1]?.trim();
      const coach1Result = row[weekOffset + 2]?.trim();
      const coach1DiffStr = row[weekOffset + 3]?.trim();
      const coach2DiffStr = row[weekOffset + 5]?.trim();
      const coach2Result = row[weekOffset + 6]?.trim();
      const coach2Name = row[weekOffset + 7]?.trim();

      if (!coach1Name || !coach2Name) continue;
      if (coach1Result !== "W" && coach1Result !== "L") continue;

      const coach1Diff = parseInt(coach1DiffStr || "0") || 0;
      const coach2Diff = parseInt(coach2DiffStr || "0") || 0;

      // Parse Pokemon from rows matchRow+2 to matchRow+7 (6 Pokemon per team)
      const coach1Pokemon: MatchData["coach1Pokemon"] = [];
      const coach2Pokemon: MatchData["coach2Pokemon"] = [];

      for (let pokeRow = 2; pokeRow <= 7; pokeRow++) {
        const pRow = lines[matchRow + pokeRow];
        if (!pRow) continue;

        // Coach 1 Pokemon: name at offset+1, K at offset+2, D at offset+3
        const poke1Name = pRow[weekOffset + 1]?.trim();
        const poke1Kills = parseInt(pRow[weekOffset + 2]?.trim() || "0") || 0;
        const poke1Deaths = parseInt(pRow[weekOffset + 3]?.trim() || "0") || 0;

        if (poke1Name && poke1Name.length > 2) {
          coach1Pokemon.push({ name: poke1Name, kills: poke1Kills, deaths: poke1Deaths });
        }

        // Coach 2 Pokemon: name at offset+7, K at offset+6, D at offset+5
        const poke2Name = pRow[weekOffset + 7]?.trim();
        const poke2Kills = parseInt(pRow[weekOffset + 6]?.trim() || "0") || 0;
        const poke2Deaths = parseInt(pRow[weekOffset + 5]?.trim() || "0") || 0;

        if (poke2Name && poke2Name.length > 2) {
          coach2Pokemon.push({ name: poke2Name, kills: poke2Kills, deaths: poke2Deaths });
        }
      }

      matches.push({
        week,
        coach1Name,
        coach2Name,
        coach1Result: coach1Result as "W" | "L",
        coach1Diff,
        coach2Diff,
        coach1Pokemon,
        coach2Pokemon,
      });
    }
  }

  return matches;
}

async function seedS5() {
  console.log(`\n========================================`);
  console.log(`Seeding ${SEASON_NAME}...`);
  console.log(`========================================\n`);

  // Check if Season 5 already exists
  let season5 = await db.query.seasons.findFirst({
    where: eq(schema.seasons.name, SEASON_NAME),
  });

  if (!season5) {
    console.log(`Creating ${SEASON_NAME}...`);
    const [newSeason] = await db
      .insert(schema.seasons)
      .values({
        name: SEASON_NAME,
        draftBudget: S5_BUDGET,
        isCurrent: false,
        isPublic: true,
        seasonNumber: SEASON_NUMBER,
      })
      .returning();
    season5 = newSeason;
  } else {
    // Update budget if needed
    if (season5.draftBudget !== S5_BUDGET) {
      await db.update(schema.seasons)
        .set({ draftBudget: S5_BUDGET })
        .where(eq(schema.seasons.id, season5.id));
    }
  }

  console.log(`${SEASON_NAME} ID: ${season5.id}`);

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

  // Check existing S5 prices
  const existingS5Prices = await db.query.seasonPokemonPrices.findMany({
    where: eq(schema.seasonPokemonPrices.seasonId, season5.id),
  });

  if (existingS5Prices.length === 0) {
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
        seasonId: season5.id,
        pokemonId,
        price,
        teraCaptainCost: null,
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
    console.log(`${SEASON_NAME} already has ${existingS5Prices.length} Pokemon prices`);
  }

  // Reload prices for roster seeding
  const pokemonPrices = await db.query.seasonPokemonPrices.findMany({
    where: eq(schema.seasonPokemonPrices.seasonId, season5.id),
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

  // Get existing coaches and their team names for lookup
  const existingSeasonCoaches = await db.query.seasonCoaches.findMany();
  const coachToTeamName = new Map<string, string>();
  const teamLogos = new Map<string, string>();

  for (const sc of existingSeasonCoaches) {
    // Get coach name
    const coach = await db.query.coaches.findFirst({
      where: eq(schema.coaches.id, sc.coachId),
    });
    if (coach) {
      // Store the most recent team name for this coach
      coachToTeamName.set(coach.name.toLowerCase(), sc.teamName);
      if (sc.teamLogoUrl) {
        teamLogos.set(sc.teamName.toLowerCase(), sc.teamLogoUrl);
      }
    }
  }
  console.log(`Found ${coachToTeamName.size} existing coach-to-team mappings`);

  // Seed each division
  for (const divisionName of DIVISIONS) {
    console.log(`\n----------------------------------------`);
    console.log(`Seeding ${divisionName} division...`);
    console.log(`----------------------------------------`);

    // Get or create division
    let division = await db.query.divisions.findFirst({
      where: and(
        eq(schema.divisions.seasonId, season5.id),
        eq(schema.divisions.name, divisionName)
      ),
    });

    if (!division) {
      console.log(`Creating ${divisionName} division...`);
      const [newDiv] = await db
        .insert(schema.divisions)
        .values({ seasonId: season5.id, name: divisionName })
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
    const coaches = parseRostersCSV(divisionName);
    console.log(`Found ${coaches.length} coaches`);

    // Create coaches and rosters
    const coachNameToSeasonCoachId = new Map<string, number>();
    let coachesProcessed = 0;
    let rosterEntriesAdded = 0;

    for (const coachData of coaches) {
      // Determine team name - use existing team name if coach exists, else use coach name
      const existingTeamName = coachToTeamName.get(coachData.coachName.toLowerCase());
      const teamName = existingTeamName || coachData.coachName;

      console.log(`\nProcessing: ${coachData.coachName} -> Team: ${teamName}`);

      // Create or get coach
      let coach = await db.query.coaches.findFirst({
        where: eq(schema.coaches.name, coachData.coachName),
      });

      if (!coach) {
        const [newCoach] = await db
          .insert(schema.coaches)
          .values({ name: coachData.coachName })
          .returning();
        coach = newCoach;
        console.log(`  Created new coach: ${coachData.coachName}`);
      } else {
        console.log(`  Matched existing coach: ${coachData.coachName} (ID: ${coach.id})`);
      }

      // Check for existing team logo
      const existingLogo = teamLogos.get(teamName.toLowerCase());

      // Create season coach
      const [seasonCoach] = await db
        .insert(schema.seasonCoaches)
        .values({
          coachId: coach.id,
          divisionId: division.id,
          teamName,
          teamAbbreviation: teamName.substring(0, 3).toUpperCase(),
          remainingBudget: coachData.remainingBudget,
          teamLogoUrl: existingLogo || null,
          isActive: true,
        })
        .returning();

      if (existingLogo) {
        console.log(`  Using existing logo for ${teamName}`);
      }

      coachNameToSeasonCoachId.set(coachData.coachName.toLowerCase(), seasonCoach.id);

      // Add roster entries
      for (let i = 0; i < coachData.pokemon.length; i++) {
        const poke = coachData.pokemon[i];
        const normalizedName = normalizePokeNameForDB(poke.name);
        const priceInfo = priceMap.get(normalizedName);

        if (!priceInfo) {
          const pokemonId = pokemonByName.get(normalizedName);
          if (pokemonId) {
            await db.insert(schema.rosters).values({
              seasonCoachId: seasonCoach.id,
              pokemonId,
              price: poke.price,
              draftOrder: i + 1,
              isTeraCaptain: false,
            });
            rosterEntriesAdded++;
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
          isTeraCaptain: false,
        });
        rosterEntriesAdded++;
      }

      coachesProcessed++;
      console.log(`  Added ${coachData.pokemon.length} Pokemon, remaining budget: ${coachData.remainingBudget}`);
    }

    console.log(`\nCoaches processed: ${coachesProcessed}`);
    console.log(`Roster entries added: ${rosterEntriesAdded}`);

    // Parse match stats
    console.log("\nParsing match stats...");
    const matches = parseMatchStatsCSV(divisionName);
    console.log(`Found ${matches.length} matches`);

    // Insert matches with Pokemon stats
    let matchesAdded = 0;
    let pokemonStatsAdded = 0;

    for (const match of matches) {
      const coach1ScId = coachNameToSeasonCoachId.get(match.coach1Name.toLowerCase());
      const coach2ScId = coachNameToSeasonCoachId.get(match.coach2Name.toLowerCase());

      if (!coach1ScId || !coach2ScId) {
        console.log(`  Skipping match: ${match.coach1Name} vs ${match.coach2Name} (coach not found)`);
        continue;
      }

      const winnerId = match.coach1Result === "W" ? coach1ScId : coach2ScId;

      const [insertedMatch] = await db.insert(schema.matches).values({
        seasonId: season5.id,
        divisionId: division.id,
        week: match.week,
        coach1SeasonId: coach1ScId,
        coach2SeasonId: coach2ScId,
        winnerId,
        coach1Differential: match.coach1Diff,
        coach2Differential: match.coach2Diff,
        isForfeit: false,
      }).returning();

      matchesAdded++;

      // Insert Pokemon stats for coach 1
      for (const pokeStat of match.coach1Pokemon) {
        const normalizedName = normalizePokeNameForDB(pokeStat.name);
        const pokemonId = pokemonByName.get(normalizedName);
        if (pokemonId) {
          await db.insert(schema.matchPokemon).values({
            matchId: insertedMatch.id,
            seasonCoachId: coach1ScId,
            pokemonId,
            kills: pokeStat.kills,
            deaths: pokeStat.deaths,
          });
          pokemonStatsAdded++;
        }
      }

      // Insert Pokemon stats for coach 2
      for (const pokeStat of match.coach2Pokemon) {
        const normalizedName = normalizePokeNameForDB(pokeStat.name);
        const pokemonId = pokemonByName.get(normalizedName);
        if (pokemonId) {
          await db.insert(schema.matchPokemon).values({
            matchId: insertedMatch.id,
            seasonCoachId: coach2ScId,
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

seedS5().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
