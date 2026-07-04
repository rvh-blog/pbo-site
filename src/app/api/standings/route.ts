import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeAndSortStandings } from "@/lib/standings-sort";
import { filterPublicDivisions, getPublicVisibilityState, isDivisionPubliclyVisible, isPublicSeasonVisible } from "@/lib/public-visibility";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=120, s-maxage=600, stale-while-revalidate=1800",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const searchParams = url.searchParams;
  const seasonIdParam = searchParams.get("seasonId");
  const divisionIdParam = searchParams.get("divisionId");
  const visibility = await getPublicVisibilityState();

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const hostHeader = request.headers.get("host");
  const host = forwardedHost ?? hostHeader;
  const proto = forwardedProto ?? (host?.includes("localhost") || host?.startsWith("0.0.0.0") ? "http" : "https");
  const publicOrigin = host ? `${proto}://${host}` : url.origin;

  const absolutize = (u: string | null | undefined): string | null => {
    if (!u) return null;
    if (/^https?:\/\//i.test(u)) return u;
    return `${publicOrigin}${u.startsWith("/") ? u : "/" + u}`;
  };

  let season = null;
  if (seasonIdParam) {
    season = await db.query.seasons.findFirst({
      where: (s, { eq }) => eq(s.id, parseInt(seasonIdParam)),
      with: { divisions: true },
    });
  } else {
    season = await db.query.seasons.findFirst({
      where: (s, { eq, and }) => and(eq(s.isCurrent, true), eq(s.isPublic, true)),
      with: { divisions: true },
    });
    if (!season) {
      season = await db.query.seasons.findFirst({
        where: (s, { eq }) => eq(s.isPublic, true),
        orderBy: (s, { desc }) => [desc(s.seasonNumber)],
        with: { divisions: true },
      });
    }
  }

  if (!season) {
    return NextResponse.json({ error: "No season found" }, { status: 404, headers: CORS_HEADERS });
  }

  if (!isPublicSeasonVisible(season)) {
    return NextResponse.json({ error: "No season found" }, { status: 404, headers: CORS_HEADERS });
  }

  const divs = filterPublicDivisions(season.divisions ?? [], visibility);
  if (divs.length === 0) {
    return NextResponse.json({ error: "No divisions in season" }, { status: 404, headers: CORS_HEADERS });
  }

  const division = divisionIdParam
    ? divs.find((d) => d.id === parseInt(divisionIdParam))
    : [...divs].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))[0];

  if (!division) {
    return NextResponse.json({ error: "Division not found" }, { status: 404, headers: CORS_HEADERS });
  }
  if (!isDivisionPubliclyVisible(division, visibility)) {
    return NextResponse.json({ error: "Division not found" }, { status: 404, headers: CORS_HEADERS });
  }

  const divisionCoaches = await db.query.seasonCoaches.findMany({
    where: (sc, { eq }) => eq(sc.divisionId, division.id),
    with: { coach: true },
  });

  const divisionMatches = await db.query.matches.findMany({
    where: (m, { eq }) => eq(m.divisionId, division.id),
  });

  const replacementMap = new Map<number, number[]>();
  for (const sc of divisionCoaches) {
    if (!sc.isActive && sc.replacedById) {
      const preds = replacementMap.get(sc.replacedById) ?? [];
      preds.push(sc.id);
      replacementMap.set(sc.replacedById, preds);
    }
  }

  const activeCoaches = divisionCoaches.filter((sc) => sc.isActive);
  const sorted = computeAndSortStandings(activeCoaches, replacementMap, divisionMatches);

  const standings = sorted.map((s, i) => ({
    rank: i + 1,
    seasonCoachId: s.id,
    coachId: s.coachId,
    coachName: s.coach?.name ?? null,
    teamName: s.teamName,
    teamAbbreviation: s.teamAbbreviation,
    teamLogoUrl: absolutize(s.teamLogoUrl),
    wins: s.wins,
    losses: s.losses,
    differential: s.differential,
    eloRating: s.coach?.eloRating ?? null,
  }));

  const sortedDivisions = [...divs]
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
    .map((d) => ({ id: d.id, name: d.name, logoUrl: absolutize(d.logoUrl) }));

  return NextResponse.json(
    {
      season: { id: season.id, name: season.name, seasonNumber: season.seasonNumber },
      division: {
        id: division.id,
        name: division.name,
        logoUrl: absolutize(division.logoUrl),
      },
      divisions: sortedDivisions,
      standings,
    },
    { headers: CORS_HEADERS },
  );
}
