import { rawClient } from "@/lib/db";

export interface CoachProfileMilestone {
  key: string;
  category: "coach" | "pokemon" | "season";
  title: string;
  detail: string;
  seasonNumber: number;
  matchId?: number;
  pokemonId?: number;
  isLiveTitle?: boolean;
}

interface MatchRow extends Record<string, unknown> {
  id: number;
  season_id: number;
  season_number: number;
  season_name: string;
  division_name: string;
  week: number;
  winner_id: number | null;
  coach1_season_id: number;
  coach1_id: number;
  coach1_team: string;
  coach1_differential: number;
  coach2_season_id: number;
  coach2_id: number;
  coach2_team: string;
  coach2_differential: number;
  is_forfeit: number;
  played_at: string | null;
}

interface PokemonRow extends Record<string, unknown> {
  match_id: number;
  season_id: number;
  season_number: number;
  week: number;
  played_at: string | null;
  season_coach_id: number;
  coach_id: number;
  pokemon_id: number;
  pokemon_name: string;
  kills: number;
  deaths: number;
}

function resultRows<T extends Record<string, unknown>>(
  result: Awaited<ReturnType<typeof rawClient.execute>>,
): T[] {
  return result.rows as unknown as T[];
}

function isCompleted(match: MatchRow): boolean {
  return match.winner_id !== null
    || (Boolean(match.is_forfeit) && Boolean(match.played_at));
}

function addMilestone(
  milestones: Map<string, CoachProfileMilestone>,
  milestone: CoachProfileMilestone,
) {
  if (!milestones.has(milestone.key)) milestones.set(milestone.key, milestone);
}

export async function getCoachProfileMilestones(
  coachId: number,
): Promise<CoachProfileMilestone[]> {
  const [matchResult, pokemonResult] = await Promise.all([
    rawClient.execute({
      sql: `SELECT m.id, m.season_id, s.season_number, s.name AS season_name,
        d.name AS division_name, m.week, m.winner_id,
        m.coach1_season_id, a.coach_id AS coach1_id, a.team_name AS coach1_team,
        COALESCE(m.coach1_differential, 0) AS coach1_differential,
        m.coach2_season_id, b.coach_id AS coach2_id, b.team_name AS coach2_team,
        COALESCE(m.coach2_differential, 0) AS coach2_differential,
        COALESCE(m.is_forfeit, 0) AS is_forfeit, m.played_at
      FROM matches m
      JOIN seasons s ON s.id = m.season_id
      JOIN divisions d ON d.id = m.division_id
      JOIN season_coaches a ON a.id = m.coach1_season_id
      JOIN season_coaches b ON b.id = m.coach2_season_id
      WHERE COALESCE(s.is_public, 1) = 1
      ORDER BY s.season_number, m.week, COALESCE(m.played_at, ''), m.id`,
      args: [],
    }),
    rawClient.execute({
      sql: `SELECT mp.match_id, m.season_id, s.season_number, m.week, m.played_at,
        mp.season_coach_id, sc.coach_id, mp.pokemon_id,
        COALESCE(p.display_name, p.name) AS pokemon_name,
        COALESCE(mp.kills, 0) AS kills, COALESCE(mp.deaths, 0) AS deaths
      FROM match_pokemon mp
      JOIN matches m ON m.id = mp.match_id
      JOIN seasons s ON s.id = m.season_id
      JOIN season_coaches sc ON sc.id = mp.season_coach_id
      JOIN pokemon p ON p.id = mp.pokemon_id
      WHERE COALESCE(s.is_public, 1) = 1 AND m.winner_id IS NOT NULL
      ORDER BY s.season_number, m.week, COALESCE(m.played_at, ''), m.id, mp.id`,
      args: [],
    }),
  ]);

  const matches = resultRows<MatchRow>(matchResult);
  const pokemonRows = resultRows<PokemonRow>(pokemonResult);
  const milestones = new Map<string, CoachProfileMilestone>();
  const completedMatches = matches.filter(isCompleted);

  let wins = 0;
  let playoffWins = 0;
  let championshipAppearances = 0;
  let championships = 0;
  for (const match of completedMatches) {
    const coachSeasonId = match.coach1_id === coachId
      ? match.coach1_season_id
      : match.coach2_id === coachId
        ? match.coach2_season_id
        : null;
    if (coachSeasonId === null) continue;

    if (match.winner_id === coachSeasonId) {
      wins++;
      if (wins === 1) {
        addMilestone(milestones, {
          key: "coach:first-career-win", category: "coach",
          title: "🏆 First Career Victory",
          detail: `${match.coach1_id === coachId ? match.coach1_team : match.coach2_team} · ${match.season_name}`,
          seasonNumber: match.season_number, matchId: match.id,
        });
      }
      if (match.week >= 101) {
        playoffWins++;
        if (playoffWins === 1) {
          addMilestone(milestones, {
            key: "coach:first-playoff-win", category: "coach",
            title: "🔥 First Playoff Victory",
            detail: `${match.division_name} · Season ${match.season_number}`,
            seasonNumber: match.season_number, matchId: match.id,
          });
        }
      }
    }

    if (match.week === 103) {
      championshipAppearances++;
      if (championshipAppearances === 1) {
        addMilestone(milestones, {
          key: "coach:first-championship-appearance", category: "coach",
          title: "🌟 First Championship Appearance",
          detail: `${match.division_name} · Season ${match.season_number}`,
          seasonNumber: match.season_number, matchId: match.id,
        });
      }
      if (match.winner_id === coachSeasonId) {
        championships++;
        if (championships === 1) {
          addMilestone(milestones, {
            key: "coach:first-championship", category: "coach",
            title: "👑 First Championship",
            detail: `${match.division_name} · Season ${match.season_number}`,
            seasonNumber: match.season_number, matchId: match.id,
          });
        } else if (championships === 2) {
          addMilestone(milestones, {
            key: "coach:multiple-championships", category: "coach",
            title: "👑 Multiple-Time Champion",
            detail: `Second title · Season ${match.season_number}`,
            seasonNumber: match.season_number, matchId: match.id,
          });
        }
      }
    }
  }

  const pokemonKills = new Map<number, number>();
  const pokemonAppearances = new Map<number, number>();
  const survivalStreaks = new Map<number, number>();
  const coachPokemonKills = new Map<number, Map<number, number>>();
  const coachPokemonLastRows = new Map<string, PokemonRow>();
  const seasonPokemonKills = new Map<number, Map<number, number>>();
  const seasonPokemonLastCoach = new Map<string, number>();
  const pokemonNames = new Map<number, string>();

  for (const row of pokemonRows) {
    pokemonNames.set(row.pokemon_id, row.pokemon_name);
    const priorKills = pokemonKills.get(row.pokemon_id) ?? 0;
    const nextKills = priorKills + Number(row.kills);
    pokemonKills.set(row.pokemon_id, nextKills);
    const nextAppearances = (pokemonAppearances.get(row.pokemon_id) ?? 0) + 1;
    pokemonAppearances.set(row.pokemon_id, nextAppearances);

    if (row.coach_id === coachId) {
      for (const threshold of [1, 10, 25, 50, 100]) {
        if (priorKills < threshold && nextKills >= threshold) {
          addMilestone(milestones, {
            key: `pokemon:${row.pokemon_id}:kills:${threshold}`, category: "pokemon",
            title: threshold === 1 ? "⚔️ First Recorded Kill" : `⚔️ ${threshold} Career Kills`,
            detail: `${row.pokemon_name} · Season ${row.season_number}`,
            seasonNumber: row.season_number, matchId: row.match_id,
          });
        }
      }
      if ([25, 50, 100].includes(nextAppearances)) {
        addMilestone(milestones, {
          key: `pokemon:${row.pokemon_id}:appearances:${nextAppearances}`, category: "pokemon",
          title: `🎮 ${nextAppearances} Appearances`,
          detail: `${row.pokemon_name} · Season ${row.season_number}`,
          seasonNumber: row.season_number, matchId: row.match_id,
        });
      }
    }

    const nextStreak = Number(row.deaths) === 0
      ? (survivalStreaks.get(row.pokemon_id) ?? 0) + 1
      : 0;
    survivalStreaks.set(row.pokemon_id, nextStreak);
    if (row.coach_id === coachId && (nextStreak === 5 || nextStreak === 10)) {
      addMilestone(milestones, {
        key: `pokemon:${row.pokemon_id}:survival:${nextStreak}`, category: "pokemon",
        title: `🛡️ ${nextStreak}-Match Survival Streak`,
        detail: `${row.pokemon_name} · Season ${row.season_number}`,
        seasonNumber: row.season_number, matchId: row.match_id,
      });
    }

    const pairKey = `${row.coach_id}:${row.pokemon_id}`;
    const coachTotals = coachPokemonKills.get(row.coach_id) ?? new Map<number, number>();
    const priorPairKills = coachTotals.get(row.pokemon_id) ?? 0;
    const nextPairKills = priorPairKills + Number(row.kills);
    const otherPokemonBest = Math.max(
      0,
      ...[...coachTotals.entries()]
        .filter(([pokemonId]) => pokemonId !== row.pokemon_id)
        .map(([, total]) => total),
    );
    coachTotals.set(row.pokemon_id, nextPairKills);
    coachPokemonKills.set(row.coach_id, coachTotals);
    coachPokemonLastRows.set(pairKey, row);
    if (
      row.coach_id === coachId
      && Number(row.kills) > 0
      && otherPokemonBest > 0
      && priorPairKills <= otherPokemonBest
      && nextPairKills > otherPokemonBest
    ) {
      addMilestone(milestones, {
        key: `pokemon:${row.pokemon_id}:coach-record`, category: "pokemon",
        title: "⭐ Coach's Career Kill Leader",
        detail: `${row.pokemon_name} · ${nextPairKills} kills`,
        seasonNumber: row.season_number, matchId: row.match_id,
      });
    }

    if (row.week < 100) {
      const seasonTotals = seasonPokemonKills.get(row.season_id) ?? new Map<number, number>();
      seasonTotals.set(
        row.pokemon_id,
        (seasonTotals.get(row.pokemon_id) ?? 0) + Number(row.kills),
      );
      seasonPokemonKills.set(row.season_id, seasonTotals);
      seasonPokemonLastCoach.set(`${row.season_id}:${row.pokemon_id}`, row.coach_id);
    }
  }

  // This is a live title rather than a permanent historical achievement.
  // When another coach takes the career kill lead for a Pokemon, the former
  // holder stops receiving this milestone the next time their profile renders.
  const targetCoachPokemonKills = coachPokemonKills.get(coachId);
  if (targetCoachPokemonKills) {
    for (const [pokemonId, kills] of targetCoachPokemonKills) {
      const leaderKills = Math.max(
        0,
        ...[...coachPokemonKills.values()].map(
          (coachTotals) => coachTotals.get(pokemonId) ?? 0,
        ),
      );
      if (kills <= 0 || kills !== leaderKills) continue;

      const latestRow = coachPokemonLastRows.get(`${coachId}:${pokemonId}`);
      if (!latestRow) continue;
      addMilestone(milestones, {
        key: `pokemon:${pokemonId}:current-kill-leader`,
        category: "pokemon",
        title: `👑 ${latestRow.pokemon_name} Kill Leader`,
        detail: `Current PBO leader · ${kills} career kills`,
        seasonNumber: latestRow.season_number,
        matchId: latestRow.match_id,
        pokemonId,
        isLiveTitle: true,
      });
    }
  }

  const seasonMatches = new Map<number, MatchRow[]>();
  for (const match of matches.filter((entry) => entry.week < 100)) {
    const entries = seasonMatches.get(match.season_id) ?? [];
    entries.push(match);
    seasonMatches.set(match.season_id, entries);
  }

  for (const [seasonId, regularMatches] of seasonMatches) {
    if (regularMatches.length === 0 || regularMatches.some((match) => !isCompleted(match))) continue;
    const reference = regularMatches[regularMatches.length - 1];
    const teamStats = new Map<number, {
      coachId: number;
      teamName: string;
      wins: number;
      losses: number;
      differential: number;
    }>();
    for (const match of regularMatches) {
      for (const side of [1, 2] as const) {
        const seasonCoachId = side === 1 ? match.coach1_season_id : match.coach2_season_id;
        const stats = teamStats.get(seasonCoachId) ?? {
          coachId: side === 1 ? match.coach1_id : match.coach2_id,
          teamName: side === 1 ? match.coach1_team : match.coach2_team,
          wins: 0, losses: 0, differential: 0,
        };
        if (match.winner_id === seasonCoachId) stats.wins++;
        else stats.losses++;
        stats.differential += side === 1
          ? Number(match.coach1_differential)
          : Number(match.coach2_differential);
        teamStats.set(seasonCoachId, stats);
      }
    }

    for (const [seasonCoachId, stats] of teamStats) {
      if (stats.coachId === coachId && stats.wins > 0 && stats.losses === 0) {
        addMilestone(milestones, {
          key: `season:${seasonId}:team:${seasonCoachId}:undefeated`, category: "season",
          title: "💎 Undefeated Regular Season",
          detail: `${stats.teamName} · Season ${reference.season_number}`,
          seasonNumber: reference.season_number,
        });
      }
    }
    const bestDifferential = Math.max(
      ...[...teamStats.values()].map((stats) => stats.differential),
    );
    for (const [seasonCoachId, stats] of teamStats) {
      if (stats.coachId === coachId && stats.differential === bestDifferential) {
        addMilestone(milestones, {
          key: `season:${seasonId}:team:${seasonCoachId}:differential`, category: "season",
          title: "📊 League's Best Differential",
          detail: `${stats.teamName} · ${bestDifferential >= 0 ? "+" : ""}${bestDifferential}`,
          seasonNumber: reference.season_number,
        });
      }
    }

    const killTotals = seasonPokemonKills.get(seasonId);
    if (killTotals?.size) {
      const topKills = Math.max(...killTotals.values());
      for (const [pokemonId, kills] of killTotals) {
        if (
          kills === topKills
          && kills > 0
          && seasonPokemonLastCoach.get(`${seasonId}:${pokemonId}`) === coachId
        ) {
          addMilestone(milestones, {
            key: `season:${seasonId}:pokemon:${pokemonId}:kill-leader`, category: "pokemon",
            title: "⚔️ Season Kill Leader",
            detail: `${pokemonNames.get(pokemonId) ?? "Pokémon"} · ${kills} kills`,
            seasonNumber: reference.season_number,
          });
        }
      }
    }
  }

  return [...milestones.values()].sort(
    (left, right) => right.seasonNumber - left.seasonNumber || left.title.localeCompare(right.title),
  );
}
