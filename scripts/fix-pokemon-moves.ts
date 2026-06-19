import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";

const db = new Database("pbo.db");

// Rate limiting: ~100 requests per minute to be safe
const DELAY_MS = 650;

// Cache file path
const CACHE_FILE = path.join(__dirname, "pokeapi-cache.json");

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

interface ApiCache {
  pokemon: Record<string, any>;
  species: Record<string, any>;
  evolutionChains: Record<string, any>;
}

// Load or initialize cache
let apiCache: ApiCache = { pokemon: {}, species: {}, evolutionChains: {} };
if (fs.existsSync(CACHE_FILE)) {
  try {
    apiCache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    console.log("📂 Loaded API cache from file");
  } catch {
    console.log("⚠️ Could not load cache, starting fresh");
  }
}

function saveCache() {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(apiCache, null, 2));
}

// Pokemon that can change forms and should share moves across all forms
// These Pokemon can freely change forms after learning moves
// Keys and values are LOWERCASE for matching - actual DB names are capitalized
const FORM_SHARING_POKEMON: Record<string, string[]> = {
  // Deoxys - can change forms at any time via meteorite
  "deoxys": ["deoxys-normal", "deoxys-attack", "deoxys-defense", "deoxys-speed"],
  // Shaymin - can change with Gracidea flower
  "shaymin": ["shaymin-land", "shaymin-sky"],
  // Giratina - can change with Griseous Orb/Core
  "giratina": ["giratina-altered", "giratina-origin"],
  // Forces of Nature - can change with Reveal Glass
  "tornadus": ["tornadus-incarnate", "tornadus-therian"],
  "thundurus": ["thundurus-incarnate", "thundurus-therian"],
  "landorus": ["landorus-incarnate", "landorus-therian"],
  "enamorus": ["enamorus-incarnate", "enamorus-therian"],
  // Hoopa - can change with Prison Bottle
  "hoopa": ["hoopa", "hoopa-unbound"],
  // Zacian/Zamazenta - can change by holding/removing item
  "zacian": ["zacian", "zacian-crowned"],
  "zamazenta": ["zamazenta", "zamazenta-crowned"],
  // Ogerpon - can change masks freely
  "ogerpon": ["ogerpon", "ogerpon-wellspring-mask", "ogerpon-hearthflame-mask", "ogerpon-cornerstone-mask"],
  // Note: Terapagos excluded - forms change automatically in battle via Tera Shift ability, not manual form change
};

// Pokemon forms that should NOT share moves
// These either can't change forms or forget moves on form change
const FORM_EXCLUSIONS = new Set([
  // Rotom - forgets form-specific move on change
  "rotom-heat", "rotom-wash", "rotom-frost", "rotom-fan", "rotom-mow",
  // Urshifu - permanent form choice
  "urshifu", "urshifu-single-strike", "urshifu-rapid-strike",
  // Wormadam - permanent based on evolution location
  "wormadam", "wormadam-plant", "wormadam-sandy", "wormadam-trash",
  // Lycanroc - permanent based on evolution time
  "lycanroc", "lycanroc-midday", "lycanroc-midnight", "lycanroc-dusk",
]);

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

// Fetch Pokemon data with caching
async function fetchPokemonData(pokemonName: string): Promise<any | null> {
  const cacheKey = pokemonName.toLowerCase();

  if (apiCache.pokemon[cacheKey]) {
    return apiCache.pokemon[cacheKey];
  }

  const response = await fetchWithRetry(`https://pokeapi.co/api/v2/pokemon/${pokemonName}`);
  if (!response) return null;

  const data = await response.json();
  apiCache.pokemon[cacheKey] = data;
  return data;
}

// Fetch species data with caching
async function fetchSpeciesData(speciesUrl: string): Promise<any | null> {
  if (apiCache.species[speciesUrl]) {
    return apiCache.species[speciesUrl];
  }

  const response = await fetchWithRetry(speciesUrl);
  if (!response) return null;

  const data = await response.json();
  apiCache.species[speciesUrl] = data;
  return data;
}

// Fetch evolution chain with caching
async function fetchEvolutionChain(evoChainUrl: string): Promise<any | null> {
  if (apiCache.evolutionChains[evoChainUrl]) {
    return apiCache.evolutionChains[evoChainUrl];
  }

  const response = await fetchWithRetry(evoChainUrl);
  if (!response) return null;

  const data = await response.json();
  apiCache.evolutionChains[evoChainUrl] = data;
  return data;
}

// Get abilities for a Pokemon
async function fetchAbilities(pokemonName: string): Promise<Ability[]> {
  const data = await fetchPokemonData(pokemonName);
  if (!data) return [];

  return (data.abilities || []).map((a: any) => ({
    name: a.ability.name,
    isHidden: a.is_hidden,
  }));
}

// Find the direct path from base to target in evolution chain
// Returns only direct ancestors, not siblings from split evolutions
function findDirectAncestors(chain: any, targetName: string, currentPath: string[] = []): string[] | null {
  const speciesName = chain.species?.name?.toLowerCase();
  if (!speciesName) return null;

  const newPath = [...currentPath, speciesName];

  // Found the target - return path without the target itself
  if (speciesName === targetName.toLowerCase()) {
    return currentPath; // Return ancestors (path before target)
  }

  // Search in evolutions
  for (const evo of chain.evolves_to || []) {
    const result = findDirectAncestors(evo, targetName, newPath);
    if (result !== null) {
      return result; // Found in this branch
    }
  }

  return null; // Not found in this branch
}

// Get DIRECT pre-evolutions for a Pokemon (not split evolution siblings)
async function fetchDirectPreEvolutions(pokemonName: string): Promise<string[]> {
  const apiName = pokemonName.toLowerCase();

  // Get Pokemon data first
  const pokemonData = await fetchPokemonData(apiName);
  if (!pokemonData?.species?.url) return [];

  await sleep(DELAY_MS);

  // Get species data
  const speciesData = await fetchSpeciesData(pokemonData.species.url);
  if (!speciesData?.evolution_chain?.url) return [];

  await sleep(DELAY_MS);

  // Get evolution chain
  const evoChainData = await fetchEvolutionChain(speciesData.evolution_chain.url);
  if (!evoChainData?.chain) return [];

  // Find direct ancestors (not split evolution siblings)
  const ancestors = findDirectAncestors(evoChainData.chain, apiName);
  return ancestors || [];
}

// Fetch moves for a specific Pokemon (SV only)
async function fetchMovesForPokemon(pokemonName: string): Promise<string[]> {
  const data = await fetchPokemonData(pokemonName);
  if (!data) return [];

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

// Get the base form name for form-sharing lookup
function getBaseFormName(pokemonName: string): string | null {
  const lower = pokemonName.toLowerCase();

  // Check exclusions first
  if (FORM_EXCLUSIONS.has(lower)) return null;

  // Check if this Pokemon is in a form-sharing group
  for (const [baseName, forms] of Object.entries(FORM_SHARING_POKEMON)) {
    if (forms.includes(lower)) {
      return baseName;
    }
  }

  return null;
}

// Get all forms that should share moves with this Pokemon
function getFormSharingGroup(pokemonName: string): string[] {
  const baseName = getBaseFormName(pokemonName);
  if (!baseName) return [];

  return FORM_SHARING_POKEMON[baseName] || [];
}

async function main() {
  console.log("🎮 Fixing Pokemon moves - pre-evolutions and form changes...\n");

  // Get all Pokemon from database
  const allPokemon = db
    .prepare("SELECT id, name, moves, abilities FROM pokemon ORDER BY id")
    .all() as Pokemon[];

  console.log(`📊 Found ${allPokemon.length} Pokemon in database\n`);

  // Build maps for quick lookup
  const pokemonByName = new Map<string, Pokemon>();
  const pokemonMovesByName = new Map<string, string[]>();

  for (const p of allPokemon) {
    pokemonByName.set(p.name.toLowerCase(), p);
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
  let abilitiesUpdated = 0;
  let movesExpanded = 0;

  // Track which forms have been processed for form-sharing
  const processedFormGroups = new Set<string>();
  // Track individual Pokemon that were already updated as part of a form group
  const alreadyUpdatedForms = new Set<string>();

  for (const poke of allPokemon) {
    processed++;
    const progress = `[${processed}/${allPokemon.length}]`;

    // Skip if this form was already updated as part of a form group
    if (alreadyUpdatedForms.has(poke.name.toLowerCase())) {
      console.log(`${progress} ⏭️ Skipping ${poke.name} (already updated via form group)`);
      continue;
    }

    console.log(`${progress} 🔍 Processing ${poke.name}...`);

    // Fetch abilities
    let abilities: Ability[] = [];
    if (poke.abilities) {
      abilities = JSON.parse(poke.abilities);
    } else {
      abilities = await fetchAbilities(poke.name);
      await sleep(DELAY_MS);
    }

    // Get current moves (for comparison only)
    let currentMoves: string[] = [];
    if (poke.moves) {
      try {
        currentMoves = JSON.parse(poke.moves);
      } catch {
        currentMoves = [];
      }
    }

    // IMPORTANT: Start fresh from API, don't use existing DB moves
    // This fixes the split evolution bug where moves were incorrectly inherited
    await sleep(DELAY_MS);
    const freshMoves = await fetchMovesForPokemon(poke.name);
    let allMoves = new Set(freshMoves);

    console.log(`     🔄 Fresh API moves: ${freshMoves.length}`);

    // 1. Add moves from DIRECT pre-evolutions only (not split evolutions)
    const preEvos = await fetchDirectPreEvolutions(poke.name);

    if (preEvos.length > 0) {
      console.log(`     📜 Direct pre-evolutions: ${preEvos.join(" -> ")} -> ${poke.name}`);

      for (const preEvo of preEvos) {
        // Always fetch from API to ensure correct data
        await sleep(DELAY_MS);
        const preEvoMoves = await fetchMovesForPokemon(preEvo);
        const beforeCount = allMoves.size;
        for (const move of preEvoMoves) {
          allMoves.add(move);
        }
        console.log(`        + ${preEvo}: ${preEvoMoves.length} moves (+${allMoves.size - beforeCount} new)`);
      }
    }

    // 2. Handle form-sharing Pokemon (like Deoxys)
    const formGroup = getFormSharingGroup(poke.name);
    const baseName = getBaseFormName(poke.name);

    if (formGroup.length > 0 && baseName && !processedFormGroups.has(baseName)) {
      console.log(`     🔄 Form group: ${formGroup.join(", ")}`);

      // Collect moves from ALL forms in the group (from API only)
      const allFormMoves = new Set<string>();

      for (const formName of formGroup) {
        // Fetch from API to ensure correct data
        await sleep(DELAY_MS);
        const apiMoves = await fetchMovesForPokemon(formName);
        for (const move of apiMoves) {
          allFormMoves.add(move);
        }
        console.log(`        + ${formName}: ${apiMoves.length} moves`);
      }

      // Add all form moves to this Pokemon
      for (const move of allFormMoves) {
        allMoves.add(move);
      }

      // Mark this group as processed
      processedFormGroups.add(baseName);

      // Also update other forms in the group with the combined moves
      for (const formName of formGroup) {
        if (formName.toLowerCase() !== poke.name.toLowerCase()) {
          const formPokemon = pokemonByName.get(formName.toLowerCase());
          if (formPokemon) {
            const formAbilities = formPokemon.abilities ? JSON.parse(formPokemon.abilities) : [];
            // Use the combined form moves (all forms share the same set)
            const combinedMoves = Array.from(allFormMoves).sort();

            updateStmt.run(
              JSON.stringify(combinedMoves),
              formAbilities.length > 0 ? JSON.stringify(formAbilities) : null,
              formPokemon.id
            );

            // Mark this form as already updated so we skip it later
            alreadyUpdatedForms.add(formName.toLowerCase());

            console.log(`     ✅ Updated ${formName}: ${combinedMoves.length} moves (shared)`);
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

    if (abilities.length > 0) abilitiesUpdated++;
    if (movesAdded > 0) movesExpanded++;

    const abilitiesStr = abilities.map(a => a.isHidden ? `${a.name}(H)` : a.name).join(", ");
    console.log(`     ✅ Abilities: ${abilitiesStr || "none"}`);
    console.log(`     📦 Moves: ${currentMoves.length} -> ${finalMoves.length} (${movesAdded >= 0 ? "+" : ""}${movesAdded})`);

    // Save cache periodically
    if (processed % 50 === 0) {
      saveCache();
      console.log(`     💾 Cache saved (${Object.keys(apiCache.pokemon).length} Pokemon cached)`);
    }

    // Rate limiting between Pokemon
    await sleep(DELAY_MS);
  }

  // Final cache save
  saveCache();

  console.log("\n📈 Summary:");
  console.log(`   ✅ Pokemon with abilities updated: ${abilitiesUpdated}`);
  console.log(`   📦 Pokemon with moves expanded: ${movesExpanded}`);
  console.log(`   💾 API responses cached: ${Object.keys(apiCache.pokemon).length} Pokemon`);
  console.log("\n✨ Done!");

  // Verification tests
  console.log("\n🧪 Running verification tests...");

  // Test 1: Leavanny should have Sticky Web (from Swadloon)
  const leavanny = db.prepare("SELECT moves FROM pokemon WHERE LOWER(name) = 'leavanny'").get() as { moves: string } | undefined;
  if (leavanny) {
    const moves = JSON.parse(leavanny.moves);
    const hasStickyWeb = moves.includes("sticky-web");
    console.log(`   ${hasStickyWeb ? "✅" : "❌"} Leavanny has Sticky Web: ${hasStickyWeb}`);
  } else {
    console.log("   ⚠️ Leavanny not found in database");
  }

  // Test 2: Sylveon should NOT have Flip Turn (from Vaporeon - split evolution)
  const sylveon = db.prepare("SELECT moves FROM pokemon WHERE LOWER(name) = 'sylveon'").get() as { moves: string } | undefined;
  if (sylveon) {
    const moves = JSON.parse(sylveon.moves);
    const hasFlipTurn = moves.includes("flip-turn");
    console.log(`   ${!hasFlipTurn ? "✅" : "❌"} Sylveon does NOT have Flip Turn: ${!hasFlipTurn}`);
  } else {
    console.log("   ⚠️ Sylveon not found in database");
  }

  // Test 3: Deoxys-Speed should have Spikes (from Deoxys-Defense form sharing)
  const deoxysSpeed = db.prepare("SELECT moves FROM pokemon WHERE LOWER(name) LIKE '%deoxys%speed%'").get() as { moves: string } | undefined;
  if (deoxysSpeed) {
    const moves = JSON.parse(deoxysSpeed.moves);
    const hasSpikes = moves.includes("spikes");
    console.log(`   ${hasSpikes ? "✅" : "❌"} Deoxys-Speed has Spikes: ${hasSpikes}`);
  } else {
    console.log("   ⚠️ Deoxys-Speed not found in database");
  }
}

main().catch(console.error);
