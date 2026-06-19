/**
 * Thin wrapper around @smogon/calc for the broadcast overlay damage calculator.
 */
import { calculate, Pokemon, Move, Field, Generations } from "@smogon/calc";
import type { SideConditions } from "@/hooks/use-showdown-battle";

const gen = Generations.get(9);

export interface EvSpread {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

/** Common EV presets for quick selection */
export const EV_PRESETS: Record<string, EvSpread> = {
  "252/252/4 Atk": { hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 },
  "252/252/4 SpA": { hp: 0, atk: 0, def: 0, spa: 252, spd: 4, spe: 252 },
  "252 HP / 252 Def": { hp: 252, atk: 0, def: 252, spa: 0, spd: 4, spe: 0 },
  "252 HP / 252 SpD": { hp: 252, atk: 0, def: 4, spa: 0, spd: 252, spe: 0 },
  "252 HP / 252 Spe": { hp: 252, atk: 4, def: 0, spa: 0, spd: 0, spe: 252 },
  "Bulky Atk": { hp: 252, atk: 252, def: 4, spa: 0, spd: 0, spe: 0 },
  "Bulky SpA": { hp: 252, atk: 0, def: 4, spa: 252, spd: 0, spe: 0 },
  "No EVs": { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
};

export const DEFAULT_EVS: EvSpread = EV_PRESETS["252/252/4 Atk"];

export interface CalcMon {
  name: string;       // species/battleForm name for @smogon/calc
  level: number;
  ability: string | null;
  item: string | null;
  itemConsumed: boolean;
  status: string;     // "brn", "par", "psn", "tox", "slp", "frz", or ""
  hp: number;         // 0-100 percentage
  maxHp: number;
  boosts: Record<string, number>;
  terastallized: boolean;
  teraType: string | null;
  nature?: string;
  evs?: EvSpread;
}

export interface CalcFieldState {
  weather: string | null;
  terrain: string | null;
  attackerSide: SideConditions;
  defenderSide: SideConditions;
}

export interface DamageResult {
  minDmg: number;
  maxDmg: number;
  minPercent: number;
  maxPercent: number;
  koChance: string;    // e.g. "guaranteed 2HKO"
  koN: number;         // 1 for OHKO, 2 for 2HKO, etc.
  desc: string;        // full description string
}

/** Map our status abbreviations to @smogon/calc's expected format */
function mapStatus(s: string): string {
  const m: Record<string, string> = { brn: "brn", par: "par", psn: "psn", tox: "tox", slp: "slp", frz: "frz" };
  return m[s] || "";
}

/** Map our weather names to @smogon/calc Weather type */
function mapWeather(w: string | null): "Sun" | "Rain" | "Sand" | "Snow" | "Hail" | undefined {
  if (!w) return undefined;
  const lower = w.toLowerCase();
  if (lower.includes("sun") || lower.includes("drought") || lower.includes("desolate")) return "Sun";
  if (lower.includes("rain") || lower.includes("drizzle") || lower.includes("primordial")) return "Rain";
  if (lower.includes("sand") || lower.includes("sandstream")) return "Sand";
  if (lower.includes("snow")) return "Snow";
  if (lower.includes("hail")) return "Hail";
  return undefined;
}

/** Map our terrain names to @smogon/calc Terrain type */
function mapTerrain(t: string | null): "Electric" | "Grassy" | "Misty" | "Psychic" | undefined {
  if (!t) return undefined;
  const lower = t.toLowerCase();
  if (lower.includes("electric")) return "Electric";
  if (lower.includes("grassy")) return "Grassy";
  if (lower.includes("misty")) return "Misty";
  if (lower.includes("psychic")) return "Psychic";
  return undefined;
}

function buildCalcPokemon(mon: CalcMon): InstanceType<typeof Pokemon> {
  const status = mapStatus(mon.status);
  const boosts: Partial<Record<string, number>> = {};
  for (const [stat, val] of Object.entries(mon.boosts)) {
    boosts[stat] = val;
  }
  const evs = mon.evs || DEFAULT_EVS;

  // Build without curHP first so @smogon/calc computes its own maxHP from base stats + EVs
  const poke = new Pokemon(gen, mon.name, {
    level: mon.level,
    ability: mon.ability || undefined,
    item: (mon.item && !mon.itemConsumed) ? mon.item : undefined,
    nature: mon.nature || "Serious",
    evs: { hp: evs.hp, atk: evs.atk, def: evs.def, spa: evs.spa, spd: evs.spd, spe: evs.spe },
    status: (status || undefined) as "brn" | "par" | "psn" | "tox" | "slp" | "frz" | undefined,
    boosts: boosts as Partial<Record<"atk" | "def" | "spa" | "spd" | "spe", number>>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    teraType: (mon.terastallized && mon.teraType ? mon.teraType : undefined) as any,
  });

  // Showdown sends HP as a percentage (0-100) when spectating.
  // Scale it against @smogon/calc's computed maxHP so the KO chance is accurate.
  if (mon.hp < 100) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (poke as any).originalCurHP = Math.max(1, Math.round((mon.hp / 100) * poke.maxHP()));
  }

  return poke;
}

function buildField(field: CalcFieldState): InstanceType<typeof Field> {
  return new Field({
    weather: mapWeather(field.weather),
    terrain: mapTerrain(field.terrain),
    attackerSide: {
      isReflect: field.attackerSide.reflect,
      isLightScreen: field.attackerSide.lightScreen,
      isAuroraVeil: field.attackerSide.auroraVeil,
      isSR: field.attackerSide.stealthRock,
      spikes: field.attackerSide.spikes,
      isTailwind: field.attackerSide.tailwind,
    },
    defenderSide: {
      isReflect: field.defenderSide.reflect,
      isLightScreen: field.defenderSide.lightScreen,
      isAuroraVeil: field.defenderSide.auroraVeil,
      isSR: field.defenderSide.stealthRock,
      spikes: field.defenderSide.spikes,
      isTailwind: field.defenderSide.tailwind,
    },
  });
}

export function calcDamage(
  attacker: CalcMon,
  defender: CalcMon,
  moveName: string,
  field: CalcFieldState
): DamageResult | null {
  try {
    const atkPoke = buildCalcPokemon(attacker);
    const defPoke = buildCalcPokemon(defender);
    const move = new Move(gen, moveName);
    const calcField = buildField(field);

    const result = calculate(gen, atkPoke, defPoke, move, calcField);

    const [minDmg, maxDmg] = result.range();
    const defHP = defPoke.maxHP();
    const minPercent = (minDmg / defHP) * 100;
    const maxPercent = (maxDmg / defHP) * 100;

    const ko = result.kochance();

    // koN=0 with empty text means the library couldn't determine a KO;
    // derive a sensible N from the percent range instead.
    let koN = ko.n;
    let koText = ko.text;
    if (!koText) {
      if (maxPercent >= 100) {
        koN = 1; koText = "possible OHKO";
      } else if (maxPercent > 0) {
        koN = Math.ceil(100 / maxPercent);
        koText = `possible ${koN}HKO`;
      } else {
        koN = 99; koText = "no damage";
      }
    }

    return {
      minDmg,
      maxDmg,
      minPercent,
      maxPercent,
      koChance: koText,
      koN,
      desc: result.desc(),
    };
  } catch {
    return null;
  }
}
