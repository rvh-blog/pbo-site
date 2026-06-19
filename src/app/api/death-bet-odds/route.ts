import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/schema";
import { calculateMatchOdds } from "@/lib/betting";
import { getMatchDeathOdds } from "@/lib/death-betting";

/**
 * GET /api/death-bet-odds?matchId=123
 * Get death betting odds for all Pokemon in a match
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const matchIdParam = searchParams.get("matchId");

  if (!matchIdParam) {
    return NextResponse.json({ error: "matchId is required" }, { status: 400 });
  }

  const matchId = parseInt(matchIdParam, 10);

  try {
    // Get match with coach ELO ratings
    const match = await db.query.matches.findFirst({
      where: eq(schema.matches.id, matchId),
      with: {
        coach1: {
          with: {
            coach: { columns: { eloRating: true } },
          },
        },
        coach2: {
          with: {
            coach: { columns: { eloRating: true } },
          },
        },
      },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // Check match hasn't been played
    if (match.winnerId !== null) {
      return NextResponse.json({ error: "Match already completed" }, { status: 400 });
    }

    // Calculate win probability for coach1
    const { coach1WinProb } = calculateMatchOdds(
      match.coach1.coach.eloRating,
      match.coach2.coach.eloRating
    );

    // Get death odds for all Pokemon
    const { coach1Pokemon, coach2Pokemon } = await getMatchDeathOdds(matchId, coach1WinProb);

    return NextResponse.json({
      matchId,
      coach1: {
        seasonCoachId: match.coach1SeasonId,
        teamName: match.coach1.teamName,
        teamAbbreviation: match.coach1.teamAbbreviation,
        winProb: coach1WinProb,
        pokemon: coach1Pokemon,
      },
      coach2: {
        seasonCoachId: match.coach2SeasonId,
        teamName: match.coach2.teamName,
        teamAbbreviation: match.coach2.teamAbbreviation,
        winProb: 1 - coach1WinProb,
        pokemon: coach2Pokemon,
      },
    });
  } catch (error) {
    console.error("Error fetching death bet odds:", error);
    return NextResponse.json(
      { error: "Failed to fetch death bet odds" },
      { status: 500 }
    );
  }
}
