import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { coaches, seasonCoaches } from "@/lib/schema";

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
    let projectMew: {
      confirmed: boolean;
      promptSeen: boolean;
    } | null = null;
    if (session.type === "coach") {
      const [coach, coachSeasons] = await Promise.all([
        db.query.coaches.findFirst({
          where: eq(coaches.id, session.id),
          columns: {
            projectMewConfirmed: true,
            projectMewPromptSeen: true,
          },
        }),
        db.query.seasonCoaches.findMany({
          where: eq(seasonCoaches.coachId, session.id),
          with: {
            division: {
              with: {
                season: { columns: { id: true, isCurrent: true } },
              },
            },
          },
        }),
      ]);
      if (coach) {
        projectMew = {
          confirmed: coach.projectMewConfirmed ?? false,
          promptSeen: coach.projectMewPromptSeen ?? false,
        };
      }
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
      projectMew,
    });
  } catch (error) {
    console.error("Error getting session:", error);
    return NextResponse.json(
      { error: "Failed to get session" },
      { status: 500 }
    );
  }
}
