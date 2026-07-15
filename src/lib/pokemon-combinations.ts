export type CombinationPokemon = {
  pokemonId: number;
  pokemonName: string;
  pokemonDisplayName: string | null;
  spriteUrl: string | null;
};

export type PokemonCombination = {
  pokemon: CombinationPokemon[];
  uses: number;
  wins: number;
  winRate: number;
};

export type CombinationLeaderboards = Record<2 | 3 | 4, PokemonCombination[]>;

type MatchPokemonForCombination = {
  matchId: number;
  seasonCoachId: number;
  pokemonId: number;
  pokemon: {
    id: number;
    name: string;
    displayName: string | null;
    spriteUrl: string | null;
  } | null;
};

export function processCombinationLeaderboards(
  matchIds: Set<number>,
  allMatchPokemon: MatchPokemonForCombination[],
  matchWinners: Map<number, number | null>
): CombinationLeaderboards {
  const lineups = new Map<string, { matchId: number; seasonCoachId: number; pokemon: Map<number, CombinationPokemon> }>();
  const pokemonById = new Map<number, CombinationPokemon>();

  for (const entry of allMatchPokemon) {
    if (!matchIds.has(entry.matchId)) continue;
    const lineupKey = `${entry.matchId}:${entry.seasonCoachId}`;
    if (!lineups.has(lineupKey)) lineups.set(lineupKey, { matchId: entry.matchId, seasonCoachId: entry.seasonCoachId, pokemon: new Map() });
    if (!lineups.get(lineupKey)!.pokemon.has(entry.pokemonId)) {
      const pokemon = {
        pokemonId: entry.pokemonId,
        pokemonName: entry.pokemon?.name || "Unknown",
        pokemonDisplayName: entry.pokemon?.displayName || null,
        spriteUrl: entry.pokemon?.spriteUrl || null,
      };
      lineups.get(lineupKey)!.pokemon.set(entry.pokemonId, pokemon);
      pokemonById.set(entry.pokemonId, pokemon);
    }
  }

  const counts = new Map<2 | 3 | 4, Map<string, { ids: number[]; uses: number; wins: number }>>([
    [2, new Map()],
    [3, new Map()],
    [4, new Map()],
  ]);

  function addCombinations(lineup: { matchId: number; seasonCoachId: number; pokemon: Map<number, CombinationPokemon> }, ids: number[], size: 2 | 3 | 4, start = 0, selected: number[] = []) {
    if (selected.length === size) {
      const sortedIds = [...selected].sort((a, b) => a - b);
      const key = sortedIds.join(",");
      const sizeCounts = counts.get(size)!;
      const existing = sizeCounts.get(key);
      const isWin = matchWinners.get(lineup.matchId) === lineup.seasonCoachId;
      if (existing) {
        existing.uses += 1;
        if (isWin) existing.wins += 1;
      } else {
        sizeCounts.set(key, { ids: sortedIds, uses: 1, wins: isWin ? 1 : 0 });
      }
      return;
    }

    for (let index = start; index <= ids.length - (size - selected.length); index++) {
      addCombinations(lineup, ids, size, index + 1, [...selected, ids[index]]);
    }
  }

  for (const lineup of lineups.values()) {
    const ids = [...lineup.pokemon.keys()].sort((a, b) => a - b);
    for (const size of [2, 3, 4] as const) {
      if (ids.length >= size) addCombinations(lineup, ids, size);
    }
  }

  const result = {} as CombinationLeaderboards;
  for (const size of [2, 3, 4] as const) {
    const entries = [...counts.get(size)!.values()]
      .sort((a, b) => b.uses - a.uses || a.ids.join(",").localeCompare(b.ids.join(",")))
      .slice(0, 10);
    result[size] = entries.map((entry) => ({
      uses: entry.uses,
      wins: entry.wins,
      winRate: Math.round((entry.wins / entry.uses) * 100),
      pokemon: entry.ids.map((pokemonId) => pokemonById.get(pokemonId) || { pokemonId, pokemonName: "Unknown", pokemonDisplayName: null, spriteUrl: null }),
    }));
  }

  return result;
}
