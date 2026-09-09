"use client";

import { useEffect, useState } from "react";

export function PlayoffSpoilerToggle({ defaultHidden }: { defaultHidden: boolean }) {
  const [hidden, setHidden] = useState(defaultHidden);

  useEffect(() => {
    document.documentElement.classList.toggle("playoff-spoilers-hidden", hidden);
    return () => document.documentElement.classList.remove("playoff-spoilers-hidden");
  }, [hidden]);

  function toggle() {
    setHidden((current) => !current);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hidden}
      className="btn-retro-secondary inline-flex min-h-11 items-center gap-2 px-4 py-2 text-[10px]"
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        {hidden ? (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 4.2A10.8 10.8 0 0112 4c5 0 9.3 3.1 11 8a12.4 12.4 0 01-2.2 4M6.2 6.2A12.1 12.1 0 001 12c1.7 4.9 6 8 11 8 1.6 0 3.1-.3 4.4-.9" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zm11 3a3 3 0 100-6 3 3 0 000 6z" />
        )}
      </svg>
      {hidden ? "Reveal playoff results" : "Hide playoff spoilers"}
    </button>
  );
}
