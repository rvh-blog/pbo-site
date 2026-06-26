import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";

type PokemonRow = {
  id: number;
  name: string;
  display_name: string | null;
  pokedex_id: number;
  sprite_url: string | null;
  artwork_url: string | null;
};

type PokemonApi = {
  id: number;
  name: string;
  sprites: {
    front_default: string | null;
    other?: {
      "official-artwork"?: {
        front_default: string | null;
      };
    };
  };
};

const POKEAPI_BASE = "https://pokeapi.co/api/v2";

function localFileFromPublicUrl(url: string | null) {
  if (!url || !url.startsWith("/images/")) return null;
  return path.join("public", ...url.split("/").filter(Boolean));
}

function needsDownload(filePath: string | null) {
  if (!filePath) return false;
  if (!fs.existsSync(filePath)) return true;
  return fs.statSync(filePath).size === 0;
}

async function fetchPokemon(pokedexId: number): Promise<PokemonApi | null> {
  const response = await fetch(`${POKEAPI_BASE}/pokemon/${pokedexId}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`PokeAPI pokemon/${pokedexId} failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as PokemonApi;
}

async function downloadImage(url: string, filePath: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Image download failed: ${response.status} ${response.statusText} ${url}`);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.from(await response.arrayBuffer()));
}

async function main() {
  const dbPath = process.argv.includes("--db")
    ? process.argv[process.argv.indexOf("--db") + 1] || "pbo.db"
    : "pbo.db";
  const dryRun = process.argv.includes("--dry-run");

  const db = new Database(dbPath, { readonly: true });
  const pokemon = db
    .prepare(
      `
      SELECT id, name, display_name, pokedex_id, sprite_url, artwork_url
      FROM pokemon
      WHERE pokedex_id IS NOT NULL
      ORDER BY id
    `
    )
    .all() as PokemonRow[];
  db.close();

  let checked = 0;
  let downloaded = 0;
  let missingPokeApi = 0;
  let missingSourceImage = 0;
  const failures: string[] = [];

  for (const row of pokemon) {
    const spritePath = localFileFromPublicUrl(row.sprite_url);
    const artworkPath = localFileFromPublicUrl(row.artwork_url);
    const wantsSprite = needsDownload(spritePath);
    const wantsArtwork = needsDownload(artworkPath);
    if (!wantsSprite && !wantsArtwork) continue;

    checked++;
    const api = await fetchPokemon(row.pokedex_id);
    if (!api) {
      missingPokeApi++;
      failures.push(`${row.name} (${row.pokedex_id}): no PokeAPI record`);
      continue;
    }

    const planned: { kind: string; source: string | null; target: string | null }[] = [
      { kind: "sprite", source: api.sprites.front_default, target: spritePath },
      {
        kind: "artwork",
        source: api.sprites.other?.["official-artwork"]?.front_default || null,
        target: artworkPath,
      },
    ];

    for (const item of planned) {
      if (!item.target || !needsDownload(item.target)) continue;
      if (!item.source) {
        missingSourceImage++;
        failures.push(`${row.name} (${row.pokedex_id}): no ${item.kind} URL from PokeAPI`);
        continue;
      }

      console.log(`${dryRun ? "WOULD DOWNLOAD" : "DOWNLOAD"} ${row.name} ${item.kind} -> ${item.target}`);
      if (!dryRun) {
        await downloadImage(item.source, item.target);
      }
      downloaded++;
    }
  }

  console.log(
    JSON.stringify(
      {
        dbPath,
        dryRun,
        pokemonWithMissingLocalImages: checked,
        downloaded,
        missingPokeApi,
        missingSourceImage,
        failures,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
