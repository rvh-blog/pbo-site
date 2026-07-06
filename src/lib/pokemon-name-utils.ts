function cleanPokemonNameInput(name: string): string {
  let cleaned = name.split(",")[0].trim();
  cleaned = cleaned.replace(/^\*/, "").replace(/-\*$/, "");
  cleaned = cleaned.replace(/-Tera$/, "");
  return cleaned;
}

export function pokemonNameKey(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

type PokemonNameOptions = {
  friendlyMegaNames?: boolean;
};

function titleCasePokemonPart(part: string) {
  if (!part) return part;
  return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
}

function splitPokemonNameParts(name: string): string[] {
  return name.trim().replace(/_/g, "-").replace(/\s+/g, "-").split("-").filter(Boolean);
}

function formatPokemonNameParts(parts: string[]): string {
  return parts.map(titleCasePokemonPart).join("-");
}

function canonicalizeMegaPokemonName(name: string): string | null {
  const parts = splitPokemonNameParts(name);
  const megaIndex = parts.findIndex((part) => part.toLowerCase() === "mega");
  if (megaIndex < 0) return null;

  const variantSuffixes = new Set(["x", "y"]);
  let baseParts: string[];
  let suffixParts: string[];

  if (megaIndex === 0) {
    const rest = parts.slice(1);
    const lastPart = rest[rest.length - 1]?.toLowerCase();
    const hasVariantSuffix = lastPart ? variantSuffixes.has(lastPart) : false;
    baseParts = hasVariantSuffix ? rest.slice(0, -1) : rest;
    suffixParts = hasVariantSuffix ? rest.slice(-1) : [];
  } else {
    baseParts = parts.slice(0, megaIndex);
    suffixParts = parts.slice(megaIndex + 1);
  }

  if (baseParts.length === 0) return null;

  const baseName = formatPokemonNameParts(baseParts);
  const suffix = suffixParts.map((part) => part.toUpperCase()).join("-");
  return [baseName, "Mega", suffix].filter(Boolean).join("-");
}

function megaPokemonNameAliases(name: string): string[] {
  const canonicalName = canonicalizeMegaPokemonName(name);
  if (!canonicalName) return [];

  const parts = splitPokemonNameParts(canonicalName);
  const megaIndex = parts.findIndex((part) => part.toLowerCase() === "mega");
  if (megaIndex < 0) return [canonicalName];

  const baseParts = parts.slice(0, megaIndex);
  const suffixParts = parts.slice(megaIndex + 1);
  const baseHyphen = baseParts.join("-");
  const baseSpace = baseParts.join(" ");
  const suffixHyphen = suffixParts.join("-");
  const suffixSpace = suffixParts.join(" ");

  return [
    canonicalName,
    [baseHyphen, "Mega", suffixHyphen].filter(Boolean).join("-"),
    ["Mega", baseHyphen, suffixHyphen].filter(Boolean).join("-"),
    [baseSpace, "Mega", suffixSpace].filter(Boolean).join(" "),
    ["Mega", baseSpace, suffixSpace].filter(Boolean).join(" "),
  ];
}

export function shouldUseFriendlyMegaNamesForSeason(seasonNumber: number | null | undefined) {
  return (seasonNumber ?? 0) >= 11;
}

export function formatPokemonDisplayName(
  name: string | null | undefined,
  displayName?: string | null,
  options: PokemonNameOptions = {}
) {
  const rawName = (displayName || name || "").trim();
  if (!rawName) return "";
  if (!options.friendlyMegaNames) return rawName;

  const normalized = rawName.toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
  const parts = normalized.split("-").filter(Boolean);

  if (parts[0] === "mega" && parts.length > 1) {
    return ["Mega", ...parts.slice(1).map(titleCasePokemonPart)].join(" ");
  }

  const megaIndex = parts.indexOf("mega");
  if (megaIndex > 0) {
    const base = parts.slice(0, megaIndex).map(titleCasePokemonPart).join(" ");
    const suffix = parts.slice(megaIndex + 1).map((part) => part.toUpperCase()).join(" ");
    return ["Mega", base, suffix].filter(Boolean).join(" ");
  }

  return rawName;
}

export function normalizePokemonName(name: string): string {
  let normalized = cleanPokemonNameInput(name);
  normalized = canonicalizeMegaPokemonName(normalized) || normalized;

  const formMappings: Record<string, string> = {
    "Palafin-Hero": "Palafin",
    "Palafin-Zero": "Palafin",
    "Sinistcha-Masterpiece": "Sinistcha",
    "Sinistcha-Artisan": "Sinistcha",
    "Aegislash-Blade": "Aegislash",
    "Aegislash-Shield": "Aegislash",
    "Darmanitan-Zen": "Darmanitan",
    "Darmanitan-Galar-Zen": "Darmanitan-Galar",
    "Darmanitan-Standard": "Darmanitan",
    "Darmanitan-Galar-Standard": "Darmanitan-Galar",
    "Wishiwashi-School": "Wishiwashi",
    "Wishiwashi-Solo": "Wishiwashi",
    "Morpeko-Hangry": "Morpeko",
    "Morpeko-Full-Belly": "Morpeko",
    "Eiscue-Noice": "Eiscue",
    "Eiscue-Ice": "Eiscue",
    "Mimikyu-Busted": "Mimikyu",
    "Mimikyu-Disguised": "Mimikyu",
    "Cramorant-Gulping": "Cramorant",
    "Cramorant-Gorging": "Cramorant",
    "Minior-Meteor": "Minior",
    "Zygarde-Complete": "Zygarde",
    "Terapagos-Terastal": "Terapagos",
    "Terapagos-Stellar": "Terapagos",
    "Castform-Sunny": "Castform",
    "Castform-Rainy": "Castform",
    "Castform-Snowy": "Castform",
    "Cherrim-Sunshine": "Cherrim",
    "Cherrim-Overcast": "Cherrim",
    "Indeedee-F": "Indeedee",
    "Indeedee-M": "Indeedee",
    "Meowstic-F": "Meowstic",
    "Meowstic-M": "Meowstic",
    "Oinkologne-F": "Oinkologne",
    "Oinkologne-M": "Oinkologne",
  };

  if (formMappings[normalized]) normalized = formMappings[normalized];

  if (normalized.startsWith("Alcremie-") && normalized !== "Alcremie-Gmax") normalized = "Alcremie";
  if (normalized.startsWith("Florges-")) normalized = "Florges";
  if (normalized.startsWith("Dudunsparce-")) normalized = "Dudunsparce";
  if (normalized.startsWith("Keldeo-")) normalized = "Keldeo";
  if (normalized.startsWith("Greninja-")) normalized = "Greninja";
  if (normalized === "Shaymin-Land") normalized = "Shaymin";
  if (normalized.startsWith("Urshifu-")) normalized = "Urshifu";
  if (normalized === "Enamorus-Incarnate") normalized = "Enamorus";
  if (normalized === "Landorus-Incarnate") normalized = "Landorus";
  if (normalized === "Tornadus-Incarnate") normalized = "Tornadus";
  if (normalized === "Thundurus-Incarnate") normalized = "Thundurus";
  if (normalized.startsWith("Squawkabilly-")) normalized = "Squawkabilly";
  if (normalized.startsWith("Zarude-")) normalized = "Zarude";
  if (normalized.startsWith("Minior-")) normalized = "Minior";
  if (normalized.startsWith("Tatsugiri-")) normalized = "Tatsugiri";
  if (normalized.startsWith("Basculegion-")) normalized = "Basculegion";
  if (normalized.startsWith("Maushold-")) normalized = "Maushold";
  if (normalized.startsWith("Sinistea-")) normalized = "Sinistea";
  if (normalized.startsWith("Polteageist-")) normalized = "Polteageist";
  if (normalized.startsWith("Poltchageist-")) normalized = "Poltchageist";
  if (normalized.startsWith("Gastrodon-")) normalized = "Gastrodon";
  if (normalized.startsWith("Shellos-")) normalized = "Shellos";
  if (normalized.startsWith("Vivillon-")) normalized = "Vivillon";
  if (normalized.startsWith("Furfrou-")) normalized = "Furfrou";
  if (normalized.startsWith("Floette-") && normalized !== "Floette-Eternal") normalized = "Floette";
  if (normalized.startsWith("Flabebe-")) normalized = "Flabebe";
  if (normalized.startsWith("Xerneas-")) normalized = "Xerneas";
  if (normalized.startsWith("Pikachu-") && normalized !== "Pikachu-Gmax" && normalized !== "Pikachu-Starter") normalized = "Pikachu";
  if (normalized.startsWith("Unown-")) normalized = "Unown";
  if (normalized.startsWith("Deerling-")) normalized = "Deerling";
  if (normalized.startsWith("Sawsbuck-")) normalized = "Sawsbuck";
  if (normalized.startsWith("Burmy-")) normalized = "Burmy";

  return normalized;
}

const EXTERNAL_NAME_ALIASES: Record<string, string[]> = {
  ogerpont: ["Ogerpon-Teal", "Ogerpon"],
  ogerponteal: ["Ogerpon-Teal", "Ogerpon"],
  ogerponw: ["Ogerpon-Wellspring"],
  ogerponwellspring: ["Ogerpon-Wellspring"],
  ogerponh: ["Ogerpon-Hearthflame"],
  ogerponhearthflame: ["Ogerpon-Hearthflame"],
  ogerponc: ["Ogerpon-Cornerstone"],
  ogerponcornerstone: ["Ogerpon-Cornerstone"],
  ursalunabm: ["Ursaluna-Bloodmoon"],
  ursalunabloodmoon: ["Ursaluna-Bloodmoon"],
  ursalunabloodmoonform: ["Ursaluna-Bloodmoon"],
  galarianarticuno: ["Articuno-Galar"],
  galarianzapdos: ["Zapdos-Galar"],
  galarianmoltres: ["Moltres-Galar"],
  galarianslowking: ["Slowking-Galar"],
  galarianslowbro: ["Slowbro-Galar"],
  alolanexeggutor: ["Exeggutor-Alola"],
  alolanninetales: ["Ninetales-Alola"],
  alolanmuk: ["Muk-Alola"],
  alolanraichu: ["Raichu-Alola"],
  alolansandslash: ["Sandslash-Alola"],
  alolanmarowak: ["Marowak-Alola"],
  hisuiansamurott: ["Samurott-Hisui"],
  hisuianarcanine: ["Arcanine-Hisui"],
  hisuiantyphlosion: ["Typhlosion-Hisui"],
  hisuianlilligant: ["Lilligant-Hisui"],
  hisuianzoroark: ["Zoroark-Hisui"],
  hisuianbraviary: ["Braviary-Hisui"],
  hisuiangoodra: ["Goodra-Hisui"],
  hisuiandecidueye: ["Decidueye-Hisui"],
  paldeanwooper: ["Wooper-Paldea"],
  paldeantauros: ["Tauros-Paldea-Combat"],
  paldeantaurosfire: ["Tauros-Paldea-Blaze"],
  paldeantauroswater: ["Tauros-Paldea-Aqua"],
};

const CANONICAL_FORM_ALIAS_GROUPS: Record<string, string[]> = {
  aegislash: ["Aegislash-Blade", "Aegislash-Shield"],
  alcremie: [
    "Alcremie-Vanilla-Cream",
    "Alcremie-Ruby-Cream",
    "Alcremie-Matcha-Cream",
    "Alcremie-Mint-Cream",
    "Alcremie-Lemon-Cream",
    "Alcremie-Salted-Cream",
    "Alcremie-Ruby-Swirl",
    "Alcremie-Caramel-Swirl",
    "Alcremie-Rainbow-Swirl",
  ],
  basculegion: ["Basculegion-F", "Basculegion-M", "Basculegion-Female", "Basculegion-Male"],
  burmy: ["Burmy-Plant", "Burmy-Sandy", "Burmy-Trash"],
  castform: ["Castform-Sunny", "Castform-Rainy", "Castform-Snowy"],
  cherrim: ["Cherrim-Sunshine", "Cherrim-Overcast"],
  cramorant: ["Cramorant-Gulping", "Cramorant-Gorging"],
  darmanitan: ["Darmanitan-Zen", "Darmanitan-Standard"],
  darmanitangalar: ["Darmanitan-Galar-Zen", "Darmanitan-Galar-Standard"],
  deerling: ["Deerling-Spring", "Deerling-Summer", "Deerling-Autumn", "Deerling-Winter"],
  dudunsparce: ["Dudunsparce-Two-Segment", "Dudunsparce-Three-Segment"],
  eiscue: ["Eiscue-Noice", "Eiscue-Ice"],
  enamorus: ["Enamorus-Incarnate", "Enamorus-Therian"],
  flabebe: ["Flabebe-Red", "Flabebe-Blue", "Flabebe-Orange", "Flabebe-White", "Flabebe-Yellow"],
  floette: ["Floette-Red", "Floette-Blue", "Floette-Orange", "Floette-White", "Floette-Yellow"],
  florges: ["Florges-Red", "Florges-Blue", "Florges-Orange", "Florges-White", "Florges-Yellow"],
  furfrou: [
    "Furfrou-Natural",
    "Furfrou-Heart",
    "Furfrou-Star",
    "Furfrou-Diamond",
    "Furfrou-Debutante",
    "Furfrou-Matron",
    "Furfrou-Dandy",
    "Furfrou-La-Reine",
    "Furfrou-Kabuki",
    "Furfrou-Pharaoh",
  ],
  gastrodon: ["Gastrodon-East", "Gastrodon-West"],
  greninja: ["Greninja-Ash", "Greninja-Battle-Bond"],
  indeedee: ["Indeedee-F", "Indeedee-M", "Indeedee-Female", "Indeedee-Male"],
  keldeo: ["Keldeo-Ordinary", "Keldeo-Resolute"],
  landorus: ["Landorus-Incarnate", "Landorus-Therian"],
  maushold: ["Maushold-Family-of-Three", "Maushold-Family-of-Four"],
  meowstic: ["Meowstic-F", "Meowstic-M", "Meowstic-Female", "Meowstic-Male"],
  mimikyu: ["Mimikyu-Busted", "Mimikyu-Disguised"],
  minior: [
    "Minior-Meteor",
    "Minior-Core",
    "Minior-Red",
    "Minior-Orange",
    "Minior-Yellow",
    "Minior-Green",
    "Minior-Blue",
    "Minior-Indigo",
    "Minior-Violet",
  ],
  morpeko: ["Morpeko-Hangry", "Morpeko-Full-Belly"],
  oinkologne: ["Oinkologne-F", "Oinkologne-M", "Oinkologne-Female", "Oinkologne-Male"],
  palafin: ["Palafin-Hero", "Palafin-Zero"],
  pikachu: [
    "Pikachu-Original",
    "Pikachu-Hoenn",
    "Pikachu-Sinnoh",
    "Pikachu-Unova",
    "Pikachu-Kalos",
    "Pikachu-Alola",
    "Pikachu-Partner",
    "Pikachu-World",
    "Pikachu-Cosplay",
    "Pikachu-Rock-Star",
    "Pikachu-Belle",
    "Pikachu-Pop-Star",
    "Pikachu-PhD",
    "Pikachu-Libre",
  ],
  sawsbuck: ["Sawsbuck-Spring", "Sawsbuck-Summer", "Sawsbuck-Autumn", "Sawsbuck-Winter"],
  shaymin: ["Shaymin-Land", "Shaymin-Sky"],
  shellos: ["Shellos-East", "Shellos-West"],
  sinistcha: ["Sinistcha-Masterpiece", "Sinistcha-Artisan"],
  sinistea: ["Sinistea-Phony", "Sinistea-Antique"],
  squawkabilly: ["Squawkabilly-Green", "Squawkabilly-Blue", "Squawkabilly-Yellow", "Squawkabilly-White"],
  tatsugiri: ["Tatsugiri-Curly", "Tatsugiri-Droopy", "Tatsugiri-Stretchy"],
  terapagos: ["Terapagos-Normal", "Terapagos-Terastal", "Terapagos-Stellar"],
  thundurus: ["Thundurus-Incarnate", "Thundurus-Therian"],
  tornadus: ["Tornadus-Incarnate", "Tornadus-Therian"],
  unown: "ABCDEFGHIJKLMNOPQRSTUVWXYZ!?".split("").map((form) => `Unown-${form}`),
  urshifu: ["Urshifu-Single-Strike", "Urshifu-Rapid-Strike"],
  vivillon: [
    "Vivillon-Archipelago",
    "Vivillon-Continental",
    "Vivillon-Elegant",
    "Vivillon-Fancy",
    "Vivillon-Garden",
    "Vivillon-High-Plains",
    "Vivillon-Icy-Snow",
    "Vivillon-Jungle",
    "Vivillon-Marine",
    "Vivillon-Meadow",
    "Vivillon-Modern",
    "Vivillon-Monsoon",
    "Vivillon-Ocean",
    "Vivillon-Poke-Ball",
    "Vivillon-Polar",
    "Vivillon-River",
    "Vivillon-Sandstorm",
    "Vivillon-Savanna",
    "Vivillon-Sun",
    "Vivillon-Tundra",
  ],
  wishiwashi: ["Wishiwashi-School", "Wishiwashi-Solo"],
  xerneas: ["Xerneas-Active", "Xerneas-Neutral"],
  zarude: ["Zarude-Dada"],
  zygarde: ["Zygarde-10%", "Zygarde-50%", "Zygarde-Complete"],
};

const CANONICAL_FORM_ALIASES: Record<string, string[]> = Object.fromEntries(
  Object.entries(CANONICAL_FORM_ALIAS_GROUPS).map(([key, values]) => [
    key,
    values.flatMap((value) => [value, value.replace(/-/g, " ")]),
  ])
);

export function pokemonExactLookupKeys(
  name: string | null | undefined,
  options: PokemonNameOptions = {}
): Set<string> {
  const keys = new Set<string>();
  if (!name) return keys;

  const cleaned = cleanPokemonNameInput(name);
  const rawKey = pokemonNameKey(cleaned);
  if (rawKey) keys.add(rawKey);

  for (const alias of EXTERNAL_NAME_ALIASES[rawKey] || []) {
    keys.add(pokemonNameKey(alias));
  }

  for (const alias of CANONICAL_FORM_ALIASES[rawKey] || []) {
    keys.add(pokemonNameKey(alias));
  }

  for (const alias of megaPokemonNameAliases(cleaned)) {
    keys.add(pokemonNameKey(alias));
  }

  const cleanedParts = cleaned.toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-").split("-").filter(Boolean);
  const megaIndex = cleanedParts.indexOf("mega");
  if (options.friendlyMegaNames && megaIndex >= 0) {
    const baseParts = cleanedParts.filter((part) => part !== "mega");
    const megaAliases = [
      ["mega", ...baseParts].join("-"),
      [...baseParts, "mega"].join("-"),
      ["mega", ...baseParts].join(" "),
      [...baseParts, "mega"].join(" "),
      formatPokemonDisplayName(cleaned, null, options),
    ];

    for (const alias of megaAliases) {
      keys.add(pokemonNameKey(alias));
    }
  }

  return keys;
}

export function pokemonNormalizedLookupKeys(
  name: string | null | undefined,
  options: PokemonNameOptions = {}
): Set<string> {
  const keys = pokemonExactLookupKeys(name, options);
  if (!name) return keys;

  const normalizedKey = pokemonNameKey(normalizePokemonName(name));
  if (normalizedKey) keys.add(normalizedKey);

  return keys;
}

export function pokemonSearchAliases(
  name: string | null | undefined,
  displayName?: string | null,
  options: PokemonNameOptions = {}
): string[] {
  const aliases = new Set<string>();
  const rawName = (name || "").trim();
  const rawDisplayName = (displayName || "").trim();
  const friendlyName = formatPokemonDisplayName(rawName, rawDisplayName, options);

  const exactAliasSource = rawDisplayName || rawName;
  const exactAliasSourceKey = pokemonNameKey(cleanPokemonNameInput(exactAliasSource));

  for (const value of [
    rawName,
    rawDisplayName,
    friendlyName,
    ...(CANONICAL_FORM_ALIASES[exactAliasSourceKey] || []),
  ]) {
    if (!value) continue;
    const lower = value.toLowerCase();
    aliases.add(lower);
    aliases.add(lower.replace(/[-_]/g, " "));
  }

  for (const key of pokemonExactLookupKeys(rawDisplayName || rawName, options)) {
    aliases.add(key);
  }

  return Array.from(aliases);
}
