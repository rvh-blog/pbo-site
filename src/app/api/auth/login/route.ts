import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, isNotNull } from "drizzle-orm";
import * as schema from "@/lib/schema";
import { verifyPassword } from "@/lib/auth";
import { createSession, setSessionCookie } from "@/lib/session";

interface LoginRequest {
  type: "coach" | "spectator";
  coachId?: number; // for coach login
  username?: string; // for spectator login
  password: string;
}

// POST /api/auth/login - authenticate with password
export async function POST(request: Request) {
  try {
    const body: LoginRequest = await request.json();
    const { type, coachId, username, password } = body;

    if (!password) {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    if (type === "coach") {
      if (!coachId) {
        return NextResponse.json(
          { error: "Coach ID is required" },
          { status: 400 }
        );
      }

      // Find the coach
      const coach = await db.query.coaches.findFirst({
        where: eq(schema.coaches.id, coachId),
      });

      if (!coach || !coach.passwordHash) {
        return NextResponse.json(
          { error: "Invalid credentials" },
          { status: 401 }
        );
      }

      // Verify password
      const isValid = await verifyPassword(password, coach.passwordHash);
      if (!isValid) {
        return NextResponse.json(
          { error: "Invalid credentials" },
          { status: 401 }
        );
      }

      // Create session
      const token = await createSession("coach", coachId);
      await setSessionCookie(token);

      return NextResponse.json({
        success: true,
        user: {
          type: "coach",
          id: coachId,
          name: coach.name,
          isMod: coach.isMod ?? false,
          isEditor: coach.isEditor ?? false,
        },
      });
    } else {
      if (!username) {
        return NextResponse.json(
          { error: "Username is required" },
          { status: 400 }
        );
      }

      // Find the user
      const user = await db.query.users.findFirst({
        where: eq(schema.users.username, username),
      });

      if (!user) {
        return NextResponse.json(
          { error: "Invalid credentials" },
          { status: 401 }
        );
      }

      // Verify password
      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        return NextResponse.json(
          { error: "Invalid credentials" },
          { status: 401 }
        );
      }

      // Create session
      const token = await createSession("spectator", user.id);
      await setSessionCookie(token);

      return NextResponse.json({
        success: true,
        user: {
          type: "spectator",
          id: user.id,
          name: user.username,
          isMod: user.isMod ?? false,
          isEditor: user.isEditor ?? false,
        },
      });
    }
  } catch (error) {
    console.error("Error logging in:", error);
    return NextResponse.json(
      { error: "Failed to login" },
      { status: 500 }
    );
  }
}

// GET /api/auth/login - get list of claimed coaches (for login dropdown)
export async function GET() {
  try {
    const claimedCoaches = await db.query.coaches.findMany({
      where: isNotNull(schema.coaches.passwordHash),
      columns: {
        id: true,
        name: true,
      },
      orderBy: (coaches, { asc }) => [asc(coaches.name)],
    });

    return NextResponse.json({ coaches: claimedCoaches });
  } catch (error) {
    console.error("Error fetching claimed coaches:", error);
    return NextResponse.json(
      { error: "Failed to fetch coaches" },
      { status: 500 }
    );
  }
}
