import { db } from "@/lib/db";
import { pokemon } from "@/lib/schema";
import { customPokemonAliasesForRow, getPokemonAliasMaps } from "@/lib/pokemon-name-aliases";
import { isHiddenPublicPokemonForm, pokemonSearchAliases } from "@/lib/pokemon-name-utils";

const SEARCH_INDEX_TTL_MS = 60_000;

export type PokemonSearchIndexRow = {
  id: number;
  name: string;
  displayName: string | null;
  spriteUrl: string | null;
  aliases: string[];
};

let cachedIndex: { value: PokemonSearchIndexRow[]; expiresAt: number } | null = null;
let indexPromise: Promise<PokemonSearchIndexRow[]> | null = null;

async function loadPokemonSearchIndex() {
  const [rows, aliasMaps] = await Promise.all([
    db.select({
      id: pokemon.id,
      name: pokemon.name,
      displayName: pokemon.displayName,
      spriteUrl: pokemon.spriteUrl,
    }).from(pokemon),
    getPokemonAliasMaps(),
  ]);

  return rows
    .filter((row) => !isHiddenPublicPokemonForm(row.name, row.displayName))
    .map((row) => ({
      ...row,
      aliases: [
        ...pokemonSearchAliases(row.name, row.displayName),
        ...customPokemonAliasesForRow(row, aliasMaps),
      ].map((alias) => alias.toLowerCase()),
    }));
}

export async function getPokemonSearchIndex() {
  if (cachedIndex && cachedIndex.expiresAt > Date.now()) return cachedIndex.value;
  if (indexPromise) return indexPromise;

  indexPromise = loadPokemonSearchIndex();
  try {
    const value = await indexPromise;
    cachedIndex = { value, expiresAt: Date.now() + SEARCH_INDEX_TTL_MS };
    return value;
  } finally {
    indexPromise = null;
  }
}

export function invalidatePokemonSearchIndex() {
  cachedIndex = null;
}
