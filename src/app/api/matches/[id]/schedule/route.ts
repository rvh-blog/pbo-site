import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { matches, seasonCoaches } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const matchId = parseInt(idStr);
  if (isNaN(matchId)) {
    return NextResponse.json({ error: "Invalid match ID" }, { status: 400 });
  }

  // Auth check
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Load match to check authorization
  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
  });

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  // Check if user is authorized: must be a mod or one of the involved coaches
  if (!session.isMod) {
    if (session.type !== "coach") {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Look up the actual coach IDs from seasonCoaches
    const [sc1, sc2] = await Promise.all([
      db.query.seasonCoaches.findFirst({
        where: eq(seasonCoaches.id, match.coach1SeasonId),
        columns: { coachId: true },
      }),
      db.query.seasonCoaches.findFirst({
        where: eq(seasonCoaches.id, match.coach2SeasonId),
        columns: { coachId: true },
      }),
    ]);

    if (session.id !== sc1?.coachId && session.id !== sc2?.coachId) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
  }

  // Parse body
  const body = await request.json();
  const { scheduledAt } = body;

  // scheduledAt must be a string (ISO datetime) or null
  if (scheduledAt !== null && typeof scheduledAt !== "string") {
    return NextResponse.json({ error: "scheduledAt must be a string or null" }, { status: 400 });
  }

  // Update match
  const [updated] = await db
    .update(matches)
    .set({ scheduledAt: scheduledAt ?? null })
    .where(eq(matches.id, matchId))
    .returning();

  return NextResponse.json({ scheduledAt: updated.scheduledAt });
}
