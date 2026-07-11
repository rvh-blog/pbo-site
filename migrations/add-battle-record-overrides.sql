CREATE TABLE IF NOT EXISTS battle_record_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL,
  category_key TEXT NOT NULL,
  category_title TEXT NOT NULL,
  entries TEXT NOT NULL,
  reason TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_battle_record_overrides_scope_category
  ON battle_record_overrides(scope, category_key);

CREATE INDEX IF NOT EXISTS idx_battle_record_overrides_active
  ON battle_record_overrides(is_active);
