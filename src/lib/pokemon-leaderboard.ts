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

export function sortPokemonAllTimeByKills<T extends { kills: number; gamesPlayed: number }>(stats: T[]) {
  return [...stats].sort((a, b) => b.kills - a.kills || a.gamesPlayed - b.gamesPlayed);
}

export async function getPokemonLeaderboardStats(): Promise<PokemonLeaderboardStat[]> {
  const allMatchPokemon = await db.query.matchPokemon.findMany({
    with: {
      pokemon: true,
      match: true,
    },
  });

  const pokemonMap = new Map<
    number,
    Omit<PokemonLeaderboardStat, "differential" | "winRate">
  >();

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

    if (mp.match?.winnerId === mp.seasonCoachId) {
      existing.wins += 1;
    } else if (mp.match?.winnerId) {
      existing.losses += 1;
    }

    pokemonMap.set(mp.pokemon.id, existing);
  }

  return Array.from(pokemonMap.values())
    .filter((pokemon) => pokemon.gamesPlayed > 0)
    .map((pokemon) => ({
      ...pokemon,
      differential: pokemon.kills - pokemon.deaths,
      winRate: pokemon.gamesPlayed > 0 ? (pokemon.wins / pokemon.gamesPlayed) * 100 : 0,
    }));
}

export async function getPokemonAllTimeKillRank(pokemonId: number) {
  const rankedPokemon = sortPokemonAllTimeByKills(await getPokemonLeaderboardStats());
  const rankIndex = rankedPokemon.findIndex((stats) => stats.id === pokemonId);

  return {
    rank: rankIndex >= 0 ? rankIndex + 1 : null,
    totalRanked: rankedPokemon.length,
  };
}
