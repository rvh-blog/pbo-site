import {
  normalizePokemonName,
  pokemonExactLookupKeys,
  pokemonNameKey,
  pokemonNormalizedLookupKeys,
} from "@/lib/pokemon-name-utils";
import type { SerializedPokemonAliasMaps } from "@/lib/pokemon-name-aliases";

type PokemonNameOptions = {
  friendlyMegaNames?: boolean;
};

export function serializedPokemonAliasLookupKeys(
  name: string | null | undefined,
  aliasMaps?: SerializedPokemonAliasMaps | null,
  options: PokemonNameOptions = {}
): Set<string> {
  const keys = pokemonExactLookupKeys(name, options);
  if (!name || !aliasMaps) return keys;

  const nameKey = pokemonNameKey(name);
  const aliasMap = new Map(aliasMaps.aliasKeyToCanonicalName);
  const collapseMap = new Map(aliasMaps.collapseKeyToCanonicalName);
  const mappedCanonical = aliasMap.get(nameKey) || collapseMap.get(nameKey);
  if (mappedCanonical) {
    for (const key of pokemonExactLookupKeys(mappedCanonical, options)) {
      keys.add(key);
    }
  }

  return keys;
}

export function serializedPokemonNormalizedLookupKeys(
  name: string | null | undefined,
  aliasMaps?: SerializedPokemonAliasMaps | null,
  options: PokemonNameOptions = {}
): Set<string> {
  const keys = pokemonNormalizedLookupKeys(name, options);
  if (!name || !aliasMaps) return keys;

  const nameKey = pokemonNameKey(name);
  const aliasMap = new Map(aliasMaps.aliasKeyToCanonicalName);
  const collapseMap = new Map(aliasMaps.collapseKeyToCanonicalName);
  const mappedCanonical = aliasMap.get(nameKey) || collapseMap.get(nameKey);
  const normalized = mappedCanonical || normalizePokemonName(name);
  const normalizedKey = pokemonNameKey(normalized);
  if (normalizedKey) keys.add(normalizedKey);

  return keys;
}

export function pokemonLookupKeysForClientRow(
  row: {
    name?: string | null;
    displayName?: string | null;
    nameAliases?: string[] | null;
  },
  aliasMaps?: SerializedPokemonAliasMaps | null,
  options: PokemonNameOptions = {},
  normalized = false
): Set<string> {
  const keyFn = normalized
    ? serializedPokemonNormalizedLookupKeys
    : serializedPokemonAliasLookupKeys;
  const keys = new Set<string>([
    ...keyFn(row.name, aliasMaps, options),
    ...keyFn(row.displayName, aliasMaps, options),
  ]);

  for (const alias of row.nameAliases || []) {
    for (const key of keyFn(alias, aliasMaps, options)) {
      keys.add(key);
    }
  }

  return keys;
}

export function pokemonNamesMatchForClient(
  left: string | null | undefined,
  right: string | null | undefined,
  aliasMaps?: SerializedPokemonAliasMaps | null,
  options: PokemonNameOptions = {}
) {
  const leftExact = serializedPokemonAliasLookupKeys(left, aliasMaps, options);
  const rightExact = serializedPokemonAliasLookupKeys(right, aliasMaps, options);
  for (const key of leftExact) {
    if (rightExact.has(key)) return true;
  }

  const leftNormalized = serializedPokemonNormalizedLookupKeys(left, aliasMaps, options);
  const rightNormalized = serializedPokemonNormalizedLookupKeys(right, aliasMaps, options);
  for (const key of leftNormalized) {
    if (rightNormalized.has(key)) return true;
  }

  return false;
}
