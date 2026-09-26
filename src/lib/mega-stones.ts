import { normalizePokemonName } from "@/lib/pokemon-name-utils";

const MEGA_STONE_NAMES: Record<string, string> = {
  abomasnow: "Abomasite",
  absol: "Absolite",
  aggron: "Aggronite",
  aerodactyl: "Aerodactylite",
  alakazam: "Alakazite",
  altaria: "Altarianite",
  ampharos: "Ampharosite",
  audino: "Audinite",
  banette: "Banettite",
  barbaracle: "Barbaracite",
  baxcalibur: "Baxcalibrite",
  beedrill: "Beedrillite",
  blaziken: "Blazikenite",
  blastoise: "Blastoisinite",
  camerupt: "Cameruptite",
  charizard: "Charizardite",
  chandelure: "Chandelurite",
  chesnaught: "Chesnaughtite",
  chimecho: "Chimechite",
  clefable: "Clefablite",
  crabominable: "Crabominite",
  darkrai: "Darkranite",
  delphox: "Delphoxite",
  diancie: "Diancite",
  dragalge: "Dragalgite",
  dragonite: "Dragoninite",
  drampa: "Drampanite",
  eelektross: "Eelektrossite",
  emboar: "Emboarite",
  excadrill: "Excadrite",
  falinks: "Falinksite",
  feraligatr: "Feraligite",
  floette: "Floettite",
  froslass: "Froslassite",
  gallade: "Galladite",
  garchomp: "Garchompite",
  gardevoir: "Gardevoirite",
  gengar: "Gengarite",
  glalie: "Glalitite",
  glimmora: "Glimmoranite",
  golisopod: "Golisopite",
  golurk: "Golurkite",
  greninja: "Greninjite",
  gyarados: "Gyaradosite",
  hawlucha: "Hawluchanite",
  heatran: "Heatranite",
  heracross: "Heracronite",
  houndoom: "Houndoominite",
  kangaskhan: "Kangaskhanite",
  latias: "Latiasite",
  latios: "Latiosite",
  lopunny: "Lopunnite",
  lucario: "Lucarionite",
  magearna: "Magearnite",
  magearnaoriginal: "Magearnite",
  malamar: "Malamarite",
  manectric: "Manectite",
  mawile: "Mawilite",
  medicham: "Medichamite",
  meganium: "Meganiumite",
  meowstic: "Meowsticite",
  metagross: "Metagrossite",
  mewtwo: "Mewtwonite",
  pidgeot: "Pidgeotite",
  pinsir: "Pinsirite",
  pyroar: "Pyroarite",
  salamence: "Salamencite",
  sableye: "Sablenite",
  scizor: "Scizorite",
  sceptile: "Sceptilite",
  scolipede: "Scolipite",
  scovillain: "Scovillainite",
  scrafty: "Scraftinite",
  sharpedo: "Sharpedonite",
  skarmory: "Skarmorite",
  slowbro: "Slowbronite",
  staraptor: "Staraptite",
  starmie: "Starminite",
  steelix: "Steelixite",
  swampert: "Swampertite",
  tyranitar: "Tyranitarite",
  tatsugiricurly: "Tatsugirinite",
  tatsugiridroopy: "Tatsugirinite",
  tatsugiristretchy: "Tatsugirinite",
  venusaur: "Venusaurite",
  raichu: "Raichunite",
  victreebel: "Victreebelite",
  zeraora: "Zeraorite",
  zygarde: "Zygardite",
};
const STONELESS_MEGA_BASES = new Set(["rayquaza"]);

/** True when a stored or replay species name is a Mega forme. */
export function isMegaPokemonName(species: string): boolean {
  return normalizePokemonName(species)
    .split("-")
    .some((part) => part.toLowerCase() === "mega");
}

export function getMegaBaseSpecies(species: string): string | null {
  const parts = normalizePokemonName(species).split("-").filter(Boolean);
  const megaIndex = parts.findIndex((part) => part.toLowerCase() === "mega");
  if (megaIndex < 0) return null;

  const suffix = parts.slice(megaIndex + 1);
  const variantCount = suffix.length === 1 && /^[a-z]$/i.test(suffix[0]) ? 1 : 0;
  const baseParts = megaIndex === 0
    ? parts.slice(1, parts.length - variantCount)
    : parts.slice(0, megaIndex);

  return baseParts.length > 0 ? baseParts.join("-") : null;
}

export function getMegaStoneName(species: string): string | null {
  const normalizedSpecies = normalizePokemonName(species);
  const baseSpecies = getMegaBaseSpecies(normalizedSpecies);
  if (!baseSpecies) return null;

  const baseId = baseSpecies.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (STONELESS_MEGA_BASES.has(baseId)) return null;
  const stoneName = MEGA_STONE_NAMES[baseId];
  if (!stoneName) return null;
  const parts = normalizedSpecies.split("-").filter(Boolean);
  const megaIndex = parts.findIndex((part) => part.toLowerCase() === "mega");
  const suffix = parts.slice(megaIndex + 1);
  const variant = suffix.length === 1 && /^[a-z]$/i.test(suffix[0]) ? suffix[0] : null;

  return `${stoneName}${variant ? ` ${variant.toUpperCase()}` : ""}`;
}
