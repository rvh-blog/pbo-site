import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { eq, and, gt } from "drizzle-orm";
import * as schema from "./schema";

const SALT_ROUNDS = 10;
const SESSION_COOKIE_NAME = "pbo-user-session";

// ============================================
// Admin Authentication (uses user session + mod flag)
// ============================================

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME);

  if (!token?.value) return false;

  try {
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

    if (!session) return false;

    // Check if user has mod flag
    if (session.coachId && session.coach) {
      return session.coach.isMod === true;
    }

    if (session.userId && session.user) {
      return session.user.isMod === true;
    }

    return false;
  } catch {
    return false;
  }
}

// ============================================
// User Authentication (coaches & spectators)
// ============================================

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a random token for sessions
 */
export function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Validate password meets minimum requirements
 */
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < 6) {
    return { valid: false, error: "Password must be at least 6 characters" };
  }
  if (password.length > 100) {
    return { valid: false, error: "Password must be less than 100 characters" };
  }
  return { valid: true };
}

/**
 * Validate username meets requirements
 */
export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (!username || username.length < 2) {
    return { valid: false, error: "Username must be at least 2 characters" };
  }
  if (username.length > 50) {
    return { valid: false, error: "Username must be less than 50 characters" };
  }
  // Allow alphanumeric, spaces, underscores, hyphens
  if (!/^[a-zA-Z0-9 _-]+$/.test(username)) {
    return { valid: false, error: "Username can only contain letters, numbers, spaces, underscores, and hyphens" };
  }
  return { valid: true };
}
