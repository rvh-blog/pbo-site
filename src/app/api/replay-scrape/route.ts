import { NextRequest, NextResponse } from "next/server";
import { normalizePokemonName } from "@/lib/pokemon-name-utils";
import {
  getPokemonAliasMaps,
  normalizePokemonNameWithAliases,
  type PokemonAliasMaps,
} from "@/lib/pokemon-name-aliases";

interface PokemonStats {
  name: string;
  kills: number;
  deaths: number;
  damageDealt: number;
  damageDealtIndirect: number;
  damageTaken: number;
  damageTakenIndirect: number;
  turnsActive: number;
  hazardDamageTaken: number;
  setupMovesUsed: number;
  favorableCrits: number;
  favorableMisses: number;
  favorableFlinches: number;
  favorableParalysis: number;
  favorableFreezes: number;
  favorableBurns: number;
  favorableSleep: number;
  hpRestored: number;
  movesUsed: Record<string, number>;
  revealedItems: Array<{
    item: string;
    turn: number;
    source: string;
  }>;
}

interface TurnSnapshot {
  turn: number;
  p1TotalHp: number;
  p2TotalHp: number;
}

interface KeyEvent {
  turn: number;
  type: "faint" | "win";
  player: string;
  pokemon?: string;
  cause?: string;
  killer?: string;
  killerPlayer?: string;
  move?: string;
}

interface ParsedReplay {
  tier: string | null;
  p1Username: string;
  p2Username: string;
  p1Team: PokemonStats[];
  p2Team: PokemonStats[];
  winner: "p1" | "p2" | null;
  p1Remaining: number;
  p2Remaining: number;
  startedAt: string | null;
  endedAt: string | null;
  zoroarkInvolved: boolean;
  turnSnapshots: TurnSnapshot[];
  keyEvents: KeyEvent[];
}

interface ActiveTurnCreditEvent {
  turn: number;
  player: "p1" | "p2";
  nickname: string;
  pokemon: string;
  credit: number;
  reason: string;
}

interface PlayerRef {
  player: "p1" | "p2";
  nickname: string;
  move?: string;
}

const SETUP_MOVES = new Set([
  "agility",
  "amnesia",
  "autotomize",
  "aqua step",
  "aura wheel",
  "belly drum",
  "bulk up",
  "calm mind",
  "charge beam",
  "clangorous soul",
  "coil",
  "cosmic power",
  "cotton guard",
  "curse",
  "defend order",
  "dragon dance",
  "flame charge",
  "gear up",
  "growth",
  "hone claws",
  "iron defense",
  "meteor beam",
  "nasty plot",
  "no retreat",
  "power-up punch",
  "quiver dance",
  "rock polish",
  "shift gear",
  "shell smash",
  "stockpile",
  "stuff cheeks",
  "swords dance",
  "tail glow",
  "tidy up",
  "trailblaze",
  "victory dance",
  "work up",
]);

function isHazardDamageCause(cause: string) {
  const lower = cause.toLowerCase();
  return lower.includes("spikes") ||
    lower.includes("stealth rock") ||
    lower.includes("rocks") ||
    lower.includes("sticky web");
}

const PIVOT_MOVES = new Set([
  "baton pass",
  "chilly reception",
  "flip turn",
  "parting shot",
  "shed tail",
  "teleport",
  "u-turn",
  "volt switch",
]);

const CHAMPIONS_NATDEX_DRAFT_TIER = "[Gen 9 Champions] NatDex Draft";

function shouldPreserveMegaFormsForTier(tier: string | null) {
  return tier === CHAMPIONS_NATDEX_DRAFT_TIER;
}

function isParalysisCantMove(effect: string) {
  const lower = effect.toLowerCase();
  return lower === "par" || lower.includes("paralysis") || lower.includes("fully paralyzed");
}

function isFlinchCantMove(effect: string) {
  return effect.toLowerCase().includes("flinch");
}

function isWillOWisp(source: string) {
  const normalized = source.toLowerCase().replace(/[^a-z]/g, "");
  return normalized === "willowisp";
}

function buildReplayJsonCandidates(replayUrl: string): string[] {
  const rawUrl = replayUrl.trim();
  if (!rawUrl) return [];

  const url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Replay URL must be an HTTP or HTTPS link");
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname !== "replay.pokemonshowdown.com") {
    throw new Error("Only Pokemon Showdown replay links are supported");
  }

  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "");

  const candidates: string[] = [];
  const addCandidate = (candidate: URL) => {
    const href = candidate.toString();
    if (!candidates.includes(href)) {
      candidates.push(href);
    }
  };

  const jsonUrl = new URL(url.toString());
  if (jsonUrl.pathname.endsWith(".log")) {
    jsonUrl.pathname = jsonUrl.pathname.replace(/\.log$/, ".json");
  } else if (!jsonUrl.pathname.endsWith(".json")) {
    jsonUrl.pathname = `${jsonUrl.pathname}.json`;
  }
  addCandidate(jsonUrl);

  const pathParts = url.pathname.split("/");
  const replayId = pathParts[pathParts.length - 1];
  if (replayId?.startsWith("dl-")) {
    const canonicalUrl = new URL(url.toString());
    pathParts[pathParts.length - 1] = replayId.slice(3);
    canonicalUrl.pathname = pathParts.join("/");
    canonicalUrl.pathname = canonicalUrl.pathname.endsWith(".json")
      ? canonicalUrl.pathname
      : `${canonicalUrl.pathname.replace(/\.log$/, "")}.json`;
    addCandidate(canonicalUrl);
  }

  return candidates;
}

function isMegaPokemonName(name: string): boolean {
  return /-Mega(?:-|$)/.test(name);
}

function cleanReplayPokemonName(name: string): string {
  return name
    .split(",")[0]
    .trim()
    .replace(/^\*/, "")
    .replace(/-\*$/, "")
    .replace(/-Tera$/, "");
}

function normalizeReplayPokemonName(
  name: string,
  options: { preserveMegaForm?: boolean; aliasMaps?: PokemonAliasMaps } = {}
): string {
  const cleaned = cleanReplayPokemonName(name);
  if (options.preserveMegaForm && isMegaPokemonName(cleaned)) {
    return cleaned;
  }

  return options.aliasMaps
    ? normalizePokemonNameWithAliases(name, options.aliasMaps)
    : normalizePokemonName(name);
}

function extractNicknameOwner(pokemonRef: string): { player: "p1" | "p2"; nickname: string } | null {
  const match = pokemonRef.match(/^(p[12])a?: (.+)$/);
  if (match) {
    return {
      player: match[1] as "p1" | "p2",
      nickname: match[2],
    };
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { replayUrl, preserveMegas = false, debugActiveTurns = false } = await request.json();

    if (!replayUrl) {
      return NextResponse.json({ error: "Replay URL is required" }, { status: 400 });
    }

    let replayJsonUrl = "";
    let response: Response | null = null;
    const replayJsonCandidates = buildReplayJsonCandidates(replayUrl);

    for (const candidate of replayJsonCandidates) {
      const candidateResponse = await fetch(candidate, {
        headers: { "User-Agent": "PBO-Site/1.0" },
      });

      if (candidateResponse.ok) {
        replayJsonUrl = candidate;
        response = candidateResponse;
        break;
      }

      response = candidateResponse;
    }

    if (!response || !response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch replay: ${response?.status || "invalid URL"}` },
        { status: 400 }
      );
    }

    const data = await response.json();
    const log: string = data.log;

    if (!log) {
      return NextResponse.json({ error: "No battle log found in replay" }, { status: 400 });
    }

    const lines = log.split("\n");
    const replayTier = lines
      .find((line) => line.startsWith("|tier|"))
      ?.split("|")[2]
      ?.trim() || null;
    const preserveReplayMegaForms = preserveMegas || shouldPreserveMegaFormsForTier(replayTier);
    const aliasMaps = await getPokemonAliasMaps();

    const result: ParsedReplay = {
      tier: replayTier,
      p1Username: "",
      p2Username: "",
      p1Team: [],
      p2Team: [],
      winner: null,
      p1Remaining: 0,
      p2Remaining: 0,
      startedAt: null,
      endedAt: null,
      zoroarkInvolved: false,
      turnSnapshots: [],
      keyEvents: [],
    };

    // Timestamp tracking
    let firstTimestamp: number | null = null;
    let lastTimestamp: number | null = null;

    // Nickname → actual Pokemon name maps
    const p1NicknameMap: Map<string, string> = new Map();
    const p2NicknameMap: Map<string, string> = new Map();

    // Active Pokemon tracking
    let lastDamageDealer: PlayerRef | null = null;
    let p1ActivePokemon: string | null = null;
    let p2ActivePokemon: string | null = null;
    let p1ActiveEligibleTurn = 0;
    let p2ActiveEligibleTurn = 0;
    const faintedPlayersThisTurn: Set<"p1" | "p2"> = new Set();
    const activeTurnsByPokemon: Map<string, Map<number, number>> = new Map();
    const activeTurnCreditEvents: ActiveTurnCreditEvent[] = [];

    // Hazard setter tracking
    const hazardSetterMap: Map<string, PlayerRef> = new Map();
    const spikesLayerSetters: Map<string, PlayerRef[]> = new Map();
    spikesLayerSetters.set("p1", []);
    spikesLayerSetters.set("p2", []);

    // Weather setter tracking
    let weatherSetter: PlayerRef | null = null;

    // Status inflicter tracking (poison, burn, etc.)
    const statusInflicterMap: Map<string, PlayerRef> = new Map();

    // Effect source tracking (leech seed, trapping moves, curse, etc.)
    const effectSourceMap: Map<string, PlayerRef> = new Map();

    // Future Sight / Doom Desire tracking
    const futureSightMap: Map<string, PlayerRef> = new Map();

    // Damage attribution tracking
    let lastFaintSource: string | null = null;
    let contactDamageSource: PlayerRef | null = null;
    let faintedPokemon: PlayerRef | null = null;

    // HP tracking
    const hpPercentMap: Map<string, number> = new Map();
    let currentTurn = 0;
    let lastMoveInfo: { player: "p1" | "p2"; nickname: string; moveName: string; turn: number } | null = null;
    let lastMoveOpponent: PlayerRef | null = null;
    // Showdown emits a miss when a Pokemon attacks a Phantom Force user during
    // the user's semi-invulnerable turn. That is not an accuracy/luck event.
    let phantomForceSemiInvulnerable: PlayerRef | null = null;
    const switchedInThisTurn: Set<string> = new Set();
    const switchedInThisBattleTurn: Set<string> = new Set();
    const movedThisTurn: Set<string> = new Set();
    const pendingPivotSwitches: Map<"p1" | "p2", {
      turn: number;
      pivotUser: PlayerRef;
      incoming: PlayerRef;
      incomingTookNonHazardDamage: boolean;
    }> = new Map();
    let spikesEntryHp: number | null = null;

    // Calculate total HP for a player's team
    const calculateTotalHp = (player: "p1" | "p2"): number => {
      const team = player === "p1" ? result.p1Team : result.p2Team;
      let total = 0;
      for (const pokemon of team) {
        const hp = hpPercentMap.get(`${player}:${pokemon.name}`);
        const hpValue = hp !== undefined ? Math.min(100, Math.max(0, hp)) : 100;
        total += hpValue;
      }
      return total;
    };

    const getPokemonByRef = (parsed: PlayerRef): PokemonStats | null => {
      const nicknameMap = parsed.player === "p1" ? p1NicknameMap : p2NicknameMap;
      const team = parsed.player === "p1" ? result.p1Team : result.p2Team;
      const pokemonName = nicknameMap.get(parsed.nickname);
      return pokemonName ? team.find((p) => p.name === pokemonName) || null : null;
    };

    const revealItem = (
      parsed: PlayerRef | null,
      itemName: string | undefined,
      source: string
    ) => {
      if (!parsed || !itemName) return;
      const item = itemName.replace(/^item:\s*/i, "").trim();
      if (!item) return;
      const pokemon = getPokemonByRef(parsed);
      if (!pokemon) return;
      const duplicate = pokemon.revealedItems.some(
        (entry) => entry.item.toLowerCase() === item.toLowerCase()
      );
      if (!duplicate) {
        pokemon.revealedItems.push({ item, turn: currentTurn, source });
      }
    };

    const getOpponentActiveRef = (player: "p1" | "p2"): PlayerRef | null => {
      const opponent = player === "p1" ? "p2" : "p1";
      const nickname = opponent === "p1" ? p1ActivePokemon : p2ActivePokemon;
      return nickname ? { player: opponent, nickname } : null;
    };

    const incrementFavorableEvent = (
      parsed: PlayerRef | null,
      field:
        | "favorableCrits"
        | "favorableMisses"
        | "favorableFlinches"
        | "favorableParalysis"
        | "favorableFreezes"
        | "favorableBurns"
        | "favorableSleep"
    ) => {
      if (!parsed) return;
      const pokemon = getPokemonByRef(parsed);
      if (pokemon) {
        pokemon[field]++;
      }
    };

    const recordActiveTurn = (parsed: PlayerRef, turn = currentTurn, credit = 1, reason = "active-at-turn-end") => {
      if (turn <= 0) return;
      const nicknameMap = parsed.player === "p1" ? p1NicknameMap : p2NicknameMap;
      const pokemonName = nicknameMap.get(parsed.nickname);
      if (!pokemonName) return;

      const key = `${parsed.player}:${pokemonName}`;
      if (!activeTurnsByPokemon.has(key)) {
        activeTurnsByPokemon.set(key, new Map());
      }
      const turns = activeTurnsByPokemon.get(key)!;
      turns.set(turn, Math.max(turns.get(turn) ?? 0, credit));
      if (debugActiveTurns) {
        activeTurnCreditEvents.push({
          turn,
          player: parsed.player,
          nickname: parsed.nickname,
          pokemon: pokemonName,
          credit,
          reason,
        });
      }
    };

    const resolvePendingPivotSwitches = () => {
      for (const [player, pivot] of pendingPivotSwitches) {
        if (pivot.turn !== currentTurn) continue;

        if (pivot.incomingTookNonHazardDamage) {
          recordActiveTurn(pivot.pivotUser, pivot.turn, 0.5, "pivot-user-split");
          recordActiveTurn(pivot.incoming, pivot.turn, 0.5, "pivot-incoming-damaged");
        } else {
          recordActiveTurn(pivot.pivotUser, pivot.turn, 1, "pivot-user-full");
        }

        pendingPivotSwitches.delete(player);
      }
    };

    const recordCurrentActiveTurn = () => {
      if (p1ActivePokemon && p1ActiveEligibleTurn <= currentTurn) {
        recordActiveTurn({ player: "p1", nickname: p1ActivePokemon });
      }
      if (p2ActivePokemon && p2ActiveEligibleTurn <= currentTurn) {
        recordActiveTurn({ player: "p2", nickname: p2ActivePokemon });
      }
    };

    const applyVisibleFormChange = (parsed: PlayerRef, pokemonInfo: string) => {
      if (!preserveReplayMegaForms) return;

      const pokemonName = normalizeReplayPokemonName(pokemonInfo, { preserveMegaForm: true, aliasMaps });
      if (!isMegaPokemonName(pokemonName)) return;

      const nicknameMap = parsed.player === "p1" ? p1NicknameMap : p2NicknameMap;
      const team = parsed.player === "p1" ? result.p1Team : result.p2Team;
      const previousName = nicknameMap.get(parsed.nickname);
      let pokemon = team.find((p) => p.name === previousName) || team.find((p) => p.name === pokemonName);

      if (!pokemon && previousName) {
        pokemon = team.find(
          (p) =>
            pokemonName.startsWith(p.name + "-") ||
            p.name.startsWith(previousName + "-")
        );
      }

      if (pokemon) {
        const oldHp = previousName ? hpPercentMap.get(`${parsed.player}:${previousName}`) : undefined;
        pokemon.name = pokemonName;
        nicknameMap.set(parsed.nickname, pokemonName);
        if (oldHp !== undefined) {
          hpPercentMap.delete(`${parsed.player}:${previousName}`);
          hpPercentMap.set(`${parsed.player}:${pokemonName}`, oldHp);
        }

        if (previousName && previousName !== pokemonName) {
          const oldActiveKey = `${parsed.player}:${previousName}`;
          const turns = activeTurnsByPokemon.get(oldActiveKey);
          if (turns) {
            activeTurnsByPokemon.delete(oldActiveKey);
            activeTurnsByPokemon.set(`${parsed.player}:${pokemonName}`, turns);
          }
        }
      }
    };

    for (const line of lines) {
      const parts = line.split("|");
      if (parts.length < 2) continue;

      // Many held items are revealed through their effect rather than an
      // explicit -item event (Leftovers healing, Life Orb recoil, Rocky
      // Helmet damage, Toxic Orb status, and similar Showdown messages).
      if (parts[1] !== "-item" && parts[1] !== "-enditem") {
        const fromItem = parts.find((part) => /^\[from\]\s*item:/i.test(part));
        if (fromItem) {
          const ofPart = parts.find((part) => /^\[of\]\s*p[12][a-z]?:/i.test(part));
          const ownerRef = extractNicknameOwner(
            (ofPart || parts[2] || "").replace(/^\[of\]\s*/, "")
          );
          revealItem(ownerRef, fromItem.replace(/^\[from\]\s*/i, ""), "item effect");
        }
      }

      switch (parts[1]) {
        case "t:": {
          const timestamp = parseInt(parts[2]);
          if (!isNaN(timestamp)) {
            if (firstTimestamp === null) firstTimestamp = timestamp;
            lastTimestamp = timestamp;
          }
          break;
        }

        case "player": {
          const player = parts[2];
          const username = parts[3];
          if (player === "p1") {
            result.p1Username = username;
          } else if (player === "p2") {
            result.p2Username = username;
          }
          break;
        }

        case "poke": {
          const player = parts[2];
          const pokemonInfo = parts[3];
          const pokemonName = normalizeReplayPokemonName(pokemonInfo, { preserveMegaForm: preserveReplayMegaForms, aliasMaps });

          // Detect Zoroark
          if (pokemonName === "Zoroark" || pokemonName === "Zoroark-Hisui") {
            result.zoroarkInvolved = true;
          }

          const stats: PokemonStats = {
            name: pokemonName,
            kills: 0,
            deaths: 0,
            damageDealt: 0,
            damageDealtIndirect: 0,
            damageTaken: 0,
            damageTakenIndirect: 0,
            turnsActive: 0,
            hazardDamageTaken: 0,
            setupMovesUsed: 0,
            favorableCrits: 0,
            favorableMisses: 0,
            favorableFlinches: 0,
            favorableParalysis: 0,
            favorableFreezes: 0,
            favorableBurns: 0,
            favorableSleep: 0,
            hpRestored: 0,
            movesUsed: {},
            revealedItems: [],
          };

          if (player === "p1") {
            result.p1Team.push(stats);
          } else if (player === "p2") {
            result.p2Team.push(stats);
          }
          break;
        }

        case "switch":
        case "drag": {
          const pokemonRef = parts[2];
          const pokemonInfo = parts[3];
          const parsed = extractNicknameOwner(pokemonRef);

          if (parsed && pokemonInfo) {
            const pokemonName = normalizeReplayPokemonName(pokemonInfo, { preserveMegaForm: preserveReplayMegaForms, aliasMaps });
            const team = parsed.player === "p1" ? result.p1Team : result.p2Team;
            let pokemon = team.find((p) => p.name === pokemonName);

            // Handle form changes: if exact name not found, find a base form match
            if (!pokemon) {
              const baseMatch = team.find(
                (p) =>
                  pokemonName.startsWith(p.name + "-") &&
                  !team.some((t) => t.name === pokemonName)
              );
              if (baseMatch) {
                baseMatch.name = pokemonName;
                pokemon = baseMatch;
              }
            }

            const pivotMoveInfo =
              currentTurn > 0 &&
              lastMoveInfo?.turn === currentTurn &&
              lastMoveInfo.player === parsed.player &&
              PIVOT_MOVES.has(lastMoveInfo.moveName.toLowerCase())
                ? lastMoveInfo
                : null;

            if (parsed.player === "p1") {
              p1NicknameMap.set(parsed.nickname, pokemonName);
              p1ActivePokemon = parsed.nickname;
              const isPivotSwitch = pivotMoveInfo !== null;
              p1ActiveEligibleTurn = faintedPlayersThisTurn.has("p1") || isPivotSwitch ? currentTurn + 1 : currentTurn;
              if (pivotMoveInfo) {
                pendingPivotSwitches.set("p1", {
                  turn: currentTurn,
                  pivotUser: { player: "p1", nickname: pivotMoveInfo.nickname },
                  incoming: parsed,
                  incomingTookNonHazardDamage: false,
                });
              }
            } else {
              p2NicknameMap.set(parsed.nickname, pokemonName);
              p2ActivePokemon = parsed.nickname;
              const isPivotSwitch = pivotMoveInfo !== null;
              p2ActiveEligibleTurn = faintedPlayersThisTurn.has("p2") || isPivotSwitch ? currentTurn + 1 : currentTurn;
              if (pivotMoveInfo) {
                pendingPivotSwitches.set("p2", {
                  turn: currentTurn,
                  pivotUser: { player: "p2", nickname: pivotMoveInfo.nickname },
                  incoming: parsed,
                  incomingTookNonHazardDamage: false,
                });
              }
            }

            switchedInThisTurn.add(`${parsed.player}:${parsed.nickname}`);
            switchedInThisBattleTurn.add(`${parsed.player}:${parsed.nickname}`);

            // Track HP from switch-in
            const hpPart = parts[4];
            if (hpPart) {
              const hpMatch = hpPart.match(/^(\d+)\/(\d+)/);
              if (hpMatch) {
                const current = parseInt(hpMatch[1]);
                const max = parseInt(hpMatch[2]);
                const percent = max > 0 ? (current / max) * 100 : 0;
                hpPercentMap.set(`${parsed.player}:${pokemonName}`, percent);
              }
            }
          }
          break;
        }

        case "replace": {
          // Zoroark illusion breaking — |replace|p1a: Nickname|Zoroark, L50
          const pokemonRef = parts[2];
          const pokemonInfo = parts[3];
          const parsed = extractNicknameOwner(pokemonRef);

          if (parsed && pokemonInfo) {
            const pokemonName = normalizeReplayPokemonName(pokemonInfo, { preserveMegaForm: preserveReplayMegaForms, aliasMaps });

            if (pokemonName === "Zoroark" || pokemonName === "Zoroark-Hisui") {
              result.zoroarkInvolved = true;
            }

            const nicknameMap = parsed.player === "p1" ? p1NicknameMap : p2NicknameMap;
            const activePokemon = parsed.player === "p1" ? p1ActivePokemon : p2ActivePokemon;

            // Transfer HP from the disguised Pokemon to the revealed one
            if (activePokemon) {
              const oldName = nicknameMap.get(activePokemon);
              if (oldName && oldName !== pokemonName) {
                const oldKey = `${parsed.player}:${oldName}`;
                const oldHp = hpPercentMap.get(oldKey);
              if (oldHp !== undefined) {
                hpPercentMap.set(`${parsed.player}:${pokemonName}`, oldHp);
              }

              const oldActiveKey = `${parsed.player}:${oldName}`;
              const turns = activeTurnsByPokemon.get(oldActiveKey);
              if (turns) {
                activeTurnsByPokemon.delete(oldActiveKey);
                activeTurnsByPokemon.set(`${parsed.player}:${pokemonName}`, turns);
              }
            }
            }

            if (parsed.player === "p1") {
              p1NicknameMap.set(parsed.nickname, pokemonName);
              p1ActivePokemon = parsed.nickname;
              p1ActiveEligibleTurn = currentTurn;
            } else {
              p2NicknameMap.set(parsed.nickname, pokemonName);
              p2ActivePokemon = parsed.nickname;
              p2ActiveEligibleTurn = currentTurn;
            }
          }
          break;
        }

        case "detailschange":
        case "-formechange": {
          const pokemonRef = parts[2];
          const pokemonInfo = parts[3];
          const parsed = extractNicknameOwner(pokemonRef);

          if (parsed && pokemonInfo) {
            applyVisibleFormChange(parsed, pokemonInfo);
          }
          break;
        }

        case "-item": {
          const parsed = extractNicknameOwner(parts[2]);
          const from = parts.find((part) => part.startsWith("[from]"))?.replace("[from]", "").trim();
          revealItem(parsed, parts[3], from || "item gained");
          break;
        }

        case "-enditem": {
          const parsed = extractNicknameOwner(parts[2]);
          const from = parts.find((part) => part.startsWith("[from]"))?.replace("[from]", "").trim();
          const consumed = parts.some((part) => part === "[eat]");
          revealItem(parsed, parts[3], from || (consumed ? "consumed" : "item lost"));
          break;
        }

        case "-activate": {
          const parsed = extractNicknameOwner(parts[2]);
          const itemPart = parts.find((part) => /^item:/i.test(part));
          revealItem(parsed, itemPart, "activation");
          break;
        }

        case "turn": {
          const turnNum = parseInt(parts[2]);
          if (!isNaN(turnNum)) {
            if (turnNum === 1) {
              // Push turn 0 snapshot (full HP)
              result.turnSnapshots.push({
                turn: 0,
                p1TotalHp: 600,
                p2TotalHp: 600,
              });
            } else {
              // Push snapshot for the turn that just ended
              resolvePendingPivotSwitches();
              recordCurrentActiveTurn();
              result.turnSnapshots.push({
                turn: currentTurn,
                p1TotalHp: calculateTotalHp("p1"),
                p2TotalHp: calculateTotalHp("p2"),
              });
            }
            currentTurn = turnNum;
            lastMoveOpponent = null;
            phantomForceSemiInvulnerable = null;
            faintedPlayersThisTurn.clear();
            switchedInThisBattleTurn.clear();
            movedThisTurn.clear();
          }
          break;
        }

        case "move": {
          const attackerRef = parts[2];
          const moveName = parts[3] || "unknown move";
          const parsed = extractNicknameOwner(attackerRef);
          if (parsed) {
            const opponent = parsed.player === "p1" ? "p2" : "p1";
            const opponentActive = opponent === "p1" ? p1ActivePokemon : p2ActivePokemon;
            lastMoveOpponent = opponentActive
              ? { player: opponent, nickname: opponentActive }
              : null;
            lastDamageDealer = parsed;
            lastFaintSource = null;
            lastMoveInfo = { ...parsed, moveName, turn: currentTurn };
            movedThisTurn.add(`${parsed.player}:${parsed.nickname}`);

            const pokemon = getPokemonByRef(parsed);
            const normalizedMoveName = moveName.trim().replace(/\s+/g, " ");

            if (
              normalizedMoveName.toLowerCase() === "phantom force" &&
              (parts[4] === "" || parts[5] === "[still]")
            ) {
              phantomForceSemiInvulnerable = parsed;
            }

            if (pokemon && normalizedMoveName && normalizedMoveName.toLowerCase() !== "unknown move") {
              pokemon.movesUsed[normalizedMoveName] = (pokemon.movesUsed[normalizedMoveName] || 0) + 1;
            }

            if (SETUP_MOVES.has(moveName.toLowerCase())) {
              if (pokemon) {
                pokemon.setupMovesUsed++;
              }
            }
          }
          switchedInThisTurn.clear();
          break;
        }

        case "-crit": {
          const targetRef = parts[2];
          const parsed = extractNicknameOwner(targetRef);
          if (parsed && lastDamageDealer) {
            const targetName = (parsed.player === "p1" ? p1NicknameMap : p2NicknameMap).get(parsed.nickname);
            const hpKey = targetName ? `${parsed.player}:${targetName}` : null;
            const hpBeforeHit = hpKey ? (hpPercentMap.get(hpKey) ?? 100) : 100;
            if (hpBeforeHit > 25) {
              incrementFavorableEvent(lastDamageDealer, "favorableCrits");
            }
          }
          break;
        }

        case "-miss": {
          const attacker = extractNicknameOwner(parts[2]);
          const target = extractNicknameOwner(parts[3] || "");

          if (
            target &&
            phantomForceSemiInvulnerable &&
            target.player === phantomForceSemiInvulnerable.player &&
            target.nickname === phantomForceSemiInvulnerable.nickname
          ) {
            break;
          }

          incrementFavorableEvent(target || (attacker ? getOpponentActiveRef(attacker.player) : null), "favorableMisses");
          break;
        }

        case "cant": {
          const parsed = extractNicknameOwner(parts[2]);
          const effect = parts[3] || "";
          const beneficiary = parsed ? getOpponentActiveRef(parsed.player) : null;

          if (isParalysisCantMove(effect)) {
            incrementFavorableEvent(beneficiary, "favorableParalysis");
          } else if (isFlinchCantMove(effect)) {
            incrementFavorableEvent(beneficiary, "favorableFlinches");
          }
          break;
        }

        case "-sidestart": {
          // Hazard set — |-sidestart|p1: TeamName|Spikes
          const sideRef = parts[2];
          const hazardName = parts[3] || "";
          const sideMatch = sideRef.match(/^(p[12]):/);

          if (sideMatch) {
            const targetSide = sideMatch[1] as "p1" | "p2";
            const setterSide = (targetSide === "p1" ? "p2" : "p1") as "p1" | "p2";
            const setterActive = setterSide === "p1" ? p1ActivePokemon : p2ActivePokemon;

            if (setterActive) {
              const hazardLower = hazardName.toLowerCase();

              if (hazardLower.includes("spikes") && !hazardLower.includes("toxic")) {
                const layers = spikesLayerSetters.get(targetSide)!;
                if (layers.length < 3) {
                  layers.push({ player: setterSide, nickname: setterActive });
                }
              } else if (hazardLower.includes("stealth rock") || hazardLower.includes("rocks")) {
                hazardSetterMap.set(`${targetSide}:stealthrock`, { player: setterSide, nickname: setterActive });
              } else if (hazardLower.includes("toxic spikes")) {
                hazardSetterMap.set(`${targetSide}:toxicspikes`, { player: setterSide, nickname: setterActive });
              } else {
                const key = `${targetSide}:${hazardLower.replace(/[^a-z]/g, "")}`;
                hazardSetterMap.set(key, { player: setterSide, nickname: setterActive });
              }
            }
          }
          break;
        }

        case "-sideend": {
          // Hazard cleared — |-sideend|p1: TeamName|Spikes
          const sideRef = parts[2];
          const hazardName = parts[3] || "";
          const sideMatch = sideRef.match(/^(p[12]):/);

          if (sideMatch) {
            const targetSide = sideMatch[1] as "p1" | "p2";
            const hazardLower = hazardName.toLowerCase();

            if (hazardLower.includes("spikes") && !hazardLower.includes("toxic")) {
              spikesLayerSetters.set(targetSide, []);
            } else if (hazardLower.includes("stealth rock") || hazardLower.includes("rocks")) {
              hazardSetterMap.delete(`${targetSide}:stealthrock`);
            } else if (hazardLower.includes("toxic spikes")) {
              hazardSetterMap.delete(`${targetSide}:toxicspikes`);
            }
          }
          break;
        }

        case "-weather": {
          const weatherName = parts[2];
          if (weatherName === "none") {
            weatherSetter = null;
          } else if (!line.includes("[upkeep]")) {
            const ofMatch = line.match(/\[of\] (p[12])a: (.+)/);
            const isAbility = line.includes("[from] ability:");
            if (ofMatch) {
              weatherSetter = { player: ofMatch[1] as "p1" | "p2", nickname: ofMatch[2] };
            } else if (lastDamageDealer && !isAbility) {
              weatherSetter = { ...lastDamageDealer, move: weatherName };
            }
          }
          break;
        }

        case "-status": {
          // |-status|p1a: Nickname|psn
          const targetRef = parts[2];
          const statusType = parts[3];
          const parsed = extractNicknameOwner(targetRef);

          if (parsed) {
            const key = `${parsed.player}:${parsed.nickname}`;
            const fromMatch = line.match(/\[from\] (?:move: )?(.+?)(?:\||$)/);
            const fromSource = fromMatch ? fromMatch[1].toLowerCase().trim() : "";
            const statusOfMatch = line.match(/\[of\] (p[12])a: (.+)/);
            const beneficiary = getOpponentActiveRef(parsed.player);
            const statusSource = fromSource || lastMoveInfo?.moveName || "";
            const hasOpponentInflicter =
              (statusOfMatch ? statusOfMatch[1] !== parsed.player : false) ||
              (lastMoveInfo ? lastMoveInfo.player !== parsed.player : false);
            const isSelfItemStatus = fromSource.includes("item:");

            if (statusType === "frz" && hasOpponentInflicter) {
              incrementFavorableEvent(beneficiary, "favorableFreezes");
            } else if (statusType === "brn" && hasOpponentInflicter && !isSelfItemStatus && !isWillOWisp(statusSource)) {
              incrementFavorableEvent(beneficiary, "favorableBurns");
            } else if (
              statusType === "par" &&
              fromSource.includes("ability: static") &&
              statusOfMatch &&
              statusOfMatch[1] !== parsed.player
            ) {
              incrementFavorableEvent(
                { player: statusOfMatch[1] as "p1" | "p2", nickname: statusOfMatch[2] },
                "favorableParalysis"
              );
            } else if (
              statusType === "slp" &&
              (fromSource.includes("dire claw") || lastMoveInfo?.moveName.toLowerCase() === "dire claw") &&
              hasOpponentInflicter
            ) {
              incrementFavorableEvent(beneficiary, "favorableSleep");
            }

            if ((statusType === "psn" || statusType === "tox") && fromSource.includes("toxic spikes")) {
              // Poison from toxic spikes entry
              const setter = hazardSetterMap.get(`${parsed.player}:toxicspikes`);
              if (setter) {
                statusInflicterMap.set(key, { ...setter, move: "Toxic Spikes" });
              }
            } else if (
              (statusType === "psn" || statusType === "tox") &&
              !fromSource &&
              switchedInThisTurn.has(`${parsed.player}:${parsed.nickname}`) &&
              hazardSetterMap.has(`${parsed.player}:toxicspikes`)
            ) {
              // Poison on switch-in without explicit source = toxic spikes
              const setter = hazardSetterMap.get(`${parsed.player}:toxicspikes`);
              statusInflicterMap.set(key, { ...setter!, move: "Toxic Spikes" });
            } else {
              const ofMatch = line.match(/\[of\] (p[12])a: (.+)/);
              const isAbility = line.includes("[from] ability:");

              if (ofMatch && isAbility) {
                statusInflicterMap.set(key, { player: ofMatch[1] as "p1" | "p2", nickname: ofMatch[2] });
              } else if (fromSource) {
                const opponent = parsed.player === "p1" ? "p2" : "p1";
                const opponentActive = opponent === "p1" ? p1ActivePokemon : p2ActivePokemon;
                if (opponentActive) {
                  statusInflicterMap.set(key, { player: opponent, nickname: opponentActive, move: lastMoveInfo?.moveName });
                }
              } else {
                const opponent = parsed.player === "p1" ? "p2" : "p1";
                const opponentActive = opponent === "p1" ? p1ActivePokemon : p2ActivePokemon;
                if (opponentActive) {
                  statusInflicterMap.set(key, { player: opponent, nickname: opponentActive, move: lastMoveInfo?.moveName });
                }
              }
            }
          }
          break;
        }

        case "-start": {
          // |-start|p1a: Nickname|move: Leech Seed|[of] p2a: Source
          const targetRef = parts[2];
          const effectName = (parts[3] || "").toLowerCase();
          const parsed = extractNicknameOwner(targetRef);

          if (parsed) {
            const ofMatch = line.match(/\[of\] (p[12])a: (.+)/);
            let source: PlayerRef | null = null;

            if (ofMatch) {
              source = { player: ofMatch[1] as "p1" | "p2", nickname: ofMatch[2] };
            } else {
              const opponent = parsed.player === "p1" ? "p2" : "p1";
              const opponentActive = opponent === "p1" ? p1ActivePokemon : p2ActivePokemon;
              if (opponentActive) {
                source = { player: opponent, nickname: opponentActive };
              }
            }

            if (source) {
              if (effectName.includes("future sight")) {
                const targetSide = parsed.player === "p1" ? "p2" : "p1";
                futureSightMap.set(targetSide, {
                  player: parsed.player,
                  nickname: parsed.nickname,
                  move: "Future Sight",
                });
              } else if (effectName.includes("doom desire")) {
                const targetSide = parsed.player === "p1" ? "p2" : "p1";
                futureSightMap.set(targetSide, {
                  player: parsed.player,
                  nickname: parsed.nickname,
                  move: "Doom Desire",
                });
              } else {
                // Leech Seed, Salt Cure, Curse, trapping moves, etc.
                let effectKey = "";
                let moveName = "";

                if (effectName.includes("leech seed")) { effectKey = "leechseed"; moveName = "Leech Seed"; }
                else if (effectName.includes("salt cure")) { effectKey = "saltcure"; moveName = "Salt Cure"; }
                else if (effectName.includes("curse")) { effectKey = "curse"; moveName = "Curse"; }
                else if (effectName.includes("nightmare")) { effectKey = "nightmare"; moveName = "Nightmare"; }
                else if (effectName.includes("wrap")) { effectKey = "wrap"; moveName = "Wrap"; }
                else if (effectName.includes("bind")) { effectKey = "bind"; moveName = "Bind"; }
                else if (effectName.includes("fire spin")) { effectKey = "firespin"; moveName = "Fire Spin"; }
                else if (effectName.includes("whirlpool")) { effectKey = "whirlpool"; moveName = "Whirlpool"; }
                else if (effectName.includes("sand tomb")) { effectKey = "sandtomb"; moveName = "Sand Tomb"; }
                else if (effectName.includes("magma storm")) { effectKey = "magmastorm"; moveName = "Magma Storm"; }
                else if (effectName.includes("infestation")) { effectKey = "infestation"; moveName = "Infestation"; }
                else if (effectName.includes("snap trap")) { effectKey = "snaptrap"; moveName = "Snap Trap"; }
                else if (effectName.includes("thunder cage")) { effectKey = "thundercage"; moveName = "Thunder Cage"; }
                else if (effectName.includes("clamp")) { effectKey = "clamp"; moveName = "Clamp"; }

                if (effectKey) {
                  const mapKey = `${parsed.player}:${parsed.nickname}:${effectKey}`;
                  effectSourceMap.set(mapKey, { ...source, move: moveName });
                }
              }
            }
          }
          break;
        }

        case "-activate": {
          // Trapping move damage tick — |-activate|p1a: Nickname|move: Wrap|[of] p2a: Source
          const targetRef = parts[2];
          const effectName = (parts[3] || "").toLowerCase();
          const parsed = extractNicknameOwner(targetRef);

          if (parsed) {
            const trapMoves: Record<string, string> = {
              "wrap": "Wrap",
              "bind": "Bind",
              "fire spin": "Fire Spin",
              "whirlpool": "Whirlpool",
              "sand tomb": "Sand Tomb",
              "magma storm": "Magma Storm",
              "infestation": "Infestation",
              "snap trap": "Snap Trap",
              "thunder cage": "Thunder Cage",
              "clamp": "Clamp",
            };

            let trapKey = "";
            let trapMoveName = "";
            for (const [key, name] of Object.entries(trapMoves)) {
              if (effectName.includes(key)) {
                trapKey = key.replace(/\s+/g, "");
                trapMoveName = name;
                break;
              }
            }

            // Destiny Bond: when it activates, the user's opponent is about to faint
            if (effectName.includes("destiny bond")) {
              lastFaintSource = "Destiny Bond";
              // The Destiny Bond user (parsed) gets the kill credit
              lastDamageDealer = { player: parsed.player, nickname: parsed.nickname, move: "Destiny Bond" };
            }

            if (trapKey) {
              const ofMatch = line.match(/\[of\] (p[12])a: (.+)/);
              let source: PlayerRef | null = null;

              if (ofMatch) {
                source = { player: ofMatch[1] as "p1" | "p2", nickname: ofMatch[2] };
              } else {
                const opponent = parsed.player === "p1" ? "p2" : "p1";
                const opponentActive = opponent === "p1" ? p1ActivePokemon : p2ActivePokemon;
                if (opponentActive) {
                  source = { player: opponent, nickname: opponentActive };
                }
              }

              if (source) {
                const mapKey = `${parsed.player}:${parsed.nickname}:${trapKey}`;
                effectSourceMap.set(mapKey, { ...source, move: trapMoveName });
              }
            }
          }
          break;
        }

        case "-end": {
          // Future Sight / Doom Desire resolving
          const effectName = (parts[3] || "").toLowerCase();
          if (effectName.includes("future sight")) {
            lastFaintSource = "Future Sight";
          } else if (effectName.includes("doom desire")) {
            lastFaintSource = "Doom Desire";
          }
          break;
        }

        case "-damage": {
          const targetRef = parts[2];
          const hpString = parts[3] || "";
          const isFaint = hpString.includes("0 fnt");
          const parsed = extractNicknameOwner(targetRef);
          let newHpPercent = 0;
          let damageAmount = 0;

          if (parsed) {
            const targetName = (parsed.player === "p1" ? p1NicknameMap : p2NicknameMap).get(parsed.nickname);
            const hpKey = targetName ? `${parsed.player}:${targetName}` : null;
            const oldHp = hpKey ? (hpPercentMap.get(hpKey) ?? 100) : 100;

            if (isFaint) {
              newHpPercent = 0;
            } else {
              const hpMatch = hpString.match(/^(\d+)\/(\d+)/);
              if (hpMatch) {
                const current = parseInt(hpMatch[1]);
                const max = parseInt(hpMatch[2]);
                newHpPercent = max > 0 ? (current / max) * 100 : 0;
              }
            }

            damageAmount = Math.max(0, oldHp - newHpPercent);
            if (hpKey) hpPercentMap.set(hpKey, newHpPercent);
          }

          // Skip damage events for already-fainted Pokemon
          if (faintedPokemon && parsed && (faintedPokemon.player !== parsed.player || faintedPokemon.nickname !== parsed.nickname)) {
            break;
          }

          // Check for indirect damage source
          const fromMatch = line.match(/\[from\] ([^|[\]]+)/);
          const damageCause = fromMatch?.[1]?.trim() || "";
          if (parsed && damageAmount > 0 && !isHazardDamageCause(damageCause)) {
            const pivot = pendingPivotSwitches.get(parsed.player);
            if (
              pivot &&
              pivot.turn === currentTurn &&
              pivot.incoming.player === parsed.player &&
              pivot.incoming.nickname === parsed.nickname
            ) {
              pivot.incomingTookNonHazardDamage = true;
            }
          }

          if (fromMatch) {
            lastFaintSource = damageCause;
            const sourceLower = lastFaintSource.toLowerCase();

            // Track spikes entry HP for layer attribution
            if (sourceLower.includes("spikes") && !sourceLower.includes("toxic")) {
              spikesEntryHp = newHpPercent + damageAmount;
            }

            // Contact damage attribution (Rocky Helmet, Rough Skin, etc.)
            const damageSourceLower = lastFaintSource.toLowerCase();
            if (
              damageSourceLower.includes("rocky helmet") ||
              damageSourceLower.includes("rough skin") ||
              damageSourceLower.includes("iron barbs") ||
              damageSourceLower.includes("aftermath") ||
              damageSourceLower.includes("liquid ooze") ||
              damageSourceLower.includes("innards out") ||
              damageSourceLower.includes("pickpocket")
            ) {
              const ofMatch = line.match(/\[of\] (p[12])a: (.+)/);
              if (ofMatch) {
                contactDamageSource = { player: ofMatch[1] as "p1" | "p2", nickname: ofMatch[2] };
              }
            } else {
              contactDamageSource = null;
            }

            // Attribute indirect damage
            if (parsed && damageAmount > 0) {
              const targetTeam = parsed.player === "p1" ? result.p1Team : result.p2Team;
              const targetName = (parsed.player === "p1" ? p1NicknameMap : p2NicknameMap).get(parsed.nickname);
              const targetPokemon = targetTeam.find((p) => p.name === targetName);
              if (targetPokemon) {
                targetPokemon.damageTakenIndirect += damageAmount;
                if (isHazardDamageCause(lastFaintSource)) {
                  targetPokemon.hazardDamageTaken += damageAmount;
                }
              }

              // Find who caused the indirect damage
              const cause = lastFaintSource.toLowerCase();
              let indirectSource: PlayerRef | null = null;

              if (contactDamageSource) {
                indirectSource = contactDamageSource;
              } else if (cause.includes("spikes") && !cause.includes("toxic")) {
                indirectSource = (spikesLayerSetters.get(parsed.player) || [])[0] || null;
              } else if (cause.includes("stealth rock") || cause.includes("toxic spikes")) {
                const hazardKey = `${parsed.player}:${cause.replace(/[^a-z]/g, "")}`;
                indirectSource = hazardSetterMap.get(hazardKey) || null;
              } else if (cause === "psn" || cause === "tox" || cause === "brn") {
                const statusKey = `${parsed.player}:${parsed.nickname}`;
                indirectSource = statusInflicterMap.get(statusKey) || null;
              } else if (cause === "sandstorm" || cause === "hail") {
                indirectSource = weatherSetter;
              } else if (cause.includes("leech seed") || cause.includes("salt cure") || cause.includes("curse")) {
                const effectKey = `${parsed.player}:${parsed.nickname}:${cause.replace(/[^a-z]/g, "")}`;
                indirectSource = effectSourceMap.get(effectKey) || null;
              }

              if (indirectSource) {
                const sourceTeam = indirectSource.player === "p1" ? result.p1Team : result.p2Team;
                const sourceName = (indirectSource.player === "p1" ? p1NicknameMap : p2NicknameMap).get(indirectSource.nickname);
                const sourcePokemon = sourceTeam.find((p) => p.name === sourceName);
                if (sourcePokemon) {
                  sourcePokemon.damageDealtIndirect += damageAmount;
                }
              }
            }
          } else if (lastFaintSource !== "Future Sight" && lastFaintSource !== "Doom Desire") {
            // Direct damage from the opponent's active Pokemon
            lastFaintSource = null;
            contactDamageSource = null;

            if (parsed) {
              if (parsed.player === "p1" && p2ActivePokemon) {
                lastDamageDealer = { player: "p2", nickname: p2ActivePokemon };
              } else if (parsed.player === "p2" && p1ActivePokemon) {
                lastDamageDealer = { player: "p1", nickname: p1ActivePokemon };
              }
            }

            if (parsed && damageAmount > 0) {
              const targetTeam = parsed.player === "p1" ? result.p1Team : result.p2Team;
              const targetName = (parsed.player === "p1" ? p1NicknameMap : p2NicknameMap).get(parsed.nickname);
              const targetPokemon = targetTeam.find((p) => p.name === targetName);
              if (targetPokemon) {
                targetPokemon.damageTaken += damageAmount;
              }

              if (lastDamageDealer) {
                const attackerTeam = lastDamageDealer.player === "p1" ? result.p1Team : result.p2Team;
                const attackerName = (lastDamageDealer.player === "p1" ? p1NicknameMap : p2NicknameMap).get(lastDamageDealer.nickname);
                const attackerPokemon = attackerTeam.find((p) => p.name === attackerName);
                if (attackerPokemon) {
                  attackerPokemon.damageDealt += damageAmount;
                }
              }
            }
          }

          // Mark fainted pokemon to skip subsequent damage events
          if (isFaint && parsed) {
            faintedPokemon = parsed;
          }
          break;
        }

        case "-heal": {
          const targetRef = parts[2];
          const hpString = parts[3] || "";
          const parsed = extractNicknameOwner(targetRef);

          if (parsed) {
            const pokemonName = (parsed.player === "p1" ? p1NicknameMap : p2NicknameMap).get(parsed.nickname);
            const hpKey = pokemonName ? `${parsed.player}:${pokemonName}` : null;
            const oldHp = hpKey ? (hpPercentMap.get(hpKey) ?? 100) : 100;

            const hpMatch = hpString.match(/^(\d+)\/(\d+)/);
            if (hpMatch) {
              const current = parseInt(hpMatch[1]);
              const max = parseInt(hpMatch[2]);
              const newHpPercent = Math.min(100, max > 0 ? (current / max) * 100 : 0);
              const healAmount = Math.max(0, newHpPercent - oldHp);

              if (hpKey) hpPercentMap.set(hpKey, newHpPercent);

              if (healAmount > 0 && pokemonName) {
                const team = parsed.player === "p1" ? result.p1Team : result.p2Team;
                const pokemon = team.find((p) => p.name === pokemonName);
                if (pokemon) {
                  pokemon.hpRestored += healAmount;
                }
              }
            }
          }
          break;
        }

        case "faint": {
          const pokemonRef = parts[2];
          const parsed = extractNicknameOwner(pokemonRef);

          if (parsed) {
            const nicknameMap = parsed.player === "p1" ? p1NicknameMap : p2NicknameMap;
            const team = parsed.player === "p1" ? result.p1Team : result.p2Team;
            const pokemonName = nicknameMap.get(parsed.nickname);

            // Increment deaths
            if (pokemonName) {
              const pokemon = team.find((p) => p.name === pokemonName);
              if (pokemon) {
                pokemon.deaths++;
              }
            }

            // Determine who gets the kill credit
            let killer: PlayerRef | null = null;

            if (lastFaintSource) {
              const cause = lastFaintSource.toLowerCase();

              if (cause.includes("spikes") && !cause.includes("toxic")) {
                // Spikes kill — attribute to correct layer setter
                const layers = spikesLayerSetters.get(parsed.player) || [];
                if (layers.length > 0 && spikesEntryHp !== null) {
                  let layerIndex = 0;
                  if (spikesEntryHp > 12.5 && layers.length >= 2) layerIndex = 1;
                  if (spikesEntryHp > 16.67 && layers.length >= 3) layerIndex = 2;
                  const layerSetter = layers[layerIndex] || layers[0] || null;
                  killer = layerSetter ? { ...layerSetter, move: "Spikes" } : null;
                } else if (layers.length > 0) {
                  killer = { ...layers[0], move: "Spikes" };
                }
              } else if (cause.includes("stealth rock") || cause === "rocks") {
                const setter = hazardSetterMap.get(`${parsed.player}:stealthrock`);
                killer = setter ? { ...setter, move: "Stealth Rock" } : null;
              } else if (cause.includes("sandstorm")) {
                killer = weatherSetter;
              } else if (cause === "psn" || cause === "tox" || cause === "brn") {
                const statusKey = `${parsed.player}:${parsed.nickname}`;
                killer = statusInflicterMap.get(statusKey) || null;
              } else if (cause.includes("future sight") || cause.includes("doom desire")) {
                killer = futureSightMap.get(parsed.player) || null;
              } else if (cause.includes("leech seed")) {
                const effectKey = `${parsed.player}:${parsed.nickname}:leechseed`;
                killer = effectSourceMap.get(effectKey) || null;
              } else if (cause.includes("salt cure")) {
                const effectKey = `${parsed.player}:${parsed.nickname}:saltcure`;
                killer = effectSourceMap.get(effectKey) || null;
              } else if (cause.includes("curse")) {
                const effectKey = `${parsed.player}:${parsed.nickname}:curse`;
                killer = effectSourceMap.get(effectKey) || null;
              } else if (cause.includes("nightmare") || cause.includes("bad dreams")) {
                const effectKey = `${parsed.player}:${parsed.nickname}:nightmare`;
                killer = effectSourceMap.get(effectKey) || lastDamageDealer;
              } else if (
                cause.includes("wrap") || cause.includes("bind") ||
                cause.includes("fire spin") || cause.includes("whirlpool") ||
                cause.includes("sand tomb") || cause.includes("magma storm") ||
                cause.includes("infestation") || cause.includes("snap trap") ||
                cause.includes("thunder cage") || cause.includes("clamp")
              ) {
                let trapKey = "";
                if (cause.includes("wrap")) trapKey = "wrap";
                else if (cause.includes("bind")) trapKey = "bind";
                else if (cause.includes("fire spin")) trapKey = "firespin";
                else if (cause.includes("whirlpool")) trapKey = "whirlpool";
                else if (cause.includes("sand tomb")) trapKey = "sandtomb";
                else if (cause.includes("magma storm")) trapKey = "magmastorm";
                else if (cause.includes("infestation")) trapKey = "infestation";
                else if (cause.includes("snap trap")) trapKey = "snaptrap";
                else if (cause.includes("thunder cage")) trapKey = "thundercage";
                else if (cause.includes("clamp")) trapKey = "clamp";

                const effectKey = `${parsed.player}:${parsed.nickname}:${trapKey}`;
                killer = effectSourceMap.get(effectKey) || null;
              } else if (
                cause.includes("rocky helmet") || cause.includes("rough skin") ||
                cause.includes("iron barbs") || cause.includes("aftermath") ||
                cause.includes("liquid ooze") || cause.includes("innards out")
              ) {
                killer = contactDamageSource ? { ...contactDamageSource } : null;
              } else if (cause.includes("recoil") || cause.includes("life orb")) {
                // Recoil is credited to the opposing Pokemon that was in
                // front when the move was used, even if it fainted first.
                killer = lastMoveOpponent ? { ...lastMoveOpponent } : null;
              } else if (cause.includes("destiny bond")) {
                // Destiny Bond — lastDamageDealer was set in the -activate handler
                killer = lastDamageDealer ? { ...lastDamageDealer } : null;
              } else {
                killer = lastDamageDealer ? { ...lastDamageDealer, move: lastMoveInfo?.moveName } : null;
              }
            } else {
              killer = lastDamageDealer ? { ...lastDamageDealer, move: lastMoveInfo?.moveName } : null;
            }

            // Detect self-KO moves — pokemon uses a move that faints itself
            const selfKoMoves = ["healing wish", "lunar dance", "memento", "final gambit", "explosion", "self-destruct", "misty explosion"];
            if (
              killer && killer.player === parsed.player &&
              lastMoveInfo && lastMoveInfo.player === parsed.player &&
              selfKoMoves.includes(lastMoveInfo.moveName.toLowerCase())
            ) {
              lastFaintSource = lastMoveInfo.moveName;
            }

            // Prevent self-kills — if killer is on same team, credit opponent's active
            if (killer && killer.player === parsed.player) {
              const opponent = parsed.player === "p1" ? "p2" : "p1";
              const opponentActive = opponent === "p1" ? p1ActivePokemon : p2ActivePokemon;
              killer = opponentActive ? { player: opponent, nickname: opponentActive } : null;
            }

            // Credit the kill
            if (killer && killer.player !== parsed.player) {
              const killerMap = killer.player === "p1" ? p1NicknameMap : p2NicknameMap;
              const killerTeam = killer.player === "p1" ? result.p1Team : result.p2Team;
              const killerName = killerMap.get(killer.nickname);

              if (killerName) {
                const killerPokemon = killerTeam.find((p) => p.name === killerName);
                if (killerPokemon) {
                  killerPokemon.kills++;
                }
              }
            }

            // Record key event
            const faintedName = pokemonName || "Unknown";
            const keyEvent: KeyEvent = {
              turn: currentTurn,
              type: "faint",
              player: parsed.player,
              pokemon: faintedName,
            };

            if (lastFaintSource) {
              keyEvent.cause = lastFaintSource;
            }
            if (killer) {
              keyEvent.killer = (killer.player === "p1" ? p1NicknameMap : p2NicknameMap).get(killer.nickname) || "Unknown";
              keyEvent.killerPlayer = killer.player;
              if (killer.move) {
                keyEvent.move = killer.move;
              }
            }

            result.keyEvents.push(keyEvent);
            const faintedKey = `${parsed.player}:${parsed.nickname}`;
            const pendingPivot = pendingPivotSwitches.get(parsed.player);
            const isPendingPivotIncoming =
              pendingPivot?.turn === currentTurn &&
              pendingPivot.incoming.player === parsed.player &&
              pendingPivot.incoming.nickname === parsed.nickname;
            if (
              !(isPendingPivotIncoming && pendingPivot.incomingTookNonHazardDamage)
            ) {
              recordActiveTurn(
                parsed,
                currentTurn,
                1,
                movedThisTurn.has(faintedKey)
                  ? "fainted-after-moving"
                  : switchedInThisBattleTurn.has(faintedKey)
                    ? "switch-in-fainted"
                    : "fainted-while-active"
              );
            }
            if (parsed.player === "p1" && p1ActivePokemon === parsed.nickname) {
              p1ActivePokemon = null;
              p1ActiveEligibleTurn = 0;
            } else if (parsed.player === "p2" && p2ActivePokemon === parsed.nickname) {
              p2ActivePokemon = null;
              p2ActiveEligibleTurn = 0;
            }
            faintedPlayersThisTurn.add(parsed.player);
            faintedPokemon = null;
            spikesEntryHp = null;
          }
          break;
        }

        case "win": {
          const winnerUsername = parts[2];
          let winnerPlayer: "p1" | "p2" = "p1";
          if (winnerUsername === result.p1Username) {
            result.winner = "p1";
            winnerPlayer = "p1";
          } else if (winnerUsername === result.p2Username) {
            result.winner = "p2";
            winnerPlayer = "p2";
          }

          result.keyEvents.push({ turn: currentTurn, type: "win", player: winnerPlayer });

          // Final turn snapshot
          resolvePendingPivotSwitches();
          recordCurrentActiveTurn();
          result.turnSnapshots.push({
            turn: currentTurn,
            p1TotalHp: calculateTotalHp("p1"),
            p2TotalHp: calculateTotalHp("p2"),
          });
          break;
        }
      }
    }

    // Calculate remaining Pokemon (those with 0 deaths)
    for (const player of ["p1", "p2"] as const) {
      const team = player === "p1" ? result.p1Team : result.p2Team;
      for (const pokemon of team) {
        const turns = activeTurnsByPokemon.get(`${player}:${pokemon.name}`);
        pokemon.turnsActive = turns ? [...turns.values()].reduce((total, credit) => total + credit, 0) : 0;
      }
    }

    result.p1Remaining = result.p1Team.filter((p) => p.deaths === 0).length;
    result.p2Remaining = result.p2Team.filter((p) => p.deaths === 0).length;

    // Set timestamps
    if (firstTimestamp !== null) {
      result.startedAt = new Date(firstTimestamp * 1000).toISOString();
    }
    if (lastTimestamp !== null) {
      result.endedAt = new Date(lastTimestamp * 1000).toISOString();
    }

    if (debugActiveTurns) {
      const playerTurnCredits = new Map<string, number>();
      for (const [key, turns] of activeTurnsByPokemon) {
        const player = key.startsWith("p1:") ? "p1" : "p2";
        for (const [turn, credit] of turns) {
          const playerTurnKey = `${player}:${turn}`;
          playerTurnCredits.set(playerTurnKey, (playerTurnCredits.get(playerTurnKey) ?? 0) + credit);
        }
      }

      const maxTurn = Math.max(...result.turnSnapshots.map((snapshot) => snapshot.turn), currentTurn);
      const missingActiveTurnCredits = {
        p1: [] as number[],
        p2: [] as number[],
      };

      for (let turn = 1; turn <= maxTurn; turn++) {
        if ((playerTurnCredits.get(`p1:${turn}`) ?? 0) === 0) {
          missingActiveTurnCredits.p1.push(turn);
        }
        if ((playerTurnCredits.get(`p2:${turn}`) ?? 0) === 0) {
          missingActiveTurnCredits.p2.push(turn);
        }
      }

      return NextResponse.json({
        ...result,
        replayJsonUrl,
        activeTurnCreditEvents,
        missingActiveTurnCredits,
      });
    }

    return NextResponse.json({ ...result, replayJsonUrl });
  } catch (error) {
    console.error("Error scraping replay:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to parse replay data" },
      { status: error instanceof Error ? 400 : 500 }
    );
  }
}
