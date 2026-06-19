import { db } from "@/lib/db";
import { playoffMatches, rosters } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { LeaderboardsClient } from "./leaderboards-client";
import { getAllCoachCosmetics, GLOW_COLORS } from "@/lib/glow-utils";

export const dynamic = 'force-dynamic';

function getTopEloCoach(
  allCoaches: Awaited<ReturnType<typeof db.query.coaches.findMany>>,
  allSeasonCoaches: Awaited<ReturnType<typeof db.query.seasonCoaches.findMany>>,
  allMatches: Awaited<ReturnType<typeof db.query.matches.findMany>>
) {
  // Find the coach with the highest ELO rating
  const topCoach = allCoaches.reduce((best, coach) =>
    !best || coach.eloRating > best.eloRating ? coach : best,
    null as typeof allCoaches[0] | null
  );

  if (!topCoach) return null;

  // Get season entries for this coach
  const seasonEntries = allSeasonCoaches
    .filter(sc => sc.coachId === topCoach.id)
    .sort((a, b) => b.id - a.id);
  const seasonCoachIds = new Set(seasonEntries.map((sc) => sc.id));

  // Calculate wins/losses
  let wins = 0;
  let losses = 0;

  for (const match of allMatches) {
    if (!match.winnerId) continue;
    const isCoach1 = seasonCoachIds.has(match.coach1SeasonId);
    const isCoach2 = seasonCoachIds.has(match.coach2SeasonId);

    if (isCoach1 || isCoach2) {
      const mySeasonCoachId = isCoach1 ? match.coach1SeasonId : match.coach2SeasonId;
      if (match.winnerId === mySeasonCoachId) {
        wins++;
      } else {
        losses++;
      }
    }
  }

  const latestSeasonEntry = seasonEntries[0];
  const entryWithLogo = seasonEntries.find(e => e.teamLogoUrl);

  return {
    coach: topCoach,
    teamName: latestSeasonEntry?.teamName || topCoach.name,
    teamLogoUrl: entryWithLogo?.teamLogoUrl || null,
    elo: Math.round(topCoach.eloRating),
    wins,
    losses,
  };
}

function getCoachStats(
  allCoaches: Awaited<ReturnType<typeof db.query.coaches.findMany>>,
  allSeasonCoaches: Awaited<ReturnType<typeof db.query.seasonCoaches.findMany>>,
  allMatches: Awaited<ReturnType<typeof db.query.matches.findMany>>
) {
  // Build lookup: coachId -> array of seasonCoachIds
  const coachSeasonIds = new Map<number, number[]>();
  for (const sc of allSeasonCoaches) {
    const ids = coachSeasonIds.get(sc.coachId) || [];
    ids.push(sc.id);
    coachSeasonIds.set(sc.coachId, ids);
  }

  // Build lookup: seasonCoachId -> coachId
  const seasonCoachToCoach = new Map<number, number>();
  for (const sc of allSeasonCoaches) {
    seasonCoachToCoach.set(sc.id, sc.coachId);
  }

  // Count wins/losses per coach from matches
  const coachWins = new Map<number, number>();
  const coachLosses = new Map<number, number>();

  for (const match of allMatches) {
    if (!match.winnerId) continue;

    const coach1Id = seasonCoachToCoach.get(match.coach1SeasonId);
    const coach2Id = seasonCoachToCoach.get(match.coach2SeasonId);
    const winnerCoachId = seasonCoachToCoach.get(match.winnerId);

    if (coach1Id && winnerCoachId === coach1Id) {
      coachWins.set(coach1Id, (coachWins.get(coach1Id) || 0) + 1);
    } else if (coach1Id) {
      coachLosses.set(coach1Id, (coachLosses.get(coach1Id) || 0) + 1);
    }

    if (coach2Id && winnerCoachId === coach2Id) {
      coachWins.set(coach2Id, (coachWins.get(coach2Id) || 0) + 1);
    } else if (coach2Id) {
      coachLosses.set(coach2Id, (coachLosses.get(coach2Id) || 0) + 1);
    }
  }

  // Build final stats
  const coachStats = allCoaches.map((coach) => {
    const wins = coachWins.get(coach.id) || 0;
    const losses = coachLosses.get(coach.id) || 0;
    const gamesPlayed = wins + losses;
    const winRate = gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0;

    return {
      id: coach.id,
      name: coach.name,
      elo: coach.eloRating,
      wins,
      losses,
      gamesPlayed,
      winRate,
    };
  });

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

async function getMostLovedPairs() {
  // Get all roster entries with coach and pokemon data
  const allRosters = await db.query.rosters.findMany({
    with: {
      pokemon: true,
      seasonCoach: {
        with: {
          coach: true,
        },
      },
    },
  });

  // Group by coach+pokemon to count drafts
  const pairMap = new Map<string, {
    coachId: number;
    coachName: string;
    teamLogoUrl: string | null;
    pokemonId: number;
    pokemonName: string;
    pokemonDisplayName: string | null;
    pokemonSpriteUrl: string | null;
    draftCount: number;
    latestSeasonCoachId: number;
  }>();

  for (const roster of allRosters) {
    const coachId = roster.seasonCoach?.coach?.id;
    const pokemonId = roster.pokemon?.id;
    const seasonCoachId = roster.seasonCoach?.id || 0;
    if (!coachId || !pokemonId) continue;

    const key = `${coachId}-${pokemonId}`;
    const existing = pairMap.get(key);

    if (existing) {
      existing.draftCount += 1;
      if (seasonCoachId > existing.latestSeasonCoachId) {
        existing.latestSeasonCoachId = seasonCoachId;
      }
      // Update logo if this entry has one and existing doesn't, OR if this is the latest entry with a logo
      if (roster.seasonCoach?.teamLogoUrl && !existing.teamLogoUrl) {
        existing.teamLogoUrl = roster.seasonCoach.teamLogoUrl;
      }
    } else {
      pairMap.set(key, {
        coachId,
        coachName: roster.seasonCoach?.coach?.name || "Unknown",
        teamLogoUrl: roster.seasonCoach?.teamLogoUrl || null,
        pokemonId,
        pokemonName: roster.pokemon?.name || "Unknown",
        pokemonDisplayName: roster.pokemon?.displayName || null,
        pokemonSpriteUrl: roster.pokemon?.spriteUrl || null,
        draftCount: 1,
        latestSeasonCoachId: seasonCoachId,
      });
    }
  }

  // Filter to only pairs with 2+ drafts and sort by count
  return Array.from(pairMap.values())
    .filter((p) => p.draftCount >= 2)
    .sort((a, b) => b.draftCount - a.draftCount)
    .slice(0, 3);
}

export default async function LeaderboardsPage() {
  // Fetch shared data once - eliminates N+1 queries
  const [allCoaches, allSeasonCoaches, allMatches, pokemonStats, mostLovedPairs, playoffFinals, allRosters] = await Promise.all([
    db.query.coaches.findMany(),
    db.query.seasonCoaches.findMany(),
    db.query.matches.findMany(),
    getPokemonStats(),
    getMostLovedPairs(),
    // Get all playoff finals (round 3) for championship counts
    db.query.playoffMatches.findMany({
      where: eq(playoffMatches.round, 3),
    }),
    // Get all rosters for championship lookup
    db.query.rosters.findMany(),
  ]);

  // Process with pre-fetched data (no additional DB queries)
  const topEloCoach = getTopEloCoach(allCoaches, allSeasonCoaches, allMatches);
  const coachStats = getCoachStats(allCoaches, allSeasonCoaches, allMatches);

  // Calculate championship counts per coach
  // Build a map: seasonCoachId -> coachId
  const seasonCoachToCoach = new Map<number, number>();
  for (const sc of allSeasonCoaches) {
    seasonCoachToCoach.set(sc.id, sc.coachId);
  }

  // Count championships per coach
  const coachChampionships = new Map<number, number>();
  for (const final of playoffFinals) {
    if (!final.winnerId) continue;
    const coachId = seasonCoachToCoach.get(final.winnerId);
    if (coachId) {
      coachChampionships.set(coachId, (coachChampionships.get(coachId) || 0) + 1);
    }
  }

  // Add championship counts to coachStats
  const coachStatsWithChamps = coachStats.map(c => ({
    ...c,
    championships: coachChampionships.get(c.id) || 0,
  }));

  // Fetch all cosmetic data (glow, row-bg, row-border) in 2 queries instead of 4
  const coachIds = allCoaches.map(c => c.id);
  const cosmetics = await getAllCoachCosmetics(coachIds);
  const rowBgDataMap = cosmetics.rowBg;
  const rowBorderDataMap = cosmetics.rowBorder;

  // Convert to serializable format for client
  const rowBgData: Record<number, { color: string }> = {};
  rowBgDataMap.forEach((data, coachId) => {
    rowBgData[coachId] = { color: data.colorData.color };
  });

  const rowBorderData: Record<number, { color: string }> = {};
  rowBorderDataMap.forEach((data, coachId) => {
    rowBorderData[coachId] = { color: data.colorData.color };
  });

  // Calculate championship counts per Pokemon
  // Build a map: pokemonId -> championship count
  const pokemonChampionships = new Map<number, number>();

  // Build a map: seasonCoachId -> array of pokemonIds on their roster
  const rosterBySeasonCoach = new Map<number, number[]>();
  for (const roster of allRosters) {
    const pokemonIds = rosterBySeasonCoach.get(roster.seasonCoachId) || [];
    pokemonIds.push(roster.pokemonId);
    rosterBySeasonCoach.set(roster.seasonCoachId, pokemonIds);
  }

  // For each finals with a winner, increment championship count for all Pokemon on that roster
  for (const final of playoffFinals) {
    if (!final.winnerId) continue;
    const winningRoster = rosterBySeasonCoach.get(final.winnerId) || [];
    for (const pokemonId of winningRoster) {
      pokemonChampionships.set(pokemonId, (pokemonChampionships.get(pokemonId) || 0) + 1);
    }
  }

  // Add championship counts to pokemonStats
  const pokemonStatsWithChamps = pokemonStats.map(p => ({
    ...p,
    championships: pokemonChampionships.get(p.id) || 0,
  }));

  return (
    <LeaderboardsClient
      topEloCoach={topEloCoach}
      coachStats={coachStatsWithChamps}
      pokemonStats={pokemonStatsWithChamps}
      mostLovedPairs={mostLovedPairs}
      rowBgData={rowBgData}
      rowBorderData={rowBorderData}
    />
  );
}
