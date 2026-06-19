import Database from "better-sqlite3";

const db = new Database("pbo.db");

// Rate limiting: ~100 requests per minute to be safe
const DELAY_MS = 650;

interface Pokemon {
  id: number;
  name: string;
  moves: string | null;
  abilities: string | null;
}

interface Ability {
  name: string;
  isHidden: boolean;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Cache for evolution chains to avoid duplicate fetches
const evolutionChainCache = new Map<string, string[]>();
const speciesCache = new Map<string, { evolutionChainUrl: string }>();

async function fetchWithRetry(url: string, retries = 3): Promise<Response | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      if (response.status === 404) return null;
    } catch (error) {
      if (i === retries - 1) throw error;
    }
    await sleep(1000);
  }
  return null;
}

// Get abilities for a Pokemon
async function fetchAbilities(pokemonName: string): Promise<Ability[]> {
  const response = await fetchWithRetry(`https://pokeapi.co/api/v2/pokemon/${pokemonName}`);
  if (!response) return [];

  const data = await response.json();
  return (data.abilities || []).map((a: any) => ({
    name: a.ability.name,
    isHidden: a.is_hidden,
  }));
}

// Get species URL for a Pokemon
async function fetchSpeciesUrl(pokemonName: string): Promise<string | null> {
  const response = await fetchWithRetry(`https://pokeapi.co/api/v2/pokemon/${pokemonName}`);
  if (!response) return null;

  const data = await response.json();
  return data.species?.url || null;
}

// Get evolution chain URL from species
async function fetchEvolutionChainUrl(speciesUrl: string): Promise<string | null> {
  // Check cache
  if (speciesCache.has(speciesUrl)) {
    return speciesCache.get(speciesUrl)!.evolutionChainUrl;
  }

  const response = await fetchWithRetry(speciesUrl);
  if (!response) return null;

  const data = await response.json();
  const url = data.evolution_chain?.url || null;
  speciesCache.set(speciesUrl, { evolutionChainUrl: url });
  return url;
}

// Parse evolution chain and get list of all Pokemon in order (base -> final)
function parseEvolutionChain(chain: any, result: string[] = []): string[] {
  if (chain.species?.name) {
    result.push(chain.species.name);
  }
  for (const evo of chain.evolves_to || []) {
    parseEvolutionChain(evo, result);
  }
  return result;
}

// Get pre-evolutions for a Pokemon
async function fetchPreEvolutions(pokemonName: string): Promise<string[]> {
  // PokeAPI uses lowercase names
  const apiName = pokemonName.toLowerCase();

  // Get species URL
  const speciesUrl = await fetchSpeciesUrl(apiName);
  if (!speciesUrl) return [];

  await sleep(DELAY_MS);

  // Get evolution chain URL
  const evoChainUrl = await fetchEvolutionChainUrl(speciesUrl);
  if (!evoChainUrl) return [];

  // Check cache
  if (evolutionChainCache.has(evoChainUrl)) {
    const chain = evolutionChainCache.get(evoChainUrl)!;
    const idx = chain.indexOf(apiName);
    return idx > 0 ? chain.slice(0, idx) : [];
  }

  await sleep(DELAY_MS);

  // Fetch evolution chain
  const response = await fetchWithRetry(evoChainUrl);
  if (!response) return [];

  const data = await response.json();
  const chainList = parseEvolutionChain(data.chain || {});
  evolutionChainCache.set(evoChainUrl, chainList);

  const idx = chainList.indexOf(apiName);
  return idx > 0 ? chainList.slice(0, idx) : [];
}

// Fetch moves for a specific Pokemon (SV only)
async function fetchMovesForPokemon(pokemonName: string): Promise<string[]> {
  const response = await fetchWithRetry(`https://pokeapi.co/api/v2/pokemon/${pokemonName}`);
  if (!response) return [];

  const data = await response.json();
  const moves: string[] = [];

  for (const moveEntry of data.moves || []) {
    const hasSV = moveEntry.version_group_details?.some(
      (vg: { version_group: { name: string } }) =>
        vg.version_group?.name === "scarlet-violet"
    );
    if (hasSV) {
      moves.push(moveEntry.move.name);
    }
  }

  return moves;
}

async function main() {
  console.log("🎮 Fetching abilities and pre-evolution moves from PokeAPI...\n");

  // Get all Pokemon from database
  const allPokemon = db
    .prepare("SELECT id, name, moves, abilities FROM pokemon ORDER BY id")
    .all() as Pokemon[];

  console.log(`📊 Found ${allPokemon.length} Pokemon in database\n`);

  // Build a map of Pokemon names to their moves (for quick lookup)
  const pokemonMovesByName = new Map<string, string[]>();
  for (const p of allPokemon) {
    if (p.moves) {
      try {
        pokemonMovesByName.set(p.name.toLowerCase(), JSON.parse(p.moves));
      } catch {
        pokemonMovesByName.set(p.name.toLowerCase(), []);
      }
    }
  }

  const updateStmt = db.prepare("UPDATE pokemon SET moves = ?, abilities = ? WHERE id = ?");

  let processed = 0;
  let abilitiesAdded = 0;
  let movesExpanded = 0;

  for (const poke of allPokemon) {
    processed++;
    const progress = `[${processed}/${allPokemon.length}]`;

    console.log(`${progress} 🔍 Processing ${poke.name}...`);

    // Fetch abilities if not already present
    let abilities: Ability[] = [];
    if (poke.abilities) {
      abilities = JSON.parse(poke.abilities);
    } else {
      abilities = await fetchAbilities(poke.name);
      await sleep(DELAY_MS);
    }

    // Get current moves
    let currentMoves: string[] = [];
    if (poke.moves) {
      try {
        currentMoves = JSON.parse(poke.moves);
      } catch {
        currentMoves = [];
      }
    }

    // Fetch pre-evolutions
    const preEvos = await fetchPreEvolutions(poke.name);
    let allMoves = new Set(currentMoves);

    if (preEvos.length > 0) {
      console.log(`     📜 Pre-evolutions: ${preEvos.join(" -> ")}`);

      // Get moves from each pre-evolution
      for (const preEvo of preEvos) {
        // First check our DB cache
        const cachedMoves = pokemonMovesByName.get(preEvo.toLowerCase());
        if (cachedMoves && cachedMoves.length > 0) {
          for (const move of cachedMoves) {
            allMoves.add(move);
          }
        } else {
          // Fetch from API if not in DB
          await sleep(DELAY_MS);
          const preEvoMoves = await fetchMovesForPokemon(preEvo);
          for (const move of preEvoMoves) {
            allMoves.add(move);
          }
        }
      }
    }

    const finalMoves = Array.from(allMoves).sort();
    const movesAdded = finalMoves.length - currentMoves.length;

    // Update database
    updateStmt.run(
      JSON.stringify(finalMoves),
      abilities.length > 0 ? JSON.stringify(abilities) : null,
      poke.id
    );

    if (abilities.length > 0) abilitiesAdded++;
    if (movesAdded > 0) movesExpanded++;

    const abilitiesStr = abilities.map(a => a.isHidden ? `${a.name}(H)` : a.name).join(", ");
    console.log(`     ✅ Abilities: ${abilitiesStr || "none"}`);
    console.log(`     📦 Moves: ${currentMoves.length} -> ${finalMoves.length} (+${movesAdded})`);

    // Rate limiting between Pokemon
    await sleep(DELAY_MS);
  }

  console.log("\n📈 Summary:");
  console.log(`   ✅ Pokemon with abilities added: ${abilitiesAdded}`);
  console.log(`   📦 Pokemon with moves expanded: ${movesExpanded}`);
  console.log("\n✨ Done!");
}

main().catch(console.error);
