import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  coaches,
  fantasyEntries,
  fantasyRewards,
  matchPokemon,
  matches,
  seasons,
  users,
} from "@/lib/schema";
import {
  buildTiedFantasyAwards,
  fantasyPickKey,
  FANTASY_WEEKLY_REWARD_TIERS,
  scoreFantasyPokemonGame,
} from "@/lib/fantasy-scoring";

const FANTASY_MIN_SEASON = 10;
const FANTASY_REWARD_REASON = "Weekly fantasy placement";

type RewardDb = Pick<typeof db, "query" | "update" | "delete" | "insert">;

async function addCoins(
  database: RewardDb,
  target: { coachId: number | null; userId: number | null },
  amount: number
) {
  if (target.coachId !== null) {
    const coach = await database.query.coaches.findFirst({
      where: eq(coaches.id, target.coachId),
      columns: { pboCoin: true },
    });

    if (coach) {
      await database
        .update(coaches)
        .set({ pboCoin: Math.max(0, coach.pboCoin + amount) })
        .where(eq(coaches.id, target.coachId));
    }
  }

  if (target.userId !== null) {
    const user = await database.query.users.findFirst({
      where: eq(users.id, target.userId),
      columns: { pboCoin: true },
    });

    if (user) {
      await database
        .update(users)
        .set({ pboCoin: Math.max(0, user.pboCoin + amount) })
        .where(eq(users.id, target.userId));
    }
  }
}

async function getWeekScores(seasonId: number, week: number) {
  const weekMatches = await db.query.matches.findMany({
    where: and(eq(matches.seasonId, seasonId), eq(matches.week, week)),
  });
  const scoredMatches = weekMatches.filter((match) => match.winnerId !== null);
  const matchIds = scoredMatches.map((match) => match.id);

  if (matchIds.length === 0) {
    return new Map<string, number>();
  }

  const matchesById = new Map(scoredMatches.map((match) => [match.id, match]));
  const matchPokemonRows = await db.query.matchPokemon.findMany({
    where: inArray(matchPokemon.matchId, matchIds),
  });

  return matchPokemonRows.reduce((scoreMap, mp) => {
    const match = matchesById.get(mp.matchId);
    if (!match) return scoreMap;

    const key = fantasyPickKey(mp);
    scoreMap.set(key, (scoreMap.get(key) ?? 0) + scoreFantasyPokemonGame({
      kills: mp.kills,
      deaths: mp.deaths,
      seasonCoachId: mp.seasonCoachId,
      winnerId: match.winnerId,
    }));
    return scoreMap;
  }, new Map<string, number>());
}

async function isFantasyWeekComplete(seasonId: number, week: number) {
  const weekMatches = await db.query.matches.findMany({
    where: and(eq(matches.seasonId, seasonId), eq(matches.week, week)),
    columns: { id: true, winnerId: true, isForfeit: true },
  });

  return weekMatches.length > 0 && weekMatches.every((match) => match.winnerId !== null || match.isForfeit);
}

async function reverseExistingRewards(
  database: RewardDb,
  existingRewards: Awaited<ReturnType<typeof getExistingRewards>>
) {
  for (const reward of existingRewards) {
    await addCoins(database, { coachId: reward.coachId, userId: reward.userId }, -reward.amount);
    await database.delete(fantasyRewards).where(eq(fantasyRewards.id, reward.id));
  }
}

async function getExistingRewards(seasonId: number, week: number) {
  return db.query.fantasyRewards.findMany({
    where: and(eq(fantasyRewards.seasonId, seasonId), eq(fantasyRewards.week, week)),
  });
}

export async function reResolveFantasyWeeklyRewardsForWeek(seasonId: number, week: number) {
  const season = await db.query.seasons.findFirst({
    where: eq(seasons.id, seasonId),
  });
  if (!season || season.seasonNumber < FANTASY_MIN_SEASON) {
    return { awarded: [], reversed: [], skipped: "not-eligible" as const };
  }

  const existingRewards = await getExistingRewards(seasonId, week);
  if (!(await isFantasyWeekComplete(seasonId, week))) {
    if (existingRewards.length === 0) {
      return { awarded: [], reversed: [], skipped: "week-incomplete" as const };
    }
    await db.transaction(async (tx) => {
      await reverseExistingRewards(tx, existingRewards);
    });
    return {
      awarded: [],
      reversed: existingRewards.map((reward) => ({
        entryId: reward.entryId,
        amount: -reward.amount,
      })),
      skipped: "week-incomplete" as const,
    };
  }

  const entries = await db.query.fantasyEntries.findMany({
    where: and(eq(fantasyEntries.seasonId, seasonId), eq(fantasyEntries.week, week)),
    with: { picks: true },
  });

  if (entries.length === 0) {
    return { awarded: [], reversed: [], skipped: "no-entries" as const };
  }

  const scoreMap = await getWeekScores(seasonId, week);
  const leaderboard = entries
    .map((entry) => ({
      entry,
      totalScore: entry.picks.reduce(
        (sum, pick) => sum + (scoreMap.get(fantasyPickKey(pick)) ?? 0),
        0
      ),
    }))
    .sort((a, b) => b.totalScore - a.totalScore);

  if (leaderboard.length === 0) {
    return { awarded: [], reversed: [], skipped: "no-scores" as const };
  }

  const placementRows = buildTiedFantasyAwards(leaderboard, FANTASY_WEEKLY_REWARD_TIERS);
  const existingRewardMap = new Map(existingRewards.map((reward) => [reward.entryId, reward.amount]));
  const unchanged =
    existingRewards.length === placementRows.length &&
    placementRows.every(({ row, amount }) => (
      existingRewardMap.get(row.entry.id) === amount
    ));

  if (unchanged) {
    return { awarded: [], reversed: [], skipped: "already-awarded" as const };
  }

  const awarded = await db.transaction(async (tx) => {
    await reverseExistingRewards(tx, existingRewards);

    const rows = [];
    for (const placement of placementRows) {
      const { row, amount, rank, tied } = placement;
      const entry = row.entry;
      await addCoins(tx, { coachId: entry.coachId, userId: entry.userId }, amount);
      const [reward] = await tx
        .insert(fantasyRewards)
        .values({
          entryId: entry.id,
          seasonId,
          week,
          coachId: entry.coachId,
          userId: entry.userId,
          amount,
          reason: `${FANTASY_REWARD_REASON} ${tied ? "tied " : ""}#${rank} - Week ${week}`,
          createdAt: new Date().toISOString(),
        })
        .returning();

      rows.push({
        entryId: entry.id,
        displayName: entry.displayName,
        amount,
        rank,
        totalScore: row.totalScore,
        rewardId: reward.id,
      });
    }
    return rows;
  });

  return {
    awarded,
    reversed: existingRewards.map((reward) => ({
      entryId: reward.entryId,
      amount: -reward.amount,
    })),
    skipped: null,
  };
}

export async function resolveFantasyWeeklyRewardForMatch(matchId: number) {
  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
    with: { season: true },
  });

  if (!match?.season) {
    return { awarded: [], reversed: [], skipped: "not-eligible" as const };
  }

  return reResolveFantasyWeeklyRewardsForWeek(match.seasonId, match.week);
}
