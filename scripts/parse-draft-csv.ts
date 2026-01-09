/**
 * Draft Board CSV Parser
 *
 * Parses the PBO draft tier CSV and seeds season_pokemon_prices
 *
 * Usage:
 *   npx tsx scripts/parse-draft-csv.ts <csv-file> <season-id>
 *   npx tsx scripts/parse-draft-csv.ts "data/Sunset S9 - Tiers.csv" 2
 */

import * as fs from "fs";
import * as path from "path";
import Database from "better-sqlite3";

const DB_PATH = path.join(process.cwd(), "data", "pbo.db");

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
    // Parse CSV properly handling quoted values
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

  // The data columns are offset from headers due to merged cells in original spreadsheet
  // Headers: 21 Points @ col 4, 20 Points @ col 7, 19 Points @ col 10...
  // Data: Empty @ col 4-7 (21pts is unused), First Pokemon @ col 8 (20pts), col 11 (19pts)...
  // So data starts at col 8, but that corresponds to 20 Points, not 21
  const DATA_START_COL = 8;
  const COLS_PER_TIER = 3;

  // Build price tier data columns - start from 20 pts since 21 pts tier is empty
  const priceTiers: { price: number; dataCol: number }[] = [];
  for (let i = 0; i < priceHeaders.length; i++) {
    const price = 20 - i; // 20, 19, 18, ... 0 (21 pts tier is empty in the data)
    if (price >= 0) {
      priceTiers.push({ price, dataCol: DATA_START_COL + i * COLS_PER_TIER });
    }
  }

  console.log(`Found ${priceTiers.length} price tiers`);
  console.log(`Sample mappings: ${priceTiers.slice(0, 5).map(t => `${t.price}pts@col${t.dataCol}`).join(", ")}`);

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
      // Skip header-like entries
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

      // Valid Pokemon name: non-empty, not just dashes, more than 1 char
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
function findPokemonId(db: Database.Database, name: string): number | null {
  const normalized = normalizeName(name);

  // Try exact match first
  let result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) = ?`).get(normalized) as { id: number } | undefined;
  if (result) return result.id;

  // Handle regional form naming: "Alolan Muk" or "alolan-muk" -> "muk-alola"
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
      result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) = ?`).get(dbName) as { id: number } | undefined;
      if (result) return result.id;

      // Also try with the base name directly for partial matches
      result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) LIKE ?`).get(`${baseName}${suffix}%`) as { id: number } | undefined;
      if (result) return result.id;
    }
  }

  // Handle "Paldean Tauros (Water)" -> "tauros-paldea-aqua-breed"
  if (normalized.includes("paldean-tauros") || normalized.includes("tauros") && normalized.includes("paldea")) {
    if (normalized.includes("water") || normalized.includes("aqua")) {
      result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) = ?`).get("tauros-paldea-aqua-breed") as { id: number } | undefined;
      if (result) return result.id;
    } else if (normalized.includes("fire") || normalized.includes("blaze")) {
      result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) = ?`).get("tauros-paldea-blaze-breed") as { id: number } | undefined;
      if (result) return result.id;
    } else if (normalized.includes("combat")) {
      result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) = ?`).get("tauros-paldea-combat-breed") as { id: number } | undefined;
      if (result) return result.id;
    } else {
      // Default Paldean Tauros (combat)
      result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) = ?`).get("tauros-paldea-combat-breed") as { id: number } | undefined;
      if (result) return result.id;
    }
  }

  // Handle forms like "Ogerpon-C" -> "ogerpon-cornerstone-mask" etc
  const ogerponForms: Record<string, string> = {
    "ogerpon-c": "ogerpon-cornerstone-mask",
    "ogerpon-w": "ogerpon-wellspring-mask",
    "ogerpon-h": "ogerpon-hearthflame-mask",
    "ogerpon-t": "ogerpon-teal-mask",
  };
  if (ogerponForms[normalized]) {
    result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) = ?`).get(ogerponForms[normalized]) as { id: number } | undefined;
    if (result) return result.id;
  }

  // Handle Urshifu forms
  if (normalized.includes("urshifu")) {
    if (normalized.includes("single") || normalized.includes("strike")) {
      result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) LIKE ?`).get("%urshifu-single%") as { id: number } | undefined;
      if (result) return result.id;
    } else if (normalized.includes("rapid")) {
      result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) LIKE ?`).get("%urshifu-rapid%") as { id: number } | undefined;
      if (result) return result.id;
    }
  }

  // Handle Lycanroc forms
  if (normalized.includes("lycanroc")) {
    if (normalized.includes("dusk")) {
      result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) = ?`).get("lycanroc-dusk") as { id: number } | undefined;
      if (result) return result.id;
    } else if (normalized.includes("midday") || normalized.includes("day")) {
      result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) = ?`).get("lycanroc-midday") as { id: number } | undefined;
      if (result) return result.id;
    } else if (normalized.includes("midnight") || normalized.includes("night")) {
      result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) = ?`).get("lycanroc-midnight") as { id: number } | undefined;
      if (result) return result.id;
    }
  }

  // Handle Ursaluna Bloodmoon
  if (normalized.includes("ursaluna") && normalized.includes("bm")) {
    result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) LIKE ?`).get("%ursaluna-blood%") as { id: number } | undefined;
    if (result) return result.id;
  }

  // Handle Mega evolutions: "Mega Charizard X" -> "charizard-mega-x"
  if (normalized.startsWith("mega-")) {
    let baseName = normalized.slice(5); // Remove "mega-"

    // Handle Mega X/Y forms
    if (baseName.endsWith("-x")) {
      const base = baseName.slice(0, -2);
      result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) = ?`).get(`${base}-mega-x`) as { id: number } | undefined;
      if (result) return result.id;
    } else if (baseName.endsWith("-y")) {
      const base = baseName.slice(0, -2);
      result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) = ?`).get(`${base}-mega-y`) as { id: number } | undefined;
      if (result) return result.id;
    }

    const dbName = baseName + "-mega";
    result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) = ?`).get(dbName) as { id: number } | undefined;
    if (result) return result.id;

    // Try with mega at end for partial match
    result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) LIKE ?`).get(`${baseName}-mega%`) as { id: number } | undefined;
    if (result) return result.id;
  }

  // Handle Primal forms: "Primal Groudon" -> "groudon-primal"
  if (normalized.startsWith("primal-")) {
    const baseName = normalized.slice(7); // Remove "primal-"
    result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) = ?`).get(`${baseName}-primal`) as { id: number } | undefined;
    if (result) return result.id;
  }

  // Handle Type: Null -> type-null
  if (normalized.includes("type") && normalized.includes("null")) {
    result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) = ?`).get("type-null") as { id: number } | undefined;
    if (result) return result.id;
  }

  // Handle Sirfetch'd -> sirfetchd
  if (normalized.includes("sirfetch")) {
    result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) = ?`).get("sirfetchd") as { id: number } | undefined;
    if (result) return result.id;
  }

  // Handle Oricorio forms: Oricorio-Pa'u -> oricorio-pau
  if (normalized.includes("oricorio")) {
    if (normalized.includes("pau") || normalized.includes("pa'u")) {
      result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) LIKE ?`).get("oricorio-pau%") as { id: number } | undefined;
      if (result) return result.id;
    }
    // Try generic oricorio match
    result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) LIKE ?`).get("oricorio%") as { id: number } | undefined;
    if (result) return result.id;
  }

  // Handle Minior forms - use base form
  if (normalized.includes("minior")) {
    result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) = ?`).get("minior-red-meteor") as { id: number } | undefined;
    if (result) return result.id;
    result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) LIKE ?`).get("minior%") as { id: number } | undefined;
    if (result) return result.id;
  }

  // Handle Galarian Darmanitan-Zen -> darmanitan-galar-zen
  if (normalized.includes("galarian-darmanitan-zen")) {
    result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) = ?`).get("darmanitan-galar-zen") as { id: number } | undefined;
    if (result) return result.id;
  }

  // Handle Farfetch'd variations
  if (normalized.includes("farfetch")) {
    if (normalized.includes("galarian")) {
      result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) = ?`).get("farfetchd-galar") as { id: number } | undefined;
      if (result) return result.id;
    } else {
      result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) = ?`).get("farfetchd") as { id: number } | undefined;
      if (result) return result.id;
    }
  }

  // Handle special forms with apostrophes/accents
  // Flabébé -> flabebe
  if (normalized.includes("flab")) {
    result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) LIKE ?`).get("flabebe%") as { id: number } | undefined;
    if (result) return result.id;
  }

  // Handle Nidoran♀/♂
  if (normalized.includes("nidoran")) {
    if (normalized.includes("f") || normalized.includes("female")) {
      result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) = ?`).get("nidoran-f") as { id: number } | undefined;
      if (result) return result.id;
    } else if (normalized.includes("m") || normalized.includes("male")) {
      result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) = ?`).get("nidoran-m") as { id: number } | undefined;
      if (result) return result.id;
    }
  }

  // Handle spaces/dashes variants
  const withDashes = normalized.replace(/\s+/g, "-");
  result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) = ?`).get(withDashes) as { id: number } | undefined;
  if (result) return result.id;

  // Try partial match
  result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) LIKE ?`).get(`%${normalized.replace(/\s+/g, "%")}%`) as { id: number } | undefined;
  if (result) return result.id;

  // Try base name only (without form)
  const baseName = normalized.split(/[-\s]/)[0];
  if (baseName !== normalized && baseName.length > 2) {
    result = db.prepare(`SELECT id FROM pokemon WHERE LOWER(name) = ?`).get(baseName) as { id: number } | undefined;
    if (result) return result.id;
  }

  return null;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
Draft Board CSV Parser

Usage:
  npx tsx scripts/parse-draft-csv.ts <csv-file> <season-id>
  npx tsx scripts/parse-draft-csv.ts "data/Sunset S9 - Tiers.csv" 2

This will:
1. Parse the CSV to extract Pokemon prices and tera info
2. Match Pokemon names to database entries
3. Insert/update season_pokemon_prices for the specified season
`);
    return;
  }

  const csvFile = args[0];
  const seasonId = parseInt(args[1]);

  if (!fs.existsSync(csvFile)) {
    console.error(`File not found: ${csvFile}`);
    return;
  }

  if (isNaN(seasonId)) {
    console.error(`Invalid season ID: ${args[1]}`);
    return;
  }

  console.log(`Parsing ${csvFile} for Season ${seasonId}...\n`);

  const { tiers, complexBans } = parseCSV(csvFile);
  console.log(`\nParsed ${tiers.length} Pokemon entries`);
  console.log(`Parsed ${complexBans.length} Complex Bans\n`);

  // Open database
  const db = new Database(DB_PATH);

  // Verify season exists
  const season = db.prepare(`SELECT id, name FROM seasons WHERE id = ?`).get(seasonId) as { id: number; name: string } | undefined;
  if (!season) {
    console.error(`Season ${seasonId} not found`);
    db.close();
    return;
  }
  console.log(`Found season: ${season.name}\n`);

  // Clear existing prices for this season
  const deleted = db.prepare(`DELETE FROM season_pokemon_prices WHERE season_id = ?`).run(seasonId);
  console.log(`Cleared ${deleted.changes} existing price entries\n`);

  // Prepare insert statement
  const insertStmt = db.prepare(`
    INSERT INTO season_pokemon_prices (season_id, pokemon_id, price, tera_banned, tera_captain_cost, complex_ban_reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let successCount = 0;
  let failCount = 0;
  const notFound: string[] = [];

  // Group by price for summary
  const byPrice = new Map<number, number>();

  // Insert Complex Bans (price = -1)
  console.log("Processing Complex Bans...");
  for (const ban of complexBans) {
    const pokemonId = findPokemonId(db, ban.pokemonName);
    if (pokemonId) {
      try {
        insertStmt.run(seasonId, pokemonId, -1, 0, null, ban.bannedAbility);
        successCount++;
        byPrice.set(-1, (byPrice.get(-1) || 0) + 1);
        console.log(`  ${ban.pokemonName} - ${ban.bannedAbility}`);
      } catch (error) {
        console.error(`Failed to insert complex ban ${ban.pokemonName}: ${error}`);
        failCount++;
      }
    } else {
      notFound.push(`${ban.pokemonName} (complex ban)`);
      failCount++;
    }
  }

  // Insert regular price tiers
  console.log("\nProcessing Price Tiers...");
  for (const tier of tiers) {
    const pokemonId = findPokemonId(db, tier.name);

    if (pokemonId) {
      try {
        insertStmt.run(
          seasonId,
          pokemonId,
          tier.price,
          tier.teraBanned ? 1 : 0,
          tier.teraCaptainCost,
          null
        );
        successCount++;
        byPrice.set(tier.price, (byPrice.get(tier.price) || 0) + 1);
      } catch (error) {
        console.error(`Failed to insert ${tier.name}: ${error}`);
        failCount++;
      }
    } else {
      notFound.push(tier.name);
      failCount++;
    }
  }

  db.close();

  console.log(`\n========================================`);
  console.log(`Results: ${successCount} success, ${failCount} failed`);

  console.log(`\nBy Price Tier:`);
  const sortedPrices = Array.from(byPrice.entries()).sort((a, b) => b[0] - a[0]);
  for (const [price, count] of sortedPrices) {
    if (price === -1) {
      console.log(`  Complex Bans: ${count} Pokemon`);
    } else {
      console.log(`  ${price} pts: ${count} Pokemon`);
    }
  }

  if (notFound.length > 0) {
    console.log(`\nPokemon not found in database (${notFound.length}):`);
    console.log(notFound.slice(0, 20).join(", "));
    if (notFound.length > 20) {
      console.log(`  ... and ${notFound.length - 20} more`);
    }
  }
}

main().catch(console.error);
