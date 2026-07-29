import type { ChatInputCommandInteraction } from "discord.js";
import { db, rawClient } from "@/lib/db";
import { discordAuditLogs } from "@/lib/schema";

export interface DiscordAuditInput {
  interaction: ChatInputCommandInteraction;
  operationId: string;
  command: string;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  status: "success" | "failure";
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  error?: string | null;
}

export async function ensureDiscordAuditTable(): Promise<void> {
  await rawClient.execute(`
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
    )
  `);
  await rawClient.execute(
    "CREATE INDEX IF NOT EXISTS idx_discord_audit_logs_created_at ON discord_audit_logs(created_at)"
  );
  await rawClient.execute(
    "CREATE INDEX IF NOT EXISTS idx_discord_audit_logs_user ON discord_audit_logs(discord_user_id)"
  );
  await rawClient.execute(
    "CREATE INDEX IF NOT EXISTS idx_discord_audit_logs_entity ON discord_audit_logs(entity_type, entity_id)"
  );
  await rawClient.execute(
    "CREATE INDEX IF NOT EXISTS idx_discord_audit_logs_command ON discord_audit_logs(command, status)"
  );
}

export async function logDiscordAudit(input: DiscordAuditInput): Promise<void> {
  try {
    await ensureDiscordAuditTable();
    await db.insert(discordAuditLogs).values({
      operationId: input.operationId,
      guildId: input.interaction.guildId,
      channelId: input.interaction.channelId,
      discordUserId: input.interaction.user.id,
      discordUsername: input.interaction.user.username,
      command: input.command,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId === undefined || input.entityId === null
        ? null
        : String(input.entityId),
      status: input.status,
      beforeData: input.before ? JSON.stringify(input.before) : null,
      afterData: input.after ? JSON.stringify(input.after) : null,
      error: input.error ?? null,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Discord Audit] Failed to write audit log:", error);
  }
}
