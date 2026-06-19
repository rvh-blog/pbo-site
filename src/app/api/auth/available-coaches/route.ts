import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isNull } from "drizzle-orm";
import * as schema from "@/lib/schema";

// GET /api/auth/available-coaches - list coaches that haven't been claimed
export async function GET() {
  try {
    const unclaimedCoaches = await db.query.coaches.findMany({
      where: isNull(schema.coaches.passwordHash),
      columns: {
        id: true,
        name: true,
      },
      orderBy: (coaches, { asc }) => [asc(coaches.name)],
    });

    return NextResponse.json({ coaches: unclaimedCoaches });
  } catch (error) {
    console.error("Error fetching available coaches:", error);
    return NextResponse.json(
      { error: "Failed to fetch available coaches" },
      { status: 500 }
    );
  }
}
