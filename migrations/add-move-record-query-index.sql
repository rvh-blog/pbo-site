CREATE INDEX IF NOT EXISTS idx_matches_move_records_filter
  ON matches(is_forfeit, winner_id, played_at);
