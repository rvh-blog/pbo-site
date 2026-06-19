/**
 * Bet resolution utilities for undoing and re-resolving bets
 * Used when match results are edited after initial resolution
 */

import { db } from "./db";
import { eq, and, or } from "drizzle-orm";
import * as schema from "./schema";
import { resolveBetsForMatch } from "./betting";
import { resolveKillBetsForMatch } from "./kill-betting";
import { resolveDeathBetsForMatch } from "./death-betting";

/**
 * Undo all winner bet resolutions for a match
 * Reverses coin changes and sets bets back to pending
 */
export async function undoWinnerBetsForMatch(matchId: number): Promise<number> {
  // Get all resolved bets (won or lost) for this match
  const resolvedBets = await db.query.bets.findMany({
    where: and(
      eq(schema.bets.matchId, matchId),
      or(eq(schema.bets.status, "won"), eq(schema.bets.status, "lost"))
    ),
  });

  for (const bet of resolvedBets) {
    const isCoachBet = bet.coachId !== null;

    if (bet.status === "won") {
      // Undo win: subtract the profit (payout - amount) from balance
      const profit = (bet.payout || 0) - bet.amount;

      if (isCoachBet && bet.coachId) {
        const coach = await db.query.coaches.findFirst({
          where: eq(schema.coaches.id, bet.coachId),
          columns: { pboCoin: true },
        });
        if (coach) {
          await db
            .update(schema.coaches)
            .set({ pboCoin: Math.max(0, coach.pboCoin - profit) })
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
            .set({ pboCoin: Math.max(0, user.pboCoin - profit) })
            .where(eq(schema.users.id, bet.userId));
        }
      }
    } else if (bet.status === "lost") {
      // Undo loss: add the wagered amount back to balance
      if (isCoachBet && bet.coachId) {
        const coach = await db.query.coaches.findFirst({
          where: eq(schema.coaches.id, bet.coachId),
          columns: { pboCoin: true },
        });
        if (coach) {
          await db
            .update(schema.coaches)
            .set({ pboCoin: coach.pboCoin + bet.amount })
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
            .set({ pboCoin: user.pboCoin + bet.amount })
            .where(eq(schema.users.id, bet.userId));
        }
      }
    }

    // Set bet back to pending
    await db
      .update(schema.bets)
      .set({
        status: "pending",
        payout: null,
        resolvedAt: null,
      })
      .where(eq(schema.bets.id, bet.id));
  }

  return resolvedBets.length;
}

/**
 * Undo all kill bet resolutions for a match
 * Reverses coin changes and sets bets back to pending
 */
export async function undoKillBetsForMatch(matchId: number): Promise<number> {
  const resolvedBets = await db.query.killBets.findMany({
    where: and(
      eq(schema.killBets.matchId, matchId),
      or(eq(schema.killBets.status, "won"), eq(schema.killBets.status, "lost"))
    ),
  });

  for (const bet of resolvedBets) {
    const isCoachBet = bet.coachId !== null;

    if (bet.status === "won") {
      const profit = (bet.payout || 0) - bet.amount;

      if (isCoachBet && bet.coachId) {
        const coach = await db.query.coaches.findFirst({
          where: eq(schema.coaches.id, bet.coachId),
          columns: { pboCoin: true },
        });
        if (coach) {
          await db
            .update(schema.coaches)
            .set({ pboCoin: Math.max(0, coach.pboCoin - profit) })
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
            .set({ pboCoin: Math.max(0, user.pboCoin - profit) })
            .where(eq(schema.users.id, bet.userId));
        }
      }
    } else if (bet.status === "lost") {
      if (isCoachBet && bet.coachId) {
        const coach = await db.query.coaches.findFirst({
          where: eq(schema.coaches.id, bet.coachId),
          columns: { pboCoin: true },
        });
        if (coach) {
          await db
            .update(schema.coaches)
            .set({ pboCoin: coach.pboCoin + bet.amount })
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
            .set({ pboCoin: user.pboCoin + bet.amount })
            .where(eq(schema.users.id, bet.userId));
        }
      }
    }

    // Set bet back to pending, clear actual kills
    await db
      .update(schema.killBets)
      .set({
        status: "pending",
        payout: null,
        resolvedAt: null,
        actualKills: null,
      })
      .where(eq(schema.killBets.id, bet.id));
  }

  return resolvedBets.length;
}

/**
 * Undo all death bet resolutions for a match
 * Reverses coin changes and sets bets back to pending
 */
export async function undoDeathBetsForMatch(matchId: number): Promise<number> {
  const resolvedBets = await db.query.deathBets.findMany({
    where: and(
      eq(schema.deathBets.matchId, matchId),
      or(eq(schema.deathBets.status, "won"), eq(schema.deathBets.status, "lost"))
    ),
  });

  for (const bet of resolvedBets) {
    const isCoachBet = bet.coachId !== null;

    if (bet.status === "won") {
      const profit = (bet.payout || 0) - bet.amount;

      if (isCoachBet && bet.coachId) {
        const coach = await db.query.coaches.findFirst({
          where: eq(schema.coaches.id, bet.coachId),
          columns: { pboCoin: true },
        });
        if (coach) {
          await db
            .update(schema.coaches)
            .set({ pboCoin: Math.max(0, coach.pboCoin - profit) })
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
            .set({ pboCoin: Math.max(0, user.pboCoin - profit) })
            .where(eq(schema.users.id, bet.userId));
        }
      }
    } else if (bet.status === "lost") {
      if (isCoachBet && bet.coachId) {
        const coach = await db.query.coaches.findFirst({
          where: eq(schema.coaches.id, bet.coachId),
          columns: { pboCoin: true },
        });
        if (coach) {
          await db
            .update(schema.coaches)
            .set({ pboCoin: coach.pboCoin + bet.amount })
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
            .set({ pboCoin: user.pboCoin + bet.amount })
            .where(eq(schema.users.id, bet.userId));
        }
      }
    }

    // Set bet back to pending, clear actual died/wasBrought
    await db
      .update(schema.deathBets)
      .set({
        status: "pending",
        payout: null,
        resolvedAt: null,
        actualDied: null,
        wasBrought: null,
      })
      .where(eq(schema.deathBets.id, bet.id));
  }

  return resolvedBets.length;
}

/**
 * Re-resolve all bets for a match after data correction
 * 1. Undoes all existing resolutions (reverses coin changes)
 * 2. Re-resolves with current match data
 */
export async function reResolveBetsForMatch(
  matchId: number,
  winnerId: number | null
): Promise<{
  undone: { winner: number; kill: number; death: number };
  resolved: { winner: number; kill: number; death: number };
}> {
  // Step 1: Undo all existing resolutions
  const undoneWinner = await undoWinnerBetsForMatch(matchId);
  const undoneKill = await undoKillBetsForMatch(matchId);
  const undoneDeath = await undoDeathBetsForMatch(matchId);

  console.log(`[Bet Re-Resolution] Undid ${undoneWinner} winner, ${undoneKill} kill, ${undoneDeath} death bets for match ${matchId}`);

  // Step 2: Re-resolve if there's a winner
  let resolvedWinner = 0;
  let resolvedKill = 0;
  let resolvedDeath = 0;

  if (winnerId !== null) {
    const winnerResult = await resolveBetsForMatch(matchId, winnerId);
    resolvedWinner = winnerResult.resolved;

    const killResult = await resolveKillBetsForMatch(matchId);
    resolvedKill = killResult.resolved;

    const deathResult = await resolveDeathBetsForMatch(matchId);
    resolvedDeath = deathResult.resolved;

    console.log(`[Bet Re-Resolution] Resolved ${resolvedWinner} winner, ${resolvedKill} kill, ${resolvedDeath} death bets for match ${matchId}`);
  }

  return {
    undone: { winner: undoneWinner, kill: undoneKill, death: undoneDeath },
    resolved: { winner: resolvedWinner, kill: resolvedKill, death: resolvedDeath },
  };
}
