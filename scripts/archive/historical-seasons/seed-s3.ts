import { db } from "../src/lib/db";
import * as schema from "../src/lib/schema";
import { eq } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

// S3 tier prices from the header row
const TIER_PRICES = [170, 160, 150, 140, 120, 110, 100, 90, 80, 70, 60, 50, 40, 20, 10, 5];

// Name mapping for Pokemon that need special handling
const NAME_FIXES: Record<string, string | null> = {
  // Hisui forms
  "hisui-samurott": "samurott-hisui",
  "hisui-zoroark": "zoroark-hisui",
  "hisui-decidueye": "decidueye-hisui",
  "hisui-electrode": "electrode-hisui",
  "hisui-braviary": "braviary-hisui",
  "hisui-goodra": "goodra-hisui",
  "hisui-qwilfish": "qwilfish-hisui",
  "hisui-sliggoo": "sliggoo-hisui",
  "hisui-avalugg": "avalugg-hisui",
  "hisui-arcanine": "arcanine-hisui",
  "hisui-lilligant": "lilligant-hisui",
  "hisui-typhlosion": "typhlosion-hisui",
  "hisui-sneasel": "sneasel-hisui",

  // Alolan forms
  "alolan-muk": "muk-alola",
  "alolan-raichu": "raichu-alola",
  "alolan-persian": "persian-alola",
  "alolan-dugtrio": "dugtrio-alola",

  // Galarian forms
  "galarian-slowking": "slowking-galar",
  "galarian-moltres": "moltres-galar",
  "galarian-zapdos": "zapdos-galar",
  "slowbro-galar": "slowbro-galar",

  // Paldea forms
  "paldea-tauros-aqua": "tauros-paldea-aqua-breed",
  "paldea-tauros-blaze": "tauros-paldea-blaze-breed",
  "paldea-tauros-combat": "tauros-paldea-combat-breed",

  // Lycanroc forms
  "lycanroc": "lycanroc-midday",
  "lycanroc-dusk": "lycanroc-dusk",
  "lycanroc-midnight": "lycanroc-midnight",

  // Oricorio forms
  "oricorio": "oricorio-baile",
  "oricorio-sensu": "oricorio-sensu",
  "oricorio-pom-pom": "oricorio-pom-pom",
  "oricorio-pau": "oricorio-pau",

  // Rotom forms
  "rotom": "rotom",
  "rotom-wash": "rotom-wash",
  "rotom-heat": "rotom-heat",
  "rotom-mow": "rotom-mow",
  "rotom-frost": "rotom-frost",
  "rotom-fan": "rotom-fan",

  // Thundurus/Tornadus/Landorus/Enamorus forms
  "thundurus": "thundurus-incarnate",
  "thundurus-t": "thundurus-therian",
  "tornadus": "tornadus-incarnate",
  "tornadus-t": "tornadus-therian",
  "landorus-t": "landorus-therian",
  "enamorus": "enamorus-incarnate",
  "enamorus-t": "enamorus-therian",

  // Basculegion forms
  "basculegion-f": "basculegion-female",
  "basculegion-m": "basculegion-male",

  // Indeedee forms
  "indeedee-m": "indeedee-male",
  "indeedee-f": "indeedee-female",

  // Oinkologne forms
  "oinkologne-f": "oinkologne-female",
  "oinkologne-m": "oinkologne-male",

  // Squawkabilly forms
  "squawkabilly (blue)": "squawkabilly-blue-plumage",
  "squawkabilly (white/yellow)": "squawkabilly-white-plumage",

  // Special Pokemon
  "hoopa-u": "hoopa-unbound",
  "hoopa": "hoopa",
  "maushold": "maushold-family-of-four",
  "dudunsparce": "dudunsparce-two-segment",
  "tatsugiri": "tatsugiri-curly",
  "toxtricity": "toxtricity-amped",
  "meloetta": "meloetta-aria",
  "basculin": "basculin-red-striped",
  "tauros": "tauros",
  "vivillion": "vivillon",
  "mimikyu": "mimikyu-disguised",
  "eiscue": "eiscue-ice",
  "polteageist": "polteageist",
  "gyrados": "gyarados",

  // Typos/fixes
  "driftblim": "drifblim",
  "flaafy": "flaaffy",
  "brute bonnet": "brute-bonnet",
  "lando i": null, // Landorus Incarnate - skip as banned
  "iron bundle": null, // Skip banned
  "calyrex-ice-rider": null, // banned
  "calyrex-shadow-rider": null, // banned
  "eternamax eternatus": null, // banned
  "regieleki": null, // banned

  // Delphox and others
  "dragalage": "dragalge",
  "houndstone": "houndstone",
};

function normalizeName(name: string): string | null {
  let normalized = name.toLowerCase().trim();

  // Skip empty or header-like entries
  if (!normalized ||
      normalized.includes("pts") ||
      normalized.includes("tier") ||
      normalized.includes("option") ||
      normalized.includes("banned") ||
      normalized.includes("legal") ||
      normalized.includes("nfe") ||
      normalized.includes("lc are")) {
    return null;
  }

  // Check if we have a specific fix
  if (NAME_FIXES[normalized] !== undefined) {
    return NAME_FIXES[normalized];
  }

  // Standard transformations
  normalized = normalized
    .replace(/['']/g, "")
    .replace(/\s+/g, "-")
    .replace(/\./g, "");

  return normalized;
}

async function main() {
  console.log("Starting S3 seed...\n");

  // 1. Check if S3 already exists
  const existingSeason = await db.query.seasons.findFirst({
    where: eq(schema.seasons.seasonNumber, 3),
  });

  if (existingSeason) {
    console.log("S3 already exists with id:", existingSeason.id);
    console.log("Deleting existing season Pokemon prices...");
    await db.delete(schema.seasonPokemonPrices).where(eq(schema.seasonPokemonPrices.seasonId, existingSeason.id));
  }

  // 2. Create or get S3 season
  let seasonId: number;
  if (existingSeason) {
    seasonId = existingSeason.id;
    // Update budget
    await db.update(schema.seasons).set({ draftBudget: 855 }).where(eq(schema.seasons.id, seasonId));
  } else {
    const [newSeason] = await db.insert(schema.seasons).values({
      name: "Season 3",
      seasonNumber: 3,
      isPublic: true,
      isCurrent: false,
      draftBudget: 855,
    }).returning();
    seasonId = newSeason.id;
    console.log("Created S3 with id:", seasonId);
  }

  // 3. Create divisions (Unova and Kalos)
  const existingDivisions = await db.query.divisions.findMany({
    where: eq(schema.divisions.seasonId, seasonId),
  });

  if (existingDivisions.length === 0) {
    console.log("Creating divisions for S3...");
    await db.insert(schema.divisions).values([
      { seasonId, name: "Unova", displayOrder: 0 },
      { seasonId, name: "Kalos", displayOrder: 1 },
    ]);
    console.log("Created Unova and Kalos divisions");
  } else {
    console.log(`Found ${existingDivisions.length} existing divisions`);
  }

  // 4. Load all Pokemon from DB for matching
  const allPokemon = await db.query.pokemon.findMany();
  const pokemonByName = new Map(allPokemon.map(p => [p.name.toLowerCase(), p]));

  console.log(`Loaded ${allPokemon.length} Pokemon from database\n`);

  // 5. Parse the CSV
  const csvPath = path.join(__dirname, "../data/S3/PBO Unova S3 Doc -  Season 3 Tier List.csv");
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const lines = csvContent.split("\n");

  // Parse Pokemon from each column (skip first column which is banned)
  const pricesToInsert: { pokemonId: number; price: number }[] = [];
  const notFound: string[] = [];
  const skipped: string[] = [];

  for (let lineIdx = 2; lineIdx < lines.length; lineIdx++) { // Start from line 3 (index 2)
    const line = lines[lineIdx];
    if (!line.trim()) continue;

    // Parse CSV properly
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

    // Column 0 is banned Pokemon, skip it
    // Columns 1-16 correspond to prices 170, 160, 150, 140, 120, 110, 100, 90, 80, 70, 60, 50, 40, 20, 10, 5
    for (let colIdx = 1; colIdx <= 16 && colIdx < cols.length; colIdx++) {
      const pokemonName = cols[colIdx]?.replace(/"/g, "").trim();
      if (!pokemonName) continue;

      const normalized = normalizeName(pokemonName);
      if (normalized === null) {
        if (pokemonName && !pokemonName.includes("PTS") && !pokemonName.includes("TIER")) {
          skipped.push(pokemonName);
        }
        continue;
      }

      const pokemon = pokemonByName.get(normalized);
      if (pokemon) {
        const price = TIER_PRICES[colIdx - 1];
        pricesToInsert.push({ pokemonId: pokemon.id, price });
      } else {
        notFound.push(`${pokemonName} -> ${normalized}`);
      }
    }
  }

  console.log(`Parsed ${pricesToInsert.length} Pokemon prices`);

  if (skipped.length > 0) {
    console.log(`\nSkipped ${skipped.length} entries (banned/notes)`);
  }

  if (notFound.length > 0) {
    console.log(`\n⚠️  Not found (${notFound.length}):`);
    // Dedupe
    const unique = [...new Set(notFound)];
    unique.forEach(n => console.log(`  - ${n}`));
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
