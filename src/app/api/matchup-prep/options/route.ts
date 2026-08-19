import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { divisions, matches } from "@/lib/schema";
import { getSession } from "@/lib/session";
import {
  getPublicVisibilityState,
  isDivisionPubliclyVisible,
  isPublicSeasonVisible,
} from "@/lib/public-visibility";

const PUBLIC_READ_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=120, s-maxage=600, stale-while-revalidate=1800",
};

const PRIVATE_READ_CACHE_HEADERS = {
  "Cache-Control": "private, no-store",
};

function parsePositiveInteger(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const divisionId = parsePositiveInteger(searchParams.get("divisionId"));
  const weekParam = searchParams.get("week");
  const week = weekParam === null ? null : parsePositiveInteger(weekParam);

  if (!divisionId || (weekParam !== null && !week)) {
    return NextResponse.json({ error: "Valid divisionId and week values are required" }, { status: 400 });
  }

  const [session, division, visibility] = await Promise.all([
    getSession(),
    db.query.divisions.findFirst({
      where: eq(divisions.id, divisionId),
      with: { season: true },
    }),
    getPublicVisibilityState(),
  ]);

  if (!division) {
    return NextResponse.json({ error: "Division not found" }, { status: 404 });
  }

  const canSeePrivate = session?.isMod ?? false;
  const canSeeSchedule = canSeePrivate || (
    division.season?.isSchedulePublic !== false &&
    division.season !== null &&
    isPublicSeasonVisible(division.season) &&
    isDivisionPubliclyVisible(division, visibility)
  );

  if (!canSeeSchedule) {
    return NextResponse.json({ error: "Schedule not available" }, { status: 404 });
  }

  const headers = canSeePrivate ? PRIVATE_READ_CACHE_HEADERS : PUBLIC_READ_CACHE_HEADERS;

  if (week === null) {
    const weekRows = await db
      .selectDistinct({ week: matches.week })
      .from(matches)
      .where(eq(matches.divisionId, divisionId))
      .orderBy(matches.week);

    return NextResponse.json({ weeks: weekRows.map((row) => row.week) }, { headers });
  }

  const weekMatches = await db.query.matches.findMany({
    where: and(eq(matches.divisionId, divisionId), eq(matches.week, week)),
    columns: {
      id: true,
      week: true,
      winnerId: true,
    },
    with: {
      coach1: {
        columns: { teamName: true },
        with: { coach: { columns: { name: true } } },
      },
      coach2: {
        columns: { teamName: true },
        with: { coach: { columns: { name: true } } },
      },
    },
    orderBy: [matches.id],
  });

  return NextResponse.json({
    matches: weekMatches.map((match) => ({
      id: match.id,
      week: match.week,
      coach1Name: match.coach1?.coach?.name || "Unknown",
      coach2Name: match.coach2?.coach?.name || "Unknown",
      coach1TeamName: match.coach1?.teamName || "Unknown",
      coach2TeamName: match.coach2?.teamName || "Unknown",
      winnerId: match.winnerId,
    })),
  }, { headers });
}
