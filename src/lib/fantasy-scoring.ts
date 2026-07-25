export const FANTASY_ROSTER_SIZE = 6;
export const FANTASY_BUDGET = 90;
export const FANTASY_SLOT_RULES = ["Infinity", "Stargazer", "Sunset", "Crystal", "Neon", null] as const;
export const FANTASY_WEEKLY_REWARD_TIERS = [250, 125, 75] as const;

export function fantasyPickKey(pick: { pokemonId: number; seasonCoachId: number | null }) {
  return `${pick.pokemonId}:${pick.seasonCoachId ?? 0}`;
}

export function scoreFantasyPokemonGame(row: {
  kills: number | null;
  deaths: number | null;
  seasonCoachId: number;
  winnerId: number | null;
}) {
  return (row.kills ?? 0) * 5 - (row.deaths ?? 0) +
    (row.winnerId === row.seasonCoachId ? 2 : -2);
}

export type FantasyLineupCandidate = {
  pokemonId: number;
  seasonCoachId: number;
  name: string;
  spriteUrl: string | null;
  divisionName: string;
  teamName: string;
  cost: number;
  score: number;
};

export type FantasyOptimalLineup = {
  score: number;
  cost: number;
  picks: FantasyLineupCandidate[];
};

function normalizeDivisionName(name: string | null | undefined) {
  return name?.trim().toLowerCase() || "";
}

export function optimizeFantasyLineup(
  candidates: FantasyLineupCandidate[],
  availableDivisionNames: string[],
  excludedInstanceKeys: Set<string> = new Set()
): FantasyOptimalLineup | null {
  const availableDivisions = new Set(availableDivisionNames.map(normalizeDivisionName));
  const effectiveSlotRules = FANTASY_SLOT_RULES.map((divisionName) => (
    divisionName && availableDivisions.has(normalizeDivisionName(divisionName))
      ? normalizeDivisionName(divisionName)
      : null
  ));
  const eligibleCandidates = candidates.filter((candidate) => (
    candidate.cost >= 0 &&
    candidate.cost <= FANTASY_BUDGET &&
    !excludedInstanceKeys.has(fantasyPickKey(candidate))
  ));
  const candidatesByPokemon = new Map<number, FantasyLineupCandidate[]>();

  for (const candidate of eligibleCandidates) {
    const group = candidatesByPokemon.get(candidate.pokemonId) ?? [];
    group.push(candidate);
    candidatesByPokemon.set(candidate.pokemonId, group);
  }

  type State = FantasyOptimalLineup & { mask: number };
  let states = new Map<string, State>([
    ["0:0", { mask: 0, score: 0, cost: 0, picks: [] }],
  ]);

  for (const speciesCandidates of candidatesByPokemon.values()) {
    const next = new Map(states);

    for (const state of states.values()) {
      for (const candidate of speciesCandidates) {
        for (let slot = 0; slot < FANTASY_ROSTER_SIZE; slot += 1) {
          if ((state.mask & (1 << slot)) !== 0) continue;
          const requiredDivision = effectiveSlotRules[slot];
          if (
            requiredDivision &&
            normalizeDivisionName(candidate.divisionName) !== requiredDivision
          ) {
            continue;
          }

          const cost = state.cost + candidate.cost;
          if (cost > FANTASY_BUDGET) continue;
          const mask = state.mask | (1 << slot);
          const score = state.score + candidate.score;
          const key = `${mask}:${cost}`;
          const existing = next.get(key);
          if (!existing || score > existing.score) {
            const picks = state.picks.slice();
            picks[slot] = candidate;
            next.set(key, { mask, score, cost, picks });
          }
        }
      }
    }

    states = next;
  }

  const completeMask = (1 << FANTASY_ROSTER_SIZE) - 1;
  const best = [...states.values()]
    .filter((state) => state.mask === completeMask && state.picks.length === FANTASY_ROSTER_SIZE)
    .sort((a, b) => b.score - a.score || a.cost - b.cost)[0];

  return best ? { score: best.score, cost: best.cost, picks: best.picks } : null;
}

export function buildTiedFantasyAwards<T extends { totalScore: number }>(
  leaderboard: T[],
  rewardTiers: readonly number[] = FANTASY_WEEKLY_REWARD_TIERS
) {
  const awards: { row: T; rank: number; amount: number; tied: boolean }[] = [];
  let index = 0;

  while (index < leaderboard.length && index < rewardTiers.length) {
    const score = leaderboard[index].totalScore;
    let groupEnd = index + 1;
    while (
      groupEnd < leaderboard.length &&
      leaderboard[groupEnd].totalScore === score
    ) {
      groupEnd += 1;
    }

    const group = leaderboard.slice(index, groupEnd);
    const prizePool = rewardTiers
      .slice(index, Math.min(groupEnd, rewardTiers.length))
      .reduce((sum, amount) => sum + amount, 0);
    const equalShare = Math.floor(prizePool / group.length);

    if (equalShare > 0) {
      for (const row of group) {
        awards.push({
          row,
          rank: index + 1,
          amount: equalShare,
          tied: group.length > 1,
        });
      }
    }
    index = groupEnd;
  }

  return awards;
}
