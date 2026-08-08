"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  PLAYOFF_SPOTS,
  averageWinningDifferentials,
  inspectDataQuality,
  standingsForCached,
  type CalculatorDivision,
  type CalculatorMatch,
  type CalculatorTeam,
  type Prediction,
  type Predictions,
  type Standing,
  type TeamProjection,
} from "./playoff-calculator-engine";
import { usePlayoffWorker } from "./use-playoff-worker";
import { decodeScenario, encodeScenario, isValidPredictions, SCENARIO_VERSION } from "./scenario-codec";

const DIFFERENTIALS = [1, 2, 3, 4, 5, 6] as const;
const SAVED_SCENARIOS_KEY = "pbo-dev-playoff-scenarios-v1";

type DifferentialMode = "manual" | "typical" | "probability";
type MatchFilter = "all" | "picked" | "unpicked" | "locked";
type SavedScenario = {
  version: number;
  id: string;
  name: string;
  predictions: Predictions;
  divisionId: number;
  savedAt: string;
};

function validSavedScenarios(value: unknown): SavedScenario[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const candidate = entry as Partial<SavedScenario>;
    if (typeof candidate.id !== "string" || typeof candidate.name !== "string" || typeof candidate.savedAt !== "string" || !Number.isInteger(candidate.divisionId) || !isValidPredictions(candidate.predictions)) return [];
    return [{ ...candidate, version: Number.isInteger(candidate.version) ? candidate.version! : 1 } as SavedScenario];
  }).slice(0, 12);
}

function teamLabel(team: CalculatorTeam | undefined) {
  return team?.teamAbbreviation || team?.teamName || "Unknown team";
}

function officialPrediction(match: CalculatorMatch): Prediction | undefined {
  if (!match.winnerId) return undefined;
  const rawDifferential = match.winnerId === match.coach1SeasonId
    ? match.coach1Differential
    : match.coach2Differential;
  return {
    winnerId: match.winnerId,
    differential: Math.max(1, Math.min(6, Math.abs(rawDifferential ?? 0) || 3)),
  };
}

function movementLabel(currentSeed: number, projectedSeed: number) {
  if (currentSeed === projectedSeed) return "—";
  return projectedSeed < currentSeed ? `▲ ${currentSeed - projectedSeed}` : `▼ ${projectedSeed - currentSeed}`;
}

function percent(value: number) {
  if (value >= 0.995) return "100%";
  if (value <= 0.005) return "0%";
  return `${Math.round(value * 100)}%`;
}

function statusStyle(status: TeamProjection["status"]) {
  if (status === "clinched") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (status === "eliminated") return "border-red-400/30 bg-red-400/10 text-red-300";
  return "border-amber-400/30 bg-amber-400/10 text-amber-300";
}

const MatchEditor = memo(function MatchEditor({
  match,
  teamsById,
  override,
  locked,
  live,
  allowOfficialEdit,
  suggestedDifferential,
  onChange,
  onToggleLock,
  onToggleLive,
}: {
  match: CalculatorMatch;
  teamsById: Map<number, CalculatorTeam>;
  override?: Prediction;
  locked: boolean;
  live: boolean;
  allowOfficialEdit: boolean;
  suggestedDifferential: (winnerId: number) => number;
  onChange: (prediction?: Prediction) => void;
  onToggleLock: () => void;
  onToggleLive: () => void;
}) {
  const first = teamsById.get(match.coach1SeasonId);
  const second = teamsById.get(match.coach2SeasonId);
  const official = officialPrediction(match);
  const displayed = override ?? official;
  const isOfficial = Boolean(official && !override);
  const canEdit = !locked && (!official || allowOfficialEdit);
  const differential = displayed?.differential ?? 3;

  return (
    <article style={{ contentVisibility: "auto", containIntrinsicSize: "260px" }} className={`rounded-xl border p-3 ${override ? "border-violet-400/40 bg-violet-400/[0.055]" : "border-[var(--background-tertiary)] bg-[var(--background-secondary)]"}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--foreground-subtle)]">
          <span>Week {match.week}</span>
          {isOfficial && <span className="rounded bg-sky-400/10 px-1.5 py-0.5 text-sky-300">Official</span>}
          {override && <span className="rounded bg-violet-400/10 px-1.5 py-0.5 text-violet-300">Override</span>}
          {live && <span className="animate-pulse rounded bg-red-400/10 px-1.5 py-0.5 text-red-300">Live</span>}
        </div>
        <div className="flex items-center gap-2">
          {override && !locked && (
            <button type="button" onClick={() => onChange(undefined)} className="text-[10px] font-bold uppercase text-[var(--foreground-muted)] hover:text-white">
              Restore
            </button>
          )}
          <button type="button" onClick={onToggleLock} className={`text-[10px] font-bold uppercase ${locked ? "text-amber-300" : "text-[var(--foreground-muted)] hover:text-white"}`}>
            {locked ? "Locked" : "Lock"}
          </button>
          <button type="button" onClick={onToggleLive} className={`text-[10px] font-bold uppercase ${live ? "text-red-300" : "text-[var(--foreground-muted)] hover:text-white"}`}>
            {live ? "End live" : "Mark live"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
        {[[first, match.coach1SeasonId], [second, match.coach2SeasonId]].map(([team, teamId], index) => {
          const id = Number(teamId);
          const selected = displayed?.winnerId === id;
          return (
            <div key={id} className="contents">
              {index === 1 && <div className="flex items-center text-[10px] font-black uppercase text-[var(--foreground-subtle)]">vs</div>}
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => onChange({ winnerId: id, differential: override?.differential ?? suggestedDifferential(id) })}
                className={`min-w-0 rounded-lg border px-3 py-3 text-center transition-all disabled:cursor-not-allowed ${selected ? "border-[var(--success)] bg-[var(--success)]/15 text-white" : "border-[var(--background-tertiary)] bg-[var(--background)] text-[var(--foreground-muted)] hover:border-[var(--primary)] hover:text-white disabled:hover:border-[var(--background-tertiary)]"}`}
              >
                <span className="block truncate text-sm font-black">{teamLabel(team as CalculatorTeam)}</span>
                <span className="mt-1 block text-[9px] font-bold uppercase tracking-wider">
                  {selected ? (isOfficial ? "Official winner" : "Scenario winner") : canEdit ? "Pick winner" : "Locked result"}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <div className={`mt-3 transition-opacity ${displayed && canEdit ? "opacity-100" : "pointer-events-none opacity-35"}`}>
        <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[var(--foreground-subtle)]">
          <span>Winner differential</span><span className="text-[var(--primary)]">+{differential}</span>
        </div>
        <div className="grid grid-cols-6 gap-1">
          {DIFFERENTIALS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => displayed && onChange({ ...displayed, differential: value })}
              className={`rounded border py-1.5 text-xs font-black ${differential === value ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--background-tertiary)] bg-[var(--background)] text-[var(--foreground-muted)] hover:text-white"}`}
            >{value}</button>
          ))}
        </div>
      </div>
    </article>
  );
});

const StandingsTable = memo(function StandingsTable({
  standings,
  currentSeeds,
  projections,
  selectedTeamId,
  onSelectTeam,
}: {
  standings: Standing[];
  currentSeeds: Map<number, number>;
  projections: Map<number, TeamProjection>;
  selectedTeamId: number | null;
  onSelectTeam: (teamId: number) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--background-tertiary)]">
      <table className="w-full min-w-[700px] text-left text-sm">
        <thead className="bg-[var(--background)] text-[10px] uppercase tracking-wider text-[var(--foreground-subtle)]">
          <tr><th className="px-3 py-2">Seed</th><th className="px-3 py-2">Team</th><th className="px-3 py-2 text-center">W</th><th className="px-3 py-2 text-center">L</th><th className="px-3 py-2 text-center">Diff</th><th className="px-3 py-2 text-center">Move</th><th className="px-3 py-2 text-center">Odds</th><th className="px-3 py-2 text-right">Range</th></tr>
        </thead>
        <tbody className="divide-y divide-[var(--background-tertiary)]">
          {standings.map((team, index) => {
            const seed = index + 1;
            const projection = projections.get(team.id);
            const movement = movementLabel(currentSeeds.get(team.id) ?? seed, seed);
            const selected = selectedTeamId === team.id;
            return (
              <tr key={team.id} onClick={() => onSelectTeam(team.id)} className={`cursor-pointer ${selected ? "bg-[var(--primary)]/12" : seed <= PLAYOFF_SPOTS ? "bg-emerald-500/[0.045] hover:bg-emerald-500/[0.08]" : "bg-red-500/[0.025] hover:bg-red-500/[0.06]"} ${seed === PLAYOFF_SPOTS ? "border-b-2 border-b-amber-400/60" : ""}`}>
                <td className="px-3 py-2.5 font-pixel text-xs text-white">{seed}</td>
                <td className="max-w-[210px] px-3 py-2.5"><div className="truncate font-bold text-white">{team.teamName}</div><div className="text-[10px] uppercase text-[var(--foreground-subtle)]">{projection?.status ?? "alive"}</div></td>
                <td className="px-3 py-2.5 text-center font-mono font-bold text-emerald-300">{team.wins}</td>
                <td className="px-3 py-2.5 text-center font-mono text-red-300">{team.losses}</td>
                <td className="px-3 py-2.5 text-center font-mono font-bold text-white">{team.differential > 0 ? "+" : ""}{team.differential}</td>
                <td className={`px-3 py-2.5 text-center text-xs font-bold ${movement.startsWith("▲") ? "text-emerald-300" : movement.startsWith("▼") ? "text-red-300" : "text-[var(--foreground-subtle)]"}`}>{movement}</td>
                <td className="px-3 py-2.5 text-center font-mono font-bold text-white">{projection ? percent(projection.playoffProbability) : "—"}</td>
                <td className="px-3 py-2.5 text-right text-xs text-[var(--foreground-muted)]">{projection ? `#${projection.bestSeed}–#${projection.worstSeed}` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

const TeamPathPanel = memo(function TeamPathPanel({
  team,
  standings,
  projection,
}: {
  team: Standing;
  standings: Standing[];
  projection?: TeamProjection;
}) {
  const seed = standings.findIndex((candidate) => candidate.id === team.id) + 1;
  const cutoff = standings[Math.min(PLAYOFF_SPOTS - 1, standings.length - 1)];
  const neededWins = Math.max(0, (cutoff?.wins ?? team.wins) - team.wins + (seed > PLAYOFF_SPOTS ? 1 : 0));

  return (
    <section className="poke-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">What does this team need?</p><h2 className="mt-1 text-xl font-black text-white">{team.teamName}</h2></div>
        {projection && <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${statusStyle(projection.status)}`}>{projection.status}</span>}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <div className="rounded-lg bg-[var(--background)] p-3"><p className="text-[9px] uppercase text-[var(--foreground-subtle)]">Playoff odds</p><p className="mt-1 text-xl font-black text-white">{projection ? percent(projection.playoffProbability) : "—"}</p></div>
        <div className="rounded-lg bg-[var(--background)] p-3"><p className="text-[9px] uppercase text-[var(--foreground-subtle)]">Seed range</p><p className="mt-1 text-xl font-black text-white">{projection ? `#${projection.bestSeed}–#${projection.worstSeed}` : "—"}</p></div>
        <div className="rounded-lg bg-[var(--background)] p-3"><p className="text-[9px] uppercase text-[var(--foreground-subtle)]">Win range</p><p className="mt-1 text-xl font-black text-white">{projection ? `${projection.minimumWins}–${projection.maximumWins}` : "—"}</p></div>
        <div className="rounded-lg bg-[var(--background)] p-3"><p className="text-[9px] uppercase text-[var(--foreground-subtle)]">Projected need</p><p className="mt-1 text-xl font-black text-white">{neededWins === 0 ? "In field" : `${neededWins}+ win${neededWins === 1 ? "" : "s"}`}</p></div>
      </div>
      {projection && (
        <div className="mt-4 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] p-3">
          <p className="mb-3 text-[9px] font-bold uppercase tracking-wider text-[var(--foreground-subtle)]">Seed distribution</p>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-9">
            {projection.seedProbabilities.slice(0, PLAYOFF_SPOTS).map((probability, index) => (
              <div key={index} className="text-center"><div className="flex h-16 items-end overflow-hidden rounded bg-[var(--background-secondary)]"><div className="w-full bg-emerald-400" style={{ height: `${Math.max(2, probability * 100)}%` }} /></div><p className="mt-1 text-[9px] text-white">#{index + 1}</p><p className="text-[8px] text-[var(--foreground-subtle)]">{percent(probability)}</p></div>
            ))}
            <div className="text-center"><div className="flex h-16 items-end overflow-hidden rounded bg-[var(--background-secondary)]"><div className="w-full bg-red-400" style={{ height: `${Math.max(2, (1 - projection.playoffProbability) * 100)}%` }} /></div><p className="mt-1 text-[9px] text-white">OUT</p><p className="text-[8px] text-[var(--foreground-subtle)]">{percent(1 - projection.playoffProbability)}</p></div>
          </div>
        </div>
      )}
    </section>
  );
});

const OpponentSelectionBracket = memo(function OpponentSelectionBracket({ field }: { field: Standing[] }) {
  const playoffField = field.slice(0, PLAYOFF_SPOTS);
  const [opponents, setOpponents] = useState<Record<number, number>>({});
  const [quarterfinalWinners, setQuarterfinalWinners] = useState<Record<number, number>>({});
  const [semifinalWinners, setSemifinalWinners] = useState<Record<number, number>>({});
  const [champion, setChampion] = useState<number | null>(null);
  const byId = new Map(playoffField.map((team) => [team.id, team]));
  const seedById = new Map(playoffField.map((team, index) => [team.id, index + 1]));

  const qfPairs = (() => {
    const remaining = [...playoffField];
    const pairs: Array<{ chooserId: number; opponentId: number; options: Standing[] }> = [];

    while (remaining.length >= 2) {
      const chooser = remaining.shift()!;
      const options = [...remaining];
      const selectedId = opponents[chooser.id];
      const opponent = remaining.find((team) => team.id === selectedId) ?? remaining[remaining.length - 1];
      pairs.push({ chooserId: chooser.id, opponentId: opponent.id, options });
      remaining.splice(remaining.findIndex((team) => team.id === opponent.id), 1);
    }

    return pairs;
  })();

  function chooseOpponent(chooserId: number, opponentId: number) {
    setOpponents((current) => ({ ...current, [chooserId]: opponentId }));
    setQuarterfinalWinners({}); setSemifinalWinners({}); setChampion(null);
  }

  const semifinalPairs = [[quarterfinalWinners[0], quarterfinalWinners[1]], [quarterfinalWinners[2], quarterfinalWinners[3]]] as const;
  const finalPair = [semifinalWinners[0], semifinalWinners[1]] as const;

  return (
    <section className="poke-card p-4 sm:p-5">
      <div className="mb-4"><p className="text-[10px] font-bold uppercase tracking-widest text-fuchsia-300">Opponent-selection bracket</p><h2 className="mt-1 text-xl font-black text-white">Choose and simulate the playoffs</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">The No. 1 seed can choose any other playoff seed. The highest remaining seed chooses next until every team is paired. Click each matchup winner to advance.</p></div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-2"><p className="text-[10px] font-bold uppercase text-[var(--foreground-subtle)]">Quarterfinals</p>{qfPairs.map(({ chooserId, opponentId, options }, index) => <div key={chooserId} className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] p-2"><div className="mb-2 flex items-center gap-2"><span className="text-xs font-bold text-white">#{seedById.get(chooserId)} {teamLabel(byId.get(chooserId))}</span><select aria-label={`Choose an opponent for seed ${seedById.get(chooserId)}`} value={opponentId} onChange={(event) => chooseOpponent(chooserId, Number(event.target.value))} className="ml-auto max-w-[145px] rounded bg-[var(--background-secondary)] px-2 py-1 text-xs text-white">{options.map((team) => <option key={team.id} value={team.id}>#{seedById.get(team.id)} {teamLabel(team)}</option>)}</select></div><div className="grid grid-cols-2 gap-1">{[chooserId, opponentId].map((teamId) => <button key={teamId} type="button" onClick={() => { setQuarterfinalWinners((current) => ({ ...current, [index]: teamId })); setSemifinalWinners({}); setChampion(null); }} className={`rounded px-2 py-1.5 text-xs font-bold ${quarterfinalWinners[index] === teamId ? "bg-emerald-500 text-white" : "bg-[var(--background-secondary)] text-[var(--foreground-muted)]"}`}>#{seedById.get(teamId)} {teamLabel(byId.get(teamId))}</button>)}</div></div>)}</div>
        <div className="space-y-2"><p className="text-[10px] font-bold uppercase text-[var(--foreground-subtle)]">Semifinals</p>{semifinalPairs.map((pair, index) => <div key={index} className="grid min-h-20 grid-cols-2 gap-1 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] p-2">{pair.map((teamId, teamIndex) => teamId ? <button key={teamId} type="button" onClick={() => { setSemifinalWinners((current) => ({ ...current, [index]: teamId })); setChampion(null); }} className={`rounded px-2 text-xs font-bold ${semifinalWinners[index] === teamId ? "bg-emerald-500 text-white" : "bg-[var(--background-secondary)] text-[var(--foreground-muted)]"}`}>{teamLabel(byId.get(teamId))}</button> : <div key={teamIndex} className="flex items-center justify-center rounded bg-[var(--background-secondary)] text-xs text-[var(--foreground-subtle)]">TBD</div>)}</div>)}</div>
        <div className="space-y-2"><p className="text-[10px] font-bold uppercase text-[var(--foreground-subtle)]">Championship</p><div className="grid min-h-20 grid-cols-2 gap-1 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] p-2">{finalPair.map((teamId, index) => teamId ? <button key={teamId} type="button" onClick={() => setChampion(teamId)} className={`rounded px-2 text-xs font-bold ${champion === teamId ? "bg-amber-500 text-black" : "bg-[var(--background-secondary)] text-[var(--foreground-muted)]"}`}>{teamLabel(byId.get(teamId))}</button> : <div key={index} className="flex items-center justify-center rounded bg-[var(--background-secondary)] text-xs text-[var(--foreground-subtle)]">TBD</div>)}</div>{champion && <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-center"><p className="text-[9px] font-bold uppercase text-amber-300">Champion</p><p className="mt-1 font-black text-white">{byId.get(champion)?.teamName}</p></div>}</div>
      </div>
    </section>
  );
});

const AboutCalculator = memo(function AboutCalculator() {
  return (
    <details className="poke-card group overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 sm:p-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">About this tool</p>
          <h2 className="mt-1 text-xl font-black text-white">How the playoff predictor works</h2>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">A simple guide to the calculator.</p>
        </div>
        <span className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-[10px] font-bold uppercase text-[var(--foreground-muted)] group-open:hidden">Read more</span>
        <span className="hidden rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-[10px] font-bold uppercase text-[var(--foreground-muted)] group-open:inline">Close</span>
      </summary>
      <div className="border-t border-[var(--background-tertiary)] p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <article className="rounded-xl border border-[var(--background-tertiary)] bg-[var(--background)] p-4">
            <h3 className="font-bold text-white">Who makes playoffs?</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">Each division is separate. The top eight teams make playoffs. Teams are ranked by wins, differential, losses, head-to-head, and schedule strength.</p>
          </article>
          <article className="rounded-xl border border-[var(--background-tertiary)] bg-[var(--background)] p-4">
            <h3 className="font-bold text-white">How are odds made?</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">Each team plays eight regular-season games. The calculator looks at every unfinished matchup across the whole division. If 14 or fewer division matchups remain, it checks every possible set of winners. When more remain, it estimates the possible outcomes. The three playoff weeks are handled separately in the bracket.</p>
          </article>
          <article className="rounded-xl border border-[var(--background-tertiary)] bg-[var(--background)] p-4">
            <h3 className="font-bold text-white">Prediction model</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">Projections use league results and recent play to estimate each matchup.</p>
          </article>
          <article className="rounded-xl border border-[var(--background-tertiary)] bg-[var(--background)] p-4">
            <h3 className="font-bold text-white">Winning margin</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">Manual mode starts at +3. Team Average uses the team&apos;s usual winning margin. Modeled mode picks a likely margin from +1 to +6. Different margins can change playoff seeds.</p>
          </article>
          <article className="rounded-xl border border-[var(--background-tertiary)] bg-[var(--background)] p-4">
            <h3 className="font-bold text-white">Important games</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">Game leverage shows which remaining games change a team&apos;s odds the most. Seed charts show how often the team finishes in each spot. Clinched and eliminated labels are based on possible win totals.</p>
          </article>
          <article className="rounded-xl border border-[var(--background-tertiary)] bg-[var(--background)] p-4">
            <h3 className="font-bold text-white">Saving and sharing</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">You can undo changes, lock picks, and save different what-if ideas. Saved scenarios stay in your browser. A share link lets someone else open the same picks.</p>
          </article>
          <article className="rounded-xl border border-[var(--background-tertiary)] bg-[var(--background)] p-4">
            <h3 className="font-bold text-white">Live games and bracket</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">Live Week shows the next unfinished week. You can mark games live and update them as they happen. In the bracket, the No. 1 seed can choose any other playoff seed. The highest remaining seed chooses next.</p>
          </article>
          <article className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.055] p-4 md:col-span-2">
            <h3 className="font-bold text-emerald-300">No official data is changed</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">This tool never changes real league data. Picks, demo results, live markers, and bracket choices stay inside the calculator. Fake schedules are shown only when a division has no real schedule yet.</p>
          </article>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-[var(--foreground-subtle)]">These odds are estimates, not guarantees. Changing the prediction choice or winning margins can change the results.</p>
      </div>
    </details>
  );
});

export function DevPlayoffCalculator({ seasonName, divisions, teams, matches, demoDivisionIds = [] }: { seasonName: string; divisions: CalculatorDivision[]; teams: CalculatorTeam[]; matches: CalculatorMatch[]; demoDivisionIds?: number[] }) {
  const [selectedDivisionId, setSelectedDivisionId] = useState(divisions[0]?.id ?? 0);
  const [predictions, setPredictions] = useState<Predictions>({});
  const [lockedMatchIds, setLockedMatchIds] = useState<Set<number>>(new Set());
  const [undoStack, setUndoStack] = useState<Predictions[]>([]);
  const [redoStack, setRedoStack] = useState<Predictions[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [matchFilter, setMatchFilter] = useState<MatchFilter>("all");
  const [weekFilter, setWeekFilter] = useState<number | "all">("all");
  const [teamFilter, setTeamFilter] = useState<number | "all">("all");
  const [differentialMode, setDifferentialMode] = useState<DifferentialMode>("manual");
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [liveMatchIds, setLiveMatchIds] = useState<Set<number>>(new Set());
  const [analysisEnabled, setAnalysisEnabled] = useState(false);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [compareFirstId, setCompareFirstId] = useState("");
  const [compareSecondId, setCompareSecondId] = useState("");
  const [showLeagueSummary, setShowLeagueSummary] = useState(true);
  const [showProbabilityDashboard, setShowProbabilityDashboard] = useState(true);
  const [showBracket, setShowBracket] = useState(false);
  const predictionsRef = useRef(predictions);

  useEffect(() => { predictionsRef.current = predictions; }, [predictions]);
  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      try { setSavedScenarios(validSavedScenarios(JSON.parse(localStorage.getItem(SAVED_SCENARIOS_KEY) ?? "[]"))); } catch {}
      const encoded = new URLSearchParams(window.location.search).get("pc");
      if (!encoded) return;
      const payload = await decodeScenario(encoded);
      if (payload?.predictions) setPredictions(payload.predictions);
      if (payload?.divisionId && divisions.some((division) => division.id === payload.divisionId)) setSelectedDivisionId(payload.divisionId);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [divisions]);

  const selectedDivision = divisions.find((division) => division.id === selectedDivisionId) ?? divisions[0];
  const activeDivisionId = selectedDivision?.id ?? 0;
  const divisionTeams = useMemo(() => teams.filter((team) => team.divisionId === activeDivisionId), [activeDivisionId, teams]);
  const divisionMatches = useMemo(() => matches.filter((match) => match.divisionId === activeDivisionId && match.week <= 100), [activeDivisionId, matches]);
  const remainingMatches = useMemo(() => divisionMatches.filter((match) => !match.winnerId && !match.isForfeit), [divisionMatches]);
  const teamsById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const currentStandings = useMemo(() => standingsForCached(divisionTeams, divisionMatches), [divisionMatches, divisionTeams]);
  const projectedStandings = useMemo(() => standingsForCached(divisionTeams, divisionMatches, predictions), [divisionMatches, divisionTeams, predictions]);
  const currentSeeds = useMemo(() => new Map(currentStandings.map((standing, index) => [standing.id, index + 1])), [currentStandings]);
  const averageDifferentials = useMemo(() => averageWinningDifferentials(divisionTeams, divisionMatches), [divisionMatches, divisionTeams]);
  const weeks = useMemo(() => [...new Set(divisionMatches.map((match) => match.week))].sort((a, b) => a - b), [divisionMatches]);
  const activeTeams = useMemo(() => divisionTeams.filter((team) => team.isActive), [divisionTeams]);

  const effectiveSelectedTeamId = activeTeams.some((team) => team.id === selectedTeamId)
    ? selectedTeamId
    : activeTeams[0]?.id ?? null;
  const primaryOpenMatchId = divisionMatches.find((match) => !match.winnerId && !predictions[match.id] && (match.coach1SeasonId === effectiveSelectedTeamId || match.coach2SeasonId === effectiveSelectedTeamId))?.id;
  const workerAnalysis = usePlayoffWorker({ teams: divisionTeams, matches: divisionMatches, predictions, teamId: effectiveSelectedTeamId, analysisEnabled, primaryMatchId: primaryOpenMatchId });
  const fallbackProjections = useMemo(() => new Map(projectedStandings.map((team, index) => [team.id, {
    teamId: team.id,
    playoffProbability: index < PLAYOFF_SPOTS ? 1 : 0,
    seedProbabilities: projectedStandings.map((_, seedIndex) => seedIndex === index ? 1 : 0),
    bestSeed: index + 1,
    worstSeed: index + 1,
    minimumWins: team.wins,
    maximumWins: team.wins,
    status: "alive" as const,
  }])), [projectedStandings]);
  const activeTeamIds = new Set(activeTeams.map((team) => team.id));
  const workerOddsValid = workerAnalysis.odds && [...workerAnalysis.odds.projections.keys()].every((teamId) => activeTeamIds.has(teamId));
  const projections = workerOddsValid ? workerAnalysis.odds!.projections : fallbackProjections;
  const leverage = useMemo(() => analysisEnabled ? workerAnalysis.leverage : [], [analysisEnabled, workerAnalysis.leverage]);
  const dataWarnings = useMemo(() => inspectDataQuality(divisionTeams, divisionMatches), [divisionMatches, divisionTeams]);

  const editableMatches = useMemo(() => {
    const source = showCompleted ? divisionMatches : remainingMatches;
    return source.filter((match) => {
      if (weekFilter !== "all" && match.week !== weekFilter) return false;
      if (teamFilter !== "all" && match.coach1SeasonId !== teamFilter && match.coach2SeasonId !== teamFilter) return false;
      if (matchFilter === "picked" && !predictions[match.id]) return false;
      if (matchFilter === "unpicked" && predictions[match.id]) return false;
      if (matchFilter === "locked" && !lockedMatchIds.has(match.id)) return false;
      return true;
    });
  }, [divisionMatches, lockedMatchIds, matchFilter, predictions, remainingMatches, showCompleted, teamFilter, weekFilter]);

  const selectedStanding = projectedStandings.find((team) => team.id === effectiveSelectedTeamId) ?? projectedStandings[0];
  const selectedPredictionCount = divisionMatches.filter((match) => predictions[match.id]).length;

  function commitPredictions(change: Predictions | ((current: Predictions) => Predictions)) {
    const current = predictionsRef.current;
    const next = typeof change === "function" ? change(current) : change;
    setUndoStack((stack) => [...stack.slice(-39), current]);
    setRedoStack([]);
    predictionsRef.current = next;
    setPredictions(next);
  }

  function setPrediction(matchId: number, prediction?: Prediction) {
    commitPredictions((current) => { const next = { ...current }; if (prediction) next[matchId] = prediction; else delete next[matchId]; return next; });
  }

  function undo() {
    const previous = undoStack.at(-1); if (!previous) return;
    setUndoStack((stack) => stack.slice(0, -1)); setRedoStack((stack) => [...stack, predictionsRef.current]); predictionsRef.current = previous; setPredictions(previous);
  }

  function redo() {
    const next = redoStack.at(-1); if (!next) return;
    setRedoStack((stack) => stack.slice(0, -1)); setUndoStack((stack) => [...stack, predictionsRef.current]); predictionsRef.current = next; setPredictions(next);
  }

  function suggestedDifferential(match: CalculatorMatch, winnerId: number) {
    const typical = averageDifferentials.get(winnerId) ?? 3;
    if (differentialMode === "typical") return typical;
    if (differentialMode === "probability") return Math.max(1, Math.min(6, typical + ((Math.abs(match.id + winnerId) % 3) - 1)));
    return predictions[match.id]?.differential ?? 3;
  }

  function fillVisible(mode: "favorite" | "underdog" | "random") {
    commitPredictions((current) => {
      const next = { ...current };
      for (const match of editableMatches) {
        if (lockedMatchIds.has(match.id) || next[match.id]) continue;
        const firstSeed = currentSeeds.get(match.coach1SeasonId) ?? 99;
        const secondSeed = currentSeeds.get(match.coach2SeasonId) ?? 99;
        const favorite = firstSeed <= secondSeed ? match.coach1SeasonId : match.coach2SeasonId;
        const winnerId = mode === "random" ? (Math.random() < 0.5 ? match.coach1SeasonId : match.coach2SeasonId) : mode === "favorite" ? favorite : favorite === match.coach1SeasonId ? match.coach2SeasonId : match.coach1SeasonId;
        next[match.id] = { winnerId, differential: suggestedDifferential(match, winnerId) };
      }
      return next;
    });
  }

  function resetVisible() {
    const ids = new Set(editableMatches.filter((match) => !lockedMatchIds.has(match.id)).map((match) => match.id));
    commitPredictions((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !ids.has(Number(id)))));
  }

  function applyDifferential(value: number) {
    commitPredictions((current) => Object.fromEntries(Object.entries(current).map(([id, prediction]) => [id, { ...prediction, differential: value }])));
  }

  function saveScenario() {
    const name = window.prompt("Scenario name", `${selectedDivision.name} scenario`); if (!name?.trim()) return;
    const scenario: SavedScenario = { version: SCENARIO_VERSION, id: crypto.randomUUID(), name: name.trim(), predictions, divisionId: selectedDivision.id, savedAt: new Date().toISOString() };
    const next = [scenario, ...savedScenarios].slice(0, 12); setSavedScenarios(next); localStorage.setItem(SAVED_SCENARIOS_KEY, JSON.stringify(next));
  }

  async function shareScenario() {
    const payload = await encodeScenario({ predictions, divisionId: selectedDivision.id });
    const url = new URL(window.location.href); url.searchParams.set("pc", payload); window.history.replaceState(null, "", url);
    await navigator.clipboard.writeText(url.toString());
  }

  function loadScenario(scenario: SavedScenario) { commitPredictions(scenario.predictions); setSelectedDivisionId(scenario.divisionId); }
  function deleteScenario(id: string) { const next = savedScenarios.filter((scenario) => scenario.id !== id); setSavedScenarios(next); localStorage.setItem(SAVED_SCENARIOS_KEY, JSON.stringify(next)); }

  const divisionSummaries = useMemo(() => divisions.map((division) => ({ division, standings: standingsForCached(teams.filter((team) => team.divisionId === division.id), matches.filter((match) => match.divisionId === division.id && match.week <= 100), predictions) })), [divisions, matches, predictions, teams]);
  const selectedOpenMatch = divisionMatches.find((match) => !match.winnerId && !predictions[match.id] && (match.coach1SeasonId === effectiveSelectedTeamId || match.coach2SeasonId === effectiveSelectedTeamId));
  const differentialScenarios = useMemo(() => {
    if (!selectedOpenMatch || !effectiveSelectedTeamId) return [];
    const opponentId = selectedOpenMatch.coach1SeasonId === effectiveSelectedTeamId ? selectedOpenMatch.coach2SeasonId : selectedOpenMatch.coach1SeasonId;
    return [effectiveSelectedTeamId, opponentId].flatMap((winnerId) => DIFFERENTIALS.map((differential) => {
      const scenario = { ...predictions, [selectedOpenMatch.id]: { winnerId, differential } };
      const standings = standingsForCached(divisionTeams, divisionMatches, scenario);
      const seed = standings.findIndex((team) => team.id === effectiveSelectedTeamId) + 1;
      return { winnerId, differential, seed, qualifies: seed <= PLAYOFF_SPOTS };
    }));
  }, [divisionMatches, divisionTeams, effectiveSelectedTeamId, predictions, selectedOpenMatch]);
  const matrixMatches = useMemo(() => {
    if (!analysisEnabled || !selectedOpenMatch) return [];
    const leverageMatch = leverage.find((entry) => entry.matchId !== selectedOpenMatch.id);
    const second = divisionMatches.find((match) => match.id === leverageMatch?.matchId);
    return second ? [selectedOpenMatch, second] : [];
  }, [analysisEnabled, divisionMatches, leverage, selectedOpenMatch]);
  const outcomeMatrix = analysisEnabled ? workerAnalysis.matrix : [];
  const comparison = useMemo(() => {
    const first = savedScenarios.find((scenario) => scenario.id === compareFirstId);
    const second = savedScenarios.find((scenario) => scenario.id === compareSecondId);
    if (!first || !second) return [];
    const firstStandings = standingsForCached(divisionTeams, divisionMatches, first.predictions);
    const secondStandings = standingsForCached(divisionTeams, divisionMatches, second.predictions);
    const secondSeeds = new Map(secondStandings.map((team, index) => [team.id, index + 1]));
    return firstStandings.map((team, index) => ({ team, firstSeed: index + 1, secondSeed: secondSeeds.get(team.id) ?? index + 1 }));
  }, [compareFirstId, compareSecondId, divisionMatches, divisionTeams, savedScenarios]);

  async function copyDiscordSummary() {
    const lines = [`**${seasonName} — ${selectedDivision.name} Playoff Projection**`, ...projectedStandings.slice(0, PLAYOFF_SPOTS).map((team, index) => `${index + 1}. ${team.teamName} (${team.wins}-${team.losses}, ${team.differential > 0 ? "+" : ""}${team.differential}) — ${percent(projections.get(team.id)?.playoffProbability ?? 0)}`)];
    const bubble = projectedStandings.slice(PLAYOFF_SPOTS, PLAYOFF_SPOTS + 3);
    if (bubble.length) lines.push("", "**Bubble**", ...bubble.map((team, index) => `${PLAYOFF_SPOTS + index + 1}. ${team.teamName} — ${percent(projections.get(team.id)?.playoffProbability ?? 0)}`));
    await navigator.clipboard.writeText(lines.join("\n"));
  }

  if (!selectedDivision) return <div className="poke-card p-8 text-center"><p className="font-pixel text-lg text-white">No season divisions found</p></div>;

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 pb-12">
      <header className="poke-card overflow-hidden">
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--primary)]">{seasonName}</p>
            <h1 className="mt-1 font-pixel text-xl leading-relaxed text-white sm:text-2xl">Playoff Predictor</h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--foreground-muted)]">Edit outcomes, model differential, save scenarios, and simulate the eight-team field in every division.</p>
            {demoDivisionIds.includes(selectedDivision.id) && <p className="mt-3 inline-flex rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-300">Demo schedule · Weeks 1–5 fake · Weeks 6–8 editable</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={undo} disabled={!undoStack.length} className="btn-retro-secondary px-3 py-2 text-[10px]">Undo</button>
            <button type="button" onClick={redo} disabled={!redoStack.length} className="btn-retro-secondary px-3 py-2 text-[10px]">Redo</button>
            <button type="button" onClick={saveScenario} className="btn-retro-secondary px-3 py-2 text-[10px]">Save</button>
            <button type="button" onClick={() => void shareScenario()} className="btn-retro px-3 py-2 text-[10px]">Copy share link</button>
            <button type="button" onClick={() => void copyDiscordSummary()} className="btn-retro-secondary px-3 py-2 text-[10px]">Copy Discord</button>
          </div>
        </div>
      </header>

      <AboutCalculator />

      <nav className="poke-card flex gap-2 overflow-x-auto p-2" aria-label="Division calculator">{divisions.map((division) => { const divisionMatches = matches.filter((match) => match.divisionId === division.id && match.week <= 100); const remaining = divisionMatches.filter((match) => !match.winnerId); const picked = divisionMatches.filter((match) => predictions[match.id]).length; const active = division.id === selectedDivision.id; return <button key={division.id} type="button" onClick={() => setSelectedDivisionId(division.id)} className={`min-w-[150px] flex-1 rounded-lg border px-4 py-3 text-left ${active ? "border-[var(--primary)] bg-[var(--primary)]/15 text-white" : "border-transparent bg-[var(--background)] text-[var(--foreground-muted)] hover:text-white"}`}><span className="block font-bold">{division.name}</span><span className="mt-1 block text-[10px] uppercase">{picked} edits · {remaining.length} open{demoDivisionIds.includes(division.id) ? " · Demo" : ""}</span></button>; })}</nav>

      <section className="poke-card p-4 sm:p-5"><div className={`${showLeagueSummary ? "mb-3" : ""} flex items-center justify-between`}><div><p className="text-[10px] font-bold uppercase tracking-widest text-sky-300">League-wide view</p><h2 className="mt-1 text-xl font-black text-white">All five playoff fields</h2></div><button type="button" onClick={() => setShowLeagueSummary((shown) => !shown)} className="btn-retro-secondary px-3 py-2 text-[10px]">{showLeagueSummary ? "Collapse" : "Expand"}</button></div>{showLeagueSummary && <div className="grid gap-3 lg:grid-cols-5">{divisionSummaries.map(({ division, standings }) => <button key={division.id} type="button" onClick={() => setSelectedDivisionId(division.id)} className="rounded-xl border border-[var(--background-tertiary)] bg-[var(--background)] p-3 text-left hover:border-[var(--primary)]"><p className="mb-2 font-bold text-white">{division.name}</p><div className="space-y-1">{standings.slice(0, PLAYOFF_SPOTS).map((team, index) => <div key={team.id} className="flex gap-2 text-[10px]"><span className="w-4 text-[var(--primary)]">{index + 1}</span><span className="truncate text-[var(--foreground-muted)]">{team.teamName}</span></div>)}</div></button>)}</div>}</section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(420px,0.9fr)_minmax(680px,1.3fr)]">
        <section className="poke-card p-4 sm:p-5 xl:sticky xl:top-4"><div className="mb-4"><p className="text-[10px] font-bold uppercase tracking-widest text-[var(--primary)]">Scenario editor</p><h2 className="mt-1 text-xl font-black text-white">Match outcomes</h2></div>
          <div className="mb-3 grid gap-2 sm:grid-cols-2"><select value={weekFilter} onChange={(event) => setWeekFilter(event.target.value === "all" ? "all" : Number(event.target.value))} className="rounded bg-[var(--background)] px-2 py-2 text-xs text-white"><option value="all">All weeks</option>{weeks.map((week) => <option key={week} value={week}>Week {week}</option>)}</select><select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value === "all" ? "all" : Number(event.target.value))} className="rounded bg-[var(--background)] px-2 py-2 text-xs text-white"><option value="all">All teams</option>{activeTeams.map((team) => <option key={team.id} value={team.id}>{team.teamName}</option>)}</select><select value={matchFilter} onChange={(event) => setMatchFilter(event.target.value as MatchFilter)} className="rounded bg-[var(--background)] px-2 py-2 text-xs text-white"><option value="all">All statuses</option><option value="picked">Edited</option><option value="unpicked">Unedited</option><option value="locked">Locked</option></select><select value={differentialMode} onChange={(event) => setDifferentialMode(event.target.value as DifferentialMode)} className="rounded bg-[var(--background)] px-2 py-2 text-xs text-white"><option value="manual">Manual +3 default</option><option value="typical">Team average diff</option><option value="probability">Modeled diff</option></select><button type="button" onClick={() => { const nextWeek = Math.min(...remainingMatches.map((match) => match.week)); if (Number.isFinite(nextWeek)) setWeekFilter(nextWeek); setShowCompleted(false); setMatchFilter("all"); }} className="rounded border border-red-400/30 bg-red-400/10 px-2 py-2 text-xs font-bold text-red-300">Live week mode · {liveMatchIds.size} active</button></div>
          <label className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--background-tertiary)] p-2 text-xs text-[var(--foreground-muted)]"><input type="checkbox" checked={showCompleted} onChange={(event) => setShowCompleted(event.target.checked)} /> Allow what-if edits to completed results</label>
          <div className="mb-3 flex flex-wrap gap-1.5"><button type="button" onClick={() => fillVisible("favorite")} className="rounded bg-[var(--background)] px-2 py-1.5 text-[10px] font-bold text-white">Favorites</button><button type="button" onClick={() => fillVisible("underdog")} className="rounded bg-[var(--background)] px-2 py-1.5 text-[10px] font-bold text-white">Upsets</button><button type="button" onClick={() => fillVisible("random")} className="rounded bg-[var(--background)] px-2 py-1.5 text-[10px] font-bold text-white">Random</button><button type="button" onClick={resetVisible} className="rounded bg-red-400/10 px-2 py-1.5 text-[10px] font-bold text-red-300">Reset visible</button><span className="ml-auto text-[10px] text-[var(--foreground-subtle)]">{selectedPredictionCount} edits</span></div>
          <div className="mb-3 flex items-center gap-1"><span className="mr-1 text-[9px] uppercase text-[var(--foreground-subtle)]">Set all edited diff:</span>{DIFFERENTIALS.map((value) => <button key={value} type="button" onClick={() => applyDifferential(value)} className="h-7 w-7 rounded bg-[var(--background)] text-xs text-white">{value}</button>)}</div>
          <div className="max-h-[calc(100vh-260px)] space-y-3 overflow-y-auto pr-1">{editableMatches.length ? editableMatches.map((match) => <MatchEditor key={match.id} match={match} teamsById={teamsById} override={predictions[match.id]} locked={lockedMatchIds.has(match.id)} live={liveMatchIds.has(match.id)} allowOfficialEdit={showCompleted} suggestedDifferential={(winnerId) => suggestedDifferential(match, winnerId)} onChange={(prediction) => setPrediction(match.id, prediction)} onToggleLock={() => setLockedMatchIds((current) => { const next = new Set(current); if (next.has(match.id)) next.delete(match.id); else next.add(match.id); return next; })} onToggleLive={() => setLiveMatchIds((current) => { const next = new Set(current); if (next.has(match.id)) next.delete(match.id); else next.add(match.id); return next; })} />) : <div className="rounded-xl border border-dashed border-[var(--background-tertiary)] p-8 text-center text-sm text-[var(--foreground-muted)]">No matches match these filters.</div>}</div>
        </section>

        <div className="space-y-5">
          <section className="poke-card p-4 sm:p-5">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-white">{selectedDivision.name} standings</h2>
              </div>
              <p className="text-right text-[9px] uppercase text-[var(--foreground-subtle)]">Standings-based model<br />Wins → diff → H2H → SoS</p>
            </div>
            <StandingsTable standings={projectedStandings} currentSeeds={currentSeeds} projections={projections} selectedTeamId={effectiveSelectedTeamId} onSelectTeam={setSelectedTeamId} />
          </section>
          {selectedStanding && <TeamPathPanel team={selectedStanding} standings={projectedStandings} projection={projections.get(selectedStanding.id)} />}
          <section className="poke-card p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-widest text-orange-300">Data confidence</p><h2 className="mt-1 text-xl font-black text-white">Projection checks</h2></div><span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${dataWarnings.length ? "border-amber-400/30 bg-amber-400/10 text-amber-300" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"}`}>{dataWarnings.length ? `${dataWarnings.length} warning${dataWarnings.length === 1 ? "" : "s"}` : "Clean"}</span></div>{dataWarnings.length ? <ul className="mt-3 space-y-2 text-sm text-[var(--foreground-muted)]">{dataWarnings.map((warning) => <li key={warning} className="rounded-lg border border-amber-400/20 bg-amber-400/[0.05] p-3">{warning}</li>)}</ul> : <p className="mt-3 text-sm text-[var(--foreground-muted)]">Schedule balance, result differential, duplicate matchups, and replacement mappings passed the calculator checks.</p>}</section>
          <section className="poke-card p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-widest text-rose-300">Game leverage</p><h2 className="mt-1 text-xl font-black text-white">Biggest playoff swings</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">How much each unresolved result changes {selectedStanding?.teamName ?? "the selected team"}&apos;s playoff odds.</p></div><button type="button" onClick={() => setAnalysisEnabled((enabled) => !enabled)} className="btn-retro-secondary px-3 py-2 text-[10px]">{analysisEnabled ? "Refresh analysis" : "Analyze games"}</button></div>{analysisEnabled ? <div className="mt-4 space-y-2">{leverage.slice(0, 6).map((entry) => { const match = divisionMatches.find((candidate) => candidate.id === entry.matchId)!; return <div key={entry.matchId} className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] p-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-bold text-white">Week {match.week}: {teamLabel(teamsById.get(match.coach1SeasonId))} vs {teamLabel(teamsById.get(match.coach2SeasonId))}</p><span className="font-mono text-sm font-black text-rose-300">{Math.round(entry.swing * 100)} pt swing</span></div><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => setPrediction(match.id, { winnerId: match.coach1SeasonId, differential: suggestedDifferential(match, match.coach1SeasonId) })} className="rounded bg-[var(--background-secondary)] p-2 text-xs text-[var(--foreground-muted)] hover:text-white">{teamLabel(teamsById.get(match.coach1SeasonId))} wins: <strong>{percent(entry.firstTeamOdds)}</strong></button><button type="button" onClick={() => setPrediction(match.id, { winnerId: match.coach2SeasonId, differential: suggestedDifferential(match, match.coach2SeasonId) })} className="rounded bg-[var(--background-secondary)] p-2 text-xs text-[var(--foreground-muted)] hover:text-white">{teamLabel(teamsById.get(match.coach2SeasonId))} wins: <strong>{percent(entry.secondTeamOdds)}</strong></button></div></div>; })}{!leverage.length && <p className="text-sm text-[var(--foreground-muted)]">No unresolved matches remain.</p>}</div> : <p className="mt-3 text-sm text-[var(--foreground-muted)]">Run the deeper analysis on demand to rank the most important remaining games.</p>}</section>
          {selectedOpenMatch && differentialScenarios.length > 0 && <section className="poke-card p-4 sm:p-5"><div className="mb-4"><p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">Differential requirements</p><h2 className="mt-1 text-xl font-black text-white">Week {selectedOpenMatch.week} seed impact</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Exact standings result for each differential in the current scenario, holding other unpicked games open.</p></div><div className="grid gap-3 sm:grid-cols-2">{[selectedOpenMatch.coach1SeasonId, selectedOpenMatch.coach2SeasonId].map((winnerId) => <div key={winnerId} className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] p-3"><p className="mb-2 text-sm font-bold text-white">{teamLabel(teamsById.get(winnerId))} wins</p><div className="grid grid-cols-6 gap-1">{differentialScenarios.filter((scenario) => scenario.winnerId === winnerId).map((scenario) => <button key={scenario.differential} type="button" onClick={() => setPrediction(selectedOpenMatch.id, { winnerId, differential: scenario.differential })} className={`rounded p-2 text-center ${scenario.qualifies ? "bg-emerald-400/10 text-emerald-300" : "bg-red-400/10 text-red-300"}`}><span className="block text-[9px]">+{scenario.differential}</span><span className="font-black">#{scenario.seed}</span></button>)}</div></div>)}</div></section>}
          {analysisEnabled && matrixMatches.length === 2 && <section className="poke-card p-4 sm:p-5"><div className="mb-4"><p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">Outcome matrix</p><h2 className="mt-1 text-xl font-black text-white">Two-game interaction</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Selected team&apos;s next game crossed with the highest-leverage unpicked game.</p></div><div className="grid gap-2 sm:grid-cols-2">{outcomeMatrix.map((cell) => <div key={`${cell.firstWinnerId}-${cell.secondWinnerId}`} className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] p-3"><p className="text-xs text-[var(--foreground-muted)]">{teamLabel(teamsById.get(cell.firstWinnerId))} wins + {teamLabel(teamsById.get(cell.secondWinnerId))} wins</p><div className="mt-2 flex items-end justify-between"><span className="text-xl font-black text-white">{percent(cell.odds)}</span><span className="text-[10px] uppercase text-[var(--foreground-subtle)]">Seed #{cell.bestSeed}–#{cell.worstSeed}</span></div></div>)}</div></section>}
          <section className="poke-card p-4 sm:p-5"><div className={`${showProbabilityDashboard ? "mb-4" : ""} flex items-center justify-between`}><div><p className="text-[10px] font-bold uppercase tracking-widest text-amber-300">Probability dashboard</p><h2 className="mt-1 text-xl font-black text-white">Playoff race</h2></div><button type="button" onClick={() => setShowProbabilityDashboard((shown) => !shown)} className="btn-retro-secondary px-3 py-2 text-[10px]">{showProbabilityDashboard ? "Collapse" : "Expand"}</button></div>{showProbabilityDashboard && <div className="grid gap-2 sm:grid-cols-2">{projectedStandings.map((team) => { const projection = projections.get(team.id); return <button key={team.id} type="button" onClick={() => setSelectedTeamId(team.id)} className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] p-3 text-left"><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-bold text-white">{team.teamName}</span><span className="font-mono font-black text-white">{projection ? percent(projection.playoffProbability) : "—"}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded bg-[var(--background-tertiary)]"><div className="h-full bg-emerald-400" style={{ width: `${(projection?.playoffProbability ?? 0) * 100}%` }} /></div><div className="mt-2 flex justify-between text-[9px] uppercase text-[var(--foreground-subtle)]"><span>Best #{projection?.bestSeed}</span><span>Worst #{projection?.worstSeed}</span></div></button>; })}</div>}</section>
          {!showBracket ? <section className="poke-card flex items-center justify-between gap-3 p-4 sm:p-5"><div><p className="text-[10px] font-bold uppercase tracking-widest text-fuchsia-300">Opponent-selection bracket</p><h2 className="mt-1 text-xl font-black text-white">Bracket simulator is deferred</h2></div><button type="button" onClick={() => setShowBracket(true)} className="btn-retro px-3 py-2 text-[10px]">Load bracket</button></section> : <div><button type="button" onClick={() => setShowBracket(false)} className="mb-2 text-[10px] font-bold uppercase text-[var(--foreground-muted)] hover:text-white">Unload bracket</button><OpponentSelectionBracket key={projectedStandings.slice(0, 8).map((team) => team.id).join("-")} field={projectedStandings.slice(0, 8)} /></div>}
          <section className="poke-card p-4 sm:p-5"><div><p className="text-[10px] font-bold uppercase tracking-widest text-teal-300">Scenario comparison</p><h2 className="mt-1 text-xl font-black text-white">Compare saved what-ifs</h2></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><select value={compareFirstId} onChange={(event) => setCompareFirstId(event.target.value)} className="rounded bg-[var(--background)] px-3 py-2 text-sm text-white"><option value="">Choose first scenario</option>{savedScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}</select><select value={compareSecondId} onChange={(event) => setCompareSecondId(event.target.value)} className="rounded bg-[var(--background)] px-3 py-2 text-sm text-white"><option value="">Choose second scenario</option>{savedScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}</select></div>{comparison.length > 0 ? <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--background-tertiary)]"><table className="w-full text-sm"><thead className="bg-[var(--background)] text-[9px] uppercase text-[var(--foreground-subtle)]"><tr><th className="px-3 py-2 text-left">Team</th><th className="px-3 py-2">Scenario A</th><th className="px-3 py-2">Scenario B</th><th className="px-3 py-2">Change</th></tr></thead><tbody>{comparison.map((row) => <tr key={row.team.id} className="border-t border-[var(--background-tertiary)]"><td className="px-3 py-2 font-bold text-white">{row.team.teamName}</td><td className="px-3 py-2 text-center text-[var(--foreground-muted)]">#{row.firstSeed}</td><td className="px-3 py-2 text-center text-[var(--foreground-muted)]">#{row.secondSeed}</td><td className={`px-3 py-2 text-center font-bold ${row.secondSeed < row.firstSeed ? "text-emerald-300" : row.secondSeed > row.firstSeed ? "text-red-300" : "text-[var(--foreground-subtle)]"}`}>{row.secondSeed === row.firstSeed ? "—" : row.secondSeed < row.firstSeed ? `▲ ${row.firstSeed - row.secondSeed}` : `▼ ${row.secondSeed - row.firstSeed}`}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-sm text-[var(--foreground-muted)]">Save at least two scenarios, then select them above to compare every seed.</p>}</section>
          <section className="poke-card p-4 sm:p-5"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-widest text-violet-300">Local scenarios</p><h2 className="mt-1 text-xl font-black text-white">Saved what-ifs</h2></div></div>{savedScenarios.length ? <div className="mt-3 space-y-2">{savedScenarios.map((scenario) => <div key={scenario.id} className="flex items-center gap-2 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] p-3"><button type="button" onClick={() => loadScenario(scenario)} className="min-w-0 flex-1 text-left"><p className="truncate text-sm font-bold text-white">{scenario.name}</p><p className="text-[9px] uppercase text-[var(--foreground-subtle)]">{new Date(scenario.savedAt).toLocaleString()}</p></button><button type="button" onClick={() => deleteScenario(scenario.id)} className="text-xs text-red-300">Delete</button></div>)}</div> : <p className="mt-3 text-sm text-[var(--foreground-muted)]">Save named scenarios in this browser or copy a shareable URL.</p>}</section>
        </div>
      </div>
    </div>
  );
}
