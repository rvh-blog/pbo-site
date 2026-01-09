"use client";

import { useState } from "react";

interface CopyTeamButtonProps {
  pokemonNames: string[];
}

export function CopyTeamButton({ pokemonNames }: CopyTeamButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    // Join with newlines so each Pokemon goes on a separate row when pasted into spreadsheet
    const text = pokemonNames.join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] hover:border-[var(--primary)] transition-colors text-xs font-bold"
      title="Copy team names (one per line for spreadsheet)"
    >
      {copied ? (
        <>
          <svg className="w-4 h-4 text-[var(--success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-[var(--success)]">Copied!</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span>Export</span>
        </>
      )}
    </button>
  );
}
