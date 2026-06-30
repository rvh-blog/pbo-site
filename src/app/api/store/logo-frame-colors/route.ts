import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { coachPurchases, storeItems } from "@/lib/schema";
import { getSession } from "@/lib/session";
import {
  getDefaultLogoFrameColors,
  isCustomizableLogoFrameSlug,
} from "@/lib/logo-frame-items";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (session.type !== "coach") {
    return NextResponse.json(
      { error: "Only coaches can set logo frame colors" },
      { status: 403 }
    );
  }

  try {
    const { itemSlug, colors } = await request.json();

    if (!itemSlug || !isCustomizableLogoFrameSlug(itemSlug)) {
      return NextResponse.json(
        { error: "This logo frame does not support custom colors" },
        { status: 400 }
      );
    }

    const defaultColors = getDefaultLogoFrameColors(itemSlug);

    if (
      !Array.isArray(colors) ||
      colors.length !== defaultColors.length ||
      !colors.every((color) => typeof color === "string" && HEX_COLOR.test(color))
    ) {
      return NextResponse.json(
        { error: "Invalid logo frame colors" },
        { status: 400 }
      );
    }

    const item = await db.query.storeItems.findFirst({
      where: eq(storeItems.slug, itemSlug),
    });

    if (!item) {
      return NextResponse.json(
        { error: "Logo frame item not found" },
        { status: 404 }
      );
    }

    const purchase = await db.query.coachPurchases.findFirst({
      where: and(
        eq(coachPurchases.coachId, session.id),
        eq(coachPurchases.itemId, item.id)
      ),
    });

    if (!purchase) {
      return NextResponse.json(
        { error: "You don't own this logo frame" },
        { status: 403 }
      );
    }

    await db
      .update(coachPurchases)
      .set({ borderColor: JSON.stringify(colors) })
      .where(eq(coachPurchases.id, purchase.id));

    return NextResponse.json({
      success: true,
      itemSlug,
      colors,
    });
  } catch (error) {
    console.error("Logo frame color update error:", error);
    return NextResponse.json(
      { error: "Failed to update logo frame colors" },
      { status: 500 }
    );
  }
}
