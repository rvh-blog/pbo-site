import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { seasonCoaches } from "@/lib/schema";

// GET /api/auth/me - get current user info
export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { user: null },
        { status: 200 }
      );
    }

    // For coaches, look up their division in the active season
    let activeDivision: { seasonId: number; divisionId: number } | null = null;
    if (session.type === "coach") {
      const coachSeasons = await db.query.seasonCoaches.findMany({
        where: eq(seasonCoaches.coachId, session.id),
        with: {
          division: {
            with: {
              season: { columns: { id: true, isCurrent: true } },
            },
          },
        },
      });
      const current = coachSeasons.find(sc => sc.division?.season?.isCurrent);
      if (current) {
        activeDivision = {
          seasonId: current.division.season!.id,
          divisionId: current.divisionId,
        };
      }
    }

    return NextResponse.json({
      user: session,
      activeDivision,
    });
  } catch (error) {
    console.error("Error getting session:", error);
    return NextResponse.json(
      { error: "Failed to get session" },
      { status: 500 }
    );
  }
}
