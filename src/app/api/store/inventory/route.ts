import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { coachPurchases, coaches, users } from "@/lib/schema";
import { getSession } from "@/lib/session";

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

      return NextResponse.json({
        balance,
        purchases: purchases.map((p) => ({
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
