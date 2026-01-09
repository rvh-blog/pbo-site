import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and } from "drizzle-orm";
import * as schema from "./schema";
import * as fs from "fs";

const sqlite = new Database("./data/pbo.db");
const db = drizzle(sqlite, { schema });

const S8_BUDGET = 1250;
const DIVISIONS = ["Stargazer", "Sunset", "Neon"];

// Pokemon name normalization (same as S9 with additions)
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
    // Urshifu
    "urshifu-single-strike": "urshifu-single-strike",
    "urshifu-rapid-strike": "urshifu-rapid-strike",
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
    "alolan exeggutor": "exeggutor-alola",
    "alolan raichu": "raichu-alola",
    "alolan sandshrew": "sandshrew-alola",
    "alolan vulpix": "vulpix-alola",
    "alolan dugtrio": "dugtrio-alola",
    "alolan marowak": "marowak-alola",
    "alolan raticate": "raticate-alola",
    "alolan rattata": "rattata-alola",
    "alolan meowth": "meowth-alola",
    "alolan geodude": "geodude-alola",
    "alolan golem": "golem-alola",
    "alolan graveler": "graveler-alola",
    "alolan grimer": "grimer-alola",
    "alolan diglett": "diglett-alola",
    // Hisuian forms
    "hisuian electrode": "electrode-hisui",
    "hisuian samurott": "samurott-hisui",
    "hisuian qwilfish": "qwilfish-hisui",
    "hisuian zoroark": "zoroark-hisui",
    "hisuian goodra": "goodra-hisui",
    "hisuian arcanine": "arcanine-hisui",
    "hisuian decidueye": "decidueye-hisui",
    "hisuian braviary": "braviary-hisui",
    "hisuian lilligant": "lilligant-hisui",
    "hisuian typhlosion": "typhlosion-hisui",
    "hisuian sneasel": "sneasel-hisui",
    // Ogerpon forms
    "ogerpon-teal": "ogerpon",
    "ogerpon-t": "ogerpon",
    "ogerpon-wellspring": "ogerpon-wellspring-mask",
    "ogerpon-w": "ogerpon-wellspring-mask",
    "ogerpon-hearthflame": "ogerpon-hearthflame-mask",
    "ogerpon-h": "ogerpon-hearthflame-mask",
    "ogerpon-cornerstone": "ogerpon-cornerstone-mask",
    "ogerpon-c": "ogerpon-cornerstone-mask",
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
    "ursaluna-bm": "ursaluna-bloodmoon",
    // Lycanroc forms
    "lycanroc-dusk": "lycanroc-dusk",
    "lycanroc-midday": "lycanroc-midday",
    "lycanroc-midnight": "lycanroc-midnight",
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
    // Paldean Tauros
    "paldean tauros (water)": "tauros-paldea-aqua-breed",
    "paldean tauros (fire)": "tauros-paldea-blaze-breed",
    "paldean tauros": "tauros-paldea-combat-breed",
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
    // Treasures of Ruin
    "chi-yu": "chi-yu",
    "ting-lu": "ting-lu",
    "chien-pao": "chien-pao",
    "wo-chien": "wo-chien",
    // Other forms
    "keldeo": "keldeo-ordinary",
    "meloetta": "meloetta-aria",
    "palafin": "palafin-hero",
    "basculegion": "basculegion-male",
    "basculegion-female": "basculegion-female",
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
    "mimikyu": "mimikyu-busted",
    "aegislash": "aegislash-shield",
    "aegislash-blade": "aegislash-blade",
    "castform-rainy": "castform-rainy",
    "castform-snowy": "castform-snowy",
    "castform-sunny": "castform-sunny",
    "cherrim-sunshine": "cherrim-sunshine",
    "basculin-white-striped": "basculin-white-striped",
    "calyrex-ice-rider": "calyrex-ice-rider",
    "calyrex-shadow-rider": "calyrex-shadow-rider",
  };

  const lower = name.toLowerCase().trim();
  return mappings[lower] || lower.replace(/ /g, "-");
}

interface TeamData {
  teamName: string;
  abbreviation: string;
  coachName: string;
  pokemon: { name: string; price: number; isTeraCaptain: boolean; tcCost: number }[];
  remainingBudget: number;
}

interface MatchData {
  week: number;
  team1Name: string;
  team2Name: string;
  team1Score: number;
  team2Score: number;
  team1Diff: number;
  team2Diff: number;
  winner: "team1" | "team2" | null;
  team1Pokemon: { name: string; kills: number; deaths: number }[];
  team2Pokemon: { name: string; kills: number; deaths: number }[];
}

function parseDraftCSV(divisionName: string): TeamData[] {
  const filePath = `./data/S8/${divisionName} S8 - Draft.csv`;
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").map((l) => l.split(","));

  const teams: TeamData[] = [];

  // Same structure as S9 Rosters
  const rowGroups = [
    { headerRow: 1, coachRow: 2, pokemonStart: 3, budgetRow: 15 },
    { headerRow: 17, coachRow: 18, pokemonStart: 19, budgetRow: 31 },
  ];

  const teamOffsets = [1, 7, 13, 19, 25, 31, 38];

  for (const group of rowGroups) {
    const headerRow = lines[group.headerRow];
    const coachRow = lines[group.coachRow];
    const budgetRow = lines[group.budgetRow];

    if (!headerRow) continue;

    for (const offset of teamOffsets) {
      const teamNum = headerRow[offset]?.trim();
      if (!teamNum || teamNum === "") continue;

      const teamName = headerRow[offset + 1]?.trim();
      const abbreviation = headerRow[offset + 5]?.trim();
      const coachName = coachRow?.[offset]?.trim();

      if (!teamName || !coachName) continue;

      const remainingBudget = parseInt(budgetRow?.[offset] || "0") || 0;

      const pokemon: TeamData["pokemon"] = [];

      for (let i = 0; i < 12; i++) {
        const row = lines[group.pokemonStart + i];
        if (!row) continue;

        const priceStr = row[offset]?.trim();
        const pokeName = row[offset + 2]?.trim();

        if (!pokeName || pokeName === "") continue;

        const price = parseInt(priceStr || "0") || 0;

        const tcCostStr = row[offset + 3]?.trim();
        const tcMarker = row[offset + 4]?.trim();

        const isTeraCaptain = tcMarker === "T";
        const tcCost = isTeraCaptain ? (parseInt(tcCostStr || "0") || 0) : 0;

        pokemon.push({
          name: pokeName,
          price,
          isTeraCaptain,
          tcCost,
        });
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

function parseMatchCSV(divisionName: string): MatchData[] {
  const filePath = `./data/S8/${divisionName} S8 - Match Stats.csv`;
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").map((l) => l.split(","));

  const matches: MatchData[] = [];

  const matchGroupStartRows = [4, 17, 30, 43, 56, 69, 82];

  for (const startRow of matchGroupStartRows) {
    const scoreRow = lines[startRow - 1];
    const teamRow = lines[startRow];
    const pokemon1Row = lines[startRow + 2];
    const pokemon2Row = lines[startRow + 3];
    const pokemon3Row = lines[startRow + 4];
    const pokemon4Row = lines[startRow + 5];
    const pokemon5Row = lines[startRow + 6];
    const pokemon6Row = lines[startRow + 7];
    const resultRow = lines[startRow + 8];

    if (!teamRow || !scoreRow) continue;

    const weekOffsets = [2, 16, 30, 44, 58, 72, 86, 100];

    for (let weekIdx = 0; weekIdx < 8; weekIdx++) {
      const offset = weekOffsets[weekIdx];
      const week = weekIdx + 1;

      const team1Name = teamRow[offset]?.trim();
      const team2Name = teamRow[offset + 4]?.trim();

      if (!team1Name || !team2Name || team1Name === "" || team2Name === "") {
        continue;
      }

      const team1Score = parseInt(scoreRow[offset] || "0") || 0;
      const team2Score = parseInt(scoreRow[offset + 4] || "0") || 0;

      const resultStr = resultRow?.[offset]?.trim();
      const diffStr = resultRow?.[offset + 1]?.trim();

      let team1Diff = 0;
      let team2Diff = 0;
      let winner: "team1" | "team2" | null = null;

      if (resultStr === "W") {
        winner = "team1";
        team1Diff = parseInt(diffStr?.replace(/[^\d-]/g, "") || "0") || 0;
        team2Diff = -team1Diff;
      } else if (resultStr === "L") {
        winner = "team2";
        team1Diff = parseInt(diffStr?.replace(/[^\d-]/g, "") || "0") || 0;
        team2Diff = -team1Diff;
      }

      const team1Pokemon: MatchData["team1Pokemon"] = [];
      const team2Pokemon: MatchData["team2Pokemon"] = [];

      const pokemonRows = [pokemon1Row, pokemon2Row, pokemon3Row, pokemon4Row, pokemon5Row, pokemon6Row];

      for (const row of pokemonRows) {
        if (!row) continue;

        const t1Name = row[offset]?.trim();
        const t1Kills = parseInt(row[offset + 1] || "0") || 0;
        const t1Deaths = parseInt(row[offset + 2] || "0") || 0;

        if (t1Name && t1Name !== "" && t1Name !== "Abra" && t1Name !== "Pokemon") {
          team1Pokemon.push({ name: t1Name, kills: t1Kills, deaths: t1Deaths });
        }

        const t2Deaths = parseInt(row[offset + 4] || "0") || 0;
        const t2Kills = parseInt(row[offset + 5] || "0") || 0;
        const t2Name = row[offset + 6]?.trim();

        if (t2Name && t2Name !== "" && t2Name !== "Abra" && t2Name !== "Pokemon") {
          team2Pokemon.push({ name: t2Name, kills: t2Kills, deaths: t2Deaths });
        }
      }

      matches.push({
        week,
        team1Name,
        team2Name,
        team1Score,
        team2Score,
        team1Diff,
        team2Diff,
        winner,
        team1Pokemon,
        team2Pokemon,
      });
    }
  }

  return matches;
}

interface PriceInfo {
  name: string;
  price: number;
  teraCaptainCost: number | null;
}

function parseTiersCSV(): PriceInfo[] {
  const filePath = "./data/S8/Stargazer S8 - Tiers.csv";
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").map((l) => l.split(","));

  const prices: PriceInfo[] = [];
  const seenPokemon = new Set<string>();

  // Pokemon columns start at 8 and increase by 3 for each tier
  // Tiers: 200, 190, 180, 170, 160, 150, 140, 130, 120, 110, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0
  const tierColumns: { col: number; price: number }[] = [
    { col: 8, price: 200 },
    { col: 11, price: 190 },
    { col: 14, price: 180 },
    { col: 17, price: 170 },
    { col: 20, price: 160 },
    { col: 23, price: 150 },
    { col: 26, price: 140 },
    { col: 29, price: 130 },
    { col: 32, price: 120 },
    { col: 35, price: 110 },
    { col: 38, price: 100 },
    { col: 41, price: 90 },
    { col: 44, price: 80 },
    { col: 47, price: 70 },
    { col: 50, price: 60 },
    { col: 53, price: 50 },
    { col: 56, price: 40 },
    { col: 59, price: 30 },
    { col: 62, price: 20 },
    { col: 65, price: 10 },
    { col: 68, price: 0 },
  ];

  // Parse from row 4 onwards (index 3+)
  for (let rowIdx = 3; rowIdx < lines.length; rowIdx++) {
    const row = lines[rowIdx];
    if (!row) continue;

    for (const tier of tierColumns) {
      const pokeName = row[tier.col]?.trim();
      if (!pokeName || pokeName === "" || pokeName === "X" || pokeName === "-") continue;
      // Skip if it's a number or very short (likely parsing error)
      if (/^\d+$/.test(pokeName) || pokeName.length < 2) continue;
      // Skip if it's "B" (banned marker read as name)
      if (pokeName === "B") continue;

      // Avoid duplicates
      const normalizedKey = pokeName.toLowerCase();
      if (seenPokemon.has(normalizedKey)) continue;
      seenPokemon.add(normalizedKey);

      // Check for TC cost (next column has a number, not "B")
      const tcStr = row[tier.col + 1]?.trim();
      let teraCaptainCost: number | null = null;

      if (tcStr && tcStr !== "B" && tcStr !== "" && !isNaN(parseInt(tcStr))) {
        teraCaptainCost = parseInt(tcStr);
      }

      prices.push({
        name: pokeName,
        price: tier.price,
        teraCaptainCost,
      });
    }
  }

  return prices;
}

async function seedS8() {
  console.log(`\n========================================`);
  console.log(`Seeding Season 8...`);
  console.log(`========================================\n`);

  // Check if Season 8 already exists
  let season8 = await db.query.seasons.findFirst({
    where: eq(schema.seasons.name, "Season 8"),
  });

  if (!season8) {
    console.log("Creating Season 8...");
    const [newSeason] = await db
      .insert(schema.seasons)
      .values({
        name: "Season 8",
        draftBudget: S8_BUDGET,
        isCurrent: false,
        isPublic: true,
        seasonNumber: 8,
      })
      .returning();
    season8 = newSeason;
  }

  console.log(`Season 8 ID: ${season8.id}`);

  // Parse and seed Pokemon prices
  console.log("\nParsing Pokemon prices from Tiers CSV...");
  const tierPrices = parseTiersCSV();
  console.log(`Found ${tierPrices.length} Pokemon prices`);

  // Get all Pokemon from database
  const allPokemon = await db.query.pokemon.findMany();
  const pokemonByName = new Map<string, number>();
  for (const p of allPokemon) {
    pokemonByName.set(p.name.toLowerCase(), p.id);
  }

  // Check existing S8 prices
  const existingS8Prices = await db.query.seasonPokemonPrices.findMany({
    where: eq(schema.seasonPokemonPrices.seasonId, season8.id),
  });

  if (existingS8Prices.length === 0) {
    console.log("Seeding Pokemon prices for S8...");
    let pricesAdded = 0;
    const unmatchedPokemon: string[] = [];

    for (const price of tierPrices) {
      const normalizedName = normalizePokeNameForDB(price.name);
      const pokemonId = pokemonByName.get(normalizedName);

      if (!pokemonId) {
        // Try direct match
        const directMatch = pokemonByName.get(price.name.toLowerCase());
        if (directMatch) {
          await db.insert(schema.seasonPokemonPrices).values({
            seasonId: season8.id,
            pokemonId: directMatch,
            price: price.price,
            teraCaptainCost: price.teraCaptainCost,
          });
          pricesAdded++;
        } else {
          unmatchedPokemon.push(`${price.name} (${normalizedName})`);
        }
        continue;
      }

      await db.insert(schema.seasonPokemonPrices).values({
        seasonId: season8.id,
        pokemonId,
        price: price.price,
        teraCaptainCost: price.teraCaptainCost,
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
    console.log(`S8 already has ${existingS8Prices.length} Pokemon prices`);
  }

  // Reload prices for roster seeding
  const pokemonPrices = await db.query.seasonPokemonPrices.findMany({
    where: eq(schema.seasonPokemonPrices.seasonId, season8.id),
    with: { pokemon: true },
  });

  const priceMap = new Map<string, { pokemonId: number; price: number; teraCaptainCost: number | null }>();
  for (const pp of pokemonPrices) {
    priceMap.set(pp.pokemon.name.toLowerCase(), {
      pokemonId: pp.pokemonId,
      price: pp.price,
      teraCaptainCost: pp.teraCaptainCost,
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
  for (let divIdx = 0; divIdx < DIVISIONS.length; divIdx++) {
    const divisionName = DIVISIONS[divIdx];
    console.log(`\n----------------------------------------`);
    console.log(`Seeding ${divisionName} division...`);
    console.log(`----------------------------------------`);

    const draftFile = `./data/S8/${divisionName} S8 - Draft.csv`;
    const matchFile = `./data/S8/${divisionName} S8 - Match Stats.csv`;

    if (!fs.existsSync(draftFile)) {
      console.error(`Draft file not found: ${draftFile}`);
      continue;
    }
    if (!fs.existsSync(matchFile)) {
      console.error(`Match file not found: ${matchFile}`);
      continue;
    }

    // Get or create division
    let division = await db.query.divisions.findFirst({
      where: and(
        eq(schema.divisions.seasonId, season8.id),
        eq(schema.divisions.name, divisionName)
      ),
    });

    if (!division) {
      console.log(`Creating ${divisionName} division...`);
      const [newDiv] = await db
        .insert(schema.divisions)
        .values({ seasonId: season8.id, name: divisionName })
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

    // Parse draft CSV
    console.log("\nParsing draft CSV...");
    const teams = parseDraftCSV(divisionName);
    console.log(`Found ${teams.length} teams`);

    // Create teams and rosters
    const teamToSeasonCoachId = new Map<string, number>();
    let teamsProcessed = 0;
    let rosterEntriesAdded = 0;

    for (const team of teams) {
      console.log(`\nProcessing: ${team.teamName} (${team.coachName})`);

      // Create or get coach (match by name)
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

      // Add roster entries
      for (let i = 0; i < team.pokemon.length; i++) {
        const poke = team.pokemon[i];
        const normalizedName = normalizePokeNameForDB(poke.name);
        const priceInfo = priceMap.get(normalizedName);

        if (!priceInfo) {
          console.error(`  WARNING: Pokemon "${poke.name}" (${normalizedName}) not found in prices!`);
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
      }

      teamsProcessed++;
      console.log(`  Added ${team.pokemon.length} Pokemon, remaining budget: ${team.remainingBudget}`);
    }

    console.log(`\nTeams processed: ${teamsProcessed}`);
    console.log(`Roster entries added: ${rosterEntriesAdded}`);

    // Parse and insert matches
    console.log("\nParsing matches CSV...");
    const matches = parseMatchCSV(divisionName);
    console.log(`Found ${matches.length} matches`);

    function findPokemonId(name: string): number | null {
      const normalized = normalizePokeNameForDB(name);
      if (pokemonByName.has(normalized)) {
        return pokemonByName.get(normalized)!;
      }
      if (pokemonByName.has(name.toLowerCase())) {
        return pokemonByName.get(name.toLowerCase())!;
      }
      return null;
    }

    let matchesAdded = 0;
    let pokemonStatsAdded = 0;
    const unmatchedTeams = new Set<string>();

    for (const match of matches) {
      const team1ScId = teamToSeasonCoachId.get(match.team1Name);
      const team2ScId = teamToSeasonCoachId.get(match.team2Name);

      if (!team1ScId) unmatchedTeams.add(match.team1Name);
      if (!team2ScId) unmatchedTeams.add(match.team2Name);

      if (!team1ScId || !team2ScId) {
        continue;
      }

      const winnerId = match.winner === "team1" ? team1ScId : match.winner === "team2" ? team2ScId : null;

      const [newMatch] = await db
        .insert(schema.matches)
        .values({
          seasonId: season8.id,
          divisionId: division.id,
          week: match.week,
          coach1SeasonId: team1ScId,
          coach2SeasonId: team2ScId,
          winnerId,
          coach1Differential: match.team1Diff,
          coach2Differential: match.team2Diff,
          isForfeit: false,
        })
        .returning();

      matchesAdded++;

      for (const poke of match.team1Pokemon) {
        const pokeId = findPokemonId(poke.name);
        if (pokeId) {
          await db.insert(schema.matchPokemon).values({
            matchId: newMatch.id,
            seasonCoachId: team1ScId,
            pokemonId: pokeId,
            kills: poke.kills,
            deaths: poke.deaths,
          });
          pokemonStatsAdded++;
        }
      }

      for (const poke of match.team2Pokemon) {
        const pokeId = findPokemonId(poke.name);
        if (pokeId) {
          await db.insert(schema.matchPokemon).values({
            matchId: newMatch.id,
            seasonCoachId: team2ScId,
            pokemonId: pokeId,
            kills: poke.kills,
            deaths: poke.deaths,
          });
          pokemonStatsAdded++;
        }
      }
    }

    if (unmatchedTeams.size > 0) {
      console.log("\nUnmatched teams in matches:");
      for (const team of unmatchedTeams) {
        console.log(`  - ${team}`);
      }
    }

    console.log(`\nMatches added: ${matchesAdded}`);
    console.log(`Pokemon stats added: ${pokemonStatsAdded}`);
  }

  console.log(`\n========================================`);
  console.log(`Season 8 seed complete!`);
  console.log(`========================================`);

  process.exit(0);
}

seedS8().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
