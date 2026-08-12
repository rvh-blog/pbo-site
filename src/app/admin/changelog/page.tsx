"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ChangeType = "added" | "improved" | "fixed" | "removed";

interface ChangelogChange {
  type: ChangeType;
  text: string;
}

interface ChangelogEntry {
  id: number;
  title: string;
  summary: string | null;
  publishedAt: string;
  changes: ChangelogChange[];
  isPublished: boolean;
  updatedAt: string;
}

const CHANGE_SECTIONS: Array<{ type: ChangeType; label: string; hint: string }> = [
  { type: "added", label: "Added", hint: "New pages, tools, or capabilities" },
  { type: "improved", label: "Improved", hint: "Updates to existing experiences" },
  { type: "fixed", label: "Fixed", hint: "Bugs that were corrected" },
  { type: "removed", label: "Removed", hint: "Features or behavior no longer available" },
];

const EMPTY_LINES: Record<ChangeType, string> = {
  added: "",
  improved: "",
  fixed: "",
  removed: "",
};

function today() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

export default function ChangelogAdminPage() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [publishedAt, setPublishedAt] = useState(today);
  const [isPublished, setIsPublished] = useState(true);
  const [lines, setLines] = useState<Record<ChangeType, string>>(EMPTY_LINES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/changelog", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load changelog");
      setEntries(data.entries);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load changelog");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const changeCount = useMemo(
    () => Object.values(lines).reduce((total, value) => total + value.split("\n").filter((line) => line.trim()).length, 0),
    [lines]
  );

  function startNew() {
    setSelectedId(null);
    setTitle("");
    setSummary("");
    setPublishedAt(today());
    setIsPublished(true);
    setLines({ ...EMPTY_LINES });
    setMessage("");
  }

  function editEntry(entry: ChangelogEntry) {
    const nextLines = { ...EMPTY_LINES };
    for (const section of CHANGE_SECTIONS) {
      nextLines[section.type] = entry.changes
        .filter((change) => change.type === section.type)
        .map((change) => change.text)
        .join("\n");
    }
    setSelectedId(entry.id);
    setTitle(entry.title);
    setSummary(entry.summary ?? "");
    setPublishedAt(entry.publishedAt);
    setIsPublished(entry.isPublished);
    setLines(nextLines);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function buildChanges(): ChangelogChange[] {
    return CHANGE_SECTIONS.flatMap(({ type }) =>
      lines[type]
        .split("\n")
        .map((text) => text.trim())
        .filter(Boolean)
        .map((text) => ({ type, text }))
    );
  }

  async function saveEntry() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/changelog", {
        method: selectedId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedId,
          title,
          summary,
          publishedAt,
          isPublished,
          changes: buildChanges(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save changelog entry");
      setMessage(selectedId ? "Changelog entry updated." : "Changelog entry created.");
      setSelectedId(data.entry.id);
      await loadEntries();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save changelog entry");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry() {
    if (!selectedId || !confirm("Delete this changelog entry? This cannot be undone.")) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/changelog?id=${selectedId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to delete changelog entry");
      startNew();
      setMessage("Changelog entry deleted.");
      await loadEntries();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete changelog entry");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-pixel text-xl text-[var(--foreground)]">Changelog</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--foreground-muted)]">
            Publish concise website updates. Enter one item per line under the relevant section.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/changelog" target="_blank" className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--card-border)] px-5 py-2 font-semibold text-[var(--foreground)] transition-colors hover:border-[var(--primary)]/50 hover:bg-[var(--glass)]">View Public Page</Link>
          <Button variant="outline" onClick={startNew}>New Entry</Button>
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle>{selectedId ? "Edit Entry" : "New Entry"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
              <label className="space-y-1 text-sm font-semibold">
                <span>Title</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="Battle Record expansion" className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-[var(--foreground)]" />
              </label>
              <label className="space-y-1 text-sm font-semibold">
                <span>Publish date</span>
                <input type="date" value={publishedAt} onChange={(event) => setPublishedAt(event.target.value)} className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-[var(--foreground)]" />
              </label>
            </div>

            <label className="block space-y-1 text-sm font-semibold">
              <span>Summary <span className="font-normal text-[var(--foreground-subtle)]">(optional)</span></span>
              <textarea value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={500} rows={3} placeholder="A short overview shown above the categorized changes." className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-[var(--foreground)]" />
            </label>

            <div className="grid gap-4 lg:grid-cols-2">
              {CHANGE_SECTIONS.map((section) => (
                <label key={section.type} className="space-y-1 text-sm">
                  <span className="font-bold uppercase tracking-wide text-[var(--foreground)]">{section.label}</span>
                  <span className="block text-xs text-[var(--foreground-subtle)]">{section.hint}</span>
                  <textarea value={lines[section.type]} onChange={(event) => setLines((current) => ({ ...current, [section.type]: event.target.value }))} rows={6} placeholder={`One ${section.label.toLowerCase()} item per line`} className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-[var(--foreground)]" />
                </label>
              ))}
            </div>

            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 text-sm">
              <input type="checkbox" checked={isPublished} onChange={(event) => setIsPublished(event.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
              <span><span className="font-semibold text-[var(--foreground)]">Published</span><span className="ml-2 text-[var(--foreground-muted)]">Visible on the public changelog</span></span>
            </label>

            {message && <p role="status" className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-3 text-sm text-[var(--foreground)]">{message}</p>}

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void saveEntry()} disabled={saving || loading || !title.trim() || changeCount === 0}>{saving ? "Saving…" : selectedId ? "Save Changes" : "Create Entry"}</Button>
              {selectedId && <Button variant="outline" onClick={() => void deleteEntry()} disabled={saving} className="text-[var(--error)]">Delete</Button>}
              <span className="text-xs text-[var(--foreground-subtle)]">{changeCount} {changeCount === 1 ? "change" : "changes"}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="xl:sticky xl:top-4">
          <CardHeader>
            <CardTitle>Entries</CardTitle>
            <p className="text-sm text-[var(--foreground-muted)]">Published and draft updates, newest first.</p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="py-6 text-center text-sm text-[var(--foreground-muted)]">Loading changelog…</p>
            ) : entries.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[var(--card-border)] p-6 text-center text-sm text-[var(--foreground-muted)]">No entries yet.</p>
            ) : (
              <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
                {entries.map((entry) => (
                  <button key={entry.id} type="button" onClick={() => editEntry(entry)} className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedId === entry.id ? "border-[var(--primary)] bg-[var(--primary)]/10" : "border-[var(--card-border)] bg-[var(--background)] hover:border-[var(--primary)]/40"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-semibold text-[var(--foreground)]">{entry.title}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${entry.isPublished ? "bg-[var(--success)]/15 text-[var(--success)]" : "bg-[var(--foreground-subtle)]/15 text-[var(--foreground-muted)]"}`}>{entry.isPublished ? "Live" : "Draft"}</span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--foreground-muted)]">{formatDate(entry.publishedAt)} · {entry.changes.length} changes</p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
