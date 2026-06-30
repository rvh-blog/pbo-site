INSERT OR IGNORE INTO store_items (slug, name, description, price, category, is_active, max_per_user)
VALUES (
  'logo-frame-champion-gold',
  'Champion Gold Logo Frame',
  'Earned by winning a championship in any division.',
  0,
  'logo_frame',
  0,
  1
);

UPDATE store_items
SET
  name = 'Champion Gold Logo Frame',
  description = 'Earned by winning a championship in any division.',
  price = 0,
  category = 'logo_frame',
  is_active = 0,
  max_per_user = 1
WHERE slug = 'logo-frame-champion-gold';
