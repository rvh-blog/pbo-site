UPDATE store_items
SET
  name = 'Custom Colors Logo Frame',
  description = 'A customizable frame where you choose the exact colors.',
  is_active = 1
WHERE slug = 'logo-frame-division';

UPDATE store_items
SET is_active = 0
WHERE slug = 'logo-frame-type-badge';
