"use client";

import { LeagueJourney } from "@/components/league-context";
import { positiveId } from "@/lib/league-context";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

type CompareMode = "coaches" | "pokemon";
type MatchPhase = "overall" | "regular-season" | "playoffs";

type Option = { id: number; name: string; imageUrl?: string | null };
export type CompareStats = Record<string, number | null>;
export type CompareEntity = {
  id: number;
  name: string;
  subtitle: string;
  imageUrl: string | null;
  href: string;
  stats: CompareStats;
};

type Props = {
  mode: CompareMode;
  options: Option[];
  selections: CompareEntity[];
  pairwise: Array<{
    firstId: number;
    secondId: number;
    meetings: number;
    firstWins: number;
    secondWins: number;
  }>;
  seasons: Array<{ id: number; seasonNumber: number; name: string }>;
  divisions: Array<{ id: number; seasonId: number; name: string }>;
  selectedSeasonId: number | null;
  selectedDivisionId: number | null;
  phase: MatchPhase;
  includeForfeits: boolean;
  query: Record<string, string>;
};

const coachRows = [
  ["Games", "games", "number"],
  ["Wins", "wins", "number"],
  ["Losses", "losses", "lower"],
  ["Win Rate", "winRate", "percent"],
  ["Differential", "differential", "signed"],
  ["Seasons Played", "seasons", "number"],
  ["Current ELO", "elo", "number"],
] as const;

const pokemonRows = [
  ["Games", "games", "number"],
  ["Wins", "wins", "number"],
  ["Losses", "losses", "lower"],
  ["Win Rate", "winRate", "percent"],
  ["Kills", "kills", "number"],
  ["Deaths", "deaths", "lower"],
  ["Kill Differential", "differential", "signed"],
  ["K/D", "kd", "decimal"],
  ["Kills / Game", "killsPerGame", "decimal"],
  ["Damage", "damage", "percentTotal"],
  ["Damage / Game", "damagePerGame", "percentTotal"],
  ["Turns Active", "turns", "decimal"],
  ["HAX Events", "hax", "number"],
] as const;

function formatValue(value: number | null, format: string) {
  if (value === null) return "—";
  if (format === "percent") return `${value.toFixed(1)}%`;
  if (format === "signed") return `${value > 0 ? "+" : ""}${value}`;
  if (format === "decimal") return value.toFixed(2);
  if (format === "percentTotal") return `${Math.round(value)}%`;
  return Math.round(value).toLocaleString();
}

function EntityPicker({ label, selected, options, placeholder, onSelect }: {
  label: string;
  selected: CompareEntity | null;
  options: Option[];
  placeholder: string;
  onSelect: (id: number) => void;
}) {
  const listId = `compare-${label.toLowerCase()}-options`;
  const selectedOptionName = selected
    ? options.find((option) => option.id === selected.id)?.name ?? selected.name
    : "";
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-[var(--foreground-muted)]">{label}</span>
      <input
        key={selected?.id ?? "empty"}
        list={listId}
        defaultValue={selectedOptionName}
        placeholder={placeholder}
        onChange={(event) => {
          const match = options.find((option) => option.name.toLowerCase() === event.target.value.trim().toLowerCase());
          if (match) onSelect(match.id);
        }}
        className="w-full rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2.5 text-sm font-bold text-white outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/15"
      />
      <datalist id={listId}>
        {options.map((option) => <option key={option.id} value={option.name} />)}
      </datalist>
    </label>
  );
}

export function CompareClient({
  mode,
  options,
  selections,
  pairwise,
  seasons,
  divisions,
  selectedSeasonId,
  selectedDivisionId,
  phase,
  includeForfeits,
  query,
}: Props) {
  const router = useRouter();
  const visibleDivisions = useMemo(
    () => selectedSeasonId ? divisions.filter((division) => division.seasonId === selectedSeasonId) : [],
    [divisions, selectedSeasonId],
  );
  const rows = mode === "coaches" ? coachRows : pokemonRows;

  function updateQuery(changes: Record<string, string | number | null>) {
    const params = new URLSearchParams(query);
    params.set("type", mode);
    if ("season" in changes || "division" in changes) {
      for (const key of ["week", "teamId", "matchId"]) params.delete(key);
    }
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, String(value));
    }
    router.replace(`/compare?${params.toString()}`, { scroll: false });
  }

  function changeMode(nextMode: CompareMode) {
    const params = new URLSearchParams();
    params.set("type", nextMode);
    router.replace(`/compare?${params.toString()}`);
  }

  const slotKeys = ["left", "right", "third", "fourth"] as const;
  const slotLabels = ["First", "Second", "Third", "Fourth"];
  const accents = [
    { tone: "compare-slot-red" },
    { tone: "compare-slot-blue" },
    { tone: "compare-slot-yellow" },
    { tone: "compare-slot-green" },
  ];
  const selectionGridClass = selections.length === 2
    ? "sm:grid-cols-2"
    : selections.length === 3
      ? "sm:grid-cols-2 xl:grid-cols-3"
      : "sm:grid-cols-2 xl:grid-cols-4";

  function removeSlot(index: number) {
    const remainingIds = selections.filter((_, selectionIndex) => selectionIndex !== index).map((entity) => entity.id);
    updateQuery(Object.fromEntries(slotKeys.map((key, slotIndex) => [key, remainingIds[slotIndex] ?? null])));
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <LeagueJourney context={{
        week: positiveId(new URLSearchParams(query).get("week")),
        teamId: positiveId(new URLSearchParams(query).get("teamId")),
        matchId: positiveId(new URLSearchParams(query).get("matchId")),
        seasonId: selectedSeasonId ?? undefined, seasonName: seasons.find((season) => season.id === selectedSeasonId)?.name,
        divisionId: visibleDivisions.find((division) => division.id === selectedDivisionId)?.id,
        divisionName: visibleDivisions.find((division) => division.id === selectedDivisionId)?.name,
      }} />
      <section className="poke-card overflow-hidden p-0">
        <div className="relative border-b border-[var(--background-tertiary)] bg-gradient-to-br from-cyan-400/[0.08] via-transparent to-rose-400/[0.08] p-5 sm:p-7">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Head-to-head lab</p>
          <h1 className="mt-2 font-pixel text-xl leading-relaxed text-white sm:text-2xl">Compare</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--foreground-muted)]">
            Compare {mode === "coaches" ? "career records" : "battle performance"} across the exact seasons, divisions, and match types you choose.
          </p>
        </div>
        <div className="grid grid-cols-2 border-b border-[var(--background-tertiary)] bg-[var(--background-secondary)] p-1.5">
          {(["coaches", "pokemon"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => changeMode(value)}
              className={`rounded-lg px-4 py-2.5 text-xs font-black uppercase tracking-wide transition ${mode === value ? "bg-[var(--primary)] text-white shadow-lg" : "text-[var(--foreground-muted)] hover:bg-white/5 hover:text-white"}`}
            >
              {value}
            </button>
          ))}
        </div>
      </section>

      <section className="poke-card p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black text-white">Comparison lineup</p>
            <p className="text-[10px] text-[var(--foreground-muted)]">Select between two and four unique entries.</p>
          </div>
          <span className="rounded-full border border-[var(--background-tertiary)] bg-[var(--background)] px-2.5 py-1 text-[10px] font-bold text-[var(--foreground-muted)]">
            {selections.length}/4 selected
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {selections.map((entity, index) => (
            <div key={`${slotKeys[index]}-${entity.id}`} className="relative">
              <EntityPicker
                label={slotLabels[index]}
                selected={entity}
                options={options.filter((option) => option.id === entity.id || !selections.some((selected) => selected.id === option.id))}
                placeholder={mode === "coaches" ? "Search by team name" : "Search by Pokémon name"}
                onSelect={(id) => updateQuery({ [slotKeys[index]]: id })}
              />
              {index >= 2 && (
                <button
                  type="button"
                  onClick={() => removeSlot(index)}
                  className="absolute right-2 top-0 text-[9px] font-bold uppercase text-[var(--foreground-subtle)] hover:text-rose-300"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {selections.length < 4 && (
            <EntityPicker
              label={`Add ${slotLabels[selections.length]}`}
              selected={null}
              options={options.filter((option) => !selections.some((selected) => selected.id === option.id))}
              placeholder={mode === "coaches" ? "Search by team name" : "Search by Pokémon name"}
              onSelect={(id) => updateQuery({ [slotKeys[selections.length]]: id })}
            />
          )}
        </div>

        <div className="mt-4 grid gap-3 border-t border-[var(--background-tertiary)] pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <label>
            <span className="mb-1 block text-[9px] font-bold uppercase text-[var(--foreground-muted)]">Season</span>
            <select value={selectedSeasonId ?? ""} onChange={(event) => updateQuery({ season: event.target.value || null, division: null })} className="w-full rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-sm text-white">
              <option value="">All seasons</option>
              {seasons.map((season) => <option key={season.id} value={season.id}>S{season.seasonNumber} · {season.name}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[9px] font-bold uppercase text-[var(--foreground-muted)]">Division</span>
            <select value={selectedDivisionId ?? ""} disabled={!selectedSeasonId} onChange={(event) => updateQuery({ division: event.target.value || null })} className="w-full rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-sm text-white disabled:opacity-40">
              <option value="">All divisions</option>
              {visibleDivisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[9px] font-bold uppercase text-[var(--foreground-muted)]">Match type</span>
            <select value={phase} onChange={(event) => updateQuery({ phase: event.target.value })} className="w-full rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-sm text-white">
              <option value="overall">Overall</option>
              <option value="regular-season">Regular season</option>
              <option value="playoffs">Playoffs</option>
            </select>
          </label>
          <label className="flex items-end">
            <button type="button" role="switch" aria-checked={includeForfeits} onClick={() => updateQuery({ forfeits: includeForfeits ? "0" : "1" })} className="flex w-full items-center justify-between rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground-muted)]">
              Include forfeits
              <span className={`relative h-5 w-9 rounded-full transition ${includeForfeits ? "bg-[var(--primary)]" : "bg-[var(--background-tertiary)]"}`}>
                <span className={`absolute left-[3px] top-[3px] h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${includeForfeits ? "translate-x-[16px]" : "translate-x-0"}`} />
              </span>
            </button>
          </label>
        </div>
      </section>

      {selections.length >= 2 ? (
        <>
          <section className={`grid gap-3 ${selectionGridClass}`}>
            {selections.map((entity, index) => (
              <Link key={entity.id} href={entity.href} className={`poke-card compare-accent-surface group flex min-h-32 items-center gap-3 border p-4 transition hover:-translate-y-0.5 ${accents[index].tone}`}>
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/25 p-2">
                  {entity.imageUrl ? <Image src={entity.imageUrl} alt={entity.name} width={64} height={64} className="h-full w-full object-contain" /> : <span className="text-2xl font-black text-white/40">{entity.name.slice(0, 1)}</span>}
                </div>
                <div className="min-w-0">
                  <p className={`compare-accent-text text-[9px] font-black uppercase tracking-widest ${accents[index].tone}`}>{slotLabels[index]}</p>
                  <h2 className="mt-1 truncate text-base font-black text-white group-hover:text-[var(--primary-light)]">{entity.name}</h2>
                  <p className="mt-1 line-clamp-2 text-[10px] text-[var(--foreground-muted)]">{entity.subtitle}</p>
                </div>
              </Link>
            ))}
          </section>

          <section className="poke-card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <div className="min-w-[38rem]">
                <div className="grid border-b border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 py-3 text-[10px] font-black uppercase tracking-wide text-[var(--foreground-muted)]" style={{ gridTemplateColumns: `minmax(7rem, 0.8fr) repeat(${selections.length}, minmax(8rem, 1fr))` }}>
                  <span>Statistic</span>
                  {selections.map((entity, index) => <span key={entity.id} className={`compare-accent-text truncate text-center ${accents[index].tone}`}>{entity.name}</span>)}
                </div>
                <div className="divide-y divide-[var(--background-tertiary)]">
                  {rows.map(([label, key, format]) => {
                    const availableValues = selections.map((entity) => entity.stats[key]).filter((value): value is number => value !== null);
                    const target = availableValues.length
                      ? (format === "lower" ? Math.min(...availableValues) : Math.max(...availableValues))
                      : null;
                    const hasMeaningfulLeader = target !== null && availableValues.some((value) => value !== target);
                    return (
                      <div key={key} className="grid items-center px-3 py-3" style={{ gridTemplateColumns: `minmax(7rem, 0.8fr) repeat(${selections.length}, minmax(8rem, 1fr))` }}>
                        <span className="text-[10px] font-bold uppercase text-[var(--foreground-muted)] sm:text-xs">{label}</span>
                        {selections.map((entity, index) => {
                          const value = entity.stats[key];
                          const isLeader = hasMeaningfulLeader && value !== null && value === target;
                          return <span key={entity.id} className={`text-center font-mono text-base font-black ${isLeader ? `${accents[index].tone} compare-accent-text` : "text-white/80"}`}>{formatValue(value, format)}</span>;
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="poke-card p-4 sm:p-5">
            <div className="mb-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-300">Pairwise records</p>
              <h2 className="mt-1 text-base font-black text-white">Head-to-head matchups</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {pairwise.map((result) => {
                const first = selections.find((entity) => entity.id === result.firstId);
                const second = selections.find((entity) => entity.id === result.secondId);
                if (!first || !second) return null;
                return (
                  <div key={`${result.firstId}-${result.secondId}`} className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-[var(--foreground-muted)]">
                      <span className="truncate">{first.name}</span>
                      <span className="text-white/30">vs</span>
                      <span className="truncate text-right">{second.name}</span>
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-3">
                      <span className="font-mono text-xl font-black text-white">{result.firstWins}–{result.secondWins}</span>
                      <span className="text-[9px] text-[var(--foreground-subtle)]">{result.meetings} meeting{result.meetings === 1 ? "" : "s"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {mode === "pokemon" && (
            <p className="text-center text-[10px] text-[var(--foreground-subtle)]">
              Damage, turns, and event statistics display — when the selected historical scope does not contain tracked replay data.
            </p>
          )}
        </>
      ) : (
        <section className="poke-card p-10 text-center text-sm text-[var(--foreground-muted)]">Choose at least two different entries to begin comparing.</section>
      )}
    </div>
  );
}
