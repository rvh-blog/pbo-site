export const EXPANDED_HAX_RULES_START_SEASON = 11;
export const EXPANDED_HAX_RULES_START_WEEK = 6;

// Season 11 Week 5: Los Angeles Annihilapes vs Charleston Chesnaughts.
// This replay was reviewed with the expanded formula before the league-wide cutoff.
export const EXPANDED_HAX_RULES_MATCH_OVERRIDES = new Set([3586]);

const GUARANTEED_CRIT_MOVES_EXCLUDED_FROM_HAX = new Set([
  "flower trick",
  "frost breath",
  "storm throw",
  "surging strikes",
  "wicked blow",
  "zippy zap",
]);

const GUARANTEED_FLINCH_MOVES_EXCLUDED_FROM_HAX = new Set([
  "fake out",
]);

export type FavorableHaxEvent = {
  type: string;
  turn: number;
  description: string;
};

const EXPANDED_HAX_EVENT_OVERRIDES: Record<number, Record<string, FavorableHaxEvent[]>> = {
  3586: {
    aegislash: [
      { type: "crit", turn: 31, description: "Musashi landed a critical hit with Iron Head on Goodra." },
      { type: "flinch", turn: 38, description: "Goodra flinched." },
      { type: "crit", turn: 40, description: "Musashi landed a critical hit with Iron Head on Goodra." },
      { type: "flinch", turn: 41, description: "Goodra flinched." },
      { type: "crit", turn: 47, description: "Musashi landed a critical hit with Iron Head on Goodra." },
    ],
    "rotom-wash": [
      { type: "miss", turn: 5, description: "Floette missed with Light of Ruin against Briggs." },
    ],
    "samurott-hisui": [
      { type: "miss", turn: 11, description: "Musashi missed with Poltergeist against Samurott." },
      { type: "crit", turn: 13, description: "Samurott landed a critical hit with Ceaseless Edge on Emerson." },
    ],
    "goodra-hisui": [
      { type: "crit", turn: 45, description: "Goodra landed a critical hit with Heavy Slam on Irwin." },
    ],
  },
};

export function usesExpandedHaxRules(
  seasonNumber: number | null | undefined,
  week: number | null | undefined,
  matchId?: number | null,
) {
  if (matchId != null && EXPANDED_HAX_RULES_MATCH_OVERRIDES.has(matchId)) return true;
  if (seasonNumber == null || week == null) return false;
  return seasonNumber > EXPANDED_HAX_RULES_START_SEASON ||
    (seasonNumber === EXPANDED_HAX_RULES_START_SEASON && week >= EXPANDED_HAX_RULES_START_WEEK);
}

export function isGuaranteedHaxOutcome(
  type: "crit" | "flinch",
  moveName: string | null | undefined,
) {
  const normalizedMoveName = moveName?.trim().toLowerCase() || "";
  return type === "crit"
    ? GUARANTEED_CRIT_MOVES_EXCLUDED_FROM_HAX.has(normalizedMoveName)
    : GUARANTEED_FLINCH_MOVES_EXCLUDED_FROM_HAX.has(normalizedMoveName);
}

export function getExpandedHaxEventOverride(
  matchId: number,
  pokemonName: string | null | undefined,
): FavorableHaxEvent[] {
  if (!pokemonName) return [];
  return EXPANDED_HAX_EVENT_OVERRIDES[matchId]?.[pokemonName.trim().toLowerCase()] ?? [];
}
