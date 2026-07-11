"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Scope = "regular-season" | "playoffs";

interface Entry {
  title: string;
  detail: string;
  href?: string;
}

interface SavedOverride {
  id: number;
  scope: Scope;
  categoryTitle: string;
  entries: Entry[];
  reason: string;
  isActive: boolean;
  updatedAt: string;
}

const EMPTY_ENTRIES: Entry[] = Array.from({ length: 3 }, () => ({ title: "", detail: "", href: "" }));

export default function BattleRecordOverridesAdminPage() {
  const [categories, setCategories] = useState<Record<Scope, string[]>>({
    "regular-season": [],
    playoffs: [],
  });
  const [overrides, setOverrides] = useState<SavedOverride[]>([]);
  const [scope, setScope] = useState<Scope>("regular-season");
  const [categoryTitle, setCategoryTitle] = useState("");
  const [entries, setEntries] = useState<Entry[]>(EMPTY_ENTRIES.map((entry) => ({ ...entry })));
  const [reason, setReason] = useState("");
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [currentActive, setCurrentActive] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSelection = useCallback((nextScope: Scope, nextTitle: string, rows: SavedOverride[]) => {
    const existing = rows.find((row) => row.scope === nextScope && row.categoryTitle === nextTitle);
    setCurrentId(existing?.id ?? null);
    setCurrentActive(existing?.isActive ?? false);
    setReason(existing?.reason ?? "");
    setEntries(Array.from({ length: 3 }, (_, index) => ({
      title: existing?.entries[index]?.title ?? "",
      detail: existing?.entries[index]?.detail ?? "",
      href: existing?.entries[index]?.href ?? "",
    })));
    setMessage("");
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/battle-record-overrides", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load overrides");
      setCategories(data.categories);
      setOverrides(data.overrides);
      const firstTitle = categoryTitle || data.categories[scope]?.[0] || "";
      setCategoryTitle(firstTitle);
      loadSelection(scope, firstTitle, data.overrides);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load overrides");
    } finally {
      setLoading(false);
    }
  }, [categoryTitle, loadSelection, scope]);

  useEffect(() => {
    void refresh();
    // Initial load only; later refreshes are triggered after writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeScope(nextScope: Scope) {
    const nextTitle = categories[nextScope][0] || "";
    setScope(nextScope);
    setCategoryTitle(nextTitle);
    loadSelection(nextScope, nextTitle, overrides);
  }

  function changeCategory(nextTitle: string) {
    setCategoryTitle(nextTitle);
    loadSelection(scope, nextTitle, overrides);
  }

  function updateEntry(index: number, field: keyof Entry, value: string) {
    setEntries((current) => current.map((entry, entryIndex) => (
      entryIndex === index ? { ...entry, [field]: value } : entry
    )));
  }

  async function saveOverride(isActive: boolean) {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/battle-record-overrides", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, categoryTitle, entries, reason, isActive }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save override");
      setMessage(isActive ? "Override saved and active." : "Override disabled; automatic records are showing.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save override");
    } finally {
      setSaving(false);
    }
  }

  async function deleteOverride() {
    if (!currentId || !confirm("Delete this override and return to the automatic record?")) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/battle-record-overrides?id=${currentId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to delete override");
      setMessage("Override deleted; automatic records are showing.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete override");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-pixel text-xl text-[var(--foreground)]">Battle Record Overrides</h1>
        <p className="mt-2 text-sm text-[var(--foreground-muted)]">
          Replace a PBO Records category without changing matches or automatic calculations. Disable or delete an override to restore calculated results.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Record</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm font-semibold">
            <span>Scope</span>
            <select
              value={scope}
              onChange={(event) => changeScope(event.target.value as Scope)}
              className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)]"
            >
              <option value="regular-season">Regular Season</option>
              <option value="playoffs">Playoffs</option>
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold">
            <span>Category</span>
            <select
              value={categoryTitle}
              onChange={(event) => changeCategory(event.target.value)}
              disabled={loading}
              className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)]"
            >
              {categories[scope].map((category) => <option key={category}>{category}</option>)}
            </select>
          </label>
          <div className="md:col-span-2 text-sm">
            Status:{" "}
            <span className={currentActive ? "font-bold text-[var(--success)]" : "font-bold text-[var(--foreground-muted)]"}>
              {currentId ? (currentActive ? "Active override" : "Disabled override") : "Automatic calculation"}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Replacement Entries</CardTitle>
          <p className="text-sm text-[var(--foreground-muted)]">Fill one to three placements in the order they should appear.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {entries.map((entry, index) => (
            <div key={index} className="grid gap-3 rounded-lg border border-[var(--card-border)] bg-[var(--background-secondary)] p-4 md:grid-cols-2">
              <p className="font-bold text-[var(--foreground)] md:col-span-2">Placement {index + 1}</p>
              <label className="space-y-1 text-sm">
                <span className="font-semibold">Title</span>
                <input value={entry.title} onChange={(event) => updateEntry(index, "title", event.target.value)} placeholder="Coach — 12 wins" className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)]" />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-semibold">Detail</span>
                <input value={entry.detail} onChange={(event) => updateEntry(index, "detail", event.target.value)} placeholder="Season, division, team, or match details" className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)]" />
              </label>
              <label className="space-y-1 text-sm md:col-span-2">
                <span className="font-semibold">Link (optional)</span>
                <input value={entry.href ?? ""} onChange={(event) => updateEntry(index, "href", event.target.value)} placeholder="/coaches/123 or /matches/456" className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)]" />
              </label>
            </div>
          ))}

          <label className="block space-y-1 text-sm">
            <span className="font-semibold">Correction reason</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="Explain why the automatic record needs a display override." className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)]" />
          </label>

          {message && <p className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-3 text-sm text-[var(--foreground)]">{message}</p>}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void saveOverride(true)} disabled={saving || loading || !categoryTitle}>Save Active Override</Button>
            {currentId && <Button variant="outline" onClick={() => void saveOverride(false)} disabled={saving}>Disable Override</Button>}
            {currentId && <Button variant="outline" onClick={() => void deleteOverride()} disabled={saving} className="text-[var(--error)]">Delete Override</Button>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
