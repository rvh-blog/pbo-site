"use client";

import { useState } from "react";

export function ProjectMewPromptModal({
  coachId,
  initialConfirmed,
  onComplete,
}: {
  coachId: number;
  initialConfirmed: boolean;
  onComplete: (confirmed: boolean) => void;
}) {
  const [confirmed, setConfirmed] = useState(initialConfirmed);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function savePrompt(nextConfirmed: boolean) {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/coaches/${coachId}/project-mew`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectMewConfirmed: nextConfirmed,
          projectMewPromptSeen: true,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to save Project MEW response");
        return;
      }

      onComplete(Boolean(data.projectMewConfirmed));
    } catch {
      setError("Failed to save Project MEW response");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-2xl">
        <button
          type="button"
          onClick={() => savePrompt(confirmed)}
          disabled={isSaving}
          aria-label="Close Project MEW prompt"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded border border-[var(--background-tertiary)] text-sm font-black text-[var(--foreground-muted)] transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          X
        </button>

        <div className="pr-8">
          <h2 className="font-pixel text-sm leading-6 text-white">Project MEW</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--foreground-muted)]">
            Would you like to participate in Project MEW during Season 11? Several coaches per week will be asked for their team sheets to aid in key turn evaluation on the Youtube video.
          </p>
        </div>

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background-secondary)]/80 p-3">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={isSaving}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-[var(--background-tertiary)] accent-[var(--primary)] disabled:cursor-not-allowed"
          />
          <span className="text-sm font-bold text-white">
            Confirm participation for Project MEW
          </span>
        </label>

        {error && (
          <p className="mt-3 text-xs font-bold text-[var(--error)]">{error}</p>
        )}

        <button
          type="button"
          onClick={() => savePrompt(confirmed)}
          disabled={isSaving}
          className="btn-retro-secondary mt-4 w-full px-4 py-2 text-[9px] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Save Response"}
        </button>
      </div>
    </div>
  );
}
