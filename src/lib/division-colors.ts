export const DIVISION_COLORS: Record<string, string> = {
  Stargazer: "#3b82f6",
  Sunset: "#fb923c",
  Crystal: "#c084fc",
  Neon: "#4ade80",
};

// Darker shade for box-shadow on icon buttons
const DIVISION_SHADOW_COLORS: Record<string, string> = {
  Stargazer: "#1e40af",
  Sunset: "#c2410c",
  Crystal: "#7c3aed",
  Neon: "#15803d",
};

export function getDivisionColor(name: string): string {
  return DIVISION_COLORS[name] ?? "#3b82f6";
}

export function getDivisionShadowColor(name: string): string {
  return DIVISION_SHADOW_COLORS[name] ?? "#1e40af";
}
