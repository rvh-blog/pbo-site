"use client";

import { memo, useMemo, useState, type ComponentProps } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer as RechartsResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EntityAggregate, EnrichedAppearance, ExperimentalMatch } from "./experimental-stats-client";
import { buildSignatureStats, type SignatureStatsRow } from "./experimental-signature-stats";
import { buildTeamStats, buildTopPlays, type TopPlayRecord } from "./experimental-team-reports";
import { hasFavorableEventData } from "@/lib/favorable-events";

type StableResponsiveContainerProps = ComponentProps<typeof RechartsResponsiveContainer>;
function ResponsiveContainer({ initialDimension = { width: 1, height: 1 }, ...props }: StableResponsiveContainerProps) {
  return <RechartsResponsiveContainer {...props} initialDimension={initialDimension} />;
}

const number = (value: number, digits = 0) => value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
const metricValue = (metric: { numerator: number; denominator: number }) => metric.denominator > 0 ? metric.numerator / metric.denominator : 0;
const totalDamage = (appearance: EnrichedAppearance) => appearance.damageDealt !== null || appearance.damageDealtIndirect !== null
  ? (appearance.damageDealt ?? 0) + (appearance.damageDealtIndirect ?? 0)
  : null;
const moveUses = (appearance: EnrichedAppearance) => appearance.moveDataRecorded
  ? Object.values(appearance.movesUsed).reduce((sum, count) => sum + count, 0)
  : null;
const shortName = (name: string, length = 16) => name.length > length ? `${name.slice(0, length - 1)}…` : name;

function VisualCard({ title, description, children, className = "" }: { title: string; description: string; children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 md:p-5 ${className}`}><h3 className="font-pixel text-xs text-white">{title}</h3><p className="mt-1 text-[10px] leading-4 text-[var(--foreground-muted)]">{description}</p><div className="mt-4">{children}</div></section>;
}

function ChartBox({ children, height = 270 }: { children: React.ReactNode; height?: number }) {
  return <div style={{ height, minWidth: 1, minHeight: 1 }} className="min-w-0 w-full">{children}</div>;
}

function TeamAxisTick({ x = 0, y = 0, payload }: { x?: number; y?: number; payload?: { value?: string } }) {
  return <text x={x - 8} y={y} textAnchor="end" dominantBaseline="middle" fill="var(--foreground-muted)" fontSize={12} fontWeight={500}>{payload?.value ?? ""}</text>;
}

function wrapAxisLabel(value: string, maxChars = 32) {
  const lines: string[] = [];
  let line = "";
  for (const word of value.split(/\s+/).filter(Boolean)) {
    if (word.length > maxChars) {
      if (line) {
        lines.push(line);
        line = "";
      }
      for (let index = 0; index < word.length; index += maxChars) lines.push(word.slice(index, index + maxChars));
    } else if (!line) {
      line = word;
    } else if (`${line} ${word}`.length <= maxChars) {
      line = `${line} ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function WrappedCategoryAxisTick({ x = 0, y = 0, payload }: { x?: number; y?: number; payload?: { value?: string } }) {
  const lines = wrapAxisLabel(payload?.value ?? "");
  const lineHeight = 13;
  const firstLineOffset = -((lines.length - 1) * lineHeight) / 2;
  return <text x={x - 8} y={y} textAnchor="end" fill="var(--foreground-muted)" fontSize={11} fontWeight={500}>{lines.map((line, index) => <tspan key={`${line}-${index}`} x={x - 8} dy={index === 0 ? firstLineOffset : lineHeight}>{line}</tspan>)}</text>;
}

type ChartContext = { label: string; value: string | number };

type ScatterPoint = {
  name?: string;
  x?: number;
  y?: number;
  context?: ChartContext[];
};

function ScatterPointTooltip({ active, payload, xLabel, yLabel, xDigits = 1, yDigits = 1, xSuffix = "", ySuffix = "" }: { active?: boolean; payload?: Array<{ payload?: ScatterPoint }>; xLabel: string; yLabel: string; xDigits?: number; yDigits?: number; xSuffix?: string; ySuffix?: string }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return <div className="rounded-xl border border-[var(--border)] bg-[var(--background-secondary)] px-3 py-2 text-[10px] text-[var(--foreground)] shadow-xl"><div className="mb-2 font-bold text-[var(--foreground)]">{point.name ?? "Selected point"}</div><div className="font-mono text-[var(--foreground-muted)]">{xLabel}: {point.x === undefined ? "—" : `${number(point.x, xDigits)}${xSuffix}`}</div><div className="mt-1 font-mono text-[var(--foreground-muted)]">{yLabel}: {point.y === undefined ? "—" : `${number(point.y, yDigits)}${ySuffix}`}</div>{point.context?.length ? <div className="mt-2 space-y-1 border-t border-[var(--border)] pt-2">{point.context.map((item) => <div key={item.label} className="flex justify-between gap-4 font-mono"><span className="text-[var(--foreground-muted)]">{item.label}</span><span className="text-[var(--foreground)]">{item.value}</span></div>)}</div> : null}</div>;
}

type RankedMetricRow = { name: string; fullName: string; value: number };

function RankedMetricTooltip({ active, payload, xLabel, suffix }: { active?: boolean; payload?: Array<{ payload?: RankedMetricRow; value?: number | string }>; xLabel: string; suffix: string }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return <div className="max-w-[280px] rounded-xl border border-[var(--border)] bg-[var(--background-secondary)] px-3 py-2 text-[10px] text-[var(--foreground)] shadow-xl"><div className="mb-2 break-words font-bold text-[var(--foreground)]">{point.fullName}</div><div className="font-mono text-[var(--foreground-muted)]">{xLabel}: {number(Number(payload?.[0]?.value ?? point.value), 2)}{suffix}</div></div>;
}

function RankedMetricChart({ title, description, rows, color, suffix = "", xLabel = "Metric value", yLabel = "Pokémon", calculation }: { title: string; description: string; rows: RankedMetricRow[]; color: string; suffix?: string; xLabel?: string; yLabel?: string; calculation?: string }) {
  const height = Math.max(360, rows.length * 42 + 84);
  return <VisualCard title={title} description={description}>
    {rows.length ? <><p className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--background-secondary)] px-3 py-2 text-[10px] leading-4 text-[var(--foreground-muted)]"><span className="font-bold text-[var(--foreground)]">How calculated:</span> {calculation ?? "Values are calculated from the active filtered replay scope."}</p><ChartBox height={height}><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} layout="vertical" margin={{ top: 8, right: 18, bottom: 34, left: 44 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--background-tertiary)" horizontal={false} /><XAxis type="number" tick={{ fill: "var(--foreground-muted)", fontSize: 10 }} tickFormatter={(value) => `${value}${suffix}`} label={{ value: xLabel, position: "insideBottom", offset: -18, fill: "var(--foreground-muted)", fontSize: 10 }} /><YAxis type="category" dataKey="name" width={210} interval={0} tick={<WrappedCategoryAxisTick />} label={{ value: yLabel, angle: -90, position: "left", offset: 12, fill: "var(--foreground-muted)", fontSize: 10 }} /><Tooltip content={<RankedMetricTooltip xLabel={xLabel} suffix={suffix} />} /><Bar dataKey="value" fill={color} radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></ChartBox></> : <p className="py-12 text-center text-xs text-[var(--foreground-muted)]">No qualified data is available.</p>}
  </VisualCard>;
}

function signatureMetricRows(rows: SignatureStatsRow[], getValue: (row: SignatureStatsRow) => number) {
  return rows.filter((row) => getValue(row) > 0).sort((a, b) => getValue(b) - getValue(a)).slice(0, 10).map((row) => ({ name: row.name, fullName: `${row.name} · ${row.seasons.join(", ")}`, value: getValue(row), appearances: row.appearances }));
}

function SignatureVisuals({ appearances, minimumAppearances }: { appearances: EnrichedAppearance[]; minimumAppearances: number }) {
  const rows = useMemo(() => buildSignatureStats(appearances).filter((row) => row.appearances >= minimumAppearances), [appearances, minimumAppearances]);
  const scatterRows = rows.filter((row) => row.damagePerTurn.denominator > 0 && row.kosPerTenTurns.denominator > 0).map((row) => ({ name: row.name, x: metricValue(row.damagePerTurn), y: metricValue(row.kosPerTenTurns), z: Math.max(4, row.appearances), context: [{ label: "Season(s)", value: row.seasons.join(", ") }, { label: "Appearances", value: row.appearances }, { label: "Record", value: `${row.wins}-${row.appearances - row.wins}` }, { label: "Damage coverage", value: `${row.damagePerTurn.denominator}/${row.appearances}` }] }));
  const usageRows = rows.filter((row) => row.appearances > 0).map((row) => ({ name: row.name, x: row.appearances, y: row.wins / row.appearances * 100, z: Math.max(4, metricValue(row.damagePerTurn)), context: [{ label: "Season(s)", value: row.seasons.join(", ") }, { label: "Record", value: `${row.wins}-${row.appearances - row.wins}` }, { label: "Damage / active turn", value: number(metricValue(row.damagePerTurn), 1) }] }));
  const coverageMetrics = [
    { label: "DMG / active turn", get: (row: SignatureStatsRow) => row.damagePerTurn.samples },
    { label: "DMG / move", get: (row: SignatureStatsRow) => row.damagePerMove.samples },
    { label: "KOs / 10 turns", get: (row: SignatureStatsRow) => row.kosPerTenTurns.samples },
    { label: "Healing / active turn", get: (row: SignatureStatsRow) => row.healingPerTurn.samples },
    { label: "Setup rate", get: (row: SignatureStatsRow) => row.setupRate.samples },
    { label: "Favorable event rate", get: (row: SignatureStatsRow) => row.favorableEventRate.samples },
  ];
  const coverageRows = rows.slice(0, 14);
  const coveragePercent = (row: SignatureStatsRow, get: (row: SignatureStatsRow) => number) => row.appearances ? get(row) / row.appearances * 100 : 0;

  return <>
    <div className="grid gap-4 xl:grid-cols-2">
      <VisualCard title="Signature performance map" description="Damage efficiency versus knockout pace. Bubble size represents qualified appearances.">
        {scatterRows.length ? <ChartBox><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 12, right: 18, bottom: 46, left: 60 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--background-tertiary)" /><XAxis type="number" dataKey="x" name="Damage / active turn" tick={{ fill: "var(--foreground-muted)", fontSize: 10 }} tickFormatter={(value) => number(Number(value), 0)} label={{ value: "Damage / active turn", position: "insideBottom", offset: -28, fill: "var(--foreground-muted)", fontSize: 10 }} /><YAxis type="number" dataKey="y" name="KOs / 10 turns" tick={{ fill: "var(--foreground-muted)", fontSize: 10 }} tickFormatter={(value) => number(Number(value), 1)} label={{ value: "KOs / 10 turns", angle: -90, position: "insideLeft", offset: 10, fill: "var(--foreground-muted)", fontSize: 10 }} /><Tooltip cursor={{ strokeDasharray: "3 3" }} content={<ScatterPointTooltip xLabel="Damage / active turn" yLabel="KOs / 10 turns" xDigits={1} yDigits={2} />} /><Scatter data={scatterRows} fill="#a78bfa" /></ScatterChart></ResponsiveContainer></ChartBox> : <p className="py-12 text-center text-xs text-[var(--foreground-muted)]">No qualified signature data is available.</p>}
      </VisualCard>
      <VisualCard title="Usage versus appearance win rate" description="Higher placement means a Pokémon wins more of its recorded team appearances; bubble size represents damage per active turn.">
        {usageRows.length ? <ChartBox><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 12, right: 18, bottom: 46, left: 60 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--background-tertiary)" /><XAxis type="number" dataKey="x" name="Appearances" tick={{ fill: "var(--foreground-muted)", fontSize: 10 }} label={{ value: "Appearances", position: "insideBottom", offset: -28, fill: "var(--foreground-muted)", fontSize: 10 }} /><YAxis type="number" dataKey="y" name="Appearance win rate" domain={[0, 100]} tick={{ fill: "var(--foreground-muted)", fontSize: 10 }} tickFormatter={(value) => `${value}%`} label={{ value: "Appearance win rate", angle: -90, position: "insideLeft", offset: 10, fill: "var(--foreground-muted)", fontSize: 10 }} /><Tooltip content={<ScatterPointTooltip xLabel="Appearances" yLabel="Appearance win rate" xDigits={0} yDigits={1} ySuffix="%" />} /><Scatter data={usageRows} fill="#22d3ee" /></ScatterChart></ResponsiveContainer></ChartBox> : <p className="py-12 text-center text-xs text-[var(--foreground-muted)]">No qualified appearance data is available.</p>}
      </VisualCard>
    </div>
    <div className="grid items-start gap-4 xl:grid-cols-2">
      <RankedMetricChart title="Damage efficiency leaders" description="Top qualified Pokémon by recorded damage per active turn." rows={signatureMetricRows(rows, (row) => metricValue(row.damagePerTurn))} color="#a78bfa" xLabel="Damage / active turn" />
      <RankedMetricChart title="KO pace leaders" description="Top qualified Pokémon by recorded KOs per ten active turns." rows={signatureMetricRows(rows, (row) => metricValue(row.kosPerTenTurns))} color="#f472b6" xLabel="KOs / 10 turns" />
      <RankedMetricChart title="Damage per move leaders" description="Top qualified Pokémon by recorded damage per explicitly recorded move use." rows={signatureMetricRows(rows, (row) => metricValue(row.damagePerMove))} color="#22d3ee" xLabel="Damage / move" />
      <RankedMetricChart title="Setup rate leaders" description="Top qualified Pokémon by recognized setup-move uses divided by recorded move uses." calculation="A setup use is one explicitly recorded use of a recognized stat-boosting or setup move, such as Swords Dance, Dragon Dance, Calm Mind, Nasty Plot, Agility, Shell Smash, or Tidy Up. Each use counts once; stat stages and missing move data are not inferred." rows={signatureMetricRows(rows, (row) => metricValue(row.setupRate) * 100)} color="#34d399" suffix="%" xLabel="Setup rate" />
    </div>
    <VisualCard title="Signature data coverage" description="This is a data-completeness view, not a performance ranking. It shows how often each replay field was saved for each Pokémon in the current filtered scope.">
      <div className="mb-4 rounded-xl border border-cyan-400/20 bg-cyan-500/[0.06] p-4 text-[10px] leading-4 text-[var(--foreground-muted)]"><div className="font-black uppercase tracking-wide text-cyan-200">How to read this</div><p className="mt-1">Each percentage is the share of that Pokémon&apos;s qualifying appearances where the underlying fields were available. For example, 75% means the metric can be calculated for 3 of 4 appearances; the other appearance is missing evidence, not a zero.</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[9px] font-bold"><span className="text-violet-200">Darker purple = more recorded coverage</span><span className="text-amber-200">Coverage does not measure performance</span></div></div>
      {coverageRows.length ? <div className="mobile-scroll-region overflow-x-auto" tabIndex={0} aria-label="Signature feature coverage table"><table className="w-full min-w-[760px] text-xs"><thead className="text-[9px] uppercase text-[var(--foreground-muted)]"><tr><th className="p-2 text-left">Pokémon</th>{coverageMetrics.map((metric) => <th key={metric.label} className="p-2 text-center">{metric.label}</th>)}</tr></thead><tbody>{coverageRows.map((row) => <tr key={row.id} className="border-t border-[var(--border)]"><td className="p-2 font-bold text-white">{row.name}</td>{coverageMetrics.map((metric) => { const value = coveragePercent(row, metric.get); return <td key={metric.label} className="p-2 text-center font-mono" style={{ backgroundColor: `rgba(124, 58, 237, ${Math.max(0.08, value / 100 * 0.72)})` }}>{number(value, 0)}%</td>; })}</tr>)}</tbody></table></div> : <p className="py-8 text-center text-xs text-[var(--foreground-muted)]">No coverage rows are available.</p>}
    </VisualCard>
  </>;
}

function TeamVisuals({ matches, selectedTeamIds }: { matches: ExperimentalMatch[]; selectedTeamIds: number[] }) {
  const rows = useMemo(() => buildTeamStats(matches, new Set(selectedTeamIds)), [matches, selectedTeamIds]);
  const teamScope = useMemo(() => {
    const scope = new Map<number, { seasons: Set<string>; divisions: Set<string> }>();
    matches.forEach((match) => [match.coach1, match.coach2].forEach((team) => {
      const current = scope.get(team.seasonCoachId) ?? { seasons: new Set<string>(), divisions: new Set<string>() };
      current.seasons.add(match.seasonName);
      current.divisions.add(match.divisionName);
      scope.set(team.seasonCoachId, current);
    }));
    return scope;
  }, [matches]);
  const teamContext = (teamId: number, context: ChartContext[]) => {
    const scope = teamScope.get(teamId);
    return [...(scope ? [{ label: "Season(s)", value: [...scope.seasons].join(", ") }, { label: "Division(s)", value: [...scope.divisions].join(", ") }] : []), ...context];
  };
  const scatterRows = rows.filter((row) => row.damageForGames > 0 && row.damageAgainstGames > 0).map((row) => ({ name: row.team.teamName, x: row.damageFor / row.damageForGames, y: row.damageAgainst / row.damageAgainstGames, z: Math.max(4, row.games), context: teamContext(row.team.seasonCoachId, [{ label: "Games", value: row.games }, { label: "Record", value: `${row.wins}-${row.games - row.wins}` }, { label: "Damage coverage", value: `${row.damageForGames}/${row.games}` }]) }));
  const recordRows = rows.slice(0, 12).map((row) => ({ name: row.team.teamName, fullName: `${row.team.teamName} · ${[...(teamScope.get(row.team.seasonCoachId)?.seasons ?? [])].join(", ")} · ${[...(teamScope.get(row.team.seasonCoachId)?.divisions ?? [])].join(", ")} · ${row.team.coachName}`, wins: row.wins, losses: row.games - row.wins, context: teamContext(row.team.seasonCoachId, [{ label: "Games", value: row.games }, { label: "Coach", value: row.team.coachName }]) }));
  const controlRows = rows.filter((row) => row.eventGames > 0).slice(0, 12).map((row) => ({ name: row.team.teamName, fullName: `${row.team.teamName} · ${[...(teamScope.get(row.team.seasonCoachId)?.seasons ?? [])].join(", ")} · ${[...(teamScope.get(row.team.seasonCoachId)?.divisions ?? [])].join(", ")} · ${row.team.coachName}`, switches: row.switches / row.eventGames, tera: row.teraUses / row.eventGames, context: teamContext(row.team.seasonCoachId, [{ label: "Games", value: row.games }, { label: "Event coverage", value: `${row.eventGames}/${row.games}` }, { label: "Coach", value: row.team.coachName }]) }));
  const teamChartHeight = Math.max(360, recordRows.length * 30 + 90);
  const controlChartHeight = Math.max(360, controlRows.length * 30 + 90);
  const legendProps = { verticalAlign: "top" as const, height: 24, align: "left" as const, wrapperStyle: { color: "var(--foreground)", fontSize: 10 } };
  return <>
    <div className="grid items-stretch gap-4 xl:grid-cols-2">
      <VisualCard title="Team offense versus defense" description="Teams toward the upper-left deal more recorded damage while allowing less. Bubble size represents games. Team totals include all saved Pokémon in qualifying filtered matches.">
        {scatterRows.length ? <ChartBox height={teamChartHeight}><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 12, right: 18, bottom: 46, left: 72 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--background-tertiary)" /><XAxis type="number" dataKey="x" name="Damage for / game" tick={{ fill: "var(--foreground-muted)", fontSize: 10 }} label={{ value: "Damage for / game", position: "insideBottom", offset: -28, fill: "var(--foreground-muted)", fontSize: 10 }} /><YAxis type="number" dataKey="y" name="Damage against / game" tick={{ fill: "var(--foreground-muted)", fontSize: 10 }} label={{ value: "Damage against / game", angle: -90, position: "insideLeft", offset: 14, fill: "var(--foreground-muted)", fontSize: 10 }} /><Tooltip content={<ScatterPointTooltip xLabel="Damage for / game" yLabel="Damage against / game" xDigits={1} yDigits={1} />} /><Scatter data={scatterRows} fill="#38bdf8" /></ScatterChart></ResponsiveContainer></ChartBox> : <p className="py-12 text-center text-xs text-[var(--foreground-muted)]">No team damage coverage is available.</p>}
      </VisualCard>
      <VisualCard title="Team records" description="Wins and losses for the highest-game teams in qualifying filtered matches; totals include all saved Pokémon in those matches.">
        {recordRows.length ? <ChartBox height={teamChartHeight}><ResponsiveContainer width="100%" height="100%"><BarChart data={recordRows} layout="vertical" margin={{ top: 8, right: 12, bottom: 38, left: 44 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--background-tertiary)" horizontal={false} /><XAxis type="number" allowDecimals={false} tick={{ fill: "var(--foreground-muted)", fontSize: 10 }} label={{ value: "Games", position: "insideBottom", offset: -22, fill: "var(--foreground-muted)", fontSize: 10 }} /><YAxis type="category" dataKey="name" width={210} interval={0} tick={<TeamAxisTick />} label={{ value: "Team", angle: -90, position: "insideLeft", offset: 8, fill: "var(--foreground-muted)", fontSize: 10 }} /><Tooltip contentStyle={{ background: "var(--background-secondary)", border: "1px solid var(--border)", color: "var(--foreground)" }} labelFormatter={(value, payload) => payload?.[0]?.payload?.fullName ?? String(value ?? "")} /><Legend {...legendProps} /><Bar dataKey="wins" stackId="record" fill="#34d399" name="Wins" /><Bar dataKey="losses" stackId="record" fill="#64748b" name="Losses" /></BarChart></ResponsiveContainer></ChartBox> : <p className="py-12 text-center text-xs text-[var(--foreground-muted)]">No team records are available.</p>}
      </VisualCard>
    </div>
    <VisualCard title="Team control profile" description="Average attributed switch/drag events and Terastallizations per event-covered game.">
      {controlRows.length ? <ChartBox height={controlChartHeight}><ResponsiveContainer width="100%" height="100%"><BarChart data={controlRows} layout="vertical" margin={{ top: 8, right: 12, bottom: 38, left: 44 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--background-tertiary)" horizontal={false} /><XAxis type="number" tick={{ fill: "var(--foreground-muted)", fontSize: 10 }} label={{ value: "Events per game", position: "insideBottom", offset: -22, fill: "var(--foreground-muted)", fontSize: 10 }} /><YAxis type="category" dataKey="name" width={210} interval={0} tick={<TeamAxisTick />} label={{ value: "Team", angle: -90, position: "insideLeft", offset: 8, fill: "var(--foreground-muted)", fontSize: 10 }} /><Tooltip contentStyle={{ background: "var(--background-secondary)", border: "1px solid var(--border)", color: "var(--foreground)" }} labelFormatter={(value, payload) => payload?.[0]?.payload?.fullName ?? String(value ?? "")} formatter={(value: number | string | undefined) => number(Number(value ?? 0), 2)} /><Legend {...legendProps} /><Bar dataKey="switches" fill="#f59e0b" name="Switch/drag per game" /><Bar dataKey="tera" fill="#f472b6" name="Tera per game" /></BarChart></ResponsiveContainer></ChartBox> : <p className="py-12 text-center text-xs text-[var(--foreground-muted)]">No attributed event coverage is available.</p>}
    </VisualCard>
  </>;
}

function TopPlayCharts({ matches }: { matches: ExperimentalMatch[] }) {
  const records = useMemo(() => buildTopPlays(matches), [matches]);
  const chart = (recordsToChart: TopPlayRecord[]) => recordsToChart.slice(0, 8).map((record) => ({ name: record.detail, fullName: `${record.detail} · ${record.match.seasonName} · ${record.match.divisionName} · Week ${record.match.week} · ${record.match.coach1.teamName} vs ${record.match.coach2.teamName}`, value: record.value }));
  const timelineMatches = matches.filter((match) => match.turnSnapshots.length > 1);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const selectedMatch = timelineMatches.find((match) => match.id === selectedMatchId) ?? timelineMatches[0] ?? null;
  const p1Name = selectedMatch ? selectedMatch.p1IsCoach1 === false ? selectedMatch.coach2.teamName : selectedMatch.coach1.teamName : "Team 1";
  const p2Name = selectedMatch ? selectedMatch.p1IsCoach1 === false ? selectedMatch.coach1.teamName : selectedMatch.coach2.teamName : "Team 2";
  const momentum = selectedMatch?.turnSnapshots.map((snapshot) => ({ turn: snapshot.turn, [p1Name]: snapshot.p1TotalHp / 6, [p2Name]: snapshot.p2TotalHp / 6 })) ?? [];
  return <>
    <div className="grid items-stretch gap-4 xl:grid-cols-3">
      <RankedMetricChart title="Largest HP swings" description="Largest saved turn-to-turn loss in team HP, shown as percentage of a six-Pokémon team total." rows={chart(records.hpSwings)} color="#f43f5e" suffix="%" xLabel="HP lost (%)" yLabel="Recorded play" calculation="For each saved snapshot pair: positive team-HP drop ÷ 6 = HP lost (%)." />
      <RankedMetricChart title="Largest comeback deficits" description="Largest team-HP deficit overcome by the eventual winner." rows={chart(records.comebacks)} color="#a78bfa" suffix="%" xLabel="Deficit %" yLabel="Recorded play" calculation="Lowest winner HP lead during the replay, when negative; absolute deficit ÷ 6 = deficit (%)." />
      <RankedMetricChart title="Longest active appearances" description="Longest saved active appearance by one Pokémon in a battle." rows={chart(records.longestAppearances)} color="#22d3ee" suffix=" turns" xLabel="Active turns" calculation="Uses the saved turnsActive value for each Pokémon appearance." />
    </div>
    <VisualCard title="Battle momentum timeline" description="Select a replay with saved turn snapshots to compare both teams’ remaining HP over time.">
      {timelineMatches.length ? <><label className="mb-3 block max-w-xl"><span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-[var(--foreground-muted)]">Replay</span><select value={selectedMatch?.id ?? ""} onChange={(event) => setSelectedMatchId(Number(event.target.value))} className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs font-bold text-[var(--foreground)] outline-none focus:border-violet-400">{timelineMatches.map((match) => <option key={match.id} value={match.id}>{match.coach1.teamName} vs {match.coach2.teamName} · {match.seasonName} · {match.divisionName} · Week {match.week}</option>)}</select></label><ChartBox height={340}><ResponsiveContainer width="100%" height="100%"><LineChart data={momentum} margin={{ top: 8, right: 16, bottom: 44, left: 28 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--background-tertiary)" /><XAxis dataKey="turn" tick={{ fill: "var(--foreground-muted)", fontSize: 10 }} label={{ value: "Turn", position: "insideBottom", offset: -28, fill: "var(--foreground-muted)", fontSize: 10 }} /><YAxis domain={[0, 100]} tick={{ fill: "var(--foreground-muted)", fontSize: 10 }} tickFormatter={(value) => `${value}%`} label={{ value: "Team HP remaining (%)", angle: -90, position: "insideLeft", offset: 10, fill: "var(--foreground-muted)", fontSize: 10 }} /><Tooltip contentStyle={{ background: "var(--background-secondary)", border: "1px solid var(--border)", color: "var(--foreground)" }} formatter={(value: number | string | undefined) => `${number(Number(value ?? 0), 1)}%`} /><Legend verticalAlign="top" height={24} align="left" wrapperStyle={{ color: "var(--foreground)", fontSize: 10 }} /><Line type="monotone" dataKey={p1Name} stroke="#a78bfa" strokeWidth={3} dot={false} /><Line type="monotone" dataKey={p2Name} stroke="#22d3ee" strokeWidth={3} dot={false} /></LineChart></ResponsiveContainer></ChartBox></> : <p className="py-12 text-center text-xs text-[var(--foreground-muted)]">No replay timelines are available in this scope.</p>}
    </VisualCard>
  </>;
}

function CoverageDashboard({ appearances }: { appearances: EnrichedAppearance[] }) {
  const fields = [
    { label: "Damage", count: appearances.filter((appearance) => totalDamage(appearance) !== null).length },
    { label: "Active turns", count: appearances.filter((appearance) => appearance.turnsActive !== null).length },
    { label: "Move uses", count: appearances.filter((appearance) => moveUses(appearance) !== null).length },
    { label: "Healing", count: appearances.filter((appearance) => appearance.hpRestored !== null).length },
    { label: "Setup moves", count: appearances.filter((appearance) => appearance.setupMovesUsed !== null).length },
    { label: "Favorable events", count: appearances.filter((appearance) => hasFavorableEventData(appearance)).length },
  ];
  return <VisualCard title="Replay data coverage" description="The share of filtered Pokémon appearances with each saved field. This distinguishes evidence availability from a true zero. ">
    <div className="space-y-3">{fields.map((field) => { const percentage = appearances.length ? field.count / appearances.length * 100 : 0; return <div key={field.label}><div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-bold"><span className="text-white">{field.label}</span><span className="font-mono text-[var(--foreground-muted)]">{number(percentage, 1)}% · {field.count}/{appearances.length}</span></div><div className="h-3 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500" style={{ width: `${percentage}%` }} /></div></div>; })}</div>
  </VisualCard>;
}

function MoveUsageVisual({ moves }: { moves: Array<[string, number]> }) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const sortedMoves = useMemo(() => [...moves].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])), [moves]);
  const filteredMoves = normalizedQuery ? sortedMoves.filter(([name]) => name.toLowerCase().includes(normalizedQuery)) : sortedMoves;
  const visibleMoves = showAll || normalizedQuery ? filteredMoves : filteredMoves.slice(0, 15);
  const topUses = sortedMoves[0]?.[1] ?? 0;
  return <VisualCard title="Move usage ranking" description="A searchable ranking of explicitly recorded move uses in the filtered replay scope. This is replay evidence, not an exact controller-click log; missing move fields remain unknown.">
    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
      <label className="sr-only" htmlFor="visual-lab-move-search">Search recorded moves</label>
      <input id="visual-lab-move-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search recorded moves…" className="h-10 rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 text-xs text-[var(--foreground)] outline-none focus:border-cyan-400" />
      <button type="button" onClick={() => setShowAll((current) => !current)} className="btn-retro-secondary h-10 px-3 text-[9px]">{showAll ? "Show top 15" : "Show all moves"}</button>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[9px] text-[var(--foreground-muted)]"><span>{normalizedQuery ? `${filteredMoves.length} matching moves` : showAll ? `Showing all ${filteredMoves.length} recorded moves` : `Showing top ${Math.min(15, filteredMoves.length)} of ${filteredMoves.length} recorded moves`}</span><span>Bar length is relative to the most-used move.</span></div>
    {visibleMoves.length ? <div className="mt-4 space-y-2">{visibleMoves.map(([name, count]) => <div key={name} className="grid grid-cols-[minmax(100px,180px)_1fr_auto] items-center gap-2 text-[10px] sm:grid-cols-[minmax(130px,220px)_1fr_auto] sm:text-xs"><span className="truncate font-bold text-[var(--foreground)]" title={name}>{name}</span><div className="h-3 overflow-hidden rounded-full bg-[var(--background-tertiary)]"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400" style={{ width: `${topUses ? count / topUses * 100 : 0}%` }} /></div><span className="font-mono text-cyan-200">{number(count)}</span></div>)}</div> : <p className="py-12 text-center text-xs text-[var(--foreground-muted)]">No recorded moves match this search.</p>}
  </VisualCard>;
}

type ScopeCell = { key: string; seasonName: string; divisionName: string; appearances: number; wins: number; damage: number; turns: number };
function buildScopeCells(appearances: EnrichedAppearance[]) {
  const cells = new Map<string, ScopeCell>();
  appearances.forEach((appearance) => {
    const key = `${appearance.match.seasonId}:${appearance.match.divisionId}`;
    const cell = cells.get(key) ?? { key, seasonName: appearance.match.seasonName, divisionName: appearance.match.divisionName, appearances: 0, wins: 0, damage: 0, turns: 0 };
    cell.appearances += 1;
    cell.wins += appearance.won ? 1 : 0;
    if (totalDamage(appearance) !== null && appearance.turnsActive !== null && appearance.turnsActive > 0) {
      cell.damage += totalDamage(appearance) ?? 0;
      cell.turns += appearance.turnsActive;
    }
    cells.set(key, cell);
  });
  return [...cells.values()].sort((a, b) => a.seasonName.localeCompare(b.seasonName) || a.divisionName.localeCompare(b.divisionName));
}

function SeasonDivisionHeatmap({ appearances }: { appearances: EnrichedAppearance[] }) {
  const cells = buildScopeCells(appearances);
  return <VisualCard title="Season and division heatmap" description="Cell color shows Pokémon appearance win rate; the label includes damage per active turn and sample size for context.">
    {cells.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{cells.map((cell) => { const winRate = cell.appearances ? cell.wins / cell.appearances * 100 : 0; const damagePerTurn = cell.turns ? cell.damage / cell.turns : 0; return <div key={cell.key} className="rounded-xl border border-white/10 p-4" style={{ backgroundColor: `hsla(${190 + winRate * 1.2}, 75%, 42%, ${0.16 + winRate / 100 * 0.5})` }}><div className="text-[9px] font-black uppercase tracking-wider text-white/70">{cell.seasonName}</div><div className="mt-1 text-sm font-black text-white">{cell.divisionName}</div><div className="mt-4 flex items-end justify-between gap-2"><span className="font-mono text-2xl font-black text-white">{number(winRate, 1)}%</span><span className="text-right text-[10px] text-white/75">{number(damagePerTurn, 1)} DMG/turn<br />{cell.appearances} appearances</span></div></div>; })}</div> : <p className="py-12 text-center text-xs text-[var(--foreground-muted)]">No season/division coverage is available.</p>}
  </VisualCard>;
}

type CoreEdge = { source: string; target: string; games: number; wins: number };
function buildCoreEdges(matches: ExperimentalMatch[]) {
  const edges = new Map<string, CoreEdge>();
  const nodeAppearances = new Map<string, number>();
  matches.forEach((match) => {
    const teams = new Map<number, Map<number, string>>();
    match.pokemon.forEach((appearance) => {
      const team = teams.get(appearance.seasonCoachId) ?? new Map<number, string>();
      team.set(appearance.pokemonId, appearance.pokemonName);
      teams.set(appearance.seasonCoachId, team);
    });
    teams.forEach((team, seasonCoachId) => {
      team.forEach((name) => nodeAppearances.set(name, (nodeAppearances.get(name) ?? 0) + 1));
      const pokemon = [...team.entries()].sort((a, b) => a[0] - b[0]);
      for (let first = 0; first < pokemon.length; first += 1) for (let second = first + 1; second < pokemon.length; second += 1) {
        const source = pokemon[first][1];
        const target = pokemon[second][1];
        const key = `${pokemon[first][0]}:${pokemon[second][0]}`;
        const edge = edges.get(key) ?? { source, target, games: 0, wins: 0 };
        edge.games += 1;
        edge.wins += match.winnerId === seasonCoachId ? 1 : 0;
        edges.set(key, edge);
      }
    });
  });
  return {
    edges: [...edges.values()].filter((edge) => edge.games >= 2).sort((a, b) => b.games - a.games || b.wins - a.wins).slice(0, 10),
    nodeAppearances,
  };
}

function CoreNetwork({ matches }: { matches: ExperimentalMatch[] }) {
  const { edges, nodeAppearances } = buildCoreEdges(matches);
  const nodeNames = [...new Set(edges.flatMap((edge) => [edge.source, edge.target]))].slice(0, 12);
  const visibleEdges = edges.filter((edge) => nodeNames.includes(edge.source) && nodeNames.includes(edge.target));
  const center = { x: 210, y: 150 };
  const positions = new Map(nodeNames.map((name, index) => { const angle = index / Math.max(1, nodeNames.length) * Math.PI * 2 - Math.PI / 2; return [name, { x: center.x + Math.cos(angle) * 142, y: center.y + Math.sin(angle) * 106 }]; }));
  const nodeWeights = nodeNames.map((name) => nodeAppearances.get(name) ?? 0);
  const minNodeWeight = Math.min(...nodeWeights, 1);
  const maxNodeWeight = Math.max(...nodeWeights, 1);
  const nodeRadius = (name: string) => {
    const weight = nodeAppearances.get(name) ?? 0;
    const spread = Math.max(1, maxNodeWeight - minNodeWeight);
    return 20 + ((weight - minNodeWeight) / spread) * 14;
  };
  return <VisualCard title="Team core synergy network" description="Lines connect Pokémon used together on the same team. Thicker lines show more shared games; larger circles show more team appearances. Only pairs with at least two shared games are shown.">
    {visibleEdges.length ? <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center"><svg viewBox="0 0 420 300" role="img" aria-label="Team core synergy network" className="h-auto w-full rounded-xl border border-white/5 bg-slate-950/45">{visibleEdges.map((edge) => { const source = positions.get(edge.source); const target = positions.get(edge.target); return source && target ? <line key={`${edge.source}-${edge.target}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke="#8b5cf6" strokeOpacity={0.35 + Math.min(edge.games, 6) / 10} strokeWidth={1 + Math.min(edge.games, 6)} /> : null; })}{nodeNames.map((name) => { const position = positions.get(name); const appearances = nodeAppearances.get(name) ?? 0; return position ? <g key={name}><title>{`${name}: ${appearances} team ${appearances === 1 ? "appearance" : "appearances"}`}</title><circle cx={position.x} cy={position.y} r={nodeRadius(name)} fill="#0f172a" stroke="#22d3ee" strokeWidth="2" /><text x={position.x} y={position.y + 3} textAnchor="middle" fill="#fff" fontSize="9">{shortName(name, 11)}</text></g> : null; })}</svg><div className="space-y-2">{visibleEdges.slice(0, 6).map((edge) => <div key={`${edge.source}-${edge.target}`} className="rounded-lg border border-[var(--border)] bg-[var(--background-secondary)] p-3 text-[10px]"><div className="break-words font-bold leading-4 text-white">{edge.source} <span className="text-violet-300">+</span> {edge.target}</div><div className="mt-1 font-mono text-[9px] leading-4 text-[var(--foreground-muted)]">{edge.games} shared {edge.games === 1 ? "game" : "games"} <span aria-hidden="true">·</span> {number(edge.wins / edge.games * 100, 1)}% team win rate</div></div>)}</div></div> : <p className="py-12 text-center text-xs text-[var(--foreground-muted)]">No repeated Pokémon cores are available.</p>}
  </VisualCard>;
}

export const ExperimentalVisualsReport = memo(function ExperimentalVisualsReport({ appearances, matches, pokemonRows, coachRows, selectedTeamIds, moves, minimumAppearances }: { appearances: EnrichedAppearance[]; matches: ExperimentalMatch[]; pokemonRows: EntityAggregate[]; coachRows: EntityAggregate[]; selectedTeamIds: number[]; moves: Array<[string, number]>; minimumAppearances: number }) {
  return <section className="space-y-5">
    <div className="poke-card border-emerald-400/20 bg-emerald-500/[0.03] p-5 md:p-6"><h2 className="font-pixel text-sm text-white">Visual Lab</h2><p className="mt-1 max-w-4xl text-xs leading-5 text-[var(--foreground-muted)]">A visual layer over the same filtered replay evidence used by the Experimental Stats reports. Hover chart marks for exact values; coverage-aware panels identify where saved replay fields are incomplete.</p><div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4"><div className="rounded-xl border border-white/10 bg-slate-950/35 p-3"><div className="font-mono text-xl font-black text-white">{number(matches.length)}</div><div className="text-[9px] uppercase tracking-wider text-[var(--foreground-muted)]">Filtered replays</div></div><div className="rounded-xl border border-white/10 bg-slate-950/35 p-3"><div className="font-mono text-xl font-black text-white">{number(pokemonRows.length)}</div><div className="text-[9px] uppercase tracking-wider text-[var(--foreground-muted)]">Qualified Pokémon</div></div><div className="rounded-xl border border-white/10 bg-slate-950/35 p-3"><div className="font-mono text-xl font-black text-white">{number(coachRows.length)}</div><div className="text-[9px] uppercase tracking-wider text-[var(--foreground-muted)]">Qualified coaches</div></div><div className="rounded-xl border border-white/10 bg-slate-950/35 p-3"><div className="font-mono text-xl font-black text-white">{number(moves.length)}</div><div className="text-[9px] uppercase tracking-wider text-[var(--foreground-muted)]">Recorded moves</div></div></div></div>
    <SignatureVisuals appearances={appearances} minimumAppearances={minimumAppearances} />
    <TeamVisuals matches={matches} selectedTeamIds={selectedTeamIds} />
    <TopPlayCharts matches={matches} />
    <MoveUsageVisual moves={moves} />
    <SeasonDivisionHeatmap appearances={appearances} />
    <CoverageDashboard appearances={appearances} />
    <CoreNetwork matches={matches} />
  </section>;
});
