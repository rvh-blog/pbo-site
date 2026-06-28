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

function formatScore(value: number) {
  return value.toFixed(1);
}

function typeBadgeClass(type: string) {
  return `type-badge type-${type.toLowerCase()}`;
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
  const filteredRows = useMemo(
    () =>
      rows
        .filter((row) =>
          selectedDivision
            ? row.divisionName.toLowerCase() === selectedDivision.toLowerCase()
            : true
        )
        .slice(0, 80),
    [rows, selectedDivision]
  );

  return (
    <>
      <div className="mx-4 mt-3 flex flex-wrap gap-1 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/50 p-1 sm:mx-5">
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
      <div className="min-h-0 flex-1 overflow-auto scrollbar-thin px-4 pb-4 sm:px-5 sm:pb-5">
        <table className="premium-table min-w-[900px]">
          <thead>
            <tr>
              <th>Pokemon</th>
              <th>Cost</th>
              <th>Recent</th>
              <th>Total</th>
              <th>Trend</th>
              <th>PPG</th>
              <th>K/D</th>
              <th>W/L</th>
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
