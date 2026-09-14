import { pokemonNameKey } from "@/lib/pokemon-name-utils";

const OGERPON_MASK_BY_KEY: Record<string, string> = {
  ogerponw: "Wellspring Mask",
  ogerponwellspring: "Wellspring Mask",
  ogerponwellspringmask: "Wellspring Mask",
  ogerponh: "Hearthflame Mask",
  ogerponhearthflame: "Hearthflame Mask",
  ogerponhearthflamemask: "Hearthflame Mask",
  ogerponc: "Cornerstone Mask",
  ogerponcornerstone: "Cornerstone Mask",
  ogerponcornerstonemask: "Cornerstone Mask",
};

/** Return the mask required by a non-Teal Ogerpon form. */
export function getOgerponMaskName(species: string | null | undefined): string | null {
  return OGERPON_MASK_BY_KEY[pokemonNameKey(species)] ?? null;
}

