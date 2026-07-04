export const DIVISION_COLORS: Record<string, string> = {
  Infinity: "#E2A3C7",
  Infinty: "#E2A3C7",
  Stargazer: "#3b82f6",
  Sunset: "#fb923c",
  Crystal: "#c084fc",
  Neon: "#4ade80",
};

// Darker shade for box-shadow on icon buttons
const DIVISION_SHADOW_COLORS: Record<string, string> = {
  Infinity: "#B85A8D",
  Infinty: "#B85A8D",
  Stargazer: "#1e40af",
  Sunset: "#c2410c",
  Crystal: "#7c3aed",
  Neon: "#15803d",
};

export function getDivisionColor(name: string): string {
  const normalizedName = name.trim().toLowerCase();
  const matchedKey = Object.keys(DIVISION_COLORS).find(
    (divisionName) => divisionName.toLowerCase() === normalizedName
  );

  return matchedKey ? DIVISION_COLORS[matchedKey] : "#3b82f6";
}

export function getDivisionShadowColor(name: string): string {
  const normalizedName = name.trim().toLowerCase();
  const matchedKey = Object.keys(DIVISION_SHADOW_COLORS).find(
    (divisionName) => divisionName.toLowerCase() === normalizedName
  );

  return matchedKey ? DIVISION_SHADOW_COLORS[matchedKey] : "#1e40af";
}
