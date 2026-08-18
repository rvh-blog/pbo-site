-- Read-path indexes for Battle Records, coach record milestones, and lazy move sources.
CREATE INDEX IF NOT EXISTS idx_matches_completed_records
  ON matches(is_forfeit, winner_id, division_id, week);

CREATE INDEX IF NOT EXISTS idx_match_pokemon_pokemon_match
  ON match_pokemon(pokemon_id, match_id);

CREATE INDEX IF NOT EXISTS idx_playoff_matches_round_division_winner
  ON playoff_matches(round, division_id, winner_id);
