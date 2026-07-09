import { NextResponse } from "next/server";
import { getSiteFeatureSettings } from "@/lib/site-settings";

export async function GET() {
  try {
    const settings = await getSiteFeatureSettings();

    return NextResponse.json({
      fantasyUiHidden: settings.fantasyUiHidden,
      blogUiHidden: settings.blogUiHidden,
      recentDraftPicksHidden: settings.recentDraftPicksHidden,
    });
  } catch (error) {
    console.error("Error fetching site feature settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}
