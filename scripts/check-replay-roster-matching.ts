import assert from "node:assert/strict";
import {
  findMatchingRosterPokemon,
  type ReplayRosterPokemon,
} from "../src/lib/replay-roster-matching";
import type { PokemonAliasMaps } from "../src/lib/pokemon-name-aliases";
import { db } from "../src/lib/db";
import { pokemon } from "../src/lib/schema";

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

const lopunnyMega: ReplayRosterPokemon = {
  pokemonId: 1083,
  name: "Lopunny-mega",
  displayName: "Lopunny-Mega",
};

assert.equal(
  findMatchingRosterPokemon([lopunnyMega], "Lopunny", emptyAliasMaps)?.pokemonId,
  lopunnyMega.pokemonId,
  "An unevolved Lopunny replay entry should match its drafted Lopunny-Mega row"
);

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

const charizardMegaX: ReplayRosterPokemon = {
  pokemonId: 1084,
  name: "Charizard-mega-x",
  displayName: "Charizard-Mega-X",
};

assert.equal(
  findMatchingRosterPokemon([charizardMegaX], "Charizard")?.pokemonId,
  charizardMegaX.pokemonId,
  "Base-form previews should match Mega variants with an X/Y suffix"
);

assert.equal(
  findMatchingRosterPokemon([garchompMega], "Flygon"),
  undefined,
  "Unrelated base species must not match a drafted Mega"
);

async function checkEveryStoredMega() {
  const pokemonRows = await db
    .select({
      pokemonId: pokemon.id,
      name: pokemon.name,
      displayName: pokemon.displayName,
    })
    .from(pokemon);
  const megaRows = pokemonRows.filter((row) =>
    /-mega(?:-[a-z])?$/i.test(row.displayName || row.name)
  );

  assert.ok(megaRows.length > 0, "The Pokemon database should contain Mega forms");

  for (const mega of megaRows) {
    const megaName = mega.displayName || mega.name;
    const basePreviewName = megaName.replace(/-Mega(?:-[A-Z])?$/i, "");
    const replayPreviewName =
      basePreviewName.toLowerCase() === "floette" ? "Floette-Eternal" : basePreviewName;

    assert.equal(
      findMatchingRosterPokemon([mega], replayPreviewName, emptyAliasMaps)?.pokemonId,
      mega.pokemonId,
      `${replayPreviewName} should match the stored ${megaName} roster row`
    );
  }

  console.log(`Replay roster matching checks passed for ${megaRows.length} stored Mega forms`);
}

checkEveryStoredMega().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
