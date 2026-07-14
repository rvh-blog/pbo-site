import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pokemon, pokemonNameAliases, pokemonNameCollapses } from "@/lib/schema";
import {
  normalizePokemonName,
  pokemonExactLookupKeys,
  pokemonNameKey,
  pokemonNormalizedLookupKeys,
} from "@/lib/pokemon-name-utils";

type PokemonNameOptions = {
  friendlyMegaNames?: boolean;
};

export type PokemonAliasMaps = {
  aliasKeyToCanonicalName: Map<string, string>;
  pokemonIdToAliases: Map<number, string[]>;
  collapseKeyToCanonicalName: Map<string, string>;
  pokemonIdToCollapseSources: Map<number, string[]>;
};

export type SerializedPokemonAliasMaps = {
  aliasKeyToCanonicalName: [string, string][];
  collapseKeyToCanonicalName: [string, string][];
};

const ALIAS_MAP_CACHE_TTL_MS = 60_000;
let aliasMapCache: { value: PokemonAliasMaps; expiresAt: number } | null = null;
let aliasMapCachePromise: Promise<PokemonAliasMaps> | null = null;

type PokemonLookupRow = {
  pokemonId?: number | null;
  id?: number | null;
  name: string | null;
  displayName?: string | null;
};

export async function getPokemonAliasMaps(): Promise<PokemonAliasMaps> {
  if (aliasMapCache && aliasMapCache.expiresAt > Date.now()) {
    return aliasMapCache.value;
  }

  if (aliasMapCachePromise) {
    return aliasMapCachePromise;
  }

  aliasMapCachePromise = loadPokemonAliasMaps();
  try {
    const value = await aliasMapCachePromise;
    aliasMapCache = { value, expiresAt: Date.now() + ALIAS_MAP_CACHE_TTL_MS };
    return value;
  } finally {
    aliasMapCachePromise = null;
  }
}

export function invalidatePokemonAliasMapsCache() {
  aliasMapCache = null;
}

async function loadPokemonAliasMaps(): Promise<PokemonAliasMaps> {
  const [aliasRows, collapseRows] = await Promise.all([
    db
      .select({
        pokemonId: pokemonNameAliases.pokemonId,
        alias: pokemonNameAliases.alias,
        aliasKey: pokemonNameAliases.aliasKey,
        pokemonName: pokemon.name,
        displayName: pokemon.displayName,
      })
      .from(pokemonNameAliases)
      .innerJoin(pokemon, eq(pokemonNameAliases.pokemonId, pokemon.id)),
    db
      .select({
        targetPokemonId: pokemonNameCollapses.targetPokemonId,
        sourceName: pokemonNameCollapses.sourceName,
        sourceKey: pokemonNameCollapses.sourceKey,
        pokemonName: pokemon.name,
        displayName: pokemon.displayName,
      })
      .from(pokemonNameCollapses)
      .innerJoin(pokemon, eq(pokemonNameCollapses.targetPokemonId, pokemon.id)),
  ]);

  const aliasKeyToCanonicalName = new Map<string, string>();
  const pokemonIdToAliases = new Map<number, string[]>();
  const collapseKeyToCanonicalName = new Map<string, string>();
  const pokemonIdToCollapseSources = new Map<number, string[]>();

  for (const row of aliasRows) {
    aliasKeyToCanonicalName.set(
      row.aliasKey,
      normalizePokemonName(row.displayName || row.pokemonName)
    );

    const aliases = pokemonIdToAliases.get(row.pokemonId) || [];
    aliases.push(row.alias);
    pokemonIdToAliases.set(row.pokemonId, aliases);
  }

  for (const row of collapseRows) {
    collapseKeyToCanonicalName.set(
      row.sourceKey,
      normalizePokemonName(row.displayName || row.pokemonName)
    );

    const sources = pokemonIdToCollapseSources.get(row.targetPokemonId) || [];
    sources.push(row.sourceName);
    pokemonIdToCollapseSources.set(row.targetPokemonId, sources);
  }

  return {
    aliasKeyToCanonicalName,
    pokemonIdToAliases,
    collapseKeyToCanonicalName,
    pokemonIdToCollapseSources,
  };
}

export function serializePokemonAliasMaps(aliasMaps: PokemonAliasMaps): SerializedPokemonAliasMaps {
  return {
    aliasKeyToCanonicalName: Array.from(aliasMaps.aliasKeyToCanonicalName.entries()),
    collapseKeyToCanonicalName: Array.from(aliasMaps.collapseKeyToCanonicalName.entries()),
  };
}

export function customPokemonAliasesForRow(
  row: { id: number; pokemonId?: number | null },
  aliasMaps: PokemonAliasMaps
): string[] {
  const pokemonId = row.pokemonId ?? row.id;
  return [
    ...(aliasMaps.pokemonIdToAliases.get(pokemonId) || []),
    ...(aliasMaps.pokemonIdToCollapseSources.get(pokemonId) || []),
  ];
}

export function normalizePokemonNameWithAliases(
  name: string,
  aliasMaps: PokemonAliasMaps
): string {
  const nameKey = pokemonNameKey(name);
  const aliasCanonical = aliasMaps.aliasKeyToCanonicalName.get(nameKey);
  const collapseCanonical = aliasMaps.collapseKeyToCanonicalName.get(nameKey);
  return aliasCanonical || collapseCanonical || normalizePokemonName(name);
}

export function pokemonExactLookupKeysWithAliases(
  name: string | null | undefined,
  aliasMaps: PokemonAliasMaps,
  options: PokemonNameOptions = {}
): Set<string> {
  const keys = pokemonExactLookupKeys(name, options);
  if (!name) return keys;

  const nameKey = pokemonNameKey(name);
  const mappedCanonical = aliasMaps.aliasKeyToCanonicalName.get(nameKey)
    || aliasMaps.collapseKeyToCanonicalName.get(nameKey);
  if (mappedCanonical) {
    for (const key of pokemonExactLookupKeys(mappedCanonical, options)) {
      keys.add(key);
    }
  }

  return keys;
}

export function pokemonNormalizedLookupKeysWithAliases(
  name: string | null | undefined,
  aliasMaps: PokemonAliasMaps,
  options: PokemonNameOptions = {}
): Set<string> {
  const keys = pokemonNormalizedLookupKeys(name, options);
  if (!name) return keys;

  const normalizedKey = pokemonNameKey(normalizePokemonNameWithAliases(name, aliasMaps));
  if (normalizedKey) keys.add(normalizedKey);

  return keys;
}

export function pokemonLookupKeysForRowWithAliases(
  row: PokemonLookupRow,
  aliasMaps: PokemonAliasMaps,
  options: PokemonNameOptions = {},
  normalized = false
): Set<string> {
  const keyFn = normalized
    ? pokemonNormalizedLookupKeysWithAliases
    : pokemonExactLookupKeysWithAliases;
  const keys = new Set<string>([
    ...keyFn(row.name, aliasMaps, options),
    ...keyFn(row.displayName, aliasMaps, options),
  ]);

  const pokemonId = row.pokemonId ?? row.id;
  if (pokemonId) {
    for (const alias of [
      ...(aliasMaps.pokemonIdToAliases.get(pokemonId) || []),
      ...(aliasMaps.pokemonIdToCollapseSources.get(pokemonId) || []),
    ]) {
      for (const key of keyFn(alias, aliasMaps, options)) {
        keys.add(key);
      }
    }
  }

  return keys;
}
