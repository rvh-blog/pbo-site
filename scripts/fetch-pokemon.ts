/**
 * Pokemon Data Fetcher
 *
 * Fetches Pokemon data from PokeAPI including:
 * - Official artwork (full size image)
 * - Sprite image
 * - Base stats (HP, Attack, Defense, Sp.Atk, Sp.Def, Speed)
 * - Types
 *
 * Usage:
 *   npx tsx scripts/fetch-pokemon.ts <pokemon-name-or-id>
 *   npx tsx scripts/fetch-pokemon.ts pikachu
 *   npx tsx scripts/fetch-pokemon.ts 25
 *   npx tsx scripts/fetch-pokemon.ts pikachu,charizard,mewtwo  (comma-separated list)
 *   npx tsx scripts/fetch-pokemon.ts --range 1-151  (fetch range)
 */

import * as fs from "fs";
import * as path from "path";

const POKEAPI_BASE = "https://pokeapi.co/api/v2";
const IMAGES_DIR = path.join(process.cwd(), "public", "images", "pokemon");
const SPRITES_DIR = path.join(IMAGES_DIR, "sprites");
const ARTWORK_DIR = path.join(IMAGES_DIR, "artwork");

interface PokemonStats {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  total: number;
}

interface PokemonData {
  id: number;
  name: string;
  types: string[];
  stats: PokemonStats;
  spriteUrl: string;
  artworkUrl: string;
  localSpritePath: string;
  localArtworkPath: string;
}

// Ensure directories exist
function ensureDirectories() {
  if (!fs.existsSync(SPRITES_DIR)) {
    fs.mkdirSync(SPRITES_DIR, { recursive: true });
    console.log(`Created directory: ${SPRITES_DIR}`);
  }
  if (!fs.existsSync(ARTWORK_DIR)) {
    fs.mkdirSync(ARTWORK_DIR, { recursive: true });
    console.log(`Created directory: ${ARTWORK_DIR}`);
  }
}

// Download image from URL and save locally
async function downloadImage(url: string, filepath: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to download: ${url}`);
      return false;
    }
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buffer));
    return true;
  } catch (error) {
    console.error(`Error downloading ${url}:`, error);
    return false;
  }
}

// Fetch Pokemon data from PokeAPI
async function fetchPokemon(nameOrId: string | number): Promise<PokemonData | null> {
  try {
    const response = await fetch(`${POKEAPI_BASE}/pokemon/${nameOrId.toString().toLowerCase()}`);
    if (!response.ok) {
      console.error(`Pokemon not found: ${nameOrId}`);
      return null;
    }

    const data = await response.json();

    // Extract stats
    const statsMap: Record<string, number> = {};
    for (const stat of data.stats) {
      statsMap[stat.stat.name] = stat.base_stat;
    }

    const stats: PokemonStats = {
      hp: statsMap["hp"] || 0,
      attack: statsMap["attack"] || 0,
      defense: statsMap["defense"] || 0,
      specialAttack: statsMap["special-attack"] || 0,
      specialDefense: statsMap["special-defense"] || 0,
      speed: statsMap["speed"] || 0,
      total: 0,
    };
    stats.total = stats.hp + stats.attack + stats.defense + stats.specialAttack + stats.specialDefense + stats.speed;

    // Extract types
    const types = data.types.map((t: any) => t.type.name);

    // Get image URLs
    const spriteUrl = data.sprites.front_default || "";
    const artworkUrl = data.sprites.other?.["official-artwork"]?.front_default || "";

    // Format name properly (capitalize first letter)
    const formattedName = data.name.charAt(0).toUpperCase() + data.name.slice(1);

    return {
      id: data.id,
      name: formattedName,
      types,
      stats,
      spriteUrl,
      artworkUrl,
      localSpritePath: `/images/pokemon/sprites/${data.id}.png`,
      localArtworkPath: `/images/pokemon/artwork/${data.id}.png`,
    };
  } catch (error) {
    console.error(`Error fetching ${nameOrId}:`, error);
    return null;
  }
}

// Process a single Pokemon: fetch data and download images
async function processPokemon(nameOrId: string | number, downloadImages = true): Promise<PokemonData | null> {
  console.log(`\nFetching: ${nameOrId}...`);

  const pokemon = await fetchPokemon(nameOrId);
  if (!pokemon) return null;

  console.log(`  ID: ${pokemon.id}`);
  console.log(`  Name: ${pokemon.name}`);
  console.log(`  Types: ${pokemon.types.join(", ")}`);
  console.log(`  Stats: HP=${pokemon.stats.hp} ATK=${pokemon.stats.attack} DEF=${pokemon.stats.defense} SPA=${pokemon.stats.specialAttack} SPD=${pokemon.stats.specialDefense} SPE=${pokemon.stats.speed} (Total: ${pokemon.stats.total})`);

  if (downloadImages) {
    // Download sprite
    if (pokemon.spriteUrl) {
      const spritePath = path.join(SPRITES_DIR, `${pokemon.id}.png`);
      if (fs.existsSync(spritePath)) {
        console.log(`  Sprite already exists: ${spritePath}`);
      } else {
        const success = await downloadImage(pokemon.spriteUrl, spritePath);
        if (success) {
          console.log(`  Downloaded sprite: ${spritePath}`);
        }
      }
    }

    // Download official artwork
    if (pokemon.artworkUrl) {
      const artworkPath = path.join(ARTWORK_DIR, `${pokemon.id}.png`);
      if (fs.existsSync(artworkPath)) {
        console.log(`  Artwork already exists: ${artworkPath}`);
      } else {
        const success = await downloadImage(pokemon.artworkUrl, artworkPath);
        if (success) {
          console.log(`  Downloaded artwork: ${artworkPath}`);
        }
      }
    }
  }

  return pokemon;
}

// Parse range string (e.g., "1-151") into array of numbers
function parseRange(rangeStr: string): number[] {
  const [start, end] = rangeStr.split("-").map(Number);
  if (isNaN(start) || isNaN(end) || start > end) {
    throw new Error(`Invalid range: ${rangeStr}`);
  }
  const result: number[] = [];
  for (let i = start; i <= end; i++) {
    result.push(i);
  }
  return result;
}

// Main function
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Pokemon Data Fetcher

Usage:
  npx tsx scripts/fetch-pokemon.ts <pokemon-name-or-id>
  npx tsx scripts/fetch-pokemon.ts pikachu
  npx tsx scripts/fetch-pokemon.ts 25
  npx tsx scripts/fetch-pokemon.ts pikachu,charizard,mewtwo
  npx tsx scripts/fetch-pokemon.ts --range 1-151
  npx tsx scripts/fetch-pokemon.ts --range 1-151 --no-images
  npx tsx scripts/fetch-pokemon.ts --output results.json pikachu,charizard

Options:
  --range <start-end>    Fetch a range of Pokemon by ID
  --no-images            Skip downloading images
  --output <file>        Save results to JSON file
`);
    return;
  }

  ensureDirectories();

  let pokemonList: (string | number)[] = [];
  let downloadImages = true;
  let outputFile: string | null = null;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--range" && args[i + 1]) {
      pokemonList = parseRange(args[i + 1]);
      i++;
    } else if (args[i] === "--no-images") {
      downloadImages = false;
    } else if (args[i] === "--output" && args[i + 1]) {
      outputFile = args[i + 1];
      i++;
    } else if (!args[i].startsWith("--")) {
      // Comma-separated list or single pokemon
      pokemonList.push(...args[i].split(",").map(p => p.trim()).filter(Boolean));
    }
  }

  if (pokemonList.length === 0) {
    console.error("No Pokemon specified");
    return;
  }

  console.log(`\nProcessing ${pokemonList.length} Pokemon...`);
  console.log(`Download images: ${downloadImages}`);
  if (outputFile) {
    console.log(`Output file: ${outputFile}`);
  }

  const results: PokemonData[] = [];
  let successCount = 0;
  let failCount = 0;

  for (const pokemon of pokemonList) {
    const data = await processPokemon(pokemon, downloadImages);
    if (data) {
      results.push(data);
      successCount++;
    } else {
      failCount++;
    }

    // Small delay to be nice to the API
    if (pokemonList.length > 10) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`\n========================================`);
  console.log(`Completed: ${successCount} success, ${failCount} failed`);

  // Save results to JSON if requested
  if (outputFile) {
    const outputPath = path.join(process.cwd(), outputFile);
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`Results saved to: ${outputPath}`);
  }

  // Print SQL insert statements for easy database insertion
  if (results.length > 0) {
    console.log(`\n========================================`);
    console.log(`SQL Insert Statements:\n`);
    for (const p of results) {
      const types = JSON.stringify(p.types).replace(/'/g, "''");
      console.log(`INSERT INTO pokemon (name, sprite_url, types) VALUES ('${p.name}', '${p.localSpritePath}', '${types}');`);
    }

    console.log(`\n========================================`);
    console.log(`JSON for API/Seed:\n`);
    console.log(JSON.stringify(results.map(p => ({
      name: p.name,
      spriteUrl: p.localSpritePath,
      types: p.types,
      stats: p.stats,
    })), null, 2));
  }
}

main().catch(console.error);
