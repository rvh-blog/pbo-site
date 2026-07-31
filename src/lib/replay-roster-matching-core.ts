import {
  pokemonExactLookupKeys,
  pokemonFormFamilyLookupKeys,
  pokemonNameKey,
  pokemonNormalizedLookupKeys,
} from "@/lib/pokemon-name-utils";

export type PokemonNameCandidate = {
  name: string | null | undefined;
  displayName?: string | null;
};

function setsIntersect<T>(left: Set<T>, right: Set<T>): boolean {
  for (const value of left) {
    if (right.has(value)) return true;
  }
  return false;
}

/**
 * Match a replay name using the client-safe built-in name catalogue.
 *
 * Direct base-form matches are checked first. If no base row exists, the
 * generated Mega aliases allow a Showdown preview/base form (for example,
 * Lopunny) to match its drafted Mega row (Lopunny-Mega).
 */
export function findBuiltInPokemonNameMatch<T>(
  candidates: T[],
  replayPokemonName: string,
  getPokemon: (candidate: T) => PokemonNameCandidate
): T | undefined {
  const compactReplayKey = pokemonNameKey(replayPokemonName);
  const directMatch = candidates.find((candidate) => {
    const pokemon = getPokemon(candidate);
    return (
      pokemonNameKey(pokemon.name) === compactReplayKey ||
      pokemonNameKey(pokemon.displayName) === compactReplayKey
    );
  });
  if (directMatch) return directMatch;

  const replayFamilyKeys = new Set(pokemonFormFamilyLookupKeys(replayPokemonName));
  if (replayFamilyKeys.size > 0) {
    const familyMatch = candidates.find((candidate) => {
      const pokemon = getPokemon(candidate);
      return (
        setsIntersect(replayFamilyKeys, new Set(pokemonFormFamilyLookupKeys(pokemon.name))) ||
        setsIntersect(replayFamilyKeys, new Set(pokemonFormFamilyLookupKeys(pokemon.displayName)))
      );
    });
    if (familyMatch) return familyMatch;
  }

  const exactKeys = pokemonExactLookupKeys(replayPokemonName);
  const exactMatch = candidates.find((candidate) => {
    const pokemon = getPokemon(candidate);
    return (
      setsIntersect(exactKeys, pokemonExactLookupKeys(pokemon.name)) ||
      setsIntersect(exactKeys, pokemonExactLookupKeys(pokemon.displayName))
    );
  });
  if (exactMatch) return exactMatch;

  const normalizedKeys = pokemonNormalizedLookupKeys(replayPokemonName);
  return candidates.find((candidate) => {
    const pokemon = getPokemon(candidate);
    return (
      setsIntersect(normalizedKeys, pokemonNormalizedLookupKeys(pokemon.name)) ||
      setsIntersect(normalizedKeys, pokemonNormalizedLookupKeys(pokemon.displayName))
    );
  });
}
