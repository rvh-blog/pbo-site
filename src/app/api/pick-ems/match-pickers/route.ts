import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pickEmPicks, pickEmParticipants, matches } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get("matchId");

    if (!matchId) {
      return NextResponse.json(
        { error: "matchId is required" },
        { status: 400 }
      );
    }

    const matchIdNum = parseInt(matchId);

    // Fetch match and picks in parallel
    const [match, picks] = await Promise.all([
      db.query.matches.findFirst({
        where: eq(matches.id, matchIdNum),
      }),
      db.query.pickEmPicks.findMany({
        where: eq(pickEmPicks.matchId, matchIdNum),
        with: {
          participant: {
            with: {
              coach: true,
            },
          },
        },
      }),
    ]);

    if (!match) {
      return NextResponse.json(
        { error: "Match not found" },
        { status: 404 }
      );
    }

    // Only return pickers for completed matches
    if (match.winnerId === null) {
      return NextResponse.json(
        { error: "Match not completed yet" },
        { status: 400 }
      );
    }

    // Group pickers by which team they picked
    const coach1Pickers: { id: number; name: string; coachId: number | null }[] = [];
    const coach2Pickers: { id: number; name: string; coachId: number | null }[] = [];

    for (const pick of picks) {
      const picker = {
        id: pick.participant.id,
        name: pick.participant.name,
        coachId: pick.participant.coachId,
      };

      if (pick.predictedWinnerId === match.coach1SeasonId) {
        coach1Pickers.push(picker);
      } else if (pick.predictedWinnerId === match.coach2SeasonId) {
        coach2Pickers.push(picker);
      }
    }

    // Sort alphabetically
    coach1Pickers.sort((a, b) => a.name.localeCompare(b.name));
    coach2Pickers.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      matchId: matchIdNum,
      winnerId: match.winnerId,
      coach1SeasonId: match.coach1SeasonId,
      coach2SeasonId: match.coach2SeasonId,
      coach1Pickers,
      coach2Pickers,
    });
  } catch (error) {
    console.error("Match pickers API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
