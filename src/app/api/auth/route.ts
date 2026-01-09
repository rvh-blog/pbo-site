import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "pbo-admin";
const SESSION_SECRET = process.env.SESSION_SECRET || "pbo-secret";

function createSessionToken(): string {
  // Simple session token - in production use a proper JWT or session library
  const timestamp = Date.now();
  const data = `admin:${timestamp}:${SESSION_SECRET}`;
  return Buffer.from(data).toString("base64");
}

function validateSessionToken(token: string): boolean {
  try {
    const decoded = Buffer.from(token, "base64").toString();
    const [user, , secret] = decoded.split(":");
    return user === "admin" && secret === SESSION_SECRET;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { password } = body;

  if (password === ADMIN_PASSWORD) {
    const token = createSessionToken();
    const cookieStore = await cookies();

    cookieStore.set("pbo-admin-session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { success: false, error: "Invalid password" },
    { status: 401 }
  );
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("pbo-admin-session");
  return NextResponse.json({ success: true });
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("pbo-admin-session");

  if (token && validateSessionToken(token.value)) {
    return NextResponse.json({ authenticated: true });
  }

  return NextResponse.json({ authenticated: false }, { status: 401 });
}
