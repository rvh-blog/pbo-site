import { db } from "@/lib/db";
import { coaches, eloHistory, seasonCoaches, matches, matchPokemon, divisions, seasons, playoffMatches } from "@/lib/schema";
import { eq, desc, and } from "drizzle-orm";
import { LeaderboardsClient } from "./leaderboards-client";

// Cache page for 5 minutes
export const revalidate = 300;

async function getTopEloCoach() {
  // Find the coach with the highest ELO rating
  const topCoach = await db.query.coaches.findFirst({
    orderBy: [desc(coaches.eloRating)],
  });

  if (!topCoach) return null;

  // Calculate their all-time record
  const seasonEntries = await db.query.seasonCoaches.findMany({
    where: eq(seasonCoaches.coachId, topCoach.id),
  });
  const seasonCoachIds = seasonEntries.map((sc) => sc.id);

  const allMatches = await db.query.matches.findMany();
  let wins = 0;
  let losses = 0;

  for (const match of allMatches) {
    const isCoach1 = seasonCoachIds.includes(match.coach1SeasonId);
    const isCoach2 = seasonCoachIds.includes(match.coach2SeasonId);

    if (isCoach1 || isCoach2) {
      const mySeasonCoachId = isCoach1 ? match.coach1SeasonId : match.coach2SeasonId;
      if (match.winnerId === mySeasonCoachId) {
        wins++;
      } else if (match.winnerId) {
        losses++;
      }
    }
  }

  // Get their most recent team name
  const latestSeasonEntry = await db.query.seasonCoaches.findFirst({
    where: eq(seasonCoaches.coachId, topCoach.id),
    orderBy: [desc(seasonCoaches.id)],
  });

  return {
    coach: topCoach,
    teamName: latestSeasonEntry?.teamName || topCoach.name,
    elo: Math.round(topCoach.eloRating),
    wins,
    losses,
  };
}

async function getCoachStats() {
  const allCoaches = await db.query.coaches.findMany();
  const allMatches = await db.query.matches.findMany();

  const coachStats = await Promise.all(
    allCoaches.map(async (coach) => {
      const latestElo = await db.query.eloHistory.findFirst({
        where: eq(eloHistory.coachId, coach.id),
        orderBy: [desc(eloHistory.recordedAt)],
      });

      const seasonEntries = await db.query.seasonCoaches.findMany({
        where: eq(seasonCoaches.coachId, coach.id),
      });
      const seasonCoachIds = seasonEntries.map((sc) => sc.id);

      let wins = 0;
      let losses = 0;

      for (const match of allMatches) {
        const isCoach1 = seasonCoachIds.includes(match.coach1SeasonId);
        const isCoach2 = seasonCoachIds.includes(match.coach2SeasonId);

        if (isCoach1 || isCoach2) {
          const mySeasonCoachId = isCoach1 ? match.coach1SeasonId : match.coach2SeasonId;

          if (match.winnerId === mySeasonCoachId) {
            wins++;
          } else if (match.winnerId) {
            losses++;
          }
        }
      }

      const gamesPlayed = wins + losses;
      const winRate = gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0;

      return {
        id: coach.id,
        name: coach.name,
        elo: latestElo?.eloRating || coach.eloRating,
        wins,
        losses,
        gamesPlayed,
        winRate,
      };
    })
  );

  return coachStats.filter((c) => c.gamesPlayed > 0);
}

async function getPokemonStats() {
  const allMatchPokemon = await db.query.matchPokemon.findMany({
    with: {
      pokemon: true,
      match: true,
    },
  });

  // Group by pokemon
  const pokemonMap = new Map<number, {
    id: number;
    name: string;
    spriteUrl: string | null;
    kills: number;
    deaths: number;
    wins: number;
    losses: number;
    gamesPlayed: number;
  }>();

  for (const mp of allMatchPokemon) {
    if (!mp.pokemon) continue;

    const existing = pokemonMap.get(mp.pokemon.id) || {
      id: mp.pokemon.id,
      name: mp.pokemon.name,
      displayName: mp.pokemon.displayName,
      spriteUrl: mp.pokemon.spriteUrl,
      kills: 0,
      deaths: 0,
      wins: 0,
      losses: 0,
      gamesPlayed: 0,
    };

    existing.kills += mp.kills || 0;
    existing.deaths += mp.deaths || 0;
    existing.gamesPlayed += 1;

    // Check if this pokemon's team won
    if (mp.match?.winnerId === mp.seasonCoachId) {
      existing.wins += 1;
    } else if (mp.match?.winnerId) {
      existing.losses += 1;
    }

    pokemonMap.set(mp.pokemon.id, existing);
  }

  const pokemonStats = Array.from(pokemonMap.values()).map((p) => ({
    ...p,
    differential: p.kills - p.deaths,
    winRate: p.gamesPlayed > 0 ? (p.wins / p.gamesPlayed) * 100 : 0,
  }));

  return pokemonStats.filter((p) => p.gamesPlayed > 0);
}

export default async function LeaderboardsPage() {
  const topEloCoach = await getTopEloCoach();
  const coachStats = await getCoachStats();
  const pokemonStats = await getPokemonStats();

  return (
    <LeaderboardsClient
      topEloCoach={topEloCoach}
      coachStats={coachStats}
      pokemonStats={pokemonStats}
    />
  );
}
