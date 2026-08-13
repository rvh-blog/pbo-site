-- Public homepage and leaderboard read-path indexes.
CREATE INDEX IF NOT EXISTS idx_matches_season_gotw_week
ON matches(season_id, is_game_of_the_week, week);

CREATE INDEX IF NOT EXISTS idx_matches_season_winner_scheduled
ON matches(season_id, winner_id, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_playoff_matches_round_winner_id
ON playoff_matches(round, winner_id);

CREATE INDEX IF NOT EXISTS idx_match_pokemon_pokemon_id
ON match_pokemon(pokemon_id);
