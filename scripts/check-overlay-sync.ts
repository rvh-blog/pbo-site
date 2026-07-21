import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { rosterPokemonMatchesName } from "../src/lib/broadcast-pokemon-matching";
import { pokemonExactLookupKeys } from "../src/lib/pokemon-name-utils";
import { getSeasonBattleRules } from "../src/lib/season-battle-rules";
import { extractShowdownFormatId, extractShowdownRoomId } from "../src/lib/showdown-room";
import { extractShiny, parseLine } from "../src/lib/battle-event-parser";
import {
  NEW_MEGA_BATTLEFIELD_SPRITES,
  getBattlefieldSpriteOverride,
  getBattlefieldSpriteOverrideForFailedUrl,
} from "../src/lib/battlefield-sprite-overrides";
import {
  getChampionsMegaSpriteUrl,
  getGen5StaticSpriteUrl,
  getShowdownSpriteUrl,
} from "../src/lib/showdown-sprites";

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

const shinyPreview = parseLine("|poke|p1|Zeraora, L50, shiny|");
const shinySwitch = parseLine("|switch|p1a: Zeraora|Zeraora, L50, shiny|100/100");
const normalSwitch = parseLine("|switch|p2a: Zeraora|Zeraora, L50|100/100");
assert.equal(extractShiny("Zeraora, L50, shiny"), true);
assert.equal(shinyPreview?.isShiny, true, "Team preview must preserve shiny status");
assert.equal(shinySwitch?.isShiny, true, "Switch events must preserve shiny status");
assert.equal(normalSwitch?.isShiny, false, "Non-shiny Pokemon must remain non-shiny");
assert.equal(
  getShowdownSpriteUrl("Zeraora", true),
  "https://play.pokemonshowdown.com/sprites/ani-shiny/zeraora.gif",
);
assert.equal(
  getGen5StaticSpriteUrl("Ogerpon-Hearthflame", true),
  "https://play.pokemonshowdown.com/sprites/gen5-shiny/ogerpon-hearthflame.png",
  "Shiny forms must use the shared shiny sprite directory",
);

assert.equal(NEW_MEGA_BATTLEFIELD_SPRITES.length, 48, "All 48 new Mega battlefield sprites must be registered");
for (const { forme, spriteId, localUrl } of NEW_MEGA_BATTLEFIELD_SPRITES) {
  const parts = forme.split("-");
  const megaIndex = parts.indexOf("mega");
  const prefixAlias = ["Mega", ...parts.slice(0, megaIndex), ...parts.slice(megaIndex + 1)].join(" ");
  const expectedUrl = localUrl ?? `/images/pokemon/sprites/${spriteId}.png`;
  assert(existsSync(resolve(process.cwd(), "public", expectedUrl.slice(1))), `${forme}'s local PNG must exist`);
  assert.equal(getBattlefieldSpriteOverride(forme)?.url, expectedUrl, `${forme} must use its local battlefield sprite`);
  assert.equal(getBattlefieldSpriteOverride(prefixAlias)?.url, expectedUrl, `${prefixAlias} must use its local battlefield sprite`);
  assert.equal(getChampionsMegaSpriteUrl(forme), expectedUrl, `${forme} must use its local sidebar sprite`);
  assert.equal(getShowdownSpriteUrl(forme), expectedUrl, `${forme} must bypass missing Showdown sidebar art`);
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
  assert.equal(
    getChampionsMegaSpriteUrl(parts.slice(0, megaIndex).join("-")),
    null,
    `${forme}'s base form must not use a Champions Mega sidebar sprite`,
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
