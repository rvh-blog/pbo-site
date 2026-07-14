const BATTLE_ROOM_PATTERN = /battle-[a-z0-9]+-\d+(?:-[a-z0-9]+)?/i;
const REPLAY_ROOM_PATTERN = /(?:^|\/)([a-z0-9]+-\d+(?:-[a-z0-9]+)?)(?:[/?#]|$)/i;

export function extractShowdownRoomId(value: string | null | undefined): string | null {
  if (!value) return null;
  const battleRoom = value.match(BATTLE_ROOM_PATTERN)?.[0];
  if (battleRoom) return battleRoom.toLowerCase();

  const replayRoom = value.match(REPLAY_ROOM_PATTERN)?.[1];
  return replayRoom ? `battle-${replayRoom.toLowerCase()}` : null;
}

export function extractShowdownFormatId(value: string | null | undefined): string | null {
  return extractShowdownRoomId(value)?.match(/^battle-([a-z0-9]+)-\d+/i)?.[1] || null;
}
