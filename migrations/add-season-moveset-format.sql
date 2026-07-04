ALTER TABLE seasons ADD COLUMN moveset_format TEXT NOT NULL DEFAULT 'scarlet-violet';

UPDATE seasons
SET moveset_format = 'national-dex'
WHERE season_number = 11;

CREATE TABLE IF NOT EXISTS season_pokemon_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  pokemon_id INTEGER NOT NULL REFERENCES pokemon(id),
  moves TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_season_pokemon_moves_unique
  ON season_pokemon_moves(season_id, pokemon_id);

CREATE INDEX IF NOT EXISTS idx_season_pokemon_moves_season_id
  ON season_pokemon_moves(season_id);
