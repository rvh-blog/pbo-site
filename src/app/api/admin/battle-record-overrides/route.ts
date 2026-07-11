import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { isAuthenticated } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { logAdminAudit } from "@/lib/admin-audit";
import { db } from "@/lib/db";
import { battleRecordOverrides } from "@/lib/schema";
import {
  BATTLE_RECORD_CATEGORIES,
  battleRecordCategoryKey,
  ensureBattleRecordOverridesTable,
  getBattleRecordOverrides,
  parseBattleRecordOverrideEntries,
  type BattleRecordOverrideEntry,
  type BattleRecordScope,
} from "@/lib/battle-record-overrides";

async function requireAdmin() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

function isScope(value: unknown): value is BattleRecordScope {
  return value === "regular-season" || value === "playoffs";
}

function normalizeEntries(value: unknown): BattleRecordOverrideEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .map((entry) => ({
      title: String(entry.title ?? "").trim(),
      detail: String(entry.detail ?? "").trim(),
      href: String(entry.href ?? "").trim() || undefined,
    }))
    .filter((entry) => entry.title || entry.detail || entry.href)
    .slice(0, 3);
}

export async function GET() {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const overrides = await getBattleRecordOverrides();
  return NextResponse.json({
    categories: BATTLE_RECORD_CATEGORIES,
    overrides: overrides.map((override) => ({
      ...override,
      entries: parseBattleRecordOverrideEntries(override.entries),
    })),
  });
}

export async function PUT(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const scope = body?.scope;
    const categoryTitle = String(body?.categoryTitle ?? "").trim();
    const reason = String(body?.reason ?? "").trim();
    const isActive = body?.isActive !== false;
    const entries = normalizeEntries(body?.entries);

    if (!isScope(scope)) {
      return NextResponse.json({ error: "Invalid record scope" }, { status: 400 });
    }
    if (!BATTLE_RECORD_CATEGORIES[scope].includes(categoryTitle)) {
      return NextResponse.json({ error: "Invalid record category" }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ error: "A correction reason is required" }, { status: 400 });
    }
    if (isActive && (entries.length === 0 || entries.some((entry) => !entry.title || !entry.detail))) {
      return NextResponse.json(
        { error: "Each active override entry needs both a title and detail" },
        { status: 400 }
      );
    }
    const invalidHref = entries.find((entry) => entry.href && !entry.href.startsWith("/") && !entry.href.startsWith("https://"));
    if (invalidHref) {
      return NextResponse.json({ error: "Links must start with / or https://" }, { status: 400 });
    }

    await ensureBattleRecordOverridesTable();
    const categoryKey = battleRecordCategoryKey(categoryTitle);
    const existing = await db.query.battleRecordOverrides.findFirst({
      where: and(
        eq(battleRecordOverrides.scope, scope),
        eq(battleRecordOverrides.categoryKey, categoryKey)
      ),
    });
    const now = new Date().toISOString();
    const serializedEntries = JSON.stringify(entries);

    const [saved] = await db
      .insert(battleRecordOverrides)
      .values({
        scope,
        categoryKey,
        categoryTitle,
        entries: serializedEntries,
        reason,
        isActive,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [battleRecordOverrides.scope, battleRecordOverrides.categoryKey],
        set: {
          categoryTitle,
          entries: serializedEntries,
          reason,
          isActive,
          updatedAt: now,
        },
      })
      .returning();

    await logAdminAudit({
      session: await getSession(),
      action: existing ? "battle_record_override_update" : "battle_record_override_create",
      entityType: "battle_record_override",
      entityId: saved.id,
      summary: `${isActive ? "Set" : "Disabled"} ${scope} override for ${categoryTitle}`,
      details: {
        before: existing ? {
          entries: parseBattleRecordOverrideEntries(existing.entries),
          reason: existing.reason,
          isActive: existing.isActive,
        } : null,
        after: { entries, reason, isActive },
      },
    });

    return NextResponse.json({ override: { ...saved, entries } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save override" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await ensureBattleRecordOverridesTable();
  const existing = await db.query.battleRecordOverrides.findFirst({
    where: eq(battleRecordOverrides.id, id),
  });
  if (!existing) {
    return NextResponse.json({ error: "Override not found" }, { status: 404 });
  }

  await db.delete(battleRecordOverrides).where(eq(battleRecordOverrides.id, id));
  await logAdminAudit({
    session: await getSession(),
    action: "battle_record_override_delete",
    entityType: "battle_record_override",
    entityId: id,
    summary: `Deleted ${existing.scope} override for ${existing.categoryTitle}`,
    details: {
      entries: parseBattleRecordOverrideEntries(existing.entries),
      reason: existing.reason,
      isActive: existing.isActive,
    },
  });

  return NextResponse.json({ success: true });
}
