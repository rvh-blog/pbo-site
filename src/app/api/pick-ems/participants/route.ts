import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pickEmParticipants, users } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const seasonId = searchParams.get("seasonId");
  const authUserId = searchParams.get("authUserId");
  const authUserType = searchParams.get("authUserType");

  if (!seasonId) {
    return NextResponse.json(
      { error: "seasonId is required" },
      { status: 400 }
    );
  }

  // If auth params provided, find specific participant for this user
  if (authUserId && authUserType) {
    let participant;

    if (authUserType === "coach") {
      // Find participant linked to this coach
      participant = await db.query.pickEmParticipants.findFirst({
        where: and(
          eq(pickEmParticipants.seasonId, parseInt(seasonId)),
          eq(pickEmParticipants.coachId, parseInt(authUserId))
        ),
        with: {
          coach: true,
        },
      });
    } else {
      // For spectators, we need to look up the username from users table
      // and find a participant with that name (without coachId)
      const user = await db.query.users.findFirst({
        where: eq(users.id, parseInt(authUserId)),
      });

      if (user) {
        participant = await db.query.pickEmParticipants.findFirst({
          where: and(
            eq(pickEmParticipants.seasonId, parseInt(seasonId)),
            eq(pickEmParticipants.name, user.username)
          ),
          with: {
            coach: true,
          },
        });
      }
    }

    return NextResponse.json({ participant: participant || null });
  }

  // Otherwise return all participants for the season
  const participants = await db.query.pickEmParticipants.findMany({
    where: eq(pickEmParticipants.seasonId, parseInt(seasonId)),
    with: {
      coach: true,
    },
  });

  return NextResponse.json(participants);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, seasonId, coachId, userId } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json(
      { error: "Name is required" },
      { status: 400 }
    );
  }

  if (!seasonId || typeof seasonId !== "number") {
    return NextResponse.json(
      { error: "seasonId is required" },
      { status: 400 }
    );
  }

  // Check if participant already exists for this name+season
  const existing = await db.query.pickEmParticipants.findFirst({
    where: and(
      eq(pickEmParticipants.name, name),
      eq(pickEmParticipants.seasonId, seasonId)
    ),
    with: {
      coach: true,
    },
  });

  if (existing) {
    // If existing participant doesn't have userId linked but we have one now, update it
    if (!existing.userId && userId && typeof userId === "number") {
      await db
        .update(pickEmParticipants)
        .set({ userId })
        .where(eq(pickEmParticipants.id, existing.id));
      return NextResponse.json({ ...existing, userId });
    }
    return NextResponse.json(existing);
  }

  // Create new participant
  const values: { name: string; seasonId: number; coachId?: number; userId?: number } = {
    name,
    seasonId,
  };

  if (coachId !== undefined && typeof coachId === "number") {
    values.coachId = coachId;
  }

  if (userId !== undefined && typeof userId === "number") {
    values.userId = userId;
  }

  const result = await db.insert(pickEmParticipants).values(values).returning();

  // Fetch with relations
  const participant = await db.query.pickEmParticipants.findFirst({
    where: eq(pickEmParticipants.id, result[0].id),
    with: {
      coach: true,
    },
  });

  return NextResponse.json(participant);
}
