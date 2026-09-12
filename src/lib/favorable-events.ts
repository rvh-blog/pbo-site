/**
 * Replay events used by the expanded Favorable Event metric.
 *
 * The JSON event list is authoritative for expanded-format replays. Legacy
 * scalar columns remain available as a compatibility fallback for older rows.
 */
export type FavorableEventType =
  | "crit"
  | "miss"
  | "flinch"
  | "paralysis"
  | "freeze"
  | "burn"
  | "sleep"
  | "confusion"
  | "confusion-self-hit"
  | "secondary"
  | "status-turn"
  | "stat-drop";

export interface FavorableEvent {
  type: FavorableEventType;
  turn: number;
  description: string;
}

export function countFavorableEvents(
  appearance: {
    favorableEvents?: FavorableEvent[] | null;
    favorableCrits?: number | null;
    favorableMisses?: number | null;
    favorableFlinches?: number | null;
    favorableParalysis?: number | null;
    favorableFreezes?: number | null;
    favorableBurns?: number | null;
    favorableSleep?: number | null;
    favorableConfusions?: number | null;
    favorableConfusionSelfHits?: number | null;
  },
): number {
  if (appearance.favorableEvents !== null && appearance.favorableEvents !== undefined) {
    return appearance.favorableEvents.length;
  }
  return [
    appearance.favorableCrits,
    appearance.favorableMisses,
    appearance.favorableFlinches,
    appearance.favorableParalysis,
    appearance.favorableFreezes,
    appearance.favorableBurns,
    appearance.favorableSleep,
    appearance.favorableConfusions,
    appearance.favorableConfusionSelfHits,
  ].reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

export function hasFavorableEventData(
  appearance: Parameters<typeof countFavorableEvents>[0],
): boolean {
  return (appearance.favorableEvents !== null && appearance.favorableEvents !== undefined)
    || [
      appearance.favorableCrits,
      appearance.favorableMisses,
      appearance.favorableFlinches,
      appearance.favorableParalysis,
      appearance.favorableFreezes,
      appearance.favorableBurns,
      appearance.favorableSleep,
      appearance.favorableConfusions,
      appearance.favorableConfusionSelfHits,
    ].some((value) => value !== null && value !== undefined);
}
