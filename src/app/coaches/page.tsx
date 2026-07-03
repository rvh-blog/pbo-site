import { db } from "@/lib/db";
import { seasons } from "@/lib/schema";
import { desc } from "drizzle-orm";
import { CoachesClient } from "./coaches-client";
import { getAllCoachCosmetics } from "@/lib/glow-utils";

export const dynamic = 'force-dynamic';

async function getCoachesData() {
  // Run all queries in parallel for much better performance on network-attached storage
  const [allCoaches, latestSeason, allSeasonCoaches, allMatches, allSeasons, allDivisions] = await Promise.all([
    db.query.coaches.findMany(),
    db.query.seasons.findFirst({
      orderBy: [desc(seasons.seasonNumber)],
    }),
    db.query.seasonCoaches.findMany({
      with: {
        division: {
          with: {
            season: true,
          },
        },
      },
    }),
    db.query.matches.findMany(),
    db.query.seasons.findMany({
      orderBy: [desc(seasons.seasonNumber)],
    }),
    db.query.divisions.findMany(),
  ]);

  const latestSeasonId = latestSeason?.id;
  const cosmetics = await getAllCoachCosmetics(allCoaches.map((coach) => coach.id));

  // Build coach data with latest team info
  const coachData = allCoaches.map(coach => {
    const participations = allSeasonCoaches.filter(sc => sc.coachId === coach.id);

    // Sort by season number descending
    participations.sort((a, b) => {
      const seasonA = a.division?.season?.seasonNumber ?? 0;
      const seasonB = b.division?.season?.seasonNumber ?? 0;
      return seasonB - seasonA;
    });

    const latestTeam = participations[0] || null;
    const isActive = participations.some(sp => sp.division?.season?.id === latestSeasonId);

    return {
      id: coach.id,
      name: coach.name,
      eloRating: coach.eloRating,
      latestTeam: latestTeam ? {
        teamName: latestTeam.teamName,
        teamAbbreviation: latestTeam.teamAbbreviation,
        teamLogoUrl: latestTeam.teamLogoUrl,
        divisionName: latestTeam.division?.name,
      } : null,
      logoFrame: cosmetics.logoFrame.has(coach.id)
        ? {
            slug: cosmetics.logoFrame.get(coach.id)!.slug,
            colors: cosmetics.logoFrame.get(coach.id)!.colors,
          }
        : null,
      isActive,
      seasons: participations.length,
    };
  });

  // Build season coach entries for client-side filtering
  const seasonCoachEntries = allSeasonCoaches.map(sc => ({
    id: sc.id,
    coachId: sc.coachId,
    divisionId: sc.divisionId,
    seasonId: sc.division?.season?.id ?? 0,
    teamName: sc.teamName,
  }));

  // Build match data for client-side filtering
  const matchData = allMatches.map(m => ({
    id: m.id,
    coach1SeasonId: m.coach1SeasonId,
    coach2SeasonId: m.coach2SeasonId,
    winnerId: m.winnerId,
    coach1Differential: m.coach1Differential,
    coach2Differential: m.coach2Differential,
    isForfeit: m.isForfeit === true,
    divisionId: m.divisionId,
    seasonId: m.seasonId,
  }));

  // Build season data
  const seasonData = allSeasons.map(s => ({
    id: s.id,
    seasonNumber: s.seasonNumber,
    name: s.name,
  }));

  // Build division data
  const divisionData = allDivisions.map(d => ({
    id: d.id,
    name: d.name,
    seasonId: d.seasonId,
  }));

  return {
    coaches: coachData,
    seasonCoachEntries,
    matches: matchData,
    seasons: seasonData,
    divisions: divisionData,
  };
}

export default async function CoachesPage() {
  const { coaches, seasonCoachEntries, matches, seasons, divisions } = await getCoachesData();

  return (
    <CoachesClient
      coaches={coaches}
      seasonCoachEntries={seasonCoachEntries}
      matches={matches}
      seasons={seasons}
      divisions={divisions}
    />
  );
}
