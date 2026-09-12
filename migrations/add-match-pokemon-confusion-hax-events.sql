ALTER TABLE match_pokemon
  ADD COLUMN favorable_confusions INTEGER;

ALTER TABLE match_pokemon
  ADD COLUMN favorable_confusion_self_hits INTEGER;

ALTER TABLE match_pokemon
  ADD COLUMN favorable_events TEXT;

-- `favorable_events` stores expanded Season 11 Week 6+ replay context. Event
-- types include crit, miss, flinch, status/stat-drop secondary effects, and
-- explicitly logged blocked turns. Legacy Season 5-10 rows remain nullable.
