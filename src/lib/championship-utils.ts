import { inArray, eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { playoffMatches, seasonCoaches } from "@/lib/schema";

export async function hasCoachWonChampionship(coachId: number) {
  const coachSeasonTeams = await db.query.seasonCoaches.findMany({
    where: eq(seasonCoaches.coachId, coachId),
    columns: { id: true },
  });

  const seasonCoachIds = coachSeasonTeams.map((team) => team.id);
  if (seasonCoachIds.length === 0) return false;

  const finalsWin = await db.query.playoffMatches.findFirst({
    where: and(
      eq(playoffMatches.round, 3),
      inArray(playoffMatches.winnerId, seasonCoachIds)
    ),
    columns: { id: true },
  });

  return Boolean(finalsWin);
}
