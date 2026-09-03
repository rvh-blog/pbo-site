/**
 * Pick-Em Weekly Rewards System
 * Awards PBOcoin to top performers each week
 */

import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";
import * as schema from "./schema";

// Prize amounts
const OVERALL_PRIZES = [200, 100, 75]; // 1st, 2nd, 3rd overall for the week
const DIVISION_PRIZE = 75; // 1st per division for the week
const GOTW_BONUS = 15; // Bonus for correct Game of the Week picks

interface ParticipantScore {
  participantId: number;
  coachId: number | null;
  userId: number | null;
  name: string;
  correct: number;
  total: number;
}

interface AwardedReward {
  name: string;
  amount: number;
  reason: string;
}

/**
 * Check if this match completes a week (all matches in week are played)
 * and if so, award pick-em prizes
 */
export async function checkAndAwardPickEmRewards(
  matchId: number
): Promise<{ weekComplete: boolean; awarded: AwardedReward[] }> {
  const awarded: AwardedReward[] = [];

  // Get the match details
  const match = await db.query.matches.findFirst({
    where: eq(schema.matches.id, matchId),
    columns: { week: true, divisionId: true, seasonId: true },
  });

  if (!match) {
    return { weekComplete: false, awarded };
  }

  const { week, divisionId, seasonId } = match;

  // Check if this division's week is now complete
  const divisionWeekMatches = await db.query.matches.findMany({
    where: and(
      eq(schema.matches.seasonId, seasonId),
      eq(schema.matches.divisionId, divisionId),
      eq(schema.matches.week, week)
    ),
    columns: { id: true, winnerId: true, isForfeit: true },
  });

  const divisionWeekComplete = divisionWeekMatches.every((m) => m.winnerId !== null || m.isForfeit);

  // Check if rewards already exist for this division week
  const existingDivisionRewards = await db.query.pickEmRewards.findFirst({
    where: and(
      eq(schema.pickEmRewards.seasonId, seasonId),
      eq(schema.pickEmRewards.week, week),
      eq(schema.pickEmRewards.divisionId, divisionId)
    ),
  });

  if (divisionWeekComplete && !existingDivisionRewards) {
    // Award division prize for this week
    const divisionAwarded = await awardDivisionPrize(seasonId, week, divisionId);
    awarded.push(...divisionAwarded);
  }

  // Check if the entire week is now complete (all divisions)
  const allWeekMatches = await db.query.matches.findMany({
    where: and(
      eq(schema.matches.seasonId, seasonId),
      eq(schema.matches.week, week)
    ),
    columns: { id: true, winnerId: true, isForfeit: true },
  });

  const weekComplete = allWeekMatches.every((m) => m.winnerId !== null || m.isForfeit);

  // Check if overall rewards already exist for this week
  // (exclude GOTW rewards which have divisionId=NULL but matchId set)
  const existingOverallRewards = await db.query.pickEmRewards.findFirst({
    where: and(
      eq(schema.pickEmRewards.seasonId, seasonId),
      eq(schema.pickEmRewards.week, week),
      sql`${schema.pickEmRewards.divisionId} IS NULL`,
      sql`${schema.pickEmRewards.matchId} IS NULL`
    ),
  });

  if (weekComplete && !existingOverallRewards) {
    // Award overall prizes for this week
    const overallAwarded = await awardOverallPrizes(seasonId, week);
    awarded.push(...overallAwarded);
  }

  return { weekComplete, awarded };
}

/**
 * Award GOTW bonus to participants who correctly predicted a Game of the Week match
 * Called when a match result is set for the first time
 */
export async function awardGotwBonus(
  matchId: number,
  winnerId: number
): Promise<AwardedReward[]> {
  const awarded: AwardedReward[] = [];

  // Get the match details
  const match = await db.query.matches.findFirst({
    where: eq(schema.matches.id, matchId),
    columns: { isGameOfTheWeek: true, seasonId: true, week: true },
  });

  // Only award bonus if this is a GOTW match
  if (!match || !match.isGameOfTheWeek) {
    return awarded;
  }

  // Check if rewards already exist for this specific match
  const existingRewards = await db.query.pickEmRewards.findFirst({
    where: eq(schema.pickEmRewards.matchId, matchId),
  });

  if (existingRewards) {
    // Already awarded for this match, skip
    return awarded;
  }

  // Find all participants who correctly predicted this match
  const correctPicks = await db.query.pickEmPicks.findMany({
    where: and(
      eq(schema.pickEmPicks.matchId, matchId),
      eq(schema.pickEmPicks.predictedWinnerId, winnerId)
    ),
    with: {
      participant: true,
    },
  });

  // Award bonus to each correct picker
  for (const pick of correctPicks) {
    const participant = pick.participant;
    if (!participant) continue;

    await awardCoins(participant.coachId, participant.userId, GOTW_BONUS);

    const reason = `GOTW Bonus - Week ${match.week}`;

    // Track the reward
    await db.insert(schema.pickEmRewards).values({
      participantId: participant.id,
      seasonId: match.seasonId,
      week: match.week,
      divisionId: null, // GOTW bonus is not division-specific
      matchId: matchId, // Track which GOTW match this bonus is for
      amount: GOTW_BONUS,
      reason,
    });

    awarded.push({
      name: participant.name,
      amount: GOTW_BONUS,
      reason,
    });
  }

  return awarded;
}

/**
 * Reverse GOTW bonus for a match (when winner is changed)
 */
export async function reverseGotwBonus(
  matchId: number
): Promise<AwardedReward[]> {
  const reversed: AwardedReward[] = [];

  // Get the match details
  const match = await db.query.matches.findFirst({
    where: eq(schema.matches.id, matchId),
    columns: { isGameOfTheWeek: true, seasonId: true, week: true },
  });

  if (!match || !match.isGameOfTheWeek) {
    return reversed;
  }

  // Find and reverse GOTW rewards for this specific match only
  const gotwRewards = await db.query.pickEmRewards.findMany({
    where: eq(schema.pickEmRewards.matchId, matchId),
    with: {
      participant: true,
    },
  });

  for (const reward of gotwRewards) {
    // Reverse the coins
    await reverseCoins(
      reward.participant.coachId,
      reward.participant.userId,
      reward.amount
    );

    reversed.push({
      name: reward.participant.name,
      amount: -reward.amount,
      reason: `Reversed: ${reward.reason}`,
    });

    // Delete the reward record
    await db
      .delete(schema.pickEmRewards)
      .where(eq(schema.pickEmRewards.id, reward.id));
  }

  return reversed;
}

/**
 * Re-resolve pick-em rewards for a match when the winner changes
 * Reverses previous rewards and recalculates
 */
export async function reResolvePickEmRewards(
  matchId: number
): Promise<{ reversed: AwardedReward[]; awarded: AwardedReward[] }> {
  const reversed: AwardedReward[] = [];
  const awarded: AwardedReward[] = [];

  // Get the match details
  const match = await db.query.matches.findFirst({
    where: eq(schema.matches.id, matchId),
    columns: { week: true, divisionId: true, seasonId: true },
  });

  if (!match) {
    return { reversed, awarded };
  }

  const { week, divisionId, seasonId } = match;

  // Reverse division rewards for this week/division if they exist
  const divisionReversed = await reverseRewards(seasonId, week, divisionId);
  reversed.push(...divisionReversed);

  // Reverse overall rewards for this week if they exist
  const overallReversed = await reverseRewards(seasonId, week, null);
  reversed.push(...overallReversed);

  // Now re-award if weeks are still complete
  // Check division completion
  const divisionWeekMatches = await db.query.matches.findMany({
    where: and(
      eq(schema.matches.seasonId, seasonId),
      eq(schema.matches.divisionId, divisionId),
      eq(schema.matches.week, week)
    ),
    columns: { id: true, winnerId: true, isForfeit: true },
  });

  const divisionWeekComplete = divisionWeekMatches.every((m) => m.winnerId !== null || m.isForfeit);

  if (divisionWeekComplete) {
    const divisionAwarded = await awardDivisionPrize(seasonId, week, divisionId);
    awarded.push(...divisionAwarded);
  }

  // Check overall completion
  const allWeekMatches = await db.query.matches.findMany({
    where: and(
      eq(schema.matches.seasonId, seasonId),
      eq(schema.matches.week, week)
    ),
    columns: { id: true, winnerId: true, isForfeit: true },
  });

  const weekComplete = allWeekMatches.every((m) => m.winnerId !== null || m.isForfeit);

  if (weekComplete) {
    const overallAwarded = await awardOverallPrizes(seasonId, week);
    awarded.push(...overallAwarded);
  }

  return { reversed, awarded };
}

/**
 * Reverse rewards for a specific week and optionally division
 */
async function reverseRewards(
  seasonId: number,
  week: number,
  divisionId: number | null
): Promise<AwardedReward[]> {
  const reversed: AwardedReward[] = [];

  // Find existing rewards
  // (for overall rewards, exclude GOTW which have divisionId=NULL but matchId set)
  const rewardsFilter = divisionId !== null
    ? and(
        eq(schema.pickEmRewards.seasonId, seasonId),
        eq(schema.pickEmRewards.week, week),
        eq(schema.pickEmRewards.divisionId, divisionId)
      )
    : and(
        eq(schema.pickEmRewards.seasonId, seasonId),
        eq(schema.pickEmRewards.week, week),
        sql`${schema.pickEmRewards.divisionId} IS NULL`,
        sql`${schema.pickEmRewards.matchId} IS NULL`
      );

  const existingRewards = await db.query.pickEmRewards.findMany({
    where: rewardsFilter,
    with: {
      participant: true,
    },
  });

  for (const reward of existingRewards) {
    // Reverse the coins
    await reverseCoins(
      reward.participant.coachId,
      reward.participant.userId,
      reward.amount
    );

    reversed.push({
      name: reward.participant.name,
      amount: -reward.amount,
      reason: `Reversed: ${reward.reason}`,
    });

    // Delete the reward record
    await db
      .delete(schema.pickEmRewards)
      .where(eq(schema.pickEmRewards.id, reward.id));
  }

  return reversed;
}

/**
 * Calculate scores for a specific week
 */
async function calculateWeekScores(
  seasonId: number,
  week: number,
  divisionId?: number
): Promise<ParticipantScore[]> {
  // Get all matches for this week (optionally filtered by division)
  const matchFilter = divisionId
    ? and(
        eq(schema.matches.seasonId, seasonId),
        eq(schema.matches.week, week),
        eq(schema.matches.divisionId, divisionId)
      )
    : and(
        eq(schema.matches.seasonId, seasonId),
        eq(schema.matches.week, week)
      );

  const weekMatches = await db.query.matches.findMany({
    where: matchFilter,
    columns: { id: true, winnerId: true },
  });

  const matchIds = weekMatches.map((m) => m.id);
  const winnerMap = new Map(weekMatches.map((m) => [m.id, m.winnerId]));

  if (matchIds.length === 0) {
    return [];
  }

  // Get all participants for this season
  const participants = await db.query.pickEmParticipants.findMany({
    where: eq(schema.pickEmParticipants.seasonId, seasonId),
    with: {
      picks: {
        where: sql`${schema.pickEmPicks.matchId} IN (${sql.join(
          matchIds.map((id) => sql`${id}`),
          sql`, `
        )})`,
      },
    },
  });

  // Calculate scores
  const scores: ParticipantScore[] = participants.map((p) => {
    let correct = 0;
    let total = 0;

    for (const pick of p.picks) {
      const winnerId = winnerMap.get(pick.matchId);
      if (winnerId !== null && winnerId !== undefined) {
        total++;
        if (pick.predictedWinnerId === winnerId) {
          correct++;
        }
      }
    }

    return {
      participantId: p.id,
      coachId: p.coachId,
      userId: p.userId,
      name: p.name,
      correct,
      total,
    };
  });

  // Sort by correct desc, then total desc (more picks as tiebreaker for ranking, not prize splitting)
  return scores
    .filter((s) => s.total > 0) // Only include those who made picks
    .sort((a, b) => {
      if (b.correct !== a.correct) return b.correct - a.correct;
      return b.total - a.total;
    });
}

/**
 * Award prizes to top 3 overall for a week
 * Handles ties by splitting prize pools
 */
async function awardOverallPrizes(
  seasonId: number,
  week: number
): Promise<AwardedReward[]> {
  const awarded: AwardedReward[] = [];
  const scores = await calculateWeekScores(seasonId, week);

  if (scores.length === 0) {
    return awarded;
  }

  // Group by score to handle ties
  const scoreGroups: ParticipantScore[][] = [];
  let currentScore = -1;

  for (const participant of scores) {
    if (participant.correct !== currentScore) {
      currentScore = participant.correct;
      scoreGroups.push([participant]);
    } else {
      scoreGroups[scoreGroups.length - 1].push(participant);
    }
  }

  // Award prizes, handling ties
  let prizeIndex = 0;
  for (const group of scoreGroups) {
    if (prizeIndex >= OVERALL_PRIZES.length) break;

    // Calculate total prize pool for this tied group
    const prizesForGroup = OVERALL_PRIZES.slice(
      prizeIndex,
      prizeIndex + group.length
    );
    const totalPrizePool = prizesForGroup.reduce((sum, p) => sum + p, 0);
    const prizePerPerson = Math.floor(totalPrizePool / group.length);

    if (prizePerPerson > 0) {
      for (const participant of group) {
        await awardCoins(participant.coachId, participant.userId, prizePerPerson);

        const reason = `Week ${week} Overall Pick-Ems (${participant.correct}/${participant.total} correct)`;

        // Track the reward
        await db.insert(schema.pickEmRewards).values({
          participantId: participant.participantId,
          seasonId,
          week,
          divisionId: null, // null for overall
          amount: prizePerPerson,
          reason,
        });

        awarded.push({
          name: participant.name,
          amount: prizePerPerson,
          reason,
        });
      }
    }

    prizeIndex += group.length;
  }

  return awarded;
}

/**
 * Award prize to top 1 in a division for a week
 * Handles ties by splitting the prize
 */
async function awardDivisionPrize(
  seasonId: number,
  week: number,
  divisionId: number
): Promise<AwardedReward[]> {
  const awarded: AwardedReward[] = [];
  const scores = await calculateWeekScores(seasonId, week, divisionId);

  if (scores.length === 0) {
    return awarded;
  }

  // Get division name
  const division = await db.query.divisions.findFirst({
    where: eq(schema.divisions.id, divisionId),
    columns: { name: true },
  });
  const divisionName = division?.name || `Division ${divisionId}`;

  // Find all participants tied for first
  const topScore = scores[0].correct;
  const winners = scores.filter((s) => s.correct === topScore);

  // Split prize among tied winners
  const prizePerPerson = Math.floor(DIVISION_PRIZE / winners.length);

  if (prizePerPerson > 0) {
    for (const winner of winners) {
      await awardCoins(winner.coachId, winner.userId, prizePerPerson);

      const reason = `Week ${week} ${divisionName} Pick-Ems (${winner.correct}/${winner.total} correct)`;

      // Track the reward
      await db.insert(schema.pickEmRewards).values({
        participantId: winner.participantId,
        seasonId,
        week,
        divisionId,
        amount: prizePerPerson,
        reason,
      });

      awarded.push({
        name: winner.name,
        amount: prizePerPerson,
        reason,
      });
    }
  }

  return awarded;
}

/**
 * Award coins to a participant (coach or spectator)
 */
async function awardCoins(coachId: number | null, userId: number | null, amount: number): Promise<void> {
  if (amount <= 0) return;

  // Prefer coach account if linked
  if (coachId) {
    const coach = await db.query.coaches.findFirst({
      where: eq(schema.coaches.id, coachId),
      columns: { pboCoin: true },
    });

    if (coach) {
      await db
        .update(schema.coaches)
        .set({ pboCoin: coach.pboCoin + amount })
        .where(eq(schema.coaches.id, coachId));
      return;
    }
  }

  // Fall back to user/spectator account
  if (userId) {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
      columns: { pboCoin: true },
    });

    if (user) {
      await db
        .update(schema.users)
        .set({ pboCoin: user.pboCoin + amount })
        .where(eq(schema.users.id, userId));
    }
  }
}

/**
 * Reverse coins from a participant (coach or spectator)
 */
async function reverseCoins(coachId: number | null, userId: number | null, amount: number): Promise<void> {
  if (amount <= 0) return;

  // Prefer coach account if linked
  if (coachId) {
    const coach = await db.query.coaches.findFirst({
      where: eq(schema.coaches.id, coachId),
      columns: { pboCoin: true },
    });

    if (coach) {
      await db
        .update(schema.coaches)
        .set({ pboCoin: Math.max(0, coach.pboCoin - amount) })
        .where(eq(schema.coaches.id, coachId));
      return;
    }
  }

  // Fall back to user/spectator account
  if (userId) {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
      columns: { pboCoin: true },
    });

    if (user) {
      await db
        .update(schema.users)
        .set({ pboCoin: Math.max(0, user.pboCoin - amount) })
        .where(eq(schema.users.id, userId));
    }
  }
}
