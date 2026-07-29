import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { discordUserPreferences } from "@/lib/schema";

const TIMEZONE_NAME_OVERRIDES: Record<string, string> = {
  UTC: "Coordinated Universal Time",
  "America/Los_Angeles": "Pacific Time",
  "America/Denver": "Mountain Time",
  "America/Chicago": "Central Time",
  "America/New_York": "Eastern Time",
  "America/Anchorage": "Alaska Time",
  "Pacific/Honolulu": "Hawaii Time",
  "America/Phoenix": "Arizona Time",
  "Europe/London": "United Kingdom Time",
};

function getSupportedTimezoneValues(): string[] {
  const supportedValuesOf = (
    Intl as typeof Intl & {
      supportedValuesOf?: (key: "timeZone") => string[];
    }
  ).supportedValuesOf;
  const values = supportedValuesOf?.("timeZone") ?? Object.keys(TIMEZONE_NAME_OVERRIDES);
  return Array.from(new Set(["UTC", ...values])).sort((a, b) => a.localeCompare(b));
}

function getTimezoneName(value: string): string {
  const overridden = TIMEZONE_NAME_OVERRIDES[value];
  if (overridden) return overridden;

  const parts = value.split("/");
  const location = parts.slice(1).map((part) => part.replaceAll("_", " "));
  if (location.length === 0) return value.replaceAll("_", " ");
  if (location.length === 1) return location[0];
  return `${location.at(-1)}, ${location.slice(0, -1).join(", ")}`;
}

export const DISCORD_TIMEZONES = getSupportedTimezoneValues().map((value) => ({
  value,
  name: getTimezoneName(value),
}));

export type SupportedTimezone = string;

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
