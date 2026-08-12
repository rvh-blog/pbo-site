import { and, eq, inArray } from "drizzle-orm";
import { db, rawClient } from "@/lib/db";
import { fantasyWeeklyStats, matchPokemon, matches } from "@/lib/schema";
import { scoreFantasyPokemonGame } from "@/lib/fantasy-scoring";

export type FantasyWeeklyStat = typeof fantasyWeeklyStats.$inferSelect;

const statsCacheTtlMs = 60_000;
const statsCache = new Map<string, { expiresAt: number; rows: FantasyWeeklyStat[] }>();
let tableReady: Promise<void> | null = null;

async function ensureFantasyWeeklyStatsTable() {
  if (!tableReady) {
    tableReady = (async () => {
      await rawClient.execute(`
        CREATE TABLE IF NOT EXISTS fantasy_weekly_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          season_id INTEGER NOT NULL REFERENCES seasons(id),
          week INTEGER NOT NULL,
          pokemon_id INTEGER NOT NULL REFERENCES pokemon(id),
          season_coach_id INTEGER NOT NULL REFERENCES season_coaches(id),
          score INTEGER NOT NULL DEFAULT 0,
          games INTEGER NOT NULL DEFAULT 0,
          kills INTEGER NOT NULL DEFAULT 0,
          deaths INTEGER NOT NULL DEFAULT 0,
          wins INTEGER NOT NULL DEFAULT 0,
          losses INTEGER NOT NULL DEFAULT 0,
          damage INTEGER NOT NULL DEFAULT 0,
          indirect_damage INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
        )
      `);
      await rawClient.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_fantasy_weekly_stats_instance ON fantasy_weekly_stats(season_id, week, pokemon_id, season_coach_id)"
      );
      await rawClient.execute(
        "CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_stats_season_week ON fantasy_weekly_stats(season_id, week)"
      );
      await rawClient.execute(
        "CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_stats_season_coach ON fantasy_weekly_stats(season_id, season_coach_id)"
      );
    })().catch((error) => {
      tableReady = null;
      throw error;
    });
  }

  await tableReady;
}

function statsCacheKey(seasonId: number, week: number) {
  return `${seasonId}:${week}`;
}

export async function refreshFantasyWeeklyStatsForWeek(seasonId: number, week: number) {
  await ensureFantasyWeeklyStatsTable();

  const weekMatches = await db.query.matches.findMany({
    where: and(eq(matches.seasonId, seasonId), eq(matches.week, week)),
    columns: { id: true, winnerId: true },
  });
  const scoredMatches = weekMatches.filter((match) => match.winnerId !== null);
  const matchIds = scoredMatches.map((match) => match.id);
  const matchesById = new Map(scoredMatches.map((match) => [match.id, match]));
  const aggregate = new Map<string, {
    seasonId: number;
    week: number;
    pokemonId: number;
    seasonCoachId: number;
    score: number;
    games: number;
    kills: number;
    deaths: number;
    wins: number;
    losses: number;
    damage: number;
    indirectDamage: number;
  }>();

  if (matchIds.length > 0) {
    const rows = await db.query.matchPokemon.findMany({
      where: inArray(matchPokemon.matchId, matchIds),
    });

    for (const row of rows) {
      const match = matchesById.get(row.matchId);
      if (!match) continue;

      const key = `${row.pokemonId}:${row.seasonCoachId}`;
      const current = aggregate.get(key) ?? {
        seasonId,
        week,
        pokemonId: row.pokemonId,
        seasonCoachId: row.seasonCoachId,
        score: 0,
        games: 0,
        kills: 0,
        deaths: 0,
        wins: 0,
        losses: 0,
        damage: 0,
        indirectDamage: 0,
      };

      current.score += scoreFantasyPokemonGame({
        kills: row.kills,
        deaths: row.deaths,
        seasonCoachId: row.seasonCoachId,
        winnerId: match.winnerId,
      });
      current.games += 1;
      current.kills += row.kills ?? 0;
      current.deaths += row.deaths ?? 0;
      current.damage += row.damageDealt ?? 0;
      current.indirectDamage += row.damageDealtIndirect ?? 0;
      if (match.winnerId === row.seasonCoachId) current.wins += 1;
      else current.losses += 1;
      aggregate.set(key, current);
    }
  }

  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx.delete(fantasyWeeklyStats).where(
      and(eq(fantasyWeeklyStats.seasonId, seasonId), eq(fantasyWeeklyStats.week, week))
    );
    if (aggregate.size > 0) {
      await tx.insert(fantasyWeeklyStats).values(
        [...aggregate.values()].map((row) => ({ ...row, updatedAt: now }))
      );
    }
  });

  const rows = await db.query.fantasyWeeklyStats.findMany({
    where: and(eq(fantasyWeeklyStats.seasonId, seasonId), eq(fantasyWeeklyStats.week, week)),
  });
  statsCache.set(statsCacheKey(seasonId, week), { expiresAt: Date.now() + statsCacheTtlMs, rows });
  return rows;
}

export async function getFantasyWeeklyStatsForWeek(seasonId: number, week: number) {
  await ensureFantasyWeeklyStatsTable();
  const key = statsCacheKey(seasonId, week);
  const cached = statsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;

  const existing = await db.query.fantasyWeeklyStats.findMany({
    where: and(eq(fantasyWeeklyStats.seasonId, seasonId), eq(fantasyWeeklyStats.week, week)),
  });
  if (existing.length > 0) {
    const weekMatches = await db.query.matches.findMany({
      where: and(eq(matches.seasonId, seasonId), eq(matches.week, week)),
      columns: { id: true, winnerId: true },
    });
    const completedMatchIds = weekMatches
      .filter((match) => match.winnerId !== null)
      .map((match) => match.id);
    const expectedGames = completedMatchIds.length > 0
      ? (await db.query.matchPokemon.findMany({
          where: inArray(matchPokemon.matchId, completedMatchIds),
          columns: { id: true },
        })).length
      : 0;
    const persistedGames = existing.reduce((sum, row) => sum + row.games, 0);

    if (persistedGames === expectedGames) {
      statsCache.set(key, { expiresAt: Date.now() + statsCacheTtlMs, rows: existing });
      return existing;
    }
  }

  return refreshFantasyWeeklyStatsForWeek(seasonId, week);
}

export async function getFantasyWeeklyStatsForWeeks(seasonId: number, weeks: number[]) {
  const uniqueWeeks = [...new Set(weeks)];
  const groups: [number, FantasyWeeklyStat[]][] = [];
  // A cold cache can require a persisted refresh for more than one week.
  // Keep those refresh transactions sequential because SQLite only permits one
  // writer at a time; normal reads still return immediately from the short
  // in-process cache.
  for (const week of uniqueWeeks) {
    groups.push([week, await getFantasyWeeklyStatsForWeek(seasonId, week)]);
  }
  return new Map(groups);
}

export function invalidateFantasyWeeklyStats(seasonId: number, week: number) {
  statsCache.delete(statsCacheKey(seasonId, week));
}
