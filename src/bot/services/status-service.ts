import type { Client, Guild } from "discord.js";
import { rawClient } from "@/lib/db";
import type { BotClient } from "../client";

export interface ServiceCheck {
  ok: boolean;
  latencyMs: number;
  detail?: string;
}

export interface BotStatus {
  uptimeSeconds: number;
  memoryBytes: number;
  discordLatencyMs: number;
  loadedCommands: number;
  database: ServiceCheck;
  website: ServiceCheck;
}

export interface BotDiagnostics {
  globalCommandCount: number | null;
  guildCommandCount: number | null;
  duplicateCommandNames: string[];
  commandsLastHour: number;
  failuresLastHour: number;
  lastFailureOperationId: string | null;
  lastFailureCommand: string | null;
}

async function checkDatabase(): Promise<ServiceCheck> {
  const startedAt = performance.now();
  try {
    await rawClient.execute("SELECT 1 AS healthy");
    return {
      ok: true,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - startedAt),
      detail: error instanceof Error ? error.message : "Database check failed",
    };
  }
}

async function checkWebsite(): Promise<ServiceCheck> {
  const baseUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!baseUrl) {
    return { ok: false, latencyMs: 0, detail: "SITE_URL is not configured" };
  }

  const startedAt = performance.now();
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/health`, {
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    return {
      ok: response.ok,
      latencyMs: Math.round(performance.now() - startedAt),
      detail: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - startedAt),
      detail: error instanceof Error ? error.message : "Website check failed",
    };
  }
}

export async function getBotStatus(client: Client): Promise<BotStatus> {
  const [database, website] = await Promise.all([
    checkDatabase(),
    checkWebsite(),
  ]);

  return {
    uptimeSeconds: Math.round(process.uptime()),
    memoryBytes: process.memoryUsage().rss,
    discordLatencyMs: Math.max(0, Math.round(client.ws.ping)),
    loadedCommands: (client as BotClient).commands.size,
    database,
    website,
  };
}

async function getAuditDiagnostics(): Promise<Pick<
  BotDiagnostics,
  "commandsLastHour" | "failuresLastHour" | "lastFailureOperationId" | "lastFailureCommand"
>> {
  try {
    const result = await rawClient.execute(`
      SELECT
        COUNT(*) AS command_count,
        SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) AS failure_count
      FROM discord_audit_logs
      WHERE datetime(created_at) >= datetime('now', '-1 hour')
    `);
    const lastFailure = await rawClient.execute(`
      SELECT operation_id, command
      FROM discord_audit_logs
      WHERE status = 'failure'
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const summary = result.rows[0];
    const failure = lastFailure.rows[0];
    return {
      commandsLastHour: Number(summary?.command_count ?? 0),
      failuresLastHour: Number(summary?.failure_count ?? 0),
      lastFailureOperationId: failure?.operation_id
        ? String(failure.operation_id)
        : null,
      lastFailureCommand: failure?.command ? String(failure.command) : null,
    };
  } catch {
    return {
      commandsLastHour: 0,
      failuresLastHour: 0,
      lastFailureOperationId: null,
      lastFailureCommand: null,
    };
  }
}

export async function getBotDiagnostics(
  client: Client,
  guild: Guild | null
): Promise<BotDiagnostics> {
  const [globalCommandsResult, guildCommandsResult, audit] = await Promise.all([
    client.application?.commands.fetch().catch(() => null) ?? Promise.resolve(null),
    guild?.commands.fetch().catch(() => null) ?? Promise.resolve(null),
    getAuditDiagnostics(),
  ]);
  const globalNames = globalCommandsResult
    ? [...globalCommandsResult.values()].map((command) => command.name)
    : [];
  const guildNames = guildCommandsResult
    ? [...guildCommandsResult.values()].map((command) => command.name)
    : [];
  const guildNameSet = new Set(guildNames);

  return {
    globalCommandCount: globalCommandsResult?.size ?? null,
    guildCommandCount: guildCommandsResult?.size ?? null,
    duplicateCommandNames: globalNames.filter((name) => guildNameSet.has(name)),
    ...audit,
  };
}
