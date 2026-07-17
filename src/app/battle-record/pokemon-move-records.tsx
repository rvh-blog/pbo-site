"use client";

import Image from "next/image";
import { useState } from "react";
import { compareDivisionNames } from "@/lib/division-order";

export type PokemonMoveRecord = {
  pokemonId: number;
  pokemonName: string;
  spriteUrl: string | null;
  games: number;
  totalUses: number;
  moves: Array<{
    name: string;
    uses: number;
  }>;
};

export type PokemonMoveDivision = {
  divisionId: number;
  seasonNumber: number;
  divisionName: string;
  records: PokemonMoveRecord[];
};

export function PokemonMoveRecords({
  records,
  divisions,
}: {
  records: PokemonMoveRecord[];
  divisions: PokemonMoveDivision[];
}) {
  const [selectedDivisionId, setSelectedDivisionId] = useState("all");
  const [showOverallMoves, setShowOverallMoves] = useState(true);
  const activeRecords = selectedDivisionId === "all"
    ? records
    : divisions.find((division) => String(division.divisionId) === selectedDivisionId)?.records || [];
  const divisionsBySeason = divisions.reduce((groups, division) => {
    const seasonDivisions = groups.get(division.seasonNumber) || [];
    seasonDivisions.push(division);
    groups.set(division.seasonNumber, seasonDivisions);
    return groups;
  }, new Map<number, PokemonMoveDivision[]>());
  const moveTotals = new Map<string, { name: string; uses: number }>();
  for (const record of activeRecords) {
    for (const move of record.moves) {
      const key = move.name.toLowerCase();
      const total = moveTotals.get(key) ?? { name: move.name, uses: 0 };
      total.uses += move.uses;
      moveTotals.set(key, total);
    }
  }

  const overallMoves = [...moveTotals.values()].sort(
    (a, b) => b.uses - a.uses || a.name.localeCompare(b.name)
  );

  return (
    <div>
      <div className="border-b-2 border-[var(--background-tertiary)] px-4 py-3 text-center text-xs text-[var(--foreground-muted)] sm:px-6">
        Actual move commands from completed, non-forfeit matches played in Season 9 and onward.
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b-2 border-[var(--background-tertiary)] px-4 py-3 sm:px-6">
        <label htmlFor="move-usage-division" className="text-xs font-bold uppercase tracking-wider text-[var(--foreground-muted)]">
          Division
        </label>
        <select
          id="move-usage-division"
          value={selectedDivisionId}
          onChange={(event) => setSelectedDivisionId(event.target.value)}
          className="rounded border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 py-2 text-xs font-bold text-white outline-none focus:border-[var(--accent)]"
        >
          <option value="all">All Divisions</option>
          {[...divisionsBySeason.entries()].sort(([a], [b]) => b - a).map(([seasonNumber, seasonDivisions]) => (
            <optgroup key={seasonNumber} label={`Season ${seasonNumber}`}>
              {seasonDivisions
                .sort((a, b) => compareDivisionNames(a.divisionName, b.divisionName))
                .map((division) => (
                  <option key={division.divisionId} value={division.divisionId}>
                    {division.divisionName}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>

      {activeRecords.length > 0 ? (
        <>
          <div className="border-b-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)]/45 px-4 py-4 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--foreground-muted)]">
                Overall Move Uses
              </h3>
              <button
                type="button"
                aria-expanded={showOverallMoves}
                onClick={() => setShowOverallMoves((visible) => !visible)}
                className="min-w-20 rounded border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[var(--primary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--primary-light)]"
              >
                {showOverallMoves ? "Hide" : "Show"}
              </button>
            </div>
            {showOverallMoves && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {overallMoves.map((move) => (
                  <span
                    key={move.name}
                    className="rounded border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2.5 py-1.5 text-xs text-white"
                  >
                    {move.name} <span className="font-mono font-bold text-[var(--accent)]">{move.uses}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="divide-y-2 divide-[var(--background-tertiary)]">
            {activeRecords.map((record) => (
              <div key={record.pokemonId} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(180px,0.8fr)_90px_minmax(0,2fr)] sm:items-center sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                {record.spriteUrl ? (
                  <Image
                    src={record.spriteUrl}
                    alt={record.pokemonName}
                    width={40}
                    height={40}
                    className="h-10 w-10 shrink-0 object-contain"
                  />
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded bg-[var(--background-tertiary)]" />
                )}
                <div className="min-w-0">
                  <div className="truncate font-bold text-white">{record.pokemonName}</div>
                  <div className="text-[11px] text-[var(--foreground-muted)]">{record.games} {record.games === 1 ? "game" : "games"}</div>
                </div>
              </div>

              <div className="text-left sm:text-center">
                <div className="font-pixel text-lg text-[var(--accent)]">{record.totalUses}</div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">uses</div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {record.moves.map((move) => (
                  <span
                    key={move.name}
                    className="rounded border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-2 py-1 text-xs text-white"
                  >
                    {move.name} <span className="font-mono text-[var(--foreground-muted)]">{move.uses}</span>
                  </span>
                ))}
              </div>
            </div>
            ))}
          </div>
        </>
      ) : (
        <div className="px-4 py-10 text-center text-sm text-[var(--foreground-muted)]">
          No replay move data is available for this date range yet.
        </div>
      )}
    </div>
  );
}
