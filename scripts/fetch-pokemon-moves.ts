import Database from "better-sqlite3";

const db = new Database("pbo.db");

// Rate limiting: ~100 requests per minute to be safe
const DELAY_MS = 650;

interface Pokemon {
  id: number;
  name: string;
  moves: string | null;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPokemonMoves(pokemonName: string): Promise<string[]> {
  try {
    const response = await fetch(
      `https://pokeapi.co/api/v2/pokemon/${pokemonName}`
    );

    if (!response.ok) {
      console.log(`  ⚠️  Not found in PokeAPI: ${pokemonName}`);
      return [];
    }

    const data = await response.json();
    const moves: string[] = [];

    for (const moveEntry of data.moves || []) {
      // Check if this move is available in Scarlet/Violet
      const hasSV = moveEntry.version_group_details?.some(
        (vg: { version_group: { name: string } }) =>
          vg.version_group?.name === "scarlet-violet"
      );

      if (hasSV) {
        moves.push(moveEntry.move.name);
      }
    }

    return moves;
  } catch (error) {
    console.error(`  ❌ Error fetching ${pokemonName}:`, error);
    return [];
  }
}

async function main() {
  console.log("🎮 Fetching Gen 9 movesets from PokeAPI...\n");

  // Get all Pokemon from database
  const allPokemon = db
    .prepare("SELECT id, name, moves FROM pokemon ORDER BY id")
    .all() as Pokemon[];

  console.log(`📊 Found ${allPokemon.length} Pokemon in database\n`);

  // Filter to only those without moves data yet
  const pokemonToUpdate = allPokemon.filter((p) => !p.moves);
  console.log(`🔄 ${pokemonToUpdate.length} Pokemon need move data\n`);

  if (pokemonToUpdate.length === 0) {
    console.log("✅ All Pokemon already have move data!");
    return;
  }

  const updateStmt = db.prepare("UPDATE pokemon SET moves = ? WHERE id = ?");

  let processed = 0;
  let withMoves = 0;
  let withoutMoves = 0;

  for (const poke of pokemonToUpdate) {
    processed++;
    const progress = `[${processed}/${pokemonToUpdate.length}]`;

    const moves = await fetchPokemonMoves(poke.name);

    if (moves.length > 0) {
      updateStmt.run(JSON.stringify(moves), poke.id);
      withMoves++;
      console.log(`${progress} ✅ ${poke.name}: ${moves.length} moves`);
    } else {
      // Still update with empty array so we don't retry
      updateStmt.run(JSON.stringify([]), poke.id);
      withoutMoves++;
      console.log(`${progress} ⚪ ${poke.name}: no Gen 9 moves`);
    }

    // Rate limiting
    if (processed < pokemonToUpdate.length) {
      await sleep(DELAY_MS);
    }
  }

  console.log("\n📈 Summary:");
  console.log(`   ✅ Pokemon with Gen 9 moves: ${withMoves}`);
  console.log(`   ⚪ Pokemon without Gen 9 moves: ${withoutMoves}`);
  console.log("\n✨ Done!");
}

main().catch(console.error);
