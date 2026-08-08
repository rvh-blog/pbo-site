import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import {
  getSiteFeatureSettings,
  SITE_SETTING_KEYS,
  upsertSiteSetting,
} from "@/lib/site-settings";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await getSiteFeatureSettings());
  } catch (error) {
    console.error("Error fetching betting settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      bettingClosed,
      bettingUiHidden,
      fantasyUiHidden,
      blogUiHidden,
      recentDraftPicksHidden,
      playoffCalculatorSearchEnabled,
    } = body;

    const updates: { key: string; value: string }[] = [];

    if (bettingClosed !== undefined) {
      updates.push({ key: SITE_SETTING_KEYS.bettingClosed, value: String(bettingClosed) });
    }

    if (bettingUiHidden !== undefined) {
      updates.push({ key: SITE_SETTING_KEYS.bettingUiHidden, value: String(bettingUiHidden) });
    }

    if (fantasyUiHidden !== undefined) {
      updates.push({ key: SITE_SETTING_KEYS.fantasyUiHidden, value: String(fantasyUiHidden) });
    }

    if (blogUiHidden !== undefined) {
      updates.push({ key: SITE_SETTING_KEYS.blogUiHidden, value: String(blogUiHidden) });
    }

    if (recentDraftPicksHidden !== undefined) {
      updates.push({ key: SITE_SETTING_KEYS.recentDraftPicksHidden, value: String(recentDraftPicksHidden) });
    }

    if (playoffCalculatorSearchEnabled !== undefined) {
      updates.push({ key: SITE_SETTING_KEYS.playoffCalculatorSearchEnabled, value: String(playoffCalculatorSearchEnabled) });
    }

    for (const update of updates) {
      await upsertSiteSetting(update.key, update.value === "true");
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
