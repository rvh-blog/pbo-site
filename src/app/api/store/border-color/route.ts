import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { coachPurchases, storeItems } from "@/lib/schema";
import { getSession } from "@/lib/session";
import { getCosmeticColorData } from "@/lib/glow-utils";
import { revalidateStoreCosmetics } from "@/lib/store-cache";

// POST /api/store/border-color - set the border color for row-border purchase
export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (session.type !== "coach") {
    return NextResponse.json(
      { error: "Only coaches can set border color" },
      { status: 403 }
    );
  }

  try {
    const { color } = await request.json();

    if (!getCosmeticColorData(color)) {
      return NextResponse.json(
        { error: "Invalid color selection" },
        { status: 400 }
      );
    }

    // Find the row-border item
    const borderItem = await db.query.storeItems.findFirst({
      where: eq(storeItems.slug, "row-border"),
    });

    if (!borderItem) {
      return NextResponse.json(
        { error: "Border item not found" },
        { status: 404 }
      );
    }

    // Find the user's purchase
    const purchase = await db.query.coachPurchases.findFirst({
      where: and(
        eq(coachPurchases.coachId, session.id),
        eq(coachPurchases.itemId, borderItem.id)
      ),
    });

    if (!purchase) {
      return NextResponse.json(
        { error: "You don't own this item" },
        { status: 403 }
      );
    }

    // Update the border color
    await db
      .update(coachPurchases)
      .set({ borderColor: color })
      .where(eq(coachPurchases.id, purchase.id));

    revalidateStoreCosmetics();

    return NextResponse.json({
      success: true,
      color,
    });
  } catch (error) {
    console.error("Border color update error:", error);
    return NextResponse.json(
      { error: "Failed to update border color" },
      { status: 500 }
    );
  }
}
