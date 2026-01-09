import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { eq, asc } from "drizzle-orm";
import * as schema from "./schema";
import { calculateMatchElo, getPlacementElo } from "./elo";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: ".env.local" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = drizzle(client, { schema });

async function recalculateElo() {
  console.log("Recalculating ELO ratings with placement system...\n");

  // Get all matches ordered by season number, week, then id
  const allMatches = await db.query.matches.findMany({
    with: {
      coach1: { with: { coach: true } },
      coach2: { with: { coach: true } },
      division: { with: { season: true } },
    },
    orderBy: [asc(schema.matches.seasonId), asc(schema.matches.week), asc(schema.matches.id)],
  });

  // Sort by season number (not id) to ensure chronological order
  allMatches.sort((a, b) => {
    const seasonA = a.division?.season?.seasonNumber ?? 0;
    const seasonB = b.division?.season?.seasonNumber ?? 0;
    if (seasonA !== seasonB) return seasonA - seasonB;
    if (a.week !== b.week) return a.week - b.week;
    return a.id - b.id;
  });

  // Filter to only completed matches (have a winner)
  const completedMatches = allMatches.filter((m) => m.winnerId !== null);
  console.log(`Found ${completedMatches.length} completed matches\n`);

  // Get all coaches
  const allCoaches = await db.query.coaches.findMany();

  // Clear existing ELO history
  await db.delete(schema.eloHistory);
  console.log("Cleared ELO history\n");

  // Track current ELO for each coach (null = not yet placed)
  const coachElo = new Map<number, number | null>();
  for (const coach of allCoaches) {
    coachElo.set(coach.id, null);
  }

  // Track placement info for logging
  const coachPlacements = new Map<number, { elo: number; season: number; division: string }>();

  // Process each match chronologically
  let matchesProcessed = 0;
  for (const match of completedMatches) {
    const coach1Id = match.coach1?.coachId;
    const coach2Id = match.coach2?.coachId;

    if (!coach1Id || !coach2Id) {
      console.warn(`Skipping match ${match.id} - missing coach data`);
      continue;
    }

    const seasonNumber = match.division?.season?.seasonNumber ?? 0;
    const divisionName = match.division?.name ?? "";

    // Assign placement ELO if this is coach's first match
    if (coachElo.get(coach1Id) === null) {
      const placementElo = getPlacementElo(seasonNumber, divisionName);
      coachElo.set(coach1Id, placementElo);
      coachPlacements.set(coach1Id, { elo: placementElo, season: seasonNumber, division: divisionName });
    }
    if (coachElo.get(coach2Id) === null) {
      const placementElo = getPlacementElo(seasonNumber, divisionName);
      coachElo.set(coach2Id, placementElo);
      coachPlacements.set(coach2Id, { elo: placementElo, season: seasonNumber, division: divisionName });
    }

    const coach1CurrentElo = coachElo.get(coach1Id)!;
    const coach2CurrentElo = coachElo.get(coach2Id)!;

    // Determine winner's coach ID
    const winnerSeasonCoachId = match.winnerId;
    const isCoach1Winner = winnerSeasonCoachId === match.coach1SeasonId;

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
    await db.insert(schema.eloHistory).values({
      coachId: coach1Id,
      eloRating: newCoach1Elo,
      matchId: match.id,
      recordedAt: match.playedAt || new Date().toISOString(),
    });

    await db.insert(schema.eloHistory).values({
      coachId: coach2Id,
      eloRating: newCoach2Elo,
      matchId: match.id,
      recordedAt: match.playedAt || new Date().toISOString(),
    });

    matchesProcessed++;

    // Log progress every 10 matches
    if (matchesProcessed % 10 === 0) {
      console.log(`Processed ${matchesProcessed}/${completedMatches.length} matches...`);
    }
  }

  // Update final ELO ratings in coaches table
  for (const [coachId, elo] of coachElo.entries()) {
    // Only update coaches who have played matches
    if (elo !== null) {
      await db
        .update(schema.coaches)
        .set({ eloRating: elo })
        .where(eq(schema.coaches.id, coachId));
    }
  }

  console.log(`\n✅ ELO recalculation complete!`);
  console.log(`   Matches processed: ${matchesProcessed}`);
  console.log(`   Coaches with ELO: ${coachPlacements.size}`);

  // Show placement summary by division
  console.log("\n📋 Placement Summary:");
  const placementsByDivision = new Map<string, number>();
  for (const [, placement] of coachPlacements) {
    const key = `S${placement.season} ${placement.division}`;
    placementsByDivision.set(key, (placementsByDivision.get(key) ?? 0) + 1);
  }
  for (const [div, count] of Array.from(placementsByDivision.entries()).sort()) {
    console.log(`   ${div}: ${count} coaches placed`);
  }

  // Show top 10 coaches by ELO
  const topCoaches = Array.from(coachElo.entries())
    .filter(([, elo]) => elo !== null)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 10);

  console.log("\n📊 Top 10 ELO Rankings:");
  for (let i = 0; i < topCoaches.length; i++) {
    const [coachId, elo] = topCoaches[i];
    const coach = allCoaches.find((c) => c.id === coachId);
    const placement = coachPlacements.get(coachId);
    const placementInfo = placement ? ` (placed S${placement.season} ${placement.division} @ ${placement.elo})` : "";
    console.log(`   ${i + 1}. ${coach?.name || "Unknown"}: ${elo}${placementInfo}`);
  }

  process.exit(0);
}

recalculateElo().catch((err) => {
  console.error("ELO recalculation failed:", err);
  process.exit(1);
});
