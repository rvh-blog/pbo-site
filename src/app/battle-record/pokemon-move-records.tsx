"use client";

import Image from "next/image";
import Link from "next/link";
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

type PokemonMoveSource = {
  matchId: number;
  seasonNumber: number;
  divisionName: string;
  week: number;
  replayUrl: string | null;
  teamName: string;
  opponentTeamName: string;
  coach: { id: number; name: string } | null;
  moves: Array<{ name: string; uses: number }>;
};

export type PokemonMoveDivision = {
  divisionId: number;
  seasonNumber: number;
  divisionName: string;
  records: PokemonMoveRecord[];
};

function aggregateMoveRecords(records: PokemonMoveRecord[]): PokemonMoveRecord[] {
  const aggregated = new Map<number, {
    pokemonId: number;
    pokemonName: string;
    spriteUrl: string | null;
    games: number;
    moves: Map<string, { name: string; uses: number }>;
  }>();

  for (const record of records) {
    const current = aggregated.get(record.pokemonId) ?? {
      pokemonId: record.pokemonId,
      pokemonName: record.pokemonName,
      spriteUrl: record.spriteUrl,
      games: 0,
      moves: new Map<string, { name: string; uses: number }>(),
    };
    current.games += record.games;

    for (const move of record.moves) {
      const key = move.name.toLowerCase();
      const currentMove = current.moves.get(key) ?? { name: move.name, uses: 0 };
      currentMove.uses += move.uses;
      current.moves.set(key, currentMove);
    }

    aggregated.set(record.pokemonId, current);
  }

  return [...aggregated.values()]
    .map((record) => {
      const moves = [...record.moves.values()].sort(
        (a, b) => b.uses - a.uses || a.name.localeCompare(b.name)
      );
      return {
        ...record,
        totalUses: moves.reduce((sum, move) => sum + move.uses, 0),
        moves,
      };
    })
    .filter((record) => record.totalUses > 0)
    .sort(
      (a, b) =>
        b.totalUses - a.totalUses ||
        b.games - a.games ||
        a.pokemonName.localeCompare(b.pokemonName)
    );
}

function formatWeek(week: number) {
  if (week === 101) return "Quarterfinals";
  if (week === 102) return "Semifinals";
  if (week === 103) return "Finals";
  return `Week ${week}`;
}

export function PokemonMoveRecords({
  divisions,
}: {
  divisions: PokemonMoveDivision[];
}) {
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState("all");
  const [selectedDivisionId, setSelectedDivisionId] = useState("all");
  const [showOverallMoves, setShowOverallMoves] = useState(true);
  const [sourceStates, setSourceStates] = useState<Record<string, {
    loading: boolean;
    error: string | null;
    sources: PokemonMoveSource[];
  }>>({});
  const selectedSeasonDivisions = selectedSeasonNumber === "all"
    ? divisions
    : divisions.filter((division) => String(division.seasonNumber) === selectedSeasonNumber);
  const activeRecords = selectedDivisionId !== "all"
    ? divisions.find((division) => String(division.divisionId) === selectedDivisionId)?.records || []
    : selectedSeasonNumber === "all"
      ? aggregateMoveRecords(divisions.flatMap((division) => division.records))
      : aggregateMoveRecords(selectedSeasonDivisions.flatMap((division) => division.records));
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

  function sourceKey(pokemonId: number) {
    return `${pokemonId}:${selectedSeasonNumber}:${selectedDivisionId}`;
  }

  async function loadSources(pokemonId: number) {
    const key = sourceKey(pokemonId);
    if (sourceStates[key]) return;

    setSourceStates((current) => ({
      ...current,
      [key]: { loading: true, error: null, sources: [] },
    }));
    const params = new URLSearchParams({ pokemonId: String(pokemonId) });
    if (selectedSeasonNumber !== "all") params.set("season", selectedSeasonNumber);
    if (selectedDivisionId !== "all") params.set("division", selectedDivisionId);

    try {
      const response = await fetch(`/api/battle-record/move-sources?${params.toString()}`);
      const payload = await response.json() as { sources?: PokemonMoveSource[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to load game sources");
      setSourceStates((current) => ({
        ...current,
        [key]: { loading: false, error: null, sources: payload.sources ?? [] },
      }));
    } catch (error) {
      setSourceStates((current) => ({
        ...current,
        [key]: {
          loading: false,
          error: error instanceof Error ? error.message : "Failed to load game sources",
          sources: [],
        },
      }));
    }
  }

  return (
    <div>
      <div className="border-b-2 border-[var(--background-tertiary)] px-4 py-3 text-center text-base font-bold text-[var(--foreground-muted)] sm:px-6">
        Actual move commands from completed, non-forfeit matches played in Season 9 and onward.
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b-2 border-[var(--background-tertiary)] px-4 py-3 sm:px-6">
        <label htmlFor="move-usage-season" className="text-xs font-bold uppercase tracking-wider text-[var(--foreground-muted)]">
          Season
        </label>
        <select
          id="move-usage-season"
          value={selectedSeasonNumber}
          onChange={(event) => {
            setSelectedSeasonNumber(event.target.value);
            setSelectedDivisionId("all");
          }}
          className="rounded border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 py-2 text-xs font-bold text-white outline-none focus:border-[var(--accent)]"
        >
          <option value="all">All Seasons</option>
          {[...new Set(divisions.map((division) => division.seasonNumber))]
            .sort((a, b) => b - a)
            .map((seasonNumber) => (
              <option key={seasonNumber} value={seasonNumber}>
                Season {seasonNumber}
              </option>
            ))}
        </select>

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
          {[...divisionsBySeason.entries()]
            .filter(([seasonNumber]) => selectedSeasonNumber === "all" || String(seasonNumber) === selectedSeasonNumber)
            .sort(([a], [b]) => b - a).map(([seasonNumber, seasonDivisions]) => (
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
            {activeRecords.map((record) => {
              const sourceState = sourceStates[sourceKey(record.pokemonId)];

              return (
              <div key={record.pokemonId}>
                <div className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(180px,0.8fr)_90px_minmax(0,2fr)] sm:items-center sm:px-6">
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

                <details
                  className="group border-t border-[var(--background-tertiary)]/60"
                  onToggle={(event) => {
                    if (event.currentTarget.open) void loadSources(record.pokemonId);
                  }}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-xs font-bold text-[var(--foreground-muted)] hover:bg-[var(--background-secondary)] hover:text-white sm:px-6">
                    <span>
                      View game sources{" "}
                      <span className="font-mono font-normal">({record.games})</span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="text-base text-[var(--primary)] transition-transform group-open:rotate-180"
                    >
                      ▾
                    </span>
                  </summary>
                  <div className="border-t border-[var(--background-tertiary)] bg-[var(--background)]/40 px-4 py-3 sm:px-6">
                    <div className="mb-3 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground-subtle)]">
                      Each source is one Pokémon appearance. Move totals show commands recorded in that replay.
                    </div>
                    {sourceState?.loading ? (
                      <div className="py-6 text-center text-xs text-[var(--foreground-muted)]">Loading game sources…</div>
                    ) : sourceState?.error ? (
                      <div className="py-6 text-center text-xs text-[var(--error)]">{sourceState.error}</div>
                    ) : sourceState?.sources.length ? (
                      <div className="space-y-2">
                      {sourceState.sources.map((source) => (
                        <div
                          key={source.matchId}
                          className="grid gap-2 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background-secondary)] p-3 text-xs sm:grid-cols-[minmax(10rem,0.9fr)_minmax(12rem,1.3fr)_minmax(12rem,1fr)_auto] sm:items-center"
                        >
                          <div>
                            <div className="font-bold text-white">
                              Season {source.seasonNumber} · {formatWeek(source.week)}
                            </div>
                            <div className="mt-0.5 text-[var(--foreground-subtle)]">
                              {source.divisionName}
                            </div>
                          </div>
                          <div>
                            <div className="font-medium text-white">
                              {source.teamName} vs {source.opponentTeamName}
                            </div>
                            <div className="mt-0.5 text-[var(--foreground-muted)]">
                              <Link href={`/pokemon/${record.pokemonId}`} className="hover:text-[var(--primary)]">
                                {record.pokemonName}
                              </Link>
                              {source.coach ? (
                                <>
                                  {" · "}
                                  <Link href={`/coaches/${source.coach.id}`} className="hover:text-[var(--primary)]">
                                    {source.coach.name}
                                  </Link>
                                </>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {source.moves.length > 0 ? source.moves.map((move) => (
                              <span
                                key={move.name}
                                className="rounded border border-[var(--background-tertiary)] bg-[var(--background)]/50 px-2 py-1 text-[11px] text-white"
                              >
                                {move.name} <span className="font-mono text-[var(--accent)]">{move.uses}</span>
                              </span>
                            )) : (
                              <span className="text-[11px] italic text-[var(--foreground-subtle)]">
                                No move commands recorded
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            <Link
                              href={`/matches/${source.matchId}`}
                              className="rounded-md border border-[var(--background-tertiary)] px-2.5 py-1.5 font-bold text-[var(--foreground-muted)] hover:border-[var(--primary)] hover:text-white"
                            >
                              Match
                            </Link>
                            {source.replayUrl ? (
                              <a
                                href={source.replayUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-md border border-[var(--primary)]/60 px-2.5 py-1.5 font-bold text-[var(--primary)] hover:border-[var(--primary)] hover:text-white"
                              >
                                Replay ↗
                              </a>
                            ) : null}
                          </div>
                        </div>
                      ))}
                      </div>
                    ) : (
                      <div className="py-6 text-center text-xs text-[var(--foreground-muted)]">No game sources found.</div>
                    )}
                  </div>
                </details>
              </div>
              );
            })}
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
