INSERT OR IGNORE INTO store_items (slug, name, description, price, category, is_active, max_per_user)
VALUES
  ('logo-frame-inferno', 'Inferno Logo Frame', 'A red and orange frame with a fiery glow.', 375, 'logo_frame', 1, 1),
  ('logo-frame-icy', 'Icy Logo Frame', 'A light blue frame with an icy glow.', 375, 'logo_frame', 1, 1),
  ('logo-frame-chromatic-flow', 'Chromatic Flow Logo Frame', 'A continuously shifting rainbow gradient.', 375, 'logo_frame', 1, 1);

UPDATE store_items
SET price = 375,
    is_active = 1,
    max_per_user = 1
WHERE slug IN (
  'logo-frame-inferno',
  'logo-frame-icy',
  'logo-frame-chromatic-flow'
);
