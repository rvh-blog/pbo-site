"use client";

import { useState } from "react";

export function ProjectMewConfirmation({
  coachId,
  initialConfirmed,
}: {
  coachId: number;
  initialConfirmed: boolean;
}) {
  const [confirmed, setConfirmed] = useState(initialConfirmed);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateConfirmation(nextConfirmed: boolean) {
    const previousConfirmed = confirmed;
    setConfirmed(nextConfirmed);
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/coaches/${coachId}/project-mew`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectMewConfirmed: nextConfirmed }),
      });
      const data = await response.json();

      if (!response.ok) {
        setConfirmed(previousConfirmed);
        setError(data.error || "Failed to update Project MEW participation");
        return;
      }

      setConfirmed(Boolean(data.projectMewConfirmed));
    } catch {
      setConfirmed(previousConfirmed);
      setError("Failed to update Project MEW participation");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background-secondary)]/80 p-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={isSaving}
          onChange={(event) => updateConfirmation(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-[var(--background-tertiary)] accent-[var(--primary)] disabled:cursor-not-allowed"
        />
        <span className="min-w-0">
          <span className="block text-xs font-bold uppercase text-white">
            Confirm participation for Project MEW
          </span>
          <span className="mt-1 block text-[11px] leading-4 text-[var(--foreground-muted)]">
            {isSaving
              ? "Saving..."
              : confirmed
                ? "Participation confirmed."
                : "Several games per week will have key turn evaluation in the YT Video."}
          </span>
        </span>
      </label>
      {error && (
        <p className="mt-2 text-xs font-bold text-[var(--error)]">{error}</p>
      )}
    </div>
  );
}
