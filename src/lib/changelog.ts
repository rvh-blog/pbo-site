import { desc, eq } from "drizzle-orm";
import { db, rawClient } from "@/lib/db";
import { changelogEntries } from "@/lib/schema";
import bundledReleases from "@/data/changelog-releases.json";

export const CHANGELOG_CHANGE_TYPES = ["added", "improved", "fixed", "removed"] as const;

export type ChangelogChangeType = (typeof CHANGELOG_CHANGE_TYPES)[number];

export interface ChangelogChange {
  type: ChangelogChangeType;
  text: string;
}

interface BundledChangelogRelease {
  sourceKey: string;
  title: string;
  summary?: string | null;
  publishedAt: string;
  changes: unknown;
}

let changelogInitialization: Promise<void> | null = null;

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

async function initializeChangelogEntries() {
  await rawClient.execute(`
    CREATE TABLE IF NOT EXISTS changelog_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_key TEXT,
      title TEXT NOT NULL,
      summary TEXT,
      published_at TEXT NOT NULL,
      changes TEXT NOT NULL,
      is_published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  const tableInfo = await rawClient.execute("PRAGMA table_info(changelog_entries)");
  if (!tableInfo.rows.some((row) => String(row.name) === "source_key")) {
    await rawClient.execute("ALTER TABLE changelog_entries ADD COLUMN source_key TEXT");
  }

  await rawClient.execute(
    "CREATE INDEX IF NOT EXISTS idx_changelog_entries_published ON changelog_entries(is_published, published_at)"
  );
  await rawClient.execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_changelog_entries_source_key ON changelog_entries(source_key)"
  );

  for (const release of bundledReleases as BundledChangelogRelease[]) {
    const changes = normalizeChangelogChanges(release.changes);
    if (!release.sourceKey || !release.title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(release.publishedAt) || changes.length === 0) {
      throw new Error(`Invalid bundled changelog release: ${release.sourceKey || "unknown"}`);
    }

    await rawClient.execute({
      sql: `UPDATE changelog_entries
            SET source_key = ?
            WHERE id = (
              SELECT id FROM changelog_entries
              WHERE source_key IS NULL AND title = ? AND published_at = ?
              ORDER BY id ASC
              LIMIT 1
            )`,
      args: [release.sourceKey, release.title, release.publishedAt],
    });

    const now = new Date().toISOString();
    await rawClient.execute({
      sql: `INSERT INTO changelog_entries
              (source_key, title, summary, published_at, changes, is_published, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(source_key) DO NOTHING`,
      args: [
        release.sourceKey,
        release.title.trim(),
        release.summary?.trim() || null,
        release.publishedAt,
        JSON.stringify(changes),
        now,
        now,
      ],
    });
  }
}

export async function ensureChangelogEntriesTable() {
  if (!changelogInitialization) {
    changelogInitialization = initializeChangelogEntries().catch((error) => {
      changelogInitialization = null;
      throw error;
    });
  }
  await changelogInitialization;
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
