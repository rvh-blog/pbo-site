import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and } from "drizzle-orm";
import * as schema from "./schema";

const sqlite = new Database("./data/pbo.db");
const db = drizzle(sqlite, { schema });

// Tera captain data from CSV - Pokemon names marked with "T" in the CSV
const teraCaptainsByTeam: Record<string, string[]> = {
  "Helsinki Jellicent Klub": ["Iron Moth", "Kingambit", "Milotic"],
  "Philadelphia PZs": ["Annihilape", "Galarian Moltres", "Volcanion"],
  "Dreary Lane Darmanitans": ["Skeledirge", "Haxorus", "Braviary"],
  "Lion City Leech Life": ["Hawlucha", "Chi-Yu", "Reuniclus"],
  "Edinburgh Enamorus": ["Salamence", "Gliscor", "Suicune"],
  "Cherry Hill Bellsprouts": ["Iron Jugulis", "Ogerpon-Teal", "Ogerpon-T"],
  "Syracuse Snorlax": ["Thundurus", "Cetitan"],
  "Alabama Feraligatrs": ["Excadrill", "Jolteon", "Gardevoir"],
  "Blasphemous Blacephalons": ["Greninja", "Comfey", "Garganacl"],
  "London Lunalas": ["Archaludon", "Ursaluna", "Barraskewda"],
  "Milton Keynes M'Ladies": ["Magnezone", "Meloetta", "Serperior"],
  "Prophet of the Pantheon": ["Hydrapple", "Snorlax"],
  "The Pokerangers": ["Gholdengo", "Quaquaval", "Sandy Shocks"],
  "Charleston Chesnaughts": ["Landorus-Therian", "Mew", "Gengar"],
};

// Name mappings for Pokemon forms (database name -> CSV names)
const nameNormalizations: Record<string, string[]> = {
  "Iron-moth": ["Iron Moth"],
  "Iron-jugulis": ["Iron Jugulis"],
  "Moltres-galar": ["Galarian Moltres"],
  "Ogerpon": ["Ogerpon-Teal", "Ogerpon-T"],
  "Thundurus-incarnate": ["Thundurus"],
  "Chi-yu": ["Chi-Yu"],
  "Ursaluna": ["Ursaluna"],
  "Sandy-shocks": ["Sandy Shocks"],
  "Landorus-therian": ["Landorus-Therian"],
  "Meloetta-aria": ["Meloetta"],
};

function matchesTeraCaptain(pokemonName: string, teraCaptains: string[]): boolean {
  // Direct match
  if (teraCaptains.includes(pokemonName)) return true;

  // Check normalized names
  const normalizedName = pokemonName.toLowerCase();
  for (const tc of teraCaptains) {
    if (tc.toLowerCase() === normalizedName) return true;
    // Check if the Pokemon name matches any normalization
    for (const [dbName, csvNames] of Object.entries(nameNormalizations)) {
      if (dbName.toLowerCase() === normalizedName && csvNames.some(cn => teraCaptains.includes(cn))) {
        return true;
      }
    }
  }
  return false;
}

async function updateTeraCaptains() {
  console.log("Updating tera captain flags...\n");

  // Get all season coaches with their rosters
  const allSeasonCoaches = await db.query.seasonCoaches.findMany({
    with: {
      rosters: {
        with: { pokemon: true },
      },
    },
  });

  let updated = 0;
  let checked = 0;

  for (const sc of allSeasonCoaches) {
    const teraCaptains = teraCaptainsByTeam[sc.teamName];
    if (!teraCaptains) continue;

    console.log(`\n${sc.teamName}:`);

    for (const roster of sc.rosters) {
      checked++;
      const isTeraCaptain = matchesTeraCaptain(roster.pokemon.name, teraCaptains);

      if (isTeraCaptain && !roster.isTeraCaptain) {
        console.log(`  ✓ Setting ${roster.pokemon.name} as tera captain`);
        await db
          .update(schema.rosters)
          .set({ isTeraCaptain: true })
          .where(eq(schema.rosters.id, roster.id));
        updated++;
      } else if (isTeraCaptain) {
        console.log(`  - ${roster.pokemon.name} already marked as tera captain`);
      }
    }
  }

  console.log(`\n✅ Update complete!`);
  console.log(`   Roster entries checked: ${checked}`);
  console.log(`   Tera captains updated: ${updated}`);

  process.exit(0);
}

updateTeraCaptains().catch((err) => {
  console.error("Update failed:", err);
  process.exit(1);
});
