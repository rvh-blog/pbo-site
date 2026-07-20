import assert from "node:assert/strict";
import {
  findMatchingRosterPokemon,
  type ReplayRosterPokemon,
} from "../src/lib/replay-roster-matching";
import type { PokemonAliasMaps } from "../src/lib/pokemon-name-aliases";

const emptyAliasMaps: PokemonAliasMaps = {
  aliasKeyToCanonicalName: new Map(),
  pokemonIdToAliases: new Map(),
  collapseKeyToCanonicalName: new Map(),
  pokemonIdToCollapseSources: new Map(),
};

const garchompMega: ReplayRosterPokemon = {
  pokemonId: 1082,
  name: "Garchomp-mega",
  displayName: "Garchomp-Mega",
};

assert.equal(
  findMatchingRosterPokemon([garchompMega], "Garchomp", emptyAliasMaps)?.pokemonId,
  garchompMega.pokemonId,
  "A base Garchomp kill event should match its recorded Garchomp-Mega row"
);

const garchompBase: ReplayRosterPokemon = {
  pokemonId: 13,
  name: "Garchomp",
  displayName: "Garchomp",
};

assert.equal(
  findMatchingRosterPokemon([garchompMega, garchompBase], "Garchomp")?.pokemonId,
  garchompBase.pokemonId,
  "An exact base-form roster entry must win over a Mega preview alias"
);

assert.equal(
  findMatchingRosterPokemon([garchompMega], "Garchomp-Mega")?.pokemonId,
  garchompMega.pokemonId,
  "An evolved Mega replay entry should continue to match exactly"
);

assert.equal(
  findMatchingRosterPokemon([garchompMega], "Flygon"),
  undefined,
  "Unrelated base species must not match a drafted Mega"
);

console.log("Replay roster matching checks passed");
