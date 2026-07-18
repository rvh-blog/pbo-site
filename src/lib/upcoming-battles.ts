import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { matches } from "@/lib/schema";
import { compareDivisionNames } from "@/lib/division-order";

export type UpcomingBattleItem = {
  id: number;
  matchId: number;
  week: number;
  scheduledAt: string | null;
  isUnderway: boolean;
  team1Name?: string;
  team2Name?: string;
  team1Logo?: string | null;
  team2Logo?: string | null;
  team1Id: number;
  team2Id: number;
  divisionName?: string;
};

export async function getUpcomingBattles(
  seasonId: number,
  visibleDivisionIds?: Set<number>,
  maxItems: number | null = 5
): Promise<UpcomingBattleItem[]> {
  const allUnplayed = await db.query.matches.findMany({
    where: and(
      eq(matches.seasonId, seasonId),
      isNull(matches.winnerId)
    ),
    with: {
      coach1: true,
      coach2: true,
      division: true,
    },
  });

  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const visibleUnplayed = visibleDivisionIds
    ? allUnplayed.filter((match) => visibleDivisionIds.has(match.divisionId))
    : allUnplayed;

  const scheduled = visibleUnplayed.filter((match) => {
    if (!match.scheduledAt) return false;
    return new Date(match.scheduledAt).getTime() > now - oneHour;
  });

  if (scheduled.length > 0) {
    scheduled.sort((a, b) =>
      new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime()
    );

    const visibleScheduled = maxItems === null ? scheduled : scheduled.slice(0, maxItems);

    return visibleScheduled.map((match) => ({
      id: match.id,
      matchId: match.id,
      week: match.week,
      scheduledAt: match.scheduledAt,
      isUnderway: new Date(match.scheduledAt!).getTime() <= now,
      team1Name: match.coach1?.teamName,
      team2Name: match.coach2?.teamName,
      team1Logo: match.coach1?.teamLogoUrl,
      team2Logo: match.coach2?.teamLogoUrl,
      team1Id: match.coach1SeasonId,
      team2Id: match.coach2SeasonId,
      divisionName: match.division?.name,
    }));
  }

  if (visibleUnplayed.length === 0) return [];

  const earliestWeek = Math.min(...visibleUnplayed.map((match) => match.week));
  const earliestWeekMatches = visibleUnplayed
    .filter((match) => match.week === earliestWeek)
    .sort((a, b) => compareDivisionNames(a.division?.name, b.division?.name));

  const visibleEarliestWeekMatches = maxItems === null
    ? earliestWeekMatches
    : earliestWeekMatches.slice(0, maxItems);

  return visibleEarliestWeekMatches.map((match) => ({
    id: match.id,
    matchId: match.id,
    week: match.week,
    scheduledAt: match.scheduledAt,
    isUnderway: false,
    team1Name: match.coach1?.teamName,
    team2Name: match.coach2?.teamName,
    team1Logo: match.coach1?.teamLogoUrl,
    team2Logo: match.coach2?.teamLogoUrl,
    team1Id: match.coach1SeasonId,
    team2Id: match.coach2SeasonId,
    divisionName: match.division?.name,
  }));
}
