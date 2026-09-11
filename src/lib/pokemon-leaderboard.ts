import { db } from "@/lib/db";
import { matchPokemon, matches, pokemon } from "@/lib/schema";
import { and, eq, isNotNull, or, sql } from "drizzle-orm";

export type PokemonLeaderboardStat = {
  id: number;
  name: string;
  displayName: string | null;
  spriteUrl: string | null;
  kills: number;
  deaths: number;
  wins: number;
  losses: number;
  gamesPlayed: number;
  differential: number;
  winRate: number;
};

export type SeasonPokemonLeaderboardStat = {
  pokemonId: number;
  pokemonName: string;
  pokemonDisplayName: string | null;
  spriteUrl: string | null;
  kills: number;
  deaths: number;
  gamesPlayed: number;
  differential: number;
  kd: string;
};

export type SeasonMatchPokemonRow = {
  matchId: number;
  pokemonId: number;
  kills: number | null;
  deaths: number | null;
  pokemon: {
    id: number;
    name: string;
    displayName: string | null;
    spriteUrl: string | null;
  } | null;
};

export type SeasonTeamPokemonLeaderboardStat = SeasonPokemonLeaderboardStat & {
  seasonCoachId: number;
  teamName: string;
  teamAbbreviation: string | null;
  coachId: number | null;
  coachName: string | null;
  divisionName: string;
  seasonId: number;
  seasonName: string;
  wins: number;
  losses: number;
  killsPerGame: number;
  games: SeasonTeamPokemonGame[];
};

export type SeasonTeamPokemonGame = {
  matchId: number;
  week: number;
  opponentTeamName: string;
  kills: number;
  deaths: number;
  result: "W" | "L" | null;
  replayUrl: string | null;
  playedAt: string | null;
};

export type SeasonTeamMatchPokemonRow = SeasonMatchPokemonRow & {
  seasonCoachId: number;
  seasonCoach: {
    id: number;
    teamName: string;
    teamAbbreviation: string | null;
    coach: {
      id: number;
      name: string;
    } | null;
    division: {
      name: string;
      season: {
        id: number;
        name: string;
      } | null;
    } | null;
  } | null;
  match: {
    id: number;
    week: number;
    coach1SeasonId: number;
    coach2SeasonId: number;
    winnerId: number | null;
    replayUrl: string | null;
    playedAt: string | null;
    coach1: {
      id: number;
      teamName: string;
    } | null;
    coach2: {
      id: number;
      teamName: string;
    } | null;
  } | null;
};

export function sortPokemonAllTimeByKills<T extends { kills: number; gamesPlayed: number }>(stats: T[]) {
  return [...stats].sort((a, b) => b.kills - a.kills || a.gamesPlayed - b.gamesPlayed);
}

export function aggregateSeasonPokemonLeaderboard(
  seasonMatchIds: Set<number>,
  matchPokemonRows: SeasonMatchPokemonRow[]
): SeasonPokemonLeaderboardStat[] {
  const statsMap = new Map<
    number,
    Omit<SeasonPokemonLeaderboardStat, "differential" | "kd">
  >();

  for (const row of matchPokemonRows) {
    if (!seasonMatchIds.has(row.matchId) || !row.pokemon) continue;

    const existing = statsMap.get(row.pokemonId) || {
      pokemonId: row.pokemonId,
      pokemonName: row.pokemon.name,
      pokemonDisplayName: row.pokemon.displayName,
      spriteUrl: row.pokemon.spriteUrl,
      kills: 0,
      deaths: 0,
      gamesPlayed: 0,
    };

    existing.kills += row.kills || 0;
    existing.deaths += row.deaths || 0;
    existing.gamesPlayed += 1;
    statsMap.set(row.pokemonId, existing);
  }

  return Array.from(statsMap.values())
    .map((stats) => ({
      ...stats,
      differential: stats.kills - stats.deaths,
      kd: stats.deaths > 0
        ? (stats.kills / stats.deaths).toFixed(2)
        : stats.kills > 0
          ? "∞"
          : "0.00",
    }))
    .sort((a, b) => (
      b.kills - a.kills
      || b.differential - a.differential
      || a.gamesPlayed - b.gamesPlayed
    ));
}

export function aggregateSeasonTeamPokemonLeaderboard(
  seasonMatchIds: Set<number>,
  matchPokemonRows: SeasonTeamMatchPokemonRow[]
): SeasonTeamPokemonLeaderboardStat[] {
  const statsMap = new Map<
    string,
    Omit<SeasonTeamPokemonLeaderboardStat, "differential" | "kd" | "killsPerGame">
  >();

  for (const row of matchPokemonRows) {
    if (!seasonMatchIds.has(row.matchId) || !row.pokemon || !row.seasonCoach) continue;

    const key = `${row.seasonCoachId}:${row.pokemonId}`;
    const existing = statsMap.get(key) || {
      seasonCoachId: row.seasonCoachId,
      pokemonId: row.pokemonId,
      pokemonName: row.pokemon.name,
      pokemonDisplayName: row.pokemon.displayName,
      spriteUrl: row.pokemon.spriteUrl,
      teamName: row.seasonCoach.teamName,
      teamAbbreviation: row.seasonCoach.teamAbbreviation,
      coachId: row.seasonCoach.coach?.id || null,
      coachName: row.seasonCoach.coach?.name || null,
      divisionName: row.seasonCoach.division?.name?.trim() || "Unknown Division",
      seasonId: row.seasonCoach.division?.season?.id || 0,
      seasonName: row.seasonCoach.division?.season?.name || "Unknown Season",
      kills: 0,
      deaths: 0,
      wins: 0,
      losses: 0,
      gamesPlayed: 0,
      games: [],
    };

    existing.kills += row.kills || 0;
    existing.deaths += row.deaths || 0;
    existing.gamesPlayed += 1;
    if (row.match) {
      if (row.match.winnerId === row.seasonCoachId) {
        existing.wins += 1;
      } else if (row.match.winnerId) {
        existing.losses += 1;
      }
      const opponent = row.match.coach1SeasonId === row.seasonCoachId
        ? row.match.coach2
        : row.match.coach1;
      existing.games.push({
        matchId: row.match.id,
        week: row.match.week,
        opponentTeamName: opponent?.teamName || "Unknown Opponent",
        kills: row.kills || 0,
        deaths: row.deaths || 0,
        result: row.match.winnerId === row.seasonCoachId
          ? "W"
          : row.match.winnerId
            ? "L"
            : null,
        replayUrl: row.match.replayUrl,
        playedAt: row.match.playedAt,
      });
    }
    statsMap.set(key, existing);
  }

  return Array.from(statsMap.values())
    .map((stats) => ({
      ...stats,
      differential: stats.kills - stats.deaths,
      killsPerGame: stats.gamesPlayed > 0 ? stats.kills / stats.gamesPlayed : 0,
      kd: stats.deaths > 0
        ? (stats.kills / stats.deaths).toFixed(2)
        : stats.kills > 0
          ? "∞"
          : "0.00",
      games: stats.games.sort((a, b) => a.week - b.week || a.matchId - b.matchId),
    }))
    .sort((a, b) => (
      b.kills - a.kills
      || b.differential - a.differential
      || a.gamesPlayed - b.gamesPlayed
      || a.teamName.localeCompare(b.teamName)
      || a.pokemonName.localeCompare(b.pokemonName)
    ));
}

async function loadPokemonLeaderboardAggregates(seasonId?: number): Promise<PokemonLeaderboardStat[]> {
  const rows = await db
    .select({
      id: pokemon.id,
      name: pokemon.name,
      displayName: pokemon.displayName,
      spriteUrl: pokemon.spriteUrl,
      kills: sql<number>`sum(coalesce(${matchPokemon.kills}, 0))`,
      deaths: sql<number>`sum(coalesce(${matchPokemon.deaths}, 0))`,
      wins: sql<number>`sum(case when ${matches.winnerId} = ${matchPokemon.seasonCoachId} then 1 else 0 end)`,
      gamesPlayed: sql<number>`count(*)`,
    })
    .from(matchPokemon)
    .innerJoin(pokemon, eq(matchPokemon.pokemonId, pokemon.id))
    .innerJoin(matches, eq(matchPokemon.matchId, matches.id))
    .where(and(
      isNotNull(matches.winnerId),
      or(
        eq(matches.winnerId, matches.coach1SeasonId),
        eq(matches.winnerId, matches.coach2SeasonId),
      ),
      or(
        eq(matchPokemon.seasonCoachId, matches.coach1SeasonId),
        eq(matchPokemon.seasonCoachId, matches.coach2SeasonId),
      ),
      seasonId === undefined ? undefined : eq(matches.seasonId, seasonId),
    ))
    .groupBy(pokemon.id, pokemon.name, pokemon.displayName, pokemon.spriteUrl);

  return rows.map((row) => {
    const kills = Number(row.kills);
    const deaths = Number(row.deaths);
    const wins = Number(row.wins);
    const gamesPlayed = Number(row.gamesPlayed);
    const losses = gamesPlayed - wins;
    return {
      ...row,
      kills,
      deaths,
      wins,
      losses,
      gamesPlayed,
      differential: kills - deaths,
      winRate: gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0,
    };
  });
}

export async function getPokemonLeaderboardStats(seasonId?: number): Promise<PokemonLeaderboardStat[]> {
  return loadPokemonLeaderboardAggregates(seasonId);
}

export async function getPokemonLeaderboardStatsForScopes(currentSeasonId: number | null) {
  const [allTime, currentSeason] = await Promise.all([
    loadPokemonLeaderboardAggregates(),
    currentSeasonId === null
      ? Promise.resolve([])
      : loadPokemonLeaderboardAggregates(currentSeasonId),
  ]);

  return {
    allTime,
    currentSeason,
  };
}

export async function getPokemonAllTimeKillRank(pokemonId: number) {
  const rankedPokemon = sortPokemonAllTimeByKills(await getPokemonLeaderboardStats());
  const rankIndex = rankedPokemon.findIndex((stats) => stats.id === pokemonId);

  return {
    rank: rankIndex >= 0 ? rankIndex + 1 : null,
    totalRanked: rankedPokemon.length,
  };
}
