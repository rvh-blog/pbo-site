import { isTransferredItemReveal, isKnockedOffBerryReveal } from "@/lib/revealed-items";
import { getMegaStoneName, isMegaPokemonName } from "@/lib/mega-stones";
import { getOgerponMaskName } from "@/lib/ogerpon-masks";

export type MegaItemReveal = {
  item: string;
  turn: number;
  source: string;
};

export type MegaRosterPokemon = {
  pokemonId: number;
  name: string;
  displayName?: string | null;
};

export type MegaItemInference = {
  expectedStone: string | null;
  revealedItems: MegaItemReveal[];
  assumed: boolean;
  conflict: string | null;
};

export type MegaItemDataRow = {
  seasonCoachId: number;
  pokemonId: number;
  revealedItems?: MegaItemReveal[] | null;
};

export type RequiredItemInference = {
  expectedItem: string | null;
  itemKind: "Mega Stone" | "Ogerpon Mask" | null;
  revealedItems: MegaItemReveal[];
  assumed: boolean;
  conflict: string | null;
};

/**
 * Sources beginning with "assumed" are derived evidence, not a replay item
 * reveal. They must not be treated as proof that a held item was observed.
 */
export function isAssumedItemReveal(source: string | null | undefined) {
  return /^assumed\b/i.test((source ?? "").trim());
}

function isCountableExplicitReveal(reveal: MegaItemReveal) {
  return Boolean(reveal.item?.trim()) &&
    !isAssumedItemReveal(reveal.source) &&
    !isTransferredItemReveal(reveal.source) &&
    !isKnockedOffBerryReveal(reveal);
}

/**
 * Infer a required held item for a row that was mapped to a historical roster
 * entry. Explicit replay evidence always wins; a contradictory item is
 * preserved and returned as a review conflict rather than overwritten.
 */
export function inferRequiredItemForRosterPokemon(
  rosterPokemon: MegaRosterPokemon | null | undefined,
  storedReveals: MegaItemReveal[] | null | undefined,
): RequiredItemInference {
  const species = rosterPokemon?.displayName || rosterPokemon?.name || "";
  const revealedItems = [...(storedReveals ?? [])];
  // A parser may have observed the actual Mega evolution while the roster
  // row was saved under its base species. Preserve that stronger replay
  // evidence so conflicts are still caught even without a Mega-form roster ID.
  const parserAssumedStone = revealedItems.find(
    (reveal) => isAssumedItemReveal(reveal.source) && /mega/i.test(reveal.source),
  )?.item ?? null;
  const expectedMask = getOgerponMaskName(species);
  const expectedItem = expectedMask || (isMegaPokemonName(species) ? getMegaStoneName(species) : parserAssumedStone);
  const itemKind = expectedMask ? "Ogerpon Mask" : expectedItem ? "Mega Stone" : null;
  if (!expectedItem) {
    return { expectedItem: null, itemKind: null, revealedItems, assumed: false, conflict: null };
  }

  const expectedKey = expectedItem.toLowerCase();
  const explicitReveals = revealedItems.filter(isCountableExplicitReveal);
  const assumedConflicts = revealedItems
    .filter((reveal) => isAssumedItemReveal(reveal.source))
    .filter((reveal) => reveal.item.trim().toLowerCase() !== expectedKey);
  const conflictingItems = [...new Set(
    [...explicitReveals, ...assumedConflicts]
      .map((reveal) => reveal.item.trim())
      .filter((item) => item.toLowerCase() !== expectedKey),
  )];

  const hasExpectedItem = revealedItems.some(
    (reveal) => reveal.item.trim().toLowerCase() === expectedKey,
  );
  let assumed = false;
  if (!hasExpectedItem && conflictingItems.length === 0) {
    revealedItems.push({
      item: expectedItem,
      turn: 0,
      source: itemKind === "Ogerpon Mask" ? "assumed from Ogerpon form" : "assumed from team roster",
    });
    assumed = true;
  }

  return {
    expectedItem,
    itemKind,
    revealedItems,
    assumed,
    conflict: conflictingItems.length > 0
      ? `${species} should hold ${expectedItem}, but the replay recorded ${conflictingItems.join(", ")}.`
      : null,
  };
}

/** Preserve the legacy Mega-only API for maintenance callers. */
export function inferMegaItemForRosterPokemon(
  rosterPokemon: MegaRosterPokemon | null | undefined,
  storedReveals: MegaItemReveal[] | null | undefined,
): MegaItemInference {
  if (getOgerponMaskName(rosterPokemon?.displayName || rosterPokemon?.name || "")) {
    return { expectedStone: null, revealedItems: [...(storedReveals ?? [])], assumed: false, conflict: null };
  }

  const inference = inferRequiredItemForRosterPokemon(rosterPokemon, storedReveals);
  return {
    expectedStone: inference.itemKind === "Mega Stone" ? inference.expectedItem : null,
    revealedItems: inference.revealedItems,
    assumed: inference.itemKind === "Mega Stone" && inference.assumed,
    conflict: inference.itemKind === "Mega Stone" ? inference.conflict : null,
  };
}

/** Apply Mega-stone and Ogerpon-mask inference to every saved replay row. */
export function applyMegaItemInferenceToPokemonData<T extends MegaItemDataRow>(
  rows: T[],
  rostersByTeam: Map<number, Map<number, MegaRosterPokemon>>,
) {
  const reviewNotes: string[] = [];
  const pokemonData = rows.map((row) => {
    const rosterPokemon = rostersByTeam.get(row.seasonCoachId)?.get(row.pokemonId);
    const inference = inferRequiredItemForRosterPokemon(rosterPokemon, row.revealedItems);
    if (inference.conflict) {
      reviewNotes.push(`${inference.itemKind || "Required item"} check (team ${row.seasonCoachId}, Pokémon ${row.pokemonId}): ${inference.conflict}`);
    }
    return { ...row, revealedItems: inference.revealedItems } as T;
  });
  return { pokemonData, reviewNotes: [...new Set(reviewNotes)] };
}
