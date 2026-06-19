import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/schema";
import { calculateMatchOdds } from "@/lib/betting";
import { getMatchKillOdds } from "@/lib/kill-betting";

/**
 * GET /api/kill-bets/odds?matchId=123
 * Get kill betting odds for all Pokemon in a match
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const matchIdParam = searchParams.get("matchId");

  if (!matchIdParam) {
    return NextResponse.json({ error: "matchId is required" }, { status: 400 });
  }

  const matchId = parseInt(matchIdParam, 10);
  if (isNaN(matchId)) {
    return NextResponse.json({ error: "Invalid matchId" }, { status: 400 });
  }

  try {
    // Get match with coach ELO ratings
    const match = await db.query.matches.findFirst({
      where: eq(schema.matches.id, matchId),
      with: {
        coach1: {
          with: {
            coach: {
              columns: { eloRating: true },
            },
          },
        },
        coach2: {
          with: {
            coach: {
              columns: { eloRating: true },
            },
          },
        },
      },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // Check if match already has a result
    if (match.winnerId !== null) {
      return NextResponse.json({ error: "Match already completed" }, { status: 400 });
    }

    // Calculate match win probabilities
    const { coach1WinProb } = calculateMatchOdds(
      match.coach1.coach.eloRating,
      match.coach2.coach.eloRating
    );

    // Get kill betting odds for all Pokemon
    const killOdds = await getMatchKillOdds(matchId, coach1WinProb);

    return NextResponse.json({
      matchId,
      coach1: {
        seasonCoachId: match.coach1SeasonId,
        teamName: match.coach1.teamName,
        teamAbbreviation: match.coach1.teamAbbreviation,
        winProb: coach1WinProb,
        pokemon: killOdds.coach1Pokemon,
      },
      coach2: {
        seasonCoachId: match.coach2SeasonId,
        teamName: match.coach2.teamName,
        teamAbbreviation: match.coach2.teamAbbreviation,
        winProb: 1 - coach1WinProb,
        pokemon: killOdds.coach2Pokemon,
      },
    });
  } catch (error) {
    console.error("Error getting kill bet odds:", error);
    return NextResponse.json(
      { error: "Failed to get kill bet odds" },
      { status: 500 }
    );
  }
}
