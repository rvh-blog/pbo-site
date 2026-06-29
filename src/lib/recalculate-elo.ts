import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { eq, asc } from "drizzle-orm";
import * as schema from "./schema";
import {
  calculateDynamicPlacementElo,
  calculateMatchElo,
  calculateDoubleForfeitElo,
  getPlacementElo,
  getDivisionStartingElo,
  getMatchStartingElo,
  usesDynamicPlacementElo,
} from "./elo";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: ".env.local" });

// Use local SQLite by default, Turso only if USE_TURSO=true
const useTurso = process.env.USE_TURSO === "true";
const client = createClient(
  useTurso
    ? {
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN,
      }
    : { url: "file:pbo.db" }
);

console.log(`Using ${useTurso ? "Turso" : "local SQLite"} database`);

const db = drizzle(client, { schema });

type SeasonCoachWithDivision = {
  coachId: number | null;
  divisionId: number;
  division?: {
    season?: {
      seasonNumber: number | null;
    } | null;
  } | null;
};

function getResolvedPlacementElo(
  seasonNumber: number,
  divisionId: number,
  divisionName: string,
  dynamicPlacementByDivision: Map<number, number>
) {
  if (usesDynamicPlacementElo(seasonNumber)) {
    return dynamicPlacementByDivision.get(divisionId) ?? getPlacementElo(seasonNumber, divisionName);
  }

  return getPlacementElo(seasonNumber, divisionName);
}

function initializeDynamicPlacementsForSeason(
  seasonNumber: number,
  allSeasonCoaches: SeasonCoachWithDivision[],
  coachElo: Map<number, number | null>,
  dynamicPlacementByDivision: Map<number, number>,
  initializedDynamicPlacementSeasons: Set<number>
) {
  if (!usesDynamicPlacementElo(seasonNumber) || initializedDynamicPlacementSeasons.has(seasonNumber)) {
    return;
  }

  const divisionIds = new Set(
    allSeasonCoaches
      .filter((sc) => sc.division?.season?.seasonNumber === seasonNumber)
      .map((sc) => sc.divisionId)
  );

  for (const divisionId of divisionIds) {
    const returningCoachElos = allSeasonCoaches
      .filter((sc) => sc.divisionId === divisionId && sc.coachId !== null)
      .map((sc) => coachElo.get(sc.coachId!))
      .filter((elo): elo is number => elo !== null && elo !== undefined);

    dynamicPlacementByDivision.set(divisionId, calculateDynamicPlacementElo(returningCoachElos));
  }

  initializedDynamicPlacementSeasons.add(seasonNumber);
}

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

  // Filter to completed matches (have a winner) OR double forfeits (winnerId null but isForfeit true)
  const completedMatches = allMatches.filter((m) => {
    const isDoubleForfeit = m.winnerId === null && m.isForfeit === true;
    return m.winnerId !== null || isDoubleForfeit;
  });
  console.log(`Found ${completedMatches.length} completed matches (including double forfeits)\n`);

  // Get all coaches
  const allCoaches = await db.query.coaches.findMany();
  const allSeasonCoaches = await db.query.seasonCoaches.findMany({
    with: {
      coach: true,
      division: { with: { season: true } },
    },
  });

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

  // Track which divisions each coach has played in (for division-specific overrides)
  const coachDivisions = new Map<number, Set<number>>();
  const dynamicPlacementByDivision = new Map<number, number>();
  const initializedDynamicPlacementSeasons = new Set<number>();

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
    initializeDynamicPlacementsForSeason(
      seasonNumber,
      allSeasonCoaches,
      coachElo,
      dynamicPlacementByDivision,
      initializedDynamicPlacementSeasons
    );

    // Assign placement ELO if this is coach's first match
    if (coachElo.get(coach1Id) === null) {
      const placementElo = getResolvedPlacementElo(
        seasonNumber,
        match.divisionId,
        divisionName,
        dynamicPlacementByDivision
      );
      coachElo.set(coach1Id, placementElo);
      coachPlacements.set(coach1Id, { elo: placementElo, season: seasonNumber, division: divisionName });
      // Record placement ELO in history (match_id = null indicates placement)
      await db.insert(schema.eloHistory).values({
        coachId: coach1Id,
        eloRating: placementElo,
        matchId: null,
        recordedAt: new Date().toISOString(),
      });
    }
    if (coachElo.get(coach2Id) === null) {
      const placementElo = getResolvedPlacementElo(
        seasonNumber,
        match.divisionId,
        divisionName,
        dynamicPlacementByDivision
      );
      coachElo.set(coach2Id, placementElo);
      coachPlacements.set(coach2Id, { elo: placementElo, season: seasonNumber, division: divisionName });
      // Record placement ELO in history (match_id = null indicates placement)
      await db.insert(schema.eloHistory).values({
        coachId: coach2Id,
        eloRating: placementElo,
        matchId: null,
        recordedAt: new Date().toISOString(),
      });
    }

    // Check for division-specific overrides (for coaches in multiple divisions per season)
    const divisionId = match.divisionId;
    for (const coachId of [coach1Id, coach2Id]) {
      if (!coachDivisions.has(coachId)) {
        coachDivisions.set(coachId, new Set());
      }
      const playedDivisions = coachDivisions.get(coachId)!;

      // If this is the coach's first match in this division, check for override
      if (!playedDivisions.has(divisionId)) {
        const divisionOverride = getDivisionStartingElo(coachId, divisionId);
        if (divisionOverride !== undefined) {
          coachElo.set(coachId, divisionOverride);
        }
        playedDivisions.add(divisionId);
      }
    }

    // Check for match-specific starting ELO overrides
    const match1Override = getMatchStartingElo(match.id, coach1Id);
    const match2Override = getMatchStartingElo(match.id, coach2Id);

    const coach1CurrentElo = match1Override ?? coachElo.get(coach1Id)!;
    const coach2CurrentElo = match2Override ?? coachElo.get(coach2Id)!;

    let newCoach1Elo: number;
    let newCoach2Elo: number;

    // Check if this is a double forfeit (winnerId is null but isForfeit is true)
    const isDoubleForfeit = match.winnerId === null && match.isForfeit === true;

    if (isDoubleForfeit) {
      // Double forfeit: both coaches get FFL (0.25 score), both lose ELO
      const { newCoach1Rating, newCoach2Rating } = calculateDoubleForfeitElo(
        coach1CurrentElo,
        coach2CurrentElo,
        100 // K-factor
      );
      newCoach1Elo = newCoach1Rating;
      newCoach2Elo = newCoach2Rating;
    } else {
      // Regular match or single forfeit
      const winnerSeasonCoachId = match.winnerId;
      const isCoach1Winner = winnerSeasonCoachId === match.coach1SeasonId;

      // Calculate new ELO ratings (forfeits use 0.75/0.25 instead of 1/0)
      const { newWinnerRating, newLoserRating } = calculateMatchElo(
        isCoach1Winner ? coach1CurrentElo : coach2CurrentElo,
        isCoach1Winner ? coach2CurrentElo : coach1CurrentElo,
        100, // K-factor
        match.isForfeit === true
      );

      newCoach1Elo = isCoach1Winner ? newWinnerRating : newLoserRating;
      newCoach2Elo = isCoach1Winner ? newLoserRating : newWinnerRating;
    }

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

  // Set placement ELO for coaches who haven't played any matches yet
  // (they are registered for a season but have 0 completed matches)
  // Group by coach, keeping the most recent season entry
  const coachLatestSeason = new Map<number, typeof allSeasonCoaches[0]>();
  for (const sc of allSeasonCoaches) {
    if (!sc.coachId || !sc.division?.season) continue;
    const existing = coachLatestSeason.get(sc.coachId);
    const scSeasonNum = sc.division.season.seasonNumber ?? 0;
    const existingSeasonNum = existing?.division?.season?.seasonNumber ?? 0;
    if (!existing || scSeasonNum > existingSeasonNum) {
      coachLatestSeason.set(sc.coachId, sc);
    }
  }

  // For coaches with no ELO yet, set their placement ELO based on their latest season
  let placementsAdded = 0;
  for (const [coachId, sc] of coachLatestSeason.entries()) {
    if (coachElo.get(coachId) === null && sc.division?.season) {
      const seasonNumber = sc.division.season.seasonNumber ?? 0;
      const divisionName = sc.division.name ?? "";
      initializeDynamicPlacementsForSeason(
        seasonNumber,
        allSeasonCoaches,
        coachElo,
        dynamicPlacementByDivision,
        initializedDynamicPlacementSeasons
      );
      const placementElo = getResolvedPlacementElo(
        seasonNumber,
        sc.divisionId,
        divisionName,
        dynamicPlacementByDivision
      );
      coachElo.set(coachId, placementElo);
      coachPlacements.set(coachId, { elo: placementElo, season: seasonNumber, division: divisionName });

      // Record placement ELO in history
      await db.insert(schema.eloHistory).values({
        coachId: coachId,
        eloRating: placementElo,
        matchId: null,
        recordedAt: new Date().toISOString(),
      });
      placementsAdded++;
    }
  }

  if (placementsAdded > 0) {
    console.log(`\n📌 Added placement ELO for ${placementsAdded} coaches with 0 matches played`);
  }

  // Update final ELO ratings in coaches table
  for (const [coachId, elo] of coachElo.entries()) {
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
