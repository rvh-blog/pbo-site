import {
  pokemonExactLookupKeys,
  pokemonNameKey,
  pokemonNormalizedLookupKeys,
} from "@/lib/pokemon-name-utils";
import {
  type PokemonAliasMaps,
  pokemonExactLookupKeysWithAliases,
  pokemonLookupKeysForRowWithAliases,
  pokemonNormalizedLookupKeysWithAliases,
} from "@/lib/pokemon-name-aliases";

export interface ReplayRosterPokemon {
  pokemonId: number;
  name: string;
  displayName: string | null;
}

function setsIntersect<T>(left: Set<T>, right: Set<T>): boolean {
  for (const value of left) {
    if (right.has(value)) return true;
  }
  return false;
}

function pokemonNamesMatch(
  left: string | null | undefined,
  right: string | null | undefined,
  aliasMaps?: PokemonAliasMaps
): boolean {
  const leftExactKeys = aliasMaps
    ? pokemonExactLookupKeysWithAliases(left, aliasMaps)
    : pokemonExactLookupKeys(left);
  const rightExactKeys = aliasMaps
    ? pokemonExactLookupKeysWithAliases(right, aliasMaps)
    : pokemonExactLookupKeys(right);
  if (setsIntersect(leftExactKeys, rightExactKeys)) return true;

  const leftNormalizedKeys = aliasMaps
    ? pokemonNormalizedLookupKeysWithAliases(left, aliasMaps)
    : pokemonNormalizedLookupKeys(left);
  const rightNormalizedKeys = aliasMaps
    ? pokemonNormalizedLookupKeysWithAliases(right, aliasMaps)
    : pokemonNormalizedLookupKeys(right);
  return setsIntersect(leftNormalizedKeys, rightNormalizedKeys);
}

export function findMatchingRosterPokemon(
  roster: ReplayRosterPokemon[],
  replayPokemonName: string,
  aliasMaps?: PokemonAliasMaps
): ReplayRosterPokemon | undefined {
  // Match equivalent database/Showdown spellings even when the optional
  // admin alias tables are unavailable or have not been populated yet.
  const compactReplayKey = pokemonNameKey(replayPokemonName);
  const compactMatch = roster.find((row) => (
    pokemonNameKey(row.name) === compactReplayKey
    || pokemonNameKey(row.displayName) === compactReplayKey
  ));
  if (compactMatch) return compactMatch;

  if (!aliasMaps) {
    return roster.find((row) => (
      pokemonNamesMatch(replayPokemonName, row.displayName || row.name)
    ));
  }

  const exactKeys = pokemonExactLookupKeysWithAliases(replayPokemonName, aliasMaps);
  const exactMatch = roster.find((row) => (
    setsIntersect(exactKeys, pokemonLookupKeysForRowWithAliases(row, aliasMaps))
  ));
  if (exactMatch) return exactMatch;

  const normalizedKeys = pokemonNormalizedLookupKeysWithAliases(replayPokemonName, aliasMaps);
  const normalizedMatch = roster.find((row) => (
    setsIntersect(normalizedKeys, pokemonLookupKeysForRowWithAliases(row, aliasMaps, {}, true))
  ));
  if (normalizedMatch) return normalizedMatch;

  // Use the built-in alias catalogue independently of database-backed aliases
  // so known forms such as Single Strike Urshifu still resolve.
  return roster.find((row) => (
    pokemonNamesMatch(replayPokemonName, row.name)
    || pokemonNamesMatch(replayPokemonName, row.displayName)
  ));
}
