import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { discordUserPreferences } from "@/lib/schema";

export const DISCORD_TIMEZONES = [
  { value: "America/Los_Angeles", name: "Pacific Time" },
  { value: "America/Denver", name: "Mountain Time" },
  { value: "America/Chicago", name: "Central Time" },
  { value: "America/New_York", name: "Eastern Time" },
  { value: "Europe/London", name: "United Kingdom Time" },
] as const;

export type SupportedTimezone = (typeof DISCORD_TIMEZONES)[number]["value"];

export function isSupportedTimezone(value: string): value is SupportedTimezone {
  return DISCORD_TIMEZONES.some((timezone) => timezone.value === value);
}

export async function getDiscordTimezone(
  discordUserId: string
): Promise<SupportedTimezone | null> {
  const [preference] = await db
    .select({ timezone: discordUserPreferences.timezone })
    .from(discordUserPreferences)
    .where(eq(discordUserPreferences.discordUserId, discordUserId))
    .limit(1);

  return preference && isSupportedTimezone(preference.timezone)
    ? preference.timezone
    : null;
}

export async function setDiscordTimezone(
  discordUserId: string,
  timezone: SupportedTimezone
): Promise<void> {
  const now = new Date().toISOString();

  await db
    .insert(discordUserPreferences)
    .values({
      discordUserId,
      timezone,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: discordUserPreferences.discordUserId,
      set: {
        timezone,
        updatedAt: now,
      },
    });
}
