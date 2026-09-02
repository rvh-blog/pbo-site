import { normalizePokemonName } from "@/lib/pokemon-name-utils";

const MEGA_STONE_NAMES: Record<string, string> = {
  abomasnow: "Abomasite",
  aerodactyl: "Aerodactylite",
  alakazam: "Alakazite",
  altaria: "Altarianite",
  ampharos: "Ampharosite",
  audino: "Audinite",
  banette: "Banettite",
  beedrill: "Beedrillite",
  blastoise: "Blastoisinite",
  camerupt: "Cameruptite",
  charizard: "Charizardite",
  diancie: "Diancite",
  gallade: "Galladite",
  gardevoir: "Gardevoirite",
  gengar: "Gengarite",
  glalie: "Glalitite",
  gyarados: "Gyaradosite",
  heracross: "Heracronite",
  houndoom: "Houndoominite",
  kangaskhan: "Kangaskhanite",
  latias: "Latiasite",
  latios: "Latiosite",
  lopunny: "Lopunnite",
  lucario: "Lucarionite",
  manectric: "Manectite",
  mawile: "Mawilite",
  medicham: "Medichamite",
  metagross: "Metagrossite",
  mewtwo: "Mewtwonite",
  pidgeot: "Pidgeotite",
  pinsir: "Pinsirite",
  salamence: "Salamencite",
  sceptile: "Sceptilite",
  sharpedo: "Sharpedonite",
  slowbro: "Slowbronite",
  steelix: "Steelixite",
  swampert: "Swampertite",
  tyranitar: "Tyranitarite",
  venusaur: "Venusaurite",
};

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
  const stoneName = MEGA_STONE_NAMES[baseId] || `${baseSpecies}ite`;
  const parts = normalizedSpecies.split("-").filter(Boolean);
  const megaIndex = parts.findIndex((part) => part.toLowerCase() === "mega");
  const suffix = parts.slice(megaIndex + 1);
  const variant = suffix.length === 1 && /^[a-z]$/i.test(suffix[0]) ? suffix[0] : null;

  return `${stoneName}${variant ? `-${variant.toUpperCase()}` : ""}`;
}
