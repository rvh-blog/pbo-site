import { db } from "../src/lib/db";
import * as schema from "../src/lib/schema";
import { eq } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

// S4 tier prices from the header row (columns 1-25)
const TIER_PRICES = [250, 240, 230, 220, 210, 200, 190, 180, 170, 160, 150, 140, 130, 120, 110, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10];

// Name mapping for Pokemon that need special handling
const NAME_FIXES: Record<string, string | null> = {
  // Hisui forms
  "arcanine-hisui": "arcanine-hisui",
  "basculegion-f": "basculegion-female",
  "basculegion-m": "basculegion-male",
  "braviary-hisui": "braviary-hisui",
  "decidueye-hisui": "decidueye-hisui",
  "electrode-hisui": "electrode-hisui",
  "goodra-hisui": "goodra-hisui",
  "hisui-qwilfish": "qwilfish-hisui",
  "hisui-avalugg": "avalugg-hisui",
  "hisui-sliggoo": "sliggoo-hisui",
  "hisui-sneasel": "sneasel-hisui",
  "typhlosion-hisui": "typhlosion-hisui",
  "zoroark-hisui": "zoroark-hisui",
  "samurott-hisui": "samurott-hisui",

  // Alolan forms
  "ninetales-alolan": "ninetales-alola",
  "muk-alolan": "muk-alola",
  "raichu-alolan": "raichu-alola",
  "persian-alola": "persian-alola",
  "golem-alola": "golem-alola",
  "sandslash-alolan": "sandslash-alola",
  "alolan dugtrio": "dugtrio-alola",
  "alolan-vulpix": "vulpix-alola",

  // Galarian forms
  "galarian slowking": "slowking-galar",
  "galarian-moltres": "moltres-galar",
  "galarian-zapdos": "zapdos-galar",
  "slowbro-galar": "slowbro-galar",
  "weezing-galar": "weezing-galar",

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
  "thundurus-i": "thundurus-incarnate",
  "thundurus-t": "thundurus-therian",
  "tornadus-i": "tornadus-incarnate",
  "tornadus-t": "tornadus-therian",
  "landorus-t": "landorus-therian",
  "enamorus": "enamorus-incarnate",
  "enamorus-t": "enamorus-therian",

  // Ogerpon forms
  "ogerpon wellspring mask": "ogerpon-wellspring-mask",
  "ogerpon hearthflame mask": "ogerpon-hearthflame-mask",
  "ogerpon cornerstone mask": "ogerpon-cornerstone-mask",
  "ogerpon teal mask": "ogerpon-teal-mask",

  // Indeedee forms
  "indeedee-m": "indeedee-male",
  "indeedee-f": "indeedee-female",

  // Oinkologne forms
  "oinkologne-f": "oinkologne-female",
  "oinkologne-m": "oinkologne-male",

  // Squawkabilly forms
  "squawkabilly (blue)": "squawkabilly-blue-plumage",
  "squawkabilly (white/yellow)": "squawkabilly-white-plumage",

  // Special Pokemon with restrictions (treat as normal)
  "kommo-o (no clagorous soul)": "kommo-o",
  "manaphy (no take heart)": "manaphy",
  "cyclizar (no shed tail)": "cyclizar",
  "pawmot (no revival blessing)": "pawmot",
  "orthworm (no shed tail)": "orthworm",
  "sneasler (no dire claw)": "sneasler",
  "dugtrio (no arena trap)": "dugtrio",

  // Other forms
  "hoopa-unbound": "hoopa-unbound",
  "ursaluna bloodmoon": "ursaluna-bloodmoon",
  "maushold": "maushold-family-of-four",
  "dudunsparce": "dudunsparce-two-segment",
  "tatsugiri": "tatsugiri-curly",
  "toxtricity": "toxtricity-amped",
  "meloetta": "meloetta-aria",
  "basculin": "basculin-red-striped",
  "mimikyu": "mimikyu-disguised",
  "eiscue": "eiscue-ice",
  "polteageist": "polteageist",
  "sinistcha": "sinistcha",
  "shaymin": "shaymin-land",
  "decidueye": "decidueye",

  // Typos
  "farigarif": "farigiraf",
  "marinie": "mareanie",
  "morpeko": "morpeko-full-belly",
  "flaafy": "flaaffy",
  "vivillion": "vivillon",
  "thwacky": "thwackey",
  "monfero": "monferno",

  // Skip banned/invalid
  "lando i": null,
  "spectrier-cb": null,
  "calyrex-ice-rider": null,
  "calyrex-shadow-rider": null,
  "eternamax eternatus": null,
  "iron bundle": null,
};

function normalizeName(name: string): string | null {
  let normalized = name.toLowerCase().trim();

  // Skip empty or header-like entries
  if (!normalized ||
      normalized.includes("pts") ||
      normalized.includes("tier") ||
      normalized.includes("option") ||
      normalized.includes("tera")) {
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
  console.log("Starting S4 seed...\n");

  // 1. Check if S4 already exists
  const existingSeason = await db.query.seasons.findFirst({
    where: eq(schema.seasons.seasonNumber, 4),
  });

  if (existingSeason) {
    console.log("S4 already exists with id:", existingSeason.id);
    console.log("Deleting existing season Pokemon prices...");
    await db.delete(schema.seasonPokemonPrices).where(eq(schema.seasonPokemonPrices.seasonId, existingSeason.id));
  }

  // 2. Create or get S4 season
  let seasonId: number;
  if (existingSeason) {
    seasonId = existingSeason.id;
    await db.update(schema.seasons).set({ draftBudget: 1400 }).where(eq(schema.seasons.id, seasonId));
  } else {
    const [newSeason] = await db.insert(schema.seasons).values({
      name: "Season 4",
      seasonNumber: 4,
      isPublic: true,
      isCurrent: false,
      draftBudget: 1400,
    }).returning();
    seasonId = newSeason.id;
    console.log("Created S4 with id:", seasonId);
  }

  // 3. Create divisions (Unova and Kalos)
  const existingDivisions = await db.query.divisions.findMany({
    where: eq(schema.divisions.seasonId, seasonId),
  });

  if (existingDivisions.length === 0) {
    console.log("Creating divisions for S4...");
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
  const csvPath = path.join(__dirname, "../data/S4/PBO S4 UNOVA DOC - S4 Draft Sheet.csv");
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const lines = csvContent.split("\n");

  // Parse Pokemon from each column (skip first column which is banned)
  const pricesToInsert: { pokemonId: number; price: number }[] = [];
  const notFound: string[] = [];
  const skipped: string[] = [];

  for (let lineIdx = 2; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    if (!line.trim()) continue;

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
    // Columns 1-25 correspond to prices
    for (let colIdx = 1; colIdx <= 25 && colIdx < cols.length; colIdx++) {
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
        if (price) {
          pricesToInsert.push({ pokemonId: pokemon.id, price });
        }
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
