import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { divisions } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { filterPublicDivisions, getPublicVisibilityState, isPublicSeasonVisible } from "@/lib/public-visibility";

const PUBLIC_READ_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=120, s-maxage=600, stale-while-revalidate=1800",
};

const PRIVATE_READ_CACHE_HEADERS = {
  "Cache-Control": "private, no-store",
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const seasonId = searchParams.get("seasonId");
  const session = await getSession();
  const canSeePrivate = session?.isMod ?? false;
  const visibility = await getPublicVisibilityState();

  if (seasonId) {
    const divisionsList = await db.query.divisions.findMany({
      where: eq(divisions.seasonId, parseInt(seasonId)),
      with: {
        season: true,
      },
    });

    if (!canSeePrivate) {
      return NextResponse.json(
        filterPublicDivisions(divisionsList, visibility).filter((division) =>
          division.season ? isPublicSeasonVisible(division.season) : false
        ),
        { headers: PUBLIC_READ_CACHE_HEADERS }
      );
    }

    return NextResponse.json(divisionsList, { headers: PRIVATE_READ_CACHE_HEADERS });
  }

  const allDivisions = await db.query.divisions.findMany({
    with: {
      season: true,
    },
  });
  if (!canSeePrivate) {
    return NextResponse.json(
      filterPublicDivisions(allDivisions, visibility).filter((division) =>
        division.season ? isPublicSeasonVisible(division.season) : false
      ),
      { headers: PUBLIC_READ_CACHE_HEADERS }
    );
  }

  return NextResponse.json(allDivisions, { headers: PRIVATE_READ_CACHE_HEADERS });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, name, logoUrl } = body;

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  const updateData: { name?: string; logoUrl?: string | null } = {};
  if (name !== undefined) updateData.name = name;
  if (logoUrl !== undefined) updateData.logoUrl = logoUrl;

  const [division] = await db
    .update(divisions)
    .set(updateData)
    .where(eq(divisions.id, id))
    .returning();

  return NextResponse.json(division);
}
