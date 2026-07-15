import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  coaches,
  fantasyEntries,
  fantasyRewards,
  matchPokemon,
  matches,
  users,
} from "@/lib/schema";

const FANTASY_MIN_SEASON = 10;
const FANTASY_WEEKLY_REWARD_TIERS = [250, 125, 75] as const;
const FANTASY_REWARD_REASON = "Weekly fantasy placement";

function fantasyPickKey(pick: { pokemonId: number; seasonCoachId: number | null }) {
  return `${pick.pokemonId}:${pick.seasonCoachId ?? 0}`;
}

function scorePokemonGame(mp: {
  kills: number | null;
  deaths: number | null;
  seasonCoachId: number;
  match: {
    winnerId: number | null;
  };
}) {
  const kills = mp.kills ?? 0;
  const deaths = mp.deaths ?? 0;
  const teamResult = mp.match.winnerId === mp.seasonCoachId ? 2 : -2;

  return kills * 5 - deaths + teamResult;
}

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
    scoreMap.set(key, (scoreMap.get(key) ?? 0) + scorePokemonGame({ ...mp, match }));
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

export async function resolveFantasyWeeklyRewardForMatch(matchId: number) {
  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
    with: { season: true },
  });

  if (!match?.season || match.season.seasonNumber < FANTASY_MIN_SEASON || !match.winnerId) {
    return { awarded: [], reversed: [], skipped: "not-eligible" as const };
  }

  if (!(await isFantasyWeekComplete(match.seasonId, match.week))) {
    return { awarded: [], reversed: [], skipped: "week-incomplete" as const };
  }

  const entries = await db.query.fantasyEntries.findMany({
    where: and(eq(fantasyEntries.seasonId, match.seasonId), eq(fantasyEntries.week, match.week)),
    with: { picks: true },
  });

  if (entries.length === 0) {
    return { awarded: [], reversed: [], skipped: "no-entries" as const };
  }

  const scoreMap = await getWeekScores(match.seasonId, match.week);
  const leaderboard = entries
    .map((entry) => ({
      entry,
      totalScore: entry.picks.reduce(
        (sum, pick) => sum + (scoreMap.get(fantasyPickKey(pick)) ?? 0),
        0
      ),
    }))
    .sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return a.entry.updatedAt.localeCompare(b.entry.updatedAt);
    });

  if (leaderboard.length === 0) {
    return { awarded: [], reversed: [], skipped: "no-scores" as const };
  }

  const placementRows = leaderboard.slice(0, FANTASY_WEEKLY_REWARD_TIERS.length);
  const existingRewards = await getExistingRewards(match.seasonId, match.week);
  const existingRewardMap = new Map(existingRewards.map((reward) => [reward.entryId, reward.amount]));
  const unchanged =
    existingRewards.length === placementRows.length &&
    placementRows.every((row, index) => (
      existingRewardMap.get(row.entry.id) === FANTASY_WEEKLY_REWARD_TIERS[index]
    ));

  if (unchanged) {
    return { awarded: [], reversed: [], skipped: "already-awarded" as const };
  }

  const awarded = await db.transaction(async (tx) => {
    await reverseExistingRewards(tx, existingRewards);

    const rows = [];
    for (const [index, row] of placementRows.entries()) {
      const entry = row.entry;
      const amount = FANTASY_WEEKLY_REWARD_TIERS[index];
      await addCoins(tx, { coachId: entry.coachId, userId: entry.userId }, amount);
      const [reward] = await tx
        .insert(fantasyRewards)
        .values({
          entryId: entry.id,
          seasonId: match.seasonId,
          week: match.week,
          coachId: entry.coachId,
          userId: entry.userId,
          amount,
          reason: `${FANTASY_REWARD_REASON} #${index + 1} - Week ${match.week}`,
          createdAt: new Date().toISOString(),
        })
        .returning();

      rows.push({
        entryId: entry.id,
        displayName: entry.displayName,
        amount,
        rank: index + 1,
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
