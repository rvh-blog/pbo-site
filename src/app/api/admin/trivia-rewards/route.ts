import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { triviaRewards, coaches, seasons } from "@/lib/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { getSession } from "@/lib/session";

const MAX_COACHES_PER_PAYOUT = 100;
const MIN_PAYOUT_AMOUNT = 20;
const MAX_PAYOUT_AMOUNT = 1000;

export async function GET() {
  const session = await getSession();
  if (!session?.isMod) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all trivia rewards for the current season
    const currentSeason = await db.query.seasons.findFirst({
      where: eq(seasons.isCurrent, true),
    });

    if (!currentSeason) {
      return NextResponse.json({ rewards: [] });
    }

    const rewards = await db.query.triviaRewards.findMany({
      where: eq(triviaRewards.seasonId, currentSeason.id),
      with: {
        coach: true,
      },
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });

    return NextResponse.json({ rewards });
  } catch (error) {
    console.error("Error fetching trivia rewards:", error);
    return NextResponse.json(
      { error: "Failed to fetch trivia rewards" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.isMod) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { amount, reason } = body;
    const rawCoachIds = Array.isArray(body.coachIds)
      ? body.coachIds
      : body.coachId !== undefined
        ? [body.coachId]
        : [];

    if (
      rawCoachIds.length === 0 ||
      rawCoachIds.length > MAX_COACHES_PER_PAYOUT ||
      !rawCoachIds.every(
        (coachId: unknown) =>
          typeof coachId === "number" && Number.isInteger(coachId) && coachId > 0
      )
    ) {
      return NextResponse.json(
        { error: `Select between 1 and ${MAX_COACHES_PER_PAYOUT} coaches` },
        { status: 400 }
      );
    }

    const coachIds = rawCoachIds as number[];
    if (new Set(coachIds).size !== coachIds.length) {
      return NextResponse.json(
        { error: "Each coach can only be selected once" },
        { status: 400 }
      );
    }

    if (
      typeof amount !== "number" ||
      !Number.isInteger(amount) ||
      amount < MIN_PAYOUT_AMOUNT ||
      amount > MAX_PAYOUT_AMOUNT
    ) {
      return NextResponse.json(
        { error: `amount must be a whole number between ${MIN_PAYOUT_AMOUNT} and ${MAX_PAYOUT_AMOUNT}` },
        { status: 400 }
      );
    }

    if (!reason || typeof reason !== "string" || reason.trim() === "") {
      return NextResponse.json(
        { error: "reason is required" },
        { status: 400 }
      );
    }

    // Get current season
    const currentSeason = await db.query.seasons.findFirst({
      where: eq(seasons.isCurrent, true),
    });

    if (!currentSeason) {
      return NextResponse.json(
        { error: "No active season found" },
        { status: 400 }
      );
    }

    // Get all selected coaches before applying the batch.
    const selectedCoaches = await db.query.coaches.findMany({
      where: inArray(coaches.id, coachIds),
    });

    if (selectedCoaches.length !== coachIds.length) {
      return NextResponse.json(
        { error: "One or more selected coaches could not be found" },
        { status: 404 }
      );
    }

    const rewards = await db.transaction(async (tx) => {
      await tx
        .update(coaches)
        .set({ pboCoin: sql`${coaches.pboCoin} + ${amount}` })
        .where(inArray(coaches.id, coachIds));

      return tx
        .insert(triviaRewards)
        .values(
          coachIds.map((coachId) => ({
            coachId,
            seasonId: currentSeason.id,
            amount,
            reason: reason.trim(),
            awardedBy: session.name,
          }))
        )
        .returning();
    });

    const totalCoins = amount * coachIds.length;
    const previousBalance = selectedCoaches[0]?.pboCoin ?? 0;

    return NextResponse.json({
      success: true,
      count: coachIds.length,
      totalCoins,
      rewards,
      reward: rewards[0],
      newBalance: coachIds.length === 1 ? previousBalance + amount : null,
    });
  } catch (error) {
    console.error("Error awarding trivia reward:", error);
    return NextResponse.json(
      { error: "Failed to award trivia reward" },
      { status: 500 }
    );
  }
}
