export interface BattlefieldSpriteOverride {
  url: string;
  emergencyUrl: string;
  width: number;
  height: number;
  y: number;
  pixelated: boolean;
}

const MEGA_DRAGALGE: BattlefieldSpriteOverride = {
  // Champions/PokeAPI currently provides one static Mega Dragalge battle
  // sprite, but no separate back frame. Use the correct form art for both
  // perspectives; Showdown still owns all movement and transition animation.
  url: "/images/pokemon/sprites/10299.png",
  emergencyUrl: "/images/pokemon/sprites/691.png",
  width: 96,
  height: 96,
  y: 0,
  pixelated: true,
};

function normalizeBattlefieldSpecies(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function getBattlefieldSpriteOverride(speciesOrForm: string | null | undefined) {
  const id = normalizeBattlefieldSpecies(speciesOrForm ?? "");
  if (id === "dragalgemega" || id === "megadragalge") return MEGA_DRAGALGE;
  return null;
}

export function getBattlefieldSpriteOverrideForFailedUrl(url: string) {
  let decoded = url;
  try { decoded = decodeURIComponent(url); } catch {}
  const normalized = normalizeBattlefieldSpecies(decoded);
  if (normalized.includes("dragalgemega") || normalized.includes("megadragalge")) return MEGA_DRAGALGE;
  return null;
}
