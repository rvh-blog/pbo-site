export type SpeedCondition =
  | "none"
  | "rain"
  | "sun"
  | "sand"
  | "snow"
  | "electric-terrain"
  | "unburden"
  | "status"
  | "booster-energy"
  | "tailwind"
  | "slow-start";

export const SPEED_CONDITION_OPTIONS: Array<{ value: SpeedCondition; label: string }> = [
  { value: "none", label: "No field effect" },
  { value: "rain", label: "Rain" },
  { value: "sun", label: "Sun" },
  { value: "sand", label: "Sand" },
  { value: "snow", label: "Snow / Hail" },
  { value: "electric-terrain", label: "Electric Terrain" },
  { value: "unburden", label: "Item consumed" },
  { value: "status", label: "Statused" },
  { value: "booster-energy", label: "Booster Energy" },
  { value: "tailwind", label: "Tailwind" },
  { value: "slow-start", label: "Slow Start active" },
];

export interface ActiveSpeedEffect {
  label: string;
  multiplier: number;
  source: "ability" | "field";
}

function normalizeAbilityName(ability: string): string {
  return ability.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function getActiveSpeedEffect(
  abilities: string[],
  condition: SpeedCondition,
): ActiveSpeedEffect | null {
  const normalizedAbilities = new Set(abilities.map(normalizeAbilityName));
  const hasAbility = (name: string) => normalizedAbilities.has(normalizeAbilityName(name));
  const effects: ActiveSpeedEffect[] = [];

  if (condition === "rain" && hasAbility("Swift Swim")) {
    effects.push({ label: "Swift Swim", multiplier: 2, source: "ability" });
  }
  if (condition === "sun") {
    if (hasAbility("Chlorophyll")) {
      effects.push({ label: "Chlorophyll", multiplier: 2, source: "ability" });
    }
    if (hasAbility("Protosynthesis")) {
      effects.push({ label: "Protosynthesis (Spe)", multiplier: 1.5, source: "ability" });
    }
  }
  if (condition === "sand" && hasAbility("Sand Rush")) {
    effects.push({ label: "Sand Rush", multiplier: 2, source: "ability" });
  }
  if (condition === "snow" && hasAbility("Slush Rush")) {
    effects.push({ label: "Slush Rush", multiplier: 2, source: "ability" });
  }
  if (condition === "electric-terrain") {
    if (hasAbility("Surge Surfer")) {
      effects.push({ label: "Surge Surfer", multiplier: 2, source: "ability" });
    }
    if (hasAbility("Quark Drive")) {
      effects.push({ label: "Quark Drive (Spe)", multiplier: 1.5, source: "ability" });
    }
  }
  if (condition === "unburden" && hasAbility("Unburden")) {
    effects.push({ label: "Unburden", multiplier: 2, source: "ability" });
  }
  if (condition === "status" && hasAbility("Quick Feet")) {
    effects.push({ label: "Quick Feet", multiplier: 1.5, source: "ability" });
  }
  if (condition === "booster-energy") {
    if (hasAbility("Protosynthesis")) {
      effects.push({ label: "Protosynthesis (Spe)", multiplier: 1.5, source: "ability" });
    }
    if (hasAbility("Quark Drive")) {
      effects.push({ label: "Quark Drive (Spe)", multiplier: 1.5, source: "ability" });
    }
  }
  if (condition === "tailwind") {
    effects.push({ label: "Tailwind", multiplier: 2, source: "field" });
  }
  if (condition === "slow-start" && hasAbility("Slow Start")) {
    effects.push({ label: "Slow Start", multiplier: 0.5, source: "ability" });
  }

  return effects.sort((a, b) => b.multiplier - a.multiplier)[0] ?? null;
}

export function applySpeedEffect(speed: number, effect: ActiveSpeedEffect | null): number {
  return effect ? Math.floor(speed * effect.multiplier) : speed;
}
