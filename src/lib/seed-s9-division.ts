import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and } from "drizzle-orm";
import * as schema from "./schema";
import * as fs from "fs";

const sqlite = new Database("./data/pbo.db");
const db = drizzle(sqlite, { schema });

// Get division name from command line
const divisionName = process.argv[2];
if (!divisionName) {
  console.error("Usage: npx tsx src/lib/seed-s9-division.ts <DivisionName>");
  console.error("Example: npx tsx src/lib/seed-s9-division.ts Stargazer");
  process.exit(1);
}

const ROSTER_FILE = `./data/S9/${divisionName} S9 - Rosters.csv`;
const MATCHES_FILE = `./data/S9/${divisionName} S9 - Match Stats.csv`;

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
    // Urshifu
    "urshifu-single-strike": "urshifu-single-strike",
    "urshifu-rapid-strike": "urshifu-rapid-strike",
    // Galarian forms
    "galarian zapdos": "zapdos-galar",
    "galarian moltres": "moltres-galar",
    "galarian slowking": "slowking-galar",
    "galarian slowbro": "slowbro-galar",
    "galarian weezing": "weezing-galar",
    // Alolan forms
    "alolan muk": "muk-alola",
    "alolan ninetales": "ninetales-alola",
    "alolan persian": "persian-alola",
    "alolan sandslash": "sandslash-alola",
    // Hisuian forms
    "hisuian electrode": "electrode-hisui",
    "hisuian samurott": "samurott-hisui",
    "hisuian qwilfish": "qwilfish-hisui",
    "hisuian zoroark": "zoroark-hisui",
    "hisuian goodra": "goodra-hisui",
    "hisuian arcanine": "arcanine-hisui",
    "hisuian decidueye": "decidueye-hisui",
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
    "iron leaves": "iron-leaves",
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
  };

  const lower = name.toLowerCase().trim();
  return mappings[lower] || lower.replace(/ /g, "-");
}

function parseRosterCSV(): TeamData[] {
  const content = fs.readFileSync(ROSTER_FILE, "utf-8");
  const lines = content.split("\n").map((l) => l.split(","));

  const teams: TeamData[] = [];

  // The roster CSV has 7 teams per row group, with 2 row groups
  // Row 2 (index 1): Team headers (number, name, abbrev)
  // Row 3 (index 2): Coach names
  // Rows 4-15 (index 3-14): Pokemon (up to 12)
  // Row 16 (index 15): Remaining budget row

  const rowGroups = [
    { headerRow: 1, coachRow: 2, pokemonStart: 3, budgetRow: 15 },
    { headerRow: 17, coachRow: 18, pokemonStart: 19, budgetRow: 31 },
  ];

  // Each team takes 6 columns, except there's an extra gap before team 7
  // Teams at columns: 1, 7, 13, 19, 25, 31, 38
  const teamOffsets = [1, 7, 13, 19, 25, 31, 38];

  for (const group of rowGroups) {
    const headerRow = lines[group.headerRow];
    const coachRow = lines[group.coachRow];
    const budgetRow = lines[group.budgetRow];

    if (!headerRow) continue;

    for (const offset of teamOffsets) {
      // Get team number (skip if empty)
      const teamNum = headerRow[offset]?.trim();
      if (!teamNum || teamNum === "") continue;

      // Team name is at offset+1, abbreviation at offset+5
      const teamName = headerRow[offset + 1]?.trim();
      const abbreviation = headerRow[offset + 5]?.trim();
      const coachName = coachRow?.[offset]?.trim();

      if (!teamName || !coachName) continue;

      // Get remaining budget
      const remainingBudget = parseInt(budgetRow?.[offset] || "0") || 0;

      // Parse Pokemon (rows pokemonStart to pokemonStart+11)
      const pokemon: TeamData["pokemon"] = [];

      for (let i = 0; i < 12; i++) {
        const row = lines[group.pokemonStart + i];
        if (!row) continue;

        // Price at offset, Pokemon name at offset+2
        const priceStr = row[offset]?.trim();
        const pokeName = row[offset + 2]?.trim();

        if (!pokeName || pokeName === "") continue;

        const price = parseInt(priceStr || "0") || 0;

        // Check for TC marker: format is price,, name, tcCost, T
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

function parseMatchCSV(): MatchData[] {
  const content = fs.readFileSync(MATCHES_FILE, "utf-8");
  const lines = content.split("\n").map((l) => l.split(","));

  const matches: MatchData[] = [];

  // Process each block of 7 matches
  // The structure repeats every 13 rows approximately
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

    // Each week takes about 14 columns
    const weekOffsets = [2, 16, 30, 44, 58, 72, 86, 100];

    for (let weekIdx = 0; weekIdx < 8; weekIdx++) {
      const offset = weekOffsets[weekIdx];
      const week = weekIdx + 1;

      const team1Name = teamRow[offset]?.trim();
      const team2Name = teamRow[offset + 4]?.trim();

      if (!team1Name || !team2Name || team1Name === "" || team2Name === "") {
        continue;
      }

      // Get scores
      const team1Score = parseInt(scoreRow[offset] || "0") || 0;
      const team2Score = parseInt(scoreRow[offset + 4] || "0") || 0;

      // Get result
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

      // Get Pokemon data
      const team1Pokemon: MatchData["team1Pokemon"] = [];
      const team2Pokemon: MatchData["team2Pokemon"] = [];

      const pokemonRows = [pokemon1Row, pokemon2Row, pokemon3Row, pokemon4Row, pokemon5Row, pokemon6Row];

      for (const row of pokemonRows) {
        if (!row) continue;

        // Team 1: name at offset, K at offset+1, D at offset+2
        const t1Name = row[offset]?.trim();
        const t1Kills = parseInt(row[offset + 1] || "0") || 0;
        const t1Deaths = parseInt(row[offset + 2] || "0") || 0;

        if (t1Name && t1Name !== "" && t1Name !== "Abra" && t1Name !== "Pokemon") {
          team1Pokemon.push({ name: t1Name, kills: t1Kills, deaths: t1Deaths });
        }

        // Team 2: D at offset+4, K at offset+5, name at offset+6
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

async function seedDivision() {
  console.log(`\n========================================`);
  console.log(`Seeding S9 ${divisionName} division...`);
  console.log(`========================================\n`);

  // Check files exist
  if (!fs.existsSync(ROSTER_FILE)) {
    console.error(`Roster file not found: ${ROSTER_FILE}`);
    process.exit(1);
  }
  if (!fs.existsSync(MATCHES_FILE)) {
    console.error(`Matches file not found: ${MATCHES_FILE}`);
    process.exit(1);
  }

  // Get Season 9
  const season9 = await db.query.seasons.findFirst({
    where: eq(schema.seasons.name, "Season 9"),
  });

  if (!season9) {
    console.error("Season 9 not found!");
    process.exit(1);
  }

  console.log(`Found Season 9 with ID: ${season9.id}`);

  // Get or create division
  let division = await db.query.divisions.findFirst({
    where: and(
      eq(schema.divisions.seasonId, season9.id),
      eq(schema.divisions.name, divisionName)
    ),
  });

  if (!division) {
    console.log(`Creating ${divisionName} division...`);
    const [newDiv] = await db
      .insert(schema.divisions)
      .values({ seasonId: season9.id, name: divisionName })
      .returning();
    division = newDiv;
  }

  console.log(`${divisionName} division ID: ${division.id}`);

  // Clear existing data for this division
  const existingSeasonCoaches = await db.query.seasonCoaches.findMany({
    where: eq(schema.seasonCoaches.divisionId, division.id),
  });

  // Clear matches and match pokemon
  const existingMatches = await db.query.matches.findMany({
    where: eq(schema.matches.divisionId, division.id),
  });

  for (const m of existingMatches) {
    await db.delete(schema.matchPokemon).where(eq(schema.matchPokemon.matchId, m.id));
  }
  await db.delete(schema.matches).where(eq(schema.matches.divisionId, division.id));

  // Clear rosters and season coaches
  for (const sc of existingSeasonCoaches) {
    await db.delete(schema.rosters).where(eq(schema.rosters.seasonCoachId, sc.id));
  }
  await db.delete(schema.seasonCoaches).where(eq(schema.seasonCoaches.divisionId, division.id));

  console.log("Cleared existing data for division\n");

  // Parse roster CSV
  console.log("Parsing roster CSV...");
  const teams = parseRosterCSV();
  console.log(`Found ${teams.length} teams\n`);

  // Get Pokemon prices from draft board
  const pokemonPrices = await db.query.seasonPokemonPrices.findMany({
    where: eq(schema.seasonPokemonPrices.seasonId, season9.id),
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

  console.log(`Loaded ${priceMap.size} Pokemon prices from draft board\n`);

  // Create teams and rosters
  const teamToSeasonCoachId = new Map<string, number>();
  let teamsProcessed = 0;
  let rosterEntriesAdded = 0;

  for (const team of teams) {
    console.log(`Processing: ${team.teamName} (${team.coachName})`);

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
      console.log(`  Created coach: ${team.coachName}`);
    }

    // Create season coach
    const [seasonCoach] = await db
      .insert(schema.seasonCoaches)
      .values({
        coachId: coach.id,
        divisionId: division.id,
        teamName: team.teamName,
        teamAbbreviation: team.abbreviation,
        remainingBudget: team.remainingBudget,
        isActive: true,
      })
      .returning();

    teamToSeasonCoachId.set(team.teamName, seasonCoach.id);

    // Add roster entries
    for (let i = 0; i < team.pokemon.length; i++) {
      const poke = team.pokemon[i];
      const normalizedName = normalizePokeNameForDB(poke.name);
      const priceInfo = priceMap.get(normalizedName);

      if (!priceInfo) {
        console.error(`  WARNING: Pokemon "${poke.name}" (${normalizedName}) not found!`);
        continue;
      }

      // Calculate total price including TC cost
      const totalPrice = poke.price;

      await db.insert(schema.rosters).values({
        seasonCoachId: seasonCoach.id,
        pokemonId: priceInfo.pokemonId,
        price: totalPrice,
        draftOrder: i + 1,
        isTeraCaptain: poke.isTeraCaptain,
      });
      rosterEntriesAdded++;
    }

    teamsProcessed++;
    console.log(`  Added ${team.pokemon.length} Pokemon, remaining budget: ${team.remainingBudget}`);
  }

  console.log(`\nTeams processed: ${teamsProcessed}`);
  console.log(`Roster entries added: ${rosterEntriesAdded}\n`);

  // Parse and insert matches
  console.log("Parsing matches CSV...");
  const matches = parseMatchCSV();
  console.log(`Found ${matches.length} matches\n`);

  // Get all Pokemon for matching
  const allPokemon = await db.query.pokemon.findMany();
  const pokemonByName = new Map<string, number>();
  for (const p of allPokemon) {
    pokemonByName.set(p.name.toLowerCase(), p.id);
  }

  function findPokemonId(name: string): number | null {
    const normalized = normalizePokeNameForDB(name);
    if (pokemonByName.has(normalized)) {
      return pokemonByName.get(normalized)!;
    }
    // Try direct match
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

    // Create match
    const [newMatch] = await db
      .insert(schema.matches)
      .values({
        seasonId: season9.id,
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

    // Add Pokemon stats
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

  console.log(`\n========================================`);
  console.log(`Seed complete for ${divisionName}!`);
  console.log(`========================================`);
  console.log(`Teams: ${teamsProcessed}`);
  console.log(`Roster entries: ${rosterEntriesAdded}`);
  console.log(`Matches: ${matchesAdded}`);
  console.log(`Pokemon stats: ${pokemonStatsAdded}`);

  process.exit(0);
}

seedDivision().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
