import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { coachPurchases, storeItems } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

const TWITCH_BADGE_SLUG = "twitch-badge";

export async function GET() {
  try {
    const item = await db.query.storeItems.findFirst({
      where: eq(storeItems.slug, TWITCH_BADGE_SLUG),
    });

    if (!item) {
      return NextResponse.json({ coachIds: [] });
    }

    const purchases = await db.query.coachPurchases.findMany({
      where: and(
        eq(coachPurchases.itemId, item.id),
        eq(coachPurchases.isActive, true)
      ),
    });

    return NextResponse.json({
      coachIds: purchases.map((p) => p.coachId),
    });
  } catch (error) {
    console.error("Error fetching twitch badges:", error);
    return NextResponse.json(
      { error: "Failed to fetch twitch badges" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { coachId, grant } = body;

    if (!coachId || typeof coachId !== "number") {
      return NextResponse.json(
        { error: "coachId is required" },
        { status: 400 }
      );
    }

    const item = await db.query.storeItems.findFirst({
      where: eq(storeItems.slug, TWITCH_BADGE_SLUG),
    });

    if (!item) {
      return NextResponse.json(
        { error: "Twitch badge store item not found" },
        { status: 500 }
      );
    }

    if (grant) {
      // Check if already has badge
      const existing = await db.query.coachPurchases.findFirst({
        where: and(
          eq(coachPurchases.coachId, coachId),
          eq(coachPurchases.itemId, item.id),
          eq(coachPurchases.isActive, true)
        ),
      });

      if (!existing) {
        await db.insert(coachPurchases).values({
          coachId,
          itemId: item.id,
          purchasedAt: new Date().toISOString(),
          isActive: true,
          bonusReason: "Twitch Viewer Award",
        });
      }
    } else {
      // Revoke badge
      await db
        .update(coachPurchases)
        .set({ isActive: false })
        .where(
          and(
            eq(coachPurchases.coachId, coachId),
            eq(coachPurchases.itemId, item.id)
          )
        );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error toggling twitch badge:", error);
    return NextResponse.json(
      { error: "Failed to toggle twitch badge" },
      { status: 500 }
    );
  }
}
