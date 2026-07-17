import { db } from "@/lib/db";
import { seasons, seasonCoaches, matches } from "@/lib/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { PowerRankingsClient } from "./power-rankings-client";
import { computeAndSortStandings } from "@/lib/standings-sort";
import { compareDivisions } from "@/lib/division-order";

export const metadata = {
  title: "Power Rankings",
};

export const dynamic = "force-dynamic";

export default async function PowerRankingsPage() {
  // Fetch all seasons with their divisions
  const allSeasons = await db.query.seasons.findMany({
    where: eq(seasons.isPublic, true),
    with: {
      divisions: true,
    },
    orderBy: [desc(seasons.seasonNumber)],
  });

  // Sort divisions within each season by the permanent hierarchy.
  for (const season of allSeasons) {
    season.divisions.sort(compareDivisions);
  }

  // Preload every public season through one shared server-side standings path.
  const allDivisions = allSeasons.flatMap((season) => season.divisions);
  const divisionIds = allDivisions.map((division) => division.id);
  const preloadedData: Record<number, {
    id: number;
    teamName: string;
    teamAbbreviation: string | null;
    teamLogoUrl: string | null;
    coachName: string | null;
    isActive: boolean | null;
    wins: number;
    losses: number;
    differential: number;
    eloRating: number;
    movement: number;
    recentForm: ("W" | "L")[];
    streak: string;
    lastResult: { result: "W" | "L"; opponent: string; score: string } | null;
  }[]> = {};

  if (divisionIds.length > 0) {
    const [allCoaches, allMatches] = await Promise.all([
      db.query.seasonCoaches.findMany({
        where: inArray(seasonCoaches.divisionId, divisionIds),
        with: { coach: true },
      }),
      db.query.matches.findMany({
        where: inArray(matches.divisionId, divisionIds),
      }),
    ]);

    for (const div of allDivisions) {
      const divCoaches = allCoaches.filter((coach) => coach.divisionId === div.id);
      const divMatches = allMatches.filter((match) => match.divisionId === div.id);

      // Build replacement map
      const replacementMap = new Map<number, number[]>();
      for (const sc of divCoaches) {
        if (!sc.isActive && sc.replacedById) {
          const predecessors = replacementMap.get(sc.replacedById) || [];
          predecessors.push(sc.id);
          replacementMap.set(sc.replacedById, predecessors);
        }
      }

      const activeCoaches = divCoaches.filter((sc) => sc.isActive);
      const standings = computeAndSortStandings(activeCoaches, replacementMap, divMatches)
        .map((standing) => ({ ...standing }));

      const completedMatches = divMatches.filter((match) => match.week <= 100 && match.winnerId !== null);
      const latestCompletedWeek = completedMatches.reduce((latest, match) => Math.max(latest, match.week), 0);
      const previousStandings = computeAndSortStandings(
        activeCoaches,
        replacementMap,
        divMatches.filter((match) => match.week < latestCompletedWeek)
      );
      const previousRank = new Map(previousStandings.map((standing, index) => [standing.id, index]));

      const idsByActiveCoach = new Map(
        activeCoaches.map((coach) => [coach.id, new Set([coach.id, ...(replacementMap.get(coach.id) || [])])])
      );
      const resolveActiveCoach = (seasonCoachId: number) =>
        activeCoaches.find((coach) => idsByActiveCoach.get(coach.id)?.has(seasonCoachId));

      preloadedData[div.id] = standings.map((standing, currentIndex) => {
        const teamIds = idsByActiveCoach.get(standing.id) || new Set([standing.id]);
        const teamMatches = completedMatches
          .filter((match) => teamIds.has(match.coach1SeasonId) || teamIds.has(match.coach2SeasonId))
          .sort((a, b) => b.week - a.week || b.id - a.id);
        const results = teamMatches.map((match) => teamIds.has(match.winnerId!) ? "W" as const : "L" as const);
        const streakResult = results[0];
        const streakLength = streakResult ? results.findIndex((result) => result !== streakResult) : 0;
        const normalizedStreakLength = streakResult
          ? (streakLength === -1 ? results.length : streakLength)
          : 0;
        const lastMatch = teamMatches[0];
        let lastResult = null;
        if (lastMatch) {
          const isCoach1 = teamIds.has(lastMatch.coach1SeasonId);
          const opponentId = isCoach1 ? lastMatch.coach2SeasonId : lastMatch.coach1SeasonId;
          const opponent = resolveActiveCoach(opponentId) ?? divCoaches.find((coach) => coach.id === opponentId);
          lastResult = {
            result: teamIds.has(lastMatch.winnerId!) ? "W" as const : "L" as const,
            opponent: opponent?.teamAbbreviation || opponent?.teamName || "Opponent",
            score: `${isCoach1 ? lastMatch.coach1Differential || 0 : lastMatch.coach2Differential || 0}-${isCoach1 ? lastMatch.coach2Differential || 0 : lastMatch.coach1Differential || 0}`,
          };
        }

        return {
          id: standing.id,
          teamName: standing.teamName,
          teamAbbreviation: standing.teamAbbreviation,
          teamLogoUrl: standing.teamLogoUrl,
          coachName: standing.coach?.name || null,
          isActive: standing.isActive,
          wins: standing.wins,
          losses: standing.losses,
          differential: standing.differential,
          eloRating: Math.round(standing.coach?.eloRating || 1000),
          movement: (previousRank.get(standing.id) ?? currentIndex) - currentIndex,
          recentForm: results.slice(0, 3).reverse(),
          streak: streakResult ? `${streakResult}${normalizedStreakLength}` : "—",
          lastResult,
        };
      });
    }
  }

  const seasonsData = allSeasons.map((s) => ({
    id: s.id,
    name: s.name,
    seasonNumber: s.seasonNumber,
    isCurrent: s.isCurrent,
    divisions: s.divisions.map((d) => ({
      id: d.id,
      name: d.name,
      logoUrl: d.logoUrl,
      displayOrder: d.displayOrder,
    })),
  }));

  return <PowerRankingsClient seasons={seasonsData} preloadedData={preloadedData} />;
}
