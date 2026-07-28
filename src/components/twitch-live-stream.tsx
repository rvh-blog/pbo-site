"use client";

import { useEffect, useId, useRef, useState } from "react";

const TWITCH_CHANNEL = "pokemonbattleorg";
const TWITCH_URL = `https://www.twitch.tv/${TWITCH_CHANNEL}`;
const TWITCH_PLAYER_SCRIPT = "https://player.twitch.tv/js/embed/v1.js";

type TwitchPlayer = {
  addEventListener: (event: string, callback: () => void) => void;
};

type TwitchPlayerConstructor = {
  new (
    elementId: string,
    options: {
      width: string;
      height: string;
      channel: string;
      parent?: string[];
      autoplay: boolean;
      muted: boolean;
    }
  ): TwitchPlayer;
  ONLINE: string;
  OFFLINE: string;
};

declare global {
  interface Window {
    Twitch?: {
      Player: TwitchPlayerConstructor;
    };
  }
}

export function TwitchLiveStream() {
  const [isLive, setIsLive] = useState(false);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerId = `twitch-player-${useId().replaceAll(":", "")}`;

  useEffect(() => {
    let cancelled = false;
    let scriptElement: HTMLScriptElement | null = null;
    const playerContainer = playerContainerRef.current;

    function createPlayer() {
      const Player = window.Twitch?.Player;
      if (!Player || !playerContainer || playerContainer.childElementCount > 0 || cancelled) return;

      const hostname = window.location.hostname;
      const player = new Player(playerId, {
        width: "100%",
        height: "100%",
        channel: TWITCH_CHANNEL,
        parent: hostname ? [hostname] : undefined,
        autoplay: false,
        muted: true,
      });

      player.addEventListener(Player.ONLINE, () => {
        if (!cancelled) setIsLive(true);
      });
      player.addEventListener(Player.OFFLINE, () => {
        if (!cancelled) setIsLive(false);
      });
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${TWITCH_PLAYER_SCRIPT}"]`
    );

    if (window.Twitch?.Player) {
      createPlayer();
    } else if (existingScript) {
      scriptElement = existingScript;
      existingScript.addEventListener("load", createPlayer);
    } else {
      const script = document.createElement("script");
      scriptElement = script;
      script.src = TWITCH_PLAYER_SCRIPT;
      script.async = true;
      script.addEventListener("load", createPlayer);
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      scriptElement?.removeEventListener("load", createPlayer);
      if (playerContainer) playerContainer.innerHTML = "";
    };
  }, [playerId]);

  return (
    <section
      aria-label="PBO Twitch livestream"
      aria-hidden={!isLive}
      className={
        isLive
          ? "order-first poke-card mx-auto w-full overflow-hidden border-[#9146ff]/50 p-0 shadow-[0_0_35px_rgba(145,70,255,0.16)] lg:w-1/2"
          : "order-last fixed left-[-10000px] top-0 h-[300px] w-[400px] overflow-hidden"
      }
    >
      {isLive && (
        <div className="flex flex-col gap-3 border-b border-[#9146ff]/30 bg-[#9146ff]/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
            </span>
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-white">PBO is live</p>
              <p className="text-xs text-[var(--foreground-muted)]">Watch the broadcast on Twitch</p>
            </div>
          </div>
          <a
            href={TWITCH_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#9146ff] px-4 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#7c3aed]"
          >
            Open Twitch
          </a>
        </div>
      )}

      <div
        id={playerId}
        ref={playerContainerRef}
        aria-hidden={!isLive}
        className={
          isLive
            ? "hidden aspect-video min-h-[300px] w-full bg-black sm:block"
            : "h-full w-full"
        }
      />
    </section>
  );
}
