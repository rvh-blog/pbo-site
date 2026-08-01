import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { siteSettings } from "@/lib/schema";

export const SITE_SETTING_KEYS = {
  bettingClosed: "betting_closed",
  bettingUiHidden: "betting_ui_hidden",
  fantasyUiHidden: "fantasy_ui_hidden",
  blogUiHidden: "blog_ui_hidden",
  recentDraftPicksHidden: "recent_draft_picks_hidden",
  infinityDivisionReleased: "infinity_division_released",
} as const;

export function getMatchDecidingTurnsEditorHiddenKey(matchId: number) {
  return `match_${matchId}_deciding_turns_editor_hidden`;
}

export function getMatchDecidingTurnsPublishedKey(matchId: number) {
  return `match_${matchId}_deciding_turns_published`;
}

export async function getSiteFeatureSettings() {
  const settings = await db.query.siteSettings.findMany({
    where: (s, { inArray }) => inArray(s.key, Object.values(SITE_SETTING_KEYS)),
  });
  const settingsMap = new Map(settings.map((setting) => [setting.key, setting.value]));

  return {
    bettingClosed: settingsMap.get(SITE_SETTING_KEYS.bettingClosed) === "true",
    bettingUiHidden: settingsMap.get(SITE_SETTING_KEYS.bettingUiHidden) === "true",
    fantasyUiHidden: settingsMap.get(SITE_SETTING_KEYS.fantasyUiHidden) === "true",
    blogUiHidden: settingsMap.get(SITE_SETTING_KEYS.blogUiHidden) === "true",
    recentDraftPicksHidden: settingsMap.get(SITE_SETTING_KEYS.recentDraftPicksHidden) === "true",
  };
}

export async function getSiteSetting(key: string) {
  return await db.query.siteSettings.findFirst({
    where: eq(siteSettings.key, key),
  });
}

export async function upsertSiteSetting(key: string, value: boolean) {
  const existing = await db.query.siteSettings.findFirst({
    where: eq(siteSettings.key, key),
  });
  const updatedAt = new Date().toISOString();

  if (existing) {
    await db
      .update(siteSettings)
      .set({ value: String(value), updatedAt })
      .where(eq(siteSettings.key, key));
  } else {
    await db.insert(siteSettings).values({
      key,
      value: String(value),
      updatedAt,
    });
  }
}
