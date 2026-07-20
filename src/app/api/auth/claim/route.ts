import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, isNull, and } from "drizzle-orm";
import * as schema from "@/lib/schema";
import { hashPassword, validatePassword, validateUsername } from "@/lib/auth";
import { createSession, setSessionCookie } from "@/lib/session";

interface ClaimRequest {
  type: "coach" | "spectator";
  coachId?: number; // for coach claims
  username?: string; // for spectator claims
  password: string;
}

// POST /api/auth/claim - claim a coach account or create spectator account
export async function POST(request: Request) {
  try {
    const body: ClaimRequest = await request.json();
    const { type, coachId, username, password } = body;

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { error: passwordValidation.error },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);

    if (type === "coach") {
      // Claim a coach account
      if (!coachId) {
        return NextResponse.json(
          { error: "Coach ID is required" },
          { status: 400 }
        );
      }

      // Check if coach exists and is unclaimed
      const coach = await db.query.coaches.findFirst({
        where: and(
          eq(schema.coaches.id, coachId),
          isNull(schema.coaches.passwordHash)
        ),
      });

      if (!coach) {
        return NextResponse.json(
          { error: "Coach not found or already claimed" },
          { status: 400 }
        );
      }

      // Claim the account (coaches already have coins seeded)
      await db
        .update(schema.coaches)
        .set({
          passwordHash,
          claimedAt: new Date().toISOString(),
        })
        .where(eq(schema.coaches.id, coachId));

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
      // Create a spectator account
      if (!username) {
        return NextResponse.json(
          { error: "Username is required" },
          { status: 400 }
        );
      }

      // Validate username
      const usernameValidation = validateUsername(username);
      if (!usernameValidation.valid) {
        return NextResponse.json(
          { error: usernameValidation.error },
          { status: 400 }
        );
      }

      // Check if username is taken
      const existingUser = await db.query.users.findFirst({
        where: eq(schema.users.username, username),
      });

      if (existingUser) {
        return NextResponse.json(
          { error: "Username already taken" },
          { status: 400 }
        );
      }

      // Also check if username matches any coach name (to prevent impersonation)
      const coachWithName = await db.query.coaches.findFirst({
        where: eq(schema.coaches.name, username),
      });

      if (coachWithName) {
        return NextResponse.json(
          { error: "This name belongs to a coach. Please use the Coach tab to claim your account." },
          { status: 400 }
        );
      }

      // Create the user with 100 starter coins
      const result = await db
        .insert(schema.users)
        .values({
          username,
          passwordHash,
          createdAt: new Date().toISOString(),
          pboCoin: 100, // Starter coins
        })
        .returning({ id: schema.users.id });

      const userId = result[0].id;

      // Create session
      const token = await createSession("spectator", userId);
      await setSessionCookie(token);

      return NextResponse.json({
        success: true,
        user: {
          type: "spectator",
          id: userId,
          name: username,
          isMod: false,
          isEditor: false,
        },
      });
    }
  } catch (error) {
    console.error("Error claiming account:", error);
    return NextResponse.json(
      { error: "Failed to claim account" },
      { status: 500 }
    );
  }
}
