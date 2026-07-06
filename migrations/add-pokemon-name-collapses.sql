CREATE TABLE IF NOT EXISTS pokemon_name_collapses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_pokemon_id INTEGER NOT NULL REFERENCES pokemon(id),
  source_name TEXT NOT NULL,
  source_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pokemon_name_collapses_target_pokemon_id
  ON pokemon_name_collapses(target_pokemon_id);

CREATE INDEX IF NOT EXISTS idx_pokemon_name_collapses_source_key
  ON pokemon_name_collapses(source_key);
