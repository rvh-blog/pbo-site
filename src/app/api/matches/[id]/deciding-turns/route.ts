import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { matches } from "@/lib/schema";
import { getSession } from "@/lib/session";
import {
  getMatchDecidingTurnsEditorHiddenKey,
  getSiteSetting,
  upsertSiteSetting,
} from "@/lib/site-settings";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session?.isMod) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id } = await context.params;
  const matchId = Number(id);
  if (!Number.isInteger(matchId)) {
    return NextResponse.json({ error: "Invalid match id" }, { status: 400 });
  }

  const existingMatch = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
    columns: {
      id: true,
      decidingTurnsText: true,
    },
  });

  if (!existingMatch) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const body = await request.json();
  const hasTextUpdate = Object.prototype.hasOwnProperty.call(body, "decidingTurnsText");
  const hasEditorHiddenUpdate = Object.prototype.hasOwnProperty.call(body, "hideDecidingTurnsEditor");

  if (!hasTextUpdate && !hasEditorHiddenUpdate) {
    return NextResponse.json(
      { error: "No deciding turns update provided" },
      { status: 400 }
    );
  }

  const decidingTurnsText = hasTextUpdate && typeof body.decidingTurnsText === "string"
    ? body.decidingTurnsText.trim()
    : "";

  if (hasTextUpdate && decidingTurnsText.length > 2000) {
    return NextResponse.json(
      { error: "Deciding turns text must be 2000 characters or fewer" },
      { status: 400 }
    );
  }

  if (hasTextUpdate && typeof body.decidingTurnsText !== "string") {
    return NextResponse.json(
      { error: "Deciding turns text must be a string" },
      { status: 400 }
    );
  }

  if (hasEditorHiddenUpdate && typeof body.hideDecidingTurnsEditor !== "boolean") {
    return NextResponse.json(
      { error: "Hide editor value must be a boolean" },
      { status: 400 }
    );
  }

  let updatedText = existingMatch.decidingTurnsText;

  if (hasTextUpdate) {
    const [updated] = await db
      .update(matches)
      .set({ decidingTurnsText: decidingTurnsText || null })
      .where(eq(matches.id, matchId))
      .returning();

    updatedText = updated.decidingTurnsText;
  }

  const hiddenSettingKey = getMatchDecidingTurnsEditorHiddenKey(matchId);

  if (hasEditorHiddenUpdate) {
    await upsertSiteSetting(hiddenSettingKey, body.hideDecidingTurnsEditor);
  }

  const hiddenSetting = hasEditorHiddenUpdate
    ? { value: String(body.hideDecidingTurnsEditor) }
    : await getSiteSetting(hiddenSettingKey);

  return NextResponse.json({
    id: existingMatch.id,
    decidingTurnsText: updatedText,
    hideDecidingTurnsEditor: hiddenSetting?.value === "true",
  });
}
