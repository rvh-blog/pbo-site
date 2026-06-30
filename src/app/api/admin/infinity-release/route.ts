import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getPublicVisibilityState } from "@/lib/public-visibility";
import { SITE_SETTING_KEYS, upsertSiteSetting } from "@/lib/site-settings";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const visibility = await getPublicVisibilityState();

  return NextResponse.json({
    revealAt: visibility.infinityDivisionRevealAt.toISOString(),
    isReleased: visibility.infinityDivisionReleased,
    isManuallyReleased: visibility.infinityDivisionManuallyReleased,
  });
}

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const action = body?.action;

  if (action !== "release" && action !== "restoreSchedule") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  await upsertSiteSetting(
    SITE_SETTING_KEYS.infinityDivisionReleased,
    action === "release"
  );

  const visibility = await getPublicVisibilityState();

  return NextResponse.json({
    revealAt: visibility.infinityDivisionRevealAt.toISOString(),
    isReleased: visibility.infinityDivisionReleased,
    isManuallyReleased: visibility.infinityDivisionManuallyReleased,
  });
}

