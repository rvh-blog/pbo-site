import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { matches, pickEmParticipants, pickEmPicks } from "./schema";
import { getUnlockedPickWeeks, isMatchOpenForPicks } from "./pick-em-availability";

export async function getHomePickEms(seasonId: number, coachId: number) {
  const [seasonMatches, participant] = await Promise.all([
    db.query.matches.findMany({
      where: eq(matches.seasonId, seasonId),
      columns: { id: true, week: true, winnerId: true, isForfeit: true, scheduledAt: true },
      orderBy: [matches.week],
    }),
    db.query.pickEmParticipants.findFirst({
      where: and(eq(pickEmParticipants.seasonId, seasonId), eq(pickEmParticipants.coachId, coachId)),
      columns: { id: true },
    }),
  ]);
  const unlocked = getUnlockedPickWeeks(seasonMatches);
  const now = Date.now();
  const openMatches = seasonMatches.filter((match) => isMatchOpenForPicks(match, unlocked, now));
  const week = openMatches[0]?.week;
  if (week === undefined) return null;
  const weekMatches = openMatches.filter((match) => match.week === week);
  const picks = participant ? await db.query.pickEmPicks.findMany({
    where: and(eq(pickEmPicks.participantId, participant.id), inArray(pickEmPicks.matchId, weekMatches.map((match) => match.id))),
    columns: { matchId: true },
  }) : [];
  const picked = new Set(picks.map((pick) => pick.matchId));
  const missing = weekMatches.filter((match) => !picked.has(match.id));
  const nextDeadline = missing.map((match) => match.scheduledAt).filter((date): date is string => !!date)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;
  return { week, missing: missing.length, total: weekMatches.length, nextDeadline, joined: !!participant };
}
