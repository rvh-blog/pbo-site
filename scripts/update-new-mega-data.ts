import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";

const POKEAPI_BASE = "https://pokeapi.co/api/v2";
const DEFAULT_DB_PATH = "pbo.db";
const CHAMPIONS_VERSION_GROUP = "champions";
const FALLBACK_VERSION_GROUPS = [
  CHAMPIONS_VERSION_GROUP,
  "legends-za",
  "scarlet-violet",
  "sword-shield",
  "ultra-sun-ultra-moon",
  "sun-moon",
];

const BASE_FALLBACK_NAMES: Record<string, string> = {
  "pyroar-mega": "pyroar-male",
  "tatsugiri-curly-mega": "tatsugiri-curly",
  "tatsugiri-droopy-mega": "tatsugiri-droopy",
  "tatsugiri-stretchy-mega": "tatsugiri-stretchy",
  "zygarde-mega": "zygarde-50",
};

const NEW_MEGA_SOURCES = [
  "absol-mega-z",
  "barbaracle-mega",
  "baxcalibur-mega",
  "chandelure-mega",
  "chesnaught-mega",
  "chimecho-mega",
  "clefable-mega",
  "crabominable-mega",
  "darkrai-mega",
  "delphox-mega",
  "dragalge-mega",
  "dragonite-mega",
  "drampa-mega",
  "eelektross-mega",
  "emboar-mega",
  "excadrill-mega",
  "falinks-mega",
  "feraligatr-mega",
  "floette-mega",
  "froslass-mega",
  "garchomp-mega-z",
  "glimmora-mega",
  "golisopod-mega",
  "golurk-mega",
  "greninja-mega",
  "hawlucha-mega",
  "heatran-mega",
  "lucario-mega-z",
  "magearna-mega",
  "magearna-original-mega",
  "malamar-mega",
  "meganium-mega",
  "meowstic-female-mega",
  "pyroar-mega",
  "raichu-mega-x",
  "raichu-mega-y",
  "scolipede-mega",
  "scovillain-mega",
  "scrafty-mega",
  "skarmory-mega",
  "staraptor-mega",
  "starmie-mega",
  "tatsugiri-curly-mega",
  "tatsugiri-droopy-mega",
  "tatsugiri-stretchy-mega",
  "victreebel-mega",
  "zeraora-mega",
  "zygarde-mega",
];

type PokemonApi = {
  id: number;
  name: string;
  species: { name: string };
  types: { slot: number; type: { name: string } }[];
  stats: { base_stat: number; stat: { name: string } }[];
  abilities: { is_hidden: boolean; ability: { name: string } }[];
  moves: {
    move: { name: string };
    version_group_details: { version_group: { name: string } }[];
  }[];
  sprites: {
    front_default: string | null;
    other?: {
      "official-artwork"?: {
        front_default: string | null;
      };
    };
  };
};

type ExistingPokemon = {
  id: number;
  name: string;
  moves: string | null;
  abilities: string | null;
};

type UpsertPokemon = {
  pokedexId: number;
  name: string;
  displayName: string;
  spriteUrl: string;
  artworkUrl: string;
  types: string;
  moves: string | null;
  abilities: string | null;
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  baseStatTotal: number;
};

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    apply: args.includes("--apply"),
    downloadImages: args.includes("--download-images"),
    fallbackLatestBaseMoves: args.includes("--fallback-latest-base-moves"),
    dbPath: args.includes("--db")
      ? args[args.indexOf("--db") + 1] || DEFAULT_DB_PATH
      : DEFAULT_DB_PATH,
  };
}

function localName(apiName: string): string {
  if (apiName === "meowstic-female-mega") return "Meowstic-mega";
  return apiName.charAt(0).toUpperCase() + apiName.slice(1);
}

function displayName(apiName: string): string {
  if (apiName === "meowstic-female-mega") return "Meowstic-Mega";
  return apiName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");
}

async function fetchPokemon(name: string): Promise<PokemonApi | null> {
  const response = await fetch(`${POKEAPI_BASE}/pokemon/${name}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`PokeAPI ${name} failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as PokemonApi;
}

function statMap(pokemon: PokemonApi) {
  const stats = new Map(pokemon.stats.map((entry) => [entry.stat.name, entry.base_stat]));
  const hp = stats.get("hp") || 0;
  const attack = stats.get("attack") || 0;
  const defense = stats.get("defense") || 0;
  const specialAttack = stats.get("special-attack") || 0;
  const specialDefense = stats.get("special-defense") || 0;
  const speed = stats.get("speed") || 0;
  return {
    hp,
    attack,
    defense,
    specialAttack,
    specialDefense,
    speed,
    baseStatTotal: hp + attack + defense + specialAttack + specialDefense + speed,
  };
}

function championsMoves(pokemon: PokemonApi): string[] {
  return movesForVersionGroup(pokemon, CHAMPIONS_VERSION_GROUP);
}

function movesForVersionGroup(pokemon: PokemonApi, versionGroup: string): string[] {
  const moves = new Set<string>();
  for (const moveEntry of pokemon.moves || []) {
    const hasVersionGroup = moveEntry.version_group_details?.some(
      (detail) => detail.version_group?.name === versionGroup
    );
    if (hasVersionGroup) moves.add(moveEntry.move.name);
  }
  return Array.from(moves).sort();
}

function latestFallbackMoves(pokemon: PokemonApi): { moves: string[]; versionGroup: string | null } {
  for (const versionGroup of FALLBACK_VERSION_GROUPS) {
    const moves = movesForVersionGroup(pokemon, versionGroup);
    if (moves.length > 0) return { moves, versionGroup };
  }
  return { moves: [], versionGroup: null };
}

function abilities(pokemon: PokemonApi) {
  return (pokemon.abilities || []).map((entry) => ({
    name: entry.ability.name,
    isHidden: entry.is_hidden,
  }));
}

async function downloadImage(url: string | null | undefined, filePath: string) {
  if (!url || fs.existsSync(filePath)) return false;
  const response = await fetch(url);
  if (!response.ok) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.from(await response.arrayBuffer()));
  return true;
}

async function main() {
  const { apply, dbPath, downloadImages, fallbackLatestBaseMoves } = parseArgs();
  const db = new Database(dbPath);

  const existingStmt = db.prepare("SELECT id, name, moves, abilities FROM pokemon WHERE lower(name) = lower(?)");
  const insertStmt = db.prepare(`
    INSERT INTO pokemon (
      pokedex_id, name, display_name, sprite_url, artwork_url, types, moves, abilities,
      hp, attack, defense, special_attack, special_defense, speed, base_stat_total
    ) VALUES (
      @pokedexId, @name, @displayName, @spriteUrl, @artworkUrl, @types, @moves, @abilities,
      @hp, @attack, @defense, @specialAttack, @specialDefense, @speed, @baseStatTotal
    )
  `);
  const updateStmt = db.prepare(`
    UPDATE pokemon SET
      pokedex_id = @pokedexId,
      display_name = @displayName,
      sprite_url = @spriteUrl,
      artwork_url = @artworkUrl,
      types = @types,
      moves = @moves,
      abilities = @abilities,
      hp = @hp,
      attack = @attack,
      defense = @defense,
      special_attack = @specialAttack,
      special_defense = @specialDefense,
      speed = @speed,
      base_stat_total = @baseStatTotal
    WHERE lower(name) = lower(@name)
  `);

  let updated = 0;
  let inserted = 0;
  let abilityUpdates = 0;
  let moveUpdates = 0;

  for (const sourceName of NEW_MEGA_SOURCES) {
    const mega = await fetchPokemon(sourceName);
    if (!mega) {
      console.log(`SKIP ${sourceName}: no PokeAPI pokemon endpoint`);
      continue;
    }

    const dbName = localName(sourceName);
    const existing = existingStmt.get(dbName) as ExistingPokemon | undefined;
    const megaMoves = championsMoves(mega);
    let selectedMoves = megaMoves;
    let moveSource = megaMoves.length > 0 ? "mega" : "none";

    if (selectedMoves.length === 0) {
      const baseName = BASE_FALLBACK_NAMES[sourceName] || mega.species.name;
      const base = await fetchPokemon(baseName);
      selectedMoves = base ? championsMoves(base) : [];
      moveSource = selectedMoves.length > 0 ? "base" : "none";

      if (base && selectedMoves.length === 0 && fallbackLatestBaseMoves) {
        const fallback = latestFallbackMoves(base);
        selectedMoves = fallback.moves;
        moveSource = fallback.versionGroup ? `base ${fallback.versionGroup}` : "none";
      }
    }

    const selectedAbilities = abilities(mega);
    const stats = statMap(mega);
    const params: UpsertPokemon = {
      pokedexId: mega.id,
      name: dbName,
      displayName: displayName(sourceName),
      spriteUrl: `/images/pokemon/sprites/${mega.id}.png`,
      artworkUrl: `/images/pokemon/artwork/${mega.id}.png`,
      types: JSON.stringify(mega.types.sort((a, b) => a.slot - b.slot).map((entry) => entry.type.name)),
      moves: selectedMoves.length > 0 ? JSON.stringify(selectedMoves) : existing?.moves || JSON.stringify([]),
      abilities: selectedAbilities.length > 0 ? JSON.stringify(selectedAbilities) : existing?.abilities || null,
      ...stats,
    };

    const action = existing ? "UPDATE" : "INSERT";
    const abilityStatus = selectedAbilities.length > 0 ? `${selectedAbilities.length} abilities` : "no abilities";
    const moveStatus = selectedMoves.length > 0 ? `${selectedMoves.length} moves from ${moveSource}` : "no moves";
    console.log(`${apply ? action : `DRY ${action}`} ${dbName}: ${abilityStatus}, ${moveStatus}`);

    if (downloadImages) {
      await downloadImage(mega.sprites.front_default, path.join("public", "images", "pokemon", "sprites", `${mega.id}.png`));
      await downloadImage(
        mega.sprites.other?.["official-artwork"]?.front_default,
        path.join("public", "images", "pokemon", "artwork", `${mega.id}.png`)
      );
    }

    if (existing) updated++;
    else inserted++;
    if (selectedAbilities.length > 0) abilityUpdates++;
    if (selectedMoves.length > 0) moveUpdates++;

    if (!apply) continue;
    if (existing) updateStmt.run(params);
    else insertStmt.run(params);
  }

  db.close();
  console.log(`\n${apply ? "Applied" : "Planned"}: ${updated} updated, ${inserted} inserted, ${abilityUpdates} with abilities, ${moveUpdates} with moves.`);
  if (!apply) {
    console.log("Run with --apply to write changes. Add --download-images to download local sprite/artwork files.");
    console.log("Add --fallback-latest-base-moves to fill missing Champions moves from the base form's newest available learnset.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
