import { db } from "@/lib/db";
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
