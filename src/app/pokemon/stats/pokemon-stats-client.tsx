"use client";

import { useMemo, useState } from "react";
import { compareDivisions } from "@/lib/division-order";
import Link from "next/link";

interface PokemonStatGroup {
  id: number;
  name: string;
  displayName: string | null;
  spriteUrl: string | null;
  seasonId: number;
  divisionId: number | null;
  totalDamageDealt: number;
  totalDamageDealtIndirect: number;
  totalDamageTaken: number;
  totalDamageTakenIndirect: number;
  totalHpRestored: number;
  gamesPlayed: number;
}

interface PokemonStat {
  id: number;
  name: string;
  displayName: string | null;
  spriteUrl: string | null;
  totalDamageDealt: number;
  totalDamageDealtIndirect: number;
  totalDamageTaken: number;
  totalDamageTakenIndirect: number;
  totalHpRestored: number;
  gamesPlayed: number;
}

interface SeasonOption {
  id: number;
  name: string;
  seasonNumber: number;
}

interface DivisionOption {
  id: number;
  name: string;
  seasonId: number;
  displayOrder: number;
}

type SortKey =
  | "dmgDealtTotal"
  | "dmgDealtDirect"
  | "dmgDealtIndirect"
  | "dmgDealtAvg"
  | "dmgTakenTotal"
  | "dmgTakenDirect"
  | "dmgTakenIndirect"
  | "dmgTakenAvg"
  | "hpRestoredTotal"
  | "hpRestoredAvg";

type Category = "dealt" | "taken" | "healed";

const CATEGORY_CONFIG: Record<
  Category,
  {
    label: string;
    color: string;
    iconBg: string;
    iconShadow: string;
    icon: string;
    sorts: { key: SortKey; label: string }[];
  }
> = {
  dealt: {
    label: "Damage Dealt",
    color: "var(--error)",
    iconBg: "!bg-[var(--error)]",
    iconShadow: "0 4px 0 #991b1b",
    icon: "M13 10V3L4 14h7v7l9-11h-7z",
    sorts: [
      { key: "dmgDealtTotal", label: "Total" },
      { key: "dmgDealtDirect", label: "Direct" },
      { key: "dmgDealtIndirect", label: "Indirect" },
      { key: "dmgDealtAvg", label: "Per Game" },
    ],
  },
  taken: {
    label: "Damage Taken",
    color: "var(--primary)",
    iconBg: "!bg-[var(--primary)]",
    iconShadow: "0 4px 0 #1e40af",
    icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
    sorts: [
      { key: "dmgTakenTotal", label: "Total" },
      { key: "dmgTakenDirect", label: "Direct" },
      { key: "dmgTakenIndirect", label: "Indirect" },
      { key: "dmgTakenAvg", label: "Per Game" },
    ],
  },
  healed: {
    label: "HP Recovered",
    color: "var(--success)",
    iconBg: "!bg-[var(--success)]",
    iconShadow: "0 4px 0 #166534",
    icon: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
    sorts: [
      { key: "hpRestoredTotal", label: "Total" },
      { key: "hpRestoredAvg", label: "Per Game" },
    ],
  },
};

function getSortValue(p: PokemonStat, key: SortKey): number {
  switch (key) {
    case "dmgDealtTotal":
      return p.totalDamageDealt + p.totalDamageDealtIndirect;
    case "dmgDealtDirect":
      return p.totalDamageDealt;
    case "dmgDealtIndirect":
      return p.totalDamageDealtIndirect;
    case "dmgDealtAvg":
      return (p.totalDamageDealt + p.totalDamageDealtIndirect) / p.gamesPlayed;
    case "dmgTakenTotal":
      return p.totalDamageTaken + p.totalDamageTakenIndirect;
    case "dmgTakenDirect":
      return p.totalDamageTaken;
    case "dmgTakenIndirect":
      return p.totalDamageTakenIndirect;
    case "dmgTakenAvg":
      return (p.totalDamageTaken + p.totalDamageTakenIndirect) / p.gamesPlayed;
    case "hpRestoredTotal":
      return p.totalHpRestored;
    case "hpRestoredAvg":
      return p.totalHpRestored / p.gamesPlayed;
  }
}

function formatValue(p: PokemonStat, key: SortKey): string {
  const val = getSortValue(p, key);
  if (key.endsWith("Avg")) return `${val.toFixed(1)}%`;
  return `${Math.round(val)}%`;
}

function getSecondaryInfo(p: PokemonStat, key: SortKey): string {
  if (key.endsWith("Avg")) return `${p.gamesPlayed} GP`;
  const avg = getSortValue(p, key) / p.gamesPlayed;
  return `${avg.toFixed(1)}%/g`;
}

interface PokemonStatsClientProps {
  stats: PokemonStatGroup[];
  seasons: SeasonOption[];
  divisions: DivisionOption[];
  currentSeasonId: number | null;
}

export function PokemonStatsClient({ stats, seasons, divisions, currentSeasonId }: PokemonStatsClientProps) {
  const [sorts, setSorts] = useState<Record<Category, SortKey>>({
    dealt: "dmgDealtTotal",
    taken: "dmgTakenTotal",
    healed: "hpRestoredTotal",
  });

  const [minGP, setMinGP] = useState(3);
  const [seasonId, setSeasonId] = useState<number | "all">(currentSeasonId ?? "all");
  const [divisionId, setDivisionId] = useState<number | "all">("all");

  const divisionGroups = useMemo(() => {
    const visibleSeasonIds = seasonId === "all" ? seasons.map((season) => season.id) : [seasonId];
    const divisionsBySeason = new Map<number, DivisionOption[]>();

    for (const division of divisions) {
      if (!visibleSeasonIds.includes(division.seasonId)) continue;
      const seasonDivisions = divisionsBySeason.get(division.seasonId) ?? [];
      seasonDivisions.push(division);
      divisionsBySeason.set(division.seasonId, seasonDivisions);
    }

    return visibleSeasonIds
      .map((visibleSeasonId) => {
        const season = seasons.find((candidate) => candidate.id === visibleSeasonId);
        const seasonDivisions = divisionsBySeason.get(visibleSeasonId) ?? [];
        return {
          id: visibleSeasonId,
          label: season?.name ?? "Unknown Season",
          divisions: [...seasonDivisions].sort(compareDivisions),
        };
      })
      .filter((group) => group.divisions.length > 0);
  }, [divisions, seasonId, seasons]);

  const divisionOptionCount = divisionGroups.reduce((count, group) => count + group.divisions.length, 0);

  const handleSeasonChange = (value: string) => {
    const next = value === "all" ? "all" : parseInt(value);
    setSeasonId(next);
    setDivisionId("all");
  };

  const aggregated: PokemonStat[] = useMemo(() => {
    const map = new Map<number, PokemonStat>();
    for (const g of stats) {
      if (seasonId !== "all" && g.seasonId !== seasonId) continue;
      if (divisionId !== "all" && g.divisionId !== divisionId) continue;

      const existing = map.get(g.id);
      if (existing) {
        existing.totalDamageDealt += g.totalDamageDealt;
        existing.totalDamageDealtIndirect += g.totalDamageDealtIndirect;
        existing.totalDamageTaken += g.totalDamageTaken;
        existing.totalDamageTakenIndirect += g.totalDamageTakenIndirect;
        existing.totalHpRestored += g.totalHpRestored;
        existing.gamesPlayed += g.gamesPlayed;
      } else {
        map.set(g.id, {
          id: g.id,
          name: g.name,
          displayName: g.displayName,
          spriteUrl: g.spriteUrl,
          totalDamageDealt: g.totalDamageDealt,
          totalDamageDealtIndirect: g.totalDamageDealtIndirect,
          totalDamageTaken: g.totalDamageTaken,
          totalDamageTakenIndirect: g.totalDamageTakenIndirect,
          totalHpRestored: g.totalHpRestored,
          gamesPlayed: g.gamesPlayed,
        });
      }
    }
    return Array.from(map.values());
  }, [stats, seasonId, divisionId]);

  const filtered = aggregated.filter((p) => p.gamesPlayed >= minGP);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wide font-bold">
            Season
          </label>
          <select
            value={seasonId}
            onChange={(e) => handleSeasonChange(e.target.value)}
            className="px-2 py-1 text-xs font-bold rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
          >
            <option value="all">All Seasons</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wide font-bold">
            Division
          </label>
          <select
            value={divisionId}
            onChange={(e) =>
              setDivisionId(e.target.value === "all" ? "all" : parseInt(e.target.value))
            }
            className="px-2 py-1 text-xs font-bold rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none disabled:opacity-50"
            disabled={divisionOptionCount === 0}
          >
            <option value="all">All Divisions</option>
            {divisionGroups.map((group) => (
              <optgroup key={group.id} label={group.label}>
                {group.divisions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wide font-bold">
            Min Games Played
          </label>
          <input
            type="number"
            min={1}
            max={99}
            value={minGP}
            onChange={(e) => setMinGP(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-14 px-2 py-1 text-xs font-bold text-center rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
          />
        </div>
      </div>

      {/* Stat Leaderboards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {(["dealt", "taken", "healed"] as Category[]).map((category) => {
        const config = CATEGORY_CONFIG[category];
        const sortKey = sorts[category];
        const sorted = [...filtered].sort(
          (a, b) => getSortValue(b, sortKey) - getSortValue(a, sortKey)
        );

        return (
          <div key={category} className="poke-card p-0 overflow-hidden">
            <div className="p-6 border-b-2 border-[var(--background-tertiary)]">
              <div className="flex items-center justify-between mb-4">
                <div className="section-title !mb-0">
                  <div
                    className={`section-title-icon ${config.iconBg}`}
                    style={{ boxShadow: config.iconShadow }}
                  >
                    <svg
                      className="w-5 h-5 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d={config.icon}
                      />
                    </svg>
                  </div>
                  <h3>{config.label}</h3>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {config.sorts.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() =>
                      setSorts((prev) => ({ ...prev, [category]: opt.key }))
                    }
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border-2 transition-colors ${
                      sortKey === opt.key
                        ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                        : "bg-[var(--background-secondary)] text-[var(--foreground-muted)] border-[var(--background-tertiary)] hover:border-[var(--primary)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-6 max-h-[500px] overflow-y-auto">
              {sorted.length === 0 ? (
                <p className="text-[var(--foreground-muted)] text-center py-8 text-sm">
                  No data yet
                </p>
              ) : (
                <div className="space-y-1">
                  {sorted.slice(0, 100).map((pkmn, index) => (
                    <Link
                      key={pkmn.id}
                      href={`/pokemon/${pkmn.id}`}
                      className="trainer-card group"
                    >
                      <div
                        className={`rank-badge w-8 h-8 text-xs shrink-0 ${
                          index === 0
                            ? "rank-1"
                            : index === 1
                            ? "rank-2"
                            : index === 2
                            ? "rank-3"
                            : "bg-[var(--background)] text-[var(--foreground-subtle)] border border-[var(--background-tertiary)]"
                        }`}
                      >
                        {index + 1}
                      </div>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {pkmn.spriteUrl ? (
                          <img
                            src={pkmn.spriteUrl}
                            alt={pkmn.displayName || pkmn.name}
                            className="w-8 h-8 object-contain"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded bg-[var(--background-tertiary)] flex items-center justify-center">
                            <span className="text-xs">?</span>
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="font-bold text-sm truncate block group-hover:text-[var(--primary)] transition-colors">
                            {pkmn.displayName || pkmn.name}
                          </span>
                          <span className="text-[10px] text-[var(--foreground-muted)]">
                            {getSecondaryInfo(pkmn, sortKey)}
                          </span>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-sm shrink-0" style={{ color: config.color }}>
                        {formatValue(pkmn, sortKey)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
      </div>

    </div>
  );
}
