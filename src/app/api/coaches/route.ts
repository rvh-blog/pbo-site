import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { coaches, seasonCoaches, eloHistory } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const allCoaches = await db.query.coaches.findMany({
    with: {
      seasonCoaches: {
        with: {
          division: {
            with: {
              season: true,
            },
          },
        },
      },
    },
  });
  return NextResponse.json(allCoaches);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, eloRating } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json(
      { error: "Name is required" },
      { status: 400 }
    );
  }

  const values: { name: string; eloRating?: number } = { name };
  if (eloRating !== undefined && typeof eloRating === "number") {
    values.eloRating = eloRating;
  }

  const result = await db.insert(coaches).values(values).returning();
  return NextResponse.json(result[0]);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, name, eloRating, mergeFromId } = body;

  if (!id) {
    return NextResponse.json(
      { error: "ID is required" },
      { status: 400 }
    );
  }

  // Handle merge operation
  if (mergeFromId && mergeFromId !== id) {
    // Transfer all season_coaches entries from mergeFromId to id
    await db
      .update(seasonCoaches)
      .set({ coachId: id })
      .where(eq(seasonCoaches.coachId, mergeFromId));

    // Transfer all elo_history entries from mergeFromId to id
    await db
      .update(eloHistory)
      .set({ coachId: id })
      .where(eq(eloHistory.coachId, mergeFromId));

    // Delete the old coach
    await db.delete(coaches).where(eq(coaches.id, mergeFromId));

    // Now update the target coach with new name/elo if provided
  }

  // Build update object
  const updateValues: { name?: string; eloRating?: number } = {};
  if (name && typeof name === "string") {
    updateValues.name = name;
  }
  if (eloRating !== undefined && typeof eloRating === "number") {
    updateValues.eloRating = eloRating;
  }

  if (Object.keys(updateValues).length > 0) {
    await db
      .update(coaches)
      .set(updateValues)
      .where(eq(coaches.id, id));
  }

  // Fetch and return the updated coach
  const updatedCoach = await db.query.coaches.findFirst({
    where: eq(coaches.id, id),
    with: {
      seasonCoaches: {
        with: {
          division: {
            with: {
              season: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json(updatedCoach);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "ID is required" },
      { status: 400 }
    );
  }

  await db.delete(coaches).where(eq(coaches.id, parseInt(id)));
  return NextResponse.json({ success: true });
}
