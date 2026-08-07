"use client";

import { useMemo, useState } from "react";
import { calculate, Field, Generations, Move, Pokemon } from "@smogon/calc";
import type { State } from "@smogon/calc";

const gen = Generations.get(9);
const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
const BOOST_KEYS = ["atk", "def", "spa", "spd", "spe"] as const;
const NATURES = Array.from(gen.natures, (nature) => nature.name).sort();
const SPECIES = Array.from(gen.species, (species) => species.name).sort();
const MOVES = Array.from(gen.moves, (move) => move.name).filter((name) => name !== "(No Move)").sort();
const ITEMS = ["", ...Array.from(gen.items, (item) => item.name).sort()];
const ABILITIES = ["", ...Array.from(gen.abilities, (ability) => ability.name).sort()];
const TYPES = Array.from(gen.types, (type) => type.name).filter((type) => type !== "???");

type StatKey = typeof STAT_KEYS[number];
type BoostKey = typeof BOOST_KEYS[number];
type SpreadMode = "ev" | "sp";

type MonState = {
  species: string;
  level: number;
  nature: string;
  ability: string;
  item: string;
  status: string;
  hpPercent: number;
  teraType: string;
  teraActive: boolean;
  spreadMode: SpreadMode;
  ivs: Record<StatKey, number>;
  spread: Record<StatKey, number>;
  boosts: Record<BoostKey, number>;
  moves: string[];
};

type SideState = {
  reflect: boolean;
  lightScreen: boolean;
  auroraVeil: boolean;
  helpingHand: boolean;
  friendGuard: boolean;
  tailwind: boolean;
  stealthRock: boolean;
  spikes: number;
  protected: boolean;
};

type FieldState = {
  gameType: "Singles" | "Doubles";
  weather: string;
  terrain: string;
  gravity: boolean;
  swordOfRuin: boolean;
  beadsOfRuin: boolean;
  tabletsOfRuin: boolean;
  vesselOfRuin: boolean;
  left: SideState;
  right: SideState;
};

const emptySide = (): SideState => ({
  reflect: false,
  lightScreen: false,
  auroraVeil: false,
  helpingHand: false,
  friendGuard: false,
  tailwind: false,
  stealthRock: false,
  spikes: 0,
  protected: false,
});

function defaultMon(species: string, moves: string[]): MonState {
  return {
    species,
    level: 50,
    nature: "Serious",
    ability: "",
    item: "",
    status: "",
    hpPercent: 100,
    teraType: "Normal",
    teraActive: false,
    spreadMode: "sp",
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    spread: { hp: 0, atk: 32, def: 0, spa: 0, spd: 2, spe: 32 },
    boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    moves,
  };
}

function statPointsToEvs(spread: Record<StatKey, number>) {
  return Object.fromEntries(
    STAT_KEYS.map((stat) => [stat, spread[stat] === 0 ? 0 : spread[stat] * 8 - 4])
  ) as Record<StatKey, number>;
}

function buildPokemon(mon: MonState) {
  const evs = mon.spreadMode === "sp" ? statPointsToEvs(mon.spread) : mon.spread;
  const pokemon = new Pokemon(gen, mon.species, {
    level: mon.level,
    nature: mon.nature as State.Pokemon["nature"],
    ability: (mon.ability || undefined) as State.Pokemon["ability"],
    item: (mon.item || undefined) as State.Pokemon["item"],
    status: (mon.status || undefined) as State.Pokemon["status"],
    teraType: (mon.teraActive ? mon.teraType : undefined) as State.Pokemon["teraType"],
    ivs: mon.ivs,
    evs,
    boosts: mon.boosts,
  });
  pokemon.originalCurHP = Math.max(1, Math.round(pokemon.maxHP() * mon.hpPercent / 100));
  return pokemon;
}

function buildSide(side: SideState): State.Side {
  return {
    isReflect: side.reflect,
    isLightScreen: side.lightScreen,
    isAuroraVeil: side.auroraVeil,
    isHelpingHand: side.helpingHand,
    isFriendGuard: side.friendGuard,
    isTailwind: side.tailwind,
    isSR: side.stealthRock,
    spikes: side.spikes,
    isProtected: side.protected,
  };
}

function buildField(field: FieldState, reverse = false) {
  const attackerSide = reverse ? field.right : field.left;
  const defenderSide = reverse ? field.left : field.right;
  return new Field({
    gameType: field.gameType,
    weather: (field.weather || undefined) as State.Field["weather"],
    terrain: (field.terrain || undefined) as State.Field["terrain"],
    isGravity: field.gravity,
    isSwordOfRuin: field.swordOfRuin,
    isBeadsOfRuin: field.beadsOfRuin,
    isTabletsOfRuin: field.tabletsOfRuin,
    isVesselOfRuin: field.vesselOfRuin,
    attackerSide: buildSide(attackerSide),
    defenderSide: buildSide(defenderSide),
  });
}

function runCalc(attacker: MonState, defender: MonState, moveName: string, field: FieldState, reverse = false) {
  try {
    const atk = buildPokemon(attacker);
    const def = buildPokemon(defender);
    const move = new Move(gen, moveName);
    const result = calculate(gen, atk, def, move, buildField(field, reverse));
    const [min, max] = result.range();
    const hp = def.maxHP();
    return {
      min,
      max,
      minPercent: min / hp * 100,
      maxPercent: max / hp * 100,
      ko: result.kochance().text || "No guaranteed KO",
      description: result.desc(),
    };
  } catch {
    return null;
  }
}

function NumberInput({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(event) => onChange(Math.max(min, Math.min(max, Number(event.target.value) || 0)))}
      className="w-full rounded border border-[var(--background-tertiary)] bg-[var(--background)] px-2 py-1.5 text-center text-xs text-white"
    />
  );
}

function MonEditor({ label, mon, setMon }: { label: string; mon: MonState; setMon: (next: MonState) => void }) {
  const species = gen.species.get(mon.species.toLowerCase().replace(/[^a-z0-9]+/g, "") as never);
  const totalSpread = Object.values(mon.spread).reduce((sum, value) => sum + value, 0);
  const spreadMax = mon.spreadMode === "sp" ? 32 : 252;
  const totalMax = mon.spreadMode === "sp" ? 66 : 510;

  function patch(patchValue: Partial<MonState>) {
    setMon({ ...mon, ...patchValue });
  }

  return (
    <section className="rounded-xl border border-[var(--card-border)] bg-[var(--background-secondary)] p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--primary)]">{label}</p>
          <h2 className="mt-1 text-xl font-bold text-white">{mon.species}</h2>
        </div>
        <div className="text-right text-xs text-[var(--foreground-muted)]">
          <div>{species?.types.join(" / ") || "Unknown type"}</div>
          <div>{species ? `${species.baseStats.hp} HP · ${species.baseStats.spe} Spe` : ""}</div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold uppercase text-[var(--foreground-muted)] sm:col-span-2">
          Pokemon
          <input list="damage-species" value={mon.species} onChange={(event) => patch({ species: event.target.value })} className="mt-1 w-full rounded border border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-sm normal-case text-white" />
        </label>
        <label className="text-xs font-bold uppercase text-[var(--foreground-muted)]">Level<NumberInput value={mon.level} min={1} max={100} onChange={(level) => patch({ level })} /></label>
        <label className="text-xs font-bold uppercase text-[var(--foreground-muted)]">Current HP %<NumberInput value={mon.hpPercent} min={1} max={100} onChange={(hpPercent) => patch({ hpPercent })} /></label>
        <label className="text-xs font-bold uppercase text-[var(--foreground-muted)]">Nature<select value={mon.nature} onChange={(event) => patch({ nature: event.target.value })} className="mt-1 w-full rounded border border-[var(--background-tertiary)] bg-[var(--background)] px-2 py-2 text-sm normal-case text-white">{NATURES.map((nature) => <option key={nature}>{nature}</option>)}</select></label>
        <label className="text-xs font-bold uppercase text-[var(--foreground-muted)]">Status<select value={mon.status} onChange={(event) => patch({ status: event.target.value })} className="mt-1 w-full rounded border border-[var(--background-tertiary)] bg-[var(--background)] px-2 py-2 text-sm normal-case text-white"><option value="">Healthy</option><option value="brn">Burned</option><option value="par">Paralyzed</option><option value="psn">Poisoned</option><option value="tox">Badly Poisoned</option><option value="slp">Asleep</option><option value="frz">Frozen</option></select></label>
        <label className="text-xs font-bold uppercase text-[var(--foreground-muted)]">Ability<input list="damage-abilities" value={mon.ability} onChange={(event) => patch({ ability: event.target.value })} className="mt-1 w-full rounded border border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-sm normal-case text-white" /></label>
        <label className="text-xs font-bold uppercase text-[var(--foreground-muted)]">Item<input list="damage-items" value={mon.item} onChange={(event) => patch({ item: event.target.value })} className="mt-1 w-full rounded border border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-sm normal-case text-white" /></label>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg bg-[var(--background)]/60 p-2">
        <button type="button" onClick={() => patch({ spreadMode: "sp", spread: { hp: 0, atk: 32, def: 0, spa: 0, spd: 2, spe: 32 } })} className={`rounded px-3 py-1 text-xs font-bold ${mon.spreadMode === "sp" ? "bg-[var(--primary)] text-white" : "text-[var(--foreground-muted)]"}`}>Stat Points</button>
        <button type="button" onClick={() => patch({ spreadMode: "ev", spread: { hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 } })} className={`rounded px-3 py-1 text-xs font-bold ${mon.spreadMode === "ev" ? "bg-[var(--primary)] text-white" : "text-[var(--foreground-muted)]"}`}>EVs</button>
        <span className={`ml-auto text-xs font-bold ${totalSpread > totalMax ? "text-red-400" : "text-[var(--foreground-muted)]"}`}>{totalSpread}/{totalMax}</span>
      </div>

      <div className="mt-3 grid grid-cols-6 gap-1.5">
        {STAT_KEYS.map((stat) => (
          <label key={stat} className="text-center text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">
            {stat}
            <NumberInput value={mon.spread[stat]} min={0} max={spreadMax} onChange={(value) => patch({ spread: { ...mon.spread, [stat]: value } })} />
            <span className="mt-1 block font-normal">IV {mon.ivs[stat]}</span>
          </label>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-5 gap-1.5">
        {BOOST_KEYS.map((stat) => (
          <label key={stat} className="text-center text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">
            {stat} stage
            <NumberInput value={mon.boosts[stat]} min={-6} max={6} onChange={(value) => patch({ boosts: { ...mon.boosts, [stat]: value } })} />
          </label>
        ))}
      </div>

      <div className="mt-4 flex items-end gap-3">
        <label className="flex flex-1 items-center gap-2 text-xs font-bold text-[var(--foreground-muted)]"><input type="checkbox" checked={mon.teraActive} onChange={(event) => patch({ teraActive: event.target.checked })} /> Terastallized</label>
        <select value={mon.teraType} onChange={(event) => patch({ teraType: event.target.value })} disabled={!mon.teraActive} className="rounded border border-[var(--background-tertiary)] bg-[var(--background)] px-2 py-1.5 text-xs text-white disabled:opacity-40">{TYPES.map((type) => <option key={type}>{type}</option>)}</select>
      </div>
    </section>
  );
}

function SideToggles({ title, side, setSide }: { title: string; side: SideState; setSide: (side: SideState) => void }) {
  const toggles: [keyof SideState, string][] = [["reflect", "Reflect"], ["lightScreen", "Light Screen"], ["auroraVeil", "Aurora Veil"], ["helpingHand", "Helping Hand"], ["friendGuard", "Friend Guard"], ["tailwind", "Tailwind"], ["stealthRock", "Stealth Rock"], ["protected", "Protect"]];
  return <div><p className="mb-2 text-xs font-bold uppercase text-white">{title}</p><div className="flex flex-wrap gap-2">{toggles.map(([key, label]) => <label key={key} className="flex items-center gap-1.5 rounded border border-[var(--background-tertiary)] px-2 py-1 text-xs text-[var(--foreground-muted)]"><input type="checkbox" checked={Boolean(side[key])} onChange={(event) => setSide({ ...side, [key]: event.target.checked })} />{label}</label>)}<label className="flex items-center gap-2 text-xs text-[var(--foreground-muted)]">Spikes<select value={side.spikes} onChange={(event) => setSide({ ...side, spikes: Number(event.target.value) })} className="rounded bg-[var(--background)] px-2 py-1 text-white"><option>0</option><option>1</option><option>2</option><option>3</option></select></label></div></div>;
}

export function DevDamageCalculator() {
  const [left, setLeft] = useState(() => defaultMon("Garchomp", ["Earthquake", "Dragon Claw", "Rock Slide", "Protect"]));
  const [right, setRight] = useState(() => defaultMon("Corviknight", ["Brave Bird", "Body Press", "U-turn", "Roost"]));
  const [selected, setSelected] = useState({ side: "left" as "left" | "right", index: 0 });
  const [field, setField] = useState<FieldState>({ gameType: "Singles", weather: "", terrain: "", gravity: false, swordOfRuin: false, beadsOfRuin: false, tabletsOfRuin: false, vesselOfRuin: false, left: emptySide(), right: emptySide() });

  const results = useMemo(() => ({
    left: left.moves.map((move) => runCalc(left, right, move, field)),
    right: right.moves.map((move) => runCalc(right, left, move, field, true)),
  }), [field, left, right]);
  const detail = results[selected.side][selected.index];

  function updateMove(side: "left" | "right", index: number, move: string) {
    const mon = side === "left" ? left : right;
    const moves = mon.moves.slice();
    moves[index] = move;
    (side === "left" ? setLeft : setRight)({ ...mon, moves });
  }

  function swapSides() {
    setLeft(right);
    setRight(left);
    setField({ ...field, left: field.right, right: field.left });
    setSelected((current) => ({ side: current.side === "left" ? "right" : "left", index: current.index }));
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 pb-12">
      <datalist id="damage-species">{SPECIES.map((name) => <option key={name} value={name} />)}</datalist>
      <datalist id="damage-moves">{MOVES.map((name) => <option key={name} value={name} />)}</datalist>
      <datalist id="damage-items">{ITEMS.map((name) => <option key={name} value={name} />)}</datalist>
      <datalist id="damage-abilities">{ABILITIES.map((name) => <option key={name} value={name} />)}</datalist>

      <header className="poke-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-red-400">Development Only · Unreleased</p><h1 className="mt-1 text-3xl font-bold text-white">PBO Damage Laboratory</h1><p className="mt-1 text-sm text-[var(--foreground-muted)]">A full manual Generation 9 matchup calculator powered by @smogon/calc.</p></div>
        <button type="button" onClick={swapSides} className="btn-retro">Swap Sides</button>
      </header>

      <div className="grid gap-5 xl:grid-cols-2"><MonEditor label="Pokemon 1" mon={left} setMon={setLeft} /><MonEditor label="Pokemon 2" mon={right} setMon={setRight} /></div>

      <section className="poke-card p-5">
        <div className="grid gap-5 xl:grid-cols-2">
          {(["left", "right"] as const).map((side) => {
            const mon = side === "left" ? left : right;
            return <div key={side}><h2 className="mb-3 text-sm font-bold uppercase text-white">{mon.species}&apos;s Moves</h2><div className="space-y-2">{mon.moves.map((move, index) => { const result = results[side][index]; const active = selected.side === side && selected.index === index; return <button type="button" key={index} onClick={() => setSelected({ side, index })} className={`grid w-full grid-cols-[1fr_auto] items-center gap-3 rounded-lg border p-3 text-left ${active ? "border-[var(--primary)] bg-[var(--primary)]/10" : "border-[var(--background-tertiary)] bg-[var(--background-secondary)]"}`}><input list="damage-moves" value={move} onClick={(event) => event.stopPropagation()} onChange={(event) => updateMove(side, index, event.target.value)} className="min-w-0 bg-transparent text-sm font-bold text-white outline-none" /><span className="font-mono text-sm text-[var(--foreground-muted)]">{result ? `${result.minPercent.toFixed(1)}–${result.maxPercent.toFixed(1)}%` : "—"}</span></button>; })}</div></div>;
          })}
        </div>
        <div className="mt-5 rounded-xl border border-[var(--primary)]/30 bg-[var(--background)] p-4">
          {detail ? <><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase text-[var(--foreground-subtle)]">Detailed Result</p><p className="mt-1 text-2xl font-bold text-white">{detail.min}–{detail.max} damage <span className="text-[var(--primary)]">({detail.minPercent.toFixed(1)}–{detail.maxPercent.toFixed(1)}%)</span></p></div><p className="font-bold text-emerald-300">{detail.ko}</p></div><p className="mt-3 text-sm text-[var(--foreground-muted)]">{detail.description}</p></> : <p className="text-sm text-red-300">Choose valid Pokemon and move names to calculate damage.</p>}
        </div>
      </section>

      <section className="poke-card space-y-5 p-5">
        <div className="grid gap-3 sm:grid-cols-3"><label className="text-xs font-bold uppercase text-[var(--foreground-muted)]">Battle Type<select value={field.gameType} onChange={(event) => setField({ ...field, gameType: event.target.value as FieldState["gameType"] })} className="mt-1 w-full rounded bg-[var(--background)] px-3 py-2 text-white"><option>Singles</option><option>Doubles</option></select></label><label className="text-xs font-bold uppercase text-[var(--foreground-muted)]">Weather<select value={field.weather} onChange={(event) => setField({ ...field, weather: event.target.value })} className="mt-1 w-full rounded bg-[var(--background)] px-3 py-2 text-white"><option value="">None</option><option>Sun</option><option>Rain</option><option>Sand</option><option>Snow</option><option>Harsh Sunshine</option><option>Heavy Rain</option><option>Strong Winds</option></select></label><label className="text-xs font-bold uppercase text-[var(--foreground-muted)]">Terrain<select value={field.terrain} onChange={(event) => setField({ ...field, terrain: event.target.value })} className="mt-1 w-full rounded bg-[var(--background)] px-3 py-2 text-white"><option value="">None</option><option>Electric</option><option>Grassy</option><option>Misty</option><option>Psychic</option></select></label></div>
        <div className="flex flex-wrap gap-2">{(["gravity", "swordOfRuin", "beadsOfRuin", "tabletsOfRuin", "vesselOfRuin"] as const).map((key) => <label key={key} className="flex items-center gap-2 rounded border border-[var(--background-tertiary)] px-2 py-1 text-xs text-[var(--foreground-muted)]"><input type="checkbox" checked={field[key]} onChange={(event) => setField({ ...field, [key]: event.target.checked })} />{{ gravity: "Gravity", swordOfRuin: "Sword of Ruin", beadsOfRuin: "Beads of Ruin", tabletsOfRuin: "Tablets of Ruin", vesselOfRuin: "Vessel of Ruin" }[key]}</label>)}</div>
        <div className="grid gap-5 xl:grid-cols-2"><SideToggles title="Pokemon 1 Side" side={field.left} setSide={(leftSide) => setField({ ...field, left: leftSide })} /><SideToggles title="Pokemon 2 Side" side={field.right} setSide={(rightSide) => setField({ ...field, right: rightSide })} /></div>
      </section>
    </div>
  );
}
