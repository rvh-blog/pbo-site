/**
 * A double loss is stored as a forfeit with no winner. Keep this rule shared
 * so the database, result cascade, UI, and sheet sync agree on completion.
 */
export function isDoubleForfeitResult(
  winnerId: number | null | undefined,
  isForfeit: boolean | null | undefined
): boolean {
  return (winnerId === null || winnerId === undefined) && isForfeit === true;
}

export function isCompletedMatchResult(
  winnerId: number | null | undefined,
  isForfeit: boolean | null | undefined
): boolean {
  return (winnerId !== null && winnerId !== undefined) || isForfeit === true;
}
