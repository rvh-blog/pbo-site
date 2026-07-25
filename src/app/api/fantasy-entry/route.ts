import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import {
  fantasyEntries,
  fantasyEntryPicks,
  fantasyRewards,
  matches,
  rosters,
  seasonCoaches,
  seasonPokemonPrices,
  seasons,
  transactions,
} from "@/lib/schema";
import { getSiteFeatureSettings } from "@/lib/site-settings";
import {
  getFantasyWeeklyStatsForWeek,
  getFantasyWeeklyStatsForWeeks,
} from "@/lib/fantasy-stats";
import { getTimeSyncedRoster, type TimeSyncTransaction } from "@/lib/roster-utils";
import {
  fantasyPickKey,
  FANTASY_BUDGET,
  FANTASY_ROSTER_SIZE,
  FANTASY_SLOT_RULES,
  optimizeFantasyLineup,
  type FantasyLineupCandidate,
} from "@/lib/fantasy-scoring";

const FANTASY_MIN_SEASON = 10;
const scheduleCache = new Map<number, {
  expiresAt: number;
  weeks: number[];
  statuses: Record<number, "upcoming" | "in-progress" | "complete">;
}>();

function normalizeDivisionName(name: string | null | undefined) {
  return name?.trim().toLowerCase() || "";
}

async function getFantasySeason(seasonId: number) {
  const season = await db.query.seasons.findFirst({
    where: eq(seasons.id, seasonId),
  });

  if (!season || season.isPublic === false || season.seasonNumber < FANTASY_MIN_SEASON) {
    return null;
  }

  return season;
}

function fantasyParticipantKey(entry: { coachId: number | null; userId: number | null; displayName: string }) {
  if (entry.coachId !== null) return `coach:${entry.coachId}`;
  if (entry.userId !== null) return `user:${entry.userId}`;
  return `name:${entry.displayName}`;
}

type FantasyScoreDetail = {
  kills: number;
  deaths: number;
  wins: number;
  losses: number;
};

async function getPokemonWeekData(
  seasonId: number,
  seasonNumber: number,
  scoringWeek: number
) {
  if (seasonNumber === 10 && scoringWeek === 8) {
    return {
      scores: new Map<string, number>(),
      details: new Map<string, FantasyScoreDetail>(),
    };
  }
  const stats = await getFantasyWeeklyStatsForWeek(seasonId, scoringWeek);
  return {
    scores: new Map(
      stats.map((stat) => [
        fantasyPickKey({ pokemonId: stat.pokemonId, seasonCoachId: stat.seasonCoachId }),
        stat.score,
      ])
    ),
    details: new Map(
    stats.map((stat) => [
      fantasyPickKey({ pokemonId: stat.pokemonId, seasonCoachId: stat.seasonCoachId }),
      {
        kills: stat.kills,
        deaths: stat.deaths,
        wins: stat.wins,
        losses: stat.losses,
      },
    ])
    ),
  };
}

async function getPokemonScores(
  seasonId: number,
  seasonNumber: number,
  scoringWeek: number
) {
  return (await getPokemonWeekData(seasonId, seasonNumber, scoringWeek)).scores;
}

async function getFantasyScheduleState(seasonId: number) {
  const cached = scheduleCache.get(seasonId);
  if (cached && cached.expiresAt > Date.now()) {
    return { weeks: cached.weeks, statuses: cached.statuses };
  }
  const seasonMatches = await db.query.matches.findMany({
    where: eq(matches.seasonId, seasonId),
    columns: {
      week: true,
      winnerId: true,
      isForfeit: true,
      startedAt: true,
      scheduledAt: true,
    },
  });
  const now = Date.now();
  const matchesByWeek = new Map<number, typeof seasonMatches>();
  for (const match of seasonMatches) {
    if (match.week <= 0 || match.week >= 100) continue;
    const rows = matchesByWeek.get(match.week) ?? [];
    rows.push(match);
    matchesByWeek.set(match.week, rows);
  }

  const statuses = Object.fromEntries(
    [...matchesByWeek.entries()].map(([week, weekMatches]) => {
      const complete = weekMatches.length > 0 &&
        weekMatches.every((match) => match.winnerId !== null || match.isForfeit);
      const inProgress = !complete && weekMatches.some((match) =>
        Boolean(match.startedAt) ||
        Boolean(match.winnerId) ||
        Boolean(match.isForfeit) ||
        (Boolean(match.scheduledAt) && new Date(match.scheduledAt!).getTime() <= now)
      );
      return [week, complete ? "complete" : inProgress ? "in-progress" : "upcoming"];
    })
  ) as Record<number, "upcoming" | "in-progress" | "complete">;
  const weeks = [...matchesByWeek.keys()].sort((a, b) => a - b);
  scheduleCache.set(seasonId, {
    expiresAt: now + 30_000,
    weeks,
    statuses,
  });
  return { weeks, statuses };
}

async function getPriceMap(seasonId: number) {
  const prices = await db.query.seasonPokemonPrices.findMany({
    where: eq(seasonPokemonPrices.seasonId, seasonId),
  });

  return new Map(
    prices
      .filter((row) => row.price >= 0)
      .map((row) => [row.pokemonId, row.price])
  );
}

async function getSeasonCoachDivisionMap(seasonId: number, seasonCoachIds: number[]) {
  const rows = await db.query.seasonCoaches.findMany({
    where: inArray(seasonCoaches.id, seasonCoachIds),
    with: {
      division: true,
    },
  });

  const divisionMap = new Map<number, string>();
  const seasonDivisions = new Set<string>();

  for (const row of rows) {
    if (!row.division || row.division.seasonId !== seasonId) continue;

    const divisionName = normalizeDivisionName(row.division.name);
    if (!divisionName) continue;

    divisionMap.set(row.id, divisionName);
    seasonDivisions.add(divisionName);
  }

  return { divisionMap, seasonDivisions };
}

async function getStartedFantasyWeekSeasonCoachIds(seasonId: number, week: number) {
  const weekMatches = await db.query.matches.findMany({
    where: and(eq(matches.seasonId, seasonId), eq(matches.week, week)),
    columns: {
      coach1SeasonId: true,
      coach2SeasonId: true,
      winnerId: true,
      isForfeit: true,
      startedAt: true,
      scheduledAt: true,
    },
  });
  const now = Date.now();
  const startedSeasonCoachIds = new Set<number>();

  for (const match of weekMatches) {
    const hasBegun =
      Boolean(match.startedAt) ||
      Boolean(match.winnerId) ||
      Boolean(match.isForfeit) ||
      (Boolean(match.scheduledAt) && new Date(match.scheduledAt!).getTime() <= now);

    if (!hasBegun) continue;

    startedSeasonCoachIds.add(match.coach1SeasonId);
    startedSeasonCoachIds.add(match.coach2SeasonId);
  }

  return startedSeasonCoachIds;
}

function entryBelongsToSession(
  entry: { coachId: number | null; userId: number | null },
  session: Awaited<ReturnType<typeof getSession>>
) {
  if (!session) return false;
  return session.type === "coach"
    ? entry.coachId === session.id
    : entry.userId === session.id;
}

async function getSeasonFantasyEntries(seasonId: number) {
  return db.query.fantasyEntries.findMany({
    where: eq(fantasyEntries.seasonId, seasonId),
    with: {
      coach: true,
      user: true,
      picks: {
        with: {
          pokemon: true,
          seasonCoach: {
            with: {
              division: true,
            },
          },
        },
      },
    },
  });
}

type FantasyEntryWithPicks = Awaited<ReturnType<typeof getSeasonFantasyEntries>>[number];

function buildWeekLeaderboard(
  entries: FantasyEntryWithPicks[],
  scoreMap: Map<string, number>,
  week: number,
  scoreDetails: Map<string, FantasyScoreDetail> = new Map()
) {
  const rows = entries
    .filter((entry) => entry.week === week)
    .map((entry) => {
      const picks = entry.picks
        .slice()
        .sort((a, b) => a.slot - b.slot)
        .map((pick) => {
          const key = fantasyPickKey(pick);
          const detail = scoreDetails.get(key);
          return {
            pokemonId: pick.pokemonId,
            seasonCoachId: pick.seasonCoachId,
            name: pick.pokemon?.displayName || pick.pokemon?.name || "Unknown",
            spriteUrl: pick.pokemon?.spriteUrl || null,
            score: scoreMap.get(key) ?? 0,
            teamName: pick.seasonCoach?.teamName ?? "",
            divisionName: pick.seasonCoach?.division?.name ?? "",
            kills: detail?.kills ?? 0,
            deaths: detail?.deaths ?? 0,
            wins: detail?.wins ?? 0,
            losses: detail?.losses ?? 0,
          };
        });

      return {
        id: entry.id,
        displayName: entry.displayName,
        coachId: entry.coachId,
        userId: entry.userId,
        week,
        totalScore: picks.reduce((sum, pick) => sum + pick.score, 0),
        picks,
        updatedAt: entry.updatedAt,
        rank: 0,
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore);

  let previousScore: number | null = null;
  let previousRank = 0;
  rows.forEach((row, index) => {
    if (previousScore === null || row.totalScore !== previousScore) {
      previousRank = index + 1;
      previousScore = row.totalScore;
    }
    row.rank = previousRank;
  });
  return rows;
}

async function buildFantasyLeaderboard(
  entries: FantasyEntryWithPicks[],
  seasonId: number,
  seasonNumber: number,
  leaderboardWeeks: number[],
  scoringWeek: number,
  leaderboardWeek: number | "overall"
) {
  const scoreMapsByWeek = new Map<number, Map<string, number>>();
  const scoreDetailsByWeek = new Map<number, Map<string, FantasyScoreDetail>>();
  const statsWeeks = leaderboardWeeks.filter(
    (week) => !(seasonNumber === 10 && week === 8)
  );
  const statsByWeek = await getFantasyWeeklyStatsForWeeks(seasonId, statsWeeks);
  for (const week of leaderboardWeeks) {
    const stats = seasonNumber === 10 && week === 8
      ? []
      : statsByWeek.get(week) ?? [];
    scoreMapsByWeek.set(
      week,
      new Map(stats.map((stat) => [
        fantasyPickKey({ pokemonId: stat.pokemonId, seasonCoachId: stat.seasonCoachId }),
        stat.score,
      ]))
    );
    scoreDetailsByWeek.set(
      week,
      new Map(stats.map((stat) => [
        fantasyPickKey({ pokemonId: stat.pokemonId, seasonCoachId: stat.seasonCoachId }),
        {
          kills: stat.kills,
          deaths: stat.deaths,
          wins: stat.wins,
          losses: stat.losses,
        },
      ]))
    );
  }
  const rewardRows = await db.query.fantasyRewards.findMany({
    where: eq(fantasyRewards.seasonId, seasonId),
  });
  const rewardByEntryId = new Map(
    rewardRows.map((reward) => [reward.entryId, reward.amount])
  );

  const weeklyBoards = new Map(
    leaderboardWeeks.map((week) => [
      week,
      buildWeekLeaderboard(
        entries,
        scoreMapsByWeek.get(week) ?? new Map(),
        week,
        scoreDetailsByWeek.get(week) ?? new Map()
      ),
    ])
  );
  const participantProfiles = new Map<string, {
    weeks: {
      week: number;
      score: number;
      rank: number;
      picks: ReturnType<typeof buildWeekLeaderboard>[number]["picks"];
      entryId: number;
      updatedAt: string;
      displayName: string;
      coachId: number | null;
      userId: number | null;
      rewardAmount: number;
    }[];
  }>();

  for (const [week, board] of weeklyBoards) {
    for (const row of board) {
      const key = fantasyParticipantKey(row);
      const profile = participantProfiles.get(key) ?? { weeks: [] };
      profile.weeks.push({
        week,
        score: row.totalScore,
        rank: row.rank,
        picks: row.picks,
        entryId: row.id,
        updatedAt: row.updatedAt,
        displayName: row.displayName,
        coachId: row.coachId,
        userId: row.userId,
        rewardAmount: rewardByEntryId.get(row.id) ?? 0,
      });
      participantProfiles.set(key, profile);
    }
  }

  const comparisonWeek = leaderboardWeek === "overall" ? scoringWeek : leaderboardWeek;
  const previousWeek = [...leaderboardWeeks].filter((week) => week < comparisonWeek).at(-1);
  const previousRankByParticipant = new Map(
    (previousWeek ? weeklyBoards.get(previousWeek) ?? [] : []).map((row) => [
      fantasyParticipantKey(row),
      row.rank,
    ])
  );

  if (leaderboardWeek !== "overall") {
    return (weeklyBoards.get(leaderboardWeek) ?? []).map((row) => {
      const key = fantasyParticipantKey(row);
      const profile = participantProfiles.get(key)?.weeks ?? [];
      const seasonTotal = profile.reduce((sum, week) => sum + week.score, 0);
      const previousRank = previousRankByParticipant.get(key) ?? null;
      return {
        ...row,
        weeklyScore: row.totalScore,
        seasonTotal,
        weeksEntered: profile.length,
        averageScore: profile.length ? seasonTotal / profile.length : 0,
        rankMovement: previousRank === null ? null : previousRank - row.rank,
        weeklyHistory: profile,
      };
    });
  }

  const overallRows = [...participantProfiles.entries()].map(([key, profile]) => {
    const sortedWeeks = profile.weeks.sort((a, b) => a.week - b.week);
    const latest = sortedWeeks.at(-1)!;
    const seasonTotal = sortedWeeks.reduce((sum, week) => sum + week.score, 0);
    const scoringWeekRow = sortedWeeks.find((week) => week.week === scoringWeek);
    return {
      id: latest.entryId,
      displayName: latest.displayName,
      coachId: latest.coachId,
      userId: latest.userId,
      week: null,
      totalScore: seasonTotal,
      weeklyScore: scoringWeekRow?.score ?? 0,
      seasonTotal,
      picks: scoringWeekRow?.picks ?? latest.picks,
      updatedAt: latest.updatedAt,
      rank: 0,
      weeksEntered: sortedWeeks.length,
      averageScore: seasonTotal / sortedWeeks.length,
      rankMovement: previousRankByParticipant.has(key) ? 0 : null,
      weeklyHistory: sortedWeeks,
    };
  }).sort((a, b) => b.totalScore - a.totalScore);

  let previousScore: number | null = null;
  let previousRank = 0;
  overallRows.forEach((row, index) => {
    if (previousScore === null || row.totalScore !== previousScore) {
      previousScore = row.totalScore;
      previousRank = index + 1;
    }
    row.rank = previousRank;
  });
  const previousOverallRows = [...participantProfiles.entries()]
    .map(([key, profile]) => ({
      key,
      score: profile.weeks
        .filter((week) => week.week < scoringWeek)
        .reduce((sum, week) => sum + week.score, 0),
    }))
    .filter((row) => row.score !== 0)
    .sort((a, b) => b.score - a.score);
  const previousOverallRanks = new Map<string, number>();
  previousScore = null;
  previousRank = 0;
  previousOverallRows.forEach((row, index) => {
    if (previousScore === null || row.score !== previousScore) {
      previousScore = row.score;
      previousRank = index + 1;
    }
    previousOverallRanks.set(row.key, previousRank);
  });
  for (const row of overallRows) {
    const key = fantasyParticipantKey(row);
    const oldRank = previousOverallRanks.get(key);
    row.rankMovement = oldRank === undefined ? null : oldRank - row.rank;
  }
  return overallRows;
}

async function getHighestScoringLegalRoster(
  seasonId: number,
  week: number,
  scoreMap: Map<string, number>,
  excludedInstanceKeys: Set<string>
) {
  const [teams, priceRows, seasonTransactions] = await Promise.all([
    db.query.seasonCoaches.findMany({
      where: eq(seasonCoaches.isActive, true),
      with: { division: true },
    }),
    db.query.seasonPokemonPrices.findMany({
      where: eq(seasonPokemonPrices.seasonId, seasonId),
      with: { pokemon: true },
    }),
    db.query.transactions.findMany({
      where: eq(transactions.seasonId, seasonId),
    }),
  ]);
  const seasonTeams = teams.filter((team) => team.division?.seasonId === seasonId);
  const teamIds = seasonTeams.map((team) => team.id);
  const currentRosters = teamIds.length
    ? await db.query.rosters.findMany({
        where: inArray(rosters.seasonCoachId, teamIds),
        with: { pokemon: true },
      })
    : [];
  const priceMap = new Map(
    priceRows
      .filter((row) => row.price >= 0)
      .map((row) => [row.pokemonId, row.price])
  );
  const candidates = new Map<string, FantasyLineupCandidate>();

  await Promise.all(seasonTeams.map(async (team) => {
    const teamRosters = currentRosters.filter((roster) => roster.seasonCoachId === team.id);
    const teamTransactions = seasonTransactions.filter((transaction) =>
      transaction.seasonCoachId === team.id ||
      (
        transaction.type === "P2P_TRADE" &&
        transaction.tradingPartnerSeasonCoachId === team.id
      )
    );
    const { filteredRosters, droppedPokemonDetails } = await getTimeSyncedRoster(
      team.id,
      week,
      teamRosters,
      teamTransactions as TimeSyncTransaction[]
    );

    for (const roster of filteredRosters) {
      if (!roster.pokemon) continue;
      const cost = priceMap.get(roster.pokemonId);
      if (cost === undefined || cost < 0) continue;
      const candidate: FantasyLineupCandidate = {
        pokemonId: roster.pokemonId,
        seasonCoachId: team.id,
        name: roster.pokemon.displayName || roster.pokemon.name,
        spriteUrl: roster.pokemon.spriteUrl,
        divisionName: team.division?.name ?? "",
        teamName: team.teamName,
        cost,
        score: scoreMap.get(fantasyPickKey({
          pokemonId: roster.pokemonId,
          seasonCoachId: team.id,
        })) ?? 0,
      };
      candidates.set(fantasyPickKey(candidate), candidate);
    }

    for (const pokemon of droppedPokemonDetails) {
      const cost = priceMap.get(pokemon.id);
      if (cost === undefined || cost < 0) continue;
      const candidate: FantasyLineupCandidate = {
        pokemonId: pokemon.id,
        seasonCoachId: team.id,
        name: pokemon.displayName || pokemon.name,
        spriteUrl: pokemon.spriteUrl,
        divisionName: team.division?.name ?? "",
        teamName: team.teamName,
        cost,
        score: scoreMap.get(fantasyPickKey({
          pokemonId: pokemon.id,
          seasonCoachId: team.id,
        })) ?? 0,
      };
      candidates.set(fantasyPickKey(candidate), candidate);
    }
  }));

  return optimizeFantasyLineup(
    [...candidates.values()],
    [...new Set(seasonTeams.map((team) => team.division?.name ?? "").filter(Boolean))],
    excludedInstanceKeys
  );
}

export async function GET(request: NextRequest) {
  try {
    const featureSettings = await getSiteFeatureSettings();
    if (featureSettings.fantasyUiHidden) {
      return NextResponse.json({ error: "Fantasy is currently unavailable" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const seasonId = Number(searchParams.get("seasonId"));
    const requestedWeek = Number(searchParams.get("week"));
    const leaderboardWeekParam = searchParams.get("leaderboardWeek");
    const mode = searchParams.get("mode") || "full";

    if (!Number.isInteger(seasonId)) {
      return NextResponse.json({ error: "seasonId is required" }, { status: 400 });
    }

    const season = await getFantasySeason(seasonId);
    if (!season) {
      return NextResponse.json({ error: "Fantasy is only available for public seasons 10 and later" }, { status: 400 });
    }
    const scoringWeek = Number.isInteger(requestedWeek) && requestedWeek > 0
      ? requestedWeek
      : season.seasonNumber === 10
        ? 8
        : 1;
    const scheduleState = await getFantasyScheduleState(seasonId);
    const leaderboardWeeks = scheduleState.weeks;
    const weekStatuses = scheduleState.statuses;
    const requestedLeaderboardWeek = Number(leaderboardWeekParam);
    const leaderboardWeek: number | "overall" =
      leaderboardWeekParam === "overall"
        ? "overall"
        : Number.isInteger(requestedLeaderboardWeek) &&
            leaderboardWeeks.includes(requestedLeaderboardWeek)
          ? requestedLeaderboardWeek
          : scoringWeek;

    const session = mode === "live" ? null : await getSession();
    const allEntries = await getSeasonFantasyEntries(seasonId);
    const entries = allEntries.filter((entry) => entry.week === scoringWeek);

    if (mode === "used") {
      const usedInstances = session
        ? allEntries
            .filter((entry) => entry.week !== scoringWeek && entryBelongsToSession(entry, session))
            .flatMap((entry) => entry.picks.map((pick) => ({ entry, pick })))
            .sort((a, b) => (
              a.entry.week === b.entry.week
                ? a.pick.slot - b.pick.slot
                : a.entry.week - b.entry.week
            ))
            .filter(({ pick }) => pick.seasonCoachId !== null)
            .map(({ entry, pick }) => ({
              entryWeek: entry.week,
              pokemonId: pick.pokemonId,
              seasonCoachId: pick.seasonCoachId!,
              name: pick.pokemon?.displayName || pick.pokemon?.name || "Unknown",
              spriteUrl: pick.pokemon?.spriteUrl || null,
              teamName: pick.seasonCoach?.teamName || "",
              divisionName: pick.seasonCoach?.division?.name || "",
            }))
        : [];
      return NextResponse.json(
        { usedInstances },
        { headers: { "Cache-Control": "private, max-age=10" } }
      );
    }

    const scoringWeekScoreMap = await getPokemonScores(
      seasonId,
      season.seasonNumber,
      scoringWeek
    );
    const leaderboard = await buildFantasyLeaderboard(
      allEntries,
      seasonId,
      season.seasonNumber,
      leaderboardWeeks,
      scoringWeek,
      leaderboardWeek
    );

    if (mode === "live") {
      return NextResponse.json({
        leaderboard: leaderboard.map((entry) => ({
          id: entry.id,
          coachId: entry.coachId,
          userId: entry.userId,
          displayName: entry.displayName,
          rank: entry.rank,
          totalScore: entry.totalScore,
          weeklyScore: entry.weeklyScore,
          seasonTotal: entry.seasonTotal,
          rankMovement: entry.rankMovement,
          weeksEntered: entry.weeksEntered,
          averageScore: entry.averageScore,
          picks: entry.picks.map((pick) => ({
            pokemonId: pick.pokemonId,
            seasonCoachId: pick.seasonCoachId,
            score: pick.score,
          })),
        })),
        weekStatuses,
      }, {
        headers: { "Cache-Control": "public, max-age=5, stale-while-revalidate=10" },
      });
    }

    if (mode === "details") {
      const participant = searchParams.get("participant");
      const detail = leaderboard.find((entry) => (
        participant === `coach:${entry.coachId}` ||
        participant === `user:${entry.userId}` ||
        participant === `entry:${entry.id}`
      )) ?? null;
      return NextResponse.json(
        { detail },
        { headers: { "Cache-Control": "private, max-age=30" } }
      );
    }

    const lockedSeasonCoachIds = [
      ...(await getStartedFantasyWeekSeasonCoachIds(seasonId, scoringWeek)),
    ];

    const myEntry = session ? entries.find((entry) => entryBelongsToSession(entry, session)) : null;
    const previousWeek = weekStatuses[scoringWeek] === "complete"
      ? scoringWeek
      : leaderboardWeeks.filter((week) => week < scoringWeek).at(-1) ?? null;
    let previousWeekSummary: {
      week: number;
      rank: number | null;
      totalScore: number | null;
      rewardAmount: number;
      rankMovement: number | null;
      beatPercent: number | null;
      bestPick: ReturnType<typeof buildWeekLeaderboard>[number]["picks"][number] | null;
      worstPick: ReturnType<typeof buildWeekLeaderboard>[number]["picks"][number] | null;
      optimalScore: number | null;
      optimalCost: number | null;
      optimalPicks: FantasyLineupCandidate[];
      pointsLeftOnBoard: number | null;
      isComplete: boolean;
    } | null = null;

    if (session && previousWeek !== null) {
      const previousWeekData = await getPokemonWeekData(
        seasonId,
        season.seasonNumber,
        previousWeek
      );
      const previousScoreMap = previousWeekData.scores;
      const previousScoreDetails = previousWeekData.details;
      const previousLeaderboard = buildWeekLeaderboard(
        allEntries,
        previousScoreMap,
        previousWeek,
        previousScoreDetails
      );
      const previousEntry = previousLeaderboard.find((entry) =>
        entryBelongsToSession(entry, session)
      );
      const earlierWeek = leaderboardWeeks.filter((week) => week < previousWeek).at(-1) ?? null;
      const earlierLeaderboard = earlierWeek === null
        ? []
        : buildWeekLeaderboard(
            allEntries,
            await getPokemonScores(seasonId, season.seasonNumber, earlierWeek),
            earlierWeek
          );
      const earlierEntry = earlierLeaderboard.find((entry) => entryBelongsToSession(entry, session));
      const previousReward = previousEntry
        ? await db.query.fantasyRewards.findFirst({
            where: and(
              eq(fantasyRewards.seasonId, seasonId),
              eq(fantasyRewards.week, previousWeek),
              eq(fantasyRewards.entryId, previousEntry.id)
            ),
          })
        : null;
      const weekMatches = await db.query.matches.findMany({
        where: and(eq(matches.seasonId, seasonId), eq(matches.week, previousWeek)),
        columns: { winnerId: true, isForfeit: true },
      });
      const isComplete = weekMatches.length > 0 &&
        weekMatches.every((match) => match.winnerId !== null || match.isForfeit);
      const excludedInstanceKeys = new Set(
        allEntries
          .filter((entry) => entry.week < previousWeek && entryBelongsToSession(entry, session))
          .flatMap((entry) => entry.picks.map(fantasyPickKey))
      );
      const optimalRoster = isComplete
        ? await getHighestScoringLegalRoster(
            seasonId,
            previousWeek,
            previousScoreMap,
            excludedInstanceKeys
          )
        : null;
      const sortedPicks = previousEntry
        ? [...previousEntry.picks].sort((a, b) => b.score - a.score)
        : [];
      const lowerScores = previousEntry
        ? previousLeaderboard.filter((entry) => entry.totalScore < previousEntry.totalScore).length
        : 0;
      const beatPercent = previousEntry && previousLeaderboard.length > 1
        ? Math.round((lowerScores / (previousLeaderboard.length - 1)) * 100)
        : previousEntry
          ? 100
          : null;

      previousWeekSummary = {
        week: previousWeek,
        rank: previousEntry?.rank ?? null,
        totalScore: previousEntry?.totalScore ?? null,
        rewardAmount: previousReward?.amount ?? 0,
        rankMovement: previousEntry && earlierEntry
          ? earlierEntry.rank - previousEntry.rank
          : null,
        beatPercent,
        bestPick: sortedPicks[0] ?? null,
        worstPick: sortedPicks.at(-1) ?? null,
        optimalScore: optimalRoster?.score ?? null,
        optimalCost: optimalRoster?.cost ?? null,
        optimalPicks: optimalRoster?.picks ?? [],
        pointsLeftOnBoard: previousEntry && optimalRoster
          ? Math.max(0, optimalRoster.score - previousEntry.totalScore)
          : null,
        isComplete,
      };
    }
    const usedInstances = session
      ? allEntries
          .filter((entry) => entry.week !== scoringWeek && entryBelongsToSession(entry, session))
          .flatMap((entry) => entry.picks.map((pick) => ({ entry, pick })))
          .sort((a, b) => {
            if (a.entry.week !== b.entry.week) return a.entry.week - b.entry.week;
            return a.pick.slot - b.pick.slot;
          })
          .map(({ entry, pick }) => ({
            entryWeek: entry.week,
            pokemonId: pick.pokemonId,
            seasonCoachId: pick.seasonCoachId,
            name: pick.pokemon?.displayName || pick.pokemon?.name || "Unknown",
            spriteUrl: pick.pokemon?.spriteUrl || null,
            teamName: pick.seasonCoach?.teamName || "",
            divisionName: pick.seasonCoach?.division?.name || "",
          }))
          .filter((pick) => pick.seasonCoachId !== null)
          .map((pick) => ({
            entryWeek: pick.entryWeek,
            pokemonId: pick.pokemonId,
            seasonCoachId: pick.seasonCoachId!,
            name: pick.name,
            spriteUrl: pick.spriteUrl,
            teamName: pick.teamName,
            divisionName: pick.divisionName,
          }))
      : [];

    return NextResponse.json({
      user: session,
      myEntry: myEntry
        ? {
            id: myEntry.id,
            displayName: myEntry.displayName,
            picks: myEntry.picks
              .slice()
              .sort((a, b) => a.slot - b.slot)
              .filter((pick) => pick.seasonCoachId !== null)
              .map((pick) => ({
                pokemonId: pick.pokemonId,
                seasonCoachId: pick.seasonCoachId!,
                score: scoringWeekScoreMap.get(fantasyPickKey(pick)) ?? 0,
              })),
            pokemonIds: myEntry.picks
              .slice()
              .sort((a, b) => a.slot - b.slot)
              .map((pick) => pick.pokemonId),
            seasonCoachIds: myEntry.picks
              .slice()
              .sort((a, b) => a.slot - b.slot)
              .map((pick) => pick.seasonCoachId),
            updatedAt: myEntry.updatedAt,
          }
        : null,
      usedInstances,
      lockedSeasonCoachIds,
      previousWeekSummary,
      leaderboard: searchParams.get("history") === "1"
        ? leaderboard
        : leaderboard.map((entry) => ({ ...entry, weeklyHistory: [] })),
      settings: {
        rosterSize: FANTASY_ROSTER_SIZE,
        budget: FANTASY_BUDGET,
        scoringWeek,
        leaderboardWeek,
        leaderboardWeeks,
        weekStatuses,
        myEntryWeeks: session
          ? allEntries
              .filter((entry) => entryBelongsToSession(entry, session))
              .map((entry) => entry.week)
          : [],
      },
    });
  } catch (error) {
    console.error("Fantasy entry GET error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const featureSettings = await getSiteFeatureSettings();
    if (featureSettings.fantasyUiHidden) {
      return NextResponse.json({ error: "Fantasy is currently unavailable" }, { status: 404 });
    }

    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "You must be signed in to play fantasy" }, { status: 401 });
    }

    const body = await request.json();
    const seasonId = Number(body.seasonId);
    const requestedWeek = Number(body.week);
    const picks: { pokemonId: number; seasonCoachId: number }[] = Array.isArray(body.picks)
      ? body.picks.map((pick: { pokemonId?: unknown; seasonCoachId?: unknown }) => ({
          pokemonId: Number(pick.pokemonId),
          seasonCoachId: Number(pick.seasonCoachId),
        }))
      : Array.isArray(body.pokemonIds)
        ? body.pokemonIds.map((id: unknown, index: number) => ({
            pokemonId: Number(id),
            seasonCoachId: Number(body.seasonCoachIds?.[index]),
          }))
        : [];
    const pokemonIds = picks.map((pick) => pick.pokemonId);
    const seasonCoachIds = picks.map((pick) => pick.seasonCoachId);

    if (!Number.isInteger(seasonId)) {
      return NextResponse.json({ error: "seasonId is required" }, { status: 400 });
    }

    const season = await getFantasySeason(seasonId);
    if (!season) {
      return NextResponse.json({ error: "Fantasy is only available for public seasons 10 and later" }, { status: 400 });
    }
    const entryWeek = Number.isInteger(requestedWeek) && requestedWeek > 0
      ? requestedWeek
      : season.seasonNumber === 10
        ? 8
        : 1;

    const uniquePokemonIds: number[] = [...new Set(pokemonIds)];
    const uniqueInstanceKeys = new Set(picks.map(fantasyPickKey));
    if (
      picks.length !== FANTASY_ROSTER_SIZE ||
      uniquePokemonIds.length !== FANTASY_ROSTER_SIZE ||
      uniqueInstanceKeys.size !== FANTASY_ROSTER_SIZE ||
      picks.some((pick) => !Number.isInteger(pick.pokemonId) || !Number.isInteger(pick.seasonCoachId))
    ) {
      return NextResponse.json(
        { error: `Choose exactly ${FANTASY_ROSTER_SIZE} different Pokemon from valid team instances` },
        { status: 400 }
      );
    }

    const priceMap = await getPriceMap(seasonId);
    const invalidPokemonIds = uniquePokemonIds.filter((id) => !priceMap.has(id));
    if (invalidPokemonIds.length > 0) {
      return NextResponse.json(
        { error: "One or more selected Pokemon are unavailable for this season" },
        { status: 400 }
      );
    }

    const totalCost = pokemonIds.reduce((sum, id) => sum + (priceMap.get(id) ?? 0), 0);
    if (totalCost > FANTASY_BUDGET) {
      return NextResponse.json(
        { error: `Roster is over the ${FANTASY_BUDGET}-point budget` },
        { status: 400 }
      );
    }

    const { divisionMap, seasonDivisions } = await getSeasonCoachDivisionMap(seasonId, seasonCoachIds);
    if (seasonCoachIds.some((id) => !divisionMap.has(id))) {
      return NextResponse.json(
        { error: "One or more selected Pokemon team instances are unavailable for this season" },
        { status: 400 }
      );
    }

    const invalidSlotIndex = picks.findIndex((pick, index) => {
      const requiredDivision = FANTASY_SLOT_RULES[index];
      if (!requiredDivision) return false;

      const normalizedRequiredDivision = normalizeDivisionName(requiredDivision);
      if (!seasonDivisions.has(normalizedRequiredDivision)) {
        return false;
      }

      return divisionMap.get(pick.seasonCoachId) !== normalizedRequiredDivision;
    });

    if (invalidSlotIndex !== -1) {
      return NextResponse.json(
        { error: `Slot ${invalidSlotIndex + 1} must use a Pokemon from the ${FANTASY_SLOT_RULES[invalidSlotIndex]} Division` },
        { status: 400 }
      );
    }

    const existing = await db.query.fantasyEntries.findFirst({
      where: and(
        eq(fantasyEntries.seasonId, seasonId),
        eq(fantasyEntries.week, entryWeek),
        session.type === "coach"
          ? eq(fantasyEntries.coachId, session.id)
          : eq(fantasyEntries.userId, session.id)
      ),
      with: {
        picks: true,
      },
    });
    const lockedSeasonCoachIds = await getStartedFantasyWeekSeasonCoachIds(seasonId, entryWeek);
    const existingPicksBySlot = new Map(
      (existing?.picks ?? []).map((pick) => [pick.slot, pick])
    );
    const lockedPickChanged = picks.some((pick, index) => {
      if (!lockedSeasonCoachIds.has(pick.seasonCoachId)) return false;

      const existingPick = existingPicksBySlot.get(index + 1);
      return (
        !existingPick ||
        existingPick.pokemonId !== pick.pokemonId ||
        existingPick.seasonCoachId !== pick.seasonCoachId
      );
    });
    const lockedExistingPickRemoved = (existing?.picks ?? []).some((pick) => {
      if (!pick.seasonCoachId || !lockedSeasonCoachIds.has(pick.seasonCoachId)) return false;

      const submittedPick = picks[pick.slot - 1];
      return (
        !submittedPick ||
        submittedPick.pokemonId !== pick.pokemonId ||
        submittedPick.seasonCoachId !== pick.seasonCoachId
      );
    });

    if (lockedPickChanged || lockedExistingPickRemoved) {
      return NextResponse.json(
        { error: "A selected Pokemon is locked because its weekly matchup has already started" },
        { status: 400 }
      );
    }

    const seasonEntries = await getSeasonFantasyEntries(seasonId);
    const blockedSeasonPick = seasonEntries
      .filter((entry) => entry.week !== entryWeek && entryBelongsToSession(entry, session))
      .flatMap((entry) => entry.picks)
      .find((pick) => picks.some((selectedPick) => (
        selectedPick.pokemonId === pick.pokemonId &&
        selectedPick.seasonCoachId === pick.seasonCoachId
      )));

    if (blockedSeasonPick) {
      return NextResponse.json(
        { error: "That Pokemon from that team was already used in another fantasy week this season" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    let entryId: number | undefined = existing?.id;

    if (existing) {
      await db
        .update(fantasyEntries)
        .set({
          displayName: session.name,
          week: entryWeek,
          updatedAt: now,
        })
        .where(eq(fantasyEntries.id, existing.id));

      await db
        .delete(fantasyEntryPicks)
        .where(eq(fantasyEntryPicks.entryId, existing.id));
    } else {
      const inserted = await db
        .insert(fantasyEntries)
        .values({
          seasonId,
          coachId: session.type === "coach" ? session.id : null,
          userId: session.type === "spectator" ? session.id : null,
          week: entryWeek,
          displayName: session.name,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      entryId = inserted[0].id;
    }

    if (!entryId) {
      return NextResponse.json({ error: "Failed to save fantasy roster" }, { status: 500 });
    }

    await db.insert(fantasyEntryPicks).values(
      picks.map((pick, index) => ({
        entryId,
        pokemonId: pick.pokemonId,
        seasonCoachId: pick.seasonCoachId,
        slot: index + 1,
        createdAt: now,
      }))
    );

    const savedPicks = await db.query.fantasyEntryPicks.findMany({
      where: eq(fantasyEntryPicks.entryId, entryId),
    });
    return NextResponse.json({
      success: true,
      entry: {
        id: entryId,
        displayName: session.name,
        week: entryWeek,
        pokemonIds,
        picks,
        totalCost,
        picksSaved: savedPicks.filter((pick) => pick.entryId === entryId).length,
        updatedAt: now,
      },
    });
  } catch (error) {
    console.error("Fantasy entry POST error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
