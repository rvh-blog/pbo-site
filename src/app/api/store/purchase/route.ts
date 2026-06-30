import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, and, inArray } from "drizzle-orm";
import { storeItems, coachPurchases, coaches, bets } from "@/lib/schema";
import { getSession } from "@/lib/session";

// POST /api/store/purchase - buy an item
export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (session.type !== "coach") {
    return NextResponse.json(
      { error: "Only coaches can purchase items" },
      { status: 403 }
    );
  }

  try {
    const { itemSlug } = await request.json();

    if (!itemSlug) {
      return NextResponse.json(
        { error: "Item slug is required" },
        { status: 400 }
      );
    }

    // Get the item
    const item = await db.query.storeItems.findFirst({
      where: and(
        eq(storeItems.slug, itemSlug),
        eq(storeItems.isActive, true)
      ),
    });

    if (!item) {
      return NextResponse.json(
        { error: "Item not found or not available" },
        { status: 404 }
      );
    }

    // Get coach's current balance
    const coach = await db.query.coaches.findFirst({
      where: eq(coaches.id, session.id),
      columns: { pboCoin: true },
    });

    if (!coach) {
      return NextResponse.json({ error: "Coach not found" }, { status: 404 });
    }

    // Get pending bets to calculate available balance
    const pendingBets = await db.query.bets.findMany({
      where: and(
        eq(bets.coachId, session.id),
        eq(bets.status, "pending")
      ),
      columns: { amount: true },
    });

    const totalPending = pendingBets.reduce((sum, b) => sum + b.amount, 0);
    const availableBalance = coach.pboCoin - totalPending;

    // Check available balance (accounting for pending bets)
    if (availableBalance < item.price) {
      return NextResponse.json(
        { error: `Insufficient balance. You have ${availableBalance} PBOcoin available (${totalPending} committed to bets), but this item costs ${item.price}.` },
        { status: 400 }
      );
    }

    // Check max_per_user limit
    if (item.maxPerUser !== null) {
      const existingPurchases = await db.query.coachPurchases.findMany({
        where: and(
          eq(coachPurchases.coachId, session.id),
          eq(coachPurchases.itemId, item.id)
        ),
      });

      if (existingPurchases.length >= item.maxPerUser) {
        return NextResponse.json(
          { error: "You already own this item" },
          { status: 400 }
        );
      }
    }

    // Deduct coins and create purchase atomically
    const newBalance = coach.pboCoin - item.price;

    await db
      .update(coaches)
      .set({ pboCoin: newBalance })
      .where(eq(coaches.id, session.id));

    // Track which purchases were deactivated by mutually exclusive cosmetics
    let deactivatedPurchaseId: number | null = null;
    let deactivatedPurchaseIds: number[] = [];

    // If purchasing blue-team or red-team, deactivate the opposite
    if (item.slug === "blue-team" || item.slug === "red-team") {
      const oppositeSlug = item.slug === "blue-team" ? "red-team" : "blue-team";

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
          deactivatedPurchaseIds = [oppositePurchase.id];
        }
      }
    }

    if (item.category === "logo_frame") {
      const logoFrameItems = await db.query.storeItems.findMany({
        where: eq(storeItems.category, "logo_frame"),
        columns: { id: true },
      });
      const logoFrameItemIds = logoFrameItems
        .map((logoFrameItem) => logoFrameItem.id)
        .filter((id) => id !== item.id);

      if (logoFrameItemIds.length > 0) {
        const activeLogoFramePurchases = await db.query.coachPurchases.findMany({
          where: and(
            eq(coachPurchases.coachId, session.id),
            inArray(coachPurchases.itemId, logoFrameItemIds),
            eq(coachPurchases.isActive, true)
          ),
          columns: { id: true },
        });

        if (activeLogoFramePurchases.length > 0) {
          const activeLogoFramePurchaseIds = activeLogoFramePurchases.map((purchase) => purchase.id);
          await db
            .update(coachPurchases)
            .set({ isActive: false })
            .where(inArray(coachPurchases.id, activeLogoFramePurchaseIds));
          deactivatedPurchaseIds = [...deactivatedPurchaseIds, ...activeLogoFramePurchaseIds];
        }
      }
    }

    const [purchase] = await db
      .insert(coachPurchases)
      .values({
        coachId: session.id,
        itemId: item.id,
        purchasedAt: new Date().toISOString(),
        isActive: true,
      })
      .returning();

    return NextResponse.json({
      success: true,
      purchase,
      newBalance,
      item: {
        slug: item.slug,
        name: item.name,
      },
      deactivatedPurchaseId,
      deactivatedPurchaseIds,
    });
  } catch (error) {
    console.error("Purchase error:", error);
    return NextResponse.json(
      { error: "Failed to complete purchase" },
      { status: 500 }
    );
  }
}
