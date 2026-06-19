import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { coachPurchases, storeItems } from "@/lib/schema";
import { getSession } from "@/lib/session";

// POST /api/store/toggle - toggle an owned item on/off
export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (session.type !== "coach") {
    return NextResponse.json(
      { error: "Only coaches can toggle items" },
      { status: 403 }
    );
  }

  try {
    const { purchaseId, isActive } = await request.json();

    if (purchaseId === undefined || isActive === undefined) {
      return NextResponse.json(
        { error: "purchaseId and isActive are required" },
        { status: 400 }
      );
    }

    // Find the purchase and verify ownership
    const purchase = await db.query.coachPurchases.findFirst({
      where: and(
        eq(coachPurchases.id, purchaseId),
        eq(coachPurchases.coachId, session.id)
      ),
      with: {
        item: true,
      },
    });

    if (!purchase) {
      return NextResponse.json(
        { error: "Purchase not found or not owned by you" },
        { status: 404 }
      );
    }

    // Track which purchases were deactivated
    let deactivatedPurchaseId: number | null = null;

    // If activating blue-team or red-team, deactivate the opposite
    if (isActive && (purchase.item?.slug === "blue-team" || purchase.item?.slug === "red-team")) {
      const oppositeSlug = purchase.item.slug === "blue-team" ? "red-team" : "blue-team";

      // Find the opposite item
      const oppositeItem = await db.query.storeItems.findFirst({
        where: eq(storeItems.slug, oppositeSlug),
      });

      if (oppositeItem) {
        // Find and deactivate the opposite purchase if active
        const oppositePurchase = await db.query.coachPurchases.findFirst({
          where: and(
            eq(coachPurchases.coachId, session.id),
            eq(coachPurchases.itemId, oppositeItem.id),
            eq(coachPurchases.isActive, true)
          ),
        });

        if (oppositePurchase) {
          await db
            .update(coachPurchases)
            .set({ isActive: false })
            .where(eq(coachPurchases.id, oppositePurchase.id));
          deactivatedPurchaseId = oppositePurchase.id;
        }
      }
    }

    // Update the active status
    await db
      .update(coachPurchases)
      .set({ isActive })
      .where(eq(coachPurchases.id, purchaseId));

    return NextResponse.json({
      success: true,
      purchaseId,
      isActive,
      deactivatedPurchaseId,
    });
  } catch (error) {
    console.error("Toggle error:", error);
    return NextResponse.json(
      { error: "Failed to toggle item" },
      { status: 500 }
    );
  }
}
