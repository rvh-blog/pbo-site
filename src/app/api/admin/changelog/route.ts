import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { isAuthenticated } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { logAdminAudit } from "@/lib/admin-audit";
import { db } from "@/lib/db";
import { changelogEntries } from "@/lib/schema";
import {
  ensureChangelogEntriesTable,
  getAllChangelogEntries,
  normalizeChangelogChanges,
} from "@/lib/changelog";

async function requireAdmin() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

function normalizeEntryBody(body: Record<string, unknown>) {
  const title = String(body.title ?? "").trim();
  const summary = String(body.summary ?? "").trim();
  const publishedAt = String(body.publishedAt ?? "").trim();
  const changes = normalizeChangelogChanges(body.changes);
  const isPublished = body.isPublished !== false;

  if (!title || title.length > 120) {
    throw new Error("Title is required and must be 120 characters or fewer");
  }
  if (summary.length > 500) {
    throw new Error("Summary must be 500 characters or fewer");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedAt) || Number.isNaN(Date.parse(`${publishedAt}T12:00:00Z`))) {
    throw new Error("A valid publish date is required");
  }
  if (changes.length === 0) {
    throw new Error("Add at least one changelog item");
  }

  return { title, summary: summary || null, publishedAt, changes, isPublished };
}

export async function GET() {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  return NextResponse.json({ entries: await getAllChangelogEntries() });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const input = normalizeEntryBody(await request.json());
    await ensureChangelogEntriesTable();
    const now = new Date().toISOString();
    const [entry] = await db.insert(changelogEntries).values({
      ...input,
      createdAt: now,
      updatedAt: now,
    }).returning();

    await logAdminAudit({
      session: await getSession(),
      action: "changelog_create",
      entityType: "changelog_entry",
      entityId: entry.id,
      summary: `Created changelog entry: ${entry.title}`,
      details: { after: input },
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create changelog entry" },
      { status: 400 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("A valid entry id is required");

    const input = normalizeEntryBody(body);
    await ensureChangelogEntriesTable();
    const existing = await db.query.changelogEntries.findFirst({
      where: eq(changelogEntries.id, id),
    });
    if (!existing) {
      return NextResponse.json({ error: "Changelog entry not found" }, { status: 404 });
    }

    const [entry] = await db.update(changelogEntries).set({
      ...input,
      updatedAt: new Date().toISOString(),
    }).where(eq(changelogEntries.id, id)).returning();

    await logAdminAudit({
      session: await getSession(),
      action: "changelog_update",
      entityType: "changelog_entry",
      entityId: id,
      summary: `Updated changelog entry: ${entry.title}`,
      details: { before: existing, after: input },
    });

    return NextResponse.json({ entry });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update changelog entry" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "A valid entry id is required" }, { status: 400 });
  }

  await ensureChangelogEntriesTable();
  const existing = await db.query.changelogEntries.findFirst({
    where: eq(changelogEntries.id, id),
  });
  if (!existing) {
    return NextResponse.json({ error: "Changelog entry not found" }, { status: 404 });
  }

  await db.delete(changelogEntries).where(eq(changelogEntries.id, id));
  await logAdminAudit({
    session: await getSession(),
    action: "changelog_delete",
    entityType: "changelog_entry",
    entityId: id,
    summary: `Deleted changelog entry: ${existing.title}`,
    details: { before: existing },
  });

  return NextResponse.json({ success: true });
}
