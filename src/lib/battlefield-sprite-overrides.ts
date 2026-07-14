export interface BattlefieldSpriteOverride {
  url: string;
  emergencyUrl: string;
  width: number;
  height: number;
  y: number;
  pixelated: boolean;
}

interface NewMegaSpriteDefinition {
  forme: string;
  spriteId: number;
  baseSpriteId: number;
}

/** Champions Mega forms whose local static art fills gaps in Showdown's
 * battlefield sprite sets. */
export const NEW_MEGA_BATTLEFIELD_SPRITES: readonly NewMegaSpriteDefinition[] = [
  { forme: "clefable-mega", spriteId: 10278, baseSpriteId: 36 },
  { forme: "victreebel-mega", spriteId: 10279, baseSpriteId: 71 },
  { forme: "starmie-mega", spriteId: 10280, baseSpriteId: 121 },
  { forme: "dragonite-mega", spriteId: 10281, baseSpriteId: 149 },
  { forme: "meganium-mega", spriteId: 10282, baseSpriteId: 154 },
  { forme: "feraligatr-mega", spriteId: 10283, baseSpriteId: 160 },
  { forme: "skarmory-mega", spriteId: 10284, baseSpriteId: 227 },
  { forme: "froslass-mega", spriteId: 10285, baseSpriteId: 478 },
  { forme: "emboar-mega", spriteId: 10286, baseSpriteId: 500 },
  { forme: "excadrill-mega", spriteId: 10287, baseSpriteId: 530 },
  { forme: "scolipede-mega", spriteId: 10288, baseSpriteId: 545 },
  { forme: "scrafty-mega", spriteId: 10289, baseSpriteId: 560 },
  { forme: "eelektross-mega", spriteId: 10290, baseSpriteId: 604 },
  { forme: "chandelure-mega", spriteId: 10291, baseSpriteId: 609 },
  { forme: "chesnaught-mega", spriteId: 10292, baseSpriteId: 652 },
  { forme: "delphox-mega", spriteId: 10293, baseSpriteId: 655 },
  { forme: "greninja-mega", spriteId: 10294, baseSpriteId: 658 },
  { forme: "pyroar-mega", spriteId: 10295, baseSpriteId: 668 },
  { forme: "floette-mega", spriteId: 10296, baseSpriteId: 670 },
  { forme: "malamar-mega", spriteId: 10297, baseSpriteId: 687 },
  { forme: "barbaracle-mega", spriteId: 10298, baseSpriteId: 689 },
  { forme: "dragalge-mega", spriteId: 10299, baseSpriteId: 691 },
  { forme: "hawlucha-mega", spriteId: 10300, baseSpriteId: 701 },
  { forme: "zygarde-mega", spriteId: 10301, baseSpriteId: 718 },
  { forme: "drampa-mega", spriteId: 10302, baseSpriteId: 780 },
  { forme: "falinks-mega", spriteId: 10303, baseSpriteId: 870 },
  { forme: "raichu-mega-x", spriteId: 10304, baseSpriteId: 26 },
  { forme: "raichu-mega-y", spriteId: 10305, baseSpriteId: 26 },
  { forme: "chimecho-mega", spriteId: 10306, baseSpriteId: 358 },
  { forme: "absol-mega-z", spriteId: 10307, baseSpriteId: 359 },
  { forme: "staraptor-mega", spriteId: 10308, baseSpriteId: 398 },
  { forme: "garchomp-mega-z", spriteId: 10309, baseSpriteId: 445 },
  { forme: "lucario-mega-z", spriteId: 10310, baseSpriteId: 448 },
  { forme: "heatran-mega", spriteId: 10311, baseSpriteId: 485 },
  { forme: "darkrai-mega", spriteId: 10312, baseSpriteId: 491 },
  { forme: "golurk-mega", spriteId: 10313, baseSpriteId: 623 },
  { forme: "meowstic-mega", spriteId: 10314, baseSpriteId: 678 },
  { forme: "crabominable-mega", spriteId: 10315, baseSpriteId: 740 },
  { forme: "golisopod-mega", spriteId: 10316, baseSpriteId: 768 },
  { forme: "magearna-mega", spriteId: 10317, baseSpriteId: 801 },
  { forme: "magearna-original-mega", spriteId: 10318, baseSpriteId: 10147 },
  { forme: "zeraora-mega", spriteId: 10319, baseSpriteId: 807 },
  { forme: "scovillain-mega", spriteId: 10320, baseSpriteId: 952 },
  { forme: "glimmora-mega", spriteId: 10321, baseSpriteId: 970 },
  { forme: "tatsugiri-curly-mega", spriteId: 10322, baseSpriteId: 978 },
  { forme: "tatsugiri-droopy-mega", spriteId: 10323, baseSpriteId: 10258 },
  { forme: "tatsugiri-stretchy-mega", spriteId: 10324, baseSpriteId: 10259 },
  { forme: "baxcalibur-mega", spriteId: 10325, baseSpriteId: 998 },
] as const;

function normalizeBattlefieldSpecies(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function megaAliases(forme: string) {
  const parts = forme.split("-");
  const megaIndex = parts.indexOf("mega");
  const base = parts.slice(0, megaIndex);
  const suffix = parts.slice(megaIndex + 1);
  return [
    normalizeBattlefieldSpecies([...base, "mega", ...suffix].join("-")),
    normalizeBattlefieldSpecies(["mega", ...base, ...suffix].join("-")),
  ];
}

const NEW_MEGA_OVERRIDES = new Map<string, BattlefieldSpriteOverride>();
for (const definition of NEW_MEGA_BATTLEFIELD_SPRITES) {
  const override: BattlefieldSpriteOverride = {
    url: `/images/pokemon/sprites/${definition.spriteId}.png`,
    emergencyUrl: `/images/pokemon/sprites/${definition.baseSpriteId}.png`,
    width: 96,
    height: 96,
    y: 0,
    pixelated: true,
  };
  for (const alias of megaAliases(definition.forme)) {
    NEW_MEGA_OVERRIDES.set(alias, override);
  }
}

export function getBattlefieldSpriteOverride(speciesOrForm: string | null | undefined) {
  return NEW_MEGA_OVERRIDES.get(normalizeBattlefieldSpecies(speciesOrForm ?? "")) ?? null;
}

export function getBattlefieldSpriteOverrideForFailedUrl(url: string) {
  let decoded = url;
  try { decoded = decodeURIComponent(url); } catch {}
  const normalized = normalizeBattlefieldSpecies(decoded);
  for (const [alias, override] of NEW_MEGA_OVERRIDES) {
    if (normalized.includes(alias)) return override;
  }
  return null;
}
