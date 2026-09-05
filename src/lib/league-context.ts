export type LeagueContext = {
  seasonId?: number;
  divisionId?: number;
  seasonName?: string;
  divisionName?: string;
  week?: number;
  teamId?: number; // season_coaches.id, never a persistent coach ID
  matchId?: number;
};

export function positiveId(value: string | null | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

/** Explicit destination filters win. Each destination keeps its native parameter names. */
export function leagueHref(href: string, context: LeagueContext): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const url = new URL(href, "https://pbo.invalid");
  const params = url.searchParams;
  const put = (key: string, value: number | string | undefined) => {
    if (value !== undefined && !params.has(key)) params.set(key, String(value));
  };
  const explicitSeason = params.has("season") || params.has("seasonId");
  const explicitDivision = params.has("division") || params.has("divisionId");
  const explicitMatchScope = explicitSeason || explicitDivision || params.has("week") || params.has("teamId");
  // An explicitly scoped destination must not inherit unrelated child filters.
  const season = explicitSeason || explicitDivision ? undefined : context.seasonId;
  const division = explicitSeason || explicitDivision ? undefined : context.divisionId;
  if (["/compare", "/leaderboards/items"].includes(url.pathname)) {
    put(url.pathname === "/leaderboards/items" ? "seasonId" : "season", season);
    put("division", division);
    if (!explicitSeason && !explicitDivision) {
      put("week", context.week);
      put("teamId", context.teamId);
      if (!explicitMatchScope) put("matchId", context.matchId);
    }
  } else if (["/matchup-prep", "/pick-ems"].includes(url.pathname)) {
    if (params.has("matchId")) return href;
    put("seasonId", season);
    put("divisionId", division);
    if (!explicitSeason && !explicitDivision) {
      put("week", context.week);
      put("teamId", context.teamId);
      if (url.pathname === "/matchup-prep" && !explicitMatchScope) put("matchId", context.matchId);
    }
  } else if (/^\/seasons\/\d+\/divisions\/\d+(\/rosters|\/transactions)?$/.test(url.pathname)) {
    const parts = url.pathname.split("/");
    if (Number(parts[2]) === context.seasonId && Number(parts[4]) === context.divisionId) {
      put("week", context.week);
      put("teamId", context.teamId);
    }
  } else return href;
  return `${url.pathname}${params.size ? `?${params}` : ""}${url.hash}`;
}
