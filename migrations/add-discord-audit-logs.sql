CREATE TABLE IF NOT EXISTS discord_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id TEXT NOT NULL UNIQUE,
  guild_id TEXT,
  channel_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  discord_username TEXT NOT NULL,
  command TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  status TEXT NOT NULL,
  before_data TEXT,
  after_data TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_discord_audit_logs_created_at
  ON discord_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_discord_audit_logs_user
  ON discord_audit_logs(discord_user_id);
CREATE INDEX IF NOT EXISTS idx_discord_audit_logs_entity
  ON discord_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_discord_audit_logs_command
  ON discord_audit_logs(command, status);
