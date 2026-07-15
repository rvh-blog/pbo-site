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
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fantasy_weekly_stats_instance
  ON fantasy_weekly_stats(season_id, week, pokemon_id, season_coach_id);

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_stats_season_week
  ON fantasy_weekly_stats(season_id, week);

CREATE INDEX IF NOT EXISTS idx_fantasy_weekly_stats_season_coach
  ON fantasy_weekly_stats(season_id, season_coach_id);
