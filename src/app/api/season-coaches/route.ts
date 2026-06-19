import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seasonCoaches } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const divisionId = searchParams.get("divisionId");

  let query: Parameters<typeof db.query.seasonCoaches.findMany>[0] = {
    with: {
      coach: true,
    },
  };

  if (divisionId) {
    query.where = eq(seasonCoaches.divisionId, parseInt(divisionId));
  }

  const coaches = await db.query.seasonCoaches.findMany(query);
  return NextResponse.json(coaches);
}
