import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userPreferences } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/session";

// GET /api/preferences?page=draft-planner
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = searchParams.get("page");

  if (!page) {
    return NextResponse.json({ error: "page parameter required" }, { status: 400 });
  }

  try {
    const condition = session.type === "coach"
      ? and(eq(userPreferences.coachId, session.id), eq(userPreferences.page, page))
      : and(eq(userPreferences.userId, session.id), eq(userPreferences.page, page));

    const pref = await db.query.userPreferences.findFirst({
      where: condition,
    });

    if (!pref) {
      return NextResponse.json({ preferences: null });
    }

    return NextResponse.json({
      preferences: JSON.parse(pref.preferences),
    });
  } catch (error) {
    console.error("Error fetching preferences:", error);
    return NextResponse.json({ error: "Failed to fetch preferences" }, { status: 500 });
  }
}

// POST /api/preferences
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const { page, preferences } = await request.json();

    if (!page || !preferences) {
      return NextResponse.json({ error: "page and preferences required" }, { status: 400 });
    }

    const condition = session.type === "coach"
      ? and(eq(userPreferences.coachId, session.id), eq(userPreferences.page, page))
      : and(eq(userPreferences.userId, session.id), eq(userPreferences.page, page));

    // Check if preference exists
    const existing = await db.query.userPreferences.findFirst({
      where: condition,
    });

    const preferencesJson = JSON.stringify(preferences);
    const now = new Date().toISOString();

    if (existing) {
      // Update
      await db
        .update(userPreferences)
        .set({
          preferences: preferencesJson,
          updatedAt: now,
        })
        .where(eq(userPreferences.id, existing.id));
    } else {
      // Insert
      await db.insert(userPreferences).values({
        coachId: session.type === "coach" ? session.id : null,
        userId: session.type === "spectator" ? session.id : null,
        page,
        preferences: preferencesJson,
        updatedAt: now,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving preferences:", error);
    return NextResponse.json({ error: "Failed to save preferences" }, { status: 500 });
  }
}
