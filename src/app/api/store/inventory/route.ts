import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { coachPurchases, coaches, storeItems, users } from "@/lib/schema";
import { getSession } from "@/lib/session";
import { hasCoachWonChampionship } from "@/lib/championship-utils";
import { CHAMPION_GOLD_LOGO_FRAME_SLUG } from "@/lib/logo-frame-items";

// GET /api/store/inventory - get user's purchased items
export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    // Get balance based on session type
    let balance = 0;

    if (session.type === "coach") {
      const coach = await db.query.coaches.findFirst({
        where: eq(coaches.id, session.id),
        columns: { pboCoin: true },
      });
      balance = coach?.pboCoin ?? 0;

      // Get all purchases with item details (only for coaches)
      const purchases = await db.query.coachPurchases.findMany({
        where: eq(coachPurchases.coachId, session.id),
        with: {
          item: true,
        },
        orderBy: (p, { desc }) => [desc(p.purchasedAt)],
      });

      const hasChampionship = await hasCoachWonChampionship(session.id);
      let inventoryPurchases = purchases;

      if (hasChampionship) {
        const championFrameItem = await db.query.storeItems.findFirst({
          where: eq(storeItems.slug, CHAMPION_GOLD_LOGO_FRAME_SLUG),
        });
        const hasChampionFramePurchase =
          championFrameItem &&
          purchases.some((p) => p.itemId === championFrameItem.id);

        if (championFrameItem && !hasChampionFramePurchase) {
          const [championFramePurchase] = await db
            .insert(coachPurchases)
            .values({
              coachId: session.id,
              itemId: championFrameItem.id,
              purchasedAt: new Date().toISOString(),
              isActive: true,
              bonusReason: "Championship winner",
            })
            .returning();

          inventoryPurchases = [
            {
              ...championFramePurchase,
              item: championFrameItem,
            },
            ...purchases,
          ];
        }
      }

      const activePurchases = inventoryPurchases.filter(
        (p) => p.item.isActive || p.item.slug === CHAMPION_GOLD_LOGO_FRAME_SLUG
      );

      return NextResponse.json({
        balance,
        purchases: activePurchases.map((p) => ({
          id: p.id,
          itemSlug: p.item.slug,
          itemName: p.item.name,
          itemDescription: p.item.description,
          purchasedAt: p.purchasedAt,
          expiresAt: p.expiresAt,
          isActive: p.isActive,
          glowColor: p.glowColor,
          bgColor: p.bgColor,
          borderColor: p.borderColor,
        })),
      });
    } else {
      // Spectator - just return balance (no store purchases)
      const user = await db.query.users.findFirst({
        where: eq(users.id, session.id),
        columns: { pboCoin: true },
      });
      balance = user?.pboCoin ?? 0;

      return NextResponse.json({
        balance,
        purchases: [], // Spectators can't purchase store items
      });
    }
  } catch (error) {
    console.error("Inventory API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch inventory" },
      { status: 500 }
    );
  }
}
