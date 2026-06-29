import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { matches } from "@/lib/schema";
import { getSession } from "@/lib/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session?.isMod) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id } = await context.params;
  const matchId = Number(id);
  if (!Number.isInteger(matchId)) {
    return NextResponse.json({ error: "Invalid match id" }, { status: 400 });
  }

  const body = await request.json();
  const decidingTurnsText = typeof body.decidingTurnsText === "string"
    ? body.decidingTurnsText.trim()
    : "";

  if (decidingTurnsText.length > 2000) {
    return NextResponse.json(
      { error: "Deciding turns text must be 2000 characters or fewer" },
      { status: 400 }
    );
  }

  const [updated] = await db
    .update(matches)
    .set({ decidingTurnsText: decidingTurnsText || null })
    .where(eq(matches.id, matchId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: updated.id,
    decidingTurnsText: updated.decidingTurnsText,
  });
}
