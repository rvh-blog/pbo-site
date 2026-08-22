import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { coachPurchases, storeItems } from "@/lib/schema";
import { getSession } from "@/lib/session";
import { getCosmeticColorData } from "@/lib/glow-utils";
import { revalidateStoreCosmetics } from "@/lib/store-cache";

// Available glow colors
export const GLOW_COLORS = {
  // Division colors
  stargazer: { name: "Stargazer", color: "#3b82f6", glow: "rgba(59, 130, 246, 0.6)" },
  sunset: { name: "Sunset", color: "#fb923c", glow: "rgba(251, 146, 60, 0.6)" },
  crystal: { name: "Crystal", color: "#c084fc", glow: "rgba(192, 132, 252, 0.6)" },
  neon: { name: "Neon", color: "#4ade80", glow: "rgba(74, 222, 128, 0.6)" },
  // Other cool colors
  gold: { name: "Gold", color: "#fbbf24", glow: "rgba(251, 191, 36, 0.6)" },
  ruby: { name: "Ruby", color: "#f43f5e", glow: "rgba(244, 63, 94, 0.6)" },
  cyan: { name: "Cyan", color: "#22d3ee", glow: "rgba(34, 211, 238, 0.6)" },
  pink: { name: "Pink", color: "#f472b6", glow: "rgba(244, 114, 182, 0.6)" },
  white: { name: "White", color: "#f8fafc", glow: "rgba(248, 250, 252, 0.5)" },
};

export type GlowColorKey = keyof typeof GLOW_COLORS;

// POST /api/store/glow-color - set the glow color for team-name-glow purchase
export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (session.type !== "coach") {
    return NextResponse.json(
      { error: "Only coaches can set glow color" },
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

    // Find the team-name-glow item
    const glowItem = await db.query.storeItems.findFirst({
      where: eq(storeItems.slug, "team-name-glow"),
    });

    if (!glowItem) {
      return NextResponse.json(
        { error: "Glow item not found" },
        { status: 404 }
      );
    }

    // Find the user's purchase
    const purchase = await db.query.coachPurchases.findFirst({
      where: and(
        eq(coachPurchases.coachId, session.id),
        eq(coachPurchases.itemId, glowItem.id)
      ),
    });

    if (!purchase) {
      return NextResponse.json(
        { error: "You don't own this item" },
        { status: 403 }
      );
    }

    // Update the glow color
    await db
      .update(coachPurchases)
      .set({ glowColor: color })
      .where(eq(coachPurchases.id, purchase.id));

    revalidateStoreCosmetics();

    return NextResponse.json({
      success: true,
      color,
    });
  } catch (error) {
    console.error("Glow color update error:", error);
    return NextResponse.json(
      { error: "Failed to update glow color" },
      { status: 500 }
    );
  }
}

// GET /api/store/glow-color - get available colors
export async function GET() {
  return NextResponse.json({
    colors: GLOW_COLORS,
  });
}
