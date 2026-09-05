import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function main() {
  // All writes are confined to a fresh synthetic fixture, never a league database.
  process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "pbo-weekly-check-")), "fixture.db");
  const { rawClient, databaseReady } = await import("../src/lib/db");
  await databaseReady;
  await rawClient.executeMultiple(`
    CREATE TABLE seasons (id INTEGER PRIMARY KEY, season_number INTEGER, is_public INTEGER);
    CREATE TABLE divisions (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE season_coaches (id INTEGER PRIMARY KEY, team_name TEXT, team_logo_url TEXT);
    CREATE TABLE matches (id INTEGER PRIMARY KEY, season_id INTEGER, division_id INTEGER, week INTEGER,
      coach1_season_id INTEGER, coach2_season_id INTEGER, coach1_differential INTEGER, coach2_differential INTEGER,
      winner_id INTEGER, played_at TEXT, ended_at TEXT, scheduled_at TEXT, is_forfeit INTEGER);
    CREATE TABLE playoff_matches (id INTEGER PRIMARY KEY, match_id INTEGER, season_id INTEGER, division_id INTEGER,
      round INTEGER, higher_seed_id INTEGER, lower_seed_id INTEGER, higher_seed_wins INTEGER, lower_seed_wins INTEGER,
      winner_id INTEGER, played_at TEXT);
    CREATE TABLE pick_em_participants (id INTEGER PRIMARY KEY, season_id INTEGER, coach_id INTEGER);
    CREATE TABLE pick_em_picks (id INTEGER PRIMARY KEY, participant_id INTEGER, match_id INTEGER);
    INSERT INTO seasons VALUES (42, 11, 1), (50, 10, 1), (900, 99, 0);
    INSERT INTO divisions VALUES (90, 'Infinity');
    INSERT INTO season_coaches VALUES (701, 'One', NULL), (702, 'Two', NULL);
    INSERT INTO pick_em_participants VALUES (1, 42, 7);
  `);
  const records = Array.from({ length: 70 }, (_, i) => ({
    sql: `INSERT INTO matches (id, season_id, division_id, week, coach1_season_id, coach2_season_id,
      coach1_differential, coach2_differential, winner_id, ended_at, is_forfeit) VALUES (?,42,90,?,701,702,3,-3,701,?,0)`,
    args: [i + 1, i === 0 ? 1 : 10, i === 0 ? "2026-09-05T12:00:00Z" : "2026-08-01T12:00:00Z"],
  }));
  await rawClient.batch(records, "write");
  await rawClient.executeMultiple(`
    INSERT INTO matches (id, season_id, division_id, week, coach1_season_id, coach2_season_id, winner_id, ended_at)
      VALUES (101,42,90,101,701,702,702,'2026-09-06T12:00:00Z'),
        (850,50,90,1,701,702,701,'2028-01-01T12:00:00Z'),
        (900,900,90,1,701,702,701,'2029-01-01T12:00:00Z');
    INSERT INTO playoff_matches VALUES (1,101,42,90,1,701,702,1,2,702,NULL);
    INSERT INTO matches (id, season_id, division_id, week, coach1_season_id, coach2_season_id, is_forfeit, scheduled_at)
      VALUES (201,42,90,2,701,702,0,'2099-01-01T12:00:00Z'),
        (202,42,90,2,701,702,0,'2099-01-02T12:00:00Z'),
        (203,42,90,2,701,702,1,NULL),
        (204,42,90,2,701,702,0,'2000-01-01T12:00:00Z');
    INSERT INTO pick_em_picks VALUES (1,1,201);
  `);
  const { getRecentBattles } = await import("../src/lib/home-recent-battles");
  const start = performance.now();
  const battles = await getRecentBattles();
  assert.equal(battles.length, 8);
  assert.equal(battles[0].type, "playoff");
  assert.equal(battles[0].matchId, 101);
  assert.equal(battles[0].team2Wins, 2);
  assert.equal(battles[1].matchId, 1, "Recently recorded early-week results must survive the SQL limit.");
  assert.equal(battles.filter((battle) => battle.matchId === 101).length, 1);
  assert.ok(battles.every((battle) => battle.seasonId === 42));
  const elapsed = performance.now() - start;
  const { getHomePickEms } = await import("../src/lib/home-pick-ems");
  const summary = await getHomePickEms(42, 7);
  assert.deepEqual(summary, { week: 2, missing: 1, total: 2, nextDeadline: "2099-01-02T12:00:00Z", joined: true });
  assert.equal((await getHomePickEms(42, 999))?.missing, 2);
  console.log(`Weekly data checks passed: 8 result rows, public-season scope, playoff deduplication, early-week recency, and pick deadlines (${elapsed.toFixed(1)}ms fixture query).`);
  rawClient.close();
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
