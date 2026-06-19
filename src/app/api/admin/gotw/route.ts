import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { matches, divisions, seasons } from "@/lib/schema";
import { eq, and, desc } from "drizzle-orm";
import { awardGotwBonus, reverseGotwBonus } from "@/lib/pick-em-rewards";

// GET - Fetch divisions and matches for GOTW selection
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const seasonId = searchParams.get("seasonId");
    const divisionId = searchParams.get("divisionId");
    const week = searchParams.get("week");

    // If no seasonId, return the active season and its divisions
    if (!seasonId) {
      const activeSeason = await db.query.seasons.findFirst({
        where: eq(seasons.isCurrent, true),
        with: {
          divisions: {
            orderBy: (d, { asc }) => [asc(d.displayOrder)],
          },
        },
      });

      if (!activeSeason) {
        return NextResponse.json({ error: "No active season" }, { status: 404 });
      }

      // Get all weeks that have matches in this season
      const weekMatches = await db
        .selectDistinct({ week: matches.week })
        .from(matches)
        .where(eq(matches.seasonId, activeSeason.id))
        .orderBy(matches.week);

      const weeks = weekMatches.map((w) => w.week);

      return NextResponse.json({
        season: activeSeason,
        divisions: activeSeason.divisions,
        weeks,
      });
    }

    // If divisionId and week provided, get matches for that division/week
    if (divisionId && week) {
      const divMatches = await db.query.matches.findMany({
        where: and(
          eq(matches.divisionId, parseInt(divisionId)),
          eq(matches.week, parseInt(week))
        ),
        with: {
          coach1: {
            columns: { teamName: true, teamAbbreviation: true },
          },
          coach2: {
            columns: { teamName: true, teamAbbreviation: true },
          },
        },
      });

      return NextResponse.json({ matches: divMatches });
    }

    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  } catch (error) {
    console.error("Error fetching GOTW data:", error);
    return NextResponse.json(
      { error: "Failed to fetch data" },
      { status: 500 }
    );
  }
}

// POST - Set or unset GOTW for a match
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { matchId, isGameOfTheWeek } = body;

    if (matchId === undefined || isGameOfTheWeek === undefined) {
      return NextResponse.json(
        { error: "matchId and isGameOfTheWeek are required" },
        { status: 400 }
      );
    }

    // Get the match to check if it has a winner
    const match = await db.query.matches.findFirst({
      where: eq(matches.id, matchId),
      columns: { winnerId: true, isGameOfTheWeek: true },
    });

    // Always reverse any existing GOTW bonus first (handles both unset and change scenarios)
    if (match?.isGameOfTheWeek) {
      const reversed = await reverseGotwBonus(matchId);
      if (reversed.length > 0) {
        console.log("[GOTW API] Reversed GOTW bonus:", reversed);
      }
    }

    // Update the GOTW flag
    await db
      .update(matches)
      .set({ isGameOfTheWeek })
      .where(eq(matches.id, matchId));

    // If setting as GOTW and match has a winner, award the bonus
    if (isGameOfTheWeek && match?.winnerId) {
      const awarded = await awardGotwBonus(matchId, match.winnerId);
      if (awarded.length > 0) {
        console.log("[GOTW API] Awarded GOTW bonus:", awarded);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating GOTW:", error);
    return NextResponse.json(
      { error: "Failed to update GOTW" },
      { status: 500 }
    );
  }
}
