import type { PokemonBattleState, RosterPokemon } from "@/hooks/use-showdown-battle";
import {
  pokemonLookupKeysForClientRow,
  serializedPokemonAliasLookupKeys,
} from "@/lib/pokemon-name-client";
import type { SerializedPokemonAliasMaps } from "@/lib/pokemon-name-aliases";
import { normalizePokemonName } from "@/lib/pokemon-name-utils";

const URSHIFU_FORM_KEYS = new Set([
  "urshifusinglestrike",
  "urshifusinglestrikegmax",
  "urshifurapidstrike",
  "urshifurapidstrikegmax",
]);

function matchesUrshifuBaseAndForm(leftKeys: Set<string>, rightKeys: Set<string>) {
  const leftIsBase = leftKeys.has("urshifu");
  const rightIsBase = rightKeys.has("urshifu");
  const leftIsForm = [...leftKeys].some((key) => URSHIFU_FORM_KEYS.has(key));
  const rightIsForm = [...rightKeys].some((key) => URSHIFU_FORM_KEYS.has(key));
  return (leftIsBase && rightIsForm) || (rightIsBase && leftIsForm);
}

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
  return matchesUrshifuBaseAndForm(rosterKeys, keys);
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
    return getRosterBattleState(rosterPokemon, stateMap, aliasMaps)?.brought;
  });

  if (broughtRoster.length > 0) {
    return broughtRoster.filter((rosterPokemon) => {
      const state = getRosterBattleState(rosterPokemon, stateMap, aliasMaps);
      return !state?.fainted;
    }).length;
  }

  // During the initial connection the roster may not have matched yet.
  return [...stateMap.values()].filter((state) => state.brought && !state.fainted).length || 6;
}
