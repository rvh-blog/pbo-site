/**
 * Showdown battle protocol parser for live overlay.
 * Adapted from src/app/api/replay-scrape/route.ts.
 */

import { normalizePokemonName } from "@/lib/pokemon-name-utils";

export type BattleEventType =
  | "player" | "poke" | "switch" | "drag" | "move"
  | "damage" | "heal" | "faint" | "turn" | "win"
  | "chat" | "replace" | "status" | "curestatus"
  | "boost" | "unboost" | "setboost" | "clearallboost"
  | "clearpositiveboost" | "clearnegativeboost"
  | "ability" | "endability" | "item" | "enditem"
  | "start"
  | "sidestart" | "sideend" | "weather"
  | "fieldstart" | "fieldend"
  | "startEffect" | "endEffect" | "activate"
  | "formechange" | "detailschange"
  | "terastallize"
  | "teraPreview"
  | "timestamp";

export interface BattleEvent {
  type: BattleEventType;
  raw: string;
  player?: "p1" | "p2";
  username?: string;
  species?: string;
  nickname?: string;
  hp?: number;
  maxHp?: number;
  moveName?: string;
  targetNickname?: string;
  targetPlayer?: "p1" | "p2";
  turnNumber?: number;
  chatUser?: string;
  chatMessage?: string;
  statusName?: string;
  // boost events
  stat?: string;       // "atk", "def", "spa", "spd", "spe", "accuracy", "evasion"
  amount?: number;      // boost stages (e.g., 1, 2, -1)
  // ability/item events
  abilityName?: string;
  itemName?: string;
  // player avatar
  avatar?: string;
  // [from] and [of] tags (extracted from raw line)
  fromSource?: string;
  ofPlayer?: "p1" | "p2";
  ofNickname?: string;
  // Side conditions (sidestart/sideend)
  affectedSide?: "p1" | "p2";
  hazardName?: string;
  // Weather
  weatherName?: string;
  isUpkeep?: boolean;
  // Effects (-start, -end, -activate)
  effectInfo?: string;
  // Raw battle form (before normalization, e.g. "Palafin-Hero")
  battleForm?: string;
  // Terastallize type (e.g. "Fire", "Water")
  teraType?: string;
  // Tera type preview data (from |raw| message during team preview)
  teraPreviewData?: { species: string; teraType: string }[];
  // Field conditions (terrain)
  terrainName?: string;
  // Unix timestamp (seconds) from |t:| lines
  unixTimestamp?: number;
  // Pokemon level (from details string, e.g. "Pikachu, L50, M")
  level?: number;
}

function extractPlayerAndNickname(ref: string): { player: "p1" | "p2"; nickname: string } | null {
  const m = ref.match(/^(p[12])a?: (.+)$/);
  if (m) return { player: m[1] as "p1" | "p2", nickname: m[2] };
  return null;
}

function parseHp(hpStr: string): { current: number; max: number } {
  const m = hpStr.match(/^(\d+)\/(\d+)/);
  if (m) return { current: parseInt(m[1]), max: parseInt(m[2]) };
  if (hpStr === "0 fnt" || hpStr.startsWith("0 ")) return { current: 0, max: 100 };
  return { current: 100, max: 100 };
}

function extractFromTag(raw: string): string | null {
  const m = raw.match(/\[from\] ([^|[\]]+)/);
  return m ? m[1].trim() : null;
}

function extractOfTag(raw: string): { player: "p1" | "p2"; nickname: string } | null {
  const m = raw.match(/\[of\] (p[12])a: ([^|]+)/);
  return m ? { player: m[1] as "p1" | "p2", nickname: m[2].trim() } : null;
}

/**
 * Extract the raw battle form from a species string (before normalization).
 * e.g., "Palafin-Hero, L50, M" → "Palafin-Hero"
 */
export function extractBattleForm(speciesStr: string): string {
  let form = speciesStr.split(",")[0].trim();
  form = form.replace(/^\*/, "").replace(/-\*$/, "");
  return form;
}

/** Extract level from details string (e.g. "Pikachu, L50, M" → 50). Defaults to 100. */
export function extractLevel(details: string): number {
  const parts = details.split(",").map((s) => s.trim());
  for (const p of parts) {
    const m = p.match(/^L(\d+)$/);
    if (m) return parseInt(m[1], 10);
  }
  return 100;
}

export { normalizePokemonName };

/**
 * Parse a single line of Showdown protocol into a BattleEvent.
 */
export function parseLine(line: string): BattleEvent | null {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith("|")) return null;

  const parts = trimmed.split("|");
  const command = parts[1];

  switch (command) {
    case "player": {
      const player = parts[2] as "p1" | "p2";
      if (player !== "p1" && player !== "p2") return null;
      return { type: "player", raw: trimmed, player, username: parts[3] || "", avatar: parts[4] || undefined };
    }

    case "poke": {
      const player = parts[2] as "p1" | "p2";
      const pokeDetails = parts[3] || "";
      const battleForm = extractBattleForm(pokeDetails);
      const species = normalizePokemonName(pokeDetails);
      const level = extractLevel(pokeDetails);
      return { type: "poke", raw: trimmed, player, species, battleForm, level };
    }

    case "switch":
    case "drag": {
      const ref = extractPlayerAndNickname(parts[2] || "");
      if (!ref) return null;
      const detailStr = parts[3] || "";
      const battleForm = extractBattleForm(detailStr);
      const species = normalizePokemonName(detailStr);
      const level = extractLevel(detailStr);
      const hp = parseHp(parts[4] || "100/100");
      return {
        type: command === "switch" ? "switch" : "drag",
        raw: trimmed,
        player: ref.player,
        nickname: ref.nickname,
        species,
        battleForm,
        level,
        hp: hp.current,
        maxHp: hp.max,
      };
    }

    case "replace": {
      const ref = extractPlayerAndNickname(parts[2] || "");
      if (!ref) return null;
      const battleForm = extractBattleForm(parts[3] || "");
      const species = normalizePokemonName(parts[3] || "");
      return { type: "replace", raw: trimmed, player: ref.player, nickname: ref.nickname, species, battleForm };
    }

    case "move": {
      const ref = extractPlayerAndNickname(parts[2] || "");
      if (!ref) return null;
      const target = extractPlayerAndNickname(parts[4] || "");
      return {
        type: "move",
        raw: trimmed,
        player: ref.player,
        nickname: ref.nickname,
        moveName: parts[3] || "",
        targetNickname: target?.nickname,
        targetPlayer: target?.player,
      };
    }

    case "-damage":
    case "-heal": {
      const ref = extractPlayerAndNickname(parts[2] || "");
      if (!ref) return null;
      const hp = parseHp(parts[3] || "0/100");
      const from = extractFromTag(trimmed);
      const of = extractOfTag(trimmed);
      return {
        type: command === "-damage" ? "damage" : "heal",
        raw: trimmed,
        player: ref.player,
        nickname: ref.nickname,
        hp: hp.current,
        maxHp: hp.max,
        fromSource: from || undefined,
        ofPlayer: of?.player,
        ofNickname: of?.nickname,
      };
    }

    case "faint": {
      const ref = extractPlayerAndNickname(parts[2] || "");
      if (!ref) return null;
      return { type: "faint", raw: trimmed, player: ref.player, nickname: ref.nickname };
    }

    case "turn": {
      return { type: "turn", raw: trimmed, turnNumber: parseInt(parts[2] || "0") };
    }

    case "win": {
      return { type: "win", raw: trimmed, username: parts[2] || "" };
    }

    case "c":
    case "c:": {
      if (command === "c:") {
        return { type: "chat", raw: trimmed, chatUser: parts[3] || "", chatMessage: parts.slice(4).join("|") };
      }
      return { type: "chat", raw: trimmed, chatUser: parts[2] || "", chatMessage: parts.slice(3).join("|") };
    }

    case "-status": {
      const ref = extractPlayerAndNickname(parts[2] || "");
      if (!ref) return null;
      const from = extractFromTag(trimmed);
      const of = extractOfTag(trimmed);
      return {
        type: "status", raw: trimmed, player: ref.player, nickname: ref.nickname, statusName: parts[3],
        fromSource: from || undefined, ofPlayer: of?.player, ofNickname: of?.nickname,
      };
    }

    case "-curestatus": {
      const ref = extractPlayerAndNickname(parts[2] || "");
      if (!ref) return null;
      return { type: "curestatus", raw: trimmed, player: ref.player, nickname: ref.nickname, statusName: parts[3] };
    }

    // ── Stat boosts ──
    case "-boost": {
      // |-boost|p1a: Nickname|atk|2
      const ref = extractPlayerAndNickname(parts[2] || "");
      if (!ref) return null;
      return { type: "boost", raw: trimmed, player: ref.player, nickname: ref.nickname, stat: parts[3], amount: parseInt(parts[4] || "1") };
    }

    case "-unboost": {
      // |-unboost|p1a: Nickname|def|1
      const ref = extractPlayerAndNickname(parts[2] || "");
      if (!ref) return null;
      return { type: "unboost", raw: trimmed, player: ref.player, nickname: ref.nickname, stat: parts[3], amount: parseInt(parts[4] || "1") };
    }

    case "-setboost": {
      // |-setboost|p1a: Nickname|atk|6
      const ref = extractPlayerAndNickname(parts[2] || "");
      if (!ref) return null;
      return { type: "setboost", raw: trimmed, player: ref.player, nickname: ref.nickname, stat: parts[3], amount: parseInt(parts[4] || "0") };
    }

    case "-clearallboost": {
      // |-clearallboost|p1a: Nickname
      const ref = extractPlayerAndNickname(parts[2] || "");
      if (!ref) return null;
      return { type: "clearallboost", raw: trimmed, player: ref.player, nickname: ref.nickname };
    }

    case "-clearpositiveboost": {
      const ref = extractPlayerAndNickname(parts[2] || "");
      if (!ref) return null;
      return { type: "clearpositiveboost", raw: trimmed, player: ref.player, nickname: ref.nickname };
    }

    case "-clearnegativeboost": {
      const ref = extractPlayerAndNickname(parts[2] || "");
      if (!ref) return null;
      return { type: "clearnegativeboost", raw: trimmed, player: ref.player, nickname: ref.nickname };
    }

    // ── Ability / Item ──
    case "-ability": {
      // |-ability|p1a: Nickname|Intimidate|boost
      const ref = extractPlayerAndNickname(parts[2] || "");
      if (!ref) return null;
      return { type: "ability", raw: trimmed, player: ref.player, nickname: ref.nickname, abilityName: parts[3] };
    }

    case "-endability": {
      const ref = extractPlayerAndNickname(parts[2] || "");
      if (!ref) return null;
      return { type: "endability", raw: trimmed, player: ref.player, nickname: ref.nickname };
    }

    case "-item": {
      // |-item|p1a: Nickname|Leftovers|[from] ability: Frisk
      const ref = extractPlayerAndNickname(parts[2] || "");
      if (!ref) return null;
      return { type: "item", raw: trimmed, player: ref.player, nickname: ref.nickname, itemName: parts[3] };
    }

    case "-enditem": {
      // |-enditem|p1a: Nickname|Air Balloon
      const ref = extractPlayerAndNickname(parts[2] || "");
      if (!ref) return null;
      return { type: "enditem", raw: trimmed, player: ref.player, nickname: ref.nickname, itemName: parts[3] };
    }

    case "-sidestart": {
      const sideMatch = (parts[2] || "").match(/^(p[12]):/);
      if (!sideMatch) return null;
      return { type: "sidestart", raw: trimmed, affectedSide: sideMatch[1] as "p1" | "p2", hazardName: parts[3] || "" };
    }

    case "-sideend": {
      const sideMatch = (parts[2] || "").match(/^(p[12]):/);
      if (!sideMatch) return null;
      return { type: "sideend", raw: trimmed, affectedSide: sideMatch[1] as "p1" | "p2", hazardName: parts[3] || "" };
    }

    case "-weather": {
      const of = extractOfTag(trimmed);
      return {
        type: "weather", raw: trimmed, weatherName: parts[2] || "",
        isUpkeep: trimmed.includes("[upkeep]"),
        fromSource: extractFromTag(trimmed) || undefined,
        ofPlayer: of?.player, ofNickname: of?.nickname,
      };
    }

    case "-fieldstart": {
      // |-fieldstart|move: Electric Terrain
      const fieldName = (parts[2] || "").replace(/^move:\s*/i, "").trim();
      return { type: "fieldstart", raw: trimmed, terrainName: fieldName };
    }

    case "-fieldend": {
      // |-fieldend|move: Electric Terrain
      const fieldName = (parts[2] || "").replace(/^move:\s*/i, "").trim();
      return { type: "fieldend", raw: trimmed, terrainName: fieldName };
    }

    case "-start": {
      const ref = extractPlayerAndNickname(parts[2] || "");
      if (!ref) return null;
      const of = extractOfTag(trimmed);
      return {
        type: "startEffect", raw: trimmed, player: ref.player, nickname: ref.nickname,
        effectInfo: parts[3] || "", ofPlayer: of?.player, ofNickname: of?.nickname,
      };
    }

    case "-end": {
      const ref = extractPlayerAndNickname(parts[2] || "");
      if (!ref) return null;
      return { type: "endEffect", raw: trimmed, player: ref.player, nickname: ref.nickname, effectInfo: parts[3] || "" };
    }

    case "-activate": {
      const ref = extractPlayerAndNickname(parts[2] || "");
      if (!ref) return null;
      const of = extractOfTag(trimmed);
      return {
        type: "activate", raw: trimmed, player: ref.player, nickname: ref.nickname,
        effectInfo: parts[3] || "", ofPlayer: of?.player, ofNickname: of?.nickname,
      };
    }

    case "-formechange":
    case "detailschange": {
      const ref = extractPlayerAndNickname(parts[2] || "");
      if (!ref) return null;
      const battleForm = extractBattleForm(parts[3] || "");
      const species = normalizePokemonName(parts[3] || "");
      return {
        type: command === "-formechange" ? "formechange" : "detailschange",
        raw: trimmed,
        player: ref.player,
        nickname: ref.nickname,
        species,
        battleForm,
      };
    }

    case "-terastallize": {
      const ref = extractPlayerAndNickname(parts[2] || "");
      if (!ref) return null;
      return {
        type: "terastallize",
        raw: trimmed,
        player: ref.player,
        nickname: ref.nickname,
        teraType: parts[3]?.trim() || undefined,
      };
    }

    case "start": {
      return { type: "start", raw: trimmed };
    }

    case "t:": {
      const ts = parseInt(parts[2] || "0", 10);
      if (ts > 0) return { type: "timestamp", raw: trimmed, unixTimestamp: ts };
      return null;
    }

    case "raw": {
      const rawContent = parts.slice(2).join("|");
      // Detect tera type preview: "Player's Tera Types:<br /><psicon pokemon="..." /><psicon type="..." />"
      if (rawContent.includes("Tera Types:") && rawContent.includes("psicon")) {
        const entries: { species: string; teraType: string }[] = [];
        // Match pairs of <psicon pokemon="X" /><psicon type="Y" />
        const pairRegex = /psicon pokemon="([^"]+)"[^/]*\/>\s*<psicon type="([^"]+)"/gi;
        let match;
        while ((match = pairRegex.exec(rawContent)) !== null) {
          entries.push({
            species: match[1],
            teraType: match[2],
          });
        }
        if (entries.length > 0) {
          // Determine player from the message text (e.g. "p1's Tera Types:" or username)
          // The raw message is per-side, but we don't know which player from the raw alone.
          // We'll send it without player and resolve in the hook using species matching.
          return { type: "teraPreview", raw: trimmed, teraPreviewData: entries };
        }
      }
      return null;
    }

    default:
      return null;
  }
}

/**
 * Parse a block of Showdown protocol messages (multiple lines).
 */
export function parseMessages(text: string): BattleEvent[] {
  return text
    .split("\n")
    .map(parseLine)
    .filter((e): e is BattleEvent => e !== null);
}
