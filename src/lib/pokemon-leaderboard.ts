import { db } from "@/lib/db";

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

async function loadPokemonLeaderboardRows() {
  return db.query.matchPokemon.findMany({
    columns: {
      kills: true,
      deaths: true,
      seasonCoachId: true,
    },
    with: {
      pokemon: {
        columns: { id: true, name: true, displayName: true, spriteUrl: true },
      },
      match: {
        columns: {
          seasonId: true,
          coach1SeasonId: true,
          coach2SeasonId: true,
          winnerId: true,
        },
      },
    },
  });

}

type PokemonLeaderboardRow = Awaited<ReturnType<typeof loadPokemonLeaderboardRows>>[number];
type PokemonLeaderboardAggregate = Omit<PokemonLeaderboardStat, "differential" | "winRate">;

function addPokemonLeaderboardRow(
  pokemonMap: Map<number, PokemonLeaderboardAggregate>,
  mp: PokemonLeaderboardRow
) {
  if (
    !mp.pokemon
    || !mp.match
    || mp.match.winnerId === null
    || (mp.match.winnerId !== mp.match.coach1SeasonId && mp.match.winnerId !== mp.match.coach2SeasonId)
    || (mp.seasonCoachId !== mp.match.coach1SeasonId && mp.seasonCoachId !== mp.match.coach2SeasonId)
  ) return;

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

  if (mp.match.winnerId === mp.seasonCoachId) {
    existing.wins += 1;
  } else {
    existing.losses += 1;
  }

  pokemonMap.set(mp.pokemon.id, existing);
}

function finalizePokemonLeaderboard(
  pokemonMap: Map<number, PokemonLeaderboardAggregate>
): PokemonLeaderboardStat[] {
  return Array.from(pokemonMap.values())
    .filter((pokemon) => pokemon.gamesPlayed > 0)
    .map((pokemon) => ({
      ...pokemon,
      differential: pokemon.kills - pokemon.deaths,
      winRate: pokemon.gamesPlayed > 0 ? (pokemon.wins / pokemon.gamesPlayed) * 100 : 0,
    }));
}

export async function getPokemonLeaderboardStats(seasonId?: number): Promise<PokemonLeaderboardStat[]> {
  const rows = await loadPokemonLeaderboardRows();
  const pokemonMap = new Map<number, PokemonLeaderboardAggregate>();

  for (const row of rows) {
    if (seasonId !== undefined && row.match?.seasonId !== seasonId) continue;
    addPokemonLeaderboardRow(pokemonMap, row);
  }

  return finalizePokemonLeaderboard(pokemonMap);
}

export async function getPokemonLeaderboardStatsForScopes(currentSeasonId: number | null) {
  const rows = await loadPokemonLeaderboardRows();
  const allTimeMap = new Map<number, PokemonLeaderboardAggregate>();
  const currentSeasonMap = new Map<number, PokemonLeaderboardAggregate>();

  for (const row of rows) {
    addPokemonLeaderboardRow(allTimeMap, row);
    if (currentSeasonId !== null && row.match?.seasonId === currentSeasonId) {
      addPokemonLeaderboardRow(currentSeasonMap, row);
    }
  }

  return {
    allTime: finalizePokemonLeaderboard(allTimeMap),
    currentSeason: finalizePokemonLeaderboard(currentSeasonMap),
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
