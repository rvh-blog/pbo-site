CREATE TABLE IF NOT EXISTS changelog_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  summary TEXT,
  published_at TEXT NOT NULL,
  changes TEXT NOT NULL,
  is_published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_changelog_entries_published
  ON changelog_entries(is_published, published_at);

INSERT INTO changelog_entries (title, summary, published_at, changes, is_published, created_at, updated_at)
SELECT
  'Stats & Sharing Updates',
  'Expanded career records, clearer coach profiles, and richer Pokemon battle statistics.',
  '2026-08-10',
  '[{"type":"added","text":"PBO Records now includes Overall, Regular Season, and Playoffs career records for wins, losses, and matches played."},{"type":"added","text":"Pokemon Battle Stats now includes Kills and Deaths leaderboards with Total and Per Game views."},{"type":"improved","text":"Coach profiles keep overall records visible while Regular Season, Playoffs, and Revealed Item Tendencies can be expanded when needed."},{"type":"improved","text":"Game Prep and PBO Stats navigation groups now organize their related tools in focused dropdown menus."},{"type":"removed","text":"The retired 5-Match Survival Streak milestone is no longer generated or delivered."}]',
  1,
  '2026-08-10T12:00:00.000Z',
  '2026-08-10T12:00:00.000Z'
WHERE NOT EXISTS (
  SELECT 1 FROM changelog_entries WHERE title = 'Stats & Sharing Updates' AND published_at = '2026-08-10'
);

INSERT INTO changelog_entries (title, summary, published_at, changes, is_published, created_at, updated_at)
SELECT
  'Season 11 Fun Facts',
  'Public fun-fact records and the playoff projection tool now reflect the current league format.',
  '2026-08-08',
  '[{"type":"improved","text":"Pokemon and coach fun-fact pages now calculate and label their records from Season 11."},{"type":"improved","text":"The playoff calculator uses the shared PBO ELO expected-score formula for matchup probabilities."},{"type":"fixed","text":"The Pokemon fun-facts cache was versioned so deployments cannot briefly reuse Season 10 results."}]',
  1,
  '2026-08-08T12:00:00.000Z',
  '2026-08-08T12:00:00.000Z'
WHERE NOT EXISTS (
  SELECT 1 FROM changelog_entries WHERE title = 'Season 11 Fun Facts' AND published_at = '2026-08-08'
);

INSERT INTO changelog_entries (title, summary, published_at, changes, is_published, created_at, updated_at)
SELECT
  'Readability & Match Prep',
  'A round of usability improvements for public pages on desktop and mobile.',
  '2026-08-04',
  '[{"type":"added","text":"Selected Match Prep teams now show their completed division record beside the coach name."},{"type":"improved","text":"Dense public-page metadata is larger and shared retro buttons provide a 44px minimum touch target."},{"type":"fixed","text":"Infinity standings and Fantasy leaderboard colors now handle saved division names consistently."}]',
  1,
  '2026-08-04T12:00:00.000Z',
  '2026-08-04T12:00:00.000Z'
WHERE NOT EXISTS (
  SELECT 1 FROM changelog_entries WHERE title = 'Readability & Match Prep' AND published_at = '2026-08-04'
);
