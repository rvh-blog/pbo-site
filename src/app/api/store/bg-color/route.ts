import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { coachPurchases, storeItems } from "@/lib/schema";
import { getSession } from "@/lib/session";
import { GLOW_COLORS, GlowColorKey } from "@/lib/glow-utils";

// POST /api/store/bg-color - set the background color for row-background purchase
export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (session.type !== "coach") {
    return NextResponse.json(
      { error: "Only coaches can set background color" },
      { status: 403 }
    );
  }

  try {
    const { color } = await request.json();

    if (!color || !GLOW_COLORS[color as GlowColorKey]) {
      return NextResponse.json(
        { error: "Invalid color selection" },
        { status: 400 }
      );
    }

    // Find the row-background item
    const bgItem = await db.query.storeItems.findFirst({
      where: eq(storeItems.slug, "row-background"),
    });

    if (!bgItem) {
      return NextResponse.json(
        { error: "Background item not found" },
        { status: 404 }
      );
    }

    // Find the user's purchase
    const purchase = await db.query.coachPurchases.findFirst({
      where: and(
        eq(coachPurchases.coachId, session.id),
        eq(coachPurchases.itemId, bgItem.id)
      ),
    });

    if (!purchase) {
      return NextResponse.json(
        { error: "You don't own this item" },
        { status: 403 }
      );
    }

    // Update the background color
    await db
      .update(coachPurchases)
      .set({ bgColor: color })
      .where(eq(coachPurchases.id, purchase.id));

    return NextResponse.json({
      success: true,
      color,
    });
  } catch (error) {
    console.error("Background color update error:", error);
    return NextResponse.json(
      { error: "Failed to update background color" },
      { status: 500 }
    );
  }
}
