export type RevealedItemEvent = {
  item: string;
  source: string;
};

export function isTransferredItemReveal(source: string) {
  return /^move:\s*(trick|switcheroo)$/i.test(source.trim());
}

export function getDistinctHeldItemNames(reveals: RevealedItemEvent[] | null | undefined) {
  const items = new Map<string, string>();

  for (const reveal of reveals ?? []) {
    const item = reveal.item.trim();
    if (!item || isTransferredItemReveal(reveal.source)) continue;
    const key = item.toLowerCase();
    if (!items.has(key)) items.set(key, item);
  }

  return [...items.values()];
}
