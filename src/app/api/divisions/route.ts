import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { divisions } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const seasonId = searchParams.get("seasonId");

  if (seasonId) {
    const divisionsList = await db.query.divisions.findMany({
      where: eq(divisions.seasonId, parseInt(seasonId)),
    });
    return NextResponse.json(divisionsList);
  }

  const allDivisions = await db.query.divisions.findMany({
    with: {
      season: true,
    },
  });
  return NextResponse.json(allDivisions);
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
