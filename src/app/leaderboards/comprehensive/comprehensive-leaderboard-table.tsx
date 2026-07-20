"use client";

import Image from "next/image";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import type { SeasonTeamPokemonLeaderboardStat } from "@/lib/pokemon-leaderboard";

type SortKey =
  | "pokemon"
  | "team"
  | "division"
  | "season"
  | "kills"
  | "deaths"
  | "differential"
  | "kd"
  | "killsPerGame"
  | "gamesPlayed";

type SortDirection = "asc" | "desc";
type SeasonPhase = "overall" | "regular" | "playoffs";

const columns: { key: SortKey; label: string; align?: "center" }[] = [
  { key: "pokemon", label: "Pokémon" },
  { key: "team", label: "Team" },
  { key: "division", label: "Division" },
  { key: "season", label: "Season" },
  { key: "kills", label: "Kills", align: "center" },
  { key: "deaths", label: "Deaths", align: "center" },
  { key: "differential", label: "+/-", align: "center" },
  { key: "kd", label: "K/D", align: "center" },
  { key: "killsPerGame", label: "K/G", align: "center" },
  { key: "gamesPlayed", label: "GP", align: "center" },
];

const divisionHierarchy = [
  "Infinity",
  "Stargazer",
  "Sunset",
  "Crystal",
  "Neon",
  "Unova",
  "Kalos",
];

function defaultDirection(key: SortKey): SortDirection {
  return key === "pokemon" || key === "team" || key === "division" || key === "season"
    ? "asc"
    : "desc";
}

function kdValue(entry: SeasonTeamPokemonLeaderboardStat) {
  if (entry.deaths === 0) return entry.kills > 0 ? Number.POSITIVE_INFINITY : 0;
  return entry.kills / entry.deaths;
}

function searchKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function compareEntries(
  left: SeasonTeamPokemonLeaderboardStat,
  right: SeasonTeamPokemonLeaderboardStat,
  key: SortKey
) {
  switch (key) {
    case "pokemon":
      return (left.pokemonDisplayName || left.pokemonName).localeCompare(
        right.pokemonDisplayName || right.pokemonName
      );
    case "team":
      return left.teamName.localeCompare(right.teamName);
    case "division":
      return left.divisionName.localeCompare(right.divisionName);
    case "season":
      return left.seasonName.localeCompare(right.seasonName);
    case "kills":
      return left.kills - right.kills;
    case "deaths":
      return left.deaths - right.deaths;
    case "differential":
      return left.differential - right.differential;
    case "kd":
      return kdValue(left) - kdValue(right);
    case "killsPerGame":
      return left.killsPerGame - right.killsPerGame;
    case "gamesPlayed":
      return left.gamesPlayed - right.gamesPlayed;
  }
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const pluralLabel = label === "Coach" ? "Coaches" : `${label}s`;

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-[10px] font-bold uppercase tracking-wide text-[var(--foreground-muted)]"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[var(--primary)]"
      >
        <option value="all">All {pluralLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ComprehensiveLeaderboardTable({
  overallEntries,
  regularSeasonEntries,
  playoffEntries,
  seasonName,
  divisionCount,
  showSeasonColumn,
}: {
  overallEntries: SeasonTeamPokemonLeaderboardStat[];
  regularSeasonEntries: SeasonTeamPokemonLeaderboardStat[];
  playoffEntries: SeasonTeamPokemonLeaderboardStat[];
  seasonName: string;
  divisionCount: number;
  showSeasonColumn: boolean;
}) {
  const [phase, setPhase] = useState<SeasonPhase>("overall");
  const [sortKey, setSortKey] = useState<SortKey>("kills");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [coachFilter, setCoachFilter] = useState("all");
  const [minimumGames, setMinimumGames] = useState(0);
  const [expandedEntryKey, setExpandedEntryKey] = useState<string | null>(null);
  const entries = phase === "overall"
    ? overallEntries
    : phase === "regular"
      ? regularSeasonEntries
      : playoffEntries;
  const normalizedSearchQuery = searchKey(searchQuery);
  const filteredEntries = entries.filter((entry) => (
    (!normalizedSearchQuery
      || searchKey(entry.pokemonDisplayName || entry.pokemonName).includes(normalizedSearchQuery)
      || searchKey(entry.pokemonName).includes(normalizedSearchQuery))
    && (divisionFilter === "all" || entry.divisionName === divisionFilter)
    && (teamFilter === "all" || entry.seasonCoachId.toString() === teamFilter)
    && (coachFilter === "all" || entry.coachId?.toString() === coachFilter)
    && entry.gamesPlayed >= minimumGames
  ));
  const divisionOptions = [...new Set(overallEntries.map((entry) => entry.divisionName))]
    .sort((left, right) => {
      const leftRank = divisionHierarchy.findIndex(
        (division) => division.toLowerCase() === left.toLowerCase()
      );
      const rightRank = divisionHierarchy.findIndex(
        (division) => division.toLowerCase() === right.toLowerCase()
      );

      if (leftRank === -1 && rightRank === -1) return left.localeCompare(right);
      if (leftRank === -1) return 1;
      if (rightRank === -1) return -1;
      return leftRank - rightRank;
    });
  const teamOptions = [
    ...new Map(
      overallEntries.map((entry) => [
        entry.seasonCoachId,
        {
          id: entry.seasonCoachId,
          label: showSeasonColumn
            ? `${entry.teamName} (${entry.seasonName})`
            : entry.teamName,
        },
      ])
    ).values(),
  ].sort((left, right) => left.label.localeCompare(right.label));
  const coachOptions = [
    ...new Map(
      overallEntries
        .filter((entry) => entry.coachId && entry.coachName)
        .map((entry) => [
          entry.coachId!,
          {
            id: entry.coachId!,
            label: entry.coachName!,
          },
        ])
    ).values(),
  ].sort((left, right) => left.label.localeCompare(right.label));
  const visibleColumns = columns.filter((column) => showSeasonColumn || column.key !== "season");
  const gridColumnsClass = showSeasonColumn
    ? "grid-cols-[56px_minmax(215px,1fr)_minmax(220px,1.2fr)_120px_110px_72px_72px_84px_72px_72px_72px]"
    : "grid-cols-[56px_minmax(215px,1fr)_minmax(220px,1.2fr)_120px_72px_72px_84px_72px_72px_72px]";
  const hasActiveFilters = Boolean(
    searchQuery
    || divisionFilter !== "all"
    || teamFilter !== "all"
    || coachFilter !== "all"
    || minimumGames > 0
  );

  const sortedEntries = useMemo(() => {
    const directionMultiplier = sortDirection === "asc" ? 1 : -1;
    return [...filteredEntries].sort((left, right) => (
      compareEntries(left, right, sortKey) * directionMultiplier
      || right.kills - left.kills
      || right.differential - left.differential
      || left.gamesPlayed - right.gamesPlayed
      || left.teamName.localeCompare(right.teamName)
      || left.pokemonName.localeCompare(right.pokemonName)
    ));
  }, [filteredEntries, sortDirection, sortKey]);
  const killLeader = [...filteredEntries].sort((left, right) => (
    right.kills - left.kills || right.differential - left.differential
  ))[0];
  const differentialLeader = [...filteredEntries].sort((left, right) => (
    right.differential - left.differential || right.kills - left.kills
  ))[0];
  const killsPerGameLeader = [...filteredEntries].sort((left, right) => (
    right.killsPerGame - left.killsPerGame || right.kills - left.kills
  ))[0];
  const leaderCards = [
    { label: "Kill Leader", entry: killLeader, value: killLeader?.kills.toString() || "—" },
    {
      label: "Differential Leader",
      entry: differentialLeader,
      value: differentialLeader
        ? `${differentialLeader.differential > 0 ? "+" : ""}${differentialLeader.differential}`
        : "—",
    },
    {
      label: "Kills/Game Leader",
      entry: killsPerGameLeader,
      value: killsPerGameLeader?.killsPerGame.toFixed(2) || "—",
    },
  ];

  function changeSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((direction) => direction === "asc" ? "desc" : "asc");
      return;
    }

    setSortKey(key);
    setSortDirection(defaultDirection(key));
  }

  function resetFilters() {
    setSearchQuery("");
    setDivisionFilter("all");
    setTeamFilter("all");
    setCoachFilter("all");
    setMinimumGames(0);
  }

  return (
    <div className="poke-card overflow-hidden">
      <div className="border-b-2 border-sky-300/30 bg-sky-300/10 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-black text-white">
              {seasonName} Kill Leaders
            </h2>
            <p className="mt-1 text-xs text-[var(--foreground-muted)]">
              Team-owned Pokémon from {divisionCount} division{divisionCount === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              { key: "overall", label: "Overall", count: overallEntries.length },
              { key: "regular", label: "Regular Season", count: regularSeasonEntries.length },
              { key: "playoffs", label: "Playoffs", count: playoffEntries.length },
            ] as const).map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  setPhase(option.key);
                  setExpandedEntryKey(null);
                }}
                aria-pressed={phase === option.key}
                className={`rounded-lg border-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                  phase === option.key
                    ? "border-sky-300 bg-sky-300 text-slate-950"
                    : "border-sky-300/25 bg-sky-300/5 text-[var(--foreground-muted)] hover:border-sky-300/60 hover:bg-sky-300/10 hover:text-[var(--foreground)]"
                }`}
              >
                {option.label}
                <span className="ml-1 opacity-70">({option.count})</span>
              </button>
            ))}
          </div>
        </div>
        <p className="mt-3 text-right text-[10px] font-bold uppercase text-[var(--foreground-muted)]">
          Click a column to sort
        </p>
      </div>

      <div className="grid gap-3 border-b border-[var(--background-tertiary)] bg-[var(--background)]/45 p-4 md:grid-cols-3">
        {leaderCards.map((leader) => (
          <div
            key={leader.label}
            className="rounded-xl border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] p-4"
          >
            <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--foreground-muted)]">
              {leader.label}
            </div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-white">
                  {leader.entry
                    ? leader.entry.pokemonDisplayName || leader.entry.pokemonName
                    : "No qualifying Pokémon"}
                </div>
                {leader.entry && (
                  <div className="truncate text-[10px] text-[var(--foreground-muted)]">
                    {leader.entry.teamName}
                  </div>
                )}
              </div>
              <span className="shrink-0 font-mono text-2xl font-black text-[var(--success)]">
                {leader.value}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4 border-b border-[var(--background-tertiary)] bg-[var(--background-secondary)]/60 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="md:col-span-2 xl:col-span-1">
            <label
              htmlFor="comprehensive-pokemon-search"
              className="mb-2 block text-[10px] font-bold uppercase tracking-wide text-[var(--foreground-muted)]"
            >
              Search Pokémon
            </label>
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--foreground-muted)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
              </svg>
              <input
                id="comprehensive-pokemon-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="e.g. Raging Bolt"
                className="w-full rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] py-2.5 pl-10 pr-3 text-sm text-white outline-none transition-colors placeholder:text-[var(--foreground-subtle)] focus:border-[var(--primary)]"
              />
            </div>
          </div>

          <FilterSelect
            id="comprehensive-division-filter"
            label="Division"
            value={divisionFilter}
            onChange={setDivisionFilter}
            options={divisionOptions.map((division) => ({ value: division, label: division }))}
          />
          <FilterSelect
            id="comprehensive-team-filter"
            label="Team"
            value={teamFilter}
            onChange={setTeamFilter}
            options={teamOptions.map((team) => ({ value: team.id.toString(), label: team.label }))}
          />
          <FilterSelect
            id="comprehensive-coach-filter"
            label="Coach"
            value={coachFilter}
            onChange={setCoachFilter}
            options={coachOptions.map((coach) => ({ value: coach.id.toString(), label: coach.label }))}
          />

          <div>
            <label
              htmlFor="comprehensive-minimum-games"
              className="mb-2 block text-[10px] font-bold uppercase tracking-wide text-[var(--foreground-muted)]"
            >
              Minimum Games
            </label>
            <input
              id="comprehensive-minimum-games"
              type="number"
              min={0}
              step={1}
              value={minimumGames}
              onChange={(event) => setMinimumGames(Math.max(0, Number(event.target.value) || 0))}
              className="w-full rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[var(--primary)]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-[var(--foreground-muted)]">
            {filteredEntries.length} of {entries.length} team entries shown
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-lg border border-[var(--background-tertiary)] px-3 py-1.5 text-[10px] font-bold uppercase text-[var(--foreground-muted)] transition-colors hover:bg-[var(--background-tertiary)] hover:text-white"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="p-10 text-center text-sm text-[var(--foreground-muted)]">
          No {phase === "overall" ? "completed match" : phase === "regular" ? "regular-season" : "playoff"} Pokémon data is available for this season.
        </p>
      ) : filteredEntries.length === 0 ? (
        <p className="p-10 text-center text-sm text-[var(--foreground-muted)]">
          No Pokémon named “{searchQuery.trim()}” appear in this view.
        </p>
      ) : (
        <div className="overflow-x-auto">
            <div className={showSeasonColumn ? "min-w-[1120px]" : "min-w-[1010px]"}>
            <div className={`grid ${gridColumnsClass} items-center border-b border-[var(--background-tertiary)] px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground-muted)]`}>
              <span>Rank</span>
              {visibleColumns.map((column) => {
                const active = sortKey === column.key;

                return (
                  <button
                    key={column.key}
                    type="button"
                    onClick={() => changeSort(column.key)}
                    aria-label={`Sort by ${column.label}${
                      active ? `, currently ${sortDirection === "asc" ? "ascending" : "descending"}` : ""
                    }`}
                    aria-pressed={active}
                    className={`flex items-center gap-1 transition-colors hover:text-white ${
                      column.align === "center" ? "justify-center text-center" : "text-left"
                    } ${active ? "text-white" : ""}`}
                  >
                    <span>{column.label}</span>
                    <span className={`text-[9px] ${active ? "opacity-100" : "opacity-30"}`}>
                      {active ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                );
              })}
            </div>

            {sortedEntries.map((entry, index) => {
              const entryKey = `${entry.seasonCoachId}-${entry.pokemonId}`;
              const expanded = expandedEntryKey === entryKey;

              return (
                <Fragment key={entryKey}>
                  <div
                    className={`grid ${gridColumnsClass} items-center border-b border-[var(--background-tertiary)]/70 px-4 py-3 transition-colors hover:bg-[var(--background-tertiary)]/45`}
                  >
                <span
                  className={`rank-badge h-8 w-8 text-xs ${
                    index === 0
                      ? "rank-1"
                      : index === 1
                        ? "rank-2"
                        : index === 2
                          ? "rank-3"
                          : "border border-[var(--background-tertiary)] bg-[var(--background)] text-[var(--foreground-subtle)]"
                  }`}
                >
                  {index + 1}
                </span>

                <div className="flex min-w-0 items-center gap-2 pr-2">
                  <Link
                    href={`/pokemon/${entry.pokemonId}`}
                    className="group flex min-w-0 flex-1 items-center gap-3"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--background-secondary)]">
                      {entry.spriteUrl ? (
                        <Image
                          src={entry.spriteUrl}
                          alt={entry.pokemonDisplayName || entry.pokemonName}
                          width={36}
                          height={36}
                          sizes="36px"
                          className="h-9 w-9 object-contain"
                        />
                      ) : (
                        <span className="text-sm text-[var(--foreground-muted)]">?</span>
                      )}
                    </span>
                    <span className="truncate text-sm font-bold text-white transition-colors group-hover:text-[var(--primary)]">
                      {entry.pokemonDisplayName || entry.pokemonName}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setExpandedEntryKey(expanded ? null : entryKey)}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? "Hide" : "Show"} game log for ${
                      entry.pokemonDisplayName || entry.pokemonName
                    }`}
                    className="shrink-0 rounded-md border border-[var(--background-tertiary)] px-2 py-1 text-[9px] font-bold uppercase text-[var(--foreground-muted)] transition-colors hover:border-[var(--primary)] hover:text-white"
                  >
                    {expanded ? "Hide" : "Games"}
                  </button>
                </div>

                {entry.coachId ? (
                  <Link
                    href={`/coaches/${entry.coachId}`}
                    className="group min-w-0 pr-4"
                  >
                    <div className="truncate text-sm font-bold text-white transition-colors group-hover:text-[var(--primary)]">
                      {entry.teamName}
                    </div>
                    {entry.coachName && (
                      <div className="truncate text-[10px] text-[var(--foreground-muted)]">
                        {entry.coachName}
                      </div>
                    )}
                  </Link>
                ) : (
                  <span className="min-w-0 truncate pr-4 text-sm font-bold text-white">
                    {entry.teamName}
                  </span>
                )}

                <span className="truncate pr-3 text-xs text-[var(--foreground-muted)]">
                  {entry.divisionName}
                </span>
                {showSeasonColumn && (
                  <span className="truncate pr-3 text-xs font-bold text-[var(--foreground-muted)]">
                    {entry.seasonName}
                  </span>
                )}
                <span className="text-center font-mono font-black text-[var(--success)]">
                  {entry.kills}
                </span>
                <span className="text-center font-mono font-bold text-[var(--error)]">
                  {entry.deaths}
                </span>
                <span
                  className={`text-center font-mono font-bold ${
                    entry.differential > 0
                      ? "text-[var(--success)]"
                      : entry.differential < 0
                        ? "text-[var(--error)]"
                        : "text-[var(--foreground-muted)]"
                  }`}
                >
                  {entry.differential > 0 ? "+" : ""}
                  {entry.differential}
                </span>
                <span className="text-center font-mono text-[var(--foreground-muted)]">
                  {entry.kd}
                </span>
                <span className="text-center font-mono font-bold text-[var(--primary-light)]">
                  {entry.killsPerGame.toFixed(2)}
                </span>
                <span className="text-center font-mono text-[var(--foreground-muted)]">
                  {entry.gamesPlayed}
                </span>
                  </div>

                  {expanded && (
                    <div className="border-b border-[var(--background-tertiary)] bg-[var(--background)]/55 px-6 py-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-xs font-black uppercase tracking-wide text-white">
                            Game-by-game results
                          </h3>
                          <p className="mt-1 text-[10px] text-[var(--foreground-muted)]">
                            {entry.pokemonDisplayName || entry.pokemonName} — {entry.teamName}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold uppercase text-[var(--foreground-muted)]">
                          {entry.games.length} game{entry.games.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      {entry.games.length === 0 ? (
                        <p className="text-xs text-[var(--foreground-muted)]">
                          No game details are available for this entry.
                        </p>
                      ) : (
                        <div className="overflow-hidden rounded-lg border border-[var(--background-tertiary)]">
                          <div className="grid grid-cols-[90px_70px_minmax(180px,1fr)_60px_60px_90px] bg-[var(--background-secondary)] px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-[var(--foreground-muted)]">
                            <span>Week</span>
                            <span>Result</span>
                            <span>Opponent</span>
                            <span className="text-center">Kills</span>
                            <span className="text-center">Deaths</span>
                            <span className="text-right">Replay</span>
                          </div>
                          {entry.games.map((game) => (
                            <div
                              key={game.matchId}
                              className="grid grid-cols-[90px_70px_minmax(180px,1fr)_60px_60px_90px] items-center border-t border-[var(--background-tertiary)] px-3 py-2.5 text-xs"
                            >
                              <span className="text-[var(--foreground-muted)]">
                                {game.week > 100 ? "Playoffs" : `Week ${game.week}`}
                              </span>
                              <span
                                className={`font-black ${
                                  game.result === "W"
                                    ? "text-[var(--success)]"
                                    : game.result === "L"
                                      ? "text-[var(--error)]"
                                      : "text-[var(--foreground-muted)]"
                                }`}
                              >
                                {game.result || "—"}
                              </span>
                              <span className="truncate pr-3 font-bold text-white">
                                {game.opponentTeamName}
                              </span>
                              <span className="text-center font-mono font-bold text-[var(--success)]">
                                {game.kills}
                              </span>
                              <span className="text-center font-mono font-bold text-[var(--error)]">
                                {game.deaths}
                              </span>
                              <span className="text-right">
                                {game.replayUrl ? (
                                  <a
                                    href={game.replayUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-bold text-[var(--primary-light)] hover:underline"
                                  >
                                    Watch
                                  </a>
                                ) : (
                                  <span className="text-[var(--foreground-subtle)]">—</span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
