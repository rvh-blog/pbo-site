import { getSeasonBattleRules } from "@/lib/season-battle-rules";

function cleanPokemonNameInput(name: string): string {
  let cleaned = name.split(",")[0].trim();
  cleaned = cleaned.replace(/^\*/, "").replace(/-\*$/, "");
  cleaned = cleaned.replace(/-Tera$/, "");
  return cleaned;
}

export function pokemonNameKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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
    // Showdown team preview identifies a Mega by its base species, then emits
    // the Mega forme after evolution. Keep both events tied to one roster slot.
    baseHyphen,
    baseSpace,
  ];
}

const HARDCODED_NAME_ALIAS_INPUTS: { alias: string; canonical: string }[] = [
  { alias: "Urshifu", canonical: "Urshifu" },
  { alias: "Urshifu-Gmax", canonical: "Urshifu" },
  { alias: "Urshifu Rapid", canonical: "Urshifu-Rapid-Strike" },
  { alias: "Urshifu Rapid Strike", canonical: "Urshifu-Rapid-Strike" },
  { alias: "Urshifu Rapid Strike Style", canonical: "Urshifu-Rapid-Strike" },
  { alias: "Rapid Urshifu", canonical: "Urshifu-Rapid-Strike" },
  { alias: "Rapid Strike Urshifu", canonical: "Urshifu-Rapid-Strike" },
  { alias: "Rapid Strike Style Urshifu", canonical: "Urshifu-Rapid-Strike" },
  { alias: "Urshifu Rapid Strike Gmax", canonical: "Urshifu-Rapid-Strike-Gmax" },
  { alias: "Urshifu Single", canonical: "Urshifu-Single-Strike" },
  { alias: "Urshifu Single Strike", canonical: "Urshifu-Single-Strike" },
  { alias: "Urshifu Single Strike Style", canonical: "Urshifu-Single-Strike" },
  { alias: "Single Urshifu", canonical: "Urshifu-Single-Strike" },
  { alias: "Single Strike Urshifu", canonical: "Urshifu-Single-Strike" },
  { alias: "Single Strike Style Urshifu", canonical: "Urshifu-Single-Strike" },
  { alias: "Urshifu Single Strike Gmax", canonical: "Urshifu-Single-Strike-Gmax" },
];

function canonicalizeUrshifuName(name: string): string | null {
  const key = pokemonNameKey(name);
  const alias = HARDCODED_NAME_ALIAS_INPUTS.find((entry) => pokemonNameKey(entry.alias) === key);
  return alias?.canonical || null;
}

const NORMALIZED_NAME_ALIASES: Record<string, string> = {
  washrotom: "Rotom-Wash",
  rotomwash: "Rotom-Wash",
  heatrotom: "Rotom-Heat",
  rotomheat: "Rotom-Heat",
  frostrotom: "Rotom-Frost",
  rotomfrost: "Rotom-Frost",
  fanrotom: "Rotom-Fan",
  rotomfan: "Rotom-Fan",
  mowrotom: "Rotom-Mow",
  rotommow: "Rotom-Mow",
  ogerpont: "Ogerpon-Teal",
  ogerponteal: "Ogerpon-Teal",
  ogerponw: "Ogerpon-Wellspring",
  ogerponwellspring: "Ogerpon-Wellspring",
  ogerponh: "Ogerpon-Hearthflame",
  ogerponhearthflame: "Ogerpon-Hearthflame",
  ogerponc: "Ogerpon-Cornerstone",
  ogerponcornerstone: "Ogerpon-Cornerstone",
  ursalunabm: "Ursaluna-Bloodmoon",
  ursalunabloodmoon: "Ursaluna-Bloodmoon",
  ursalunabloodmoonform: "Ursaluna-Bloodmoon",
  galarianarticuno: "Articuno-Galar",
  galarianzapdos: "Zapdos-Galar",
  galarianmoltres: "Moltres-Galar",
  galarianslowking: "Slowking-Galar",
  galarianslowbro: "Slowbro-Galar",
  alolanexeggutor: "Exeggutor-Alola",
  alolanninetales: "Ninetales-Alola",
  alolanmuk: "Muk-Alola",
  alolanraichu: "Raichu-Alola",
  alolansandslash: "Sandslash-Alola",
  alolanmarowak: "Marowak-Alola",
  hisuiansamurott: "Samurott-Hisui",
  hisuianarcanine: "Arcanine-Hisui",
  hisuiantyphlosion: "Typhlosion-Hisui",
  hisuianlilligant: "Lilligant-Hisui",
  hisuianzoroark: "Zoroark-Hisui",
  hisuianbraviary: "Braviary-Hisui",
  hisuiangoodra: "Goodra-Hisui",
  hisuiandecidueye: "Decidueye-Hisui",
  paldeanwooper: "Wooper-Paldea",
  paldeantauros: "Tauros-Paldea-Combat",
  paldeantaurosfire: "Tauros-Paldea-Blaze",
  paldeantauroswater: "Tauros-Paldea-Aqua",
  basculinredstripe: "Basculin-Red-Striped",
  basculinredstriped: "Basculin-Red-Striped",
  redstripedbasculin: "Basculin-Red-Striped",
  redstripebasculin: "Basculin-Red-Striped",
  basculinbluestripe: "Basculin-Blue-Striped",
  basculinbluestriped: "Basculin-Blue-Striped",
  bluestripedbasculin: "Basculin-Blue-Striped",
  bluestripebasculin: "Basculin-Blue-Striped",
  basculinwhitestripe: "Basculin-White-Striped",
  basculinwhitestriped: "Basculin-White-Striped",
  whitestripedbasculin: "Basculin-White-Striped",
  whitestripebasculin: "Basculin-White-Striped",
  sirfetchd: "Sirfetchd",
  averagegourgeist: "Gourgeist-Average",
  gourgeistaverage: "Gourgeist-Average",
  largegourgeist: "Gourgeist-Large",
  gourgeistlarge: "Gourgeist-Large",
  smallgourgeist: "Gourgeist-Small",
  gourgeistsmall: "Gourgeist-Small",
  supergourgeist: "Gourgeist-Super",
  gourgeistsuper: "Gourgeist-Super",
  baileoricorio: "Oricorio-Baile",
  bailestyleoricorio: "Oricorio-Baile",
  oricoriobaile: "Oricorio-Baile",
  pauoricorio: "Oricorio-Pau",
  paustyleoricorio: "Oricorio-Pau",
  oricoriopau: "Oricorio-Pau",
  pompomoricorio: "Oricorio-Pom-Pom",
  pompomstyleoricorio: "Oricorio-Pom-Pom",
  oricoriopompom: "Oricorio-Pom-Pom",
  sensuoricorio: "Oricorio-Sensu",
  sensustyleoricorio: "Oricorio-Sensu",
  oricoriosensu: "Oricorio-Sensu",
  averagepumpkaboo: "Pumpkaboo-Average",
  pumpkabooaverage: "Pumpkaboo-Average",
  largepumpkaboo: "Pumpkaboo-Large",
  pumpkaboolarge: "Pumpkaboo-Large",
  smallpumpkaboo: "Pumpkaboo-Small",
  pumpkaboosmall: "Pumpkaboo-Small",
  superpumpkaboo: "Pumpkaboo-Super",
  pumpkaboosuper: "Pumpkaboo-Super",
};

function rotomFormAliases(name: string): string[] {
  const normalized = normalizePokemonName(name);
  const match = normalized.match(/^Rotom-(Wash|Heat|Frost|Fan|Mow)$/i);
  if (!match) return [];

  const form = titleCasePokemonPart(match[1]);
  return [
    `Rotom-${form}`,
    `Rotom ${form}`,
    `${form} Rotom`,
    `${form}-Rotom`,
  ];
}

export function shouldUseFriendlyMegaNamesForSeason(seasonNumber: number | null | undefined) {
  return getSeasonBattleRules(seasonNumber).friendlyMegaNames;
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
  normalized = canonicalizeUrshifuName(normalized) || normalized;
  normalized = NORMALIZED_NAME_ALIASES[pokemonNameKey(normalized)] || normalized;

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

  const hyphenatedFormName = formatPokemonNameParts(splitPokemonNameParts(normalized));
  const knownExactForms = new Set([
    ...Object.keys(formMappings),
    "Greninja-Battle-Bond",
    "Shaymin-Land",
    "Enamorus-Incarnate",
    "Landorus-Incarnate",
    "Tornadus-Incarnate",
    "Thundurus-Incarnate",
  ]);
  const knownFormPrefixes = [
    "Alcremie-",
    "Florges-",
    "Dudunsparce-",
    "Keldeo-",
    "Squawkabilly-",
    "Zarude-",
    "Minior-",
    "Tatsugiri-",
    "Basculegion-",
    "Maushold-",
    "Sinistea-",
    "Polteageist-",
    "Poltchageist-",
    "Gastrodon-",
    "Shellos-",
    "Vivillon-",
    "Furfrou-",
    "Floette-",
    "Flabebe-",
    "Xerneas-",
    "Pikachu-",
    "Unown-",
    "Deerling-",
    "Sawsbuck-",
    "Burmy-",
    "Wormadam-",
  ];
  if (
    hyphenatedFormName !== normalized &&
    (knownExactForms.has(hyphenatedFormName) ||
      knownFormPrefixes.some((prefix) => hyphenatedFormName.startsWith(prefix)))
  ) {
    normalized = hyphenatedFormName;
  }

  if (formMappings[normalized]) normalized = formMappings[normalized];

  if (normalized.startsWith("Alcremie-") && normalized !== "Alcremie-Gmax") normalized = "Alcremie";
  if (normalized.startsWith("Florges-")) normalized = "Florges";
  if (normalized.startsWith("Dudunsparce-")) normalized = "Dudunsparce";
  if (normalized.startsWith("Keldeo-")) normalized = "Keldeo";
  if (normalized === "Greninja-Battle-Bond") normalized = "Greninja";
  if (normalized === "Shaymin-Land") normalized = "Shaymin";
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
  if (normalized.startsWith("Wormadam-")) normalized = "Wormadam";

  return normalized;
}

export function getHardcodedPokemonNameAliases(name: string | null | undefined): string[] {
  const rawName = name || "";
  const canonical = normalizePokemonName(rawName);
  if (!canonical) return [];

  const aliases = new Set<string>();

  for (const alias of megaPokemonNameAliases(rawName)) {
    if (normalizePokemonName(alias) === canonical) {
      aliases.add(alias);
    }
  }

  for (const entry of HARDCODED_NAME_ALIAS_INPUTS) {
    if (normalizePokemonName(entry.canonical) === canonical) {
      aliases.add(entry.alias);
    }
  }

  for (const [aliasKey, aliasCanonical] of Object.entries(NORMALIZED_NAME_ALIASES)) {
    if (normalizePokemonName(aliasCanonical) === canonical) {
      aliases.add(aliasKey);
    }
  }

  return Array.from(aliases);
}

export function pokemonExactLookupAliases(
  name: string | null | undefined,
  options: PokemonNameOptions = {}
): string[] {
  const aliases = new Set<string>();
  if (!name) return [];

  const cleaned = cleanPokemonNameInput(name);
  if (cleaned) aliases.add(cleaned);

  for (const alias of megaPokemonNameAliases(cleaned)) {
    if (alias) aliases.add(alias);
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
      if (alias) aliases.add(alias);
    }
  }

  const normalized = normalizePokemonName(cleaned);
  if (normalized) aliases.add(normalized);

  return Array.from(aliases);
}

export function pokemonExactLookupKeys(
  name: string | null | undefined,
  options: PokemonNameOptions = {}
): Set<string> {
  const keys = new Set<string>();
  for (const alias of pokemonExactLookupAliases(name, options)) {
    const key = pokemonNameKey(alias);
    if (key) keys.add(key);
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

  for (const value of [
    rawName,
    rawDisplayName,
    friendlyName,
    normalizePokemonName(rawDisplayName || rawName),
  ]) {
    if (!value) continue;
    const lower = value.toLowerCase();
    aliases.add(lower);
    aliases.add(lower.replace(/[-_]/g, " "));
  }

  for (const alias of rotomFormAliases(rawDisplayName || rawName)) {
    aliases.add(alias.toLowerCase());
  }

  for (const key of pokemonExactLookupKeys(rawDisplayName || rawName, options)) {
    aliases.add(key);
  }

  return Array.from(aliases);
}

// These Showdown-only Mimikyu totem variants are not supported as separate
// league Pokemon. Keep the regular Busted/Disguised forms available while
// hiding only the duplicate totem entries from public selectors and search.
const HIDDEN_PUBLIC_POKEMON_FORMS = new Set([
  "mimikyu-totem-busted",
  "mimikyu-totem-disguised",
]);

export function isHiddenPublicPokemonForm(name: string | null | undefined, displayName?: string | null) {
  return [name, displayName]
    .filter((value): value is string => Boolean(value))
    .some((value) => HIDDEN_PUBLIC_POKEMON_FORMS.has(value.trim().toLowerCase()));
}
