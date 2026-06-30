import { getSiteSetting, SITE_SETTING_KEYS } from "@/lib/site-settings";

const INFINITY_DIVISION_REVEAL_AT = new Date("2026-07-03T17:15:00-07:00");

export type PublicVisibilityState = {
  infinityDivisionRevealAt: Date;
  infinityDivisionReleased: boolean;
  infinityDivisionManuallyReleased: boolean;
  hiddenDivisionNames: Set<string>;
};

function getScheduledPublicVisibilityState(): PublicVisibilityState {
  const infinityDivisionReleased = new Date() >= INFINITY_DIVISION_REVEAL_AT;

  return {
    infinityDivisionRevealAt: INFINITY_DIVISION_REVEAL_AT,
    infinityDivisionReleased,
    infinityDivisionManuallyReleased: false,
    hiddenDivisionNames: infinityDivisionReleased ? new Set<string>() : new Set(["infinity"]),
  };
}

export async function getPublicVisibilityState(): Promise<PublicVisibilityState> {
  const releaseSetting = await getSiteSetting(SITE_SETTING_KEYS.infinityDivisionReleased);
  const manuallyReleased = releaseSetting?.value === "true";
  const scheduledReleased = new Date() >= INFINITY_DIVISION_REVEAL_AT;
  const infinityDivisionReleased = manuallyReleased || scheduledReleased;

  return {
    infinityDivisionRevealAt: INFINITY_DIVISION_REVEAL_AT,
    infinityDivisionReleased,
    infinityDivisionManuallyReleased: manuallyReleased,
    hiddenDivisionNames: infinityDivisionReleased ? new Set<string>() : new Set(["infinity"]),
  };
}

export function isPublicSeasonVisible(season: { isPublic?: boolean | null }) {
  return season.isPublic !== false;
}

export function isDivisionPubliclyVisible(
  division: { name?: string | null },
  visibility: Pick<PublicVisibilityState, "hiddenDivisionNames"> = getScheduledPublicVisibilityState()
) {
  const name = division.name?.trim().toLowerCase();
  return !name || !visibility.hiddenDivisionNames.has(name);
}

export function filterPublicDivisions<T extends { name?: string | null }>(
  divisions: T[],
  visibility: Pick<PublicVisibilityState, "hiddenDivisionNames"> = getScheduledPublicVisibilityState()
) {
  return divisions.filter((division) => isDivisionPubliclyVisible(division, visibility));
}
