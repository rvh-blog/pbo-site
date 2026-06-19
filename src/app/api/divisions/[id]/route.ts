import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { divisions } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const divisionId = parseInt(id);

  const division = await db.query.divisions.findFirst({
    where: eq(divisions.id, divisionId),
    with: {
      season: true,
    },
  });

  if (!division) {
    return NextResponse.json({ error: "Division not found" }, { status: 404 });
  }

  return NextResponse.json(division);
}
