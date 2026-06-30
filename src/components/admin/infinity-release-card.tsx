"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type InfinityReleaseState = {
  revealAt: string;
  isReleased: boolean;
  isManuallyReleased: boolean;
};

function formatReleaseTime(isoString: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Los_Angeles",
  }).format(new Date(isoString));
}

export function InfinityReleaseCard({ initialState }: { initialState: InfinityReleaseState }) {
  const [state, setState] = useState(initialState);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runAction(action: "release" | "restoreSchedule") {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/infinity-release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data?.error || "Failed to update release status");
        return;
      }

      setState(data);
    });
  }

  return (
    <div className="p-4 rounded-lg border border-[var(--background-tertiary)]">
      <div className="flex items-start gap-4">
        <div className="w-8 h-8 rounded-full bg-[var(--accent)] text-white flex items-center justify-center font-bold shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="font-semibold">Infinity Division Release</p>
              <p className="text-sm text-[var(--foreground-muted)]">
                {state.isReleased
                  ? state.isManuallyReleased
                    ? "Infinity is public now because it was manually released."
                    : "Infinity is public because the scheduled release time has passed."
                  : `Hidden from public until ${formatReleaseTime(state.revealAt)} PT.`}
              </p>
              {error && <p className="mt-2 text-sm text-[var(--error)]">{error}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => runAction("release")}
                disabled={isPending || state.isManuallyReleased}
              >
                Release Now
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => runAction("restoreSchedule")}
                disabled={isPending || (!state.isManuallyReleased && !state.isReleased)}
              >
                Restore Schedule
              </Button>
            </div>
          </div>
          <p className="mt-3 text-xs text-[var(--foreground-subtle)]">
            Scheduled release: {formatReleaseTime(state.revealAt)} PT
          </p>
        </div>
      </div>
    </div>
  );
}

