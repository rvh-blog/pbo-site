import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, and, desc, or, sql } from "drizzle-orm";
import * as schema from "@/lib/schema";
import { calculateMatchOdds } from "@/lib/betting";
import { calculateExpectedKills, calculateKillOdds, getPokemonKillStats } from "@/lib/kill-betting";
import { getSession } from "@/lib/session";
import { getTimeSyncedRoster } from "@/lib/roster-utils";

/**
 * GET /api/kill-bets?matchId=123
 * Get user's kill bets for a match (or all pending if no matchId)
 */
export async function GET(request: NextRequest) {
  const sessionUser = await getSession();

  if (!sessionUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Get full session data for balance info
  const session = sessionUser.type === "coach"
    ? { coachId: sessionUser.id, userId: null, coach: await db.query.coaches.findFirst({ where: eq(schema.coaches.id, sessionUser.id) }), user: null }
    : { coachId: null, userId: sessionUser.id, coach: null, user: await db.query.users.findFirst({ where: eq(schema.users.id, sessionUser.id) }) };

  const searchParams = request.nextUrl.searchParams;
  const matchIdParam = searchParams.get("matchId");

  try {
    let bets;

    if (session.coachId) {
      // Coach bets
      if (matchIdParam) {
        bets = await db.query.killBets.findMany({
          where: and(
            eq(schema.killBets.coachId, session.coachId),
            eq(schema.killBets.matchId, parseInt(matchIdParam, 10))
          ),
          orderBy: desc(schema.killBets.createdAt),
          with: {
            pokemon: {
              columns: { name: true, displayName: true, spriteUrl: true },
            },
          },
        });
      } else {
        bets = await db.query.killBets.findMany({
          where: eq(schema.killBets.coachId, session.coachId),
          orderBy: desc(schema.killBets.createdAt),
          with: {
            pokemon: {
              columns: { name: true, displayName: true, spriteUrl: true },
            },
          },
        });
      }
    } else if (session.userId) {
      // Spectator bets
      if (matchIdParam) {
        bets = await db.query.killBets.findMany({
          where: and(
            eq(schema.killBets.userId, session.userId),
            eq(schema.killBets.matchId, parseInt(matchIdParam, 10))
          ),
          orderBy: desc(schema.killBets.createdAt),
          with: {
            pokemon: {
              columns: { name: true, displayName: true, spriteUrl: true },
            },
          },
        });
      } else {
        bets = await db.query.killBets.findMany({
          where: eq(schema.killBets.userId, session.userId),
          orderBy: desc(schema.killBets.createdAt),
          with: {
            pokemon: {
              columns: { name: true, displayName: true, spriteUrl: true },
            },
          },
        });
      }
    } else {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    return NextResponse.json({ bets });
  } catch (error) {
    console.error("Error fetching kill bets:", error);
    return NextResponse.json(
      { error: "Failed to fetch kill bets" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/kill-bets
 * Place a new kill bet
 */
export async function POST(request: NextRequest) {
  const sessionUser = await getSession();

  if (!sessionUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const isCoachBet = sessionUser.type === "coach";
  const oddsCoachId = isCoachBet ? sessionUser.id : null;
  const oddsUserId = isCoachBet ? null : sessionUser.id;

  try {
    const body = await request.json();
    const { matchId, pokemonId, seasonCoachId, killThreshold, betType, amount } = body;

    // Validate input
    if (!matchId || !pokemonId || !seasonCoachId || !killThreshold || !betType || !amount) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!["over", "under"].includes(betType)) {
      return NextResponse.json({ error: "betType must be 'over' or 'under'" }, { status: 400 });
    }

    if (amount < 1 || amount > 100) {
      return NextResponse.json({ error: "Amount must be between 1 and 100" }, { status: 400 });
    }

    if (killThreshold < 1 || killThreshold > 6) {
      return NextResponse.json({ error: "Kill threshold must be between 1 and 6" }, { status: 400 });
    }

    // Get match
    const match = await db.query.matches.findFirst({
      where: eq(schema.matches.id, matchId),
      with: {
        coach1: {
          with: {
            coach: { columns: { eloRating: true } },
            rosters: { columns: { pokemonId: true } },
          },
        },
        coach2: {
          with: {
            coach: { columns: { eloRating: true } },
            rosters: { columns: { pokemonId: true } },
          },
        },
      },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // Check match hasn't started
    if (match.winnerId !== null) {
      return NextResponse.json({ error: "Match already completed" }, { status: 400 });
    }

    // Check match isn't underway (scheduled time has passed)
    if (match.scheduledAt && new Date(match.scheduledAt).getTime() <= Date.now()) {
      return NextResponse.json({ error: "Cannot bet on a match that is currently underway" }, { status: 400 });
    }

    // Prevent coaches from betting on their own matches
    if (isCoachBet && oddsCoachId && (match.coach1.coachId === oddsCoachId || match.coach2.coachId === oddsCoachId)) {
      return NextResponse.json({ error: "You cannot place kill bets on your own matches" }, { status: 400 });
    }

    // Verify seasonCoachId is part of this match
    if (seasonCoachId !== match.coach1SeasonId && seasonCoachId !== match.coach2SeasonId) {
      return NextResponse.json({ error: "Invalid season coach for this match" }, { status: 400 });
    }

    // Get transactions for the season to use time-synced roster validation
    const seasonTxs = await db.query.transactions.findMany({
      where: eq(schema.transactions.seasonId, match.seasonId),
    });

    // Get time-synced roster for the season coach
    const isCoach1 = seasonCoachId === match.coach1SeasonId;
    const staticRoster = isCoach1 ? match.coach1.rosters : match.coach2.rosters;
    const coachTxs = [
      ...seasonTxs.filter((tx) => tx.seasonCoachId === seasonCoachId),
      ...seasonTxs.filter((tx) => tx.type === "P2P_TRADE" && tx.tradingPartnerSeasonCoachId === seasonCoachId),
    ];

    const { filteredRosters } = await getTimeSyncedRoster(
      seasonCoachId,
      match.week,
      staticRoster as any,
      coachTxs as any
    );

    // Verify Pokemon is on the time-synced roster
    const pokemonOnRoster = filteredRosters.some((r) => r.pokemonId === pokemonId);

    if (!pokemonOnRoster) {
      return NextResponse.json({ error: "Pokemon not on team roster" }, { status: 400 });
    }

    // Check user's balance
    let balance = 0;

    if (isCoachBet && oddsCoachId) {
      const coach = await db.query.coaches.findFirst({
        where: eq(schema.coaches.id, oddsCoachId),
        columns: { pboCoin: true },
      });
      balance = coach?.pboCoin ?? 0;
    } else if (oddsUserId) {
      const user = await db.query.users.findFirst({
        where: eq(schema.users.id, oddsUserId),
        columns: { pboCoin: true },
      });
      balance = user?.pboCoin ?? 0;
    }

    if (balance < amount) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
    }

    // Calculate odds
    const { coach1WinProb } = calculateMatchOdds(
      match.coach1.coach.eloRating,
      match.coach2.coach.eloRating
    );

    const winProb = isCoach1 ? coach1WinProb : (1 - coach1WinProb);

    const stats = await getPokemonKillStats(pokemonId);
    const expectedKills = calculateExpectedKills(
      stats.avgKillsWin,
      stats.avgKillsLoss,
      stats.totalGames,
      winProb
    );

    const { odds } = calculateKillOdds(expectedKills, killThreshold, betType);

    // Check for existing bet on same Pokemon/threshold
    const existingBetCondition = isCoachBet && oddsCoachId
      ? eq(schema.killBets.coachId, oddsCoachId)
      : eq(schema.killBets.userId, oddsUserId!);

    const existingBet = await db.query.killBets.findFirst({
      where: and(
        existingBetCondition,
        eq(schema.killBets.matchId, matchId),
        eq(schema.killBets.pokemonId, pokemonId),
        eq(schema.killBets.killThreshold, killThreshold),
        eq(schema.killBets.betType, betType),
        eq(schema.killBets.status, "pending")
      ),
    });

    if (existingBet) {
      return NextResponse.json(
        { error: "You already have a pending bet on this exact outcome" },
        { status: 400 }
      );
    }

    // Create the bet
    const [bet] = await db
      .insert(schema.killBets)
      .values({
        coachId: oddsCoachId,
        userId: oddsUserId,
        matchId,
        pokemonId,
        seasonCoachId,
        killThreshold,
        betType,
        amount,
        odds,
        status: "pending",
        createdAt: new Date().toISOString(),
      })
      .returning();

    // Note: Coins are not deducted here - they become "pending" and reduce availableBalance
    // The actual deduction happens when the bet is resolved (won/lost)

    return NextResponse.json({
      bet,
      newBalance: balance - amount, // This is the new available balance
    });
  } catch (error) {
    console.error("Error placing kill bet:", error);
    return NextResponse.json(
      { error: "Failed to place kill bet" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/kill-bets?betId=123
 * Cancel a pending kill bet (returns stake)
 */
export async function DELETE(request: NextRequest) {
  const sessionUser = await getSession();

  if (!sessionUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const isCoachBet = sessionUser.type === "coach";
  const sessionCoachId = isCoachBet ? sessionUser.id : null;
  const sessionUserId = isCoachBet ? null : sessionUser.id;

  const searchParams = request.nextUrl.searchParams;
  const betIdParam = searchParams.get("betId");

  if (!betIdParam) {
    return NextResponse.json({ error: "betId is required" }, { status: 400 });
  }

  const betId = parseInt(betIdParam, 10);

  try {
    // Get the bet
    const bet = await db.query.killBets.findFirst({
      where: eq(schema.killBets.id, betId),
      with: {
        match: true,
      },
    });

    if (!bet) {
      return NextResponse.json({ error: "Bet not found" }, { status: 404 });
    }

    // Verify ownership
    if (isCoachBet && bet.coachId !== sessionCoachId) {
      return NextResponse.json({ error: "Not your bet" }, { status: 403 });
    }
    if (!isCoachBet && bet.userId !== sessionUserId) {
      return NextResponse.json({ error: "Not your bet" }, { status: 403 });
    }

    // Check bet is still pending
    if (bet.status !== "pending") {
      return NextResponse.json({ error: "Bet already resolved" }, { status: 400 });
    }

    // Check match hasn't started
    if (bet.match.startedAt) {
      return NextResponse.json({ error: "Match has already started" }, { status: 400 });
    }

    // Simply delete the bet - coins were never deducted (they're just "pending")
    await db.delete(schema.killBets).where(eq(schema.killBets.id, betId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error cancelling kill bet:", error);
    return NextResponse.json(
      { error: "Failed to cancel kill bet" },
      { status: 500 }
    );
  }
}
