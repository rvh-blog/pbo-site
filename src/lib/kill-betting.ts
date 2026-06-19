/**
 * Kill betting utilities - wagers on Pokemon kill counts
 * Uses Negative Binomial distribution for overdispersed count data
 */

import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";
import * as schema from "./schema";
import { calculatePayout } from "./betting";
import { getTimeSyncedRoster } from "./roster-utils";

// House edge for kill bets (slightly higher than match bets due to variance)
const HOUSE_EDGE = 0.12;

// Minimum and maximum odds
const MIN_ODDS = 1.10;
const MAX_ODDS = 500.0;

// Baseline for Pokemon with no data (25th percentile)
const BASELINE_KILLS_WIN = 0.4;
const BASELINE_KILLS_LOSS = 0.2;
const MIN_SAMPLE_SIZE = 3; // Minimum games to use Pokemon-specific data

// Overdispersion factor (variance / mean ratio from our data analysis)
const OVERDISPERSION_FACTOR = 1.3;

/**
 * Calculate probability using Negative Binomial distribution
 * P(X >= k) where X ~ NegBin(r, p)
 *
 * @param k - The threshold (e.g., 3 for "3+ kills")
 * @param mean - Expected value (mu)
 * @returns Probability of getting at least k
 */
function negativeBinomialProbAtLeast(k: number, mean: number): number {
  if (mean <= 0) return k === 0 ? 1 : 0;

  // For Negative Binomial: variance = mean + mean²/r
  // Rearranging: r = mean² / (variance - mean)
  // With our overdispersion factor: variance = mean * OVERDISPERSION_FACTOR
  const variance = mean * OVERDISPERSION_FACTOR;

  // Ensure variance > mean (required for negative binomial)
  if (variance <= mean) {
    // Fall back to Poisson for non-overdispersed case
    return poissonProbAtLeast(k, mean);
  }

  const r = (mean * mean) / (variance - mean);
  const p = r / (r + mean);

  // P(X >= k) = 1 - P(X < k) = 1 - sum(P(X = i) for i in 0..k-1)
  let cumProb = 0;
  for (let i = 0; i < k; i++) {
    cumProb += negativeBinomialPMF(i, r, p);
  }

  return Math.max(0, Math.min(1, 1 - cumProb));
}

/**
 * Negative Binomial probability mass function
 * P(X = k) where X ~ NegBin(r, p)
 */
function negativeBinomialPMF(k: number, r: number, p: number): number {
  if (k < 0) return 0;

  // P(X = k) = C(k + r - 1, k) * p^r * (1-p)^k
  // Using log to avoid overflow
  const logProb = logGamma(k + r) - logGamma(k + 1) - logGamma(r)
                  + r * Math.log(p) + k * Math.log(1 - p);

  return Math.exp(logProb);
}

/**
 * Poisson probability for fallback
 */
function poissonProbAtLeast(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;

  let cumProb = 0;
  for (let i = 0; i < k; i++) {
    cumProb += poissonPMF(i, lambda);
  }

  return Math.max(0, Math.min(1, 1 - cumProb));
}

function poissonPMF(k: number, lambda: number): number {
  if (k < 0) return 0;
  return Math.exp(-lambda + k * Math.log(lambda) - logGamma(k + 1));
}

/**
 * Log gamma function using Lanczos approximation
 */
function logGamma(z: number): number {
  if (z <= 0) return Infinity;

  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ];

  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }

  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }

  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

export interface PokemonKillStats {
  pokemonId: number;
  pokemonName: string;
  displayName: string | null;
  spriteUrl: string | null;
  types: string[] | null;
  avgKillsWin: number;
  avgKillsLoss: number;
  totalGames: number;
  totalWins: number;
  totalLosses: number;
  isOnRoster: boolean;
}

export interface KillBetOdds {
  pokemonId: number;
  pokemonName: string;
  displayName: string | null;
  spriteUrl: string | null;
  types: string[] | null;
  seasonCoachId: number;
  teamName: string;
  teamAbbreviation: string | null;
  expectedKills: number;
  thresholds: {
    threshold: number;
    overOdds: number;
    underOdds: number;
    overProb: number;
    underProb: number;
  }[];
}

/**
 * Get kill statistics for a Pokemon across all matches
 */
export async function getPokemonKillStats(pokemonId: number): Promise<{
  avgKillsWin: number;
  avgKillsLoss: number;
  totalGames: number;
  totalWins: number;
  totalLosses: number;
}> {
  const stats = await db.all<{
    total_games: number;
    total_wins: number;
    total_kills_win: number;
    total_kills_loss: number;
  }>(sql`
    SELECT
      COUNT(*) as total_games,
      SUM(CASE WHEN m.winner_id = mp.season_coach_id THEN 1 ELSE 0 END) as total_wins,
      SUM(CASE WHEN m.winner_id = mp.season_coach_id THEN mp.kills ELSE 0 END) as total_kills_win,
      SUM(CASE WHEN m.winner_id != mp.season_coach_id THEN mp.kills ELSE 0 END) as total_kills_loss
    FROM match_pokemon mp
    JOIN matches m ON mp.match_id = m.id
    WHERE mp.pokemon_id = ${pokemonId}
    AND m.winner_id IS NOT NULL
    AND m.is_forfeit = 0
  `);

  const row = stats[0];
  if (!row || row.total_games === 0) {
    return {
      avgKillsWin: BASELINE_KILLS_WIN,
      avgKillsLoss: BASELINE_KILLS_LOSS,
      totalGames: 0,
      totalWins: 0,
      totalLosses: 0,
    };
  }

  const totalLosses = row.total_games - row.total_wins;

  return {
    avgKillsWin: row.total_wins > 0 ? row.total_kills_win / row.total_wins : BASELINE_KILLS_WIN,
    avgKillsLoss: totalLosses > 0 ? row.total_kills_loss / totalLosses : BASELINE_KILLS_LOSS,
    totalGames: row.total_games,
    totalWins: row.total_wins,
    totalLosses: totalLosses,
  };
}

/**
 * Calculate expected kills for a Pokemon in a specific match
 * Weighted by the match's win probability
 */
export function calculateExpectedKills(
  avgKillsWin: number,
  avgKillsLoss: number,
  totalGames: number,
  matchWinProb: number
): number {
  // Use baseline if insufficient data
  const effectiveWinKills = totalGames >= MIN_SAMPLE_SIZE ? avgKillsWin : BASELINE_KILLS_WIN;
  const effectiveLossKills = totalGames >= MIN_SAMPLE_SIZE ? avgKillsLoss : BASELINE_KILLS_LOSS;

  // Weight by match win probability
  return (effectiveWinKills * matchWinProb) + (effectiveLossKills * (1 - matchWinProb));
}

/**
 * Calculate betting odds for a kill threshold
 */
export function calculateKillOdds(
  expectedKills: number,
  threshold: number,
  betType: "over" | "under"
): { odds: number; probability: number } {
  const probOver = negativeBinomialProbAtLeast(threshold, expectedKills);
  const probUnder = 1 - probOver;

  const prob = betType === "over" ? probOver : probUnder;

  // Avoid division by zero or very small probabilities
  if (prob < 0.01) {
    return { odds: MAX_ODDS, probability: prob };
  }
  if (prob > 0.99) {
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
 * Get all kill betting odds for a match
 * Returns odds for each Pokemon on both rosters (transaction-aware)
 */
export async function getMatchKillOdds(
  matchId: number,
  coach1WinProb: number
): Promise<{ coach1Pokemon: KillBetOdds[]; coach2Pokemon: KillBetOdds[] }> {
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
  ): Promise<KillBetOdds[]> => {
    const results: KillBetOdds[] = [];

    // Process current roster entries
    for (const entry of roster) {
      const poke = entry.pokemon;
      if (!poke) continue;

      const stats = await getPokemonKillStats(entry.pokemonId);
      const expectedKills = calculateExpectedKills(
        stats.avgKillsWin,
        stats.avgKillsLoss,
        stats.totalGames,
        winProb
      );

      // Calculate odds for thresholds 1-6
      const thresholds = [1, 2, 3, 4, 5, 6].map(threshold => {
        const over = calculateKillOdds(expectedKills, threshold, "over");
        const under = calculateKillOdds(expectedKills, threshold, "under");

        return {
          threshold,
          overOdds: over.odds,
          underOdds: under.odds,
          overProb: over.probability,
          underProb: under.probability,
        };
      });

      results.push({
        pokemonId: entry.pokemonId,
        pokemonName: poke.name,
        displayName: poke.displayName,
        spriteUrl: poke.spriteUrl,
        types: poke.types,
        seasonCoachId,
        teamName,
        teamAbbreviation,
        expectedKills,
        thresholds,
      });
    }

    // Also include Pokemon that were dropped after this match week
    // (they were still on roster at match time)
    for (const poke of droppedPokemon) {
      const stats = await getPokemonKillStats(poke.id);
      const expectedKills = calculateExpectedKills(
        stats.avgKillsWin,
        stats.avgKillsLoss,
        stats.totalGames,
        winProb
      );

      const thresholds = [1, 2, 3, 4, 5, 6].map(threshold => {
        const over = calculateKillOdds(expectedKills, threshold, "over");
        const under = calculateKillOdds(expectedKills, threshold, "under");

        return {
          threshold,
          overOdds: over.odds,
          underOdds: under.odds,
          overProb: over.probability,
          underProb: under.probability,
        };
      });

      results.push({
        pokemonId: poke.id,
        pokemonName: poke.name,
        displayName: poke.displayName,
        spriteUrl: poke.spriteUrl,
        types: poke.types,
        seasonCoachId,
        teamName,
        teamAbbreviation,
        expectedKills,
        thresholds,
      });
    }

    // Sort by expected kills descending
    return results.sort((a, b) => b.expectedKills - a.expectedKills);
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
 * Resolve all kill bets for a completed match
 */
export async function resolveKillBetsForMatch(
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

  // Get pending kill bets
  const pendingBets = await db.query.killBets.findMany({
    where: and(
      eq(schema.killBets.matchId, matchId),
      eq(schema.killBets.status, "pending")
    ),
  });

  let totalPaidOut = 0;
  let totalCollected = 0;

  for (const bet of pendingBets) {
    // Find the Pokemon's actual kills in this match
    const pokemonMatch = match.matchPokemon.find(
      mp => mp.pokemonId === bet.pokemonId && mp.seasonCoachId === bet.seasonCoachId
    );

    // If Pokemon wasn't brought, bet loses (they got 0 kills)
    const actualKills = pokemonMatch?.kills ?? 0;

    // Check for cheating
    const betCreatedAt = bet.createdAt ? new Date(bet.createdAt) : null;
    const isCheating = matchStartedAt && betCreatedAt && betCreatedAt > matchStartedAt;

    // Determine win condition
    let isWin = false;
    if (!isCheating) {
      if (bet.betType === "over") {
        isWin = actualKills >= bet.killThreshold;
      } else {
        isWin = actualKills < bet.killThreshold;
      }
    }

    const isCoachBet = bet.coachId !== null;

    if (isWin) {
      const payout = calculatePayout(bet.amount, bet.odds);
      totalPaidOut += payout;

      await db
        .update(schema.killBets)
        .set({
          status: "won",
          payout,
          actualKills,
          resolvedAt: new Date().toISOString(),
        })
        .where(eq(schema.killBets.id, bet.id));

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
        .update(schema.killBets)
        .set({
          status: "lost",
          payout: 0,
          actualKills,
          resolvedAt: new Date().toISOString(),
        })
        .where(eq(schema.killBets.id, bet.id));

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
 * Refund all kill bets for a cancelled/forfeited match
 */
export async function refundKillBetsForMatch(matchId: number): Promise<number> {
  const pendingBets = await db.query.killBets.findMany({
    where: and(
      eq(schema.killBets.matchId, matchId),
      eq(schema.killBets.status, "pending")
    ),
  });

  for (const bet of pendingBets) {
    await db
      .update(schema.killBets)
      .set({
        status: "refunded",
        payout: bet.amount,
        resolvedAt: new Date().toISOString(),
      })
      .where(eq(schema.killBets.id, bet.id));
  }

  return pendingBets.length;
}
