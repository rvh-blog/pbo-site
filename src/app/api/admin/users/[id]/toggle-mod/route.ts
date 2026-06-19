import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/schema";
import { isAuthenticated } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/admin/users/[id]/toggle-mod - toggle mod status
export async function POST(request: NextRequest, { params }: RouteParams) {
  // Check admin auth
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { type } = body; // type: "coach" | "spectator"

    if (!type) {
      return NextResponse.json({ error: "Type is required" }, { status: 400 });
    }

    const userId = parseInt(id);

    if (type === "coach") {
      const coach = await db.query.coaches.findFirst({
        where: eq(schema.coaches.id, userId),
      });

      if (!coach) {
        return NextResponse.json({ error: "Coach not found" }, { status: 404 });
      }

      const newModStatus = !coach.isMod;
      await db
        .update(schema.coaches)
        .set({ isMod: newModStatus })
        .where(eq(schema.coaches.id, userId));

      return NextResponse.json({ success: true, isMod: newModStatus });
    } else {
      const user = await db.query.users.findFirst({
        where: eq(schema.users.id, userId),
      });

      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const newModStatus = !user.isMod;
      await db
        .update(schema.users)
        .set({ isMod: newModStatus })
        .where(eq(schema.users.id, userId));

      return NextResponse.json({ success: true, isMod: newModStatus });
    }
  } catch (error) {
    console.error("Error toggling mod status:", error);
    return NextResponse.json(
      { error: "Failed to toggle mod status" },
      { status: 500 }
    );
  }
}
