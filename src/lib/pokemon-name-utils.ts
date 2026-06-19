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

export function normalizePokemonName(name: string): string {
  let normalized = cleanPokemonNameInput(name);

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

export function pokemonExactLookupKeys(name: string | null | undefined): Set<string> {
  const keys = new Set<string>();
  if (!name) return keys;

  const cleaned = cleanPokemonNameInput(name);
  const rawKey = pokemonNameKey(cleaned);
  if (rawKey) keys.add(rawKey);

  for (const alias of EXTERNAL_NAME_ALIASES[rawKey] || []) {
    keys.add(pokemonNameKey(alias));
  }

  return keys;
}

export function pokemonNormalizedLookupKeys(name: string | null | undefined): Set<string> {
  const keys = pokemonExactLookupKeys(name);
  if (!name) return keys;

  const normalizedKey = pokemonNameKey(normalizePokemonName(name));
  if (normalizedKey) keys.add(normalizedKey);

  return keys;
}
