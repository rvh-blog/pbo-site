"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

interface PokemonStat {
  pokemonId: number;
  pokemonName: string;
  pokemonDisplayName: string;
  spriteUrl: string | null;
  types: string[] | null;
  kills: number;
  deaths: number;
  gamesPlayed: number;
  kd: number;
  killsPerGame: number;
  seasonsCount: number;
}

interface Season {
  id: number;
  name: string;
  seasonNumber: number;
}

interface PokemonStatsTableProps {
  pokemonStats: PokemonStat[];
  seasons: Season[];
  currentSeason: string;
  currentSort: string;
  currentOrder: string;
}

export function PokemonStatsTable({
  pokemonStats,
  seasons,
  currentSeason,
  currentSort,
  currentOrder,
}: PokemonStatsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateParams = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all" && key === "season") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleSort = (column: string) => {
    if (currentSort === column) {
      // Toggle order
      updateParams("order", currentOrder === "desc" ? "asc" : "desc");
    } else {
      const params = new URLSearchParams(searchParams.toString());
      params.set("sort", column);
      params.set("order", "desc");
      router.push(`${pathname}?${params.toString()}`);
    }
  };

  const SortHeader = ({ column, label, className = "" }: { column: string; label: string; className?: string }) => {
    const isActive = currentSort === column;
    return (
      <button
        onClick={() => handleSort(column)}
        className={`flex items-center gap-0.5 hover:text-white transition-colors ${
          isActive ? "text-[var(--primary)]" : ""
        } ${className}`}
      >
        {label}
        {isActive && (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {currentOrder === "desc" ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            )}
          </svg>
        )}
      </button>
    );
  };

  return (
    <div className="poke-card p-0 overflow-hidden">
      {/* Filters */}
      <div className="p-4 sm:p-6 border-b-2 border-[var(--background-tertiary)]">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
          {/* Season Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide">
              Season
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => updateParams("season", "all")}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                  currentSeason === "all"
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-white"
                }`}
              >
                All-Time
              </button>
              {seasons.map((season) => (
                <button
                  key={season.id}
                  onClick={() => updateParams("season", season.id.toString())}
                  className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                    currentSeason === season.id.toString()
                      ? "bg-[var(--primary)] text-white"
                      : "bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-white"
                  }`}
                >
                  <span className="sm:hidden">S{season.seasonNumber}</span>
                  <span className="hidden sm:inline">{season.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="p-4 sm:p-6">
        {pokemonStats.length === 0 ? (
          <p className="text-[var(--foreground-muted)] text-center py-8">
            No Pokemon stats found for this filter.
          </p>
        ) : (
          <>
            {/* Header Row */}
            <div className="hidden sm:flex items-center gap-3 px-3 pb-2 mb-2 border-b border-[var(--background-tertiary)] text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide">
              <div className="w-8 text-center shrink-0">#</div>
              <div className="w-8 shrink-0"></div>
              <div className="flex-1 min-w-0">
                <SortHeader column="name" label="Pokemon" />
              </div>
              <div className="w-12 text-center shrink-0">
                <SortHeader column="kills" label="Kills" className="justify-center w-full" />
              </div>
              <div className="w-12 text-center shrink-0">
                <SortHeader column="deaths" label="Deaths" className="justify-center w-full" />
              </div>
              <div className="w-12 text-center shrink-0">
                <SortHeader column="kd" label="K/D" className="justify-center w-full" />
              </div>
              <div className="w-10 text-center shrink-0">
                <SortHeader column="gp" label="GP" className="justify-center w-full" />
              </div>
              <div className="w-12 text-center shrink-0 hidden lg:block">
                <SortHeader column="kpg" label="K/GP" className="justify-center w-full" />
              </div>
              <div className="w-12 text-center shrink-0">
                <SortHeader column="drafted" label="Drafted" className="justify-center w-full" />
              </div>
            </div>

            {/* Mobile Header */}
            <div className="flex sm:hidden items-center gap-1.5 px-2 pb-2 mb-2 border-b border-[var(--background-tertiary)] text-[9px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide">
              <div className="w-5 shrink-0"></div>
              <div className="flex-1 min-w-0">Pokemon</div>
              <div className="w-7 text-center shrink-0">K</div>
              <div className="w-7 text-center shrink-0">D</div>
              <div className="w-9 text-center shrink-0">K/D</div>
              <div className="w-7 text-center shrink-0">GP</div>
              <div className="w-5 text-center shrink-0">Dr</div>
            </div>

            {/* Rows */}
            <div className="space-y-1">
              {pokemonStats.map((pkmn, index) => {
                const kdDisplay = pkmn.kd === Infinity ? "∞" : pkmn.kd.toFixed(2);
                const kpgDisplay = pkmn.killsPerGame.toFixed(2);

                return (
                  <Link
                    key={pkmn.pokemonId}
                    href={`/pokemon/${pkmn.pokemonId}`}
                    className="trainer-card gap-2 sm:gap-3 group"
                  >
                    {/* Desktop Row */}
                    <div className="hidden sm:flex items-center gap-3 w-full">
                      <div className={`rank-badge w-8 h-8 text-xs shrink-0 ${
                        index === 0 ? 'rank-1' :
                        index === 1 ? 'rank-2' :
                        index === 2 ? 'rank-3' :
                        'bg-[var(--background)] text-[var(--foreground-subtle)] border border-[var(--background-tertiary)]'
                      }`}>
                        {index + 1}
                      </div>
                      <div className="w-8 shrink-0">
                        {pkmn.spriteUrl ? (
                          <img
                            src={pkmn.spriteUrl}
                            alt={pkmn.pokemonDisplayName}
                            className="w-8 h-8 object-contain"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded bg-[var(--background-tertiary)] flex items-center justify-center">
                            <span className="text-xs">?</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-sm group-hover:text-[var(--primary)] transition-colors">
                          {pkmn.pokemonDisplayName}
                        </span>
                      </div>
                      <div className="w-12 text-center font-bold text-sm text-[var(--success)] shrink-0">
                        {pkmn.kills}
                      </div>
                      <div className="w-12 text-center font-bold text-sm text-[var(--error)] shrink-0">
                        {pkmn.deaths}
                      </div>
                      <div className="w-12 text-center text-sm text-[var(--foreground-muted)] shrink-0">
                        {kdDisplay}
                      </div>
                      <div className="w-10 text-center text-sm text-[var(--foreground-muted)] shrink-0">
                        {pkmn.gamesPlayed}
                      </div>
                      <div className="w-12 text-center text-sm text-[var(--foreground-muted)] shrink-0 hidden lg:block">
                        {kpgDisplay}
                      </div>
                      <div className="w-12 text-center text-sm text-[var(--foreground-muted)] shrink-0">
                        {pkmn.seasonsCount}x
                      </div>
                    </div>

                    {/* Mobile Row */}
                    <div className="flex sm:hidden items-center gap-1.5 w-full">
                      <div className={`rank-badge w-5 h-5 text-[10px] shrink-0 ${
                        index === 0 ? 'rank-1' :
                        index === 1 ? 'rank-2' :
                        index === 2 ? 'rank-3' :
                        'bg-[var(--background)] text-[var(--foreground-subtle)] border border-[var(--background-tertiary)]'
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {pkmn.spriteUrl && (
                          <img
                            src={pkmn.spriteUrl}
                            alt=""
                            className="w-5 h-5 object-contain shrink-0"
                          />
                        )}
                        <span className="font-bold text-xs truncate">{pkmn.pokemonDisplayName}</span>
                      </div>
                      <div className="w-7 text-center font-bold text-xs text-[var(--success)] shrink-0">
                        {pkmn.kills}
                      </div>
                      <div className="w-7 text-center font-bold text-xs text-[var(--error)] shrink-0">
                        {pkmn.deaths}
                      </div>
                      <div className="w-9 text-center text-[10px] text-[var(--foreground-muted)] shrink-0">
                        {pkmn.kd === Infinity ? "∞" : pkmn.kd.toFixed(1)}
                      </div>
                      <div className="w-7 text-center text-xs text-[var(--foreground-muted)] shrink-0">
                        {pkmn.gamesPlayed}
                      </div>
                      <div className="w-5 text-center text-xs text-[var(--foreground-muted)] shrink-0">
                        {pkmn.seasonsCount}x
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
