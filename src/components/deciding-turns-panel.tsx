"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

function getDisplayLines(text: string | null) {
  const lines = text
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines && lines.length > 0
    ? lines
    : ["Turn x - x", "Turn x - x", "Turn x - x"];
}

export function DecidingTurnsPanel({
  canEdit,
  initialText,
  matchId,
}: {
  canEdit: boolean;
  initialText: string | null;
  matchId: number;
}) {
  const router = useRouter();
  const [text, setText] = useState(initialText ?? "");
  const [savedText, setSavedText] = useState(initialText ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const displayLines = useMemo(() => getDisplayLines(savedText), [savedText]);

  async function saveDecidingTurns() {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/matches/${matchId}/deciding-turns`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decidingTurnsText: text }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to save deciding turns");
        return;
      }

      setSavedText(data.decidingTurnsText ?? "");
      router.refresh();
    } catch {
      setError("Failed to save deciding turns");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded border border-white/20 bg-black/45 p-3 self-start xl:mt-20">
      <div className="text-center text-xs sm:text-sm uppercase font-black text-white tracking-wide">Deciding Turns</div>
      <div className="mt-3 space-y-2">
        {displayLines.map((line, index) => {
          const [turnLabel, ...descriptionParts] = line.split(" - ");
          const description = descriptionParts.join(" - ");

          return (
            <div key={`${line}-${index}`} className="rounded bg-white/10 px-3 py-2 text-xs text-white/85">
              {description ? (
                <>
                  <span className="font-black text-white">{turnLabel}</span>
                  <span className="text-white/60"> - </span>
                  <span>{description}</span>
                </>
              ) : (
                <span>{line}</span>
              )}
            </div>
          );
        })}
      </div>

      {canEdit && (
        <div className="mt-3 space-y-2">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Turn 4 - Gotham forces the critical trade&#10;Turn 7 - Long Island reclaims momentum"
            rows={4}
            maxLength={2000}
            className="w-full resize-y rounded border border-white/20 bg-black/40 px-3 py-2 text-xs text-white outline-none placeholder:text-white/35 focus:border-[var(--primary)]"
          />
          {error && (
            <p className="text-xs font-bold text-[var(--error)]">{error}</p>
          )}
          <button
            type="button"
            onClick={saveDecidingTurns}
            disabled={isSaving}
            className="btn-retro-secondary w-full px-3 py-2 text-[9px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Deciding Turns"}
          </button>
        </div>
      )}
    </div>
  );
}
