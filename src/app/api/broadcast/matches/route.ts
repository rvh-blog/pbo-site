import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { matches } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const divisionId = searchParams.get("divisionId");

  if (!divisionId) {
    return NextResponse.json({ error: "divisionId required" }, { status: 400 });
  }

  const divMatches = await db.query.matches.findMany({
    where: eq(matches.divisionId, parseInt(divisionId)),
    with: {
      coach1: true,
      coach2: true,
    },
    orderBy: (matches, { asc }) => [asc(matches.week)],
  });

  const result = divMatches.map((m) => ({
    id: m.id,
    week: m.week,
    coach1TeamName: m.coach1?.teamName || "TBD",
    coach2TeamName: m.coach2?.teamName || "TBD",
    isPlayed: m.winnerId !== null,
  }));

  return NextResponse.json(result);
}
