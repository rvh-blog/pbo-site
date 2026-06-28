import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { siteSettings } from "@/lib/schema";

export const SITE_SETTING_KEYS = {
  bettingClosed: "betting_closed",
  bettingUiHidden: "betting_ui_hidden",
  fantasyUiHidden: "fantasy_ui_hidden",
  blogUiHidden: "blog_ui_hidden",
} as const;

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
  };
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
