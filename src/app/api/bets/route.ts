import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, and, inArray, or } from "drizzle-orm";
import * as schema from "@/lib/schema";
import { getSession } from "@/lib/session";
import { calculateOdds } from "@/lib/betting";

// GET /api/bets - get user's bets
export async function GET(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ bets: [], balance: 0 });
  }

  const { searchParams } = new URL(request.url);
  const matchIds = searchParams.get("matchIds"); // comma-separated match IDs
  const status = searchParams.get("status"); // pending, won, lost, or all

  // Get user's current balance based on session type
  let balance = 0;
  if (session.type === "coach") {
    const coach = await db.query.coaches.findFirst({
      where: eq(schema.coaches.id, session.id),
      columns: { pboCoin: true },
    });
    balance = coach?.pboCoin ?? 0;
  } else {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, session.id),
      columns: { pboCoin: true },
    });
    balance = user?.pboCoin ?? 0;
  }

  // Build query conditions based on session type
  const ownerCondition = session.type === "coach"
    ? eq(schema.bets.coachId, session.id)
    : eq(schema.bets.userId, session.id);

  const conditions = [ownerCondition];

  if (matchIds) {
    const ids = matchIds.split(",").map((id) => parseInt(id)).filter((id) => !isNaN(id));
    if (ids.length > 0) {
      conditions.push(inArray(schema.bets.matchId, ids));
    }
  }

  if (status && status !== "all") {
    conditions.push(eq(schema.bets.status, status));
  }

  const bets = await db.query.bets.findMany({
    where: and(...conditions),
    with: {
      match: {
        with: {
          coach1: { with: { coach: true } },
          coach2: { with: { coach: true } },
        },
      },
      predictedWinner: { with: { coach: true } },
    },
    orderBy: (b, { desc }) => [desc(b.createdAt)],
  });

  // Calculate total pending bets amount (including kill bets and death bets)
  const pendingBets = bets.filter((b) => b.status === "pending");
  const pendingBetsTotal = pendingBets.reduce((sum, b) => sum + b.amount, 0);

  // Also get pending kill bets
  const killBetCondition = session.type === "coach"
    ? eq(schema.killBets.coachId, session.id)
    : eq(schema.killBets.userId, session.id);

  const pendingKillBets = await db.query.killBets.findMany({
    where: and(killBetCondition, eq(schema.killBets.status, "pending")),
  });
  const pendingKillBetsTotal = pendingKillBets.reduce((sum, b) => sum + b.amount, 0);

  // Also get pending death bets
  const deathBetCondition = session.type === "coach"
    ? eq(schema.deathBets.coachId, session.id)
    : eq(schema.deathBets.userId, session.id);

  const pendingDeathBets = await db.query.deathBets.findMany({
    where: and(deathBetCondition, eq(schema.deathBets.status, "pending")),
  });
  const pendingDeathBetsTotal = pendingDeathBets.reduce((sum, b) => sum + b.amount, 0);

  const totalPending = pendingBetsTotal + pendingKillBetsTotal + pendingDeathBetsTotal;

  return NextResponse.json({
    bets,
    balance,
    totalPending,
    availableBalance: balance - totalPending,
  });
}

// POST /api/bets - place a bet
export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const { matchId, predictedWinnerId, amount } = await request.json();

    // Validate inputs
    if (!matchId || !predictedWinnerId || !amount) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (amount < 1) {
      return NextResponse.json(
        { error: "Minimum bet is 1 PBOcoin" },
        { status: 400 }
      );
    }

    // Get the match
    const match = await db.query.matches.findFirst({
      where: eq(schema.matches.id, matchId),
      with: {
        coach1: { with: { coach: true } },
        coach2: { with: { coach: true } },
      },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // Check match hasn't been played
    if (match.winnerId !== null) {
      return NextResponse.json(
        { error: "Cannot bet on a match that has already been played" },
        { status: 400 }
      );
    }

    // Check match isn't underway (scheduled time has passed)
    if (match.scheduledAt && new Date(match.scheduledAt).getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "Cannot bet on a match that is currently underway" },
        { status: 400 }
      );
    }

    // Validate predicted winner is one of the coaches in the match
    if (
      predictedWinnerId !== match.coach1SeasonId &&
      predictedWinnerId !== match.coach2SeasonId
    ) {
      return NextResponse.json(
        { error: "Invalid predicted winner" },
        { status: 400 }
      );
    }

    // Check if the bettor is a participant in this match (only for coaches)
    if (session.type === "coach") {
      const bettorIsCoach1 = match.coach1.coachId === session.id;
      const bettorIsCoach2 = match.coach2.coachId === session.id;

      if (bettorIsCoach1 || bettorIsCoach2) {
        // Bettor is a participant - they can only bet on themselves winning
        const bettorSeasonCoachId = bettorIsCoach1 ? match.coach1SeasonId : match.coach2SeasonId;

        if (predictedWinnerId !== bettorSeasonCoachId) {
          return NextResponse.json(
            { error: "You cannot bet on yourself losing" },
            { status: 400 }
          );
        }
      }
    }

    // Get user's balance based on session type
    let balance = 0;
    if (session.type === "coach") {
      const coach = await db.query.coaches.findFirst({
        where: eq(schema.coaches.id, session.id),
        columns: { pboCoin: true },
      });
      if (!coach) {
        return NextResponse.json({ error: "Coach not found" }, { status: 404 });
      }
      balance = coach.pboCoin;
    } else {
      const user = await db.query.users.findFirst({
        where: eq(schema.users.id, session.id),
        columns: { pboCoin: true },
      });
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      balance = user.pboCoin;
    }

    // Get total pending bets based on session type
    const ownerCondition = session.type === "coach"
      ? eq(schema.bets.coachId, session.id)
      : eq(schema.bets.userId, session.id);

    const pendingBets = await db.query.bets.findMany({
      where: and(
        ownerCondition,
        eq(schema.bets.status, "pending")
      ),
      columns: { amount: true },
    });

    const totalPending = pendingBets.reduce((sum, b) => sum + b.amount, 0);
    const availableBalance = balance - totalPending;

    if (amount > availableBalance) {
      return NextResponse.json(
        {
          error: `Insufficient balance. You have ${availableBalance} PBOcoin available.`,
        },
        { status: 400 }
      );
    }

    // Check if user already has a bet on this match
    const existingBet = await db.query.bets.findFirst({
      where: and(
        ownerCondition,
        eq(schema.bets.matchId, matchId),
        eq(schema.bets.status, "pending")
      ),
    });

    if (existingBet) {
      return NextResponse.json(
        { error: "You already have a bet on this match. Cancel it first to place a new one." },
        { status: 400 }
      );
    }

    // Calculate odds based on ELO
    const playerElo =
      predictedWinnerId === match.coach1SeasonId
        ? match.coach1.coach.eloRating
        : match.coach2.coach.eloRating;
    const opponentElo =
      predictedWinnerId === match.coach1SeasonId
        ? match.coach2.coach.eloRating
        : match.coach1.coach.eloRating;

    const odds = calculateOdds(playerElo, opponentElo);

    // Place the bet with appropriate owner field
    const betData = {
      matchId,
      predictedWinnerId,
      amount,
      odds,
      status: "pending" as const,
      createdAt: new Date().toISOString(),
      ...(session.type === "coach" ? { coachId: session.id } : { userId: session.id }),
    };

    const [bet] = await db
      .insert(schema.bets)
      .values(betData)
      .returning();

    return NextResponse.json({
      bet,
      potentialPayout: Math.floor(amount * odds),
    });
  } catch (error) {
    console.error("Error placing bet:", error);
    return NextResponse.json(
      { error: "Failed to place bet" },
      { status: 500 }
    );
  }
}

// DELETE /api/bets - cancel a pending bet
export async function DELETE(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const betId = searchParams.get("id");

  if (!betId) {
    return NextResponse.json({ error: "Bet ID required" }, { status: 400 });
  }

  // Find the bet - check ownership based on session type
  const ownerCondition = session.type === "coach"
    ? eq(schema.bets.coachId, session.id)
    : eq(schema.bets.userId, session.id);

  const bet = await db.query.bets.findFirst({
    where: and(
      eq(schema.bets.id, parseInt(betId)),
      ownerCondition
    ),
  });

  if (!bet) {
    return NextResponse.json({ error: "Bet not found" }, { status: 404 });
  }

  if (bet.status !== "pending") {
    return NextResponse.json(
      { error: "Can only cancel pending bets" },
      { status: 400 }
    );
  }

  // Simply delete the bet - coins were never deducted (they're just "pending")
  await db.delete(schema.bets).where(eq(schema.bets.id, parseInt(betId)));

  return NextResponse.json({ success: true });
}
