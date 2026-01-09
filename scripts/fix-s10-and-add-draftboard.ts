import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { eq, and } from "drizzle-orm";
import * as schema from "../src/lib/schema";
import * as dotenv from "dotenv";
import * as fs from "fs";

dotenv.config({ path: ".env.local" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = drizzle(client, { schema });

interface PokemonTier {
  name: string;
  price: number;
  teraBanned: boolean;
  teraCaptainCost: number | null;
}

interface ComplexBan {
  pokemonName: string;
  bannedAbility: string;
}

// Normalize Pokemon names for matching
function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/\s+/g, "-")
    .replace(/\./g, "")
    .replace(/♀/g, "-f")
    .replace(/♂/g, "-m");
}

// Parse a single cell's tera info
function parseTera(teraCell: string): { banned: boolean; captainCost: number | null } {
  const val = teraCell?.trim().toUpperCase();
  if (val === "B") {
    return { banned: true, captainCost: null };
  }
  const num = parseInt(val);
  if (!isNaN(num)) {
    return { banned: false, captainCost: num };
  }
  return { banned: false, captainCost: null };
}

// Parse CSV file
function parseCSV(filePath: string): { tiers: PokemonTier[]; complexBans: ComplexBan[] } {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").map(line => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        cells.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    cells.push(current);
    return cells;
  });

  // Row 2 (index 1) has the headers - find price tier positions
  const headerRow = lines[1];
  const priceHeaders: { price: number; headerCol: number }[] = [];

  for (let i = 0; i < headerRow.length; i++) {
    const cell = headerRow[i]?.trim();
    const match = cell?.match(/^(\d+)\s*Point/i);
    if (match) {
      priceHeaders.push({ price: parseInt(match[1]), headerCol: i });
    }
  }

  const DATA_START_COL = 8;
  const COLS_PER_TIER = 3;

  // Build price tier data columns - start from 20 pts since 21 pts tier is empty
  const priceTiers: { price: number; dataCol: number }[] = [];
  for (let i = 0; i < priceHeaders.length; i++) {
    const price = 20 - i;
    if (price >= 0) {
      priceTiers.push({ price, dataCol: DATA_START_COL + i * COLS_PER_TIER });
    }
  }

  console.log(`Found ${priceTiers.length} price tiers`);

  const results: PokemonTier[] = [];
  const complexBans: ComplexBan[] = [];

  // Process data rows (starting from row 4, index 3)
  for (let rowIdx = 3; rowIdx < lines.length; rowIdx++) {
    const row = lines[rowIdx];
    if (!row || row.length < 10) continue;

    // Parse Complex Bans (columns 2-3: Pokemon name, banned ability)
    const complexPokemon = row[2]?.trim();
    const bannedAbility = row[3]?.trim();
    if (complexPokemon && complexPokemon.length > 1 && bannedAbility && bannedAbility.length > 1) {
      if (!complexPokemon.toLowerCase().includes("trapping") && !complexPokemon.toLowerCase().includes("ban")) {
        complexBans.push({
          pokemonName: complexPokemon,
          bannedAbility: bannedAbility,
        });
      }
    }

    // For each price tier, check if there's a Pokemon
    for (const tier of priceTiers) {
      const nameCol = tier.dataCol;
      const teraCol = tier.dataCol + 1;

      const pokemonName = row[nameCol]?.trim();
      const teraCell = row[teraCol]?.trim() || "";

      if (pokemonName && pokemonName.length > 1 && !/^-+$/.test(pokemonName)) {
        const tera = parseTera(teraCell);
        results.push({
          name: pokemonName,
          price: tier.price,
          teraBanned: tera.banned,
          teraCaptainCost: tera.captainCost,
        });
      }
    }
  }

  return { tiers: results, complexBans };
}

// Find Pokemon ID by name (fuzzy match)
async function findPokemonId(name: string): Promise<number | null> {
  const normalized = normalizeName(name);

  // Get all Pokemon for matching
  const allPokemon = await db.query.pokemon.findMany();

  // Try exact match first
  let match = allPokemon.find(p => p.name.toLowerCase() === normalized);
  if (match) return match.id;

  // Handle regional forms
  const regionalPatterns = [
    { prefix: "alolan-", suffix: "-alola" },
    { prefix: "galarian-", suffix: "-galar" },
    { prefix: "hisuian-", suffix: "-hisui" },
    { prefix: "paldean-", suffix: "-paldea" },
  ];

  for (const { prefix, suffix } of regionalPatterns) {
    if (normalized.startsWith(prefix)) {
      const baseName = normalized.slice(prefix.length);
      const dbName = baseName + suffix;
      match = allPokemon.find(p => p.name.toLowerCase() === dbName);
      if (match) return match.id;

      match = allPokemon.find(p => p.name.toLowerCase().startsWith(baseName + suffix));
      if (match) return match.id;
    }
  }

  // Handle Paldean Tauros
  if (normalized.includes("paldean-tauros") || (normalized.includes("tauros") && normalized.includes("paldea"))) {
    if (normalized.includes("water") || normalized.includes("aqua")) {
      match = allPokemon.find(p => p.name.toLowerCase() === "tauros-paldea-aqua-breed");
      if (match) return match.id;
    } else if (normalized.includes("fire") || normalized.includes("blaze")) {
      match = allPokemon.find(p => p.name.toLowerCase() === "tauros-paldea-blaze-breed");
      if (match) return match.id;
    } else {
      match = allPokemon.find(p => p.name.toLowerCase() === "tauros-paldea-combat-breed");
      if (match) return match.id;
    }
  }

  // Handle Ogerpon forms
  const ogerponForms: Record<string, string> = {
    "ogerpon-c": "ogerpon-cornerstone-mask",
    "ogerpon-w": "ogerpon-wellspring-mask",
    "ogerpon-h": "ogerpon-hearthflame-mask",
    "ogerpon-t": "ogerpon-teal-mask",
  };
  if (ogerponForms[normalized]) {
    match = allPokemon.find(p => p.name.toLowerCase() === ogerponForms[normalized]);
    if (match) return match.id;
  }

  // Handle Urshifu forms
  if (normalized.includes("urshifu")) {
    if (normalized.includes("single") || normalized.includes("strike")) {
      match = allPokemon.find(p => p.name.toLowerCase().includes("urshifu-single"));
      if (match) return match.id;
    } else if (normalized.includes("rapid")) {
      match = allPokemon.find(p => p.name.toLowerCase().includes("urshifu-rapid"));
      if (match) return match.id;
    }
  }

  // Handle Lycanroc forms
  if (normalized.includes("lycanroc")) {
    if (normalized.includes("dusk")) {
      match = allPokemon.find(p => p.name.toLowerCase() === "lycanroc-dusk");
      if (match) return match.id;
    } else if (normalized.includes("midday")) {
      match = allPokemon.find(p => p.name.toLowerCase() === "lycanroc-midday");
      if (match) return match.id;
    } else if (normalized.includes("midnight")) {
      match = allPokemon.find(p => p.name.toLowerCase() === "lycanroc-midnight");
      if (match) return match.id;
    }
  }

  // Handle Ursaluna Bloodmoon
  if (normalized.includes("ursaluna") && (normalized.includes("bm") || normalized.includes("blood"))) {
    match = allPokemon.find(p => p.name.toLowerCase().includes("ursaluna-blood"));
    if (match) return match.id;
  }

  // Handle Deoxys forms
  if (normalized.includes("deoxys")) {
    if (normalized.includes("speed")) {
      match = allPokemon.find(p => p.name.toLowerCase() === "deoxys-speed");
      if (match) return match.id;
    } else if (normalized.includes("defense")) {
      match = allPokemon.find(p => p.name.toLowerCase() === "deoxys-defense");
      if (match) return match.id;
    } else if (normalized.includes("attack")) {
      match = allPokemon.find(p => p.name.toLowerCase() === "deoxys-attack");
      if (match) return match.id;
    }
  }

  // Handle Rotom forms
  if (normalized.includes("rotom")) {
    const forms = ["mow", "heat", "wash", "frost", "fan"];
    for (const form of forms) {
      if (normalized.includes(form)) {
        match = allPokemon.find(p => p.name.toLowerCase() === `rotom-${form}`);
        if (match) return match.id;
      }
    }
  }

  // Handle Therian/Incarnate forms
  if (normalized.includes("therian")) {
    const base = normalized.replace("-therian", "").replace("therian-", "");
    match = allPokemon.find(p => p.name.toLowerCase() === `${base}-therian`);
    if (match) return match.id;
  }

  // Handle base incarnate forms
  const incarnatePokemon = ["landorus", "thundurus", "tornadus", "enamorus"];
  if (incarnatePokemon.includes(normalized)) {
    match = allPokemon.find(p => p.name.toLowerCase() === `${normalized}-incarnate`);
    if (match) return match.id;
  }

  // Handle special default forms
  const defaultForms: Record<string, string> = {
    "keldeo": "keldeo-ordinary",
    "meloetta": "meloetta-aria",
    "palafin": "palafin-hero",
    "basculegion": "basculegion-male",
    "hoopa-unbound": "hoopa-unbound",
    "shaymin": "shaymin-land",
    "toxtricity": "toxtricity-amped",
    "indeedee": "indeedee-male",
    "maushold": "maushold-family-of-four",
    "dudunsparce": "dudunsparce-two-segment",
    "mimikyu": "mimikyu-disguised",
    "minior": "minior-red-meteor",
  };
  if (defaultForms[normalized]) {
    match = allPokemon.find(p => p.name.toLowerCase() === defaultForms[normalized]);
    if (match) return match.id;
  }

  // Try with dashes
  const withDashes = normalized.replace(/\s+/g, "-");
  match = allPokemon.find(p => p.name.toLowerCase() === withDashes);
  if (match) return match.id;

  // Try partial match
  match = allPokemon.find(p => p.name.toLowerCase().includes(normalized) || normalized.includes(p.name.toLowerCase()));
  if (match) return match.id;

  return null;
}

async function main() {
  console.log("========================================");
  console.log("Season 10 Setup");
  console.log("========================================\n");

  // Step 1: Fix Season 10 seasonNumber
  console.log("Step 1: Fixing Season 10 seasonNumber...");

  const season10 = await db.query.seasons.findFirst({
    where: eq(schema.seasons.name, "PBO Season 10"),
  });

  if (!season10) {
    console.error("Season 10 not found!");
    process.exit(1);
  }

  console.log(`Found Season 10: ID=${season10.id}, seasonNumber=${season10.seasonNumber}`);

  if (season10.seasonNumber !== 10) {
    await db.update(schema.seasons)
      .set({ seasonNumber: 10 })
      .where(eq(schema.seasons.id, season10.id));
    console.log("✓ Updated seasonNumber to 10");
  } else {
    console.log("✓ seasonNumber already 10");
  }

  // Step 2: Parse and add draft board
  console.log("\nStep 2: Parsing S10 Tiers CSV...");

  const csvPath = "./data/S10/Tiers S10 - Tiers.csv";
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }

  const { tiers, complexBans } = parseCSV(csvPath);
  console.log(`Parsed ${tiers.length} Pokemon entries`);
  console.log(`Parsed ${complexBans.length} Complex Bans`);

  // Step 3: Clear existing prices for Season 10
  console.log("\nStep 3: Clearing existing draft board...");
  await db.delete(schema.seasonPokemonPrices)
    .where(eq(schema.seasonPokemonPrices.seasonId, season10.id));
  console.log("✓ Cleared existing prices");

  // Step 4: Insert Complex Bans
  console.log("\nStep 4: Adding Complex Bans...");
  let successCount = 0;
  let failCount = 0;
  const notFound: string[] = [];

  for (const ban of complexBans) {
    const pokemonId = await findPokemonId(ban.pokemonName);
    if (pokemonId) {
      await db.insert(schema.seasonPokemonPrices).values({
        seasonId: season10.id,
        pokemonId,
        price: -1,
        teraBanned: false,
        teraCaptainCost: null,
        complexBanReason: ban.bannedAbility,
      });
      successCount++;
      console.log(`  ✓ ${ban.pokemonName} - ${ban.bannedAbility}`);
    } else {
      notFound.push(`${ban.pokemonName} (complex ban)`);
      failCount++;
    }
  }

  // Step 5: Insert price tiers
  console.log("\nStep 5: Adding Price Tiers...");

  const byPrice = new Map<number, number>();

  for (const tier of tiers) {
    const pokemonId = await findPokemonId(tier.name);

    if (pokemonId) {
      await db.insert(schema.seasonPokemonPrices).values({
        seasonId: season10.id,
        pokemonId,
        price: tier.price,
        teraBanned: tier.teraBanned,
        teraCaptainCost: tier.teraCaptainCost,
        complexBanReason: null,
      });
      successCount++;
      byPrice.set(tier.price, (byPrice.get(tier.price) || 0) + 1);
    } else {
      notFound.push(tier.name);
      failCount++;
    }
  }

  console.log(`\n========================================`);
  console.log(`Results: ${successCount} success, ${failCount} failed`);

  console.log(`\nBy Price Tier:`);
  const sortedPrices = Array.from(byPrice.entries()).sort((a, b) => b[0] - a[0]);
  for (const [price, count] of sortedPrices) {
    console.log(`  ${price} pts: ${count} Pokemon`);
  }

  if (notFound.length > 0) {
    console.log(`\nPokemon not found (${notFound.length}):`);
    for (const name of notFound.slice(0, 30)) {
      console.log(`  - ${name}`);
    }
    if (notFound.length > 30) {
      console.log(`  ... and ${notFound.length - 30} more`);
    }
  }

  console.log("\n✅ Done!");
  process.exit(0);
}

main().catch(console.error);
