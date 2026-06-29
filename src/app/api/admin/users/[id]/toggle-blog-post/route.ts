import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/schema";
import { isAuthenticated } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const coachId = Number.parseInt(id, 10);

    if (!Number.isInteger(coachId)) {
      return NextResponse.json({ error: "Valid coach id is required" }, { status: 400 });
    }

    const coach = await db.query.coaches.findFirst({
      where: eq(schema.coaches.id, coachId),
    });

    if (!coach) {
      return NextResponse.json({ error: "Coach not found" }, { status: 404 });
    }

    const canPostBlog = !(coach.canPostBlog ?? false);
    await db
      .update(schema.coaches)
      .set({ canPostBlog })
      .where(eq(schema.coaches.id, coachId));

    return NextResponse.json({ success: true, canPostBlog });
  } catch (error) {
    console.error("Error toggling blog post permission:", error);
    return NextResponse.json(
      { error: "Failed to toggle blog post permission" },
      { status: 500 }
    );
  }
}
