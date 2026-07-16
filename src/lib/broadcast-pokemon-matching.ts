import type { PokemonBattleState, RosterPokemon } from "@/hooks/use-showdown-battle";
import {
  pokemonLookupKeysForClientRow,
  serializedPokemonAliasLookupKeys,
} from "@/lib/pokemon-name-client";
import type { SerializedPokemonAliasMaps } from "@/lib/pokemon-name-aliases";
import { normalizePokemonName } from "@/lib/pokemon-name-utils";

const URSHIFU_SINGLE_STRIKE_KEYS = new Set([
  "urshifusinglestrike",
  "urshifusinglestrikegmax",
]);

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

/**
 * Resolve a roster slot against a team's battle state without conflating
 * distinct Urshifu forms. Showdown may expose only generic `Urshifu` during
 * team preview; in PBO that generic state is reserved for the Single-Strike
 * roster slot. Rapid-Strike requires an explicit Rapid-Strike state.
 */
export function getRosterBattleStateForTeam(
  pokemon: RosterPokemon,
  roster: RosterPokemon[],
  stateMap: Map<string, PokemonBattleState>,
  aliasMaps?: SerializedPokemonAliasMaps | null
): PokemonBattleState | null {
  const direct = getRosterBattleState(pokemon, stateMap, aliasMaps);
  if (direct) return direct;

  const urshifuSingleStrikeRoster = roster.filter((row) => {
    const keys = new Set([
      ...(row.lookupKeys || []),
      ...pokemonLookupKeysForClientRow(row, aliasMaps),
    ]);
    return [...keys].some((key) => URSHIFU_SINGLE_STRIKE_KEYS.has(key));
  });

  if (urshifuSingleStrikeRoster.length !== 1 || urshifuSingleStrikeRoster[0] !== pokemon) return null;

  for (const state of stateMap.values()) {
    const stateKeys = serializedPokemonAliasLookupKeys(state.species, aliasMaps);
    for (const key of serializedPokemonAliasLookupKeys(state.battleForm, aliasMaps)) {
      stateKeys.add(key);
    }
    if (stateKeys.has("urshifu")) return state;
  }

  return null;
}

/**
 * Count alive drafted slots from the normalized roster view.
 *
 * Showdown can emit separate base-form and evolved-form state entries for one
 * drafted Pokemon. Counting the raw state map would count those entries twice;
 * the roster is the authoritative set of unique drafted slots.
 */
export function countAliveRosterSlots(
  roster: RosterPokemon[],
  stateMap: Map<string, PokemonBattleState>,
  aliasMaps?: SerializedPokemonAliasMaps | null
) {
  const broughtRoster = roster.filter((rosterPokemon) => {
    return getRosterBattleStateForTeam(rosterPokemon, roster, stateMap, aliasMaps)?.brought;
  });

  if (broughtRoster.length > 0) {
    return broughtRoster.filter((rosterPokemon) => {
      const state = getRosterBattleStateForTeam(rosterPokemon, roster, stateMap, aliasMaps);
      return !state?.fainted;
    }).length;
  }

  // During the initial connection the roster may not have matched yet.
  return [...stateMap.values()].filter((state) => state.brought && !state.fainted).length || 6;
}
