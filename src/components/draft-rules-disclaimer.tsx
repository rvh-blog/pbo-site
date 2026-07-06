"use client";

import { useSyncExternalStore } from "react";
import { ChevronDown, ChevronUp, ScrollText } from "lucide-react";

const STORAGE_KEY = "pbo-draft-rules-disclaimer-hidden";
const CHANGE_EVENT = "pbo-draft-rules-disclaimer-change";

function subscribeToHidden(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

export function DraftRulesDisclaimer() {
  // useSyncExternalStore keeps SSR and hydration consistent: the server
  // snapshot is always "visible", and the stored preference applies on the
  // client without a hydration mismatch.
  const isHidden = useSyncExternalStore(
    subscribeToHidden,
    () => localStorage.getItem(STORAGE_KEY) === "true",
    () => false
  );

  const toggleHidden = () => {
    localStorage.setItem(STORAGE_KEY, String(!isHidden));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  if (isHidden) {
    return (
      <button
        type="button"
        onClick={toggleHidden}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--foreground-muted)] transition-colors hover:text-white"
      >
        <ScrollText className="h-3.5 w-3.5 text-[var(--warning)]" />
        Draft rules
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--warning)]/25 border-l-2 border-l-[var(--warning)] bg-[var(--warning)]/[0.06] px-3 py-2.5 sm:px-4 sm:py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--warning)]">
          <ScrollText className="h-4 w-4 shrink-0" />
          <span className="truncate">Draft Rules · All Smogon Clauses Apply</span>
        </p>
        <button
          type="button"
          onClick={toggleHidden}
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground-subtle)] transition-colors hover:text-white"
        >
          <ChevronUp className="h-3.5 w-3.5" />
          Hide
        </button>
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--foreground)]">
        You have 115 points to draft 10-11 Pokemon, 0-2 Mega Pokemon. All drafts are mixed drafts:
        12-hour timer in round 1, 4-hour timer for all later rounds. Grace will be announced once
        the draft is done.
      </p>
      <ul className="mt-2 space-y-1 border-t border-[var(--warning)]/20 pt-2 text-[13px] leading-relaxed text-[var(--foreground)]">
        <li>
          <span className="font-bold text-[var(--warning)]">Banned moves:</span> Hidden Power,
          Pursuit, Acupressure, Shed Tail, Last Respects, Assist
        </li>
        <li>
          <span className="font-bold text-[var(--warning)]">Banned items:</span> Legacy items
          (all Gems except Normal, Berserk Gene, etc)
        </li>
        <li>
          <span className="font-bold text-[var(--warning)]">Banned mechanics:</span> Z-Moves,
          Dmax, and Tera
        </li>
      </ul>
    </div>
  );
}
