import { db } from "./db";
import { coaches, eloHistory, matches, seasonCoaches } from "./schema";
import { eq, asc } from "drizzle-orm";
import { calculateMatchElo, getStartingElo } from "./elo";

export async function recalculateAllElo(): Promise<{
  matchesProcessed: number;
  coachesUpdated: number;
}> {
  // Get all matches ordered by season, week, then id
  const allMatches = await db.query.matches.findMany({
    with: {
      coach1: { with: { coach: true } },
      coach2: { with: { coach: true } },
    },
    orderBy: [asc(matches.seasonId), asc(matches.week), asc(matches.id)],
  });

  // Filter to only completed matches (have a winner)
  const completedMatches = allMatches.filter((m) => m.winnerId !== null);

  // Get all coaches and reset their ELO
  const allCoaches = await db.query.coaches.findMany();
  const startingElo = getStartingElo();

  for (const coach of allCoaches) {
    await db
      .update(coaches)
      .set({ eloRating: startingElo })
      .where(eq(coaches.id, coach.id));
  }

  // Clear existing ELO history
  await db.delete(eloHistory);

  // Track current ELO for each coach
  const coachElo = new Map<number, number>();
  for (const coach of allCoaches) {
    coachElo.set(coach.id, startingElo);
  }

  // Process each match chronologically
  let matchesProcessed = 0;
  for (const match of completedMatches) {
    const coach1Id = match.coach1?.coachId;
    const coach2Id = match.coach2?.coachId;

    if (!coach1Id || !coach2Id) continue;

    const coach1CurrentElo = coachElo.get(coach1Id) || startingElo;
    const coach2CurrentElo = coachElo.get(coach2Id) || startingElo;

    // Determine winner's coach ID
    const isCoach1Winner = match.winnerId === match.coach1SeasonId;

    // Calculate new ELO ratings
    const { newWinnerRating, newLoserRating } = calculateMatchElo(
      isCoach1Winner ? coach1CurrentElo : coach2CurrentElo,
      isCoach1Winner ? coach2CurrentElo : coach1CurrentElo
    );

    // Update tracked ELO
    const newCoach1Elo = isCoach1Winner ? newWinnerRating : newLoserRating;
    const newCoach2Elo = isCoach1Winner ? newLoserRating : newWinnerRating;

    coachElo.set(coach1Id, newCoach1Elo);
    coachElo.set(coach2Id, newCoach2Elo);

    // Record ELO history for both coaches
    await db.insert(eloHistory).values({
      coachId: coach1Id,
      eloRating: newCoach1Elo,
      matchId: match.id,
      recordedAt: match.playedAt || new Date().toISOString(),
    });

    await db.insert(eloHistory).values({
      coachId: coach2Id,
      eloRating: newCoach2Elo,
      matchId: match.id,
      recordedAt: match.playedAt || new Date().toISOString(),
    });

    matchesProcessed++;
  }

  // Update final ELO ratings in coaches table
  for (const [coachId, elo] of coachElo.entries()) {
    await db
      .update(coaches)
      .set({ eloRating: elo })
      .where(eq(coaches.id, coachId));
  }

  return {
    matchesProcessed,
    coachesUpdated: coachElo.size,
  };
}
