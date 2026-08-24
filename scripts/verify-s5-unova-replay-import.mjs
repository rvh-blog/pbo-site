import Database from "better-sqlite3";

const targetPath = process.env.DATABASE_PATH || ".tmp/s5-unova-import-test/pbo.db";
const sourcePath = process.env.SOURCE_DATABASE_PATH || "pbo.db";
const db = new Database(targetPath, { readonly: true });
db.exec(`ATTACH DATABASE '${sourcePath.replaceAll("'", "''")}' AS source_db`);

function scalar(sql, ...args) {
  return db.prepare(sql).get(...args).value;
}

const checks = [
  ["Season 5 Unova match count", 63, scalar(`
    SELECT COUNT(*) AS value FROM matches m
    JOIN divisions d ON d.id = m.division_id
    JOIN seasons s ON s.id = m.season_id
    WHERE s.season_number = 5 AND d.name = 'Unova'
  `)],
  ["Attached replay count", 60, scalar(`
    SELECT COUNT(*) AS value FROM matches m
    JOIN divisions d ON d.id = m.division_id
    JOIN seasons s ON s.id = m.season_id
    WHERE s.season_number = 5 AND d.name = 'Unova'
      AND TRIM(COALESCE(m.replay_url, '')) != ''
  `)],
  ["Yellow review count", 19, scalar(`
    SELECT COUNT(*) AS value FROM matches m
    JOIN divisions d ON d.id = m.division_id
    JOIN seasons s ON s.id = m.season_id
    WHERE s.season_number = 5 AND d.name = 'Unova' AND m.needs_review = 1
  `)],
  ["Clean imported count", 41, scalar(`
    SELECT COUNT(*) AS value FROM matches m
    JOIN divisions d ON d.id = m.division_id
    JOIN seasons s ON s.id = m.season_id
    WHERE s.season_number = 5 AND d.name = 'Unova' AND m.needs_review = 0
      AND TRIM(COALESCE(m.replay_url, '')) != ''
  `)],
  ["Official forfeits incorrectly held for missing replay", 0, scalar(`
    SELECT COUNT(*) AS value FROM matches m
    JOIN divisions d ON d.id = m.division_id
    JOIN seasons s ON s.id = m.season_id
    WHERE s.season_number = 5 AND d.name = 'Unova' AND m.is_forfeit = 1
      AND (m.needs_review = 1 OR TRIM(COALESCE(m.review_notes, '')) != '')
  `)],
  ["Non-forfeit games without replay links", 0, scalar(`
    SELECT COUNT(*) AS value FROM matches m
    JOIN divisions d ON d.id = m.division_id
    JOIN seasons s ON s.id = m.season_id
    WHERE s.season_number = 5 AND d.name = 'Unova' AND m.is_forfeit = 0
      AND TRIM(COALESCE(m.replay_url, '')) = ''
  `)],
  ["Review rows without reasons", 0, scalar(`
    SELECT COUNT(*) AS value FROM matches m
    JOIN divisions d ON d.id = m.division_id
    JOIN seasons s ON s.id = m.season_id
    WHERE s.season_number = 5 AND d.name = 'Unova' AND m.needs_review = 1
      AND TRIM(COALESCE(m.review_notes, '')) = ''
  `)],
  ["Official match result changes", 0, scalar(`
    SELECT COUNT(*) AS value FROM matches target
    JOIN source_db.matches original ON original.id = target.id
    JOIN divisions d ON d.id = target.division_id
    JOIN seasons s ON s.id = target.season_id
    WHERE s.season_number = 5 AND d.name = 'Unova'
      AND (target.winner_id IS NOT original.winner_id
        OR target.coach1_differential IS NOT original.coach1_differential
        OR target.coach2_differential IS NOT original.coach2_differential
        OR target.is_forfeit IS NOT original.is_forfeit)
  `)],
  ["Official Pokemon K/D changes", 0, scalar(`
    SELECT COUNT(*) AS value FROM match_pokemon target
    JOIN source_db.match_pokemon original ON original.id = target.id
    JOIN matches m ON m.id = target.match_id
    JOIN divisions d ON d.id = m.division_id
    JOIN seasons s ON s.id = m.season_id
    WHERE s.season_number = 5 AND d.name = 'Unova'
      AND (target.kills IS NOT original.kills OR target.deaths IS NOT original.deaths)
  `)],
  ["Changes outside Season 5 Unova", 0, scalar(`
    SELECT COUNT(*) AS value FROM matches target
    JOIN source_db.matches original ON original.id = target.id
    WHERE NOT (target.season_id = 9 AND target.division_id = 27)
      AND (target.replay_url IS NOT original.replay_url
        OR target.played_at IS NOT original.played_at
        OR target.started_at IS NOT original.started_at
        OR target.ended_at IS NOT original.ended_at
        OR target.turn_snapshots IS NOT original.turn_snapshots
        OR target.key_events IS NOT original.key_events
        OR target.needs_review != 0
        OR target.review_notes IS NOT NULL)
  `)],
];

let failures = 0;
for (const [label, expected, actual] of checks) {
  const ok = expected === actual;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual} (expected ${expected})`);
}

db.close();
if (failures) process.exitCode = 1;
