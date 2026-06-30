INSERT OR IGNORE INTO store_items (slug, name, description, price, category, is_active, max_per_user)
VALUES
  ('logo-frame-classic-chrome', 'Classic Chrome Logo Frame', 'A clean chrome border for a polished team logo display.', 150, 'logo_frame', 1, 1),
  ('logo-frame-division', 'Custom Colors Logo Frame', 'A customizable frame where you choose the exact colors.', 400, 'logo_frame', 1, 1),
  ('logo-frame-pokeball', 'Pokeball Ring Logo Frame', 'A Pokeball-inspired ring that makes your logo feel match-ready.', 200, 'logo_frame', 1, 1),
  ('logo-frame-holo-rare', 'Holo Rare Logo Frame', 'A prismatic holographic frame with a rare-card shine.', 300, 'logo_frame', 1, 1),
  ('logo-frame-champion-gold', 'Champion Gold Logo Frame', 'Earned by winning a championship in any division.', 0, 'logo_frame', 0, 1),
  ('logo-frame-retro-pixel', 'Retro Pixel Logo Frame', 'A chunky pixel frame that fits the PBO retro interface.', 200, 'logo_frame', 1, 1),
  ('logo-frame-dark-elite', 'Dark Mode Logo Frame', 'A sleek dark frame with subtle elite-tier contrast.', 250, 'logo_frame', 1, 1);
