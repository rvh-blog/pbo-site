import { db } from "@/lib/db";
import { seasons, divisions, seasonCoaches, matches } from "@/lib/schema";
import { eq, desc } from "drizzle-orm";
import { PowerRankingsClient } from "./power-rankings-client";
import { computeAndSortStandings } from "@/lib/standings-sort";

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

  // Sort divisions within each season by displayOrder
  for (const season of allSeasons) {
    season.divisions.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  }

  // For the most recent season, pre-fetch coaches and matches for all divisions
  const currentSeason = allSeasons[0];
  let preloadedData: Record<number, {
    coaches: { id: number; teamName: string; teamAbbreviation: string | null; teamLogoUrl: string | null; coachName: string | null; isActive: boolean | null }[];
    standings: { id: number; wins: number; losses: number; differential: number }[];
  }> = {};

  if (currentSeason) {
    const [allCoaches, allMatches] = await Promise.all([
      // Fetch coaches for all divisions in the current season
      Promise.all(
        currentSeason.divisions.map((div) =>
          db.query.seasonCoaches.findMany({
            where: eq(seasonCoaches.divisionId, div.id),
            with: { coach: true },
          })
        )
      ),
      db.query.matches.findMany({
        where: eq(matches.seasonId, currentSeason.id),
      }),
    ]);

    for (let i = 0; i < currentSeason.divisions.length; i++) {
      const div = currentSeason.divisions[i];
      const divCoaches = allCoaches[i];

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
      const divMatches = allMatches.filter((m) => m.divisionId === div.id);

      const standings = computeAndSortStandings(activeCoaches, replacementMap, divMatches)
        .map((s) => ({ id: s.id, wins: s.wins, losses: s.losses, differential: s.differential }));

      preloadedData[div.id] = {
        coaches: activeCoaches.map((sc) => ({
          id: sc.id,
          teamName: sc.teamName,
          teamAbbreviation: sc.teamAbbreviation,
          teamLogoUrl: sc.teamLogoUrl,
          coachName: sc.coach?.name || null,
          isActive: sc.isActive,
        })),
        standings,
      };
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
