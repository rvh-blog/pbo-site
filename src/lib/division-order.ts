export const DIVISION_HIERARCHY = [
  "Infinity",
  "Stargazer",
  "Sunset",
  "Crystal",
  "Neon",
] as const;

const HISTORICAL_DIVISION_HIERARCHY = ["Unova", "Kalos"] as const;
const ORDERED_DIVISION_NAMES = [
  ...DIVISION_HIERARCHY,
  ...HISTORICAL_DIVISION_HIERARCHY,
] as const;

function normalizeDivisionName(name: string | null | undefined) {
  return (name ?? "").trim().toLowerCase();
}

export function getDivisionHierarchyIndex(name: string | null | undefined) {
  const normalizedName = normalizeDivisionName(name);
  const index = ORDERED_DIVISION_NAMES.findIndex(
    (divisionName) => divisionName.toLowerCase() === normalizedName,
  );
  return index === -1 ? ORDERED_DIVISION_NAMES.length : index;
}

export function compareDivisionNames(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  const leftIndex = getDivisionHierarchyIndex(left);
  const rightIndex = getDivisionHierarchyIndex(right);
  if (leftIndex !== rightIndex) return leftIndex - rightIndex;
  return (left ?? "").localeCompare(right ?? "");
}

export function compareDivisions<T extends { name: string; displayOrder?: number | null }>(
  left: T,
  right: T,
) {
  const byName = compareDivisionNames(left.name, right.name);
  if (byName !== 0) return byName;
  return (left.displayOrder ?? 0) - (right.displayOrder ?? 0);
}
