"use client";

import { useState, useTransition } from "react";

export function HomepageVisibilityCard({
  initialRecentDraftPicksHidden,
  initialPlayoffCalculatorSearchEnabled,
  initialTradeBlockEnabled,
  initialSpeedToursEnabled,
}: {
  initialRecentDraftPicksHidden: boolean;
  initialPlayoffCalculatorSearchEnabled: boolean;
  initialTradeBlockEnabled: boolean;
  initialSpeedToursEnabled: boolean;
}) {
  const [recentDraftPicksHidden, setRecentDraftPicksHidden] = useState(initialRecentDraftPicksHidden);
  const [playoffCalculatorSearchEnabled, setPlayoffCalculatorSearchEnabled] = useState(initialPlayoffCalculatorSearchEnabled);
  const [tradeBlockEnabled, setTradeBlockEnabled] = useState(initialTradeBlockEnabled);
  const [speedToursEnabled, setSpeedToursEnabled] = useState(initialSpeedToursEnabled);
  const [recentDraftPicksError, setRecentDraftPicksError] = useState<string | null>(null);
  const [playoffCalculatorError, setPlayoffCalculatorError] = useState<string | null>(null);
  const [tradeBlockError, setTradeBlockError] = useState<string | null>(null);
  const [speedToursError, setSpeedToursError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleRecentDraftPicks() {
    const nextValue = !recentDraftPicksHidden;
    setRecentDraftPicksError(null);

    startTransition(async () => {
      const response = await fetch("/api/admin/pick-ems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recentDraftPicksHidden: nextValue }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setRecentDraftPicksError(data?.error || "Failed to update home page visibility");
        return;
      }

      setRecentDraftPicksHidden(nextValue);
    });
  }

  function togglePlayoffCalculatorSearch() {
    const nextValue = !playoffCalculatorSearchEnabled;
    setPlayoffCalculatorError(null);

    startTransition(async () => {
      const response = await fetch("/api/admin/pick-ems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playoffCalculatorSearchEnabled: nextValue }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setPlayoffCalculatorError(data?.error || "Failed to update playoff calculator visibility");
        return;
      }

      setPlayoffCalculatorSearchEnabled(nextValue);
    });
  }

  function toggleTradeBlock() {
    const nextValue = !tradeBlockEnabled;
    setTradeBlockError(null);

    startTransition(async () => {
      const response = await fetch("/api/admin/pick-ems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeBlockEnabled: nextValue }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setTradeBlockError(data?.error || "Failed to update Trade Block visibility");
        return;
      }

      setTradeBlockEnabled(nextValue);
    });
  }

  function toggleSpeedTours() {
    const nextValue = !speedToursEnabled;
    setSpeedToursError(null);

    startTransition(async () => {
      const response = await fetch("/api/admin/pick-ems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speedToursEnabled: nextValue }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setSpeedToursError(data?.error || "Failed to update Speed Tours visibility");
        return;
      }

      setSpeedToursEnabled(nextValue);
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[var(--background-tertiary)] p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Playoff Calculator Search</p>
            <p className="text-sm text-[var(--foreground-muted)]">
              Controls whether site search can reveal the playoff calculator. It remains absent from navigation.
            </p>
            {playoffCalculatorError && <p className="mt-2 text-sm text-[var(--error)]">{playoffCalculatorError}</p>}
          </div>
          <button
            type="button"
            onClick={togglePlayoffCalculatorSearch}
            disabled={isPending}
            aria-pressed={playoffCalculatorSearchEnabled}
            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
              playoffCalculatorSearchEnabled ? "bg-green-600" : "bg-red-600"
            }`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-transform ${
                playoffCalculatorSearchEnabled ? "left-7" : "left-1"
              }`}
            />
            <span className="sr-only">
              {playoffCalculatorSearchEnabled ? "Hide Playoff Calculator from search" : "Show Playoff Calculator in search"}
            </span>
          </button>
        </div>
        <p className="mt-3 text-xs text-[var(--foreground-subtle)]">
          Current status: {playoffCalculatorSearchEnabled ? "visible in search" : "hidden from search"}
        </p>
      </div>

      <div className="rounded-lg border border-[var(--background-tertiary)] p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Speed Tours</p>
            <p className="text-sm text-[var(--foreground-muted)]">
              Controls whether the Speed Tours header link and public event room are available.
            </p>
            {speedToursError && <p className="mt-2 text-sm text-[var(--error)]">{speedToursError}</p>}
          </div>
          <button
            type="button"
            onClick={toggleSpeedTours}
            disabled={isPending}
            aria-pressed={speedToursEnabled}
            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
              speedToursEnabled ? "bg-green-600" : "bg-red-600"
            }`}
          >
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-transform ${speedToursEnabled ? "left-7" : "left-1"}`} />
            <span className="sr-only">
              {speedToursEnabled ? "Hide Speed Tours" : "Show Speed Tours"}
            </span>
          </button>
        </div>
        <p className="mt-3 text-xs text-[var(--foreground-subtle)]">
          Current status: {speedToursEnabled ? "visible" : "hidden from public pages"}
        </p>
      </div>

      <div className="rounded-lg border border-[var(--background-tertiary)] p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Recent Draft Picks</p>
            <p className="text-sm text-[var(--foreground-muted)]">
              Controls whether the Recent Draft Picks panel appears on the public home page.
            </p>
            {recentDraftPicksError && <p className="mt-2 text-sm text-[var(--error)]">{recentDraftPicksError}</p>}
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

      <div className="rounded-lg border border-[var(--background-tertiary)] p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Trade Block page</p>
            <p className="text-sm text-[var(--foreground-muted)]">
              Controls whether the public Trade Block page and its navigation links are available.
            </p>
            {tradeBlockError && <p className="mt-2 text-sm text-[var(--error)]">{tradeBlockError}</p>}
          </div>
          <button
            type="button"
            onClick={toggleTradeBlock}
            disabled={isPending}
            aria-pressed={tradeBlockEnabled}
            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
              tradeBlockEnabled ? "bg-green-600" : "bg-red-600"
            }`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-transform ${
                tradeBlockEnabled ? "left-7" : "left-1"
              }`}
            />
            <span className="sr-only">
              {tradeBlockEnabled ? "Hide Trade Block page" : "Show Trade Block page"}
            </span>
          </button>
        </div>
        <p className="mt-3 text-xs text-[var(--foreground-subtle)]">
          Current status: {tradeBlockEnabled ? "visible" : "hidden from public pages"}
        </p>
      </div>
    </div>
  );
}
