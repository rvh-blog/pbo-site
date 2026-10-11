"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ExperimentalMatch } from "./experimental-stats-client";

type Side = "p1" | "p2";
type StatusCode = "brn" | "par" | "psn" | "tox" | "slp" | "frz";
type StatusCounts = Record<StatusCode, number>;

const statusLabels: Record<StatusCode, string> = {
  brn: "Burn",
  par: "Paralysis",
  psn: "Poison",
  tox: "Toxic poison",
  slp: "Sleep",
  frz: "Freeze",
};

const statusCodes = new Set<StatusCode>(["brn", "par", "psn", "tox", "slp", "frz"]);

type SeasonCoverage = { seasonNumber: number; seasonName: string; matches: number; covered: number };

type PokemonStatusRow = {
  key: string;
  teamName: string;
  coachName: string;
  pokemonName: string;
  games: Set<number>;
  affectedAppearances: number;
  statusCounts: StatusCounts;
  confusionActivations: number;
  asleepTurns: number;
  frozenTurns: number;
  cures: number;
  maxDistinctStatuses: number;
  distinctStatusesAtMax: Set<StatusCode>;
  distinctExampleMatchId: number | null;
  exampleMatchId: number;
};

type ActorStatus = {
  side: Side;
  nickname: string;
  pokemonName: string;
  teamName: string;
  coachName: string;
  teamKey: string;
  matchId: number;
  statusCodes: Set<StatusCode>;
  statusCounts: StatusCounts;
  confusionActivations: number;
  asleepTurns: number;
  frozenTurns: number;
  cures: number;
};

function seasonNumberFromMatch(match: ExperimentalMatch) {
  if (typeof match.seasonNumber === "number") return match.seasonNumber;
  return Number(match.seasonName.match(/(?:season|s)\s*(\d+)/i)?.[1] ?? 0);
}

function teamForSide(match: ExperimentalMatch, side: Side) {
  if (match.p1IsCoach1 === null) return null;
  const sideIsCoach1 = side === "p1" ? match.p1IsCoach1 : !match.p1IsCoach1;
  return sideIsCoach1 ? match.coach1 : match.coach2;
}

function normalizeProtocolName(value: string | null | undefined) {
  return (value ?? "").toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

function statusCodeFromEvent(event: ExperimentalMatch["battleEvents"][number]): StatusCode | null {
  const code = normalizeProtocolName(event.statusName || event.rawLine.split("|")[3]);
  return statusCodes.has(code as StatusCode) ? code as StatusCode : null;
}

function formatPercent(numerator: number, denominator: number) {
  if (!denominator) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><div className="font-mono text-xl font-black text-white">{value}</div><div className="mt-1 text-[9px] font-black uppercase tracking-wider text-[var(--foreground-muted)]">{label}</div><p className="mt-2 text-[10px] leading-4 text-[var(--foreground-subtle)]">{detail}</p></div>;
}

function EmptyTable({ message }: { message: string }) {
  return <p className="p-4 text-xs text-[var(--foreground-muted)]">{message}</p>;
}

export function StatusEventsReport({ matches, seasons, selectedSeasonId }: { matches: ExperimentalMatch[]; seasons: Array<{ id: number; name: string; seasonNumber: number }>; selectedSeasonId: number | "all" }) {
  const [showAllRows, setShowAllRows] = useState(false);
  const report = useMemo(() => {
    const coverage = new Map<number, SeasonCoverage>(seasons
      .filter((season) => season.seasonNumber >= 5 && (selectedSeasonId === "all" || season.id === selectedSeasonId))
      .map((season) => [season.seasonNumber, { seasonNumber: season.seasonNumber, seasonName: season.name, matches: 0, covered: 0 }]));
    const rowsByPokemon = new Map<string, PokemonStatusRow>();
    const totals = {
      statusCounts: { brn: 0, par: 0, psn: 0, tox: 0, slp: 0, frz: 0 } satisfies StatusCounts,
      confusionActivations: 0,
      asleepTurns: 0,
      frozenTurns: 0,
      cures: 0,
    };
    let coveredMatches = 0;
    let totalMatches = 0;
    let affectedAppearances = 0;
    let appearancesWithMultipleStatuses = 0;
    let maxDistinctStatuses = 0;
    let maxDistinctStatusCodes = new Set<StatusCode>();

    for (const match of matches) {
      const seasonNumber = seasonNumberFromMatch(match);
      if (seasonNumber < 5) continue;
      const season = coverage.get(seasonNumber) ?? { seasonNumber, seasonName: match.seasonName, matches: 0, covered: 0 };
      season.matches += 1;
      coverage.set(seasonNumber, season);
      totalMatches += 1;

      const hasStatusCoverage = match.battleEvents.some((event) => event.eventType === "move");
      if (!hasStatusCoverage) continue;
      season.covered += 1;
      coveredMatches += 1;

      const speciesByActor = new Map<string, string>();
      const actors = new Map<string, ActorStatus>();
      const ensureActor = (side: Side, nickname: string) => {
        const actorKey = `${side}:${nickname.toLocaleLowerCase()}`;
        const knownSpecies = speciesByActor.get(actorKey);
        const team = teamForSide(match, side);
        const pokemonName = knownSpecies || nickname || "Unknown Pokémon";
        const teamKey = team ? `team-${team.seasonCoachId}` : `unmapped-${match.id}-${side}`;
        const current = actors.get(actorKey);
        if (current) {
          if (knownSpecies && current.pokemonName === current.nickname) current.pokemonName = knownSpecies;
          return current;
        }
        const actor: ActorStatus = {
          side,
          nickname,
          pokemonName,
          teamName: team?.teamName ?? `${side.toUpperCase()} side (team mapping unavailable)`,
          coachName: team?.coachName ?? "Unknown coach",
          teamKey,
          matchId: match.id,
          statusCodes: new Set<StatusCode>(),
          statusCounts: { brn: 0, par: 0, psn: 0, tox: 0, slp: 0, frz: 0 },
          confusionActivations: 0,
          asleepTurns: 0,
          frozenTurns: 0,
          cures: 0,
        };
        actors.set(actorKey, actor);
        return actor;
      };

      for (const event of match.battleEvents) {
        const side = event.player;
        const nickname = event.actorNickname?.trim() ?? "";
        const actorKey = side && nickname ? `${side}:${nickname.toLocaleLowerCase()}` : null;
        if (actorKey && ["switch", "drag", "replace", "formechange", "detailschange"].includes(event.eventType) && event.pokemonName) {
          speciesByActor.set(actorKey, event.pokemonName);
          const existingActor = actors.get(actorKey);
          if (existingActor) existingActor.pokemonName = event.pokemonName;
          continue;
        }
        if (!side || !nickname) continue;

        if (event.eventType === "status") {
          const code = statusCodeFromEvent(event);
          if (!code) continue;
          const actor = ensureActor(side, nickname);
          actor.statusCodes.add(code);
          actor.statusCounts[code] += 1;
          totals.statusCounts[code] += 1;
          continue;
        }

        if (event.eventType === "startEffect" && normalizeProtocolName(event.fieldName || event.rawLine.split("|")[3]) === "confusion") {
          ensureActor(side, nickname).confusionActivations += 1;
          totals.confusionActivations += 1;
          continue;
        }

        if (event.eventType === "cant") {
          const reason = normalizeProtocolName(event.rawLine.split("|")[3]);
          if (reason === "slp") {
            ensureActor(side, nickname).asleepTurns += 1;
            totals.asleepTurns += 1;
          } else if (reason === "frz") {
            ensureActor(side, nickname).frozenTurns += 1;
            totals.frozenTurns += 1;
          }
          continue;
        }

        if (event.eventType === "curestatus") {
          ensureActor(side, nickname).cures += 1;
          totals.cures += 1;
        }
      }

      for (const actor of actors.values()) {
        const key = `${actor.teamKey}:${actor.pokemonName.toLocaleLowerCase()}`;
        const row = rowsByPokemon.get(key) ?? {
          key,
          teamName: actor.teamName,
          coachName: actor.coachName,
          pokemonName: actor.pokemonName,
          games: new Set<number>(),
          affectedAppearances: 0,
          statusCounts: { brn: 0, par: 0, psn: 0, tox: 0, slp: 0, frz: 0 },
          confusionActivations: 0,
          asleepTurns: 0,
          frozenTurns: 0,
          cures: 0,
          maxDistinctStatuses: 0,
          distinctStatusesAtMax: new Set<StatusCode>(),
          distinctExampleMatchId: null,
          exampleMatchId: match.id,
        };
        row.games.add(match.id);
        row.affectedAppearances += 1;
        Object.keys(actor.statusCounts).forEach((code) => {
          const statusCode = code as StatusCode;
          row.statusCounts[statusCode] += actor.statusCounts[statusCode];
        });
        row.confusionActivations += actor.confusionActivations;
        row.asleepTurns += actor.asleepTurns;
        row.frozenTurns += actor.frozenTurns;
        row.cures += actor.cures;
        if (actor.statusCodes.size > 1) appearancesWithMultipleStatuses += 1;
        if (actor.statusCodes.size > maxDistinctStatuses) {
          maxDistinctStatuses = actor.statusCodes.size;
          maxDistinctStatusCodes = new Set(actor.statusCodes);
        }
        if (actor.statusCodes.size > row.maxDistinctStatuses) {
          row.maxDistinctStatuses = actor.statusCodes.size;
          row.distinctStatusesAtMax = new Set(actor.statusCodes);
          row.distinctExampleMatchId = match.id;
        }
        rowsByPokemon.set(key, row);
        affectedAppearances += 1;
      }
    }

    const rows = [...rowsByPokemon.values()].map((row) => ({ ...row, gamesPlayed: row.games.size }))
      .sort((a, b) => (b.maxDistinctStatuses - a.maxDistinctStatuses) || (b.confusionActivations + b.asleepTurns + b.frozenTurns + b.cures + Object.values(b.statusCounts).reduce((sum, count) => sum + count, 0)) - (a.confusionActivations + a.asleepTurns + a.frozenTurns + a.cures + Object.values(a.statusCounts).reduce((sum, count) => sum + count, 0)) || a.pokemonName.localeCompare(b.pokemonName));

    return {
      coverage: [...coverage.values()].sort((a, b) => a.seasonNumber - b.seasonNumber),
      totals,
      coveredMatches,
      totalMatches,
      affectedAppearances,
      appearancesWithMultipleStatuses,
      maxDistinctStatuses,
      maxDistinctStatusCodes,
      rows,
    };
  }, [matches, seasons, selectedSeasonId]);

  const hasCoverage = report.coveredMatches > 0;
  const visibleRows = showAllRows ? report.rows : report.rows.slice(0, 30);
  const poisonTotal = report.totals.statusCounts.psn + report.totals.statusCounts.tox;
  const maxStatusNames = report.maxDistinctStatusCodes;

  return <div className="space-y-5">
    <section className="poke-card p-5 md:p-6">
      <h2 className="font-pixel text-sm text-white">Status events</h2>
      <p className="mt-2 max-w-4xl text-xs leading-5 text-[var(--foreground-muted)]">Counts use explicit normalized Showdown protocol events in covered Season 5+ replays. Status applications are counted on the affected Pokémon; the report does not infer an attacker when the replay does not identify one. Sleep and freeze turns count explicit blocked-action (`cant`) events. Distinct status counts track unique major status codes experienced by one Pokémon in one match. These replay counts are separate from the saved Favorable Events counter.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Paralysis inflicted" value={hasCoverage ? report.totals.statusCounts.par.toLocaleString() : "—"} detail="Logged paralysis applications" />
        <SummaryCard label="Poison and toxic poison inflicted" value={hasCoverage ? poisonTotal.toLocaleString() : "—"} detail={`${report.totals.statusCounts.psn.toLocaleString()} poison · ${report.totals.statusCounts.tox.toLocaleString()} toxic poison`} />
        <SummaryCard label="Confusion activations" value={hasCoverage ? report.totals.confusionActivations.toLocaleString() : "—"} detail="Logged confusion starts" />
        <SummaryCard label="Turns asleep" value={hasCoverage ? report.totals.asleepTurns.toLocaleString() : "—"} detail="Explicit turns blocked by sleep" />
        <SummaryCard label="Turns frozen" value={hasCoverage ? report.totals.frozenTurns.toLocaleString() : "—"} detail="Explicit turns blocked by freeze" />
        <SummaryCard label="Status cures" value={hasCoverage ? report.totals.cures.toLocaleString() : "—"} detail="Logged cure-status events" />
        <SummaryCard label="Distinct statuses on one Pokémon" value={hasCoverage ? report.maxDistinctStatuses.toLocaleString() : "—"} detail={`${report.appearancesWithMultipleStatuses.toLocaleString()} Pokémon appearances received more than one major status${maxStatusNames?.size ? ` · ${[...maxStatusNames].map((code) => statusLabels[code]).join(", ")}` : ""}`} />
        <SummaryCard label="Covered replays" value={`${report.coveredMatches.toLocaleString()} / ${report.totalMatches.toLocaleString()}`} detail={`${formatPercent(report.coveredMatches, report.totalMatches)} have a saved normalized move stream`} />
      </div>
    </section>

    {!hasCoverage ? <section className="rounded-xl border border-amber-400/35 bg-amber-500/10 p-4 text-xs leading-5 text-amber-100/90" role="status">No normalized replay event streams are saved for these filters. The report leaves the metric values unknown instead of treating missing event rows as zero.</section> : null}

    <section className="poke-card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-pixel text-sm text-white">Coverage by season</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">A match counts as covered when its normalized stream includes a move event. Status counts use covered Season 5+ replays; matches without a saved stream remain unknown.</p></div><span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-wide text-cyan-200">Season 5 onward</span></div>
      {report.coverage.length ? <div className="mt-4 overflow-x-auto touch-pan-x"><table className="w-full min-w-[500px] text-left text-xs"><thead className="text-[9px] uppercase tracking-wide text-[var(--foreground-muted)]"><tr><th className="px-3 py-2">Season</th><th className="px-3 py-2">Covered replays</th><th className="px-3 py-2">Coverage</th></tr></thead><tbody>{report.coverage.map((season) => <tr key={season.seasonNumber} className="border-t border-[var(--border)]"><td className="px-3 py-2 font-bold text-white">{season.seasonName}</td><td className="px-3 py-2 font-mono text-[var(--foreground-muted)]">{season.covered} / {season.matches}</td><td className="px-3 py-2 font-mono text-cyan-200">{formatPercent(season.covered, season.matches)}</td></tr>)}</tbody></table></div> : <EmptyTable message="No Season 5+ replay matches match the current filters." />}
    </section>

    <section className="poke-card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-pixel text-sm text-white">Pokémon status events</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Rows group a team&apos;s Pokémon across the filtered matches. “Distinct statuses” is the largest number seen on one battle appearance.</p></div>{report.rows.length > 30 ? <button type="button" onClick={() => setShowAllRows((current) => !current)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-[10px] font-black uppercase text-cyan-200 hover:border-cyan-400/50">{showAllRows ? "Show top 30" : `Show all ${report.rows.length}`}</button> : null}</div>
      <div className="mt-4 overflow-x-auto touch-pan-x"><table className="w-full min-w-[1280px] text-left text-xs"><thead className="text-[9px] uppercase tracking-wide text-[var(--foreground-muted)]"><tr><th className="px-3 py-2">Team</th><th className="px-3 py-2">Coach</th><th className="px-3 py-2">Pokémon</th><th className="px-3 py-2">Paralysis</th><th className="px-3 py-2">Poison</th><th className="px-3 py-2">Toxic poison</th><th className="px-3 py-2">Confusion</th><th className="px-3 py-2">Turns asleep</th><th className="px-3 py-2">Turns frozen</th><th className="px-3 py-2">Cures</th><th className="px-3 py-2">Distinct statuses</th><th className="px-3 py-2">Games</th><th className="px-3 py-2">Evidence</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.key} className="border-t border-[var(--border)]"><td className="px-3 py-2 font-bold text-white">{row.teamName}</td><td className="px-3 py-2 text-[var(--foreground-muted)]">{row.coachName}</td><td className="px-3 py-2 font-bold text-cyan-100">{row.pokemonName}</td><td className="px-3 py-2 font-mono text-amber-200">{row.statusCounts.par.toLocaleString()}</td><td className="px-3 py-2 font-mono text-amber-200">{row.statusCounts.psn.toLocaleString()}</td><td className="px-3 py-2 font-mono text-amber-200">{row.statusCounts.tox.toLocaleString()}</td><td className="px-3 py-2 font-mono text-violet-200">{row.confusionActivations.toLocaleString()}</td><td className="px-3 py-2 font-mono text-sky-200">{row.asleepTurns.toLocaleString()}</td><td className="px-3 py-2 font-mono text-sky-200">{row.frozenTurns.toLocaleString()}</td><td className="px-3 py-2 font-mono text-[var(--foreground-muted)]">{row.cures.toLocaleString()}</td><td className="px-3 py-2 font-mono text-cyan-200">{row.maxDistinctStatuses}{row.distinctStatusesAtMax.size ? <span className="ml-1 text-[9px] text-[var(--foreground-subtle)]">({[...row.distinctStatusesAtMax].map((code) => statusLabels[code]).join(", ")})</span> : null}</td><td className="px-3 py-2 font-mono text-[var(--foreground-muted)]">{row.games.size}</td><td className="px-3 py-2"><Link href={`/matches/${row.distinctExampleMatchId ?? row.exampleMatchId}`} className="text-cyan-300 underline underline-offset-2">Match #{row.distinctExampleMatchId ?? row.exampleMatchId}</Link></td></tr>)}</tbody></table>{!report.rows.length ? <EmptyTable message={hasCoverage ? "No status effect events are recorded in the covered replays in this scope." : "No status event rows are available."} /> : null}</div>
    </section>
  </div>;
}
