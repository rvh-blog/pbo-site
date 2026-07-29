CREATE TABLE IF NOT EXISTS discord_user_preferences (
  discord_user_id TEXT PRIMARY KEY NOT NULL,
  timezone TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
