import type { PokemonBattleState, RosterPokemon } from "@/hooks/use-showdown-battle";
import {
  pokemonLookupKeysForClientRow,
  serializedPokemonAliasLookupKeys,
} from "@/lib/pokemon-name-client";
import type { SerializedPokemonAliasMaps } from "@/lib/pokemon-name-aliases";
import { normalizePokemonName } from "@/lib/pokemon-name-utils";

export function rosterPokemonMatchesKeys(
  pokemon: RosterPokemon,
  keys: Set<string>,
  aliasMaps?: SerializedPokemonAliasMaps | null
) {
  const rosterKeys = new Set([
    ...(pokemon.lookupKeys || []),
    ...pokemonLookupKeysForClientRow(pokemon, aliasMaps),
  ]);
  for (const key of keys) {
    if (rosterKeys.has(key)) return true;
  }
  return false;
}

export function rosterPokemonMatchesName(
  pokemon: RosterPokemon,
  name: string,
  aliasMaps?: SerializedPokemonAliasMaps | null
) {
  return rosterPokemonMatchesKeys(
    pokemon,
    serializedPokemonAliasLookupKeys(name, aliasMaps),
    aliasMaps
  );
}

export function getRosterBattleState(
  pokemon: RosterPokemon,
  stateMap: Map<string, PokemonBattleState>,
  aliasMaps?: SerializedPokemonAliasMaps | null
): PokemonBattleState | null {
  const rosterName = pokemon.displayName || pokemon.name;
  const direct = stateMap.get(normalizePokemonName(rosterName));
  if (direct) return direct;

  for (const state of stateMap.values()) {
    if (
      rosterPokemonMatchesName(pokemon, state.species, aliasMaps) ||
      rosterPokemonMatchesName(pokemon, state.battleForm, aliasMaps)
    ) {
      return state;
    }
  }
  return null;
}
