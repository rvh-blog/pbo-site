export const DIVISION_HIERARCHY = [
  "Infinity",
  "Stargazer",
  "Sunset",
  "Crystal",
  "Neon",
] as const;

function normalizeDivisionName(name: string | null | undefined) {
  return (name ?? "").trim().toLowerCase();
}

export function getDivisionHierarchyIndex(name: string | null | undefined) {
  const normalizedName = normalizeDivisionName(name);
  const index = DIVISION_HIERARCHY.findIndex(
    (divisionName) => divisionName.toLowerCase() === normalizedName,
  );
  return index === -1 ? DIVISION_HIERARCHY.length : index;
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
