import { eq } from "drizzle-orm";
import { db, rawClient } from "@/lib/db";
import { battleRecordOverrides } from "@/lib/schema";

export type BattleRecordScope = "regular-season" | "playoffs";

export interface BattleRecordOverrideEntry {
  title: string;
  detail: string;
  href?: string;
}

export interface BattleRecordCategoryShape {
  title: string;
  entries: BattleRecordOverrideEntry[];
}

export const BATTLE_RECORD_CATEGORIES: Record<BattleRecordScope, string[]> = {
  "regular-season": [
    "Most Wins in a Row",
    "Most Losses in a Row",
    "Best Differential",
    "Worst Differential",
    "Most Deaths",
    "Longest Game (Turns)",
    "Longest Game (Duration)",
    "Fastest Game (Turns)",
    "Best K/D Ratio",
  ],
  playoffs: [
    "Most Wins in a Row",
    "Most Losses in a Row",
    "Most Consecutive Playoff Appearances",
    "Best Differential",
    "Worst Differential",
    "Most Deaths",
    "Longest Game (Turns)",
    "Longest Game (Duration)",
    "Fastest Game (Turns)",
    "Best K/D Ratio",
  ],
};

export function battleRecordCategoryKey(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function ensureBattleRecordOverridesTable() {
  await rawClient.execute(`
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
    )
  `);
  await rawClient.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_battle_record_overrides_scope_category ON battle_record_overrides(scope, category_key)");
  await rawClient.execute("CREATE INDEX IF NOT EXISTS idx_battle_record_overrides_active ON battle_record_overrides(is_active)");
}

export async function getBattleRecordOverrides(activeOnly = false) {
  await ensureBattleRecordOverridesTable();
  return activeOnly
    ? db.select().from(battleRecordOverrides).where(eq(battleRecordOverrides.isActive, true))
    : db.select().from(battleRecordOverrides);
}

export function parseBattleRecordOverrideEntries(raw: string): BattleRecordOverrideEntry[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
      .map((entry) => ({
        title: String(entry.title ?? "").trim(),
        detail: String(entry.detail ?? "").trim(),
        href: String(entry.href ?? "").trim() || undefined,
      }))
      .filter((entry) => entry.title && entry.detail)
      .slice(0, 3);
  } catch {
    return [];
  }
}

export function applyBattleRecordOverrides<T extends BattleRecordCategoryShape>(
  categories: T[],
  scope: BattleRecordScope,
  overrides: Awaited<ReturnType<typeof getBattleRecordOverrides>>
): T[] {
  const byKey = new Map(
    overrides
      .filter((override) => override.isActive && override.scope === scope)
      .map((override) => [override.categoryKey, override])
  );

  return categories.map((category) => {
    const override = byKey.get(battleRecordCategoryKey(category.title));
    if (!override) return category;
    const entries = parseBattleRecordOverrideEntries(override.entries);
    return entries.length > 0 ? { ...category, entries } : category;
  });
}
