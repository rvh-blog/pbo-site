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
  ];
}

function canonicalizeUrshifuName(name: string): string | null {
  const key = pokemonNameKey(name);
  if (key === "urshifu" || key === "urshifugmax") return "Urshifu";

  const rapidStrikeKeys = new Set([
    "urshifurapid",
    "urshifurapidstrike",
    "urshifurapidstrikestyle",
    "urshifurapidstrikegmax",
    "rapidurshifu",
    "rapidstrikeurshifu",
    "rapidstrikestyleurshifu",
  ]);
  if (rapidStrikeKeys.has(key)) {
    return key.endsWith("gmax") ? "Urshifu-Rapid-Strike-Gmax" : "Urshifu-Rapid-Strike";
  }

  const singleStrikeKeys = new Set([
    "urshifusingle",
    "urshifusinglestrike",
    "urshifusinglestrikestyle",
    "urshifusinglestrikegmax",
    "singleurshifu",
    "singlestrikeurshifu",
    "singlestrikestyleurshifu",
  ]);
  if (singleStrikeKeys.has(key)) {
    return key.endsWith("gmax") ? "Urshifu-Single-Strike-Gmax" : "Urshifu-Single-Strike";
  }

  return null;
}

const NORMALIZED_NAME_ALIASES: Record<string, string> = {
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
  redstripedbasculin: "Basculin-Red-Striped",
  redstripebasculin: "Basculin-Red-Striped",
  basculinbluestripe: "Basculin-Blue-Striped",
  bluestripedbasculin: "Basculin-Blue-Striped",
  bluestripebasculin: "Basculin-Blue-Striped",
  basculinwhitestripe: "Basculin-White-Striped",
  whitestripedbasculin: "Basculin-White-Striped",
  whitestripebasculin: "Basculin-White-Striped",
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

  if (formMappings[normalized]) normalized = formMappings[normalized];

  if (normalized.startsWith("Alcremie-") && normalized !== "Alcremie-Gmax") normalized = "Alcremie";
  if (normalized.startsWith("Florges-")) normalized = "Florges";
  if (normalized.startsWith("Dudunsparce-")) normalized = "Dudunsparce";
  if (normalized.startsWith("Keldeo-")) normalized = "Keldeo";
  if (normalized.startsWith("Greninja-")) normalized = "Greninja";
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

export function pokemonExactLookupKeys(
  name: string | null | undefined,
  options: PokemonNameOptions = {}
): Set<string> {
  const keys = new Set<string>();
  if (!name) return keys;

  const cleaned = cleanPokemonNameInput(name);
  const rawKey = pokemonNameKey(cleaned);
  if (rawKey) keys.add(rawKey);

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

  const normalizedKey = pokemonNameKey(normalizePokemonName(cleaned));
  if (normalizedKey) keys.add(normalizedKey);

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

  for (const key of pokemonExactLookupKeys(rawDisplayName || rawName, options)) {
    aliases.add(key);
  }

  return Array.from(aliases);
}
