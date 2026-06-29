"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

export type PokemonBoardRow = {
  pokemonId: number;
  name: string;
  spriteUrl: string | null;
  types: string[];
  cost: number | null;
  divisionName: string;
  seasonCoachId: number;
  teamName: string;
  score: number;
  recentScore: number;
  previousScore: number;
  games: number;
  kills: number;
  deaths: number;
  wins: number;
  losses: number;
  damage: number;
  indirectDamage: number;
};

type SortKey = "pokemon" | "cost" | "recent" | "total" | "trend" | "ppg" | "kd" | "wl";
type SortDirection = "asc" | "desc";

function formatScore(value: number) {
  return value.toFixed(1);
}

function typeBadgeClass(type: string) {
  return `type-badge type-${type.toLowerCase()}`;
}

function trendScore(row: PokemonBoardRow) {
  return row.recentScore - row.previousScore;
}

function pointsPerGame(row: PokemonBoardRow) {
  return row.games ? row.score / row.games : Number.NEGATIVE_INFINITY;
}

function killDeathDiff(row: PokemonBoardRow) {
  return row.kills - row.deaths;
}

function winLossDiff(row: PokemonBoardRow) {
  return row.wins - row.losses;
}

function sortValue(row: PokemonBoardRow, sortKey: SortKey) {
  switch (sortKey) {
    case "pokemon":
      return row.name;
    case "cost":
      return row.cost ?? Number.NEGATIVE_INFINITY;
    case "recent":
      return row.recentScore;
    case "total":
      return row.score;
    case "trend":
      return trendScore(row);
    case "ppg":
      return pointsPerGame(row);
    case "kd":
      return killDeathDiff(row);
    case "wl":
      return winLossDiff(row);
  }
}

function PokemonAvatar({ row, size = 40 }: { row: PokemonBoardRow; size?: number }) {
  return row.spriteUrl ? (
    <Image
      src={row.spriteUrl}
      alt=""
      width={size}
      height={size}
      className="object-contain"
    />
  ) : (
    <div
      className="rounded-full bg-[var(--background-tertiary)]"
      style={{ width: size, height: size }}
    />
  );
}

export function PokemonBoardClient({
  divisionNames,
  rows,
}: {
  divisionNames: string[];
  rows: PokemonBoardRow[];
}) {
  const [selectedDivision, setSelectedDivision] = useState("");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  function toggleSort(nextSortKey: SortKey) {
    if (nextSortKey === sortKey) {
      setSortDirection((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection(nextSortKey === "pokemon" ? "asc" : "desc");
  }

  const filteredRows = useMemo(
    () => {
      const normalizedQuery = query.trim().toLowerCase();
      return rows
        .filter((row) =>
          selectedDivision
            ? row.divisionName.toLowerCase() === selectedDivision.toLowerCase()
            : true
        )
        .filter((row) => {
          if (!normalizedQuery) return true;
          return (
            row.name.toLowerCase().includes(normalizedQuery) ||
            row.teamName.toLowerCase().includes(normalizedQuery) ||
            row.divisionName.toLowerCase().includes(normalizedQuery) ||
            row.types.some((type) => type.toLowerCase().includes(normalizedQuery))
          );
        })
        .slice()
        .sort((a, b) => {
          const aValue = sortValue(a, sortKey);
          const bValue = sortValue(b, sortKey);
          const direction = sortDirection === "asc" ? 1 : -1;

          if (typeof aValue === "string" && typeof bValue === "string") {
            const compare = aValue.localeCompare(bValue);
            if (compare !== 0) return compare * direction;
          } else if (aValue !== bValue) {
            return ((aValue as number) - (bValue as number)) * direction;
          }

          const nameCompare = a.name.localeCompare(b.name);
          if (nameCompare !== 0) return nameCompare;
          return a.teamName.localeCompare(b.teamName);
        })
        .slice(0, 80);
    },
    [query, rows, selectedDivision, sortDirection, sortKey]
  );

  function renderSortHeader(label: string, value: SortKey) {
    const isActive = sortKey === value;
    return (
      <button
        type="button"
        onClick={() => toggleSort(value)}
        className="inline-flex items-center gap-1 text-left font-bold uppercase transition-colors hover:text-white"
      >
        <span>{label}</span>
        <span className={`text-[9px] ${isActive ? "text-[var(--accent)]" : "text-[var(--foreground-subtle)]"}`}>
          {isActive ? sortDirection.toUpperCase() : "SORT"}
        </span>
      </button>
    );
  }

  const stickyHeaderClass = "sticky top-0 z-10 bg-[var(--background-secondary)] shadow-[0_1px_0_var(--card-border)]";

  return (
    <>
      <div className="mx-4 mt-3 flex flex-col gap-2 sm:mx-5">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Pokemon, team, division, or type..."
          className="w-full rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--primary)]"
        />
        <div className="flex flex-wrap gap-1 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/50 p-1">
          <button
            type="button"
            onClick={() => setSelectedDivision("")}
            className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase transition-colors ${
              !selectedDivision
                ? "bg-[var(--primary)] text-white"
                : "text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-white"
            }`}
          >
            All
          </button>
          {divisionNames.map((divisionName) => (
            <button
              key={divisionName}
              type="button"
              onClick={() => setSelectedDivision(divisionName)}
              className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase transition-colors ${
                selectedDivision.toLowerCase() === divisionName.toLowerCase()
                  ? "bg-[var(--primary)] text-white"
                  : "text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-white"
              }`}
            >
              {divisionName}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto scrollbar-thin px-4 pb-4 sm:px-5 sm:pb-5">
        <table className="premium-table min-w-[900px]">
          <thead>
            <tr>
              <th className={stickyHeaderClass}>{renderSortHeader("Pokemon", "pokemon")}</th>
              <th className={stickyHeaderClass}>{renderSortHeader("Cost", "cost")}</th>
              <th className={stickyHeaderClass}>{renderSortHeader("Recent", "recent")}</th>
              <th className={stickyHeaderClass}>{renderSortHeader("Total", "total")}</th>
              <th className={stickyHeaderClass}>{renderSortHeader("Trend", "trend")}</th>
              <th className={stickyHeaderClass}>{renderSortHeader("PPG", "ppg")}</th>
              <th className={stickyHeaderClass}>{renderSortHeader("K/D", "kd")}</th>
              <th className={stickyHeaderClass}>{renderSortHeader("W/L", "wl")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => {
              const trend = row.recentScore - row.previousScore;
              return (
                <tr key={`${row.pokemonId}-${row.seasonCoachId}`}>
                  <td>
                    <Link href={`/pokemon/${row.pokemonId}`} className="flex items-center gap-3">
                      <PokemonAvatar row={row} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-white">{row.name}</div>
                        <div className="truncate text-xs font-bold text-[var(--foreground-muted)]">
                          {row.teamName}
                        </div>
                        <div className="mt-1 flex gap-1">
                          {row.types.slice(0, 2).map((type) => (
                            <span key={type} className={typeBadgeClass(type)}>
                              {type}
                            </span>
                          ))}
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td className="font-mono font-bold text-[var(--accent)]">
                    {row.cost ?? "--"}
                  </td>
                  <td className="font-mono text-white">{formatScore(row.recentScore)}</td>
                  <td className="font-mono font-bold text-white">{formatScore(row.score)}</td>
                  <td className={`font-mono font-bold ${trend >= 0 ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
                    {trend >= 0 ? "+" : ""}
                    {formatScore(trend)}
                  </td>
                  <td className="font-mono text-white">
                    {row.games ? formatScore(row.score / row.games) : "--"}
                  </td>
                  <td className="font-mono text-white">
                    {row.kills}/{row.deaths}
                  </td>
                  <td className="font-mono text-white">
                    {row.wins}/{row.losses}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
