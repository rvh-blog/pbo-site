export const PROJECT_MEW_RELEASE_AT = "2026-07-04T00:00:00.000Z";

export function isProjectMewReleased(now = Date.now()) {
  return now >= Date.parse(PROJECT_MEW_RELEASE_AT);
}
