import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pickEmParticipants } from "@/lib/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getSession } from "@/lib/session";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const seasonId = searchParams.get("seasonId");
  const authUserId = searchParams.get("authUserId");
  const authUserType = searchParams.get("authUserType");
  const seasonIdNum = Number(seasonId);

  if (!Number.isSafeInteger(seasonIdNum) || seasonIdNum <= 0) {
    return NextResponse.json(
      { error: "A valid seasonId is required" },
      { status: 400 }
    );
  }

  // The client may request its own participant, but the identity comes from
  // the session cookie rather than caller-controlled query parameters.
  if (authUserId !== null || authUserType !== null) {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (
      authUserId === null ||
      authUserType !== session.type ||
      Number(authUserId) !== session.id
    ) {
      return NextResponse.json({ error: "Cannot access another participant" }, { status: 403 });
    }

    const identityCondition = session.type === "coach"
      ? eq(pickEmParticipants.coachId, session.id)
      : eq(pickEmParticipants.userId, session.id);
    const participant = await db.query.pickEmParticipants.findFirst({
      where: and(eq(pickEmParticipants.seasonId, seasonIdNum), identityCondition),
      with: {
        coach: { columns: { id: true, name: true, eloRating: true } },
      },
    });

    return NextResponse.json({ participant: participant || null });
  }

  // Otherwise return all participants for the season
  const participants = await db.query.pickEmParticipants.findMany({
    where: eq(pickEmParticipants.seasonId, seasonIdNum),
    with: {
      coach: { columns: { id: true, name: true, eloRating: true } },
    },
  });

  return NextResponse.json(participants);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "You must be signed in to join pick-ems" }, { status: 401 });
  }

  const body = await request.json();
  const { seasonId } = body;

  if (!Number.isSafeInteger(seasonId) || seasonId <= 0) {
    return NextResponse.json(
      { error: "A valid seasonId is required" },
      { status: 400 }
    );
  }

  const identityCondition = session.type === "coach"
    ? eq(pickEmParticipants.coachId, session.id)
    : eq(pickEmParticipants.userId, session.id);

  // A participant is owned by the authenticated account, never by a caller-
  // supplied name or coach/user ID.
  const existing = await db.query.pickEmParticipants.findFirst({
    where: and(
      eq(pickEmParticipants.seasonId, seasonId),
      identityCondition
    ),
    with: {
      coach: { columns: { id: true, name: true, eloRating: true } },
    },
  });

  if (existing) return NextResponse.json(existing);

  // Do not silently claim a legacy anonymous entry by matching a public name.
  const unlinkedNameMatch = await db.query.pickEmParticipants.findFirst({
    where: and(
      eq(pickEmParticipants.seasonId, seasonId),
      eq(pickEmParticipants.name, session.name),
      isNull(pickEmParticipants.coachId),
      isNull(pickEmParticipants.userId)
    ),
  });
  if (unlinkedNameMatch) {
    return NextResponse.json(
      { error: "An unlinked pick-em entry already uses this name. Please ask an admin to review it." },
      { status: 409 }
    );
  }

  const values: { name: string; seasonId: number; coachId: number | null; userId: number | null } = {
    name: session.name,
    seasonId,
    coachId: session.type === "coach" ? session.id : null,
    userId: session.type === "spectator" ? session.id : null,
  };

  const result = await db.insert(pickEmParticipants).values(values).returning();

  // Fetch with relations
  const participant = await db.query.pickEmParticipants.findFirst({
    where: eq(pickEmParticipants.id, result[0].id),
    with: {
      coach: { columns: { id: true, name: true, eloRating: true } },
    },
  });

  return NextResponse.json(participant);
}
