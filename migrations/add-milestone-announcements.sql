CREATE TABLE IF NOT EXISTS milestone_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  milestone_type TEXT NOT NULL,
  season_id INTEGER NOT NULL,
  division_id INTEGER NOT NULL,
  match_id INTEGER NOT NULL,
  coach_id INTEGER,
  season_coach_id INTEGER,
  pokemon_id INTEGER,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS milestone_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TEXT,
  UNIQUE(event_id, guild_id),
  FOREIGN KEY(event_id) REFERENCES milestone_events(id)
);

CREATE TABLE IF NOT EXISTS milestone_evaluation_queue (
  match_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  queued_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_milestone_events_match ON milestone_events(match_id);
CREATE INDEX IF NOT EXISTS idx_milestone_queue_status ON milestone_evaluation_queue(status, attempts);
CREATE INDEX IF NOT EXISTS idx_milestone_deliveries_status ON milestone_deliveries(status, attempts);

ALTER TABLE discord_channels
  ADD COLUMN is_milestone_enabled INTEGER NOT NULL DEFAULT 0;
