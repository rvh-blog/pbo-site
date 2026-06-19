import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/schema";
import { isAuthenticated } from "@/lib/auth";
import { deleteAllUserSessions } from "@/lib/session";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/admin/users/[id]/unclaim - unclaim a coach account (clear password)
export async function POST(request: NextRequest, { params }: RouteParams) {
  // Check admin auth
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const coachId = parseInt(id);

    const coach = await db.query.coaches.findFirst({
      where: eq(schema.coaches.id, coachId),
    });

    if (!coach) {
      return NextResponse.json({ error: "Coach not found" }, { status: 404 });
    }

    if (!coach.passwordHash) {
      return NextResponse.json(
        { error: "Coach is not claimed" },
        { status: 400 }
      );
    }

    // Clear password and claimed date
    await db
      .update(schema.coaches)
      .set({ passwordHash: null, claimedAt: null })
      .where(eq(schema.coaches.id, coachId));

    // Clear all sessions for this coach
    await deleteAllUserSessions("coach", coachId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error unclaiming coach:", error);
    return NextResponse.json(
      { error: "Failed to unclaim coach" },
      { status: 500 }
    );
  }
}
