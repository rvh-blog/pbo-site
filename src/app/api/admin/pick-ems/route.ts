import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { siteSettings } from "@/lib/schema";
import { eq } from "drizzle-orm";

const BETTING_CLOSED_KEY = "betting_closed";
const BETTING_UI_HIDDEN_KEY = "betting_ui_hidden";

export async function GET() {
  try {
    const settings = await db.query.siteSettings.findMany({
      where: (s, { inArray }) => inArray(s.key, [BETTING_CLOSED_KEY, BETTING_UI_HIDDEN_KEY]),
    });

    const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

    return NextResponse.json({
      bettingClosed: settingsMap.get(BETTING_CLOSED_KEY) === "true",
      bettingUiHidden: settingsMap.get(BETTING_UI_HIDDEN_KEY) === "true",
    });
  } catch (error) {
    console.error("Error fetching betting settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { bettingClosed, bettingUiHidden } = body;

    const updates: { key: string; value: string }[] = [];

    if (bettingClosed !== undefined) {
      updates.push({ key: BETTING_CLOSED_KEY, value: String(bettingClosed) });
    }

    if (bettingUiHidden !== undefined) {
      updates.push({ key: BETTING_UI_HIDDEN_KEY, value: String(bettingUiHidden) });
    }

    for (const update of updates) {
      // Upsert: try to update, if no rows affected then insert
      const existing = await db.query.siteSettings.findFirst({
        where: eq(siteSettings.key, update.key),
      });

      if (existing) {
        await db
          .update(siteSettings)
          .set({ value: update.value, updatedAt: new Date().toISOString() })
          .where(eq(siteSettings.key, update.key));
      } else {
        await db.insert(siteSettings).values({
          key: update.key,
          value: update.value,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating betting settings:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
