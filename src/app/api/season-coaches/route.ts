import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { divisions, seasonCoaches } from "@/lib/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getPublicVisibilityState, isDivisionPubliclyVisible, isPublicSeasonVisible } from "@/lib/public-visibility";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const divisionId = searchParams.get("divisionId");
  const session = await getSession();
  const canSeePrivate = session?.isMod ?? false;

  const conditions = [];
  if (divisionId) conditions.push(eq(divisions.id, parseInt(divisionId)));

  if (!canSeePrivate) {
    const visibility = await getPublicVisibilityState();
    const visibleDivisions = await db.query.divisions.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      columns: { id: true, name: true },
      with: { season: { columns: { isPublic: true } } },
    });
    const visibleDivisionIds = visibleDivisions
      .filter((division) =>
        isDivisionPubliclyVisible(division, visibility) &&
        division.season &&
        isPublicSeasonVisible(division.season)
      )
      .map((division) => division.id);

    if (visibleDivisionIds.length === 0) return NextResponse.json([]);
    conditions.push(inArray(seasonCoaches.divisionId, visibleDivisionIds));
  }

  const coaches = await db.query.seasonCoaches.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    with: {
      coach: { columns: { id: true, name: true, eloRating: true } },
    },
  });
  return NextResponse.json(coaches);
}
