import { cookies } from "next/headers";
import { db } from "./db";
import { eq, and, gt } from "drizzle-orm";
import * as schema from "./schema";
import { generateToken } from "./auth";

const SESSION_COOKIE_NAME = "pbo-user-session";
const SESSION_DURATION_DAYS = 30;

export interface SessionUser {
  type: "coach" | "spectator";
  id: number; // coach.id or user.id
  name: string;
  isMod: boolean;
  canPostBlog?: boolean;
}

/**
 * Create a new session for a coach or spectator
 */
export async function createSession(
  userType: "coach" | "spectator",
  userId: number
): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

  await db.insert(schema.userSessions).values({
    token,
    coachId: userType === "coach" ? userId : null,
    userId: userType === "spectator" ? userId : null,
    expiresAt: expiresAt.toISOString(),
    createdAt: new Date().toISOString(),
  });

  return token;
}

/**
 * Set the session cookie
 */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

/**
 * Get the current session from cookie
 */
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME);

  if (!token?.value) return null;

  // Find session and check if not expired
  const session = await db.query.userSessions.findFirst({
    where: and(
      eq(schema.userSessions.token, token.value),
      gt(schema.userSessions.expiresAt, new Date().toISOString())
    ),
    with: {
      coach: true,
      user: true,
    },
  });

  if (!session) return null;

  // Return coach or spectator data
  if (session.coachId && session.coach) {
    return {
      type: "coach",
      id: session.coach.id,
      name: session.coach.name,
      isMod: session.coach.isMod ?? false,
      canPostBlog: session.coach.canPostBlog ?? false,
    };
  }

  if (session.userId && session.user) {
    return {
      type: "spectator",
      id: session.user.id,
      name: session.user.username,
      isMod: session.user.isMod ?? false,
    };
  }

  return null;
}

/**
 * Delete the current session
 */
export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME);

  if (token?.value) {
    // Delete from database
    await db.delete(schema.userSessions).where(eq(schema.userSessions.token, token.value));
  }

  // Clear cookie
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Delete all sessions for a user (for password reset)
 */
export async function deleteAllUserSessions(userType: "coach" | "spectator", userId: number): Promise<void> {
  if (userType === "coach") {
    await db.delete(schema.userSessions).where(eq(schema.userSessions.coachId, userId));
  } else {
    await db.delete(schema.userSessions).where(eq(schema.userSessions.userId, userId));
  }
}

/**
 * Check if the current user is a mod (either admin or isMod flag)
 */
export async function isMod(): Promise<boolean> {
  const session = await getSession();
  return session?.isMod ?? false;
}
