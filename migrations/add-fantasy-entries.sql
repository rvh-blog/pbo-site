CREATE TABLE IF NOT EXISTS fantasy_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  coach_id INTEGER REFERENCES coaches(id),
  user_id INTEGER REFERENCES users(id),
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fantasy_entries_season_id
  ON fantasy_entries(season_id);

CREATE INDEX IF NOT EXISTS idx_fantasy_entries_coach_id
  ON fantasy_entries(coach_id);

CREATE INDEX IF NOT EXISTS idx_fantasy_entries_user_id
  ON fantasy_entries(user_id);

CREATE TABLE IF NOT EXISTS fantasy_entry_picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES fantasy_entries(id),
  pokemon_id INTEGER NOT NULL REFERENCES pokemon(id),
  slot INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fantasy_entry_picks_entry_id
  ON fantasy_entry_picks(entry_id);

CREATE INDEX IF NOT EXISTS idx_fantasy_entry_picks_pokemon_id
  ON fantasy_entry_picks(pokemon_id);
