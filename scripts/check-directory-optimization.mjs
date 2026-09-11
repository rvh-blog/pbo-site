import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

// Read-only comparison against a supplied local database; never changes data.
const db = new Database(process.argv[2] || 'pbo.db', { readonly: true });
try {
  const teams = db.prepare('SELECT id, coach_id, division_id FROM season_coaches').all();
  const counts = new Map();
  for (const team of teams) counts.set(team.division_id, (counts.get(team.division_id) || 0) + 1);
  const grouped = db.prepare('SELECT division_id, count(*) AS total FROM season_coaches GROUP BY division_id').all();
  assert.deepEqual(grouped.map(row => [row.division_id, row.total]).sort((a, b) => a[0] - b[0]), [...counts].sort((a, b) => a[0] - b[0]));

  const matches = db.prepare('SELECT id, coach1_season_id, coach2_season_id, winner_id, coach1_differential, coach2_differential, is_forfeit, week FROM matches').all();
  const completed = matches.filter(match => match.winner_id !== null);
  const scopes = new Map();
  for (const team of teams) {
    for (const key of [`coach:${team.coach_id}`, `division:${team.division_id}:coach:${team.coach_id}`]) {
      if (!scopes.has(key)) scopes.set(key, new Set());
      scopes.get(key).add(team.id);
    }
  }
  function record(rows, ids, phase, forfeits) {
    let wins = 0, losses = 0, differential = 0;
    for (const match of rows) {
      if (!ids.has(match.coach1_season_id) && !ids.has(match.coach2_season_id)) continue;
      if (!forfeits && match.is_forfeit) continue;
      if (phase === 'regular' && match.week >= 101) continue;
      if (phase === 'playoffs' && match.week < 101) continue;
      const first = ids.has(match.coach1_season_id);
      const ownId = first ? match.coach1_season_id : match.coach2_season_id;
      if (match.winner_id === ownId) wins++;
      else if (match.winner_id) losses++;
      if (match.winner_id) differential += (first ? match.coach1_differential : match.coach2_differential) ?? 0;
    }
    return { wins, losses, differential };
  }
  let comparisons = 0;
  for (const ids of scopes.values()) {
    for (const phase of ['overall', 'regular', 'playoffs']) {
      for (const forfeits of [true, false]) {
        assert.deepEqual(record(matches, ids, phase, forfeits), record(completed, ids, phase, forfeits));
        comparisons++;
      }
    }
  }
  console.log(JSON.stringify({ teamRowsBefore: teams.length, countRowsAfter: grouped.length, matchRowsBefore: matches.length, matchRowsAfter: completed.length, recordComparisons: comparisons, result: 'All counts and records match' }, null, 2));
} finally {
  db.close();
}
