"use client";

import { useState } from "react";

interface ShareButtonProps {
  title: string;
  text: string;
  path: string;
  compact?: boolean;
}

export function ShareButton({ title, text, path, compact = false }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    if (navigator.share) {
      await navigator.share({ title, text, url }).catch(() => {});
      return;
    }

    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={share}
      className={
        compact
          ? "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--background-tertiary)] px-3 text-xs font-bold text-[var(--foreground-muted)] transition-colors hover:border-[var(--foreground-subtle)] hover:text-white"
          : "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-4 text-sm font-bold text-[var(--foreground-muted)] transition-colors hover:border-[var(--primary)] hover:text-white"
      }
      aria-live="polite"
    >
      <svg
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 12v7a2 2 0 002 2h6a2 2 0 002-2v-7m-3-9 4 4m-4-4-4 4m4-4v12"
        />
      </svg>
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
