import assert from "node:assert/strict";
import { rosterPokemonMatchesName } from "../src/lib/broadcast-pokemon-matching";
import { pokemonExactLookupKeys } from "../src/lib/pokemon-name-utils";
import { getSeasonBattleRules } from "../src/lib/season-battle-rules";
import { extractShowdownFormatId, extractShowdownRoomId } from "../src/lib/showdown-room";
import {
  NEW_MEGA_BATTLEFIELD_SPRITES,
  getBattlefieldSpriteOverride,
  getBattlefieldSpriteOverrideForFailedUrl,
} from "../src/lib/battlefield-sprite-overrides";

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

assert.equal(NEW_MEGA_BATTLEFIELD_SPRITES.length, 48, "All 48 new Mega battlefield sprites must be registered");
for (const { forme, spriteId } of NEW_MEGA_BATTLEFIELD_SPRITES) {
  const parts = forme.split("-");
  const megaIndex = parts.indexOf("mega");
  const prefixAlias = ["Mega", ...parts.slice(0, megaIndex), ...parts.slice(megaIndex + 1)].join(" ");
  const expectedUrl = `/images/pokemon/sprites/${spriteId}.png`;
  assert.equal(getBattlefieldSpriteOverride(forme)?.url, expectedUrl, `${forme} must use its local battlefield sprite`);
  assert.equal(getBattlefieldSpriteOverride(prefixAlias)?.url, expectedUrl, `${prefixAlias} must use its local battlefield sprite`);
  assert.equal(
    getBattlefieldSpriteOverrideForFailedUrl(`https://play.pokemonshowdown.com/sprites/gen5/${forme.replaceAll("-", "")}.png`)?.url,
    expectedUrl,
    `${forme} must recover a failed Showdown battlefield sprite URL`,
  );
  assert.equal(
    getBattlefieldSpriteOverride(parts.slice(0, megaIndex).join("-")),
    null,
    `${forme}'s base form must keep Showdown's normal sprite`,
  );
}

for (const alias of ["Falinks-Mega", "Falinks Mega", "Mega Falinks", "Mega-Falinks"]) {
  assert.equal(
    getBattlefieldSpriteOverride(alias)?.url,
    "/images/pokemon/sprites/10303.png",
    `${alias} should use the local Mega Falinks battlefield sprite`,
  );
}
assert.equal(getBattlefieldSpriteOverride("Falinks"), null, "Base Falinks must keep Showdown's normal sprite");

console.log(`Overlay sync checks passed: ${megaCases.length} Mega cases and Showdown room/season rules`);
