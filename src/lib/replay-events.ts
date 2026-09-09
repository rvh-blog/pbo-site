import { parseLine } from "@/lib/battle-event-parser";

export interface StoredBattleEvent {
  turn: number;
  sequence: number;
  eventType: string;
  player: "p1" | "p2" | null;
  actorNickname: string | null;
  targetPlayer: "p1" | "p2" | null;
  targetNickname: string | null;
  pokemonName: string | null;
  moveName: string | null;
  itemName: string | null;
  abilityName: string | null;
  statusName: string | null;
  fieldName: string | null;
  value: number | null;
  source: string | null;
  rawLine: string;
  metadata: Record<string, unknown> | null;
}

const playerRef = (value: string | undefined) => {
  const match = value?.match(/^(p[12])a?: (.+)$/);
  return match ? { player: match[1] as "p1" | "p2", nickname: match[2] } : null;
};

/**
 * Convert every Showdown protocol line into an auditable event row. Known
 * commands receive structured columns; unknown/new commands are still kept
 * with their raw source line and protocol arguments.
 */
export function buildStoredBattleEvents(log: string): StoredBattleEvent[] {
  let turn = 0;
  let sequence = 0;
  const events: StoredBattleEvent[] = [];

  for (const sourceLine of log.split("\n")) {
    const rawLine = sourceLine.trim();
    if (!rawLine.startsWith("|")) continue;
    const parts = rawLine.split("|");
    const command = parts[1] || "unknown";
    if (command === "turn") turn = Number(parts[2]) || turn;
    const parsed = parseLine(rawLine);
    const actor = parsed?.player && parsed.nickname
      ? { player: parsed.player, nickname: parsed.nickname }
      : playerRef(parts[2]);
    const target = parsed?.targetPlayer && parsed.targetNickname
      ? { player: parsed.targetPlayer, nickname: parsed.targetNickname }
      : null;
    const numericValue = parsed?.amount ?? (
      parsed?.hp !== undefined && parsed.maxHp
        ? Math.round((parsed.hp / parsed.maxHp) * 1000) / 10
        : null
    );

    events.push({
      turn,
      sequence: sequence++,
      eventType: parsed?.type ?? (command.replace(/^-/, "") || "unknown"),
      player: actor?.player ?? parsed?.affectedSide ?? null,
      actorNickname: actor?.nickname ?? null,
      targetPlayer: target?.player ?? null,
      targetNickname: target?.nickname ?? null,
      pokemonName: parsed?.species ?? null,
      moveName: parsed?.moveName ?? (command === "move" ? parts[3] || null : null),
      itemName: parsed?.itemName ?? null,
      abilityName: parsed?.abilityName ?? null,
      statusName: parsed?.statusName ?? null,
      fieldName: parsed?.weatherName ?? parsed?.terrainName ?? parsed?.hazardName ?? parsed?.effectInfo ?? null,
      value: numericValue,
      source: parsed?.fromSource ?? null,
      rawLine,
      metadata: {
        protocolCommand: command,
        arguments: parts.slice(2),
        ...(parsed?.teraType ? { teraType: parsed.teraType } : {}),
        ...(parsed?.isUpkeep !== undefined ? { isUpkeep: parsed.isUpkeep } : {}),
        ...(parsed?.ofPlayer ? { ofPlayer: parsed.ofPlayer, ofNickname: parsed.ofNickname } : {}),
      },
    });
  }

  return events;
}
