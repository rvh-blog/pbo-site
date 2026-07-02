CREATE INDEX IF NOT EXISTS idx_matches_is_forfeit_winner_id
ON matches(is_forfeit, winner_id);

CREATE INDEX IF NOT EXISTS idx_matches_season_winner_id
ON matches(season_id, winner_id);

CREATE INDEX IF NOT EXISTS idx_playoff_matches_season_winner_id
ON playoff_matches(season_id, winner_id);

CREATE INDEX IF NOT EXISTS idx_playoff_matches_season_round_winner_id
ON playoff_matches(season_id, round, winner_id);
