import { sql } from "drizzle-orm";
import { db } from "./db";

export type BattleLogItem = {
  id: number;
  matchId: number;
  type: "regular" | "playoff";
  week?: number;
  round?: number;
  seasonId: number;
  seasonNumber: number;
  team1Name?: string;
  team2Name?: string;
  team1Logo?: string | null;
  team2Logo?: string | null;
  team1Wins: number;
  team2Wins: number;
  winnerId: number | null;
  team1Id: number;
  team2Id: number;
  playedAt: string | null;
  endedAt: string | null;
  divisionName?: string;
};

/** Sort the complete candidate set in SQLite; hydrate only the eight displayed rows. */
export async function getRecentBattles(): Promise<BattleLogItem[]> {
  return db.all<BattleLogItem>(sql`
    WITH public_seasons AS (
      SELECT id, season_number FROM seasons WHERE is_public = 1 OR is_public IS NULL
    ), recent_seasons AS (
      SELECT * FROM public_seasons
      WHERE season_number >= (SELECT MAX(season_number) - 1 FROM public_seasons)
    ), candidates AS (
      SELECT m.id, m.id AS matchId, 'regular' AS type, m.week, NULL AS round,
        m.season_id AS seasonId, s.season_number AS seasonNumber,
        m.coach1_season_id AS team1Id, m.coach2_season_id AS team2Id,
        MAX(0, COALESCE(m.coach1_differential, 0)) AS team1Wins,
        MAX(0, COALESCE(m.coach2_differential, 0)) AS team2Wins,
        m.winner_id AS winnerId, m.played_at AS playedAt, m.ended_at AS endedAt,
        m.division_id AS divisionId, m.week AS stage
      FROM matches m JOIN recent_seasons s ON s.id = m.season_id
      WHERE m.winner_id IS NOT NULL AND m.week <= 100
      UNION ALL
      SELECT p.id + 100000, p.match_id, 'playoff', NULL, p.round,
        p.season_id, s.season_number, p.higher_seed_id, p.lower_seed_id,
        COALESCE(p.higher_seed_wins, 0), COALESCE(p.lower_seed_wins, 0),
        p.winner_id, p.played_at, m.ended_at, p.division_id, 100 + p.round
      FROM playoff_matches p JOIN recent_seasons s ON s.id = p.season_id
      JOIN matches m ON m.id = p.match_id
      WHERE p.winner_id IS NOT NULL
    ), latest AS (
      SELECT c.*, d.name AS divisionName FROM candidates c JOIN divisions d ON d.id = c.divisionId
      ORDER BY seasonNumber DESC, julianday(endedAt) DESC, stage DESC,
        CASE lower(trim(d.name)) WHEN 'infinity' THEN 0 WHEN 'stargazer' THEN 1
          WHEN 'sunset' THEN 2 WHEN 'crystal' THEN 3 WHEN 'neon' THEN 4
          WHEN 'unova' THEN 5 WHEN 'kalos' THEN 6 ELSE 7 END,
        d.name COLLATE NOCASE, c.id DESC
      LIMIT 8
    )
    SELECT latest.*, t1.team_name AS team1Name, t2.team_name AS team2Name,
      t1.team_logo_url AS team1Logo, t2.team_logo_url AS team2Logo
    FROM latest LEFT JOIN season_coaches t1 ON t1.id = latest.team1Id
      LEFT JOIN season_coaches t2 ON t2.id = latest.team2Id
    ORDER BY seasonNumber DESC, julianday(endedAt) DESC, stage DESC,
      CASE lower(trim(divisionName)) WHEN 'infinity' THEN 0 WHEN 'stargazer' THEN 1
        WHEN 'sunset' THEN 2 WHEN 'crystal' THEN 3 WHEN 'neon' THEN 4
        WHEN 'unova' THEN 5 WHEN 'kalos' THEN 6 ELSE 7 END,
      divisionName COLLATE NOCASE, latest.id DESC
  `);
}
