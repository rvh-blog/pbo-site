CREATE TABLE IF NOT EXISTS fantasy_rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES fantasy_entries(id),
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  week INTEGER NOT NULL,
  coach_id INTEGER REFERENCES coaches(id),
  user_id INTEGER REFERENCES users(id),
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fantasy_rewards_entry_id
  ON fantasy_rewards(entry_id);

CREATE INDEX IF NOT EXISTS idx_fantasy_rewards_season_week
  ON fantasy_rewards(season_id, week);

CREATE INDEX IF NOT EXISTS idx_fantasy_rewards_coach_id
  ON fantasy_rewards(coach_id);

CREATE INDEX IF NOT EXISTS idx_fantasy_rewards_user_id
  ON fantasy_rewards(user_id);
