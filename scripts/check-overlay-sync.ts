import assert from "node:assert/strict";
import { rosterPokemonMatchesName } from "../src/lib/broadcast-pokemon-matching";
import { pokemonExactLookupKeys } from "../src/lib/pokemon-name-utils";
import { getSeasonBattleRules } from "../src/lib/season-battle-rules";
import { extractShowdownFormatId, extractShowdownRoomId } from "../src/lib/showdown-room";
import { getBattlefieldSpriteOverride } from "../src/lib/battlefield-sprite-overrides";

const megaCases = [
  ["Pinsir-Mega", "Pinsir"],
  ["Mega Pinsir", "Pinsir"],
  ["Charizard-Mega-X", "Charizard"],
  ["Mega Charizard Y", "Charizard"],
  ["Mewtwo-Mega-Y", "Mewtwo"],
] as const;

for (const [mega, base] of megaCases) {
  assert(pokemonExactLookupKeys(mega).has(base.toLowerCase()), `${mega} must match ${base}`);
  assert(
    rosterPokemonMatchesName({
      pokemonId: 1,
      name: mega,
      displayName: mega,
      spriteUrl: null,
      types: [],
      isTeraCaptain: false,
    }, base),
    `${base} preview must classify ${mega} as brought`
  );
}

const liveUrl = "https://play.pokemonshowdown.com/battle-gen9championsnatdexdraft-2648797081";
assert.equal(extractShowdownRoomId(liveUrl), "battle-gen9championsnatdexdraft-2648797081");
assert.equal(extractShowdownFormatId(liveUrl), "gen9championsnatdexdraft");
assert.equal(
  extractShowdownRoomId("https://replay.pokemonshowdown.com/gen9championsnatdexdraft-2648797081"),
  "battle-gen9championsnatdexdraft-2648797081"
);
assert.equal(
  extractShowdownRoomId("battle-gen9championsnatdexdraft-2648797081-privatekey"),
  "battle-gen9championsnatdexdraft-2648797081-privatekey"
);

assert.equal(getSeasonBattleRules(11).usesStatPoints, true);
assert.equal(getSeasonBattleRules(11).friendlyMegaNames, true);
assert(getSeasonBattleRules(11).showdownFormats.includes("gen9championsnatdexdraft"));

for (const alias of ["Dragalge-Mega", "Dragalge Mega", "Mega Dragalge", "Mega-Dragalge"]) {
  assert.equal(
    getBattlefieldSpriteOverride(alias)?.url,
    "/images/pokemon/sprites/10299.png",
    `${alias} must resolve to the Mega Dragalge battlefield fallback`
  );
}
assert.equal(getBattlefieldSpriteOverride("Dragalge"), null, "Base Dragalge must keep Showdown's normal sprite");

console.log(`Overlay sync checks passed: ${megaCases.length} Mega cases and Showdown room/season rules`);
