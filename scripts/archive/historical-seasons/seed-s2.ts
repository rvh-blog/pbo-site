import { db } from "../src/lib/db";
import * as schema from "../src/lib/schema";
import { eq } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

// S2 tier prices
const TIER_PRICES: Record<string, number> = {
  "TIER 1 (OU)": 180,
  "TIER 2 (UU)": 120,
  "TIER 3 (RU)": 100,
  "TIER 4 (NU)": 60,
  "TIER 5 (PU)": 40,
};

// Name mapping for Pokemon that need special handling
// null = skip this entry
const NAME_FIXES: Record<string, string | null> = {
  // Hisui forms
  "arcanine-hisui": "arcanine-hisui",
  "basculegion female": "basculegion-female",
  "basculegion male": "basculegion-male",
  "braviary-hisui": "braviary-hisui",
  "decidueye-hisui": "decidueye-hisui",
  "goodra-hisui": "goodra-hisui",
  "lilligant-hisui": "lilligant-hisui",
  "samurott-hisui": "samurott-hisui",
  "typhlosion-hisui": "typhlosion-hisui",
  "zoroark-hisui": "zoroark-hisui",
  "zorua-hisui": "zorua-hisui",
  "avalugg-hisui": "avalugg-hisui",
  "electrode-hisui": "electrode-hisui",
  "qwilfish-hisui": "qwilfish-hisui",
  "decidueye": "decidueye",
  "avalugg": "avalugg",
  "qwilfish": "qwilfish",

  // Paldea forms
  "tauros-paldea-aqua": "tauros-paldea-aqua-breed",
  "tauros-paldea-blaze": "tauros-paldea-blaze-breed",
  "tauros-paldea-combat": "tauros-paldea-combat-breed",

  // Lycanroc forms
  "lycanroc": "lycanroc-midday",
  "lycanroc-dusk": "lycanroc-dusk",
  "lycanroc-midnight": "lycanroc-midnight",

  // Oricorio forms
  "oricorio (fire)": "oricorio-baile",
  "oricorio-pa'u": "oricorio-pau",
  "oricorio-pom-pom": "oricorio-pom-pom",
  "oricorio-sensu": "oricorio-sensu",

  // Rotom forms
  "rotom": "rotom",
  "rotom-wash": "rotom-wash",
  "rotom-heat": "rotom-heat",
  "rotom-mow": "rotom-mow",
  "rotom-frost": "rotom-frost",
  "rotom-fan": "rotom-fan",

  // Enamorus forms
  "enamorus": "enamorus-incarnate",
  "enamorus-therian": "enamorus-therian",

  // Oinkologne forms
  "oinkologne (female)": "oinkologne-female",

  // Squawkabilly forms
  "squawkabilly (green & blue)": "squawkabilly-green-plumage",
  "squawkabilly (white & yellow)": "squawkabilly-white-plumage",

  // Indeedee forms
  "indeedee male": "indeedee-male",
  "indeedee-f": "indeedee-female",

  // Special cases
  "greninja(no battle bond)": "greninja",
  "orthoworm (no shed tail)": "orthworm",
  "dugtrio (no arena trap)": "dugtrio",
  "gothitelle (no shadow tag)": "gothitelle",
  "hippodown": "hippowdon",
  "tyrantitar": "tyranitar",
  "gyrados": "gyarados",
  "grafaifai": "grafaiai",
  "hes": null, // typo in spreadsheet, skip
  "maushold": "maushold-family-of-four",
  "dundunsparce": "dudunsparce-two-segment",
  "polteageist": "polteageist",
  "tatsugiri": "tatsugiri-curly",
  "toxitricity": "toxtricity-amped",
  "basculin": "basculin-red-striped",
  "basculin-blue-striped": "basculin-blue-striped",

  // Typos/fixes from S2 spreadsheet
  "datrix": "dartrix",
  "eiscue": "eiscue-ice",
  "mabosstif": "mabosstiff",
  "mimikyu": "mimikyu-disguised",
  "quaquval": "quaquaval",
  "oinkologne (male)": "oinkologne-male",
};

function normalizeName(name: string): string {
  // Clean up the name
  let normalized = name.toLowerCase().trim();

  // Check if we have a specific fix
  if (NAME_FIXES[normalized] !== undefined) {
    return NAME_FIXES[normalized] || ""; // null means skip
  }

  // Standard transformations
  normalized = normalized
    .replace(/['']/g, "") // Remove apostrophes
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/\./g, "") // Remove periods
    .replace(/♀/g, "-f")
    .replace(/♂/g, "-m");

  return normalized;
}

async function main() {
  console.log("Starting S2 seed...\n");

  // 1. Check if S2 already exists
  const existingSeason = await db.query.seasons.findFirst({
    where: eq(schema.seasons.seasonNumber, 2),
  });

  if (existingSeason) {
    console.log("S2 already exists with id:", existingSeason.id);
    console.log("Deleting existing season Pokemon prices...");
    await db.delete(schema.seasonPokemonPrices).where(eq(schema.seasonPokemonPrices.seasonId, existingSeason.id));
  }

  // 2. Create or get S2 season
  let seasonId: number;
  if (existingSeason) {
    seasonId = existingSeason.id;
  } else {
    const [newSeason] = await db.insert(schema.seasons).values({
      name: "Season 2",
      seasonNumber: 2,
      isPublic: true,
      isCurrent: false,
    }).returning();
    seasonId = newSeason.id;
    console.log("Created S2 with id:", seasonId);
  }

  // 3. Load all Pokemon from DB for matching
  const allPokemon = await db.query.pokemon.findMany();
  const pokemonByName = new Map(allPokemon.map(p => [p.name.toLowerCase(), p]));

  console.log(`Loaded ${allPokemon.length} Pokemon from database\n`);

  // 4. Parse the CSV
  const csvPath = path.join(__dirname, "../data/S2/PBO Season 2 Doc  - PBO Season 2 Tier List.csv");
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const lines = csvContent.split("\n");

  // Parse header to get tier columns
  const header = lines[0].split(",");
  const tierColumns: { name: string; price: number; colIndex: number }[] = [];

  for (let i = 0; i < header.length; i++) {
    const col = header[i].replace(/"/g, "").trim();
    if (TIER_PRICES[col]) {
      tierColumns.push({ name: col, price: TIER_PRICES[col], colIndex: i });
    }
  }

  console.log("Found tiers:", tierColumns.map(t => `${t.name} = ${t.price}`).join(", "));

  // 5. Parse Pokemon from each tier
  const pricesToInsert: { pokemonId: number; price: number }[] = [];
  const notFound: string[] = [];
  const skipped: string[] = [];

  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    if (!line.trim()) continue;

    // Parse CSV properly (handle commas in quotes)
    const cols: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        cols.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    cols.push(current.trim());

    for (const tier of tierColumns) {
      const pokemonName = cols[tier.colIndex]?.replace(/"/g, "").trim();
      if (!pokemonName) continue;

      // Skip notes/comments
      if (pokemonName.startsWith("All Not Valid") ||
          pokemonName.startsWith("Anything Below") ||
          pokemonName.toLowerCase().includes("are banned")) {
        continue;
      }

      const normalized = normalizeName(pokemonName);
      if (!normalized) {
        skipped.push(pokemonName);
        continue;
      }

      const pokemon = pokemonByName.get(normalized);
      if (pokemon) {
        pricesToInsert.push({ pokemonId: pokemon.id, price: tier.price });
      } else {
        notFound.push(`${pokemonName} -> ${normalized}`);
      }
    }
  }

  console.log(`\nParsed ${pricesToInsert.length} Pokemon prices`);

  if (skipped.length > 0) {
    console.log(`\nSkipped ${skipped.length} entries:`, skipped.slice(0, 10).join(", "));
  }

  if (notFound.length > 0) {
    console.log(`\n⚠️  Not found (${notFound.length}):`);
    notFound.forEach(n => console.log(`  - ${n}`));
  }

  // 6. Insert prices
  if (pricesToInsert.length > 0) {
    console.log(`\nInserting ${pricesToInsert.length} season Pokemon prices...`);

    await db.insert(schema.seasonPokemonPrices).values(
      pricesToInsert.map(p => ({
        seasonId,
        pokemonId: p.pokemonId,
        price: p.price,
      }))
    );

    console.log("✅ Done!");
  }

  // Summary by tier
  const byTier = new Map<number, number>();
  for (const p of pricesToInsert) {
    byTier.set(p.price, (byTier.get(p.price) || 0) + 1);
  }
  console.log("\nSummary by tier:");
  for (const [price, count] of [...byTier.entries()].sort((a, b) => b[0] - a[0])) {
    console.log(`  ${price}: ${count} Pokemon`);
  }
}

main().catch(console.error);
