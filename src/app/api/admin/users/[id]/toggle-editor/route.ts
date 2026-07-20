import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { isAuthenticated } from "@/lib/auth";
import { db } from "@/lib/db";
import * as schema from "@/lib/schema";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Only admins can grant or remove deciding-turn editor access.
export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = Number(id);
  const { type } = await request.json();

  if (!Number.isInteger(userId) || (type !== "coach" && type !== "spectator")) {
    return NextResponse.json({ error: "Invalid user or account type" }, { status: 400 });
  }

  const table = type === "coach" ? schema.coaches : schema.users;
  const account = type === "coach"
    ? await db.query.coaches.findFirst({ where: eq(schema.coaches.id, userId) })
    : await db.query.users.findFirst({ where: eq(schema.users.id, userId) });

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const isEditor = !(account.isEditor ?? false);
  await db.update(table).set({ isEditor }).where(eq(table.id, userId));

  return NextResponse.json({ success: true, isEditor });
}
