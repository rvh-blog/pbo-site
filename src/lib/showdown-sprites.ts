const SHOWDOWN_SPRITES = "https://play.pokemonshowdown.com/sprites";

const SPRITE_NAME_OVERRIDES: Record<string, string> = {
  "urshifu-rapid-strike": "urshifu-rapidstrike",
  "urshifu-single-strike": "urshifu",
  "urshifu-rapid-strike-gmax": "urshifu-gmax",
  "urshifu-single-strike-gmax": "urshifu-gmax",
  "palafin-zero": "palafin",
  "sinistcha-artisan": "sinistcha",
  "shaymin-land": "shaymin",
  "xerneas-active": "xerneas",
  "enamorus-incarnate": "enamorus",
  "landorus-incarnate": "landorus",
  "tornadus-incarnate": "tornadus",
  "thundurus-incarnate": "thundurus",
  "darmanitan-galar-zen": "darmanitan-galar",
  "indeedee-m": "indeedee",
  "dudunsparce-three-segment": "dudunsparce-threesegment",
  "alcremie-vanilla-cream": "alcremie",
  "alcremie-ruby-cream": "alcremie",
  "alcremie-matcha-cream": "alcremie",
  "alcremie-mint-cream": "alcremie",
  "alcremie-lemon-cream": "alcremie",
  "alcremie-salted-cream": "alcremie",
  "alcremie-ruby-swirl": "alcremie",
  "alcremie-caramel-swirl": "alcremie",
  "alcremie-rainbow-swirl": "alcremie",
  "florges-red": "florges",
  "florges-orange": "florges",
  "florges-yellow": "florges",
  "florges-white": "florges",
  "ogerpon-cornerstone-tera": "ogerpon-cornerstonetera",
  "ogerpon-wellspring-tera": "ogerpon-wellspringtera",
  "ogerpon-hearthflame-tera": "ogerpon-hearthflametera",
};

const DEX_SPRITE_OVERRIDES: Record<string, string> = {
  ogerponcornerstone: "ogerpon-cornerstone",
  ogerponwellspring: "ogerpon-wellspring",
  ogerponhearthflame: "ogerpon-hearthflame",
  ogerponcornerstonetera: "ogerpon-cornerstonetera",
  ogerponwellspringtera: "ogerpon-wellspringtera",
  ogerponhearthflametera: "ogerpon-hearthflametera",
};

function spriteId(name: string) {
  const id = name.toLowerCase().replace(/[^a-z0-9-]/g, "");
  return SPRITE_NAME_OVERRIDES[id] ?? id;
}

export function getShowdownSpriteUrl(name: string) {
  return `${SHOWDOWN_SPRITES}/ani/${spriteId(name)}.gif`;
}

export const getStaticSpriteUrl = getShowdownSpriteUrl;

export function getDexSpriteUrl(name: string) {
  const compactId = spriteId(name).replace(/-/g, "");
  return `${SHOWDOWN_SPRITES}/dex/${DEX_SPRITE_OVERRIDES[compactId] ?? compactId}.png`;
}

export function getGen5SpriteUrl(name: string) {
  return `${SHOWDOWN_SPRITES}/gen5ani/${spriteId(name)}.gif`;
}

export function getGen5StaticSpriteUrl(name: string) {
  return `${SHOWDOWN_SPRITES}/gen5/${spriteId(name).replace(/-/g, "")}.png`;
}
