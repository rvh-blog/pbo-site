import { isTransferredItemReveal, isKnockedOffBerryReveal } from "@/lib/revealed-items";
import { getMegaStoneName, isMegaPokemonName } from "@/lib/mega-stones";

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
 * Infer the stone for a Mega row that was actually mapped to a historical
 * roster entry. Explicit replay evidence always wins; a contradictory item
 * is preserved and returned as a review conflict rather than overwritten.
 */
export function inferMegaItemForRosterPokemon(
  rosterPokemon: MegaRosterPokemon | null | undefined,
  storedReveals: MegaItemReveal[] | null | undefined,
): MegaItemInference {
  const species = rosterPokemon?.displayName || rosterPokemon?.name || "";
  const revealedItems = [...(storedReveals ?? [])];
  // A parser may have observed the actual Mega evolution while the roster
  // row was saved under its base species. Preserve that stronger replay
  // evidence so conflicts are still caught even without a Mega-form roster ID.
  const parserAssumedStone = revealedItems.find(
    (reveal) => isAssumedItemReveal(reveal.source) && /mega/i.test(reveal.source),
  )?.item ?? null;
  const expectedStone = isMegaPokemonName(species) ? getMegaStoneName(species) : parserAssumedStone;
  if (!expectedStone) {
    return { expectedStone: null, revealedItems, assumed: false, conflict: null };
  }

  const expectedKey = expectedStone.toLowerCase();
  const explicitReveals = revealedItems.filter(isCountableExplicitReveal);
  const assumedConflicts = revealedItems
    .filter((reveal) => isAssumedItemReveal(reveal.source))
    .filter((reveal) => reveal.item.trim().toLowerCase() !== expectedKey);
  const conflictingItems = [...new Set(
    [...explicitReveals, ...assumedConflicts]
      .map((reveal) => reveal.item.trim())
      .filter((item) => item.toLowerCase() !== expectedKey),
  )];

  const hasExpectedStone = revealedItems.some(
    (reveal) => reveal.item.trim().toLowerCase() === expectedKey,
  );
  let assumed = false;
  if (!hasExpectedStone && conflictingItems.length === 0) {
    revealedItems.push({
      item: expectedStone,
      turn: 0,
      source: "assumed from team roster",
    });
    assumed = true;
  }

  return {
    expectedStone,
    revealedItems,
    assumed,
    conflict: conflictingItems.length > 0
      ? `${species} is rostered as a Mega and should hold ${expectedStone}, but the replay recorded ${conflictingItems.join(", ")}.`
      : null,
  };
}

/** Apply the same inference to every saved replay row for a match. */
export function applyMegaItemInferenceToPokemonData<T extends MegaItemDataRow>(
  rows: T[],
  rostersByTeam: Map<number, Map<number, MegaRosterPokemon>>,
) {
  const reviewNotes: string[] = [];
  const pokemonData = rows.map((row) => {
    const rosterPokemon = rostersByTeam.get(row.seasonCoachId)?.get(row.pokemonId);
    const inference = inferMegaItemForRosterPokemon(rosterPokemon, row.revealedItems);
    if (inference.conflict) {
      reviewNotes.push(`Mega item check (team ${row.seasonCoachId}, Pokémon ${row.pokemonId}): ${inference.conflict}`);
    }
    return { ...row, revealedItems: inference.revealedItems } as T;
  });
  return { pokemonData, reviewNotes: [...new Set(reviewNotes)] };
}
