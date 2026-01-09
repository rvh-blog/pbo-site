/**
 * Pokemon Database Seeder
 *
 * Fetches Pokemon from PokeAPI and inserts them into the database.
 * Downloads images and stores them locally.
 *
 * Usage:
 *   npx tsx scripts/seed-pokemon.ts pikachu,charizard,mewtwo
 *   npx tsx scripts/seed-pokemon.ts --range 1-151
 *   npx tsx scripts/seed-pokemon.ts --file pokemon-list.txt
 */

import * as fs from "fs";
import * as path from "path";
import Database from "better-sqlite3";

const POKEAPI_BASE = "https://pokeapi.co/api/v2";
const IMAGES_DIR = path.join(process.cwd(), "public", "images", "pokemon");
const SPRITES_DIR = path.join(IMAGES_DIR, "sprites");
const ARTWORK_DIR = path.join(IMAGES_DIR, "artwork");
const DB_PATH = path.join(process.cwd(), "data", "pbo.db");

interface PokemonData {
  pokedexId: number;
  name: string;
  types: string[];
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  baseStatTotal: number;
  spriteUrl: string;
  artworkUrl: string;
}

// Ensure directories exist
function ensureDirectories() {
  if (!fs.existsSync(SPRITES_DIR)) {
    fs.mkdirSync(SPRITES_DIR, { recursive: true });
  }
  if (!fs.existsSync(ARTWORK_DIR)) {
    fs.mkdirSync(ARTWORK_DIR, { recursive: true });
  }
}

// Download image from URL and save locally
async function downloadImage(url: string, filepath: string): Promise<boolean> {
  if (fs.existsSync(filepath)) {
    return true; // Already exists
  }
  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buffer));
    return true;
  } catch (error) {
    return false;
  }
}

// Fetch Pokemon data from PokeAPI
async function fetchPokemon(nameOrId: string | number): Promise<PokemonData | null> {
  try {
    const response = await fetch(`${POKEAPI_BASE}/pokemon/${nameOrId.toString().toLowerCase()}`);
    if (!response.ok) return null;

    const data = await response.json();

    const statsMap: Record<string, number> = {};
    for (const stat of data.stats) {
      statsMap[stat.stat.name] = stat.base_stat;
    }

    const hp = statsMap["hp"] || 0;
    const attack = statsMap["attack"] || 0;
    const defense = statsMap["defense"] || 0;
    const specialAttack = statsMap["special-attack"] || 0;
    const specialDefense = statsMap["special-defense"] || 0;
    const speed = statsMap["speed"] || 0;

    return {
      pokedexId: data.id,
      name: data.name.charAt(0).toUpperCase() + data.name.slice(1),
      types: data.types.map((t: any) => t.type.name),
      hp,
      attack,
      defense,
      specialAttack,
      specialDefense,
      speed,
      baseStatTotal: hp + attack + defense + specialAttack + specialDefense + speed,
      spriteUrl: data.sprites.front_default || "",
      artworkUrl: data.sprites.other?.["official-artwork"]?.front_default || "",
    };
  } catch (error) {
    return null;
  }
}

// Parse range string
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

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Pokemon Database Seeder

Usage:
  npx tsx scripts/seed-pokemon.ts pikachu,charizard,mewtwo
  npx tsx scripts/seed-pokemon.ts --range 1-151
  npx tsx scripts/seed-pokemon.ts --file pokemon-list.txt

Options:
  --range <start-end>    Fetch a range of Pokemon by ID
  --file <filepath>      Read Pokemon names from file (one per line)
  --skip-images          Skip downloading images
`);
    return;
  }

  ensureDirectories();

  // Open database
  const db = new Database(DB_PATH);

  let pokemonList: (string | number)[] = [];
  let downloadImages = true;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--range" && args[i + 1]) {
      pokemonList = parseRange(args[i + 1]);
      i++;
    } else if (args[i] === "--file" && args[i + 1]) {
      const content = fs.readFileSync(args[i + 1], "utf-8");
      pokemonList = content.split("\n").map(l => l.trim()).filter(Boolean);
      i++;
    } else if (args[i] === "--skip-images") {
      downloadImages = false;
    } else if (!args[i].startsWith("--")) {
      pokemonList.push(...args[i].split(",").map(p => p.trim()).filter(Boolean));
    }
  }

  if (pokemonList.length === 0) {
    console.error("No Pokemon specified");
    return;
  }

  console.log(`\nSeeding ${pokemonList.length} Pokemon into database...`);

  // Check if pokemon exists by name
  const checkStmt = db.prepare(`SELECT id FROM pokemon WHERE name = ?`);

  // Prepare insert statement
  const insertStmt = db.prepare(`
    INSERT INTO pokemon (
      pokedex_id, name, sprite_url, artwork_url, types,
      hp, attack, defense, special_attack, special_defense, speed, base_stat_total
    ) VALUES (
      @pokedexId, @name, @spriteUrl, @artworkUrl, @types,
      @hp, @attack, @defense, @specialAttack, @specialDefense, @speed, @baseStatTotal
    )
  `);

  // Prepare update statement
  const updateStmt = db.prepare(`
    UPDATE pokemon SET
      pokedex_id = @pokedexId,
      sprite_url = @spriteUrl,
      artwork_url = @artworkUrl,
      types = @types,
      hp = @hp,
      attack = @attack,
      defense = @defense,
      special_attack = @specialAttack,
      special_defense = @specialDefense,
      speed = @speed,
      base_stat_total = @baseStatTotal
    WHERE name = @name
  `);

  let successCount = 0;
  let failCount = 0;

  for (const nameOrId of pokemonList) {
    process.stdout.write(`Fetching ${nameOrId}... `);

    const pokemon = await fetchPokemon(nameOrId);
    if (!pokemon) {
      console.log("FAILED");
      failCount++;
      continue;
    }

    // Download images
    const localSpritePath = `/images/pokemon/sprites/${pokemon.pokedexId}.png`;
    const localArtworkPath = `/images/pokemon/artwork/${pokemon.pokedexId}.png`;

    if (downloadImages) {
      if (pokemon.spriteUrl) {
        await downloadImage(pokemon.spriteUrl, path.join(SPRITES_DIR, `${pokemon.pokedexId}.png`));
      }
      if (pokemon.artworkUrl) {
        await downloadImage(pokemon.artworkUrl, path.join(ARTWORK_DIR, `${pokemon.pokedexId}.png`));
      }
    }

    // Insert or update in database
    try {
      const params = {
        pokedexId: pokemon.pokedexId,
        name: pokemon.name,
        spriteUrl: localSpritePath,
        artworkUrl: localArtworkPath,
        types: JSON.stringify(pokemon.types),
        hp: pokemon.hp,
        attack: pokemon.attack,
        defense: pokemon.defense,
        specialAttack: pokemon.specialAttack,
        specialDefense: pokemon.specialDefense,
        speed: pokemon.speed,
        baseStatTotal: pokemon.baseStatTotal,
      };

      const existing = checkStmt.get(pokemon.name);
      if (existing) {
        updateStmt.run(params);
        console.log(`UPDATED - ${pokemon.name} (BST: ${pokemon.baseStatTotal})`);
      } else {
        insertStmt.run(params);
        console.log(`INSERTED - ${pokemon.name} (BST: ${pokemon.baseStatTotal})`);
      }
      successCount++;
    } catch (error) {
      console.log(`DB ERROR: ${error}`);
      failCount++;
    }

    // Rate limiting
    if (pokemonList.length > 10) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  db.close();

  console.log(`\n========================================`);
  console.log(`Completed: ${successCount} success, ${failCount} failed`);
}

main().catch(console.error);
