"use client";

import { useState, useTransition } from "react";

export function HomepageVisibilityCard({
  initialRecentDraftPicksHidden,
}: {
  initialRecentDraftPicksHidden: boolean;
}) {
  const [recentDraftPicksHidden, setRecentDraftPicksHidden] = useState(initialRecentDraftPicksHidden);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleRecentDraftPicks() {
    const nextValue = !recentDraftPicksHidden;
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/admin/pick-ems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recentDraftPicksHidden: nextValue }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error || "Failed to update home page visibility");
        return;
      }

      setRecentDraftPicksHidden(nextValue);
    });
  }

  return (
    <div className="p-4 rounded-lg border border-[var(--background-tertiary)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Recent Draft Picks</p>
          <p className="text-sm text-[var(--foreground-muted)]">
            Controls whether the Recent Draft Picks panel appears on the public home page.
          </p>
          {error && <p className="mt-2 text-sm text-[var(--error)]">{error}</p>}
        </div>
        <button
          type="button"
          onClick={toggleRecentDraftPicks}
          disabled={isPending}
          aria-pressed={!recentDraftPicksHidden}
          className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            recentDraftPicksHidden ? "bg-red-600" : "bg-green-600"
          }`}
        >
          <span
            className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-transform ${
              recentDraftPicksHidden ? "left-1" : "left-7"
            }`}
          />
          <span className="sr-only">
            {recentDraftPicksHidden ? "Show Recent Draft Picks" : "Hide Recent Draft Picks"}
          </span>
        </button>
      </div>
      <p className="mt-3 text-xs text-[var(--foreground-subtle)]">
        Current status: {recentDraftPicksHidden ? "hidden" : "visible"}
      </p>
    </div>
  );
}
