CREATE TABLE IF NOT EXISTS battle_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  turn INTEGER NOT NULL DEFAULT 0,
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  player TEXT,
  actor_nickname TEXT,
  target_player TEXT,
  target_nickname TEXT,
  pokemon_name TEXT,
  move_name TEXT,
  item_name TEXT,
  ability_name TEXT,
  status_name TEXT,
  field_name TEXT,
  value REAL,
  source TEXT,
  raw_line TEXT NOT NULL,
  metadata TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_battle_events_match_sequence ON battle_events(match_id, sequence);
CREATE INDEX IF NOT EXISTS idx_battle_events_match_turn ON battle_events(match_id, turn, sequence);
CREATE INDEX IF NOT EXISTS idx_battle_events_type_match ON battle_events(event_type, match_id);
CREATE INDEX IF NOT EXISTS idx_battle_events_move_type ON battle_events(move_name, event_type);
CREATE INDEX IF NOT EXISTS idx_battle_events_item_type ON battle_events(item_name, event_type);
CREATE INDEX IF NOT EXISTS idx_battle_events_ability_type ON battle_events(ability_name, event_type);
CREATE INDEX IF NOT EXISTS idx_battle_events_status_type ON battle_events(status_name, event_type);
