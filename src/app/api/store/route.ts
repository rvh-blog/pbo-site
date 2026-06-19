import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, and, ne } from "drizzle-orm";
import { storeItems } from "@/lib/schema";

// GET /api/store - list all active, purchasable store items (excludes admin-only badges)
export async function GET() {
  try {
    const items = await db.query.storeItems.findMany({
      where: and(eq(storeItems.isActive, true), ne(storeItems.category, "badge")),
      orderBy: (items, { asc }) => [asc(items.price)],
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Store API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch store items" },
      { status: 500 }
    );
  }
}
