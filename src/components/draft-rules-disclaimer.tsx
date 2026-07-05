"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

const STORAGE_KEY = "pbo-draft-rules-disclaimer-hidden";

export function DraftRulesDisclaimer() {
  const [isHidden, setIsHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "true";
  });

  const toggleHidden = () => {
    setIsHidden((current) => {
      const next = !current;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  if (isHidden) {
    return (
      <button
        type="button"
        onClick={toggleHidden}
        className="inline-flex items-center gap-2 rounded-md border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 py-2 text-xs font-bold text-[var(--foreground-muted)] transition-colors hover:border-[var(--warning)]/50 hover:text-white"
      >
        <ChevronDown className="h-4 w-4 text-[var(--warning)]" />
        Show draft rules
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-4 py-3 text-center shadow-[0_0_18px_rgba(250,204,21,0.08)]">
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={toggleHidden}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--warning)]/30 bg-[var(--background)]/40 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground-muted)] transition-colors hover:text-white"
        >
          <ChevronUp className="h-3.5 w-3.5" />
          Hide
        </button>
      </div>
      <div>
        <p className="text-xs font-bold leading-relaxed text-[var(--foreground)] sm:text-sm">
          You have 115 points to draft 10-11 Pokemon, 0-2 Mega Pokemon. All Drafts will be mixed
          drafts (12hour timer Round 1. 4 Hour Timer for all consecutive rounds. Grace Will be
          announced once draft is done
        </p>
        <div className="my-2 h-px bg-[var(--warning)]/30" />
        <p className="font-pixel text-xs leading-relaxed text-white sm:text-sm">
          All Smogon Clauses Apply
        </p>
        <p className="mt-1 text-xs font-bold leading-relaxed text-[var(--foreground)] sm:text-sm">
          Hidden Power, Pursuit, Accupressure, Shed Tail, Last Respects, Assist Banned
        </p>
        <p className="text-xs font-bold leading-relaxed text-[var(--foreground)] sm:text-sm">
          Legacy Items Banned (All Gems except Normal, Berserk Gene, etc)
        </p>
        <p className="text-xs font-bold leading-relaxed text-[var(--foreground)] sm:text-sm">
          Z-Moves, Dmax, and Tera banned
        </p>
      </div>
    </div>
  );
}
