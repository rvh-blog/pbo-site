"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { parseMessages, type BattleEvent } from "@/lib/battle-event-parser";
import type { BattleSceneHandle } from "@/app/broadcast/overlay/battle-scene";
import { serializedPokemonAliasLookupKeys } from "@/lib/pokemon-name-client";
import { rosterPokemonMatchesKeys } from "@/lib/broadcast-pokemon-matching";
import { extractShowdownRoomId } from "@/lib/showdown-room";
import type { SerializedPokemonAliasMaps } from "@/lib/pokemon-name-aliases";

export interface RosterPokemon {
  pokemonId: number;
  name: string;
  displayName: string;
  spriteUrl: string | null;
  types: string[];
  isTeraCaptain: boolean;
  nameAliases?: string[] | null;
  lookupKeys?: string[] | null;
}

/** Per-Pokemon state tracked throughout the battle */
export interface PokemonBattleState {
  /** Normalized species name (matches roster) */
  species: string;
  /** Nickname used in battle (may differ from species) */
  nickname: string;
  /** Raw battle form name from Showdown (e.g. "Palafin-Hero", "Aegislash-Blade") */
  battleForm: string;
  /** Pokemon level (defaults to 100 if not specified) */
  level: number;
  /** Current HP (0-100 scale from Showdown) */
  hp: number;
  maxHp: number;
  /** Fainted? */
  fainted: boolean;
  /** Status condition: brn, par, slp, frz, psn, tox, or null */
  status: string | null;
  /** Stat boost stages: -6 to +6 */
  boosts: Record<string, number>;
  /** Moves used so far */
  movesUsed: string[];
  /** Revealed ability (null if not yet revealed) */
  ability: string | null;
  /** Revealed item (null if not yet revealed) */
  item: string | null;
  /** Item was consumed/knocked off */
  itemConsumed: boolean;
  /** Whether this Pokemon was brought to the battle (seen in team preview or switched in) */
  brought: boolean;
  /** Whether this Pokemon is currently on the field */
  active: boolean;
  /** Number of KOs this Pokemon has scored */
  kills: number;
  /** Whether this Pokemon has terastallized */
  terastallized: boolean;
  /** The type this Pokemon terastallized into (e.g. "Fire", "Water") */
  teraType: string | null;
}

export interface SideConditions {
  reflect: boolean;
  lightScreen: boolean;
  auroraVeil: boolean;
  stealthRock: boolean;
  spikes: number;
  toxicSpikes: number;
  stickyWeb: boolean;
  tailwind: boolean;
}

function createSideConditions(): SideConditions {
  return { reflect: false, lightScreen: false, auroraVeil: false, stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, tailwind: false };
}

export interface BattleState {
  connected: boolean;
  turn: number;
  p1Username: string;
  p2Username: string;
  p1Avatar: string | null;
  p2Avatar: string | null;
  /** Per-Pokemon state keyed by normalized species name */
  p1Pokemon: Map<string, PokemonBattleState>;
  p2Pokemon: Map<string, PokemonBattleState>;
  p1Kills: number;
  p2Kills: number;
  p1IsTeam1: boolean | null;
  /** Whether p1 has used their terastallization */
  p1TeraUsed: boolean;
  /** Whether p2 has used their terastallization */
  p2TeraUsed: boolean;
  chat: { user: string; message: string; timestamp: number }[];
  winner: "p1" | "p2" | null;
  lastMove: { player: "p1" | "p2"; moveName: string } | null;
  /** Timestamp when the battle started (after team preview), null if not yet started */
  battleStartTime: number | null;
  /** Active weather condition (null = none) */
  weather: string | null;
  /** Active terrain condition (null = none) */
  terrain: string | null;
  /** Side conditions for p1 */
  p1Side: SideConditions;
  /** Side conditions for p2 */
  p2Side: SideConditions;
}

const SHOWDOWN_SERVERS = ["sim3.psim.us", "sim2.psim.us", "sim1.psim.us"];
const RECONNECT_DELAY = 3000;
const MAX_CHAT_MESSAGES = 100;

/* ═══════════════════════════════════════════════
   Kill Attribution Tracking
   (Ported from src/app/api/replay-scrape/route.ts)
   ═══════════════════════════════════════════════ */

interface KillTracker {
  player: "p1" | "p2";
  nickname: string;
  move?: string;
}

interface KillTracking {
  lastDamageDealer: KillTracker | null;
  lastMoveUsed: { player: "p1" | "p2"; nickname: string; moveName: string } | null;
  lastFaintSource: string | null;
  contactDamageSource: KillTracker | null;
  pendingFaint: { player: "p1" | "p2"; nickname: string } | null;
  justSwitchedIn: Set<string>;
  p1ActiveNickname: string | null;
  p2ActiveNickname: string | null;
  hazardSetters: Map<string, KillTracker>;
  spikesLayers: { p1: KillTracker[]; p2: KillTracker[] };
  weatherSetter: KillTracker | null;
  statusInflictors: Map<string, KillTracker>;
  effectInflictors: Map<string, KillTracker>;
  futureAttacks: Map<string, KillTracker>;
  hpBeforeSpikes: number | null;
}

function createKillTracking(): KillTracking {
  return {
    lastDamageDealer: null,
    lastMoveUsed: null,
    lastFaintSource: null,
    contactDamageSource: null,
    pendingFaint: null,
    justSwitchedIn: new Set(),
    p1ActiveNickname: null,
    p2ActiveNickname: null,
    hazardSetters: new Map(),
    spikesLayers: { p1: [], p2: [] },
    weatherSetter: null,
    statusInflictors: new Map(),
    effectInflictors: new Map(),
    futureAttacks: new Map(),
    hpBeforeSpikes: null,
  };
}

/* ═══════════════════════════════════════════════ */

function createInitialState(): BattleState {
  return {
    connected: false,
    turn: 0,
    p1Username: "",
    p2Username: "",
    p1Avatar: null,
    p2Avatar: null,
    p1Pokemon: new Map(),
    p2Pokemon: new Map(),
    p1Kills: 0,
    p2Kills: 0,
    p1IsTeam1: null,
    p1TeraUsed: false,
    p2TeraUsed: false,
    chat: [],
    winner: null,
    lastMove: null,
    battleStartTime: null,
    weather: null,
    terrain: null,
    p1Side: createSideConditions(),
    p2Side: createSideConditions(),
  };
}

function createPokemonState(species: string, nickname: string, battleForm?: string, level?: number): PokemonBattleState {
  return {
    species,
    nickname,
    battleForm: battleForm || species,
    level: level ?? 100,
    hp: 100,
    maxHp: 100,
    fainted: false,
    status: null,
    boosts: {},
    movesUsed: [],
    ability: null,
    item: null,
    itemConsumed: false,
    brought: false,
    active: false,
    kills: 0,
    terastallized: false,
    teraType: null,
  };
}

/** Get or create a Pokemon state entry, looking up by nickname */
function getByNickname(
  map: Map<string, PokemonBattleState>,
  nicknameMap: Map<string, string>,
  nickname: string
): PokemonBattleState | null {
  const species = nicknameMap.get(nickname);
  if (!species) return null;
  return map.get(species) || null;
}

export interface ShowdownBattleControls extends BattleState {
  seekToTurn: (n: number) => void;
  goLive: () => void;
  setPaused: (paused: boolean) => void;
  maxTurn: number;
  reviewingTurn: number | null;
  isPaused: boolean;
  /** Play a single turn's events in phases (for playback advancement) */
  playTurnPhased: (n: number) => void;
  /** Called by BattleScene when it's ready to receive lines */
  onBattleSceneReady: () => void;
  /** Forward any raw lines BattleScene hasn't seen yet (call before seek/playback) */
  syncBattleScene: () => void;
}

/* ═══════════════════════════════════════════════
   Phase Splitting
   ═══════════════════════════════════════════════
   Splits a turn's events into animation phases:
   - Phase 0: Pre-move events (switches at turn start, etc.)
   - Phase 1+: Each |move| and its consequences (damage, faint, status)
   - Final phase: End-of-turn events (weather, status damage) after last move's consequences
*/

/**
 * Detect end-of-turn residual/system events (weather upkeep, status damage,
 * item healing, etc.).  Must be conservative — mid-move effects like Life Orb
 * recoil, Rough Skin, drain healing etc. are NOT residual.
 */
function isResidualEvent(evt: BattleEvent): boolean {
  if (evt.type === "weather" && evt.isUpkeep) return true;
  // Status damage: burn, poison, toxic, weather, leech seed, curse — always end-of-turn
  if (evt.type === "damage" && evt.fromSource) {
    const src = evt.fromSource.toLowerCase();
    if (src.includes("brn") || src.includes("psn") || src.includes("tox")
      || src.includes("sandstorm") || src.includes("hail") || src.includes("snow")
      || src.includes("leech seed") || src.includes("curse") || src.includes("nightmare")) return true;
  }
  // Leftovers / Black Sludge / terrain healing — always end-of-turn
  if (evt.type === "heal" && evt.fromSource) {
    const src = evt.fromSource.toLowerCase();
    if (src.includes("leftovers") || src.includes("black sludge")
      || src.includes("grassy terrain") || src.includes("aqua ring")
      || src.includes("ingrain")) return true;
  }
  // End-of-turn status from items (Toxic Orb, Flame Orb)
  if (evt.type === "status" && evt.fromSource?.toLowerCase().includes("item:")) return true;
  return false;
}

function splitEventsIntoPhases(events: BattleEvent[]): BattleEvent[][] {
  // First split at |move| boundaries
  const movePhases: BattleEvent[][] = [];
  let currentPhase: BattleEvent[] = [];

  for (const evt of events) {
    if (evt.type === "move") {
      if (currentPhase.length > 0) {
        movePhases.push(currentPhase);
      }
      currentPhase = [evt];
    } else {
      currentPhase.push(evt);
    }
  }
  if (currentPhase.length > 0) {
    movePhases.push(currentPhase);
  }

  // Further split the last phase at the first residual event
  const phases: BattleEvent[][] = [];
  for (let i = 0; i < movePhases.length; i++) {
    if (i < movePhases.length - 1) {
      phases.push(movePhases[i]);
    } else {
      const lastPhase = movePhases[i];
      let residualIdx = -1;
      for (let j = 0; j < lastPhase.length; j++) {
        if (isResidualEvent(lastPhase[j])) {
          residualIdx = j;
          break;
        }
      }
      if (residualIdx > 0) {
        phases.push(lastPhase.slice(0, residualIdx));
        phases.push(lastPhase.slice(residualIdx));
      } else {
        phases.push(lastPhase);
      }
    }
  }

  return phases;
}

export function useShowdownBattle(
  battleUrl: string | null,
  team1Roster: RosterPokemon[],
  team2Roster: RosterPokemon[],
  battleSceneRef: React.RefObject<BattleSceneHandle | null>,
  pokemonNameAliases?: SerializedPokemonAliasMaps | null
): ShowdownBattleControls {
  const [state, setState] = useState<BattleState>(createInitialState);
  const wsRef = useRef<WebSocket | null>(null);
  const serverIndexRef = useRef(0);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Nickname-to-species mapping (built from switch events)
  const nicknameMapRef = useRef<{ p1: Map<string, string>; p2: Map<string, string> }>({
    p1: new Map(),
    p2: new Map(),
  });

  // Team preview pokemon (from |poke| events)
  const teamPreviewRef = useRef<{ p1: string[]; p2: string[] }>({ p1: [], p2: [] });

  // Kill attribution tracking (mutable ref, not part of React state)
  const ktRef = useRef<KillTracking>(createKillTracking());

  // Track whether the initial catch-up log has finished (first |turn| received)
  const caughtUpRef = useRef(false);

  // Track whether the first room message has been received (for BattleScene forwarding).
  // The first message is the initial state dump and should use addLinesImmediate.
  // All subsequent messages are live and should use addLines (phased animation).
  const receivedRoomInitRef = useRef(false);

  // Raw lines queued before BattleScene is ready
  const pendingRawLinesRef = useRef<string[][]>([]);
  const battleSceneReadyRef = useRef(false);
  // Track which turn groups have been forwarded to BattleScene
  // (index into allRawLinesRef — everything before this index has been sent)
  const battleSceneForwardedUpToRef = useRef(0);

  // ── Playback control state ──
  // Events grouped by turn index: index 0 = pre-battle, index N = turn N events
  const allEventsRef = useRef<BattleEvent[][]>([[]]);
  // Raw lines grouped by turn index (parallel to allEventsRef, for BattleScene forwarding)
  const allRawLinesRef = useRef<string[][]>([[]]);
  const currentTurnGroupRef = useRef(0);
  const [maxTurn, setMaxTurn] = useState(0);
  const [reviewingTurn, setReviewingTurn] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const reviewingTurnRef = useRef<number | null>(null);

  // ── Phase queue for incremental UI updates within a turn (playback only) ──
  const phaseQueueRef = useRef<BattleEvent[][]>([]);
  const phaseTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resolveTeamMapping = useCallback(() => {
    const p1Pokemon = teamPreviewRef.current.p1;
    if (p1Pokemon.length === 0 || team1Roster.length === 0) return null;

    let p1MatchesTeam1 = 0;
    let p1MatchesTeam2 = 0;

    for (const pokeName of teamPreviewRef.current.p1) {
      const keys = serializedPokemonAliasLookupKeys(pokeName, pokemonNameAliases);
      if (team1Roster.some((r) => rosterPokemonMatchesKeys(r, keys, pokemonNameAliases))) p1MatchesTeam1++;
      if (team2Roster.some((r) => rosterPokemonMatchesKeys(r, keys, pokemonNameAliases))) p1MatchesTeam2++;
    }
    for (const pokeName of teamPreviewRef.current.p2) {
      const keys = serializedPokemonAliasLookupKeys(pokeName, pokemonNameAliases);
      if (team1Roster.some((r) => rosterPokemonMatchesKeys(r, keys, pokemonNameAliases))) p1MatchesTeam2++;
      if (team2Roster.some((r) => rosterPokemonMatchesKeys(r, keys, pokemonNameAliases))) p1MatchesTeam1++;
    }

    if (p1MatchesTeam1 > p1MatchesTeam2) return true;
    if (p1MatchesTeam2 > p1MatchesTeam1) return false;
    return null;
  }, [team1Roster, team2Roster, pokemonNameAliases]);

  const processEvents = useCallback(
    (events: BattleEvent[]) => {
      setState((prev) => {
        const next = { ...prev };
        // Deep-clone Pokemon state objects so mutations don't affect prev
        // (React strict mode double-invokes updaters; shared refs cause double-counting)
        next.p1Pokemon = new Map([...prev.p1Pokemon].map(([k, v]) => [k, { ...v }]));
        next.p2Pokemon = new Map([...prev.p2Pokemon].map(([k, v]) => [k, { ...v }]));
        next.chat = [...prev.chat];
        next.p1Side = { ...prev.p1Side };
        next.p2Side = { ...prev.p2Side };
        const kt = ktRef.current;

        for (const event of events) {
          const pokeMap = event.player === "p1" ? next.p1Pokemon : next.p2Pokemon;
          const nickMap = event.player === "p1" ? nicknameMapRef.current.p1 : nicknameMapRef.current.p2;

          // Extract ability/item from [from] tags or ability:/item: in effectInfo
          if (event.player && event.nickname) {
            const abilityFrom = event.fromSource?.match(/ability:\s*(.+)/i)?.[1]?.trim();
            if (abilityFrom) {
              // [from] ability: X — use [of] tag if present (the ability owner), otherwise the event's pokemon
              const ownerMap = event.ofPlayer ? (event.ofPlayer === "p1" ? next.p1Pokemon : next.p2Pokemon) : pokeMap;
              const ownerNickMap = event.ofPlayer ? (event.ofPlayer === "p1" ? nicknameMapRef.current.p1 : nicknameMapRef.current.p2) : nickMap;
              const ownerNick = event.ofNickname || event.nickname;
              const ownerPs = getByNickname(ownerMap, ownerNickMap, ownerNick);
              if (ownerPs) ownerPs.ability = abilityFrom;
            }
            const itemFrom = event.fromSource?.match(/item:\s*(.+)/i)?.[1]?.trim();
            if (itemFrom) {
              // [from] item: X — use [of] tag if present (e.g. Rocky Helmet belongs to the [of] mon)
              const itemOwnerMap = event.ofPlayer ? (event.ofPlayer === "p1" ? next.p1Pokemon : next.p2Pokemon) : pokeMap;
              const itemOwnerNickMap = event.ofPlayer ? (event.ofPlayer === "p1" ? nicknameMapRef.current.p1 : nicknameMapRef.current.p2) : nickMap;
              const itemOwnerNick = event.ofNickname || event.nickname;
              const itemPs = getByNickname(itemOwnerMap, itemOwnerNickMap, itemOwnerNick);
              if (itemPs) { itemPs.item = itemFrom; }
            }
            const abilityEffect = event.effectInfo?.match(/^ability:\s*(.+)/i)?.[1]?.trim();
            if (abilityEffect) {
              const ps = getByNickname(pokeMap, nickMap, event.nickname);
              if (ps) ps.ability = abilityEffect;
            }
          }

          switch (event.type) {
            case "player": {
              if (event.player === "p1") {
                if (event.username) next.p1Username = event.username;
                if (event.avatar) next.p1Avatar = event.avatar;
              }
              if (event.player === "p2") {
                if (event.username) next.p2Username = event.username;
                if (event.avatar) next.p2Avatar = event.avatar;
              }
              break;
            }

            case "poke": {
              if (event.player && event.species) {
                const species = event.species;
                if (event.player === "p1") teamPreviewRef.current.p1.push(species);
                else teamPreviewRef.current.p2.push(species);
                // Create state entry, mark as brought
                if (!pokeMap.has(species)) {
                  pokeMap.set(species, createPokemonState(species, species, event.battleForm, event.level));
                }
                const pokePs = pokeMap.get(species)!;
                pokePs.brought = true;
                if (event.level) pokePs.level = event.level;
                if (event.battleForm) pokePs.battleForm = event.battleForm;
                const mapping = resolveTeamMapping();
                if (mapping !== null) next.p1IsTeam1 = mapping;
              }
              break;
            }

            case "teraPreview": {
              if (event.teraPreviewData) {
                const toID = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
                for (const { species, teraType } of event.teraPreviewData) {
                  const id = toID(species);
                  for (const [key, mon] of next.p1Pokemon) {
                    const keyId = toID(key);
                    if (keyId === id || id.startsWith(keyId)) { mon.teraType = teraType; break; }
                  }
                  for (const [key, mon] of next.p2Pokemon) {
                    const keyId = toID(key);
                    if (keyId === id || id.startsWith(keyId)) { mon.teraType = teraType; break; }
                  }
                }
              }
              break;
            }

            case "switch":
            case "drag": {
              if (!event.player || !event.nickname || !event.species) break;
              const species = event.species;
              nickMap.set(event.nickname, species);

              // Clear active flag on all Pokemon for this player
              for (const [, ps] of pokeMap) ps.active = false;

              if (!pokeMap.has(species)) {
                pokeMap.set(species, createPokemonState(species, event.nickname, event.battleForm, event.level));
              }
              const ps = pokeMap.get(species)!;
              ps.nickname = event.nickname;
              ps.hp = event.hp ?? 100;
              ps.maxHp = event.maxHp ?? 100;
              ps.active = true;
              ps.brought = true;
              if (event.level) ps.level = event.level;
              if (event.battleForm) ps.battleForm = event.battleForm;
              // Boosts reset on switch
              ps.boosts = {};
              // Kill tracking: update active nickname and mark as just switched in
              if (event.player === "p1") kt.p1ActiveNickname = event.nickname;
              else kt.p2ActiveNickname = event.nickname;
              kt.justSwitchedIn.add(`${event.player}:${event.nickname}`);
              break;
            }

            case "replace": {
              if (!event.player || !event.nickname || !event.species) break;
              const oldSpecies = nickMap.get(event.nickname);
              nickMap.set(event.nickname, event.species);
              // Transfer state from the illusion Pokemon
              if (oldSpecies && oldSpecies !== event.species) {
                const oldState = pokeMap.get(oldSpecies);
                if (oldState) oldState.active = false;
              }
              if (!pokeMap.has(event.species)) {
                pokeMap.set(event.species, createPokemonState(event.species, event.nickname, event.battleForm));
              }
              const rps = pokeMap.get(event.species)!;
              rps.active = true;
              rps.brought = true;
              rps.nickname = event.nickname;
              if (event.battleForm) rps.battleForm = event.battleForm;
              // Kill tracking: update active nickname
              if (event.player === "p1") kt.p1ActiveNickname = event.nickname;
              else kt.p2ActiveNickname = event.nickname;
              break;
            }

            case "move": {
              if (event.player && event.moveName) {
                next.lastMove = { player: event.player, moveName: event.moveName };
                // Track moves used per Pokemon
                if (event.nickname) {
                  const ps = getByNickname(pokeMap, nickMap, event.nickname);
                  if (ps && !ps.movesUsed.includes(event.moveName)) {
                    ps.movesUsed = [...ps.movesUsed, event.moveName];
                  }
                }
                // Kill tracking: update damage dealer and clear switch-in tracking
                if (event.nickname) {
                  kt.lastDamageDealer = { player: event.player, nickname: event.nickname };
                  kt.lastFaintSource = null;
                  kt.lastMoveUsed = { player: event.player, nickname: event.nickname, moveName: event.moveName };
                }
                kt.justSwitchedIn.clear();
              }
              break;
            }

            case "damage":
            case "heal": {
              if (!event.player || !event.nickname) break;
              const ps = getByNickname(pokeMap, nickMap, event.nickname);
              const oldHp = ps?.hp ?? 100;
              if (ps) {
                ps.hp = event.hp ?? ps.hp;
                ps.maxHp = event.maxHp ?? ps.maxHp;
              }

              // Kill tracking for damage events only
              if (event.type === "damage") {
                const isFaintingDamage = (event.hp ?? 100) === 0;
                const newHpPercent = event.hp ?? 0;
                const damageDealt = Math.max(0, oldHp - newHpPercent);

                // Skip faint-source tracking if there's a pending faint for a different Pokemon
                // (prevents Rocky Helmet damage from overwriting the real faint cause)
                if (kt.pendingFaint &&
                    (kt.pendingFaint.player !== event.player || kt.pendingFaint.nickname !== event.nickname)) {
                  break;
                }

                if (event.fromSource) {
                  kt.lastFaintSource = event.fromSource;

                  // Track HP before Spikes damage for layer kill calculation
                  const sourceLower = event.fromSource.toLowerCase();
                  if (sourceLower.includes("spikes") && !sourceLower.includes("toxic")) {
                    kt.hpBeforeSpikes = newHpPercent + damageDealt;
                  }

                  // Contact damage items/abilities (Rocky Helmet, Rough Skin, etc.)
                  const isContactDamage =
                    sourceLower.includes("rocky helmet") || sourceLower.includes("rough skin") ||
                    sourceLower.includes("iron barbs") || sourceLower.includes("aftermath") ||
                    sourceLower.includes("liquid ooze") || sourceLower.includes("innards out");

                  if (isContactDamage && event.ofPlayer && event.ofNickname) {
                    kt.contactDamageSource = { player: event.ofPlayer, nickname: event.ofNickname };
                  } else {
                    kt.contactDamageSource = null;
                  }
                } else if (kt.lastFaintSource !== "Future Sight" && kt.lastFaintSource !== "Doom Desire") {
                  // Direct damage - reset faint source
                  kt.lastFaintSource = null;
                  kt.contactDamageSource = null;
                  // Update lastDamageDealer for direct damage
                  if (event.player === "p1" && kt.p2ActiveNickname) {
                    kt.lastDamageDealer = { player: "p2", nickname: kt.p2ActiveNickname };
                  } else if (event.player === "p2" && kt.p1ActiveNickname) {
                    kt.lastDamageDealer = { player: "p1", nickname: kt.p1ActiveNickname };
                  }
                }

                if (isFaintingDamage) {
                  kt.pendingFaint = { player: event.player, nickname: event.nickname };
                }
              }
              break;
            }

            case "faint": {
              if (!event.player || !event.nickname) break;
              const faintPs = getByNickname(pokeMap, nickMap, event.nickname);
              if (faintPs) {
                faintPs.fainted = true;
                faintPs.hp = 0;
                faintPs.active = false;
              }

              // ── Kill attribution (ported from replay-scrape) ──
              let killer: KillTracker | null = null;

              if (kt.lastFaintSource) {
                const source = kt.lastFaintSource.toLowerCase();

                if (source.includes("spikes") && !source.includes("toxic")) {
                  const layers = event.player === "p1" ? kt.spikesLayers.p1 : kt.spikesLayers.p2;
                  if (layers.length > 0 && kt.hpBeforeSpikes !== null) {
                    let idx = 0;
                    if (kt.hpBeforeSpikes > 12.5 && layers.length >= 2) idx = 1;
                    if (kt.hpBeforeSpikes > 16.67 && layers.length >= 3) idx = 2;
                    const layer = layers[idx] || layers[0];
                    killer = layer ? { ...layer, move: "Spikes" } : null;
                  } else if (layers.length > 0) {
                    killer = { ...layers[0], move: "Spikes" };
                  }
                } else if (source.includes("stealth rock") || source === "rocks") {
                  const setter = kt.hazardSetters.get(`${event.player}:stealthrock`);
                  killer = setter ? { ...setter, move: "Stealth Rock" } : null;
                } else if (source.includes("sandstorm") || source.includes("hail")) {
                  killer = kt.weatherSetter ? { ...kt.weatherSetter } : null;
                } else if (source === "psn" || source === "tox" || source === "brn") {
                  killer = kt.statusInflictors.get(`${event.player}:${event.nickname}`) || null;
                } else if (source.includes("future sight") || source.includes("doom desire")) {
                  killer = kt.futureAttacks.get(event.player) || null;
                } else if (source.includes("leech seed")) {
                  killer = kt.effectInflictors.get(`${event.player}:${event.nickname}:leechseed`) || null;
                } else if (source.includes("salt cure")) {
                  killer = kt.effectInflictors.get(`${event.player}:${event.nickname}:saltcure`) || null;
                } else if (source.includes("curse")) {
                  killer = kt.effectInflictors.get(`${event.player}:${event.nickname}:curse`) || null;
                } else if (source.includes("nightmare") || source.includes("bad dreams")) {
                  killer = kt.effectInflictors.get(`${event.player}:${event.nickname}:nightmare`) || kt.lastDamageDealer;
                } else if (
                  source.includes("rocky helmet") || source.includes("rough skin") ||
                  source.includes("iron barbs") || source.includes("aftermath") ||
                  source.includes("liquid ooze") || source.includes("innards out")
                ) {
                  killer = kt.contactDamageSource ? { ...kt.contactDamageSource } : null;
                } else if (source.includes("recoil")) {
                  killer = kt.lastDamageDealer ? { ...kt.lastDamageDealer } : null;
                } else {
                  // Check binding moves
                  const bindingChecks: [string, string][] = [
                    ["wrap", "wrap"], ["bind", "bind"], ["fire spin", "firespin"],
                    ["whirlpool", "whirlpool"], ["sand tomb", "sandtomb"],
                    ["magma storm", "magmastorm"], ["infestation", "infestation"],
                    ["snap trap", "snaptrap"], ["thunder cage", "thundercage"], ["clamp", "clamp"],
                  ];
                  let foundBinding = false;
                  for (const [searchStr, effectKey] of bindingChecks) {
                    if (source.includes(searchStr)) {
                      killer = kt.effectInflictors.get(`${event.player}:${event.nickname}:${effectKey}`) || null;
                      foundBinding = true;
                      break;
                    }
                  }
                  if (!foundBinding) {
                    // Other indirect (e.g., confusion) - credit last damage dealer
                    killer = kt.lastDamageDealer ? { ...kt.lastDamageDealer, move: kt.lastMoveUsed?.moveName } : null;
                  }
                }
              } else {
                // Direct damage kill
                killer = kt.lastDamageDealer ? { ...kt.lastDamageDealer, move: kt.lastMoveUsed?.moveName } : null;
              }

              // Self-kill reassignment: if killer is on the same team, credit opponent's active
              if (killer && killer.player === event.player) {
                const opponentPlayer = event.player === "p1" ? "p2" : "p1";
                const opponentNickname = opponentPlayer === "p1" ? kt.p1ActiveNickname : kt.p2ActiveNickname;
                killer = opponentNickname ? { player: opponentPlayer, nickname: opponentNickname } : null;
              }

              // Credit the kill to the specific Pokemon
              if (killer && killer.player !== event.player) {
                const killerNickMap = killer.player === "p1" ? nicknameMapRef.current.p1 : nicknameMapRef.current.p2;
                const killerPokeMap = killer.player === "p1" ? next.p1Pokemon : next.p2Pokemon;
                const killerSpecies = killerNickMap.get(killer.nickname);
                if (killerSpecies) {
                  const killerPs = killerPokeMap.get(killerSpecies);
                  if (killerPs) killerPs.kills++;
                }
              }

              // Update total kill counts
              const p1FaintCount = [...next.p1Pokemon.values()].filter((p) => p.fainted).length;
              const p2FaintCount = [...next.p2Pokemon.values()].filter((p) => p.fainted).length;
              next.p1Kills = p2FaintCount;
              next.p2Kills = p1FaintCount;

              // Clear pending faint
              kt.pendingFaint = null;
              kt.hpBeforeSpikes = null;
              break;
            }

            case "turn": {
              next.turn = event.turnNumber ?? next.turn;
              next.lastMove = null;
              break;
            }

            case "timestamp": {
              if (!next.battleStartTime && event.unixTimestamp && next.turn >= 1) {
                next.battleStartTime = event.unixTimestamp * 1000;
              }
              break;
            }

            case "win": {
              if (event.username === next.p1Username) next.winner = "p1";
              else if (event.username === next.p2Username) next.winner = "p2";
              break;
            }

            case "chat": {
              if (event.chatUser && event.chatMessage) {
                next.chat.push({ user: event.chatUser, message: event.chatMessage, timestamp: Date.now() });
                if (next.chat.length > MAX_CHAT_MESSAGES) {
                  next.chat = next.chat.slice(-MAX_CHAT_MESSAGES);
                }
              }
              break;
            }

            case "status": {
              if (!event.player || !event.nickname) break;
              const statusPs = getByNickname(pokeMap, nickMap, event.nickname);
              if (statusPs) statusPs.status = event.statusName || null;

              // Track status inflictor for kill attribution
              const statusKey = `${event.player}:${event.nickname}`;
              const fromLower = (event.fromSource || "").toLowerCase();

              if ((event.statusName === "psn" || event.statusName === "tox") && fromLower.includes("toxic spikes")) {
                const setter = kt.hazardSetters.get(`${event.player}:toxicspikes`);
                if (setter) kt.statusInflictors.set(statusKey, { ...setter, move: "Toxic Spikes" });
              } else if (
                (event.statusName === "psn" || event.statusName === "tox") &&
                !event.fromSource &&
                kt.justSwitchedIn.has(`${event.player}:${event.nickname}`) &&
                kt.hazardSetters.has(`${event.player}:toxicspikes`)
              ) {
                const setter = kt.hazardSetters.get(`${event.player}:toxicspikes`)!;
                kt.statusInflictors.set(statusKey, { ...setter, move: "Toxic Spikes" });
              } else if (event.ofPlayer && event.ofNickname && event.raw.includes("[from] ability:")) {
                kt.statusInflictors.set(statusKey, { player: event.ofPlayer, nickname: event.ofNickname });
              } else {
                const inflictorPlayer = event.player === "p1" ? "p2" : "p1";
                const inflictorNickname = inflictorPlayer === "p1" ? kt.p1ActiveNickname : kt.p2ActiveNickname;
                if (inflictorNickname) {
                  kt.statusInflictors.set(statusKey, {
                    player: inflictorPlayer,
                    nickname: inflictorNickname,
                    move: kt.lastMoveUsed?.moveName,
                  });
                }
              }
              break;
            }

            case "curestatus": {
              if (!event.player || !event.nickname) break;
              const curePs = getByNickname(pokeMap, nickMap, event.nickname);
              if (curePs) curePs.status = null;
              break;
            }

            // ── Stat boosts ──
            case "boost": {
              if (!event.player || !event.nickname || !event.stat) break;
              const boostPs = getByNickname(pokeMap, nickMap, event.nickname);
              if (boostPs) {
                const cur = boostPs.boosts[event.stat] || 0;
                boostPs.boosts = { ...boostPs.boosts, [event.stat]: Math.min(6, cur + (event.amount || 1)) };
              }
              break;
            }

            case "unboost": {
              if (!event.player || !event.nickname || !event.stat) break;
              const unboostPs = getByNickname(pokeMap, nickMap, event.nickname);
              if (unboostPs) {
                const cur = unboostPs.boosts[event.stat] || 0;
                unboostPs.boosts = { ...unboostPs.boosts, [event.stat]: Math.max(-6, cur - (event.amount || 1)) };
              }
              break;
            }

            case "setboost": {
              if (!event.player || !event.nickname || !event.stat) break;
              const setboostPs = getByNickname(pokeMap, nickMap, event.nickname);
              if (setboostPs) {
                setboostPs.boosts = { ...setboostPs.boosts, [event.stat]: event.amount || 0 };
              }
              break;
            }

            case "clearallboost": {
              if (!event.player || !event.nickname) break;
              const clearPs = getByNickname(pokeMap, nickMap, event.nickname);
              if (clearPs) clearPs.boosts = {};
              break;
            }

            case "clearpositiveboost": {
              if (!event.player || !event.nickname) break;
              const clearPosPs = getByNickname(pokeMap, nickMap, event.nickname);
              if (clearPosPs) {
                const newBoosts: Record<string, number> = {};
                for (const [stat, val] of Object.entries(clearPosPs.boosts)) {
                  if (val < 0) newBoosts[stat] = val;
                }
                clearPosPs.boosts = newBoosts;
              }
              break;
            }

            case "clearnegativeboost": {
              if (!event.player || !event.nickname) break;
              const clearNegPs = getByNickname(pokeMap, nickMap, event.nickname);
              if (clearNegPs) {
                const newBoosts: Record<string, number> = {};
                for (const [stat, val] of Object.entries(clearNegPs.boosts)) {
                  if (val > 0) newBoosts[stat] = val;
                }
                clearNegPs.boosts = newBoosts;
              }
              break;
            }

            // ── Ability / Item ──
            case "ability": {
              if (!event.player || !event.nickname) break;
              const abilityPs = getByNickname(pokeMap, nickMap, event.nickname);
              if (abilityPs && event.abilityName) abilityPs.ability = event.abilityName;
              break;
            }

            case "endability": {
              break;
            }

            case "item": {
              if (!event.player || !event.nickname) break;
              const itemPs = getByNickname(pokeMap, nickMap, event.nickname);
              if (itemPs && event.itemName) {
                itemPs.item = event.itemName;
                itemPs.itemConsumed = false;
              }
              break;
            }

            case "enditem": {
              if (!event.player || !event.nickname) break;
              const endItemPs = getByNickname(pokeMap, nickMap, event.nickname);
              if (endItemPs) {
                if (event.itemName) endItemPs.item = event.itemName;
                endItemPs.itemConsumed = true;
              }
              break;
            }

            // ── Side conditions (hazards) — state + kill tracking ──
            case "sidestart": {
              if (!event.affectedSide || !event.hazardName) break;
              {
                const side = event.affectedSide === "p1" ? next.p1Side : next.p2Side;
                const hn = event.hazardName.toLowerCase();
                if (hn.includes("reflect")) side.reflect = true;
                else if (hn.includes("light screen")) side.lightScreen = true;
                else if (hn.includes("aurora veil")) side.auroraVeil = true;
                else if (hn.includes("stealth rock")) side.stealthRock = true;
                else if (hn.includes("toxic spikes")) side.toxicSpikes = Math.min(2, side.toxicSpikes + 1);
                else if (hn.includes("spikes")) side.spikes = Math.min(3, side.spikes + 1);
                else if (hn.includes("sticky web")) side.stickyWeb = true;
                else if (hn.includes("tailwind")) side.tailwind = true;
              }
              const setterPlayer = event.affectedSide === "p1" ? "p2" : "p1";
              const setterNickname = setterPlayer === "p1" ? kt.p1ActiveNickname : kt.p2ActiveNickname;
              if (!setterNickname) break;

              const hazardLower = event.hazardName.toLowerCase();
              if (hazardLower.includes("spikes") && !hazardLower.includes("toxic")) {
                const layers = event.affectedSide === "p1" ? kt.spikesLayers.p1 : kt.spikesLayers.p2;
                if (layers.length < 3) {
                  layers.push({ player: setterPlayer, nickname: setterNickname });
                }
              } else if (hazardLower.includes("stealth rock") || hazardLower.includes("rocks")) {
                kt.hazardSetters.set(`${event.affectedSide}:stealthrock`, { player: setterPlayer, nickname: setterNickname });
              } else if (hazardLower.includes("toxic spikes")) {
                kt.hazardSetters.set(`${event.affectedSide}:toxicspikes`, { player: setterPlayer, nickname: setterNickname });
              } else {
                const hazardKey = `${event.affectedSide}:${hazardLower.replace(/[^a-z]/g, "")}`;
                kt.hazardSetters.set(hazardKey, { player: setterPlayer, nickname: setterNickname });
              }
              break;
            }

            case "sideend": {
              if (!event.affectedSide || !event.hazardName) break;
              {
                const side = event.affectedSide === "p1" ? next.p1Side : next.p2Side;
                const hn = event.hazardName.toLowerCase();
                if (hn.includes("reflect")) side.reflect = false;
                else if (hn.includes("light screen")) side.lightScreen = false;
                else if (hn.includes("aurora veil")) side.auroraVeil = false;
                else if (hn.includes("stealth rock")) side.stealthRock = false;
                else if (hn.includes("toxic spikes")) side.toxicSpikes = 0;
                else if (hn.includes("spikes")) side.spikes = 0;
                else if (hn.includes("sticky web")) side.stickyWeb = false;
                else if (hn.includes("tailwind")) side.tailwind = false;
              }
              const hazardEndLower = event.hazardName.toLowerCase();
              if (hazardEndLower.includes("spikes") && !hazardEndLower.includes("toxic")) {
                if (event.affectedSide === "p1") kt.spikesLayers.p1 = [];
                else kt.spikesLayers.p2 = [];
              } else if (hazardEndLower.includes("stealth rock") || hazardEndLower.includes("rocks")) {
                kt.hazardSetters.delete(`${event.affectedSide}:stealthrock`);
              } else if (hazardEndLower.includes("toxic spikes")) {
                kt.hazardSetters.delete(`${event.affectedSide}:toxicspikes`);
              }
              break;
            }

            case "weather": {
              if (!event.weatherName) break;
              if (event.weatherName === "none") {
                next.weather = null;
              } else if (!event.isUpkeep) {
                next.weather = event.weatherName;
              }
              if (event.weatherName === "none") {
                kt.weatherSetter = null;
              } else if (!event.isUpkeep) {
                if (event.ofPlayer && event.ofNickname) {
                  kt.weatherSetter = { player: event.ofPlayer, nickname: event.ofNickname };
                } else if (kt.lastDamageDealer && !event.raw.includes("[from] ability:")) {
                  kt.weatherSetter = { ...kt.lastDamageDealer, move: event.weatherName };
                }
              }
              break;
            }

            case "fieldstart": {
              if (event.terrainName) {
                next.terrain = event.terrainName;
              }
              break;
            }

            case "fieldend": {
              next.terrain = null;
              break;
            }

            case "startEffect": {
              if (!event.player || !event.nickname || !event.effectInfo) break;
              const effectLower = event.effectInfo.toLowerCase();

              let inflictor: KillTracker | null = null;
              if (event.ofPlayer && event.ofNickname) {
                inflictor = { player: event.ofPlayer, nickname: event.ofNickname };
              } else {
                const inflictorPlayer = event.player === "p1" ? "p2" : "p1";
                const inflictorNickname = inflictorPlayer === "p1" ? kt.p1ActiveNickname : kt.p2ActiveNickname;
                if (inflictorNickname) inflictor = { player: inflictorPlayer, nickname: inflictorNickname };
              }
              if (!inflictor) break;

              if (effectLower.includes("future sight")) {
                const targetSide = event.player === "p1" ? "p2" : "p1";
                kt.futureAttacks.set(targetSide, { player: event.player, nickname: event.nickname, move: "Future Sight" });
              } else if (effectLower.includes("doom desire")) {
                const targetSide = event.player === "p1" ? "p2" : "p1";
                kt.futureAttacks.set(targetSide, { player: event.player, nickname: event.nickname, move: "Doom Desire" });
              } else {
                const effectMap: Record<string, string> = {
                  "leech seed": "leechseed", "salt cure": "saltcure", "curse": "curse", "nightmare": "nightmare",
                  "wrap": "wrap", "bind": "bind", "fire spin": "firespin", "whirlpool": "whirlpool",
                  "sand tomb": "sandtomb", "magma storm": "magmastorm", "infestation": "infestation",
                  "snap trap": "snaptrap", "thunder cage": "thundercage", "clamp": "clamp",
                };
                const moveNames: Record<string, string> = {
                  "leechseed": "Leech Seed", "saltcure": "Salt Cure", "curse": "Curse", "nightmare": "Nightmare",
                  "wrap": "Wrap", "bind": "Bind", "firespin": "Fire Spin", "whirlpool": "Whirlpool",
                  "sandtomb": "Sand Tomb", "magmastorm": "Magma Storm", "infestation": "Infestation",
                  "snaptrap": "Snap Trap", "thundercage": "Thunder Cage", "clamp": "Clamp",
                };
                for (const [key, effectName] of Object.entries(effectMap)) {
                  if (effectLower.includes(key)) {
                    kt.effectInflictors.set(
                      `${event.player}:${event.nickname}:${effectName}`,
                      { ...inflictor, move: moveNames[effectName] }
                    );
                    break;
                  }
                }
              }
              break;
            }

            case "endEffect": {
              if (!event.effectInfo) break;
              const endEffectLower = event.effectInfo.toLowerCase();
              if (endEffectLower.includes("future sight")) {
                kt.lastFaintSource = "Future Sight";
              } else if (endEffectLower.includes("doom desire")) {
                kt.lastFaintSource = "Doom Desire";
              }
              break;
            }

            case "activate": {
              if (!event.player || !event.nickname || !event.effectInfo) break;
              const activateLower = event.effectInfo.toLowerCase();
              const bindingMoves: Record<string, string> = {
                "wrap": "Wrap", "bind": "Bind", "fire spin": "Fire Spin",
                "whirlpool": "Whirlpool", "sand tomb": "Sand Tomb", "magma storm": "Magma Storm",
                "infestation": "Infestation", "snap trap": "Snap Trap",
                "thunder cage": "Thunder Cage", "clamp": "Clamp",
              };
              for (const [key, displayName] of Object.entries(bindingMoves)) {
                if (activateLower.includes(key)) {
                  let activateInflictor: KillTracker | null = null;
                  if (event.ofPlayer && event.ofNickname) {
                    activateInflictor = { player: event.ofPlayer, nickname: event.ofNickname };
                  } else {
                    const inflictorPlayer = event.player === "p1" ? "p2" : "p1";
                    const inflictorNickname = inflictorPlayer === "p1" ? kt.p1ActiveNickname : kt.p2ActiveNickname;
                    if (inflictorNickname) activateInflictor = { player: inflictorPlayer, nickname: inflictorNickname };
                  }
                  if (activateInflictor) {
                    const effectKey = `${event.player}:${event.nickname}:${key.replace(/\s+/g, "")}`;
                    kt.effectInflictors.set(effectKey, { ...activateInflictor, move: displayName });
                  }
                  break;
                }
              }
              break;
            }

            // ── Form changes ──
            case "formechange":
            case "detailschange": {
              if (!event.player || !event.nickname || !event.battleForm) break;
              const fcPs = getByNickname(pokeMap, nickMap, event.nickname);
              if (fcPs) {
                fcPs.battleForm = event.battleForm;
              }
              break;
            }

            // ── Terastallization ──
            case "terastallize": {
              if (!event.player || !event.nickname) break;
              const teraPs = getByNickname(pokeMap, nickMap, event.nickname);
              if (teraPs) {
                teraPs.terastallized = true;
                teraPs.teraType = event.teraType || null;
              }
              if (event.player === "p1") next.p1TeraUsed = true;
              else next.p2TeraUsed = true;
              break;
            }
          }
        }

        return next;
      });
    },
    [resolveTeamMapping]
  );

  // ── Phase queue functions ──

  const clearPhaseQueue = useCallback(() => {
    phaseQueueRef.current = [];
    if (phaseTimerRef.current) {
      clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = null;
    }
  }, []);

  /** Process the next phase in the queue (called when battle-phase-done fires) */
  const processNextPhase = useCallback(() => {
    if (phaseQueueRef.current.length === 0) return;
    const phase = phaseQueueRef.current.shift()!;
    processEvents(phase);
  }, [processEvents]);

  /** Flush all remaining queued phases immediately */
  const flushAllPhases = useCallback(() => {
    if (phaseQueueRef.current.length === 0) return;
    const remaining = phaseQueueRef.current.flat();
    phaseQueueRef.current = [];
    if (phaseTimerRef.current) {
      clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = null;
    }
    if (remaining.length > 0) processEvents(remaining);
  }, [processEvents]);

  /** Enqueue phases for incremental processing (used by playback controls).
   *  First phase processes immediately; subsequent phases advance on a
   *  timer since playback doesn't have animation-synced events. */
  const enqueuePhases = useCallback((phases: BattleEvent[][], immediate?: boolean) => {
    clearPhaseQueue();
    if (phases.length === 0) return;

    if (immediate) {
      const all = phases.flat();
      if (all.length > 0) processEvents(all);
      return;
    }

    // Process first phase immediately, queue the rest on a timer
    phaseQueueRef.current = phases.slice(1);
    processEvents(phases[0]);

    if (phaseQueueRef.current.length > 0) {
      phaseTimerRef.current = setTimeout(() => {
        phaseTimerRef.current = null;
        processNextPhase();
        // Schedule remaining phases
        if (phaseQueueRef.current.length > 0) {
          phaseTimerRef.current = setTimeout(() => {
            phaseTimerRef.current = null;
            flushAllPhases();
          }, 2000);
        }
      }, 2000);
    }
  }, [processEvents, clearPhaseQueue, processNextPhase, flushAllPhases]);

  // ── Playback control functions ──

  const seekToTurn = useCallback((n: number) => {
    // Reset all mutable refs
    nicknameMapRef.current = { p1: new Map(), p2: new Map() };
    teamPreviewRef.current = { p1: [], p2: [] };
    ktRef.current = createKillTracking();

    clearPhaseQueue();

    // Reset React state
    setState(createInitialState());

    // Replay events up to END of turn n-1 (start-of-turn-n state)
    const eventsToReplay: BattleEvent[] = [];
    const maxGroup = Math.min(n, allEventsRef.current.length - 1);
    for (let i = 0; i < maxGroup; i++) {
      eventsToReplay.push(...allEventsRef.current[i]);
    }

    // Also include phase 0 of turn n (pre-move events: turn indicator,
    // switches, etc.) so the UI shows the start-of-turn state immediately.
    // Do NOT include move phases — those play when the user clicks play.
    if (maxGroup >= 0 && maxGroup < allEventsRef.current.length) {
      const turnEvents = allEventsRef.current[maxGroup];
      if (turnEvents.length > 0) {
        const phases = splitEventsIntoPhases(turnEvents);
        if (phases.length > 0) {
          const phase0 = phases[0];
          if (phase0.length > 0 && phase0[0].type !== "move") {
            eventsToReplay.push(...phase0);
          }
        }
      }
    }

    if (eventsToReplay.length > 0) {
      processEvents(eventsToReplay);
    }

    // Preserve connected state
    if (wsRef.current?.readyState === WebSocket.OPEN || allEventsRef.current.length > 1) {
      setState((prev) => ({ ...prev, connected: true }));
    }

    setReviewingTurn(n);
    reviewingTurnRef.current = n;
  }, [processEvents, clearPhaseQueue]);

  /** Forward any raw lines BattleScene hasn't seen yet.
   *  Call before seek/playback so the engine has the protocol data to animate. */
  const syncBattleScene = useCallback(() => {
    if (!battleSceneRef.current?.isReady()) return;
    const startIdx = battleSceneForwardedUpToRef.current;
    if (startIdx >= allRawLinesRef.current.length) return;
    for (let i = startIdx; i < allRawLinesRef.current.length; i++) {
      const lines = allRawLinesRef.current[i];
      if (lines.length > 0) {
        battleSceneRef.current.addLinesImmediate(lines);
      }
    }
    battleSceneForwardedUpToRef.current = allRawLinesRef.current.length;
  }, [battleSceneRef]);

  const goLive = useCallback(() => {
    // Reset all mutable refs
    nicknameMapRef.current = { p1: new Map(), p2: new Map() };
    teamPreviewRef.current = { p1: [], p2: [] };
    ktRef.current = createKillTracking();

    clearPhaseQueue();

    // Reset React state
    setState(createInitialState());

    // Replay ALL stored events
    const eventsToReplay: BattleEvent[] = [];
    for (const group of allEventsRef.current) {
      eventsToReplay.push(...group);
    }

    if (eventsToReplay.length > 0) {
      processEvents(eventsToReplay);
    }

    // Forward any raw lines BattleScene missed while paused/reviewing
    syncBattleScene();

    // Preserve connected state
    if (wsRef.current?.readyState === WebSocket.OPEN || allEventsRef.current.length > 1) {
      setState((prev) => ({ ...prev, connected: true }));
    }

    setReviewingTurn(null);
    reviewingTurnRef.current = null;
    setIsPaused(false);
    isPausedRef.current = false;
  }, [processEvents, clearPhaseQueue, syncBattleScene]);

  const handleSetPaused = useCallback((paused: boolean) => {
    setIsPaused(paused);
    isPausedRef.current = paused;
    if (!paused && reviewingTurnRef.current === null) {
      // Unpausing while live — flush any events that arrived while paused
      // by replaying all stored events
      nicknameMapRef.current = { p1: new Map(), p2: new Map() };
      teamPreviewRef.current = { p1: [], p2: [] };
      ktRef.current = createKillTracking();
      clearPhaseQueue();
      setState(createInitialState());

      const eventsToReplay: BattleEvent[] = [];
      for (const group of allEventsRef.current) {
        eventsToReplay.push(...group);
      }
      if (eventsToReplay.length > 0) {
        processEvents(eventsToReplay);
      }

      // Forward any raw lines BattleScene missed while paused
      syncBattleScene();
    }
  }, [processEvents, clearPhaseQueue, battleSceneRef, syncBattleScene]);

  /** For playback: process all events for a turn immediately. */
  const playTurnPhased = useCallback((n: number) => {
    // Flush any remaining phases from the previous turn first
    flushAllPhases();

    // Process all events for this turn immediately
    if (n >= 0 && n < allEventsRef.current.length) {
      const turnEvents = allEventsRef.current[n];
      if (turnEvents.length > 0) {
        processEvents(turnEvents);
      }
    }

    setReviewingTurn(n);
    reviewingTurnRef.current = n;
  }, [flushAllPhases, processEvents]);

  const connect = useCallback(() => {
    if (!battleUrl) return;

    const roomId = extractShowdownRoomId(battleUrl);
    if (!roomId) return;

    const server = SHOWDOWN_SERVERS[serverIndexRef.current % SHOWDOWN_SERVERS.length];
    const ws = new WebSocket(`wss://${server}/showdown/websocket`);
    wsRef.current = ws;

    let authenticated = false;

    ws.onopen = () => {
      setState((prev) => ({ ...prev, connected: true }));
    };

    ws.onmessage = async (event) => {
      const data = event.data as string;

      // ── Handle challstr (global message, no room prefix) ──
      if (!authenticated && data.includes("|challstr|")) {
        const challstrMatch = data.match(/\|challstr\|(.+)/);
        if (challstrMatch) {
          const challstr = challstrMatch[1].trim();
          try {
            const res = await fetch("/api/showdown-auth", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ challstr }),
            });
            if (res.ok) {
              const { assertion, username } = await res.json();
              ws.send(`|/trn ${username},0,${assertion}`);
            }
          } catch {
            // Auth failed — still try joining as guest (works for public battles)
          }
          authenticated = true;
          ws.send(`|/join ${roomId}`);
        }
        return;
      }

      // ── Only process messages for our battle room ──
      // Room messages: >battle-roomid\n|...|...
      // Global messages: |updateuser|..., |formats|..., etc.
      const roomPrefix = `>${roomId}\n`;
      if (!data.startsWith(roomPrefix)) {
        // Check for |noinit| which means the room doesn't exist on this server
        if (data.includes("|noinit|")) {
          console.warn("[useShowdownBattle] Room not found on this server");
          ws.close();
        }
        return;
      }

      const messageBody = data.substring(roomPrefix.length);
      if (!messageBody) return;

      // Get raw lines for BattleScene forwarding
      const rawLines = messageBody.split("\n").filter(Boolean);

      // Parse into events for hook state
      const events = parseMessages(messageBody);
      if (events.length === 0 && rawLines.length === 0) return;

      // ── Always store events and raw lines for replay ──
      if (events.length > 0) {
        for (const evt of events) {
          if (evt.type === "turn" && evt.turnNumber != null) {
            const turnNum = evt.turnNumber;
            currentTurnGroupRef.current = turnNum;
            while (allEventsRef.current.length <= turnNum) {
              allEventsRef.current.push([]);
            }
            while (allRawLinesRef.current.length <= turnNum) {
              allRawLinesRef.current.push([]);
            }
            allEventsRef.current[turnNum].push(evt);
            setMaxTurn(turnNum);
          } else {
            const groupIdx = currentTurnGroupRef.current;
            while (allEventsRef.current.length <= groupIdx) {
              allEventsRef.current.push([]);
            }
            allEventsRef.current[groupIdx].push(evt);
          }
        }
      }

      // Store raw lines in turn groups
      if (rawLines.length > 0) {
        const groupIdx = currentTurnGroupRef.current;
        while (allRawLinesRef.current.length <= groupIdx) {
          allRawLinesRef.current.push([]);
        }
        allRawLinesRef.current[groupIdx].push(...rawLines);
      }

      // ── Forward raw lines to BattleScene ──
      if (battleSceneReadyRef.current && battleSceneRef.current?.isReady()) {
        if (!receivedRoomInitRef.current) {
          // First room message — initial state dump, feed without animation
          receivedRoomInitRef.current = true;
          battleSceneRef.current.addLinesImmediate(rawLines);
          battleSceneRef.current.seekTurn(Infinity);
          battleSceneForwardedUpToRef.current = allRawLinesRef.current.length;
        } else if (!isPausedRef.current && reviewingTurnRef.current === null) {
          // Live play — feed lines with phased animation.
          // Process all events after animations complete via the
          // onPhaseDone callback (called between each phase) and
          // after the final phase resolves.
          const delayed = events.filter((e) =>
            e.type !== "player" && e.type !== "poke" && e.type !== "chat" && e.type !== "teraPreview"
          );
          const phases = splitEventsIntoPhases(delayed);
          let phaseIndex = 0;
          battleSceneRef.current.addLines(rawLines, () => {
            // Phase boundary — process the phase that just animated
            if (phaseIndex < phases.length) {
              processEvents(phases[phaseIndex]);
              phaseIndex++;
            }
          }).then(() => {
            // All phases done — process any remaining events
            while (phaseIndex < phases.length) {
              processEvents(phases[phaseIndex]);
              phaseIndex++;
            }
          });
          battleSceneForwardedUpToRef.current = allRawLinesRef.current.length;
        }
        // If paused/reviewing, lines are stored but not forwarded (goLive catches up)
      } else {
        // BattleScene not ready yet — queue raw lines
        pendingRawLinesRef.current.push(rawLines);
      }

      // ── Process events into React state ──
      if (isPausedRef.current || reviewingTurnRef.current !== null) {
        // Paused or reviewing — events are stored but not processed
        return;
      }

      if (events.length > 0) {
        // Process non-visual events immediately (chat, player info, team preview)
        const immediate = events.filter((e) =>
          e.type === "player" || e.type === "poke" || e.type === "chat" || e.type === "teraPreview"
        );
        if (immediate.length > 0) processEvents(immediate);

        // Delayed (visual) events during catch-up are processed immediately
        if (!caughtUpRef.current) {
          const delayed = events.filter((e) =>
            e.type !== "player" && e.type !== "poke" && e.type !== "chat" && e.type !== "teraPreview"
          );
          if (delayed.length > 0) {
            processEvents(delayed);
            if (delayed.some((e) => e.type === "turn")) {
              caughtUpRef.current = true;
            }
          }
        }
        // When caught up and live, delayed events are processed via the
        // onPhaseDone callback from BattleScene.addLines (above).
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      let hasWinner = false;
      setState((prev) => {
        hasWinner = !!prev.winner;
        if (prev.winner) {
          return prev;
        }
        reconnectTimerRef.current = setTimeout(() => {
          serverIndexRef.current++;
          connect();
        }, RECONNECT_DELAY);
        return { ...prev, connected: false };
      });
      if (hasWinner) {
        setIsPaused(true);
        isPausedRef.current = true;
        const lastTurn = currentTurnGroupRef.current;
        setReviewingTurn(lastTurn);
        reviewingTurnRef.current = lastTurn;
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [battleUrl, processEvents, battleSceneRef]);

  /** Called by BattleScene when it's ready to receive lines.
   *  Forwards any raw lines that arrived before the scene was initialized. */
  const onBattleSceneReady = useCallback(() => {
    battleSceneReadyRef.current = true;
    if (pendingRawLinesRef.current.length > 0 && battleSceneRef.current?.isReady()) {
      // Forward all queued raw lines as immediate (catch-up)
      for (const lines of pendingRawLinesRef.current) {
        battleSceneRef.current.addLinesImmediate(lines);
      }
      pendingRawLinesRef.current = [];
      receivedRoomInitRef.current = true;
      battleSceneForwardedUpToRef.current = allRawLinesRef.current.length;
      battleSceneRef.current.seekTurn(Infinity);
    }
  }, [battleSceneRef]);

  useEffect(() => {
    if (!battleUrl) return;

    setState(createInitialState());
    nicknameMapRef.current = { p1: new Map(), p2: new Map() };
    teamPreviewRef.current = { p1: [], p2: [] };
    ktRef.current = createKillTracking();
    caughtUpRef.current = false;
    receivedRoomInitRef.current = false;
    battleSceneReadyRef.current = false;
    battleSceneForwardedUpToRef.current = 0;
    pendingRawLinesRef.current = [];
    serverIndexRef.current = 0;
    allEventsRef.current = [[]];
    allRawLinesRef.current = [[]];
    currentTurnGroupRef.current = 0;
    setMaxTurn(0);
    setReviewingTurn(null);
    reviewingTurnRef.current = null;
    setIsPaused(false);
    isPausedRef.current = false;

    connect();

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      clearPhaseQueue();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [battleUrl, connect, clearPhaseQueue]);

  return {
    ...state,
    seekToTurn,
    goLive,
    setPaused: handleSetPaused,
    maxTurn,
    reviewingTurn,
    isPaused,
    playTurnPhased,
    onBattleSceneReady,
    syncBattleScene,
  };
}
