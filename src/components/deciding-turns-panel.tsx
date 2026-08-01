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
  canManageEditorVisibility,
  initialText,
  initialEditorHidden,
  initialPublished,
  matchId,
}: {
  canEdit: boolean;
  canManageEditorVisibility: boolean;
  initialText: string | null;
  initialEditorHidden: boolean;
  initialPublished: boolean;
  matchId: number;
}) {
  const router = useRouter();
  const [text, setText] = useState(initialText ?? "");
  const [savedText, setSavedText] = useState(initialText ?? "");
  const [isEditorHidden, setIsEditorHidden] = useState(initialEditorHidden);
  const [isPublished, setIsPublished] = useState(initialPublished);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isTogglingHidden, setIsTogglingHidden] = useState(false);
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
      setIsPublished(Boolean(data.decidingTurnsPublished));
      router.refresh();
    } catch {
      setError("Failed to save deciding turns");
    } finally {
      setIsSaving(false);
    }
  }

  async function togglePublished(nextPublished: boolean) {
    setIsPublishing(true);
    setError(null);

    try {
      const response = await fetch(`/api/matches/${matchId}/deciding-turns`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publishDecidingTurns: nextPublished }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to update publish status");
        return;
      }

      setIsPublished(Boolean(data.decidingTurnsPublished));
      router.refresh();
    } catch {
      setError("Failed to update publish status");
    } finally {
      setIsPublishing(false);
    }
  }

  if (!canEdit && !isPublished) {
    return null;
  }

  async function toggleEditorHidden(nextHidden: boolean) {
    setIsTogglingHidden(true);
    setError(null);

    try {
      const response = await fetch(`/api/matches/${matchId}/deciding-turns`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hideDecidingTurnsEditor: nextHidden }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to update editor visibility");
        return;
      }

      setIsEditorHidden(Boolean(data.hideDecidingTurnsEditor));
      router.refresh();
    } catch {
      setError("Failed to update editor visibility");
    } finally {
      setIsTogglingHidden(false);
    }
  }

  return (
    <div className="rounded border border-white/20 bg-black/45 p-3 self-start xl:mt-20">
      <div className="text-center text-sm uppercase font-black text-white tracking-wide">Deciding Turns</div>
      <div className="mt-3 space-y-2">
        {displayLines.map((line, index) => {
          const [turnLabel, ...descriptionParts] = line.split(" - ");
          const description = descriptionParts.join(" - ");

          return (
            <div key={`${line}-${index}`} className="rounded bg-white/10 px-3 py-2.5 text-sm text-white/85 md:py-2 md:text-xs">
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
          <div className="flex items-center justify-between gap-2 rounded border border-white/15 bg-white/5 px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-white/65">
              {isPublished ? "Published" : "Draft only"}
            </span>
            <button
              type="button"
              onClick={() => togglePublished(!isPublished)}
              disabled={isPublishing || (!isPublished && !savedText.trim())}
              className="btn-retro-secondary px-3 py-2 text-[9px] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPublishing
                ? "Updating..."
                : isPublished
                  ? "Unpublish"
                  : "Publish"}
            </button>
          </div>
          {canManageEditorVisibility && (
            <label className="flex min-h-11 items-center gap-3 rounded border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white/75 md:min-h-0 md:gap-2 md:text-[10px]">
              <input
                type="checkbox"
                checked={isEditorHidden}
                disabled={isTogglingHidden}
                onChange={(event) => toggleEditorHidden(event.target.checked)}
                className="h-5 w-5 shrink-0 accent-[var(--primary)] md:h-4 md:w-4"
              />
              Hide editor
            </label>
          )}
          {!isEditorHidden && (
            <>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Turn 4 - Gotham forces the critical trade&#10;Turn 7 - Long Island reclaims momentum"
                rows={4}
                maxLength={2000}
                className="min-h-36 w-full resize-y rounded border border-white/20 bg-black/40 px-3 py-3 text-base text-white outline-none placeholder:text-white/35 focus:border-[var(--primary)] md:min-h-0 md:py-2 md:text-xs"
              />
              <button
                type="button"
                onClick={saveDecidingTurns}
                disabled={isSaving}
                className="btn-retro-secondary sticky bottom-[calc(.5rem+env(safe-area-inset-bottom))] z-20 w-full px-3 py-3 text-xs shadow-[0_-8px_24px_rgba(0,0,0,0.55)] disabled:cursor-not-allowed disabled:opacity-50 md:static md:py-2 md:text-[9px] md:shadow-none"
              >
                {isSaving ? "Saving..." : "Save Draft"}
              </button>
            </>
          )}
          {error && (
            <p className="text-xs font-bold text-[var(--error)]">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
