export const EXPANDED_HAX_RULES_START_SEASON = 11;
export const EXPANDED_HAX_RULES_START_WEEK = 6;

export function usesExpandedHaxRules(
  seasonNumber: number | null | undefined,
  week: number | null | undefined,
) {
  if (seasonNumber == null || week == null) return false;
  return seasonNumber > EXPANDED_HAX_RULES_START_SEASON ||
    (seasonNumber === EXPANDED_HAX_RULES_START_SEASON && week >= EXPANDED_HAX_RULES_START_WEEK);
}
