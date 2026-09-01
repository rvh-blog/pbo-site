"use client";

import { useState, useTransition } from "react";

export function PollControlsCard({ initialPollsEnabled }: { initialPollsEnabled: boolean }) {
  const [pollsEnabled, setPollsEnabled] = useState(initialPollsEnabled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function togglePolls() {
    const nextValue = !pollsEnabled;
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/admin/pick-ems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pollsEnabled: nextValue }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error || "Failed to update poll visibility");
        return;
      }

      setPollsEnabled(nextValue);
    });
  }

  return (
    <div className="rounded-lg border border-[var(--background-tertiary)] p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Show polls publicly</p>
          <p className="text-sm text-[var(--foreground-muted)]">
            Controls whether the active league poll appears on the home page and coach pages. Turning this off keeps the poll and its votes saved.
          </p>
          {error && <p className="mt-2 text-sm text-[var(--error)]">{error}</p>}
        </div>
        <button
          type="button"
          onClick={togglePolls}
          disabled={isPending}
          aria-pressed={pollsEnabled}
          className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            pollsEnabled ? "bg-green-600" : "bg-red-600"
          }`}
        >
          <span
            className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-transform ${
              pollsEnabled ? "left-7" : "left-1"
            }`}
          />
          <span className="sr-only">
            {pollsEnabled ? "Hide polls publicly" : "Show polls publicly"}
          </span>
        </button>
      </div>
      <p className="mt-3 text-xs text-[var(--foreground-subtle)]">
        Current status: {pollsEnabled ? "visible when a poll is active" : "hidden from public pages"}
      </p>
    </div>
  );
}
