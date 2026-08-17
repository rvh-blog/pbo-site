ALTER TABLE match_pokemon
  ADD COLUMN favorable_confusions INTEGER;

ALTER TABLE match_pokemon
  ADD COLUMN favorable_confusion_self_hits INTEGER;

ALTER TABLE match_pokemon
  ADD COLUMN favorable_events TEXT;
