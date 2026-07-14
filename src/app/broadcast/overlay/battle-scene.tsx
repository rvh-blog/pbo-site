"use client";

import { useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from "react";

/* ═══════════════════════════════════════════════
   Showdown Client Renderer
   ═══════════════════════════════════════════════

   Loads the open-source Pokemon Showdown client renderer and receives
   battle protocol lines from the hook via an imperative API.  No WebSocket
   connection — the hook owns the single WS and forwards raw lines here.

   The scripts are loaded once and cached by the browser. Teambuilder tables
   are required because modded formats (including Champions) read their
   species, move, item, and ability overrides during battle playback.
   ═══════════════════════════════════════════════ */

const SHOWDOWN = "https://play.pokemonshowdown.com";

// Load order matters — dependencies before dependents
const SCRIPTS = [
  // Libraries
  `${SHOWDOWN}/js/lib/jquery-1.11.0.min.js`,
  `${SHOWDOWN}/js/lib/html-sanitizer-minified.js`,
  // Data files (CommonJS — need exports/module globals, see setupCjsShim)
  `${SHOWDOWN}/data/pokedex-mini.js`,
  `${SHOWDOWN}/data/pokedex-mini-bw.js`,
  `${SHOWDOWN}/data/pokedex.js`,
  `${SHOWDOWN}/data/moves.js`,
  `${SHOWDOWN}/data/abilities.js`,
  `${SHOWDOWN}/data/items.js`,
  `${SHOWDOWN}/data/teambuilder-tables.js`,
  // Core engine (load order: deps before dependents)
  `${SHOWDOWN}/js/battle-sound.js`,
  `${SHOWDOWN}/js/battledata.js`,           // Dex, toID
  `${SHOWDOWN}/js/battle-tooltips.js`,
  `${SHOWDOWN}/data/graphics.js`,           // BattleEffects data
  `${SHOWDOWN}/data/text.js`,               // BattleText (needed by BattleTextParser)
  `${SHOWDOWN}/js/battle-text-parser.js`,   // BattleTextParser (needed by BattleLog)
  `${SHOWDOWN}/js/battle-scene-stub.js`,    // BattleSceneStub (fallback)
  `${SHOWDOWN}/js/battle-log.js`,           // BattleLog (needed by BattleScene)
  `${SHOWDOWN}/js/battle-animations.js`,    // BattleScene, Sprite, PokemonSprite
  `${SHOWDOWN}/js/battle-animations-moves.js`, // Move animations
  `${SHOWDOWN}/js/battle.js`,               // Battle (uses all of the above)
];

/* ─── Script/CSS loader helpers ─── */

let scriptsLoaded = false;
let scriptsLoading: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load: ${src}`));
    document.head.appendChild(el);
  });
}

function loadCSS(href: string) {
  if (!document.querySelector(`link[href="${href}"]`)) {
    const el = document.createElement("link");
    el.rel = "stylesheet";
    el.href = href;
    document.head.appendChild(el);
  }
}

/**
 * Showdown's data/engine files are compiled as CommonJS (`exports.Foo = …`).
 * In a browser <script> tag `exports` is undefined, so they crash.
 *
 * We provide `window.exports` as a Proxy that mirrors every assignment
 * onto `window` itself, so `exports.BattlePokedex = {…}` also sets
 * `window.BattlePokedex` — which is where Dex looks it up at runtime.
 *
 * IMPORTANT: We intentionally do NOT set `window.module`.  Libraries like
 * jQuery check `typeof module === "object"` to decide between CommonJS
 * and browser paths.  If `module` exists they skip setting `window.jQuery`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setupCjsShim(w: any) {
  if (w.__cjsShimInstalled) return;
  const handler: ProxyHandler<Record<string, unknown>> = {
    set(target, prop, value) {
      target[prop as string] = value;
      if (typeof prop === "string" && prop !== "__esModule") {
        w[prop] = value;
      }
      return true;
    },
    defineProperty(target, prop, desc) {
      Object.defineProperty(target, prop, desc);
      if (typeof prop === "string" && prop !== "__esModule" && "value" in desc) {
        w[prop] = desc.value;
      }
      return true;
    },
  };
  w.exports = new Proxy({} as Record<string, unknown>, handler);
  w.global = w; // some Showdown files assign to global.X for Node compat
  w.__cjsShimInstalled = true;
}

/** Load all Showdown scripts once (idempotent). */
async function ensureShowdownLoaded(): Promise<void> {
  if (scriptsLoaded) return;
  if (scriptsLoading) return scriptsLoading;

  scriptsLoading = (async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;

    // ── CommonJS shim ──
    // Showdown's data files are compiled as CommonJS modules that assign
    // to `exports`.  We provide a Proxy so every `exports.Foo = ...`
    // also mirrors the value onto `window.Foo` (where Dex looks it up).
    setupCjsShim(w);

    // ── Config — tells Showdown where to find sprites and assets ──
    if (!w.Config) {
      w.Config = {
        routes: {
          client: "play.pokemonshowdown.com",
          dex: "dex.pokemonshowdown.com",
          replays: "replay.pokemonshowdown.com",
        },
        defaultserver: "showdown",
      };
    }

    // ── Stubs for optional data Showdown references ──
    // BattleTeambuilderTable is populated by teambuilder-tables.js above.
    // The temporary object keeps earlier core scripts safe while loading.
    w.BattleTeambuilderTable ??= {};
    w.BattleFormats ??= {};
    w.BattleAliases ??= {};
    w.BattleTypeChart ??= {};
    w.BattlePokedexAltForms ??= {};

    // ── PS prefs stub (battle-sound.js calls PS.prefs.subscribeAndRun) ──
    if (!w.PS) {
      w.PS = {
        prefs: {
          get() { return undefined; },
          set() {},
          subscribeAndRun(cb: (key: string | null) => void) { try { cb(null); } catch {} },
        },
      };
    }

    // ── CSS ──
    loadCSS(`${SHOWDOWN}/style/battle.css`);

    // ── Scripts (sequential — each depends on the previous) ──
    for (const src of SCRIPTS) {
      await loadScript(src);
    }

    // A missing mod table makes Showdown fail later with a misleading
    // `overrideAbilityData` error and stops all scene playback.
    if (!w.BattleTeambuilderTable?.champions) {
      throw new Error("Showdown Champions teambuilder data failed to load");
    }

    // Mute all battle sounds
    try { w.BattleSound?.setMute?.(true); } catch {}

    scriptsLoaded = true;
  })();

  return scriptsLoading;
}

/* ─── Animation-complete detection ─── */

let pollTimer: ReturnType<typeof setInterval> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pollForQueueEnd(battle: any) {
  // Clear any existing poll so we don't stack them
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    // atQueueEnd is true when Showdown has finished processing all queued steps
    if (battle.atQueueEnd) {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    }
  }, 100);
}

/** Wait for the battle engine to finish its current animation queue.
 *  Waits a short fixed delay (100ms) so Showdown has time to start
 *  processing the newly added lines (atQueueEnd flips to false), then
 *  polls for atQueueEnd to become true (animations finished). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function waitForAnimations(battle: any, isCancelled: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    if (isCancelled()) { resolve(); return; }
    // Give Showdown time to pick up the queued lines and start animating
    setTimeout(() => {
      if (isCancelled()) { resolve(); return; }
      // Now poll for animations to finish (atQueueEnd → true)
      const waitForEnd = setInterval(() => {
        if (isCancelled() || battle.atQueueEnd) {
          clearInterval(waitForEnd);
          resolve();
        }
      }, 80);
    }, 100);
  });
}

/**
 * Detect end-of-turn residual/system lines (weather upkeep, status damage,
 * item healing, etc.).  Must be conservative — mid-move effects like Life Orb
 * recoil, Rough Skin, drain healing etc. are NOT residual.
 */
function isResidualLine(line: string): boolean {
  if (line === "|upkeep") return true;
  if (line.startsWith("|-weather|") && line.includes("[upkeep]")) return true;
  // Status damage: burn, poison, toxic — always end-of-turn
  if (line.startsWith("|-damage|") && line.includes("[from] ")) {
    const lower = line.toLowerCase();
    if (lower.includes("[from] brn") || lower.includes("[from] psn") || lower.includes("[from] tox")
      || lower.includes("[from] sandstorm") || lower.includes("[from] hail")
      || lower.includes("[from] snow") || lower.includes("[from] leech seed")
      || lower.includes("[from] curse") || lower.includes("[from] nightmare")) return true;
  }
  // Leftovers / Black Sludge healing — always end-of-turn
  if (line.startsWith("|-heal|") && line.includes("[from] ")) {
    const lower = line.toLowerCase();
    if (lower.includes("[from] item: leftovers") || lower.includes("[from] item: black sludge")
      || lower.includes("[from] grassy terrain") || lower.includes("[from] aqua ring")
      || lower.includes("[from] ingrain")) return true;
  }
  // End-of-turn status from items (Toxic Orb, Flame Orb)
  if (line.startsWith("|-status|") && line.includes("[from] item:")) return true;
  return false;
}

/**
 * Feed protocol lines to the battle engine in phases, splitting at |move|
 * boundaries and residual/system effect boundaries.  After each phase's
 * animations finish we call the onPhaseDone callback so the hook can
 * advance its state incrementally (HP bars, statuses, kills) in sync
 * with the visuals.
 *
 * Typical phases for a turn: [move 1 effects] → [move 2 effects] → [residual effects]
 *
 * Returns the number of phases fed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function feedLinesInPhases(
  battle: any,
  lines: string[],
  isCancelled: () => boolean,
  onPhaseDone?: () => void
): Promise<number> {
  // Split lines into groups at |move| boundaries, drop empty groups
  const movePhases: string[][] = [[]];
  for (const line of lines) {
    if (line.startsWith("|move|") && movePhases[movePhases.length - 1].length > 0) {
      movePhases.push([line]);
    } else {
      movePhases[movePhases.length - 1].push(line);
    }
  }

  // Further split the last phase at the first residual line to create a
  // separate residual phase (weather damage, status damage, Leftovers, etc.)
  const allPhases: string[][] = [];
  for (let i = 0; i < movePhases.length; i++) {
    if (i < movePhases.length - 1) {
      allPhases.push(movePhases[i]);
    } else {
      // Last phase — try to split at first residual line
      const lastPhase = movePhases[i];
      let residualIdx = -1;
      for (let j = 0; j < lastPhase.length; j++) {
        if (isResidualLine(lastPhase[j])) {
          residualIdx = j;
          break;
        }
      }
      if (residualIdx > 0) {
        allPhases.push(lastPhase.slice(0, residualIdx));
        allPhases.push(lastPhase.slice(residualIdx));
      } else {
        allPhases.push(lastPhase);
      }
    }
  }

  const phases = allPhases.filter((p) => p.length > 0);
  if (phases.length === 0) return 0;

  for (let i = 0; i < phases.length; i++) {
    if (isCancelled()) return i;

    // Feed this phase's lines to the renderer
    for (const line of phases[i]) {
      battle.add(line);
    }

    // Wait for this phase's animations to finish before feeding the next
    if (i < phases.length - 1) {
      await waitForAnimations(battle, isCancelled);
      if (!isCancelled()) {
        onPhaseDone?.();
      }
    }
  }

  // After the last phase, poll for overall completion
  if (!isCancelled()) {
    pollForQueueEnd(battle);
  }

  return phases.length;
}

/* ═══════════════════════════════════════════════
   BattleScene Component
   ═══════════════════════════════════════════════ */

// Showdown renders into a 640×360 container.  We scale it up to
// fill the ~1200px center area of the overlay (1920 − 2×360 panels).
// The parent container is sized to the exact scaled dimensions so
// there's no dead space.
const BATTLE_W = 640;
const BATTLE_H = 360;
const CONTAINER_W = 1200;

export interface ChatLogEntry {
  user: string;
  message: string;
  /** Turn number (0 = before Turn 1) */
  turn: number;
  /** Position within the turn: count of non-chat protocol lines since the
   *  turn header (0 = immediately after the turn counter) */
  posInTurn: number;
  /** True if captured during live play — renders at end immediately.
   *  Flipped to false when entering playback mode. */
  live: boolean;
}

export interface BattleSceneHandle {
  seekTurn(n: number): void;
  pause(): void;
  play(): void;
  setSpeed(speed: number): void;
  getCurrentTurn(): number;
  getMaxTurn(): number;
  isAnimating(): boolean;
  /** Feed raw protocol lines with phased animation (for live play).
   *  Returns a promise that resolves when all phases are done.
   *  Calls onPhaseDone for each intermediate phase boundary. */
  addLines(lines: string[], onPhaseDone?: () => void): Promise<void>;
  /** Feed raw protocol lines immediately without animation (for catch-up/seek). */
  addLinesImmediate(lines: string[]): void;
  /** Returns whether the Battle object has been created and is ready to receive lines. */
  isReady(): boolean;
  getLogElement(): HTMLDivElement | null;
  getChatLog(): ChatLogEntry[];
}

interface BattleSceneProps {
  roomId: string;
  variant?: "contained" | "fullscreen";
  onReady?: () => void;
  onTurnUpdate?: (maxTurn: number) => void;
}

export const BattleScene = forwardRef<BattleSceneHandle, BattleSceneProps>(
  function BattleScene({ roomId, variant = "contained", onReady, onTurnUpdate }, ref) {
  const frameRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const battleObjRef = useRef<any>(null);
  const maxTurnRef = useRef(0);
  const chatLogRef = useRef<ChatLogEntry[]>([]);
  const chatTurnRef = useRef(0);
  const chatPosRef = useRef(0);
  const onTurnUpdateRef = useRef(onTurnUpdate);
  onTurnUpdateRef.current = onTurnUpdate;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const cancelledRef = useRef(false);
  // Serialize addLines calls so concurrent WS messages don't interleave
  const addLinesQueueRef = useRef<Promise<void>>(Promise.resolve());

  /** Extract chat from raw lines, track turns, return battle-only lines */
  const processRawLines = useCallback((allLines: string[], markLive: boolean): string[] => {
    const battleLines: string[] = [];
    for (const line of allLines) {
      const turnMatch = line.match(/^\|turn\|(\d+)$/);
      if (turnMatch) {
        const turnNum = parseInt(turnMatch[1], 10);
        if (turnNum > maxTurnRef.current) {
          maxTurnRef.current = turnNum;
          onTurnUpdateRef.current?.(turnNum);
        }
        chatTurnRef.current = turnNum;
        chatPosRef.current = 0;
        battleLines.push(line);
        continue;
      }

      if (line.startsWith("|c|") || line.startsWith("|c:|") || line.startsWith("|chat|")) {
        const parts = line.split("|");
        let user: string, message: string;
        if (parts[1] === "c:") {
          user = parts[3] || "";
          message = parts.slice(4).join("|");
        } else {
          user = parts[2] || "";
          message = parts.slice(3).join("|");
        }
        if (user) {
          chatLogRef.current.push({
            user,
            message,
            turn: chatTurnRef.current,
            posInTurn: chatPosRef.current,
            live: markLive,
          });
        }
      } else {
        battleLines.push(line);
        const cmd = line.split("|")[1] ?? "";
        if (cmd !== "") chatPosRef.current++;
      }
    }
    return battleLines;
  }, []);

  useImperativeHandle(ref, () => ({
    seekTurn(n: number) {
      if (battleObjRef.current) {
        // Entering playback — all chats switch to position-matched mode
        for (const c of chatLogRef.current) c.live = false;
        battleObjRef.current.seekTurn(n);
      }
    },
    pause() {
      if (battleObjRef.current) {
        battleObjRef.current.pause();
      }
    },
    play() {
      if (battleObjRef.current) {
        battleObjRef.current.play();
        pollForQueueEnd(battleObjRef.current);
      }
    },
    setSpeed(speed: number) {
      if (battleObjRef.current) {
        // Showdown's BattleScene divides animation durations by `acceleration`.
        // speed=2 means 2x faster, so acceleration=2.
        if (battleObjRef.current.scene) {
          battleObjRef.current.scene.acceleration = speed;
        }
      }
    },
    getCurrentTurn(): number {
      return battleObjRef.current?.turn ?? 0;
    },
    getMaxTurn(): number {
      return maxTurnRef.current;
    },
    isAnimating(): boolean {
      return battleObjRef.current ? !battleObjRef.current.atQueueEnd : false;
    },
    addLines(lines: string[], onPhaseDone?: () => void): Promise<void> {
      if (!battleObjRef.current) return Promise.resolve();
      const battleLines = processRawLines(lines, true);
      if (battleLines.length === 0) return Promise.resolve();
      // Chain onto previous addLines call to prevent concurrent animation interleaving
      const prev = addLinesQueueRef.current;
      const next = prev.then(() =>
        feedLinesInPhases(battleObjRef.current!, battleLines, () => cancelledRef.current, onPhaseDone).then(() => {})
      );
      addLinesQueueRef.current = next;
      return next;
    },
    addLinesImmediate(lines: string[]) {
      if (!battleObjRef.current) return;
      const battleLines = processRawLines(lines, false);
      for (const line of battleLines) {
        battleObjRef.current.add(line);
      }
    },
    isReady(): boolean {
      return battleObjRef.current !== null;
    },
    getLogElement(): HTMLDivElement | null {
      return logRef.current;
    },
    getChatLog(): ChatLogEntry[] {
      return chatLogRef.current;
    },
  }));

  useEffect(() => {
    if (!frameRef.current || !logRef.current || !roomId) return;

    cancelledRef.current = false;

    async function boot() {
      try {
        await ensureShowdownLoaded();
      } catch (e) {
        console.error("[BattleScene] Failed to load Showdown scripts:", e);
        return;
      }
      if (cancelledRef.current || !frameRef.current || !logRef.current) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      const $ = w.jQuery;
      const BattleCtor = w.Battle;

      if (!$ || !BattleCtor) {
        console.error("[BattleScene] Showdown scripts failed to expose jQuery / Battle");
        return;
      }

      // Verify rendering dependencies loaded
      if (!w.BattleScene) {
        console.error("[BattleScene] BattleScene class not loaded — battle-animations.js may have failed");
        return;
      }

      // Clear any leftover DOM from a previous battle
      frameRef.current.innerHTML = "";

      let battle;
      try {
        battle = new BattleCtor({
          $frame: $(frameRef.current),
          $logFrame: $(logRef.current),
          id: roomId,
          paused: false,
          autoresize: false,
        });
      } catch (e) {
        console.error("[BattleScene] Battle constructor threw:", e);
        return;
      }
      battleObjRef.current = battle;
      console.log("[BattleScene] Battle created for room:", roomId);

      // Notify the hook that we're ready to receive lines
      onReadyRef.current?.();
    }

    boot();

    return () => {
      cancelledRef.current = true;
      if (battleObjRef.current) {
        try { battleObjRef.current.destroy?.(); } catch {}
        battleObjRef.current = null;
      }
      if (frameRef.current) frameRef.current.innerHTML = "";
    };
  }, [roomId]);

  const fullscreen = variant === "fullscreen";
  const scale = (fullscreen ? 1920 : CONTAINER_W) / BATTLE_W;

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: fullscreen ? "transparent" : "#111" }}>
      {fullscreen && <style>{`.showdown-frame .turn { margin-left: 12px; }`}</style>}
      {/* Showdown renders the battle scene into this div.
          The "showdown-frame" class resets Tailwind preflight so
          Showdown's own CSS works correctly. */}
      <div
        ref={frameRef}
        className="showdown-frame"
        style={{
          width: BATTLE_W,
          height: BATTLE_H,
          position: "absolute",
          top: 0,
          left: fullscreen ? -2 : 0,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      />
      {/* Hidden log frame (required by Showdown's Battle constructor) */}
      <div ref={logRef} style={{ position: "absolute", left: -9999, top: -9999, width: 1, height: 1, overflow: "hidden" }} />
    </div>
  );
});
