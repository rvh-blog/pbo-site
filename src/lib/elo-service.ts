import { db } from "./db";
import { coaches, eloHistory, matches, seasonCoaches } from "./schema";
import { eq, and, isNotNull, desc } from "drizzle-orm";
import { calculateMatchElo, calculateDoubleForfeitElo, getPlacementElo, getDivisionStartingElo, getMatchStartingElo } from "./elo";

/**
 * Process ELO for a single match - used when the match is the most recent for both coaches.
 * This is much faster than recalculating all ELO history.
 */
async function processSingleMatchElo(matchId: number): Promise<boolean> {
  // Get the match with all needed data
  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
    with: {
      coach1: { with: { coach: true } },
      coach2: { with: { coach: true } },
      division: { with: { season: true } },
    },
  });

  if (!match) return false;

  // Check if this is a double forfeit (winnerId null but isForfeit true)
  const isDoubleForfeit = match.winnerId === null && match.isForfeit === true;

  // Skip incomplete matches that aren't double forfeits
  if (!match.winnerId && !isDoubleForfeit) return false;

  const coach1Id = match.coach1?.coachId;
  const coach2Id = match.coach2?.coachId;
  if (!coach1Id || !coach2Id) return false;

  // Check if ELO history entries already exist for this match
  const existingEntries = await db.query.eloHistory.findMany({
    where: eq(eloHistory.matchId, matchId),
  });
  const existingCoach1Entry = existingEntries.find(e => e.coachId === coach1Id);
  const existingCoach2Entry = existingEntries.find(e => e.coachId === coach2Id);
  const isUpdate = existingEntries.length > 0;

  let coach1Elo: number;
  let coach2Elo: number;

  if (isUpdate) {
    // Match was already processed - find pre-match ELO for each coach
    // Get all ELO history for each coach, ordered by recordedAt desc
    const [coach1History, coach2History] = await Promise.all([
      db.query.eloHistory.findMany({
        where: eq(eloHistory.coachId, coach1Id),
        orderBy: [desc(eloHistory.recordedAt), desc(eloHistory.id)],
      }),
      db.query.eloHistory.findMany({
        where: eq(eloHistory.coachId, coach2Id),
        orderBy: [desc(eloHistory.recordedAt), desc(eloHistory.id)],
      }),
    ]);

    // Find the entry right before this match's entry
    const coach1MatchIdx = coach1History.findIndex(e => e.matchId === matchId);
    const coach2MatchIdx = coach2History.findIndex(e => e.matchId === matchId);

    // Pre-match ELO is the next entry in the history (since it's ordered desc)
    // If there's no previous entry, use 1000 as default starting ELO
    coach1Elo = coach1MatchIdx >= 0 && coach1MatchIdx < coach1History.length - 1
      ? coach1History[coach1MatchIdx + 1].eloRating
      : 1000;
    coach2Elo = coach2MatchIdx >= 0 && coach2MatchIdx < coach2History.length - 1
      ? coach2History[coach2MatchIdx + 1].eloRating
      : 1000;
  } else {
    // New match - use current ELO from coaches table
    const [coach1Data, coach2Data] = await Promise.all([
      db.query.coaches.findFirst({ where: eq(coaches.id, coach1Id) }),
      db.query.coaches.findFirst({ where: eq(coaches.id, coach2Id) }),
    ]);

    if (!coach1Data || !coach2Data) return false;

    coach1Elo = coach1Data.eloRating;
    coach2Elo = coach2Data.eloRating;
  }

  let newCoach1Elo: number;
  let newCoach2Elo: number;

  if (isDoubleForfeit) {
    // Double forfeit: both coaches get FFL (0.25 score), both lose ELO
    const { newCoach1Rating, newCoach2Rating } = calculateDoubleForfeitElo(
      coach1Elo,
      coach2Elo,
      100 // K-factor
    );
    newCoach1Elo = newCoach1Rating;
    newCoach2Elo = newCoach2Rating;
  } else {
    // Regular match or single forfeit
    const isCoach1Winner = match.winnerId === match.coach1SeasonId;

    // Calculate new ELO ratings (forfeits use 0.75/0.25 instead of 1/0)
    const { newWinnerRating, newLoserRating } = calculateMatchElo(
      isCoach1Winner ? coach1Elo : coach2Elo,
      isCoach1Winner ? coach2Elo : coach1Elo,
      100, // K-factor
      match.isForfeit === true
    );

    newCoach1Elo = isCoach1Winner ? newWinnerRating : newLoserRating;
    newCoach2Elo = isCoach1Winner ? newLoserRating : newWinnerRating;
  }

  // Update coaches' ELO
  await Promise.all([
    db.update(coaches).set({ eloRating: newCoach1Elo }).where(eq(coaches.id, coach1Id)),
    db.update(coaches).set({ eloRating: newCoach2Elo }).where(eq(coaches.id, coach2Id)),
  ]);

  const recordedAt = match.playedAt || new Date().toISOString();

  // Update or insert ELO history for coach 1
  if (existingCoach1Entry) {
    await db.update(eloHistory)
      .set({ eloRating: newCoach1Elo, recordedAt })
      .where(eq(eloHistory.id, existingCoach1Entry.id));
  } else {
    await db.insert(eloHistory).values({
      coachId: coach1Id,
      eloRating: newCoach1Elo,
      matchId: match.id,
      recordedAt,
    });
  }

  // Update or insert ELO history for coach 2
  if (existingCoach2Entry) {
    await db.update(eloHistory)
      .set({ eloRating: newCoach2Elo, recordedAt })
      .where(eq(eloHistory.id, existingCoach2Entry.id));
  } else {
    await db.insert(eloHistory).values({
      coachId: coach2Id,
      eloRating: newCoach2Elo,
      matchId: match.id,
      recordedAt,
    });
  }

  return true;
}

/**
 * Check if a match is the most recent completed match for both coaches involved.
 * Returns true if we can use the fast single-match ELO calculation.
 */
async function isMatchMostRecentForBothCoaches(matchId: number): Promise<boolean> {
  // Get the match
  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
    with: {
      coach1: true,
      coach2: true,
      division: { with: { season: true } },
    },
  });

  if (!match) return false;

  // Check if this is a double forfeit (winnerId null but isForfeit true)
  const isDoubleForfeit = match.winnerId === null && match.isForfeit === true;

  // Skip incomplete matches that aren't double forfeits
  if (!match.winnerId && !isDoubleForfeit) return false;

  const coach1Id = match.coach1?.coachId;
  const coach2Id = match.coach2?.coachId;
  if (!coach1Id || !coach2Id) return false;

  const matchSeasonNumber = match.division?.season?.seasonNumber ?? 0;
  const matchWeek = match.week;

  // Get all seasonCoach IDs for both coaches (across all seasons)
  const [coach1SeasonCoaches, coach2SeasonCoaches] = await Promise.all([
    db.query.seasonCoaches.findMany({
      where: eq(seasonCoaches.coachId, coach1Id),
      columns: { id: true },
    }),
    db.query.seasonCoaches.findMany({
      where: eq(seasonCoaches.coachId, coach2Id),
      columns: { id: true },
    }),
  ]);

  const coach1SeasonIds = coach1SeasonCoaches.map(sc => sc.id);
  const coach2SeasonIds = coach2SeasonCoaches.map(sc => sc.id);

  // Check if there's any completed match AFTER this one for either coach
  const allCompletedMatches = await db.query.matches.findMany({
    where: isNotNull(matches.winnerId),
    with: {
      division: { with: { season: true } },
    },
  });

  for (const m of allCompletedMatches) {
    if (m.id === matchId) continue;

    const mSeasonNumber = m.division?.season?.seasonNumber ?? 0;
    const mWeek = m.week;

    // Check if this match is "after" our match (higher season or same season + higher week)
    const isAfter =
      mSeasonNumber > matchSeasonNumber ||
      (mSeasonNumber === matchSeasonNumber && mWeek > matchWeek);

    if (!isAfter) continue;

    // Check if either coach is in this later match
    const involvesCoach1 =
      coach1SeasonIds.includes(m.coach1SeasonId) ||
      coach1SeasonIds.includes(m.coach2SeasonId);
    const involvesCoach2 =
      coach2SeasonIds.includes(m.coach1SeasonId) ||
      coach2SeasonIds.includes(m.coach2SeasonId);

    if (involvesCoach1 || involvesCoach2) {
      // There's a later match involving one of the coaches
      return false;
    }
  }

  return true;
}

/**
 * Smart ELO update that checks if full recalculation is needed.
 * For new/recent matches, uses fast single-match calculation.
 * For older/historical matches, returns needsFullRecalc=true instead of auto-recalculating.
 *
 * @returns Object with needsFullRecalc flag - if true, UI should prompt user to run full recalc
 */
export async function updateEloForMatch(matchId: number): Promise<{ needsFullRecalc: boolean }> {
  const isMostRecent = await isMatchMostRecentForBothCoaches(matchId);

  if (isMostRecent) {
    // Fast path: just calculate ELO for this single match
    const success = await processSingleMatchElo(matchId);
    if (!success) {
      // Something went wrong with fast calc - needs full recalc
      return { needsFullRecalc: true };
    }
    return { needsFullRecalc: false };
  } else {
    // Historical match edited - don't auto-recalc, let UI handle it
    return { needsFullRecalc: true };
  }
}

export async function recalculateAllElo(): Promise<{
  matchesProcessed: number;
  coachesUpdated: number;
}> {
  // Get all matches with division and season info
  // This includes both regular season matches (week 1-10) and playoff matches (week 101-103)
  // Playoff matches are stored in both playoffMatches AND matches tables,
  // so we only query the matches table to avoid double-counting
  const allMatches = await db.query.matches.findMany({
    with: {
      coach1: { with: { coach: true } },
      coach2: { with: { coach: true } },
      division: { with: { season: true } },
    },
  });

  // Build match data for processing
  type MatchData = {
    id: number;
    seasonNumber: number;
    divisionId: number;
    divisionName: string;
    week: number;
    coach1Id: number | null;
    coach2Id: number | null;
    coach1SeasonId: number;
    coach2SeasonId: number;
    winnerId: number | null;
    playedAt: string | null;
    isForfeit: boolean;
  };

  const allMatchData: MatchData[] = [];

  for (const match of allMatches) {
    // Include matches with a winner OR double forfeits (winnerId null but isForfeit true)
    const isDoubleForfeit = match.winnerId === null && match.isForfeit === true;
    if (match.winnerId === null && !isDoubleForfeit) continue; // Skip incomplete non-forfeit matches

    allMatchData.push({
      id: match.id,
      seasonNumber: match.division?.season?.seasonNumber ?? 0,
      divisionId: match.divisionId,
      divisionName: match.division?.name ?? "",
      week: match.week,
      coach1Id: match.coach1?.coachId ?? null,
      coach2Id: match.coach2?.coachId ?? null,
      coach1SeasonId: match.coach1SeasonId,
      coach2SeasonId: match.coach2SeasonId,
      winnerId: match.winnerId,
      playedAt: match.playedAt,
      isForfeit: match.isForfeit === true,
    });
  }

  // Sort by season number (chronological), then week, then id
  allMatchData.sort((a, b) => {
    if (a.seasonNumber !== b.seasonNumber) return a.seasonNumber - b.seasonNumber;
    if (a.week !== b.week) return a.week - b.week;
    return a.id - b.id;
  });

  // Get all coaches
  const allCoaches = await db.query.coaches.findMany();

  // Clear existing ELO history
  await db.delete(eloHistory);

  // Track current ELO for each coach (null = not yet placed)
  const coachElo = new Map<number, number | null>();
  for (const coach of allCoaches) {
    coachElo.set(coach.id, null);
  }

  // Track which divisions each coach has played in (for division-specific overrides)
  const coachDivisions = new Map<number, Set<number>>();

  // Process each match chronologically
  let matchesProcessed = 0;
  for (const match of allMatchData) {
    const coach1Id = match.coach1Id;
    const coach2Id = match.coach2Id;

    if (!coach1Id || !coach2Id) continue;

    const seasonNumber = match.seasonNumber;
    const divisionName = match.divisionName;

    // Assign placement ELO if this is coach's first match
    // Also record the initial placement as a history entry (matchId = null)
    // Pass coachId to check for S4 veteran placements
    if (coachElo.get(coach1Id) === null) {
      const placementElo = getPlacementElo(seasonNumber, divisionName, coach1Id);
      coachElo.set(coach1Id, placementElo);
      // Record placement ELO as initial history entry
      await db.insert(eloHistory).values({
        coachId: coach1Id,
        eloRating: placementElo,
        matchId: null,
        recordedAt: match.playedAt || new Date().toISOString(),
      });
    }
    if (coachElo.get(coach2Id) === null) {
      const placementElo = getPlacementElo(seasonNumber, divisionName, coach2Id);
      coachElo.set(coach2Id, placementElo);
      // Record placement ELO as initial history entry
      await db.insert(eloHistory).values({
        coachId: coach2Id,
        eloRating: placementElo,
        matchId: null,
        recordedAt: match.playedAt || new Date().toISOString(),
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
    const isDoubleForfeit = match.winnerId === null && match.isForfeit;

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
      const isCoach1Winner = match.winnerId === match.coach1SeasonId;

      // Calculate new ELO ratings (forfeits use 0.75/0.25 instead of 1/0)
      const { newWinnerRating, newLoserRating } = calculateMatchElo(
        isCoach1Winner ? coach1CurrentElo : coach2CurrentElo,
        isCoach1Winner ? coach2CurrentElo : coach1CurrentElo,
        100, // K-factor
        match.isForfeit
      );

      newCoach1Elo = isCoach1Winner ? newWinnerRating : newLoserRating;
      newCoach2Elo = isCoach1Winner ? newLoserRating : newWinnerRating;
    }

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

  // Set placement ELO for coaches who haven't played any matches yet
  // (they are registered for a season but have 0 completed matches)
  const allSeasonCoaches = await db.query.seasonCoaches.findMany({
    with: {
      coach: true,
      division: { with: { season: true } },
    },
  });

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
  for (const [coachId, sc] of coachLatestSeason.entries()) {
    if (coachElo.get(coachId) === null && sc.division?.season) {
      const seasonNumber = sc.division.season.seasonNumber ?? 0;
      const divisionName = sc.division.name ?? "";
      const placementElo = getPlacementElo(seasonNumber, divisionName, coachId);
      coachElo.set(coachId, placementElo);

      // Record placement ELO in history
      await db.insert(eloHistory).values({
        coachId: coachId,
        eloRating: placementElo,
        matchId: null,
        recordedAt: new Date().toISOString(),
      });
    }
  }

  // Update final ELO ratings in coaches table
  let coachesUpdated = 0;
  for (const [coachId, elo] of coachElo.entries()) {
    if (elo !== null) {
      await db
        .update(coaches)
        .set({ eloRating: elo })
        .where(eq(coaches.id, coachId));
      coachesUpdated++;
    }
  }

  return {
    matchesProcessed,
    coachesUpdated,
  };
}
