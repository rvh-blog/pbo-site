import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/schema";

// POST /api/admin/users/[id]/convert-to-coach - convert spectator to coach
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Check admin auth
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const spectatorId = parseInt(id);
  if (isNaN(spectatorId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  try {
    const { coachId } = await request.json();
    if (!coachId) {
      return NextResponse.json({ error: "Coach ID required" }, { status: 400 });
    }

    // Get the spectator
    const spectator = await db.query.users.findFirst({
      where: eq(schema.users.id, spectatorId),
    });

    if (!spectator) {
      return NextResponse.json({ error: "Spectator not found" }, { status: 404 });
    }

    // Get the coach
    const coach = await db.query.coaches.findFirst({
      where: eq(schema.coaches.id, coachId),
    });

    if (!coach) {
      return NextResponse.json({ error: "Coach not found" }, { status: 404 });
    }

    // Check if coach is already claimed
    if (coach.passwordHash) {
      return NextResponse.json(
        { error: "Coach is already claimed by another user" },
        { status: 400 }
      );
    }

    // Transfer auth data and coins to coach
    await db
      .update(schema.coaches)
      .set({
        passwordHash: spectator.passwordHash,
        isMod: spectator.isMod,
        isEditor: spectator.isEditor,
        claimedAt: spectator.createdAt || new Date().toISOString(),
        pboCoin: coach.pboCoin + spectator.pboCoin, // Transfer spectator's coins
      })
      .where(eq(schema.coaches.id, coachId));

    // Update any sessions from spectator to coach
    await db
      .update(schema.userSessions)
      .set({
        userId: null,
        coachId: coachId,
      })
      .where(eq(schema.userSessions.userId, spectatorId));

    // Delete the spectator
    await db.delete(schema.users).where(eq(schema.users.id, spectatorId));

    return NextResponse.json({
      success: true,
      message: `Converted ${spectator.username} to coach`,
    });
  } catch (error) {
    console.error("Error converting to coach:", error);
    return NextResponse.json(
      { error: "Failed to convert to coach" },
      { status: 500 }
    );
  }
}
