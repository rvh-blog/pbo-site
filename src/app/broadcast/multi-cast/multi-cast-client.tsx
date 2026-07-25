"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MultiCastGame = {
  matchId: number;
  battleUrl: string;
  label: string;
};

function gameSrc(game: MultiCastGame) {
  const params = new URLSearchParams({
    matchId: String(game.matchId),
    battleUrl: game.battleUrl,
    multiCast: "1",
  });
  return `/broadcast/overlay?${params.toString()}`;
}

function layoutStyle(count: number): React.CSSProperties {
  if (count === 1) {
    return {
      gridTemplateColumns: "1fr",
      gridTemplateRows: "1fr",
      width: "100%",
      height: "100%",
    };
  }

  if (count === 2) {
    return {
      gridTemplateColumns: "1fr 1fr",
      gridTemplateRows: "1fr",
      width: "100%",
      height: "50%",
    };
  }

  if (count === 3) {
    return {
      gridTemplateColumns: "2fr 1fr",
      gridTemplateRows: "1fr 1fr",
      width: "100%",
      height: "66.6667%",
    };
  }

  return {
    gridTemplateColumns: "1fr 1fr",
    gridTemplateRows: "1fr 1fr",
    width: "100%",
    height: "100%",
  };
}

export function MultiCastClient({ games }: { games: MultiCastGame[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const count = games.length;

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        toggleFullscreen();
      }
    }

    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [toggleFullscreen]);

  return (
    <div
      ref={containerRef}
      className="group fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[#020617]"
    >
      <div
        className="grid"
        style={{
          ...layoutStyle(count),
          gap: count === 1 ? 0 : 4,
        }}
      >
        {games.map((game, index) => (
          <div
            key={`${game.matchId}-${game.battleUrl}`}
            className="relative min-h-0 min-w-0 overflow-hidden border border-white/10 bg-black"
            style={count === 3 && index === 0 ? { gridRow: "1 / span 2" } : undefined}
          >
            <iframe
              src={gameSrc(game)}
              title={`Multi-Cast game ${index + 1}: ${game.label}`}
              className="h-full w-full border-0"
              allow="fullscreen"
            />
            {count > 1 && (
              <div className="pointer-events-none absolute right-2 top-2 z-10 rounded-md border border-white/10 bg-black/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/70">
                Game {index + 1}
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={toggleFullscreen}
        className="absolute bottom-3 right-3 z-20 flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/60 text-white/60 opacity-0 transition-all hover:bg-black/80 hover:text-white focus:opacity-100 group-hover:opacity-100"
        title={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      >
        {isFullscreen ? (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9 4 4m0 0v4m0-4h4m7 5 5-5m0 0v4m0-4h-4M9 15l-5 5m0 0v-4m0 4h4m7-5 5 5m0 0v-4m0 4h-4" />
          </svg>
        ) : (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0-5 5M4 16v4m0 0h4m-4 0 5-5m11 1v4m0 0h-4m4 0-5-5" />
          </svg>
        )}
      </button>
    </div>
  );
}
