"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { EloChart } from "@/components/elo-chart";
import { Select } from "@/components/ui/input";
import type { CoachEloData } from "./page";

interface EloTrackerClientProps {
  allCoaches: CoachEloData[];
  initialCoachId: number | undefined;
}

function getWeekLabel(week: number | null): string {
  if (week === null) return "";
  if (week === 101) return "QF";
  if (week === 102) return "SF";
  if (week === 103) return "F";
  return `W${week}`;
}

export function EloTrackerClient({
  allCoaches,
  initialCoachId,
}: EloTrackerClientProps) {
  const router = useRouter();
  const [selectedCoachId, setSelectedCoachId] = useState<number | undefined>(
    initialCoachId
  );

  const selectedCoach = useMemo(
    () => allCoaches.find((c) => c.id === selectedCoachId),
    [allCoaches, selectedCoachId]
  );

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!selectedCoach) return [];

    return selectedCoach.history.map((h, i) => ({
      label: h.seasonNumber && h.week
        ? `S${h.seasonNumber} ${getWeekLabel(h.week)}`
        : h.matchId === null
          ? "Placement"
          : `Match ${i + 1}`,
      elo: h.elo,
      matchId: h.matchId || undefined,
      opponent: h.opponentName || undefined,
      result: h.result || undefined,
      date: h.date,
    }));
  }, [selectedCoach]);

  function handleCoachChange(coachId: number) {
    setSelectedCoachId(coachId);
    router.push(`/elo-tracker?coach=${coachId}`, { scroll: false });
  }

  if (allCoaches.length === 0) {
    return (
      <div className="poke-card p-8 text-center">
        <p className="text-[var(--foreground-muted)]">
          No ELO history data available. Run an ELO recalculation first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="poke-card p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="font-pixel text-xl md:text-2xl text-white">
              ELO Tracker
            </h1>
            <p className="text-sm text-[var(--foreground-muted)]">
              Track coach ELO progression over time
            </p>
          </div>

          {/* Coach Selector */}
          <div className="w-full md:w-64">
            <Select
              value={selectedCoachId?.toString() || ""}
              onChange={(e) => handleCoachChange(parseInt(e.target.value))}
              className="w-full"
            >
              {allCoaches.map((coach) => (
                <option key={coach.id} value={coach.id}>
                  #{coach.currentRank} {coach.name} ({coach.currentElo})
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {selectedCoach && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-4">
            {/* Current ELO */}
            <div className="poke-card p-4 text-center">
              <p className="text-xs text-[var(--foreground-muted)] uppercase font-bold mb-1">
                Current ELO
              </p>
              <p className="text-2xl font-bold text-[var(--accent)]">
                {selectedCoach.currentElo}
              </p>
            </div>

            {/* Current Rank */}
            <div className="poke-card p-4 text-center">
              <p className="text-xs text-[var(--foreground-muted)] uppercase font-bold mb-1">
                Current Rank
              </p>
              <p className="text-2xl font-bold text-white">
                #{selectedCoach.currentRank}
              </p>
            </div>

            {/* Peak ELO */}
            <div className="poke-card p-4 text-center">
              <p className="text-xs text-[var(--foreground-muted)] uppercase font-bold mb-1">
                Peak ELO
              </p>
              <p className="text-2xl font-bold text-[var(--success)]">
                {selectedCoach.peakElo}
              </p>
              {selectedCoach.peakElo > selectedCoach.currentElo && (
                <p className="text-xs text-[var(--foreground-muted)]">
                  ({selectedCoach.currentElo - selectedCoach.peakElo} from peak)
                </p>
              )}
            </div>
          </div>

          {/* ELO Chart */}
          <div className="poke-card p-6">
            <h2 className="text-lg font-bold text-white mb-4">
              ELO Progression
            </h2>
            <EloChart
              data={chartData}
              height={350}
              peakElo={selectedCoach.peakElo}
              showPeakLine={selectedCoach.peakElo > selectedCoach.currentElo}
            />
          </div>

          {/* Match History */}
          <div className="poke-card p-0 overflow-hidden">
            <div className="p-3 sm:p-4 border-b-2 border-[var(--background-tertiary)]">
              <h2 className="text-base sm:text-lg font-bold text-white">Match History</h2>
              <p className="text-[10px] sm:text-xs text-[var(--foreground-muted)]">
                {selectedCoach.history.length} matches played
              </p>
            </div>

            {/* Mobile: Card layout */}
            <div className="sm:hidden divide-y divide-[var(--background-tertiary)]">
              {[...selectedCoach.history].reverse().map((h, i, arr) => {
                const prevMatch = arr[i + 1];
                const change = prevMatch ? h.elo - prevMatch.elo : null;

                return (
                  <div key={h.id} className="p-3 hover:bg-[var(--background-secondary)]/50">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="min-w-0">
                        {h.matchId ? (
                          <Link
                            href={`/matches/${h.matchId}`}
                            className="text-[var(--primary)] hover:underline text-sm font-medium"
                          >
                            {h.seasonNumber && h.week
                              ? `S${h.seasonNumber} ${h.divisionName} ${getWeekLabel(h.week)}`
                              : `Match #${h.matchId}`}
                          </Link>
                        ) : (
                          <span className="text-[var(--accent)] font-bold text-xs uppercase">
                            Placement
                          </span>
                        )}
                        <p className="text-xs text-[var(--foreground-muted)] truncate">
                          {h.opponentName ? (
                            <>vs {h.opponentName}</>
                          ) : h.placementReason ? (
                            <span className="text-[var(--accent)]">{h.placementReason}</span>
                          ) : null}
                        </p>
                      </div>
                      {h.result && (
                        <span
                          className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            h.result === "W"
                              ? "bg-[var(--success)]/20 text-[var(--success)]"
                              : "bg-[var(--error)]/20 text-[var(--error)]"
                          }`}
                        >
                          {h.result === "W" ? "W" : "L"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-mono font-bold text-[var(--accent)]">
                        {h.elo}
                      </span>
                      {change !== null && (
                        <span
                          className={`font-mono font-bold ${
                            change >= 0
                              ? "text-[var(--success)]"
                              : "text-[var(--error)]"
                          }`}
                        >
                          {change >= 0 ? "+" : ""}{change}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: Table layout */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--background-secondary)] text-[var(--foreground-muted)] text-xs uppercase">
                    <th className="px-4 py-3 text-left">Match</th>
                    <th className="px-4 py-3 text-left">Opponent</th>
                    <th className="px-4 py-3 text-center">Result</th>
                    <th className="px-4 py-3 text-right">ELO</th>
                    <th className="px-4 py-3 text-right">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {[...selectedCoach.history].reverse().map((h, i, arr) => {
                    const prevMatch = arr[i + 1];
                    const change = prevMatch ? h.elo - prevMatch.elo : null;

                    return (
                      <tr
                        key={h.id}
                        className="border-t border-[var(--background-tertiary)] hover:bg-[var(--background-secondary)]/50"
                      >
                        <td className="px-4 py-3">
                          {h.matchId ? (
                            <Link
                              href={`/matches/${h.matchId}`}
                              className="text-[var(--primary)] hover:underline"
                            >
                              {h.seasonNumber && h.week
                                ? `S${h.seasonNumber} ${h.divisionName} ${getWeekLabel(h.week)}`
                                : `Match #${h.matchId}`}
                            </Link>
                          ) : (
                            <span className="text-[var(--accent)] font-bold text-xs uppercase">
                              Placement
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {h.opponentName ? (
                            h.opponentName
                          ) : h.placementReason ? (
                            <span className="text-[var(--accent)]">
                              {h.placementReason}
                            </span>
                          ) : (
                            <span className="text-[var(--foreground-muted)]">
                              -
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {h.result ? (
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                                h.result === "W"
                                  ? "bg-[var(--success)]/20 text-[var(--success)]"
                                  : "bg-[var(--error)]/20 text-[var(--error)]"
                              }`}
                            >
                              {h.result === "W" ? "Win" : "Loss"}
                            </span>
                          ) : (
                            <span className="text-[var(--foreground-muted)]">
                              -
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-[var(--accent)]">
                          {h.elo}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {change !== null ? (
                            <span
                              className={`font-bold ${
                                change >= 0
                                  ? "text-[var(--success)]"
                                  : "text-[var(--error)]"
                              }`}
                            >
                              {change >= 0 ? "+" : ""}
                              {change}
                            </span>
                          ) : (
                            <span className="text-[var(--foreground-muted)]">
                              -
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Link to Coach Profile */}
          <div className="text-center">
            <Link
              href={`/coaches/${selectedCoach.id}`}
              className="inline-flex items-center gap-2 text-sm text-[var(--primary)] hover:underline"
            >
              View {selectedCoach.name}&apos;s full profile
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
