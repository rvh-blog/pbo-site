import Database from "better-sqlite3";

const targetPath = process.env.DATABASE_PATH || ".tmp/s5-kalos-import-test/pbo.db";
const sourcePath = process.env.SOURCE_DATABASE_PATH || "pbo.db";
const db = new Database(targetPath, { readonly: true });
db.exec(`ATTACH DATABASE '${sourcePath.replaceAll("'", "''")}' AS source_db`);

function scalar(sql, ...args) {
  return db.prepare(sql).get(...args).value;
}

const checks = [
  ["Season 5 Kalos match count", 63, scalar(`
    SELECT COUNT(*) AS value FROM matches m
    JOIN divisions d ON d.id = m.division_id
    JOIN seasons s ON s.id = m.season_id
    WHERE s.season_number = 5 AND d.name = 'Kalos'
  `)],
  ["Attached replay count", 57, scalar(`
    SELECT COUNT(*) AS value FROM matches m
    JOIN divisions d ON d.id = m.division_id
    JOIN seasons s ON s.id = m.season_id
    WHERE s.season_number = 5 AND d.name = 'Kalos'
      AND TRIM(COALESCE(m.replay_url, '')) != ''
  `)],
  ["Yellow review count", 29, scalar(`
    SELECT COUNT(*) AS value FROM matches m
    JOIN divisions d ON d.id = m.division_id
    JOIN seasons s ON s.id = m.season_id
    WHERE s.season_number = 5 AND d.name = 'Kalos' AND m.needs_review = 1
  `)],
  ["Clean imported count", 34, scalar(`
    SELECT COUNT(*) AS value FROM matches m
    JOIN divisions d ON d.id = m.division_id
    JOIN seasons s ON s.id = m.season_id
    WHERE s.season_number = 5 AND d.name = 'Kalos' AND m.needs_review = 0
      AND TRIM(COALESCE(m.replay_url, '')) != ''
  `)],
  ["Review rows without reasons", 0, scalar(`
    SELECT COUNT(*) AS value FROM matches m
    JOIN divisions d ON d.id = m.division_id
    JOIN seasons s ON s.id = m.season_id
    WHERE s.season_number = 5 AND d.name = 'Kalos' AND m.needs_review = 1
      AND TRIM(COALESCE(m.review_notes, '')) = ''
  `)],
  ["Official match result changes", 0, scalar(`
    SELECT COUNT(*) AS value FROM matches target
    JOIN source_db.matches original ON original.id = target.id
    JOIN divisions d ON d.id = target.division_id
    JOIN seasons s ON s.id = target.season_id
    WHERE s.season_number = 5 AND d.name = 'Kalos'
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
    WHERE s.season_number = 5 AND d.name = 'Kalos'
      AND (target.kills IS NOT original.kills OR target.deaths IS NOT original.deaths)
  `)],
  ["Changes outside Season 5 Kalos", 0, scalar(`
    SELECT COUNT(*) AS value FROM matches target
    JOIN source_db.matches original ON original.id = target.id
    WHERE NOT (target.season_id = 9 AND target.division_id = 28)
      AND (target.replay_url IS NOT original.replay_url
        OR target.played_at IS NOT original.played_at
        OR target.started_at IS NOT original.started_at
        OR target.ended_at IS NOT original.ended_at
        OR target.turn_snapshots IS NOT original.turn_snapshots
        OR target.key_events IS NOT original.key_events)
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
