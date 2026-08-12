import { desc, eq } from "drizzle-orm";
import { db, rawClient } from "@/lib/db";
import { changelogEntries } from "@/lib/schema";

export const CHANGELOG_CHANGE_TYPES = ["added", "improved", "fixed", "removed"] as const;

export type ChangelogChangeType = (typeof CHANGELOG_CHANGE_TYPES)[number];

export interface ChangelogChange {
  type: ChangelogChangeType;
  text: string;
}

export function normalizeChangelogChanges(value: unknown): ChangelogChange[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      type: String(item.type ?? "") as ChangelogChangeType,
      text: String(item.text ?? "").trim(),
    }))
    .filter((item) => CHANGELOG_CHANGE_TYPES.includes(item.type) && item.text)
    .slice(0, 100);
}

export async function ensureChangelogEntriesTable() {
  await rawClient.execute(`
    CREATE TABLE IF NOT EXISTS changelog_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      summary TEXT,
      published_at TEXT NOT NULL,
      changes TEXT NOT NULL,
      is_published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await rawClient.execute(
    "CREATE INDEX IF NOT EXISTS idx_changelog_entries_published ON changelog_entries(is_published, published_at)"
  );
}

export async function getPublishedChangelogEntries() {
  await ensureChangelogEntriesTable();
  return db.query.changelogEntries.findMany({
    where: eq(changelogEntries.isPublished, true),
    orderBy: [desc(changelogEntries.publishedAt), desc(changelogEntries.id)],
  });
}

export async function getAllChangelogEntries() {
  await ensureChangelogEntriesTable();
  return db.query.changelogEntries.findMany({
    orderBy: [desc(changelogEntries.publishedAt), desc(changelogEntries.id)],
  });
}
