/**
 * Death betting utilities - wagers on whether Pokemon will die or survive
 * Uses historical death rates adjusted by match win probability
 */

import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";
import * as schema from "./schema";
import { calculatePayout } from "./betting";
import { getTimeSyncedRoster } from "./roster-utils";

// House edge for death bets
const HOUSE_EDGE = 0.12;

// Minimum and maximum odds
const MIN_ODDS = 1.10;
const MAX_ODDS = 50.0;

// Baseline for Pokemon with no data
const BASELINE_DEATH_RATE_WIN = 0.25; // Pokemon die ~25% of games their team wins
const BASELINE_DEATH_RATE_LOSS = 0.55; // Pokemon die ~55% of games their team loses
const BASELINE_BROUGHT_RATE = 0.60; // Pokemon brought ~60% of available games
const MIN_SAMPLE_SIZE = 3; // Minimum games to use Pokemon-specific data

export interface PokemonDeathStats {
  pokemonId: number;
  pokemonName: string;
  displayName: string | null;
  spriteUrl: string | null;
  types: string[] | null;
  deathRateInWins: number;
  deathRateInLosses: number;
  broughtRate: number;
  totalGames: number;
  totalWins: number;
  totalLosses: number;
  totalBrought: number;
  totalAvailable: number;
}

export interface DeathBetOdds {
  pokemonId: number;
  pokemonName: string;
  displayName: string | null;
  spriteUrl: string | null;
  types: string[] | null;
  seasonCoachId: number;
  teamName: string;
  teamAbbreviation: string | null;
  expectedDeathRate: number;
  broughtRate: number;
  diesOdds: number;
  survivesOdds: number;
  diesProb: number;
  survivesProb: number;
}

/**
 * Get death statistics for a Pokemon across all matches
 */
export async function getPokemonDeathStats(pokemonId: number): Promise<{
  deathRateInWins: number;
  deathRateInLosses: number;
  broughtRate: number;
  totalGames: number;
  totalWins: number;
  totalLosses: number;
  totalBrought: number;
  totalAvailable: number;
}> {
  // Get stats from matches where this Pokemon was brought
  const broughtStats = await db.all<{
    total_brought: number;
    wins_brought: number;
    deaths_in_wins: number;
    deaths_in_losses: number;
  }>(sql`
    SELECT
      COUNT(*) as total_brought,
      SUM(CASE WHEN m.winner_id = mp.season_coach_id THEN 1 ELSE 0 END) as wins_brought,
      SUM(CASE WHEN m.winner_id = mp.season_coach_id AND mp.deaths >= 1 THEN 1 ELSE 0 END) as deaths_in_wins,
      SUM(CASE WHEN m.winner_id != mp.season_coach_id AND mp.deaths >= 1 THEN 1 ELSE 0 END) as deaths_in_losses
    FROM match_pokemon mp
    JOIN matches m ON mp.match_id = m.id
    WHERE mp.pokemon_id = ${pokemonId}
    AND m.winner_id IS NOT NULL
    AND m.is_forfeit = 0
  `);

  // Get total available games (times Pokemon was on a roster for a completed match)
  const availableStats = await db.all<{
    total_available: number;
  }>(sql`
    SELECT COUNT(DISTINCT m.id) as total_available
    FROM rosters r
    JOIN season_coaches sc ON r.season_coach_id = sc.id
    JOIN matches m ON (m.coach1_season_id = sc.id OR m.coach2_season_id = sc.id)
    WHERE r.pokemon_id = ${pokemonId}
    AND m.winner_id IS NOT NULL
    AND m.is_forfeit = 0
  `);

  const brought = broughtStats[0];
  const available = availableStats[0];

  if (!brought || brought.total_brought === 0) {
    return {
      deathRateInWins: BASELINE_DEATH_RATE_WIN,
      deathRateInLosses: BASELINE_DEATH_RATE_LOSS,
      broughtRate: BASELINE_BROUGHT_RATE,
      totalGames: 0,
      totalWins: 0,
      totalLosses: 0,
      totalBrought: 0,
      totalAvailable: available?.total_available || 0,
    };
  }

  const totalLosses = brought.total_brought - brought.wins_brought;
  const totalAvailable = available?.total_available || brought.total_brought;

  return {
    deathRateInWins: brought.wins_brought > 0
      ? brought.deaths_in_wins / brought.wins_brought
      : BASELINE_DEATH_RATE_WIN,
    deathRateInLosses: totalLosses > 0
      ? brought.deaths_in_losses / totalLosses
      : BASELINE_DEATH_RATE_LOSS,
    broughtRate: totalAvailable > 0
      ? brought.total_brought / totalAvailable
      : BASELINE_BROUGHT_RATE,
    totalGames: brought.total_brought,
    totalWins: brought.wins_brought,
    totalLosses: totalLosses,
    totalBrought: brought.total_brought,
    totalAvailable: totalAvailable,
  };
}

/**
 * Calculate expected death rate for a Pokemon in a specific match
 * Weighted by the match's win probability
 */
export function calculateExpectedDeathRate(
  deathRateInWins: number,
  deathRateInLosses: number,
  totalGames: number,
  matchWinProb: number
): number {
  // Use baseline if insufficient data
  const effectiveWinRate = totalGames >= MIN_SAMPLE_SIZE ? deathRateInWins : BASELINE_DEATH_RATE_WIN;
  const effectiveLossRate = totalGames >= MIN_SAMPLE_SIZE ? deathRateInLosses : BASELINE_DEATH_RATE_LOSS;

  // Weight by match win probability
  return (effectiveWinRate * matchWinProb) + (effectiveLossRate * (1 - matchWinProb));
}

/**
 * Calculate betting odds for dies/survives
 * Assumes Pokemon is brought - not being brought is an unpriced risk for the bettor
 */
export function calculateDeathOdds(
  expectedDeathRate: number,
  broughtRate: number,
  totalGames: number,
  betType: "dies" | "survives"
): { odds: number; probability: number } {
  // Probability of winning each bet type (assuming Pokemon is brought)
  // Note: If not brought, bettor loses - this risk is not priced into odds
  const probDiesWins = expectedDeathRate;
  const probSurvivesWins = 1 - expectedDeathRate;

  const prob = betType === "dies" ? probDiesWins : probSurvivesWins;

  // Avoid division by zero or extreme probabilities
  if (prob < 0.02) {
    return { odds: MAX_ODDS, probability: prob };
  }
  if (prob > 0.95) {
    return { odds: MIN_ODDS, probability: prob };
  }

  // Fair odds with house edge
  const fairOdds = 1 / prob;
  const adjustedOdds = 1 + (fairOdds - 1) * (1 - HOUSE_EDGE);

  return {
    odds: Math.max(MIN_ODDS, Math.min(MAX_ODDS, adjustedOdds)),
    probability: prob,
  };
}

/**
 * Get all death betting odds for a match
 * Returns odds for each Pokemon on both rosters (transaction-aware)
 */
export async function getMatchDeathOdds(
  matchId: number,
  coach1WinProb: number
): Promise<{ coach1Pokemon: DeathBetOdds[]; coach2Pokemon: DeathBetOdds[] }> {
  // Get match info with full roster data
  const match = await db.query.matches.findFirst({
    where: eq(schema.matches.id, matchId),
    with: {
      coach1: {
        with: {
          rosters: {
            with: { pokemon: true },
          },
        },
      },
      coach2: {
        with: {
          rosters: {
            with: { pokemon: true },
          },
        },
      },
    },
  });

  if (!match) {
    throw new Error("Match not found");
  }

  // Fetch transactions for this season to get time-synced rosters
  const seasonTxs = await db.query.transactions.findMany({
    where: eq(schema.transactions.seasonId, match.seasonId),
  });

  // Filter transactions for each coach (include partner P2P trades)
  const coach1Txs = [
    ...seasonTxs.filter((tx) => tx.seasonCoachId === match.coach1SeasonId),
    ...seasonTxs.filter((tx) => tx.type === "P2P_TRADE" && tx.tradingPartnerSeasonCoachId === match.coach1SeasonId),
  ];
  const coach2Txs = [
    ...seasonTxs.filter((tx) => tx.seasonCoachId === match.coach2SeasonId),
    ...seasonTxs.filter((tx) => tx.type === "P2P_TRADE" && tx.tradingPartnerSeasonCoachId === match.coach2SeasonId),
  ];

  // Get time-synced rosters (accounts for transactions)
  const [coach1RosterResult, coach2RosterResult] = await Promise.all([
    getTimeSyncedRoster(
      match.coach1SeasonId,
      match.week,
      match.coach1.rosters as any,
      coach1Txs as any
    ),
    getTimeSyncedRoster(
      match.coach2SeasonId,
      match.week,
      match.coach2.rosters as any,
      coach2Txs as any
    ),
  ]);

  const coach2WinProb = 1 - coach1WinProb;

  // Process each team's roster
  const processRoster = async (
    roster: any[],
    droppedPokemon: any[],
    seasonCoachId: number,
    teamName: string,
    teamAbbreviation: string | null,
    winProb: number
  ): Promise<DeathBetOdds[]> => {
    const results: DeathBetOdds[] = [];

    // Process current roster entries
    for (const entry of roster) {
      const poke = entry.pokemon;
      if (!poke) continue;

      const stats = await getPokemonDeathStats(entry.pokemonId);
      const expectedDeathRate = calculateExpectedDeathRate(
        stats.deathRateInWins,
        stats.deathRateInLosses,
        stats.totalGames,
        winProb
      );

      const dies = calculateDeathOdds(expectedDeathRate, stats.broughtRate, stats.totalGames, "dies");
      const survives = calculateDeathOdds(expectedDeathRate, stats.broughtRate, stats.totalGames, "survives");

      results.push({
        pokemonId: entry.pokemonId,
        pokemonName: poke.name,
        displayName: poke.displayName,
        spriteUrl: poke.spriteUrl,
        types: poke.types,
        seasonCoachId,
        teamName,
        teamAbbreviation,
        expectedDeathRate,
        broughtRate: stats.broughtRate,
        diesOdds: dies.odds,
        survivesOdds: survives.odds,
        diesProb: dies.probability,
        survivesProb: survives.probability,
      });
    }

    // Also include Pokemon that were dropped after this match week
    for (const poke of droppedPokemon) {
      const stats = await getPokemonDeathStats(poke.id);
      const expectedDeathRate = calculateExpectedDeathRate(
        stats.deathRateInWins,
        stats.deathRateInLosses,
        stats.totalGames,
        winProb
      );

      const dies = calculateDeathOdds(expectedDeathRate, stats.broughtRate, stats.totalGames, "dies");
      const survives = calculateDeathOdds(expectedDeathRate, stats.broughtRate, stats.totalGames, "survives");

      results.push({
        pokemonId: poke.id,
        pokemonName: poke.name,
        displayName: poke.displayName,
        spriteUrl: poke.spriteUrl,
        types: poke.types,
        seasonCoachId,
        teamName,
        teamAbbreviation,
        expectedDeathRate,
        broughtRate: stats.broughtRate,
        diesOdds: dies.odds,
        survivesOdds: survives.odds,
        diesProb: dies.probability,
        survivesProb: survives.probability,
      });
    }

    // Sort by expected death rate descending (most likely to die first)
    return results.sort((a, b) => b.expectedDeathRate - a.expectedDeathRate);
  };

  const [coach1Pokemon, coach2Pokemon] = await Promise.all([
    processRoster(
      coach1RosterResult.filteredRosters,
      coach1RosterResult.droppedPokemonDetails,
      match.coach1SeasonId,
      match.coach1.teamName,
      match.coach1.teamAbbreviation,
      coach1WinProb
    ),
    processRoster(
      coach2RosterResult.filteredRosters,
      coach2RosterResult.droppedPokemonDetails,
      match.coach2SeasonId,
      match.coach2.teamName,
      match.coach2.teamAbbreviation,
      coach2WinProb
    ),
  ]);

  return { coach1Pokemon, coach2Pokemon };
}

/**
 * Resolve all death bets for a completed match
 */
export async function resolveDeathBetsForMatch(
  matchId: number
): Promise<{ resolved: number; totalPaidOut: number; totalCollected: number }> {
  // Get match with Pokemon data
  const match = await db.query.matches.findFirst({
    where: eq(schema.matches.id, matchId),
    columns: { startedAt: true },
    with: {
      matchPokemon: true,
    },
  });

  if (!match) {
    throw new Error("Match not found");
  }

  const matchStartedAt = match.startedAt ? new Date(match.startedAt) : null;

  // Get pending death bets
  const pendingBets = await db.query.deathBets.findMany({
    where: and(
      eq(schema.deathBets.matchId, matchId),
      eq(schema.deathBets.status, "pending")
    ),
  });

  let totalPaidOut = 0;
  let totalCollected = 0;

  for (const bet of pendingBets) {
    // Find the Pokemon in this match
    const pokemonMatch = match.matchPokemon.find(
      mp => mp.pokemonId === bet.pokemonId && mp.seasonCoachId === bet.seasonCoachId
    );

    // Check if Pokemon was brought
    const wasBrought = pokemonMatch !== undefined;
    // deaths field is a counter, Pokemon died if deaths >= 1
    const died = pokemonMatch ? (pokemonMatch.deaths ?? 0) >= 1 : false;
    const actualDied = wasBrought ? (died ? 1 : 0) : null;

    // Check for cheating (bet placed after match started)
    const betCreatedAt = bet.createdAt ? new Date(bet.createdAt) : null;
    const isCheating = matchStartedAt && betCreatedAt && betCreatedAt > matchStartedAt;

    // Determine win condition
    // Not brought = loss for both bet types
    let isWin = false;
    if (!isCheating && wasBrought) {
      if (bet.betType === "dies") {
        isWin = died;
      } else {
        isWin = !died;
      }
    }

    const isCoachBet = bet.coachId !== null;

    if (isWin) {
      const payout = calculatePayout(bet.amount, bet.odds);
      totalPaidOut += payout;

      await db
        .update(schema.deathBets)
        .set({
          status: "won",
          payout,
          actualDied: actualDied,
          wasBrought: wasBrought ? 1 : 0,
          resolvedAt: new Date().toISOString(),
        })
        .where(eq(schema.deathBets.id, bet.id));

      // Credit winnings
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
      totalCollected += bet.amount;

      await db
        .update(schema.deathBets)
        .set({
          status: "lost",
          payout: 0,
          actualDied: actualDied,
          wasBrought: wasBrought ? 1 : 0,
          resolvedAt: new Date().toISOString(),
        })
        .where(eq(schema.deathBets.id, bet.id));

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
  };
}

/**
 * Refund all death bets for a cancelled/forfeited match
 */
export async function refundDeathBetsForMatch(matchId: number): Promise<number> {
  const pendingBets = await db.query.deathBets.findMany({
    where: and(
      eq(schema.deathBets.matchId, matchId),
      eq(schema.deathBets.status, "pending")
    ),
  });

  for (const bet of pendingBets) {
    await db
      .update(schema.deathBets)
      .set({
        status: "refunded",
        payout: bet.amount,
        resolvedAt: new Date().toISOString(),
      })
      .where(eq(schema.deathBets.id, bet.id));
  }

  return pendingBets.length;
}
