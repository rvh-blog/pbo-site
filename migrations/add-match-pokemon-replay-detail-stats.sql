ALTER TABLE match_pokemon
  ADD COLUMN turns_active INTEGER;

ALTER TABLE match_pokemon
  ADD COLUMN hazard_damage_taken INTEGER;

ALTER TABLE match_pokemon
  ADD COLUMN setup_moves_used INTEGER;

ALTER TABLE match_pokemon
  ADD COLUMN favorable_crits INTEGER;

ALTER TABLE match_pokemon
  ADD COLUMN favorable_misses INTEGER;

ALTER TABLE match_pokemon
  ADD COLUMN favorable_flinches INTEGER;

ALTER TABLE match_pokemon
  ADD COLUMN favorable_paralysis INTEGER;

ALTER TABLE match_pokemon
  ADD COLUMN favorable_freezes INTEGER;

ALTER TABLE match_pokemon
  ADD COLUMN favorable_burns INTEGER;
