"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ExperimentalMatch } from "./experimental-stats-client";

type Side = "p1" | "p2";

const protectFamilyNames = new Set([
  "protect", "detect", "endure", "spikyshield", "banefulbunker", "kingsshield", "obstruct", "silktrap", "burningbulwark",
  "wideguard", "quickguard", "craftyshield", "matblock", "maxguard",
]);

type OutcomeRow = {
  key: string;
  teamName: string;
  coachName: string;
  pokemonName: string;
  games: Set<number>;
  repeatGames: Set<number>;
  failedGames: Set<number>;
  noTargetGames: Set<number>;
  moveUses: number;
  repeatedUses: number;
  failedMoves: number;
  noTargetMoves: number;
  exampleMatchId: number;
  repeatedExampleMatchId: number | null;
  failedExampleMatchId: number | null;
  noTargetExampleMatchId: number | null;
};

type MoveRow = {
  name: string;
  repeatedUses: number;
  noTargetUses: number;
  repeatGames: Set<number>;
  noTargetGames: Set<number>;
  repeatedExampleMatchId: number | null;
  noTargetExampleMatchId: number | null;
};

type SeasonCoverage = { seasonNumber: number; seasonName: string; matches: number; covered: number };

function namedTargetFromProtocol(rawLine: string) {
  const target = rawLine.split("|")[4]?.trim() ?? "";
  return /^p[12](?:[a-z])?:\s+/i.test(target);
}

function moveNameFromEvent(event: ExperimentalMatch["battleEvents"][number]) {
  if (event.moveName?.trim()) return event.moveName.trim();
  const parts = event.rawLine.split("|");
  return event.eventType === "move" ? parts[3]?.trim() ?? "" : "";
}

function normalizeProtocolName(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

function effectNameFromEvent(event: ExperimentalMatch["battleEvents"][number]) {
  return event.rawLine.split("|")[3]?.trim() ?? "";
}

function protocolHasSource(rawLine: string, expectedSource: string) {
  return rawLine.split("|").some((part) => {
    const match = part.trim().match(/^\[from\]\s*(.+)$/i);
    return match ? normalizeProtocolName(match[1]) === normalizeProtocolName(expectedSource) : false;
  });
}

function multiHitCountFromEvent(event: ExperimentalMatch["battleEvents"][number]) {
  const hitCount = Number(event.rawLine.split("|")[3]?.trim() ?? "");
  return Number.isInteger(hitCount) && hitCount > 1 ? hitCount : null;
}

function seasonNumberFromMatch(match: ExperimentalMatch) {
  if (typeof match.seasonNumber === "number") return match.seasonNumber;
  return Number(match.seasonName.match(/(?:season|s)\s*(\d+)/i)?.[1] ?? 0);
}

function teamForSide(match: ExperimentalMatch, side: Side) {
  if (match.p1IsCoach1 === null) return null;
  const sideIsCoach1 = side === "p1" ? match.p1IsCoach1 : !match.p1IsCoach1;
  return sideIsCoach1 ? match.coach1 : match.coach2;
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

export function MoveOutcomesReport({ matches, seasons, selectedSeasonId }: { matches: ExperimentalMatch[]; seasons: Array<{ id: number; name: string; seasonNumber: number }>; selectedSeasonId: number | "all" }) {
  const [showAllRows, setShowAllRows] = useState(false);
  const report = useMemo(() => {
    const actorStats = new Map<string, OutcomeRow>();
    const moveStats = new Map<string, MoveRow>();
    const coverage = new Map<number, SeasonCoverage>(seasons
      .filter((season) => season.seasonNumber >= 5 && (selectedSeasonId === "all" || season.id === selectedSeasonId))
      .map((season) => [season.seasonNumber, { seasonNumber: season.seasonNumber, seasonName: season.name, matches: 0, covered: 0 }]));
    const gamesWithRepeats = new Set<number>();
    const gamesWithFailures = new Set<number>();
    const gamesWithNoTarget = new Set<number>();
    let moveUses = 0;
    let repeatedUses = 0;
    let failedMoves = 0;
    let failedByFailCommand = 0;
    let failedByCantCommand = 0;
    let noTargetMoves = 0;
    const protocolOutcomes = {
      superEffectiveHits: 0,
      resistedHits: 0,
      immunities: 0,
      multiHitMoves: 0,
      multiHitCount: 0,
      protectSuccesses: 0,
      protectFailures: 0,
      substituteCreations: 0,
      substituteBreaks: 0,
      recoilActivations: 0,
      drainActivations: 0,
    };

    for (const match of matches) {
      const seasonNumber = seasonNumberFromMatch(match);
      if (seasonNumber >= 5) {
        const season = coverage.get(seasonNumber) ?? { seasonNumber, seasonName: match.seasonName, matches: 0, covered: 0 };
        season.matches += 1;
        coverage.set(seasonNumber, season);
      }

      const activeBySide = new Map<Side, { nickname: string; species: string | null }>();
      const previousMoveByActor = new Map<string, string>();
      const matchMoveEvents = match.battleEvents.filter((event) => event.eventType === "move");
      const hasOutcomeCoverage = matchMoveEvents.length > 0 && seasonNumber >= 5;
      if (hasOutcomeCoverage) coverage.get(seasonNumber)!.covered += 1;

      if (hasOutcomeCoverage) {
        const protectAttempts = new Set<string>();
        const resolvedProtectAttempts = new Set<string>();
        for (const event of match.battleEvents) {
          const side = event.player;
          const nickname = event.actorNickname?.trim() ?? "";
          const actorTurn = side && nickname ? `${event.turn}:${side}:${nickname.toLocaleLowerCase()}` : null;
          if (event.eventType === "move" && actorTurn && protectFamilyNames.has(normalizeProtocolName(moveNameFromEvent(event)))) {
            protectAttempts.add(actorTurn);
          }
          if (actorTurn && (event.eventType === "singleturn" || event.eventType === "singlemove") && protectFamilyNames.has(normalizeProtocolName(effectNameFromEvent(event))) && protectAttempts.has(actorTurn) && !resolvedProtectAttempts.has(actorTurn)) {
            protocolOutcomes.protectSuccesses += 1;
            resolvedProtectAttempts.add(actorTurn);
          }
          if (event.eventType === "fail" && actorTurn && protectAttempts.has(actorTurn) && !resolvedProtectAttempts.has(actorTurn)) {
            protocolOutcomes.protectFailures += 1;
            resolvedProtectAttempts.add(actorTurn);
          }
          if (event.eventType === "supereffective") protocolOutcomes.superEffectiveHits += 1;
          if (event.eventType === "resisted") protocolOutcomes.resistedHits += 1;
          if (event.eventType === "immune") protocolOutcomes.immunities += 1;
          if (event.eventType === "hitcount") {
            const hitCount = multiHitCountFromEvent(event);
            if (hitCount !== null) {
              protocolOutcomes.multiHitMoves += 1;
              protocolOutcomes.multiHitCount += hitCount;
            }
          }
          if (event.eventType === "startEffect" && normalizeProtocolName(effectNameFromEvent(event)) === "substitute") protocolOutcomes.substituteCreations += 1;
          if (event.eventType === "endEffect" && normalizeProtocolName(effectNameFromEvent(event)) === "substitute") protocolOutcomes.substituteBreaks += 1;
          if (event.eventType === "damage" && protocolHasSource(event.rawLine, "recoil")) protocolOutcomes.recoilActivations += 1;
          if (event.eventType === "heal" && protocolHasSource(event.rawLine, "drain")) protocolOutcomes.drainActivations += 1;
        }
      }

      const ensureActor = (side: Side, nickname: string, species: string | null) => {
        const team = teamForSide(match, side);
        const pokemonName = (species || nickname).trim() || "Unknown Pokémon";
        const teamKey = team ? `team-${team.seasonCoachId}` : `unmapped-match-${match.id}-${side}`;
        const key = `${teamKey}:${pokemonName.toLocaleLowerCase()}`;
        const row = actorStats.get(key) ?? {
          key,
          teamName: team?.teamName ?? `${side.toUpperCase()} side (team mapping unavailable)`,
          coachName: team?.coachName ?? "Unknown coach",
          pokemonName,
          games: new Set<number>(),
          repeatGames: new Set<number>(),
          failedGames: new Set<number>(),
          noTargetGames: new Set<number>(),
          moveUses: 0,
          repeatedUses: 0,
          failedMoves: 0,
          noTargetMoves: 0,
          exampleMatchId: match.id,
          repeatedExampleMatchId: null,
          failedExampleMatchId: null,
          noTargetExampleMatchId: null,
        };
        actorStats.set(key, row);
        return row;
      };

      for (const event of match.battleEvents) {
        const side = event.player;
        const nickname = event.actorNickname?.trim() ?? "";
        if ((event.eventType === "switch" || event.eventType === "drag") && side && nickname) {
          const previous = activeBySide.get(side);
          if (previous) previousMoveByActor.delete(`${side}:${previous.nickname}`);
          activeBySide.set(side, { nickname, species: event.pokemonName });
          continue;
        }
        if (event.eventType === "replace" && side && nickname) {
          const current = activeBySide.get(side);
          if (current?.nickname === nickname && event.pokemonName) current.species = event.pokemonName;
          continue;
        }
        if (event.eventType === "faint" && side && nickname) {
          previousMoveByActor.delete(`${side}:${nickname}`);
          if (activeBySide.get(side)?.nickname === nickname) activeBySide.delete(side);
          continue;
        }

        if (event.eventType === "move") {
          moveUses += 1;
          if (!side || !nickname) continue;
          const active = activeBySide.get(side);
          const species = active?.nickname === nickname ? active.species : event.pokemonName;
          const row = ensureActor(side, nickname, species);
          row.moveUses += 1;
          row.games.add(match.id);

          const name = moveNameFromEvent(event);
          if (!name) continue;
          const moveKey = name.toLocaleLowerCase();
          const moveRow = moveStats.get(moveKey) ?? { name, repeatedUses: 0, noTargetUses: 0, repeatGames: new Set<number>(), noTargetGames: new Set<number>(), repeatedExampleMatchId: null, noTargetExampleMatchId: null };
          const actorKey = `${side}:${nickname}`;
          const previous = previousMoveByActor.get(actorKey);
          if (previous?.toLocaleLowerCase() === moveKey) {
            repeatedUses += 1;
            row.repeatedUses += 1;
            row.repeatGames.add(match.id);
            gamesWithRepeats.add(match.id);
            moveRow.repeatedUses += 1;
            moveRow.repeatGames.add(match.id);
            moveRow.repeatedExampleMatchId ??= match.id;
            row.repeatedExampleMatchId ??= match.id;
            previousMoveByActor.set(actorKey, name);
          } else {
            previousMoveByActor.set(actorKey, name);
          }

          if (!namedTargetFromProtocol(event.rawLine)) {
            noTargetMoves += 1;
            row.noTargetMoves += 1;
            row.noTargetGames.add(match.id);
            gamesWithNoTarget.add(match.id);
            moveRow.noTargetUses += 1;
            moveRow.noTargetGames.add(match.id);
            moveRow.noTargetExampleMatchId ??= match.id;
            row.noTargetExampleMatchId ??= match.id;
          }
          moveStats.set(moveKey, moveRow);
          continue;
        }

        if ((event.eventType === "fail" || event.eventType === "cant") && side && nickname) {
          failedMoves += 1;
          if (event.eventType === "fail") failedByFailCommand += 1;
          else {
            failedByCantCommand += 1;
            previousMoveByActor.delete(`${side}:${nickname}`);
          }
          const active = activeBySide.get(side);
          const species = active?.nickname === nickname ? active.species : event.pokemonName;
          const row = ensureActor(side, nickname, species);
          row.failedMoves += 1;
          row.games.add(match.id);
          row.failedGames.add(match.id);
          row.failedExampleMatchId ??= match.id;
          gamesWithFailures.add(match.id);
        } else if (event.eventType === "cant") {
          failedMoves += 1;
          failedByCantCommand += 1;
          if (side && nickname) previousMoveByActor.delete(`${side}:${nickname}`);
        } else if (event.eventType === "fail") {
          failedMoves += 1;
          failedByFailCommand += 1;
        }
      }
    }

    const rows = [...actorStats.values()].map((row) => ({
      ...row,
      exampleMatchId: row.repeatedExampleMatchId ?? row.failedExampleMatchId ?? row.noTargetExampleMatchId ?? row.exampleMatchId,
      gamesPlayed: row.games.size,
      repeatGamesPlayed: row.repeatGames.size,
      failedGamesPlayed: row.failedGames.size,
      noTargetGamesPlayed: row.noTargetGames.size,
    })).sort((a, b) => (b.repeatedUses + b.failedMoves + b.noTargetMoves) - (a.repeatedUses + a.failedMoves + a.noTargetMoves) || b.moveUses - a.moveUses || a.pokemonName.localeCompare(b.pokemonName));

    const moveRows = [...moveStats.values()].map((row) => ({
      ...row,
      repeatGamesPlayed: row.repeatGames.size,
      noTargetGamesPlayed: row.noTargetGames.size,
    })).sort((a, b) => (b.repeatedUses + b.noTargetUses) - (a.repeatedUses + a.noTargetUses) || a.name.localeCompare(b.name));

    return {
      rows,
      moveRows,
      coverage: [...coverage.values()].sort((a, b) => a.seasonNumber - b.seasonNumber),
      moveCoveredMatches: [...coverage.values()].reduce((sum, season) => sum + season.covered, 0),
      totalMatchesFromSeasonFive: [...coverage.values()].reduce((sum, season) => sum + season.matches, 0),
      moveUses,
      repeatedUses,
      failedMoves,
      failedByFailCommand,
      failedByCantCommand,
      noTargetMoves,
      repeatedGames: gamesWithRepeats.size,
      failedGames: gamesWithFailures.size,
      noTargetGames: gamesWithNoTarget.size,
      protocolOutcomes,
    };
  }, [matches, seasons, selectedSeasonId]);

  const anyCoverage = report.moveCoveredMatches > 0;
  const visibleRows = showAllRows ? report.rows : report.rows.slice(0, 30);

  return <div className="space-y-5">
    <section className="poke-card p-5 md:p-6">
      <h2 className="font-pixel text-sm text-white">Move outcomes</h2>
      <p className="mt-2 max-w-4xl text-xs leading-5 text-[var(--foreground-muted)]">These counts use saved normalized Showdown protocol events. Repeated uses count each same-move use after the first by the same Pokémon, ignoring the opponent’s actions; switching out or a blocked turn resets the sequence. Failed moves count explicit fail and cant events; misses and type immunities stay separate. A move with no named Pokémon target may be self- or field-targeted. Shared entity filters select qualifying replays, and the report summarizes all saved move events in those replays.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Move event coverage" value={`${report.moveCoveredMatches}/${report.totalMatchesFromSeasonFive}`} detail={`matches with at least one saved move event · ${formatPercent(report.moveCoveredMatches, report.totalMatchesFromSeasonFive)} of filtered Season 5+ replays`} />
        <SummaryCard label="Repeated same-move uses" value={anyCoverage ? String(report.repeatedUses) : "—"} detail={`${report.repeatedGames} covered matches contain a repeat`} />
        <SummaryCard label="Failed move signals" value={anyCoverage ? String(report.failedMoves) : "—"} detail={`${report.failedByFailCommand} explicit fails · ${report.failedByCantCommand} blocked turns`} />
        <SummaryCard label="Moves without named target" value={anyCoverage ? String(report.noTargetMoves) : "—"} detail={`${report.noTargetGames} covered matches contain one`} />
      </div>
    </section>

    {!anyCoverage ? <section className="rounded-xl border border-amber-400/35 bg-amber-500/10 p-4 text-xs leading-5 text-amber-100/90" role="status">No normalized move events are saved for these filters. The report leaves metric values unknown instead of treating missing event rows as zero.</section> : null}

    <section className="poke-card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-pixel text-sm text-white">Coverage by season</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">A match counts as covered when its normalized protocol stream includes a move event. Added outcome counts use covered Season 5+ replays; missing streams stay unknown.</p></div><span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-wide text-cyan-200">Season 5 onward</span></div>
      {report.coverage.length ? <div className="mt-4 overflow-x-auto touch-pan-x"><table className="w-full min-w-[500px] text-left text-xs"><thead className="text-[9px] uppercase tracking-wide text-[var(--foreground-muted)]"><tr><th className="px-3 py-2">Season</th><th className="px-3 py-2">Covered replays</th><th className="px-3 py-2">Coverage</th></tr></thead><tbody>{report.coverage.map((season) => <tr key={season.seasonNumber} className="border-t border-[var(--border)]"><td className="px-3 py-2 font-bold text-white">{season.seasonName}</td><td className="px-3 py-2 font-mono text-[var(--foreground-muted)]">{season.covered} / {season.matches}</td><td className="px-3 py-2 font-mono text-cyan-200">{formatPercent(season.covered, season.matches)}</td></tr>)}</tbody></table></div> : <EmptyTable message="No Season 5+ replay matches match the current filters." />}
    </section>

    <section className="poke-card p-5 md:p-6">
      <h2 className="font-pixel text-sm text-white">Additional protocol outcomes</h2>
      <p className="mt-2 text-xs leading-5 text-[var(--foreground-muted)]">Counts include events logged in covered Season 5+ replays. Effectiveness totals use protocol result events; recoil and drain count each corresponding damage or healing event. Protect successes require a recorded protective effect, and failures require an explicit fail event paired with a Protect-family move.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        <SummaryCard label="Super-effective hits" value={anyCoverage ? report.protocolOutcomes.superEffectiveHits.toLocaleString() : "—"} detail="Saved effectiveness outcomes" />
        <SummaryCard label="Resisted hits" value={anyCoverage ? report.protocolOutcomes.resistedHits.toLocaleString() : "—"} detail="Saved resistance outcomes" />
        <SummaryCard label="Immunities" value={anyCoverage ? report.protocolOutcomes.immunities.toLocaleString() : "—"} detail="Saved immunity outcomes" />
        <SummaryCard label="Multi-hit move hits" value={anyCoverage ? report.protocolOutcomes.multiHitCount.toLocaleString() : "—"} detail={`${report.protocolOutcomes.multiHitMoves.toLocaleString()} logged outcomes with 2+ hits`} />
        <SummaryCard label="Protect-family successes" value={anyCoverage ? report.protocolOutcomes.protectSuccesses.toLocaleString() : "—"} detail="Move use followed by a logged protective effect" />
        <SummaryCard label="Protect-family failures" value={anyCoverage ? report.protocolOutcomes.protectFailures.toLocaleString() : "—"} detail="Explicit failed Protect-family move attempts" />
        <SummaryCard label="Substitute creations" value={anyCoverage ? report.protocolOutcomes.substituteCreations.toLocaleString() : "—"} detail="Logged Substitute starts" />
        <SummaryCard label="Substitute breaks" value={anyCoverage ? report.protocolOutcomes.substituteBreaks.toLocaleString() : "—"} detail="Logged Substitute ends" />
        <SummaryCard label="Recoil activations" value={anyCoverage ? report.protocolOutcomes.recoilActivations.toLocaleString() : "—"} detail="Damage events marked as recoil" />
        <SummaryCard label="Drain activations" value={anyCoverage ? report.protocolOutcomes.drainActivations.toLocaleString() : "—"} detail="Healing events marked as drain" />
      </div>
    </section>

    <section className="poke-card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-pixel text-sm text-white">Pokémon move outcomes</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Counts are grouped by season team and the Pokémon identified by its switch-in event.</p></div>{report.rows.length > 30 ? <button type="button" onClick={() => setShowAllRows((current) => !current)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-[10px] font-black uppercase text-cyan-200 hover:border-cyan-400/50">{showAllRows ? "Show top 30" : `Show all ${report.rows.length}`}</button> : null}</div>
      <div className="mt-4 overflow-x-auto touch-pan-x"><table className="w-full min-w-[980px] text-left text-xs"><thead className="text-[9px] uppercase tracking-wide text-[var(--foreground-muted)]"><tr><th className="px-3 py-2">Team</th><th className="px-3 py-2">Coach</th><th className="px-3 py-2">Pokémon</th><th className="px-3 py-2">Move uses</th><th className="px-3 py-2">Repeated uses</th><th className="px-3 py-2">Failed signals</th><th className="px-3 py-2">No named target</th><th className="px-3 py-2">Games</th><th className="px-3 py-2">Evidence</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.key} className="border-t border-[var(--border)]"><td className="px-3 py-2 font-bold text-white">{row.teamName}</td><td className="px-3 py-2 text-[var(--foreground-muted)]">{row.coachName}</td><td className="px-3 py-2 font-bold text-cyan-100">{row.pokemonName}</td><td className="px-3 py-2 font-mono text-[var(--foreground-muted)]">{row.moveUses.toLocaleString()}</td><td className="px-3 py-2 font-mono text-violet-200">{row.repeatedUses.toLocaleString()} <span className="text-[9px] text-[var(--foreground-subtle)]">({row.repeatGamesPlayed} games)</span></td><td className="px-3 py-2 font-mono text-amber-200">{row.failedMoves.toLocaleString()} <span className="text-[9px] text-[var(--foreground-subtle)]">({row.failedGamesPlayed} games)</span></td><td className="px-3 py-2 font-mono text-sky-200">{row.noTargetMoves.toLocaleString()} <span className="text-[9px] text-[var(--foreground-subtle)]">({row.noTargetGamesPlayed} games)</span></td><td className="px-3 py-2 font-mono text-[var(--foreground-muted)]">{row.gamesPlayed}</td><td className="px-3 py-2"><Link href={`/matches/${row.exampleMatchId}`} className="text-cyan-300 underline underline-offset-2">Match #{row.exampleMatchId}</Link></td></tr>)}</tbody></table>{!report.rows.length ? <EmptyTable message={anyCoverage ? "No actor-attributed move records are available in this scope." : "No move outcome rows are available."} /> : null}</div>
    </section>

    <section className="poke-card p-5 md:p-6">
      <h2 className="font-pixel text-sm text-white">Move-level highlights</h2>
      <p className="mt-1 text-xs text-[var(--foreground-muted)]">Repeated uses count consecutive same-move choices by a Pokémon; targetless uses are move lines without a named Pokémon or side target.</p>
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <div><h3 className="text-xs font-black uppercase tracking-wide text-violet-200">Most repeated moves</h3><div className="mt-2 overflow-x-auto touch-pan-x"><table className="w-full min-w-[360px] text-left text-xs"><thead className="text-[9px] uppercase text-[var(--foreground-muted)]"><tr><th className="px-2 py-2">Move</th><th className="px-2 py-2">Repeats</th><th className="px-2 py-2">Games</th><th className="px-2 py-2">Evidence</th></tr></thead><tbody>{report.moveRows.filter((row) => row.repeatedUses > 0).sort((a, b) => b.repeatedUses - a.repeatedUses).slice(0, 10).map((row) => <tr key={`repeat-${row.name}`} className="border-t border-[var(--border)]"><td className="px-2 py-2 font-bold text-white">{row.name}</td><td className="px-2 py-2 font-mono text-violet-200">{row.repeatedUses}</td><td className="px-2 py-2 font-mono text-[var(--foreground-muted)]">{row.repeatGamesPlayed}</td><td className="px-2 py-2">{row.repeatedExampleMatchId ? <Link href={`/matches/${row.repeatedExampleMatchId}`} className="text-cyan-300 underline">Match #{row.repeatedExampleMatchId}</Link> : "—"}</td></tr>)}</tbody></table>{!report.moveRows.some((row) => row.repeatedUses > 0) ? <EmptyTable message="No repeated move uses are recorded in this scope." /> : null}</div></div>
        <div><h3 className="text-xs font-black uppercase tracking-wide text-sky-200">Moves without a named target</h3><div className="mt-2 overflow-x-auto touch-pan-x"><table className="w-full min-w-[360px] text-left text-xs"><thead className="text-[9px] uppercase text-[var(--foreground-muted)]"><tr><th className="px-2 py-2">Move</th><th className="px-2 py-2">Uses</th><th className="px-2 py-2">Games</th><th className="px-2 py-2">Evidence</th></tr></thead><tbody>{report.moveRows.filter((row) => row.noTargetUses > 0).sort((a, b) => b.noTargetUses - a.noTargetUses).slice(0, 10).map((row) => <tr key={`target-${row.name}`} className="border-t border-[var(--border)]"><td className="px-2 py-2 font-bold text-white">{row.name}</td><td className="px-2 py-2 font-mono text-sky-200">{row.noTargetUses}</td><td className="px-2 py-2 font-mono text-[var(--foreground-muted)]">{row.noTargetGamesPlayed}</td><td className="px-2 py-2">{row.noTargetExampleMatchId ? <Link href={`/matches/${row.noTargetExampleMatchId}`} className="text-cyan-300 underline">Match #{row.noTargetExampleMatchId}</Link> : "—"}</td></tr>)}</tbody></table>{!report.moveRows.some((row) => row.noTargetUses > 0) ? <EmptyTable message="No move lines without a named target are recorded in this scope." /> : null}</div></div>
      </div>
    </section>
  </div>;
}
