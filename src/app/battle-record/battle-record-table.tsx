"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

export interface BattleRecordRow {
  coachId: number;
  coachName: string;
  logoUrl: string | null;
  games: number;
  averageDifferential: number;
  averageWinDifference: number | null;
  averageLossDifference: number | null;
  winningPercentage: number;
  last15Wins: number;
  last15Losses: number;
  last15WinPercentage: number | null;
  closeGameWins: number;
  closeGameLosses: number;
  closeGameWinPercentage: number | null;
  bigWins: number;
  bigWinPercentage: number;
}

type SortKey = keyof Pick<
  BattleRecordRow,
  | "coachName"
  | "games"
  | "averageDifferential"
  | "averageWinDifference"
  | "averageLossDifference"
  | "winningPercentage"
  | "last15WinPercentage"
  | "closeGameWinPercentage"
  | "bigWinPercentage"
>;

type SortDirection = "asc" | "desc";

const columns: Array<{ key: SortKey; label: string; className?: string; title?: string }> = [
  { key: "coachName", label: "Coach", className: "sm:px-6" },
  { key: "games", label: "Games" },
  { key: "averageDifferential", label: "Avg Diff" },
  { key: "averageWinDifference", label: "Avg Win Diff" },
  { key: "averageLossDifference", label: "Avg Loss Diff" },
  { key: "winningPercentage", label: "Win %" },
  { key: "last15WinPercentage", label: "Last 15" },
  {
    key: "closeGameWinPercentage",
    label: "Close Game Win %",
    title: "Win percentage in close games only. Close games are matches decided by a 1-0 or 2-0 scoreline.",
  },
  {
    key: "bigWinPercentage",
    label: "Big Win %",
    title: "Percentage of all games that were big wins. Big wins are 5-0 or 6-0 wins.",
  },
];

function formatSignedDecimal(value: number | null) {
  if (value === null) return "--";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}`;
}

function formatPercentage(value: number | null) {
  if (value === null) return "--";
  return `${Math.round(value * 10) / 10}%`;
}

function formatCloseGameRecord(coach: BattleRecordRow) {
  if (coach.closeGameWinPercentage === null) return "--";
  return `${formatPercentage(coach.closeGameWinPercentage)} (${coach.closeGameWins}W/${coach.closeGameLosses}L)`;
}

function formatBigWinRecord(coach: BattleRecordRow) {
  return `${formatPercentage(coach.bigWinPercentage)} (${coach.bigWins})`;
}

function formatLast15Record(coach: BattleRecordRow) {
  if (coach.last15WinPercentage === null) return "--";
  return `${formatPercentage(coach.last15WinPercentage)} (${coach.last15Wins}W/${coach.last15Losses}L)`;
}

function compareValues(a: BattleRecordRow, b: BattleRecordRow, sortKey: SortKey) {
  const aValue = a[sortKey];
  const bValue = b[sortKey];

  if (typeof aValue === "string" && typeof bValue === "string") {
    return aValue.localeCompare(bValue);
  }

  if (aValue === null && bValue === null) return 0;
  if (aValue === null) return -1;
  if (bValue === null) return 1;

  return Number(aValue) - Number(bValue);
}

function SortIndicator({ active, direction }: { active: boolean; direction: SortDirection }) {
  return (
    <span className={`ml-1 text-[9px] ${active ? "text-white" : "text-[var(--foreground-subtle)]"}`}>
      {active ? (direction === "asc" ? "▲" : "▼") : "↕"}
    </span>
  );
}

export function BattleRecordTable({ records }: { records: BattleRecordRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("games");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [minimumGames, setMinimumGames] = useState(0);

  const sortedRecords = useMemo(() => {
    return records.filter((record) => record.games >= minimumGames).sort((a, b) => {
      const base = compareValues(a, b, sortKey);
      const sorted = sortDirection === "asc" ? base : -base;

      return (
        sorted ||
        b.games - a.games ||
        b.averageDifferential - a.averageDifferential ||
        a.coachName.localeCompare(b.coachName)
      );
    });
  }, [minimumGames, records, sortDirection, sortKey]);

  function handleSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "coachName" ? "asc" : "desc");
  }

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-[var(--background-tertiary)] bg-[var(--background-secondary)]/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <label className="flex flex-wrap items-center gap-3 text-xs font-bold uppercase tracking-widest text-[var(--foreground-muted)]">
          Minimum Games
          <input
            type="number"
            min="0"
            step="1"
            value={minimumGames}
            onChange={(event) => setMinimumGames(Math.max(0, Number.parseInt(event.target.value, 10) || 0))}
            className="w-24 rounded border border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-center font-mono text-sm text-white outline-none transition-colors focus:border-white/40"
          />
        </label>
        <p className="text-xs font-bold uppercase tracking-widest text-[var(--foreground-subtle)]">
          Showing {sortedRecords.length} of {records.length}
        </p>
      </div>

      <div className="grid gap-3 p-3 sm:hidden">
        {sortedRecords.map((coach, index) => (
          <div
            key={coach.coachId}
            className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/55 p-3"
          >
            <div className="mb-3 flex min-w-0 items-center gap-3">
              <div className="w-7 shrink-0 text-center font-mono text-sm font-bold text-[var(--foreground-subtle)]">
                {index + 1}
              </div>
              {coach.logoUrl ? (
                <Image src={coach.logoUrl} alt="" width={36} height={36} className="h-9 w-9 shrink-0 object-contain" />
              ) : (
                <Image src="/images/pbo-logo.png" alt="" width={36} height={36} className="h-9 w-9 shrink-0 object-contain" />
              )}
              <Link href={`/coaches/${coach.coachId}`} className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-white">{coach.coachName}</div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--foreground-subtle)]">
                  {coach.games} {coach.games === 1 ? "game" : "games"}
                </div>
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded bg-[var(--background-secondary)] px-2 py-2">
                <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Win %</div>
                <div className="font-mono text-sm font-bold text-white">{formatPercentage(coach.winningPercentage)}</div>
              </div>
              <div className="rounded bg-[var(--background-secondary)] px-2 py-2">
                <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Avg Diff</div>
                <div className="font-mono text-sm font-bold text-white">{formatSignedDecimal(coach.averageDifferential)}</div>
              </div>
              <div className="rounded bg-[var(--background-secondary)] px-2 py-2">
                <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Last 15</div>
                <div className="font-mono text-xs text-white">{formatLast15Record(coach)}</div>
              </div>
              <div className="rounded bg-[var(--background-secondary)] px-2 py-2">
                <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Close</div>
                <div className="font-mono text-xs text-[var(--foreground-muted)]">{formatCloseGameRecord(coach)}</div>
              </div>
              <div className="rounded bg-[var(--background-secondary)] px-2 py-2">
                <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Avg Win</div>
                <div className="font-mono text-xs text-[var(--success)]">{formatSignedDecimal(coach.averageWinDifference)}</div>
              </div>
              <div className="rounded bg-[var(--background-secondary)] px-2 py-2">
                <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Avg Loss</div>
                <div className="font-mono text-xs text-[var(--error)]">{formatSignedDecimal(coach.averageLossDifference)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[1180px] border-collapse text-center">
          <thead>
            <tr className="border-b border-[var(--background-tertiary)] bg-[var(--background-secondary)] text-[10px] font-bold uppercase tracking-widest text-[var(--foreground-subtle)]">
              <th className="px-4 py-3 text-center">#</th>
              {columns.map((column) => {
                const active = column.key === sortKey;

                return (
                  <th key={column.key} className={`px-4 py-3 text-center ${column.className ?? ""}`}>
                    <button
                      type="button"
                      onClick={() => handleSort(column.key)}
                      title={column.title}
                      className="inline-flex items-center justify-center gap-1 text-center transition-colors hover:text-white"
                    >
                      {column.label}
                      <SortIndicator active={active} direction={sortDirection} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRecords.map((coach, index) => (
              <tr
                key={coach.coachId}
                className="border-b border-[var(--background-tertiary)]/70 transition-colors hover:bg-[var(--background-tertiary)]/30"
              >
                <td className="px-4 py-3 text-center font-mono text-sm font-bold text-[var(--foreground-subtle)]">{index + 1}</td>
                <td className="px-4 py-3 text-center sm:px-6">
                  <Link href={`/coaches/${coach.coachId}`} className="inline-flex min-w-0 items-center justify-center gap-3 hover:text-[var(--primary)]">
                    {coach.logoUrl ? (
                      <Image src={coach.logoUrl} alt="" width={36} height={36} className="h-9 w-9 shrink-0 object-contain" />
                    ) : (
                      <Image src="/images/pbo-logo.png" alt="" width={36} height={36} className="h-9 w-9 shrink-0 object-contain" />
                    )}
                    <span className="font-bold text-white">{coach.coachName}</span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-center font-mono text-sm text-[var(--foreground-muted)]">{coach.games}</td>
                <td className="px-4 py-3 text-center font-mono text-sm font-bold text-white">{formatSignedDecimal(coach.averageDifferential)}</td>
                <td className="px-4 py-3 text-center font-mono text-sm text-[var(--success)]">{formatSignedDecimal(coach.averageWinDifference)}</td>
                <td className="px-4 py-3 text-center font-mono text-sm text-[var(--error)]">{formatSignedDecimal(coach.averageLossDifference)}</td>
                <td className="px-4 py-3 text-center font-mono text-sm font-bold text-white">{formatPercentage(coach.winningPercentage)}</td>
                <td className="px-4 py-3 text-center font-mono text-sm text-white">{formatLast15Record(coach)}</td>
                <td className="px-4 py-3 text-center font-mono text-sm text-[var(--foreground-muted)]">{formatCloseGameRecord(coach)}</td>
                <td className="px-4 py-3 text-center font-mono text-sm text-[var(--accent)]">{formatBigWinRecord(coach)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
