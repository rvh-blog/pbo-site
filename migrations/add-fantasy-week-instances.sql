ALTER TABLE fantasy_entries
  ADD COLUMN week INTEGER NOT NULL DEFAULT 1;

ALTER TABLE fantasy_entry_picks
  ADD COLUMN season_coach_id INTEGER REFERENCES season_coaches(id);

CREATE INDEX IF NOT EXISTS idx_fantasy_entries_season_week
  ON fantasy_entries(season_id, week);

CREATE INDEX IF NOT EXISTS idx_fantasy_entry_picks_season_coach_id
  ON fantasy_entry_picks(season_coach_id);

UPDATE fantasy_entries
SET week = 8
WHERE week = 1
  AND season_id IN (
    SELECT id FROM seasons WHERE season_number = 10
  );
