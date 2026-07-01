import { db } from "@/lib/db";
import { rawClient } from "@/lib/db";
import { adminAuditLogs } from "@/lib/schema";
import type { SessionUser } from "@/lib/session";

interface AdminAuditInput {
  session: SessionUser | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  summary: string;
  details?: Record<string, unknown> | null;
}

export async function logAdminAudit({
  session,
  action,
  entityType,
  entityId,
  summary,
  details,
}: AdminAuditInput) {
  try {
    await ensureAdminAuditLogsTable();
    await db.insert(adminAuditLogs).values({
      actorType: session?.type ?? null,
      actorId: session?.id ?? null,
      actorName: session?.name ?? null,
      action,
      entityType,
      entityId: entityId === undefined || entityId === null ? null : String(entityId),
      summary,
      details: details ? JSON.stringify(details) : null,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Admin Audit] Failed to write audit log:", error);
  }
}

export async function ensureAdminAuditLogsTable() {
  await rawClient.execute(`
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_type TEXT,
      actor_id INTEGER,
      actor_name TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      summary TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL
    )
  `);
  await rawClient.execute("CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at)");
  await rawClient.execute("CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity ON admin_audit_logs(entity_type, entity_id)");
  await rawClient.execute("CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor ON admin_audit_logs(actor_type, actor_id)");
}
