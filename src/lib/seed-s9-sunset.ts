import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and } from "drizzle-orm";
import * as schema from "./schema";

const sqlite = new Database("./data/pbo.db");
const db = drizzle(sqlite, { schema });

// CSV Data parsed from "Sunset S9 - Rosters.csv"
// 14 teams total in Sunset division

interface TeamData {
  teamName: string;
  abbreviation: string;
  coachName: string;
  pokemon: { name: string; isTeraCaptain: boolean }[];
}

const sunsetTeams: TeamData[] = [
  // First group (rows 2-13)
  {
    teamName: "Helsinki Jellicent Klub",
    abbreviation: "HJK",
    coachName: "uprafael",
    pokemon: [
      { name: "Dragapult", isTeraCaptain: false },
      { name: "Iron Moth", isTeraCaptain: true },
      { name: "Donphan", isTeraCaptain: false },
      { name: "Kingambit", isTeraCaptain: true },
      { name: "Clefable", isTeraCaptain: false },
      { name: "Galarian Zapdos", isTeraCaptain: false },
      { name: "Forretress", isTeraCaptain: false },
      { name: "Milotic", isTeraCaptain: true },
      { name: "Rotom-Mow", isTeraCaptain: false },
      { name: "Munkidori", isTeraCaptain: false },
    ],
  },
  {
    teamName: "Philadelphia PZs",
    abbreviation: "PPZ",
    coachName: "Jarv",
    pokemon: [
      { name: "Iron Valiant", isTeraCaptain: false },
      { name: "Iron Treads", isTeraCaptain: false },
      { name: "Annihilape", isTeraCaptain: true },
      { name: "Uxie", isTeraCaptain: false },
      { name: "Araquanid", isTeraCaptain: false },
      { name: "Galarian Moltres", isTeraCaptain: true },
      { name: "Volcanion", isTeraCaptain: true },
      { name: "Lycanroc-Dusk", isTeraCaptain: false },
      { name: "Hisuian Electrode", isTeraCaptain: false },
      { name: "Arbok", isTeraCaptain: false },
    ],
  },
  {
    teamName: "Dreary Lane Darmanitans",
    abbreviation: "DLD",
    coachName: "Muffenman",
    pokemon: [
      { name: "Urshifu-Single-Strike", isTeraCaptain: false },
      { name: "Zapdos", isTeraCaptain: false },
      { name: "Skeledirge", isTeraCaptain: true },
      { name: "Haxorus", isTeraCaptain: true },
      { name: "Jirachi", isTeraCaptain: false },
      { name: "Mamoswine", isTeraCaptain: false },
      { name: "Sylveon", isTeraCaptain: false },
      { name: "Braviary", isTeraCaptain: true },
      { name: "Tsareena", isTeraCaptain: false },
      { name: "Keldeo", isTeraCaptain: false },
    ],
  },
  {
    teamName: "Lion City Leech Life",
    abbreviation: "LCLL",
    coachName: "shadow2054",
    pokemon: [
      { name: "Ting-Lu", isTeraCaptain: false },
      { name: "Pecharunt", isTeraCaptain: false },
      { name: "Hawlucha", isTeraCaptain: true },
      { name: "Rillaboom", isTeraCaptain: false },
      { name: "Cyclizar", isTeraCaptain: false },
      { name: "Iron Bundle", isTeraCaptain: false },
      { name: "Orthworm", isTeraCaptain: false },
      { name: "Chi-Yu", isTeraCaptain: true },
      { name: "Reuniclus", isTeraCaptain: true },
      { name: "Alcremie", isTeraCaptain: false },
    ],
  },
  {
    teamName: "Edinburgh Enamorus",
    abbreviation: "EE",
    coachName: "Geo",
    pokemon: [
      { name: "Deoxys-Speed", isTeraCaptain: false },
      { name: "Salamence", isTeraCaptain: true },
      { name: "Gliscor", isTeraCaptain: true },
      { name: "Cinderace", isTeraCaptain: false },
      { name: "Enamorus", isTeraCaptain: false },
      { name: "Metagross", isTeraCaptain: false },
      { name: "Alolan Muk", isTeraCaptain: false },
      { name: "Conkeldurr", isTeraCaptain: false },
      { name: "Suicune", isTeraCaptain: true },
      { name: "Banette", isTeraCaptain: false },
    ],
  },
  {
    teamName: "Cherry Hill Bellsprouts",
    abbreviation: "CHB",
    coachName: "hotpepper22",
    pokemon: [
      { name: "Terapagos", isTeraCaptain: false },
      { name: "Iron Jugulis", isTeraCaptain: true },
      { name: "Ogerpon-Teal", isTeraCaptain: true },
      { name: "Landorus", isTeraCaptain: false },
      { name: "Empoleon", isTeraCaptain: false },
      { name: "Fezandipiti", isTeraCaptain: false },
      { name: "Enamorus-Therian", isTeraCaptain: false },
      { name: "Rotom-Heat", isTeraCaptain: false },
      { name: "Iron Hands", isTeraCaptain: false },
      { name: "Grafaiai", isTeraCaptain: false },
    ],
  },
  {
    teamName: "Syracuse Snorlax",
    abbreviation: "SS",
    coachName: "TheITB",
    pokemon: [
      { name: "Great Tusk", isTeraCaptain: false },
      { name: "Galarian Slowking", isTeraCaptain: false },
      { name: "Kyurem", isTeraCaptain: false },
      { name: "Thundurus", isTeraCaptain: true },
      { name: "Scizor", isTeraCaptain: false },
      { name: "Ogerpon-Wellspring", isTeraCaptain: false },
      { name: "Cetitan", isTeraCaptain: true },
      { name: "Alolan Ninetales", isTeraCaptain: false },
      { name: "Hisuian Qwilfish", isTeraCaptain: false },
      { name: "Bruxish", isTeraCaptain: false },
    ],
  },
  // Second group (rows 18-29)
  {
    teamName: "Alabama Feraligatrs",
    abbreviation: "AF",
    coachName: "BlueFusion321",
    pokemon: [
      { name: "Excadrill", isTeraCaptain: true },
      { name: "Tyranitar", isTeraCaptain: false },
      { name: "Skarmory", isTeraCaptain: false },
      { name: "Hisuian Samurott", isTeraCaptain: false },
      { name: "Latios", isTeraCaptain: false },
      { name: "Blaziken", isTeraCaptain: false },
      { name: "Qwilfish", isTeraCaptain: false },
      { name: "Decidueye", isTeraCaptain: false },
      { name: "Jolteon", isTeraCaptain: true },
      { name: "Gardevoir", isTeraCaptain: true },
    ],
  },
  {
    teamName: "Blasphemous Blacephalons",
    abbreviation: "BB",
    coachName: "beeboop",
    pokemon: [
      { name: "Greninja", isTeraCaptain: true },
      { name: "Gouging Fire", isTeraCaptain: false },
      { name: "Sneasler", isTeraCaptain: false },
      { name: "Corviknight", isTeraCaptain: false },
      { name: "Slowking", isTeraCaptain: false },
      { name: "Arboliva", isTeraCaptain: false },
      { name: "Comfey", isTeraCaptain: true },
      { name: "Garganacl", isTeraCaptain: true },
      { name: "Sableye", isTeraCaptain: false },
      { name: "Cryogonal", isTeraCaptain: false },
    ],
  },
  {
    teamName: "London Lunalas",
    abbreviation: "LOL",
    coachName: "BigDave",
    pokemon: [
      { name: "Tornadus-Therian", isTeraCaptain: false },
      { name: "Paldean Tauros (Water)", isTeraCaptain: false },
      { name: "Archaludon", isTeraCaptain: true },
      { name: "Raging Bolt", isTeraCaptain: false },
      { name: "Ursaluna", isTeraCaptain: true },
      { name: "Clodsire", isTeraCaptain: false },
      { name: "Barraskewda", isTeraCaptain: true },
      { name: "Ribombee", isTeraCaptain: false },
      { name: "Pelipper", isTeraCaptain: false },
      { name: "Alolan Persian", isTeraCaptain: false },
    ],
  },
  {
    teamName: "Milton Keynes M'Ladies",
    abbreviation: "MKM",
    coachName: "Ryushi",
    pokemon: [
      { name: "Garchomp", isTeraCaptain: false },
      { name: "Primarina", isTeraCaptain: false },
      { name: "Weavile", isTeraCaptain: false },
      { name: "Glimmora", isTeraCaptain: false },
      { name: "Magnezone", isTeraCaptain: true },
      { name: "Volcarona", isTeraCaptain: false },
      { name: "Hisuian Zoroark", isTeraCaptain: false },
      { name: "Meloetta", isTeraCaptain: true },
      { name: "Serperior", isTeraCaptain: true },
      { name: "Drifblim", isTeraCaptain: false },
    ],
  },
  {
    teamName: "Prophet of the Pantheon",
    abbreviation: "PP",
    coachName: "MadMac",
    pokemon: [
      { name: "Palafin", isTeraCaptain: false },
      { name: "Hydrapple", isTeraCaptain: true },
      { name: "Darkrai", isTeraCaptain: false },
      { name: "Heatran", isTeraCaptain: false },
      { name: "Mandibuzz", isTeraCaptain: false },
      { name: "Hippowdon", isTeraCaptain: false },
      { name: "Deoxys-Defense", isTeraCaptain: false },
      { name: "Snorlax", isTeraCaptain: true },
      { name: "Dusknoir", isTeraCaptain: false },
      { name: "Klefki", isTeraCaptain: false },
    ],
  },
  {
    teamName: "The Pokerangers",
    abbreviation: "TPR",
    coachName: "Leo",
    pokemon: [
      { name: "Roaring Moon", isTeraCaptain: false },
      { name: "Gholdengo", isTeraCaptain: true },
      { name: "Quaquaval", isTeraCaptain: true },
      { name: "Ursaluna-Bloodmoon", isTeraCaptain: false },
      { name: "Moltres", isTeraCaptain: false },
      { name: "Sandy Shocks", isTeraCaptain: true },
      { name: "Azumarill", isTeraCaptain: false },
      { name: "Mesprit", isTeraCaptain: false },
      { name: "Swalot", isTeraCaptain: false },
      { name: "Quilladin", isTeraCaptain: false },
    ],
  },
  {
    teamName: "Charleston Chesnaughts",
    abbreviation: "CC",
    coachName: "Don",
    pokemon: [
      { name: "Meowscarada", isTeraCaptain: false },
      { name: "Landorus-Therian", isTeraCaptain: true },
      { name: "Mew", isTeraCaptain: true },
      { name: "Tinkaton", isTeraCaptain: false },
      { name: "Blastoise", isTeraCaptain: false },
      { name: "Ogerpon-Hearthflame", isTeraCaptain: false },
      { name: "Dragonite", isTeraCaptain: false },
      { name: "Gengar", isTeraCaptain: true },
      { name: "Rotom", isTeraCaptain: false },
      { name: "Lycanroc-Midday", isTeraCaptain: false },
    ],
  },
];

// Map CSV Pokemon names to database names (handle spaces vs hyphens, special forms)
function normalizePokeNameForDB(name: string): string {
  const mappings: Record<string, string> = {
    "Iron Moth": "Iron-moth",
    "Iron Valiant": "Iron-valiant",
    "Iron Treads": "Iron-treads",
    "Iron Bundle": "Iron-bundle",
    "Iron Jugulis": "Iron-jugulis",
    "Iron Hands": "Iron-hands",
    "Urshifu-Single-Strike": "Urshifu-single-strike",
    "Galarian Zapdos": "Zapdos-galar",
    "Galarian Moltres": "Moltres-galar",
    "Galarian Slowking": "Slowking-galar",
    "Alolan Muk": "Muk-alola",
    "Alolan Ninetales": "Ninetales-alola",
    "Alolan Persian": "Persian-alola",
    "Hisuian Electrode": "Electrode-hisui",
    "Hisuian Samurott": "Samurott-hisui",
    "Hisuian Qwilfish": "Qwilfish-hisui",
    "Hisuian Zoroark": "Zoroark-hisui",
    "Hisuian Goodra": "Goodra-hisui",
    // Ogerpon forms - base Ogerpon is the teal mask form
    "Ogerpon-Teal": "Ogerpon",
    "Ogerpon-T": "Ogerpon",
    "Ogerpon-Wellspring": "Ogerpon-wellspring-mask",
    "Ogerpon-W": "Ogerpon-wellspring-mask",
    "Ogerpon-Hearthflame": "Ogerpon-hearthflame-mask",
    "Ogerpon-H": "Ogerpon-hearthflame-mask",
    // Base forms use -incarnate suffix
    "Tornadus-Therian": "Tornadus-therian",
    "Landorus-Therian": "Landorus-therian",
    "Landorus": "Landorus-incarnate",
    "Thundurus": "Thundurus-incarnate",
    "Thundurus-Therian": "Thundurus-therian",
    "Enamorus-Therian": "Enamorus-therian",
    "Enamorus": "Enamorus-incarnate",
    "Ursaluna-Bloodmoon": "Ursaluna-bloodmoon",
    "Ursaluna-BM": "Ursaluna-bloodmoon",
    // Lycanroc forms
    "Lycanroc-Dusk": "Lycanroc-dusk",
    "Lycanroc-Midday": "Lycanroc-midday",
    // Deoxys forms
    "Deoxys-Speed": "Deoxys-speed",
    "Deoxys-Defense": "Deoxys-defense",
    // Rotom forms
    "Rotom-Mow": "Rotom-mow",
    "Rotom-Heat": "Rotom-heat",
    // Paldean Tauros
    "Paldean Tauros (Water)": "Tauros-paldea-aqua-breed",
    // Paradox Pokemon
    "Gouging Fire": "Gouging-fire",
    "Raging Bolt": "Raging-bolt",
    "Great Tusk": "Great-tusk",
    "Sandy Shocks": "Sandy-shocks",
    "Roaring Moon": "Roaring-moon",
    // Treasures of Ruin
    "Chi-Yu": "Chi-yu",
    "Ting-Lu": "Ting-lu",
    // Other forms
    "Keldeo": "Keldeo-ordinary",
    "Meloetta": "Meloetta-aria",
    "Palafin": "Palafin-hero",
  };

  return mappings[name] || name;
}

async function seedS9Sunset() {
  console.log("Seeding S9 Sunset division rosters...");

  // 1. Get Season 9
  const season9 = await db.query.seasons.findFirst({
    where: eq(schema.seasons.name, "Season 9"),
  });

  if (!season9) {
    console.error("Season 9 not found!");
    process.exit(1);
  }

  console.log(`Found Season 9 with ID: ${season9.id}`);

  // 2. Rename Division A to Sunset (or create if doesn't exist)
  let sunsetDivision = await db.query.divisions.findFirst({
    where: and(
      eq(schema.divisions.seasonId, season9.id),
      eq(schema.divisions.name, "Division A")
    ),
  });

  if (sunsetDivision) {
    console.log("Renaming Division A to Sunset...");
    await db
      .update(schema.divisions)
      .set({ name: "Sunset" })
      .where(eq(schema.divisions.id, sunsetDivision.id));
    sunsetDivision = { ...sunsetDivision, name: "Sunset" };
  } else {
    // Check if Sunset already exists
    sunsetDivision = await db.query.divisions.findFirst({
      where: and(
        eq(schema.divisions.seasonId, season9.id),
        eq(schema.divisions.name, "Sunset")
      ),
    });

    if (!sunsetDivision) {
      console.log("Creating Sunset division...");
      const [newDiv] = await db
        .insert(schema.divisions)
        .values({ seasonId: season9.id, name: "Sunset" })
        .returning();
      sunsetDivision = newDiv;
    }
  }

  console.log(`Sunset division ID: ${sunsetDivision.id}`);

  // 3. Clear existing rosters for this division
  const existingSeasonCoaches = await db.query.seasonCoaches.findMany({
    where: eq(schema.seasonCoaches.divisionId, sunsetDivision.id),
  });

  for (const sc of existingSeasonCoaches) {
    await db.delete(schema.rosters).where(eq(schema.rosters.seasonCoachId, sc.id));
  }

  // Delete existing season coaches for this division
  await db.delete(schema.seasonCoaches).where(
    eq(schema.seasonCoaches.divisionId, sunsetDivision.id)
  );

  console.log("Cleared existing roster data for Sunset division");

  // 4. Get Pokemon prices from draft board
  const pokemonPrices = await db.query.seasonPokemonPrices.findMany({
    where: eq(schema.seasonPokemonPrices.seasonId, season9.id),
    with: {
      pokemon: true,
    },
  });

  const priceMap = new Map<string, {
    pokemonId: number;
    price: number;
    teraCaptainCost: number | null
  }>();

  for (const pp of pokemonPrices) {
    priceMap.set(pp.pokemon.name.toLowerCase(), {
      pokemonId: pp.pokemonId,
      price: pp.price,
      teraCaptainCost: pp.teraCaptainCost,
    });
  }

  console.log(`Loaded ${priceMap.size} Pokemon prices from draft board`);

  // Calculate budget from remaining budget in CSV
  // Row 16 shows remaining: 0 (HJK), 0 (PPZ), 1 (DLD), 0 (LCLL), 1 (EE), 0 (CHB), 0 (SS) = avg ~0
  // Row 32 shows remaining: 0 (AF), 6 (BB), 2 (LOL), 1 (MKM), 1 (PP), 0 (TPR), 0 (CC)
  // This confirms budget was ~115-120 range
  const draftBudget = 120; // Will verify with team totals

  // 5. Process each team
  let teamsProcessed = 0;
  let rosterEntriesAdded = 0;

  for (const team of sunsetTeams) {
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
      console.log(`  Created coach: ${team.coachName}`);
    }

    // Calculate total spent
    let totalSpent = 0;
    const rosterEntries: { pokemonId: number; price: number; draftOrder: number; isTeraCaptain: boolean }[] = [];

    for (let i = 0; i < team.pokemon.length; i++) {
      const poke = team.pokemon[i];
      const normalizedName = normalizePokeNameForDB(poke.name).toLowerCase();
      const priceInfo = priceMap.get(normalizedName);

      if (!priceInfo) {
        console.error(`  WARNING: Pokemon "${poke.name}" (normalized: ${normalizedName}) not found in draft board!`);
        continue;
      }

      let price = priceInfo.price;
      if (poke.isTeraCaptain && priceInfo.teraCaptainCost !== null) {
        price += priceInfo.teraCaptainCost;
      }

      totalSpent += price;
      rosterEntries.push({
        pokemonId: priceInfo.pokemonId,
        price,
        draftOrder: i + 1,
        isTeraCaptain: poke.isTeraCaptain,
      });
    }

    const remainingBudget = draftBudget - totalSpent;
    console.log(`  Total spent: ${totalSpent}, Remaining: ${remainingBudget}`);

    // Create season coach
    const [seasonCoach] = await db
      .insert(schema.seasonCoaches)
      .values({
        coachId: coach.id,
        divisionId: sunsetDivision.id,
        teamName: team.teamName,
        teamAbbreviation: team.abbreviation,
        remainingBudget,
        isActive: true,
      })
      .returning();

    // Add roster entries
    for (const entry of rosterEntries) {
      await db.insert(schema.rosters).values({
        seasonCoachId: seasonCoach.id,
        pokemonId: entry.pokemonId,
        price: entry.price,
        draftOrder: entry.draftOrder,
        isTeraCaptain: entry.isTeraCaptain,
      });
      rosterEntriesAdded++;
    }

    teamsProcessed++;
    console.log(`  Added ${rosterEntries.length} Pokemon to roster`);
  }

  console.log(`\n✅ Seed complete!`);
  console.log(`   Teams processed: ${teamsProcessed}`);
  console.log(`   Roster entries added: ${rosterEntriesAdded}`);

  process.exit(0);
}

seedS9Sunset().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
