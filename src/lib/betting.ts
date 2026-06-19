/**
 * Betting utilities for PBOcoin wagering system
 */

// House edge percentage (e.g., 0.10 = 10% house edge)
const HOUSE_EDGE = 0.10;

// Minimum and maximum odds to prevent extreme payouts
const MIN_ODDS = 1.05; // At minimum, you get 5% profit
const MAX_ODDS = 10.0; // At maximum, you get 10x your bet

/**
 * Calculate win probability from ELO ratings
 * Formula: P(A wins) = 1 / (1 + 10^((ELO_B - ELO_A) / 400))
 */
export function calculateWinProbability(playerElo: number, opponentElo: number): number {
  const exponent = (opponentElo - playerElo) / 400;
  return 1 / (1 + Math.pow(10, exponent));
}

/**
 * Calculate betting odds for a player with house edge applied
 * Returns decimal odds (e.g., 1.5 means bet 100, win 150 total)
 */
export function calculateOdds(playerElo: number, opponentElo: number): number {
  const winProb = calculateWinProbability(playerElo, opponentElo);

  // Fair odds would be 1 / winProb
  // Apply house edge by reducing the payout
  const fairOdds = 1 / winProb;
  const adjustedOdds = 1 + (fairOdds - 1) * (1 - HOUSE_EDGE);

  // Clamp to reasonable range
  return Math.max(MIN_ODDS, Math.min(MAX_ODDS, adjustedOdds));
}

/**
 * Calculate both sides' odds for a match
 */
export function calculateMatchOdds(
  coach1Elo: number,
  coach2Elo: number
): { coach1Odds: number; coach2Odds: number; coach1WinProb: number; coach2WinProb: number } {
  const coach1WinProb = calculateWinProbability(coach1Elo, coach2Elo);
  const coach2WinProb = 1 - coach1WinProb;

  return {
    coach1Odds: calculateOdds(coach1Elo, coach2Elo),
    coach2Odds: calculateOdds(coach2Elo, coach1Elo),
    coach1WinProb,
    coach2WinProb,
  };
}

/**
 * Calculate potential payout for a bet
 * @param amount - The amount wagered
 * @param odds - The decimal odds
 * @returns Total payout including original stake
 */
export function calculatePayout(amount: number, odds: number): number {
  return Math.floor(amount * odds);
}

/**
 * Calculate profit from a winning bet
 */
export function calculateProfit(amount: number, odds: number): number {
  return calculatePayout(amount, odds) - amount;
}

/**
 * Format odds for display (e.g., 1.5 -> "+50%" or 2.0 -> "+100%")
 */
export function formatOddsAsPercentage(odds: number): string {
  const percentage = Math.round((odds - 1) * 100);
  return `+${percentage}%`;
}

/**
 * Format odds as multiplier (e.g., 1.5 -> "1.5x")
 */
export function formatOddsAsMultiplier(odds: number): string {
  return `${odds.toFixed(2)}x`;
}

/**
 * Format win probability as percentage
 */
export function formatWinProbability(prob: number): string {
  return `${Math.round(prob * 100)}%`;
}

// Database operations for bet resolution
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import * as schema from "./schema";

/**
 * Resolve all bets for a completed match
 * Bets placed after the match started are flagged as cheating and automatically lose
 * @param matchId - The match that was completed
 * @param winnerId - The season_coach_id of the winner
 * @returns Summary of resolved bets
 */
export async function resolveBetsForMatch(
  matchId: number,
  winnerId: number
): Promise<{ resolved: number; totalPaidOut: number; totalCollected: number; cheaters: number }> {
  // Get the match to check startedAt timestamp
  const match = await db.query.matches.findFirst({
    where: eq(schema.matches.id, matchId),
    columns: { startedAt: true },
  });
  const matchStartedAt = match?.startedAt ? new Date(match.startedAt) : null;

  // Get all pending bets for this match
  const pendingBets = await db.query.bets.findMany({
    where: and(
      eq(schema.bets.matchId, matchId),
      eq(schema.bets.status, "pending")
    ),
  });

  let totalPaidOut = 0;
  let totalCollected = 0;
  let cheaters = 0;

  for (const bet of pendingBets) {
    // Check for cheating: bet placed after match started
    const betCreatedAt = bet.createdAt ? new Date(bet.createdAt) : null;
    const isCheating = matchStartedAt && betCreatedAt && betCreatedAt > matchStartedAt;

    if (isCheating) {
      cheaters++;
      // Cheater loses their bet regardless of prediction
      console.log(`[CHEATING DETECTED] Bet ${bet.id} placed at ${bet.createdAt} after match started at ${match?.startedAt}`);
    }

    // Win only if predicted correctly AND didn't cheat
    const isWin = bet.predictedWinnerId === winnerId && !isCheating;
    const isCoachBet = bet.coachId !== null;

    if (isWin) {
      // Winner: calculate payout and credit their account
      const payout = calculatePayout(bet.amount, bet.odds);
      totalPaidOut += payout;

      // Update bet status
      await db
        .update(schema.bets)
        .set({
          status: "won",
          payout,
          resolvedAt: new Date().toISOString(),
        })
        .where(eq(schema.bets.id, bet.id));

      // Credit winnings (payout includes original stake, so we add profit)
      const profit = payout - bet.amount;

      if (isCoachBet && bet.coachId) {
        const coach = await db.query.coaches.findFirst({
          where: eq(schema.coaches.id, bet.coachId),
          columns: { pboCoin: true },
        });
        if (coach) {
          await db
            .update(schema.coaches)
            .set({ pboCoin: coach.pboCoin + profit })
            .where(eq(schema.coaches.id, bet.coachId));
        }
      } else if (bet.userId) {
        const user = await db.query.users.findFirst({
          where: eq(schema.users.id, bet.userId),
          columns: { pboCoin: true },
        });
        if (user) {
          await db
            .update(schema.users)
            .set({ pboCoin: user.pboCoin + profit })
            .where(eq(schema.users.id, bet.userId));
        }
      }
    } else {
      // Loser: deduct bet amount from their balance
      totalCollected += bet.amount;

      // Update bet status
      await db
        .update(schema.bets)
        .set({
          status: "lost",
          payout: 0,
          resolvedAt: new Date().toISOString(),
        })
        .where(eq(schema.bets.id, bet.id));

      // Deduct from balance
      if (isCoachBet && bet.coachId) {
        const coach = await db.query.coaches.findFirst({
          where: eq(schema.coaches.id, bet.coachId),
          columns: { pboCoin: true },
        });
        if (coach) {
          await db
            .update(schema.coaches)
            .set({ pboCoin: Math.max(0, coach.pboCoin - bet.amount) })
            .where(eq(schema.coaches.id, bet.coachId));
        }
      } else if (bet.userId) {
        const user = await db.query.users.findFirst({
          where: eq(schema.users.id, bet.userId),
          columns: { pboCoin: true },
        });
        if (user) {
          await db
            .update(schema.users)
            .set({ pboCoin: Math.max(0, user.pboCoin - bet.amount) })
            .where(eq(schema.users.id, bet.userId));
        }
      }
    }
  }

  return {
    resolved: pendingBets.length,
    totalPaidOut,
    totalCollected,
    cheaters,
  };
}

const COINS_PER_MATCH = 5;

/**
 * Award coins to players for completing a match
 * @param matchId - The completed match
 * @param winnerId - The season_coach_id of the winner
 * @param loserId - The season_coach_id of the loser
 * @param isForfeit - Whether the match was a forfeit (loser doesn't get coins)
 */
export async function awardMatchCoins(
  winnerId: number,
  loserId: number,
  isForfeit: boolean
): Promise<void> {
  // Get the coach IDs from season_coaches
  const [winnerSC, loserSC] = await Promise.all([
    db.query.seasonCoaches.findFirst({
      where: eq(schema.seasonCoaches.id, winnerId),
      columns: { coachId: true },
    }),
    db.query.seasonCoaches.findFirst({
      where: eq(schema.seasonCoaches.id, loserId),
      columns: { coachId: true },
    }),
  ]);

  // Award winner
  if (winnerSC) {
    const winnerCoach = await db.query.coaches.findFirst({
      where: eq(schema.coaches.id, winnerSC.coachId),
      columns: { pboCoin: true },
    });
    if (winnerCoach) {
      await db
        .update(schema.coaches)
        .set({ pboCoin: winnerCoach.pboCoin + COINS_PER_MATCH })
        .where(eq(schema.coaches.id, winnerSC.coachId));
    }
  }

  // Award loser only if not a forfeit
  if (!isForfeit && loserSC) {
    const loserCoach = await db.query.coaches.findFirst({
      where: eq(schema.coaches.id, loserSC.coachId),
      columns: { pboCoin: true },
    });
    if (loserCoach) {
      await db
        .update(schema.coaches)
        .set({ pboCoin: loserCoach.pboCoin + COINS_PER_MATCH })
        .where(eq(schema.coaches.id, loserSC.coachId));
    }
  }
}

/**
 * Refund all bets for a cancelled/forfeited match
 */
export async function refundBetsForMatch(matchId: number): Promise<number> {
  const pendingBets = await db.query.bets.findMany({
    where: and(
      eq(schema.bets.matchId, matchId),
      eq(schema.bets.status, "pending")
    ),
  });

  for (const bet of pendingBets) {
    await db
      .update(schema.bets)
      .set({
        status: "refunded",
        payout: bet.amount, // Return original stake
        resolvedAt: new Date().toISOString(),
      })
      .where(eq(schema.bets.id, bet.id));

    // No balance change needed since we never deducted pending bets
  }

  return pendingBets.length;
}
