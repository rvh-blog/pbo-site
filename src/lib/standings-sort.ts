/**
 * Shared standings sort logic.
 *
 * Sort order:
 * 1. Wins (most first)
 * 2. Differential (highest first)
 * 3. Losses (fewest first)
 * 4. Head-to-head (if the two teams played, whoever won more matchups)
 * 5. Strength of schedule (combined W-L of all opponents faced)
 */

export interface MatchForStandings {
  week: number;
  coach1SeasonId: number;
  coach2SeasonId: number;
  winnerId: number | null;
  isForfeit: boolean | null;
  coach1Differential: number | null;
  coach2Differential: number | null;
}

export interface StandingsTeam {
  id: number;
  wins: number;
  losses: number;
  differential: number;
}

/**
 * Compute standings from matches for a set of active coaches with replacement mappings.
 *
 * @param activeCoachIds - IDs of active coaches
 * @param replacementMap - Map of activeId → predecessorIds[]
 * @param matches - All division matches (will be filtered to regular season internally)
 * @returns Array of { id, wins, losses, differential }, sorted by full tiebreaker rules
 */
export function computeAndSortStandings<T extends { id: number }>(
  activeCoaches: T[],
  replacementMap: Map<number, number[]>,
  matches: MatchForStandings[]
): (T & StandingsTeam & { opponentActiveIds: number[] })[] {
  const regularMatches = matches.filter((m) => (
    m.week <= 100
    && (
      m.winnerId === null
      || m.winnerId === m.coach1SeasonId
      || m.winnerId === m.coach2SeasonId
    )
  ));

  // Build teamIds map for each active coach
  const teamIdsMap = new Map<number, Set<number>>();
  for (const sc of activeCoaches) {
    teamIdsMap.set(sc.id, new Set([sc.id, ...(replacementMap.get(sc.id) || [])]));
  }

  // Resolve any seasonCoachId to its active team's id
  const resolveToActiveId = (scId: number): number | null => {
    for (const [activeId, ids] of teamIdsMap) {
      if (ids.has(scId)) return activeId;
    }
    return null;
  };

  // Build head-to-head: h2h[teamA][teamB] = net wins (positive = A beat B more)
  const h2h = new Map<number, Map<number, number>>();
  for (const m of regularMatches) {
    if (!m.winnerId) continue;
    const team1Active = resolveToActiveId(m.coach1SeasonId);
    const team2Active = resolveToActiveId(m.coach2SeasonId);
    if (!team1Active || !team2Active || team1Active === team2Active) continue;

    const winnerActive = m.winnerId === m.coach1SeasonId ? team1Active : team2Active;
    const loserActive = winnerActive === team1Active ? team2Active : team1Active;

    if (!h2h.has(winnerActive)) h2h.set(winnerActive, new Map());
    if (!h2h.has(loserActive)) h2h.set(loserActive, new Map());
    h2h.get(winnerActive)!.set(loserActive, (h2h.get(winnerActive)!.get(loserActive) || 0) + 1);
    h2h.get(loserActive)!.set(winnerActive, (h2h.get(loserActive)!.get(winnerActive) || 0) - 1);
  }

  // Compute W-L-diff and opponent lists
  const standings = activeCoaches.map((sc) => {
    const teamIds = teamIdsMap.get(sc.id)!;
    let wins = 0, losses = 0, differential = 0;
    const opponentActiveIds: number[] = [];

    for (const m of regularMatches) {
      const isCoach1 = teamIds.has(m.coach1SeasonId);
      const isCoach2 = teamIds.has(m.coach2SeasonId);

      if (isCoach1) {
        if (m.winnerId) {
          if (m.winnerId === m.coach1SeasonId) wins++;
          else losses++;
          const opp = resolveToActiveId(m.coach2SeasonId);
          if (opp) opponentActiveIds.push(opp);
        } else if (m.isForfeit) {
          losses++;
          const opp = resolveToActiveId(m.coach2SeasonId);
          if (opp) opponentActiveIds.push(opp);
        }
        differential += m.coach1Differential || 0;
      }

      if (isCoach2) {
        if (m.winnerId) {
          if (m.winnerId === m.coach2SeasonId) wins++;
          else losses++;
          const opp = resolveToActiveId(m.coach1SeasonId);
          if (opp) opponentActiveIds.push(opp);
        } else if (m.isForfeit) {
          losses++;
          const opp = resolveToActiveId(m.coach1SeasonId);
          if (opp) opponentActiveIds.push(opp);
        }
        differential += m.coach2Differential || 0;
      }
    }

    return { ...sc, wins, losses, differential, opponentActiveIds };
  });

  // Build record lookup for SoS
  const recordById = new Map<number, { wins: number; losses: number }>();
  for (const s of standings) {
    recordById.set(s.id, { wins: s.wins, losses: s.losses });
  }

  // Sort: wins → differential → losses → h2h → SoS
  standings.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.differential !== a.differential) return b.differential - a.differential;
    if (a.losses !== b.losses) return a.losses - b.losses;

    const aVsB = h2h.get(a.id)?.get(b.id) || 0;
    if (aVsB !== 0) return aVsB > 0 ? -1 : 1;

    const sosA = a.opponentActiveIds.reduce((sum, id) => {
      const r = recordById.get(id);
      return r ? sum + (r.wins - r.losses) : sum;
    }, 0);
    const sosB = b.opponentActiveIds.reduce((sum, id) => {
      const r = recordById.get(id);
      return r ? sum + (r.wins - r.losses) : sum;
    }, 0);
    return sosB - sosA;
  });

  return standings;
}

/**
 * Simple standings sort for contexts without match-level data (client-side).
 * Uses wins → differential → losses only.
 */
export function sortStandingsSimple<T extends StandingsTeam>(standings: T[]): T[] {
  return standings.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.differential !== a.differential) return b.differential - a.differential;
    return a.losses - b.losses;
  });
}
