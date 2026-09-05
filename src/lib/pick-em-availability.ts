import { isCompletedMatchResult } from "./match-result-utils";

type PickMatch = { week: number; winnerId: number | null; isForfeit: boolean | null };

/** Keep homepage reminders and the pick-em week selector on the same rules. */
export function getUnlockedPickWeeks(matches: PickMatch[]): Set<number> {
  const weeks = [...new Set(matches.map((match) => match.week))].sort((a, b) => a - b);
  const completedWeeks = new Set(matches.filter((match) =>
    isCompletedMatchResult(match.winnerId, match.isForfeit)
  ).map((match) => match.week));
  const lastRegularWeek = weeks.filter((week) => week <= 100).pop();
  return new Set(weeks.filter((week) => week === 1 || (week >= 101
    ? lastRegularWeek !== undefined && completedWeeks.has(lastRegularWeek)
    : completedWeeks.has(week - 1))));
}

export function isMatchOpenForPicks(
  match: PickMatch & { scheduledAt: string | null },
  unlockedWeeks: Set<number>,
  now: number,
): boolean {
  return unlockedWeeks.has(match.week) && !isCompletedMatchResult(match.winnerId, match.isForfeit)
    && (!match.scheduledAt || new Date(match.scheduledAt).getTime() > now);
}
