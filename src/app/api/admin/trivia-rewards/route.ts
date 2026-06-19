import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { triviaRewards, coaches, seasons } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET() {
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
  try {
    const body = await request.json();
    const { coachId, amount, reason, awardedBy } = body;

    if (!coachId || typeof coachId !== "number") {
      return NextResponse.json(
        { error: "coachId is required" },
        { status: 400 }
      );
    }

    if (!amount || typeof amount !== "number" || amount <= 0 || amount > 100) {
      return NextResponse.json(
        { error: "amount must be between 1 and 100" },
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

    // Get the coach
    const coach = await db.query.coaches.findFirst({
      where: eq(coaches.id, coachId),
    });

    if (!coach) {
      return NextResponse.json(
        { error: "Coach not found" },
        { status: 404 }
      );
    }

    // Award the coins
    await db
      .update(coaches)
      .set({ pboCoin: coach.pboCoin + amount })
      .where(eq(coaches.id, coachId));

    // Record the reward
    const [reward] = await db
      .insert(triviaRewards)
      .values({
        coachId,
        seasonId: currentSeason.id,
        amount,
        reason: reason.trim(),
        awardedBy: awardedBy || null,
      })
      .returning();

    return NextResponse.json({
      success: true,
      reward,
      newBalance: coach.pboCoin + amount,
    });
  } catch (error) {
    console.error("Error awarding trivia reward:", error);
    return NextResponse.json(
      { error: "Failed to award trivia reward" },
      { status: 500 }
    );
  }
}
