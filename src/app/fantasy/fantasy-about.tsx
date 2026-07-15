"use client";

import { useSyncExternalStore } from "react";

const HIDDEN_KEY = "pbo-fantasy-about-hidden";

export function FantasyAbout() {
  const hidden = useSyncExternalStore(
    (onStoreChange) => {
      const onChange = () => onStoreChange();
      window.addEventListener("storage", onChange);
      window.addEventListener(HIDDEN_KEY, onChange);
      return () => {
        window.removeEventListener("storage", onChange);
        window.removeEventListener(HIDDEN_KEY, onChange);
      };
    },
    () => window.localStorage.getItem(HIDDEN_KEY) === "true",
    () => false,
  );

  function toggleHidden() {
    window.localStorage.setItem(HIDDEN_KEY, String(!hidden));
    window.dispatchEvent(new Event(HIDDEN_KEY));
  }

  if (hidden) {
    return (
      <div className="flex items-center justify-between gap-3 border-t border-[var(--background-tertiary)] pt-5">
        <span className="text-sm font-bold uppercase text-[var(--foreground-muted)]">Fantasy Scout About</span>
        <button
          type="button"
          onClick={toggleHidden}
          className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 py-2 text-xs font-bold uppercase text-[var(--foreground-muted)] transition-colors hover:text-white"
        >
          Show About
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="section-title mt-5 border-t border-[var(--background-tertiary)] pt-5">
        <div className="section-title-icon">
          <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
          </svg>
        </div>
        <h3>About</h3>
        <button
          type="button"
          onClick={toggleHidden}
          className="ml-auto rounded-lg border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 py-1.5 text-[10px] font-bold uppercase text-[var(--foreground-muted)] transition-colors hover:text-white"
        >
          Hide
        </button>
      </div>
      <div className="grid gap-3 text-sm leading-6 text-[var(--foreground-muted)] md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/50 p-3">
          <h4 className="mb-2 font-bold uppercase text-white">Build A Roster</h4>
          <p>Signed-in coaches and spectators choose exactly six unique Pokemon each week. The roster must stay within the 90-point season-price budget.</p>
        </div>
        <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/50 p-3">
          <h4 className="mb-2 font-bold uppercase text-white">Division Slots</h4>
          <p>Pick one each from Infinity, Stargazer, Sunset, Crystal, and Neon, plus one from any division. A missing season division makes that slot open.</p>
        </div>
        <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/50 p-3">
          <h4 className="mb-2 font-bold uppercase text-white">Weekly Reuse</h4>
          <p>A Pokemon from the same team cannot be reused in another week that season. The same species from a different team can still be selected.</p>
        </div>
        <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/50 p-3">
          <h4 className="mb-2 font-bold uppercase text-white">Pick Locks</h4>
          <p>Each pick locks when its team&apos;s weekly matchup starts. Other picks remain editable until their own matchups begin.</p>
        </div>
        <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/50 p-3">
          <h4 className="mb-2 font-bold uppercase text-white">Scoring</h4>
          <p>Scoring is 5 per KO, -1 per death, +2 for a team win, and -2 for a team loss.</p>
        </div>
        <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/50 p-3">
          <h4 className="mb-2 font-bold uppercase text-white">Scouting Data</h4>
          <p>Rostered percent is based on active teams in the selected season. Costs come from season prices, with roster price used as a fallback.</p>
        </div>
        <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/50 p-3">
          <h4 className="mb-2 font-bold uppercase text-white">Leaderboards</h4>
          <p>Weekly standings total that week&apos;s six picks. Overall standings add every weekly score. Ties currently favor the roster updated earlier.</p>
        </div>
        <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/50 p-3">
          <h4 className="mb-2 font-bold uppercase text-white">Weekly PBO Coin</h4>
          <p>Each completed fantasy week awards 100 PBO Coin to the top roster, 50 to second place, and 25 to third place.</p>
        </div>
      </div>
    </div>
  );
}
