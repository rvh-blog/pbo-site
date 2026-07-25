-- Read-path indexes for Fantasy entry lookup, ordered lineup hydration,
-- and weekly reward recap queries.
CREATE INDEX IF NOT EXISTS idx_fantasy_entries_season_coach_week
ON fantasy_entries(season_id, coach_id, week);

CREATE INDEX IF NOT EXISTS idx_fantasy_entries_season_user_week
ON fantasy_entries(season_id, user_id, week);

CREATE INDEX IF NOT EXISTS idx_fantasy_entry_picks_entry_slot
ON fantasy_entry_picks(entry_id, slot);

CREATE INDEX IF NOT EXISTS idx_fantasy_rewards_season_week_entry
ON fantasy_rewards(season_id, week, entry_id);
