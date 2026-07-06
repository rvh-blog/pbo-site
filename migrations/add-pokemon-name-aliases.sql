CREATE TABLE IF NOT EXISTS pokemon_name_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pokemon_id INTEGER NOT NULL REFERENCES pokemon(id),
  alias TEXT NOT NULL,
  alias_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pokemon_name_aliases_pokemon_id
  ON pokemon_name_aliases(pokemon_id);

CREATE INDEX IF NOT EXISTS idx_pokemon_name_aliases_alias_key
  ON pokemon_name_aliases(alias_key);
