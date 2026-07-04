CREATE INDEX IF NOT EXISTS idx_seasons_current_public_number
ON seasons(is_current, is_public, season_number);

CREATE INDEX IF NOT EXISTS idx_divisions_season_order
ON divisions(season_id, display_order);

CREATE INDEX IF NOT EXISTS idx_season_coaches_division_active
ON season_coaches(division_id, is_active);

CREATE INDEX IF NOT EXISTS idx_season_coaches_replaced_by_id
ON season_coaches(replaced_by_id);

CREATE INDEX IF NOT EXISTS idx_rosters_season_coach_pokemon
ON rosters(season_coach_id, pokemon_id);

CREATE INDEX IF NOT EXISTS idx_matches_coach1_season_id
ON matches(coach1_season_id);

CREATE INDEX IF NOT EXISTS idx_matches_coach2_season_id
ON matches(coach2_season_id);

CREATE INDEX IF NOT EXISTS idx_matches_division_week
ON matches(division_id, week);

CREATE INDEX IF NOT EXISTS idx_playoff_matches_division_id
ON playoff_matches(division_id);

CREATE INDEX IF NOT EXISTS idx_playoff_matches_higher_seed_id
ON playoff_matches(higher_seed_id);

CREATE INDEX IF NOT EXISTS idx_playoff_matches_lower_seed_id
ON playoff_matches(lower_seed_id);

CREATE INDEX IF NOT EXISTS idx_kill_events_killer_season_coach_id
ON kill_events(killer_season_coach_id);

CREATE INDEX IF NOT EXISTS idx_kill_events_victim_season_coach_id
ON kill_events(victim_season_coach_id);

CREATE INDEX IF NOT EXISTS idx_transactions_trading_partner_season_coach_id
ON transactions(trading_partner_season_coach_id);

CREATE INDEX IF NOT EXISTS idx_pick_em_picks_predicted_winner_id
ON pick_em_picks(predicted_winner_id);

CREATE INDEX IF NOT EXISTS idx_bets_predicted_winner_id
ON bets(predicted_winner_id);

CREATE INDEX IF NOT EXISTS idx_kill_bets_season_coach_id
ON kill_bets(season_coach_id);

CREATE INDEX IF NOT EXISTS idx_death_bets_season_coach_id
ON death_bets(season_coach_id);

CREATE INDEX IF NOT EXISTS idx_season_pokemon_prices_season_pokemon
ON season_pokemon_prices(season_id, pokemon_id);
