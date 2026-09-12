import Image from "next/image";
import type { EnrichedAppearance } from "./experimental-stats-client";
import { countFavorableEvents, hasFavorableEventData } from "@/lib/favorable-events";

type MetricAccumulator = {
  numerator: number;
  denominator: number;
  samples: number;
};

export type SignatureStatsRow = {
  id: number;
  name: string;
  spriteUrl: string | null;
  seasons: string[];
  appearances: number;
  wins: number;
  damagePerTurn: MetricAccumulator;
  damagePerMove: MetricAccumulator;
  kosPerTenTurns: MetricAccumulator;
  healingPerTurn: MetricAccumulator;
  setupRate: MetricAccumulator;
  favorableEventRate: MetricAccumulator;
};

const number = (value: number, digits = 0) => value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
const totalDamage = (appearance: EnrichedAppearance) => appearance.damageDealt !== null || appearance.damageDealtIndirect !== null
  ? (appearance.damageDealt ?? 0) + (appearance.damageDealtIndirect ?? 0)
  : null;
const moveUses = (appearance: EnrichedAppearance) => appearance.moveDataRecorded
  ? Object.values(appearance.movesUsed).reduce((sum, count) => sum + count, 0)
  : null;
const favorableEvents = (appearance: EnrichedAppearance) => hasFavorableEventData(appearance)
  ? countFavorableEvents(appearance)
  : null;
const emptyMetric = (): MetricAccumulator => ({ numerator: 0, denominator: 0, samples: 0 });
const addMetric = (metric: MetricAccumulator, numerator: number, denominator: number) => {
  if (denominator <= 0) return;
  metric.numerator += numerator;
  metric.denominator += denominator;
  metric.samples += 1;
};

export function buildSignatureStats(appearances: EnrichedAppearance[]) {
  const rows = new Map<number, SignatureStatsRow>();
  for (const appearance of appearances) {
    const row = rows.get(appearance.pokemonId) ?? {
      id: appearance.pokemonId,
      name: appearance.pokemonName,
      spriteUrl: appearance.spriteUrl,
      seasons: [],
      appearances: 0,
      wins: 0,
      damagePerTurn: emptyMetric(),
      damagePerMove: emptyMetric(),
      kosPerTenTurns: emptyMetric(),
      healingPerTurn: emptyMetric(),
      setupRate: emptyMetric(),
      favorableEventRate: emptyMetric(),
    };
    if (!row.seasons.includes(appearance.match.seasonName)) row.seasons.push(appearance.match.seasonName);
    row.appearances += 1;
    row.wins += appearance.won ? 1 : 0;

    const damage = totalDamage(appearance);
    const turns = appearance.turnsActive;
    const moves = moveUses(appearance);
    const healing = appearance.hpRestored;
    const setup = appearance.setupMovesUsed;
    const favorable = favorableEvents(appearance);

    if (damage !== null && turns !== null && turns > 0) addMetric(row.damagePerTurn, damage, turns);
    if (damage !== null && moves !== null && moves > 0) addMetric(row.damagePerMove, damage, moves);
    if (turns !== null && turns > 0) addMetric(row.kosPerTenTurns, appearance.kills * 10, turns);
    if (healing !== null && turns !== null && turns > 0) addMetric(row.healingPerTurn, healing, turns);
    if (setup !== null && moves !== null && moves > 0) addMetric(row.setupRate, setup, moves);
    if (favorable !== null && moves !== null && moves > 0) addMetric(row.favorableEventRate, favorable, moves);
    rows.set(appearance.pokemonId, row);
  }

  return [...rows.values()].sort((a, b) => b.appearances - a.appearances || metricValue(b.damagePerTurn) - metricValue(a.damagePerTurn) || a.name.localeCompare(b.name));
}

function metricValue(metric: MetricAccumulator) {
  return metric.denominator > 0 ? metric.numerator / metric.denominator : 0;
}

function metricText(metric: MetricAccumulator, multiplier = 1, digits = 2, suffix = "") {
  return metric.denominator > 0 ? `${number(metricValue(metric) * multiplier, digits)}${suffix}` : "—";
}

function MetricCell({ metric, multiplier = 1, digits = 2, suffix = "" }: { metric: MetricAccumulator; multiplier?: number; digits?: number; suffix?: string }) {
  return <td className="p-3 text-center"><div className="font-mono font-black text-white">{metricText(metric, multiplier, digits, suffix)}</div><div className="mt-1 text-[9px] text-[var(--foreground-muted)]">{metric.samples ? `${metric.samples} covered` : "No coverage"}</div></td>;
}

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="rounded-2xl border border-slate-700/70 bg-gradient-to-br from-slate-950/95 to-slate-900/70 p-4 text-center"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</div><div className="mt-2 break-words font-mono text-lg font-black text-white sm:text-xl">{value}</div>{detail ? <div className="mt-1 text-[10px] text-[var(--foreground-subtle)]">{detail}</div> : null}</div>;
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function SignatureStatsReport({ appearances, minimumAppearances }: { appearances: EnrichedAppearance[]; minimumAppearances: number }) {
  const rows = buildSignatureStats(appearances).filter((row) => row.appearances >= minimumAppearances);
  const damageCovered = appearances.filter((appearance) => totalDamage(appearance) !== null).length;
  const movesCovered = appearances.filter((appearance) => moveUses(appearance) !== null).length;
  const exportRows = [
    ["Pokemon", "Season(s)", "Appearances", "Record", "Damage / active turn", "Damage / move", "KOs / 10 turns", "Healing / active turn", "Setup rate", "Favorable event rate"],
    ...rows.map((row) => [
      row.name,
      row.seasons.join(", "),
      row.appearances,
      `${row.wins}-${row.appearances - row.wins}`,
      metricText(row.damagePerTurn),
      metricText(row.damagePerMove),
      metricText(row.kosPerTenTurns),
      metricText(row.healingPerTurn),
      metricText(row.setupRate, 100, 1, "%"),
      metricText(row.favorableEventRate, 100, 1, "%"),
    ]),
  ];

  return <section className="space-y-4">
    <div className="poke-card border-violet-400/20 bg-violet-500/[0.03] p-5 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="font-pixel text-sm text-white">Signature Stats</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--foreground-muted)]">Opportunity-normalized Pokémon rates built from saved replay fields. These are descriptive signatures, not a composite grade; every row shows how many appearances support each rate.</p></div>
        <button type="button" onClick={() => downloadCsv("pbo-signature-stats.csv", exportRows)} className="btn-retro-secondary px-3 py-2 text-[9px]">CSV</button>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Qualified Pokémon" value={number(rows.length)} detail={`${minimumAppearances}+ appearances`} />
        <StatCard label="Filtered appearances" value={number(appearances.length)} />
        <StatCard label="Damage coverage" value={`${number(appearances.length ? damageCovered / appearances.length * 100 : 0, 1)}%`} detail={`${damageCovered} appearances`} />
        <StatCard label="Move coverage" value={`${number(appearances.length ? movesCovered / appearances.length * 100 : 0, 1)}%`} detail={`${movesCovered} appearances`} />
      </div>
    </div>

    <div className="poke-card p-5 md:p-6">
      <div className="mb-4"><h3 className="font-pixel text-xs text-white">Normalized Pokémon signatures</h3><p className="mt-1 text-[10px] leading-4 text-[var(--foreground-muted)]">Damage per active turn and healing per active turn use shared appearances where both fields are saved. Setup rate counts recognized stat-boosting/setup move uses—such as Swords Dance, Dragon Dance, Calm Mind, Nasty Plot, Agility, Shell Smash, and Tidy Up—once per recorded use, divided by recorded move attempts. No stat stages or missing values are inferred.</p><div className="mt-3 rounded-lg border border-amber-400/25 bg-amber-500/[0.05] p-3 text-[10px] leading-4 text-[var(--foreground-muted)]"><strong className="text-amber-100">Favorable event rate:</strong> explicitly recorded crits, misses, flinches, opponent-applied secondary effects (status or stat drops), and each recorded turn where an opponent is asleep, frozen, or fully paralyzed, divided by recorded move uses. A dash means the replay did not save the required field. Expanded event coverage begins with Season 11 Week 6 and later seasons; Seasons 5–10 and Season 11 Weeks 1–5 retain the legacy format.</div></div>
      {rows.length ? <div className="mobile-scroll-region overflow-x-auto rounded-xl border border-[var(--border)]" tabIndex={0} aria-label="Normalized Pokémon signatures table"><table className="w-full min-w-[1100px] text-xs"><thead className="bg-[var(--background)] text-[9px] uppercase text-[var(--foreground-muted)]"><tr><th className="p-3 text-left">Pokémon</th><th className="font-black text-white">Season(s)</th><th className="font-black text-white">Apps</th><th className="font-black text-white">Record</th><th>DMG / active turn</th><th>DMG / move</th><th>KOs / 10 turns</th><th>Healing / active turn</th><th>Setup rate</th><th>Favorable event rate</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-[var(--border)]"><td className="p-3"><div className="flex items-center gap-3">{row.spriteUrl ? <Image src={row.spriteUrl} alt="" width={40} height={40} className="h-10 w-10 shrink-0 object-contain" /> : null}<div className="font-bold text-white">{row.name}</div></div></td><td className="max-w-40 text-center text-[10px] font-semibold text-white">{row.seasons.join(", ")}</td><td className="text-center font-mono font-black text-cyan-200">{row.appearances}</td><td className="text-center font-mono font-black"><span className="text-emerald-300">{row.wins}</span><span className="text-white/60">-</span><span className="text-rose-300">{row.appearances - row.wins}</span></td><MetricCell metric={row.damagePerTurn} /><MetricCell metric={row.damagePerMove} /><MetricCell metric={row.kosPerTenTurns} /><MetricCell metric={row.healingPerTurn} /><MetricCell metric={row.setupRate} multiplier={100} digits={1} suffix="%" /><MetricCell metric={row.favorableEventRate} multiplier={100} digits={1} suffix="%" /></tr>)}</tbody></table></div> : <p className="text-xs text-[var(--foreground-muted)]">No Pokémon meet the current appearance threshold and filters.</p>}
    </div>

    <div className="grid gap-3 md:grid-cols-3">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><h3 className="text-xs font-black text-white">Damage / active turn</h3><p className="mt-1 text-[10px] leading-4 text-[var(--foreground-muted)]">Total direct plus indirect damage divided by saved turns active.</p></div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><h3 className="text-xs font-black text-white">KOs / 10 turns</h3><p className="mt-1 text-[10px] leading-4 text-[var(--foreground-muted)]">Recorded KOs divided by saved active turns, scaled to ten turns.</p></div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><h3 className="text-xs font-black text-white">Event rates</h3><p className="mt-1 text-[10px] leading-4 text-[var(--foreground-muted)]">Setup rate is separate from Favorable Event Rate. Favorable events include explicitly saved crits, misses, flinches, opponent-applied status/stat-drop effects, and each recorded blocked turn from sleep, freeze, or full paralysis; all are divided by recorded move uses.</p></div>
    </div>
  </section>;
}
