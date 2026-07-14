import { redirect } from "next/navigation";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminAuditLogs } from "@/lib/schema";
import { isAuthenticated } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ensureAdminAuditLogsTable } from "@/lib/admin-audit";

function formatDetails(details: string | null) {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as Record<string, unknown>;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return details;
  }
}

type PageProps = {
  searchParams: Promise<{ page?: string }>;
};

export default async function AdminAuditLogPage({ searchParams }: PageProps) {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    redirect("/admin/login");
  }

  await ensureAdminAuditLogsTable();

  const pageSize = 50;
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const logs = await db.query.adminAuditLogs.findMany({
    columns: {
      id: true,
      action: true,
      summary: true,
      actorName: true,
      entityType: true,
      entityId: true,
      details: true,
      createdAt: true,
    },
    orderBy: [desc(adminAuditLogs.createdAt)],
    limit: pageSize + 1,
    offset: (page - 1) * pageSize,
  });
  const hasNextPage = logs.length > pageSize;
  const visibleLogs = logs.slice(0, pageSize);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Audit Log</h1>
        <p className="text-[var(--foreground-muted)]">
          Recent risky writes from matches, playoffs, ELO, and Sheets sync.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Changes</CardTitle>
        </CardHeader>
        <CardContent>
          {visibleLogs.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--foreground-muted)]">
              No audit entries yet.
            </p>
          ) : (
            <div className="space-y-3">
              {visibleLogs.map((log) => {
                const details = formatDetails(log.details);
                return (
                  <div
                    key={log.id}
                    className="rounded-lg border border-[var(--card-border)] bg-[var(--background-secondary)] p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-[var(--background-tertiary)] px-2 py-0.5 font-mono text-[11px] uppercase text-[var(--foreground-muted)]">
                            {log.action}
                          </span>
                          <span className="text-sm font-semibold">{log.summary}</span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                          {log.actorName || "Unknown actor"} · {log.entityType}
                          {log.entityId ? ` #${log.entityId}` : ""}
                        </p>
                      </div>
                      <time className="shrink-0 text-xs text-[var(--foreground-muted)]">
                        {new Date(log.createdAt).toLocaleString()}
                      </time>
                    </div>
                    {details && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs font-medium text-[var(--primary)]">
                          Details
                        </summary>
                        <pre className="mt-2 max-h-64 overflow-auto rounded bg-[var(--background)] p-3 text-xs text-[var(--foreground-muted)]">
                          {details}
                        </pre>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {(page > 1 || hasNextPage) && (
            <div className="mt-6 flex items-center justify-between border-t border-[var(--card-border)] pt-4">
              {page > 1 ? (
                <Link
                  href={`/admin/audit-log?page=${page - 1}`}
                  className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-xs font-bold text-[var(--foreground-muted)] hover:text-white"
                >
                  Previous
                </Link>
              ) : <span />}
              <span className="text-xs text-[var(--foreground-muted)]">Page {page}</span>
              {hasNextPage ? (
                <Link
                  href={`/admin/audit-log?page=${page + 1}`}
                  className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-xs font-bold text-[var(--foreground-muted)] hover:text-white"
                >
                  Next
                </Link>
              ) : <span />}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
