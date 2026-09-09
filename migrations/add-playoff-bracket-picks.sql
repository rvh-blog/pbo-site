CREATE TABLE IF NOT EXISTS playoff_bracket_picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL REFERENCES pick_em_participants(id),
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  division_id INTEGER NOT NULL REFERENCES divisions(id),
  picks TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_playoff_bracket_picks_participant_division
  ON playoff_bracket_picks(participant_id, division_id);

CREATE INDEX IF NOT EXISTS idx_playoff_bracket_picks_season_division
  ON playoff_bracket_picks(season_id, division_id);
