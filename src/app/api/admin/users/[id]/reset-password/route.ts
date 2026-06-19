import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/schema";
import { isAuthenticated, hashPassword } from "@/lib/auth";
import { deleteAllUserSessions } from "@/lib/session";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/admin/users/[id]/reset-password - reset user's password
export async function POST(request: NextRequest, { params }: RouteParams) {
  // Check admin auth
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { type, newPassword } = body; // type: "coach" | "spectator"

    if (!type || !newPassword) {
      return NextResponse.json(
        { error: "Type and newPassword are required" },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const userId = parseInt(id);
    const passwordHash = await hashPassword(newPassword);

    if (type === "coach") {
      const coach = await db.query.coaches.findFirst({
        where: eq(schema.coaches.id, userId),
      });

      if (!coach) {
        return NextResponse.json({ error: "Coach not found" }, { status: 404 });
      }

      await db
        .update(schema.coaches)
        .set({ passwordHash })
        .where(eq(schema.coaches.id, userId));

      // Clear all sessions for this user
      await deleteAllUserSessions("coach", userId);
    } else {
      const user = await db.query.users.findFirst({
        where: eq(schema.users.id, userId),
      });

      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      await db
        .update(schema.users)
        .set({ passwordHash })
        .where(eq(schema.users.id, userId));

      // Clear all sessions for this user
      await deleteAllUserSessions("spectator", userId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error resetting password:", error);
    return NextResponse.json(
      { error: "Failed to reset password" },
      { status: 500 }
    );
  }
}
