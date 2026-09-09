import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { battleEvents } from "@/lib/schema";
import type { StoredBattleEvent } from "@/lib/replay-events";

export async function replaceBattleEvents(matchId: number, events: StoredBattleEvent[] | null | undefined) {
  if (!Array.isArray(events)) return;
  await db.delete(battleEvents).where(eq(battleEvents.matchId, matchId));
  for (let offset = 0; offset < events.length; offset += 250) {
    const chunk = events.slice(offset, offset + 250);
    if (!chunk.length) continue;
    await db.insert(battleEvents).values(chunk.map((event) => ({
      matchId,
      turn: event.turn,
      sequence: event.sequence,
      eventType: event.eventType,
      player: event.player,
      actorNickname: event.actorNickname,
      targetPlayer: event.targetPlayer,
      targetNickname: event.targetNickname,
      pokemonName: event.pokemonName,
      moveName: event.moveName,
      itemName: event.itemName,
      abilityName: event.abilityName,
      statusName: event.statusName,
      fieldName: event.fieldName,
      value: event.value,
      source: event.source,
      rawLine: event.rawLine,
      metadata: event.metadata,
    })));
  }
}
