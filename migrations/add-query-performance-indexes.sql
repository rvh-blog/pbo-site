-- Compound indexes for the season/week and team-scoped read paths used by
-- fantasy scoring, match preparation, roster history, and match statistics.
CREATE INDEX IF NOT EXISTS idx_matches_season_week
ON matches(season_id, week);

CREATE INDEX IF NOT EXISTS idx_match_pokemon_season_coach_pokemon
ON match_pokemon(season_coach_id, pokemon_id);

CREATE INDEX IF NOT EXISTS idx_transactions_season_coach
ON transactions(season_id, season_coach_id);
