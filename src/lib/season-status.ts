import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { playoffMatches } from "@/lib/schema";

type SeasonDivisionSummary = {
  id: number;
  divisions: Array<{ id: number }>;
};

/**
 * A season is ended when every division has a Finals bracket entry with a
 * recorded winner. Keep this separate from `isCurrent`, which selects the
 * season used for defaults and ongoing admin workflows.
 */
export async function getEndedSeasonIds(
  seasonSummaries: SeasonDivisionSummary[],
): Promise<Set<number>> {
  if (seasonSummaries.length === 0) return new Set();

  const completedFinals = await db.query.playoffMatches.findMany({
    where: and(
      inArray(playoffMatches.seasonId, seasonSummaries.map((season) => season.id)),
      eq(playoffMatches.round, 3),
      isNotNull(playoffMatches.winnerId),
    ),
    columns: {
      seasonId: true,
      divisionId: true,
    },
  });

  const completedDivisionIdsBySeason = new Map<number, Set<number>>();
  for (const final of completedFinals) {
    const divisionIds = completedDivisionIdsBySeason.get(final.seasonId) ?? new Set<number>();
    divisionIds.add(final.divisionId);
    completedDivisionIdsBySeason.set(final.seasonId, divisionIds);
  }

  return new Set(
    seasonSummaries
      .filter((season) => {
        if (season.divisions.length === 0) return false;
        const completedDivisionIds = completedDivisionIdsBySeason.get(season.id);
        return Boolean(
          completedDivisionIds &&
            season.divisions.every((division) => completedDivisionIds.has(division.id)),
        );
      })
      .map((season) => season.id),
  );
}
