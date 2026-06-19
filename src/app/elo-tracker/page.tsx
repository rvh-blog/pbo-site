import { db } from "@/lib/db";
import { coaches, eloHistory, seasonCoaches, matches, divisions, seasons } from "@/lib/schema";
import { eq, desc, asc } from "drizzle-orm";
import { EloTrackerClient } from "./elo-tracker-client";

export const dynamic = 'force-dynamic';

export interface CoachEloData {
  id: number;
  name: string;
  currentElo: number;
  currentRank: number;
  peakElo: number;
  peakMatchId: number | null;
  peakDate: string | null;
  history: {
    id: number;
    elo: number;
    matchId: number | null;
    date: string;
    seasonNumber: number | null;
    divisionName: string | null;
    week: number | null;
    opponentName: string | null;
    result: "W" | "L" | null;
    placementReason: string | null;
  }[];
}

async function getAllCoachEloData(): Promise<CoachEloData[]> {
  // Fetch all data in parallel with minimal nesting
  const [allCoaches, allHistory, allMatches, allDivisions, allSeasons, allSeasonCoaches] = await Promise.all([
    db.query.coaches.findMany({
      orderBy: [desc(coaches.eloRating)],
    }),
    db.query.eloHistory.findMany({
      orderBy: [asc(eloHistory.id)],
    }),
    db.query.matches.findMany(),
    db.query.divisions.findMany(),
    db.query.seasons.findMany(),
    db.query.seasonCoaches.findMany(),
  ]);

  // Build lookups for in-memory joins
  const matchById = new Map(allMatches.map(m => [m.id, m]));
  const divisionById = new Map(allDivisions.map(d => [d.id, d]));
  const seasonById = new Map(allSeasons.map(s => [s.id, s]));
  const seasonCoachById = new Map(allSeasonCoaches.map(sc => [sc.id, sc]));
  const coachById = new Map(allCoaches.map(c => [c.id, c]));

  // Group history by coach
  const historyByCoach = new Map<number, typeof allHistory>();
  for (const h of allHistory) {
    const existing = historyByCoach.get(h.coachId) || [];
    existing.push(h);
    historyByCoach.set(h.coachId, existing);
  }

  // Calculate peak ELO and rankings for each coach
  const coachData: CoachEloData[] = [];

  for (let i = 0; i < allCoaches.length; i++) {
    const coach = allCoaches[i];
    const history = historyByCoach.get(coach.id) || [];

    // Find peak ELO
    let peakElo = coach.eloRating;
    let peakMatchId: number | null = null;
    let peakDate: string | null = null;

    for (const h of history) {
      if (h.eloRating > peakElo) {
        peakElo = h.eloRating;
        peakMatchId = h.matchId;
        peakDate = h.recordedAt;
      }
    }

    const currentRank = i + 1;

    // Build history with match context using lookups
    const formattedHistory = history.map((h, index) => {
      const match = h.matchId ? matchById.get(h.matchId) : null;
      let opponentName: string | null = null;
      let result: "W" | "L" | null = null;
      let placementReason: string | null = null;
      let seasonNumber: number | null = null;
      let divisionName: string | null = null;

      if (match) {
        // Get season coaches and their coaches
        const sc1 = seasonCoachById.get(match.coach1SeasonId);
        const sc2 = seasonCoachById.get(match.coach2SeasonId);

        // Find opponent
        const isCoach1 = sc1?.coachId === coach.id;
        const opponentSc = isCoach1 ? sc2 : sc1;
        const opponentCoach = opponentSc ? coachById.get(opponentSc.coachId) : null;
        opponentName = opponentCoach?.name || null;

        // Determine result
        if (match.winnerId) {
          const mySeasonCoachId = isCoach1 ? match.coach1SeasonId : match.coach2SeasonId;
          result = match.winnerId === mySeasonCoachId ? "W" : "L";
        }

        // Get division and season info
        const division = divisionById.get(match.divisionId);
        if (division) {
          divisionName = division.name;
          const season = seasonById.get(division.seasonId);
          seasonNumber = season?.seasonNumber || null;
        }
      } else {
        // This is a placement entry (no match)
        // Look at the next entry (first actual match) to get season/division info
        const nextEntry = history[index + 1];
        const nextMatch = nextEntry?.matchId ? matchById.get(nextEntry.matchId) : null;
        if (nextMatch) {
          const division = divisionById.get(nextMatch.divisionId);
          if (division) {
            const season = seasonById.get(division.seasonId);
            if (season && division.name) {
              placementReason = `S${season.seasonNumber} ${division.name}`;
            }
          }
        }
      }

      return {
        id: h.id,
        elo: Math.round(h.eloRating),
        matchId: h.matchId,
        date: h.recordedAt || "",
        seasonNumber,
        divisionName,
        week: match?.week || null,
        opponentName,
        result,
        placementReason,
      };
    });

    coachData.push({
      id: coach.id,
      name: coach.name,
      currentElo: Math.round(coach.eloRating),
      currentRank,
      peakElo: Math.round(peakElo),
      peakMatchId,
      peakDate,
      history: formattedHistory,
    });
  }

  return coachData;
}

export default async function EloTrackerPage({
  searchParams,
}: {
  searchParams: Promise<{ coach?: string }>;
}) {
  const resolvedParams = await searchParams;
  const coachData = await getAllCoachEloData();

  // Filter to only coaches with history
  const coachesWithHistory = coachData.filter((c) => c.history.length > 0);

  // Get selected coach from URL param, default to highest ELO
  const selectedCoachId = resolvedParams.coach
    ? parseInt(resolvedParams.coach)
    : coachesWithHistory[0]?.id;

  return (
    <EloTrackerClient
      allCoaches={coachesWithHistory}
      initialCoachId={selectedCoachId}
    />
  );
}
