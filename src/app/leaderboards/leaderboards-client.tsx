"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";

interface Coach {
  id: number;
  name: string;
}

interface TopEloCoach {
  coach: Coach;
  teamName: string;
  teamLogoUrl: string | null;
  elo: number;
  wins: number;
  losses: number;
}

interface CoachStat {
  id: number;
  name: string;
  elo: number;
  wins: number;
  losses: number;
  gamesPlayed: number;
  winRate: number;
  championships: number;
}

interface PokemonStat {
  id: number;
  name: string;
  displayName?: string | null;
  spriteUrl: string | null;
  kills: number;
  deaths: number;
  differential: number;
  wins: number;
  losses: number;
  gamesPlayed: number;
  winRate: number;
  championships: number;
}

interface MostLovedPair {
  coachId: number;
  coachName: string;
  teamLogoUrl: string | null;
  pokemonId: number;
  pokemonName: string;
  pokemonDisplayName: string | null;
  pokemonSpriteUrl: string | null;
  draftCount: number;
}

type CoachSortKey = "elo" | "wins" | "winRate" | "gamesPlayed" | "championships";
type PokemonSortKey = "kills" | "differential" | "winRate" | "gamesPlayed" | "championships";

interface LeaderboardsClientProps {
  topEloCoach: TopEloCoach | null;
  coachStats: CoachStat[];
  pokemonStats: PokemonStat[];
  mostLovedPairs: MostLovedPair[];
  rowBgData: Record<number, { color: string }>;
  rowBorderData: Record<number, { color: string }>;
}

// Liquid metal row wrapper with mouse tracking
function LiquidMetalWrapper({
  children,
  bgColor,
  borderColor,
  hasBg,
  hasBorder
}: {
  children: React.ReactNode;
  bgColor?: string;
  borderColor?: string;
  hasBg: boolean;
  hasBorder: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !hasBg) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty("--mouse-x", `${x}%`);
      el.style.setProperty("--mouse-y", `${y}%`);
    };

    el.addEventListener("mousemove", handleMouseMove);

    return () => {
      el.removeEventListener("mousemove", handleMouseMove);
    };
  }, [hasBg]);

  return (
    <div
      ref={ref}
      className={`rounded-lg ${hasBg ? 'row-background' : ''} ${hasBorder ? 'row-border' : ''}`}
      style={{
        ...(hasBg ? { "--row-bg-color": bgColor, "--mouse-x": "50%", "--mouse-y": "50%" } : {}),
        ...(hasBorder ? { "--row-border-color": borderColor } : {}),
      } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

export function LeaderboardsClient({ topEloCoach, coachStats, pokemonStats, mostLovedPairs, rowBgData, rowBorderData }: LeaderboardsClientProps) {
  const [coachSort, setCoachSort] = useState<CoachSortKey>("elo");
  const [pokemonSort, setPokemonSort] = useState<PokemonSortKey>("kills");
  const [coachMinGP, setCoachMinGP] = useState(5);
  const [pokemonMinGP, setPokemonMinGP] = useState(5);

  const filteredCoachStats = coachSort === "winRate"
    ? coachStats.filter(c => c.gamesPlayed >= coachMinGP)
    : coachStats;
  const sortedCoaches = [...filteredCoachStats].sort((a, b) => {
    switch (coachSort) {
      case "elo":
        // Secondary: least games played
        return b.elo - a.elo || a.gamesPlayed - b.gamesPlayed;
      case "wins":
        // Secondary: least games played
        return b.wins - a.wins || a.gamesPlayed - b.gamesPlayed;
      case "winRate":
        // Secondary: most games played
        return b.winRate - a.winRate || b.gamesPlayed - a.gamesPlayed;
      case "gamesPlayed":
        return b.gamesPlayed - a.gamesPlayed;
      case "championships":
        // Secondary: most wins
        return b.championships - a.championships || b.wins - a.wins;
      default:
        return 0;
    }
  });

  const filteredPokemonStats = pokemonSort === "winRate"
    ? pokemonStats.filter(p => p.gamesPlayed >= pokemonMinGP)
    : pokemonStats;
  const sortedPokemon = [...filteredPokemonStats].sort((a, b) => {
    switch (pokemonSort) {
      case "kills":
        // Secondary: least games played
        return b.kills - a.kills || a.gamesPlayed - b.gamesPlayed;
      case "differential":
        // Secondary: least games played
        return b.differential - a.differential || a.gamesPlayed - b.gamesPlayed;
      case "winRate":
        // Secondary: most games played
        return b.winRate - a.winRate || b.gamesPlayed - a.gamesPlayed;
      case "gamesPlayed":
        return b.gamesPlayed - a.gamesPlayed;
      case "championships":
        // Secondary: most games played (for tiebreaker)
        return b.championships - a.championships || b.gamesPlayed - a.gamesPlayed;
      default:
        return 0;
    }
  });

  const coachSortOptions: { key: CoachSortKey; label: string }[] = [
    { key: "elo", label: "ELO" },
    { key: "wins", label: "Wins" },
    { key: "winRate", label: "Win %" },
    { key: "gamesPlayed", label: "Games" },
    { key: "championships", label: "Champs" },
  ];

  const pokemonSortOptions: { key: PokemonSortKey; label: string }[] = [
    { key: "kills", label: "Kills" },
    { key: "differential", label: "Diff" },
    { key: "winRate", label: "Win %" },
    { key: "gamesPlayed", label: "Games" },
    { key: "championships", label: "Champs" },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="poke-card p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="font-pixel text-xl md:text-2xl text-white leading-relaxed">
              Leaderboards
            </h1>
            <p className="text-sm text-[var(--foreground-muted)] mt-1">
              All-time rankings and statistics
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/battle-record"
                className="rounded-lg border-2 border-sky-300/35 bg-sky-300/5 px-4 py-3 text-center text-xs font-bold uppercase tracking-widest text-sky-200 transition-colors hover:border-sky-200 hover:bg-sky-300/15 hover:text-white sm:min-w-36"
              >
                Coach Records
              </Link>
              <Link
                href="/battle-record?tab=pbo-records"
                className="rounded-lg border-2 border-sky-300/35 bg-sky-300/5 px-4 py-3 text-center text-xs font-bold uppercase tracking-widest text-sky-200 transition-colors hover:border-sky-200 hover:bg-sky-300/15 hover:text-white sm:min-w-36"
              >
                PBO Records
              </Link>
            </div>
            <div className="flex items-center justify-center gap-2 rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 py-2">
              <svg className="w-4 h-4 text-[var(--accent)]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
              </svg>
              <span className="text-sm font-bold">{coachStats.length} Coaches</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top Rated Coach Spotlight */}
      {topEloCoach && (
        <div id="pokemon-all-time" className="poke-card p-0 overflow-hidden scroll-mt-24">
          <div className="p-6 border-b-2 border-[var(--background-tertiary)] bg-[var(--accent)]/10">
            <div className="section-title !mb-0">
              <div className="section-title-icon !bg-[var(--accent)]" style={{ boxShadow: '0 4px 0 #b45309' }}>
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                </svg>
              </div>
              <div>
                <h3>Top Rated Coach</h3>
                <p className="text-xs text-[var(--foreground-muted)] font-normal">Highest All-Time ELO</p>
              </div>
            </div>
          </div>
          <div className="p-6">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <Link href={`/coaches/${topEloCoach.coach.id}`} className="flex-shrink-0 group">
                {topEloCoach.teamLogoUrl ? (
                  <img
                    src={topEloCoach.teamLogoUrl}
                    alt={topEloCoach.teamName}
                    className="w-20 h-20 rounded-lg border-2 border-[var(--background-tertiary)] group-hover:scale-105 transition-transform object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-light)] flex items-center justify-center border-2 border-[var(--background-tertiary)] group-hover:scale-105 transition-transform">
                    <span className="text-black text-3xl font-black">
                      {topEloCoach.coach.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </Link>
              <div className="text-center md:text-left flex-1">
                <Link href={`/coaches/${topEloCoach.coach.id}`}>
                  <h2 className="text-2xl font-bold hover:text-[var(--primary)] transition-colors">
                    {topEloCoach.coach.name}
                  </h2>
                </Link>
                <p className="text-[var(--foreground-muted)]">{topEloCoach.teamName}</p>
              </div>
              <div className="flex gap-4">
                <div className="text-center px-4 py-2 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)]">
                  <p className="text-2xl font-bold tabular-nums text-[var(--accent)]">
                    {topEloCoach.elo}
                  </p>
                  <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wide">
                    ELO Rating
                  </p>
                </div>
                <div className="text-center px-4 py-2 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)]">
                  <p className="text-2xl font-bold tabular-nums text-[var(--success)]">
                    {topEloCoach.wins}-{topEloCoach.losses}
                  </p>
                  <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wide">
                    All-Time Record
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Coach Rankings */}
        <div id="coach-rankings" className="poke-card p-0 overflow-hidden scroll-mt-24">
          <div className="p-6 border-b-2 border-[var(--background-tertiary)]">
            <div className="flex items-center justify-between mb-4">
              <div className="section-title !mb-0">
                <div className="section-title-icon !bg-[var(--accent)]" style={{ boxShadow: '0 4px 0 #b45309' }}>
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                  </svg>
                </div>
                <h3>Coach Rankings</h3>
              </div>
            </div>
            {/* Sort Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {coachSortOptions.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setCoachSort(opt.key)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg border-2 transition-colors ${
                    coachSort === opt.key
                      ? "bg-[var(--accent)] text-black border-[var(--accent)]"
                      : "bg-[var(--background-secondary)] text-[var(--foreground-muted)] border-[var(--background-tertiary)] hover:border-[var(--accent)]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              <Link
                href="/coaches/stats"
                className="px-3 py-1.5 text-xs font-bold rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] text-[var(--primary)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary-hover)]"
              >
                Fun Facts
              </Link>
              {coachSort === "winRate" && (
                <div className="flex items-center gap-1.5 ml-auto">
                  <label className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wide font-bold whitespace-nowrap">
                    Min GP
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={coachMinGP}
                    onChange={(e) => setCoachMinGP(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-14 px-2 py-1 text-xs font-bold text-center rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>
              )}
            </div>
          </div>
          <div className="p-6 max-h-[500px] overflow-y-auto">
            {sortedCoaches.length === 0 ? (
              <p className="text-[var(--foreground-muted)] text-center py-8 text-sm">No data yet</p>
            ) : (
              <>
                {/* Header Row */}
                <div className="flex items-center gap-3 px-2 pb-3 mb-3 border-b border-[var(--background-tertiary)] text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide">
                  <div className="w-6"></div>
                  <div className="flex-1">Coach</div>
                  <div className="w-20 text-right">
                    {coachSort === "elo" && "ELO"}
                    {coachSort === "wins" && "Wins"}
                    {coachSort === "winRate" && "Win %"}
                    {coachSort === "gamesPlayed" && "Games"}
                    {coachSort === "championships" && "Champs"}
                  </div>
                </div>
                <div className="space-y-1">
                  {sortedCoaches.map((coach, index) => {
                    const hasBg = !!rowBgData[coach.id];
                    return (
                    <LiquidMetalWrapper
                      key={coach.id}
                      hasBg={hasBg}
                      hasBorder={!!rowBorderData[coach.id]}
                      bgColor={rowBgData[coach.id]?.color}
                      borderColor={rowBorderData[coach.id]?.color}
                    >
                    <Link
                      href={`/coaches/${coach.id}`}
                      className="trainer-card group"
                    >
                      <div
                        className={`rank-badge flex-shrink-0 text-xs ${
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
                      <div className="flex-1 min-w-0">
                        <p className={`font-bold text-sm group-hover:text-[var(--primary)] transition-colors truncate ${hasBg ? 'text-white' : ''}`}>
                          {coach.name}
                        </p>
                        <p className={`text-xs ${hasBg ? 'text-[var(--foreground)]' : 'text-[var(--foreground-muted)]'}`}>
                          {coach.wins}W - {coach.losses}L ({coach.winRate.toFixed(0)}%)
                        </p>
                      </div>
                      <div className="w-20 text-right">
                        {coachSort === "elo" && (
                          <span
                            className={`font-bold tabular-nums ${
                              coach.elo >= 1100
                                ? "text-[var(--success)]"
                                : coach.elo <= 900
                                ? "text-[var(--error)]"
                                : "text-[var(--accent)]"
                            }`}
                          >
                            {Math.round(coach.elo)}
                          </span>
                        )}
                        {coachSort === "wins" && (
                          <span className="font-bold tabular-nums text-[var(--success)]">{coach.wins}</span>
                        )}
                        {coachSort === "winRate" && (
                          <span className="font-bold tabular-nums text-[var(--accent)]">{coach.winRate.toFixed(1)}%</span>
                        )}
                        {coachSort === "gamesPlayed" && (
                          <span className="font-bold tabular-nums">{coach.gamesPlayed}</span>
                        )}
                        {coachSort === "championships" && (
                          <span className="font-bold tabular-nums text-[var(--accent)]">{coach.championships}</span>
                        )}
                      </div>
                    </Link>
                    </LiquidMetalWrapper>
                  );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Pokemon Leaderboard */}
        <div id="ride-or-die" className="poke-card p-0 overflow-hidden scroll-mt-24">
          <div className="p-6 border-b-2 border-[var(--background-tertiary)]">
            <div className="flex items-center justify-between mb-4">
              <div className="section-title !mb-0">
                <div className="section-title-icon !bg-[var(--error)]" style={{ boxShadow: '0 4px 0 #991b1b' }}>
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h3>Pokemon All-Time</h3>
                  <p className="text-xs font-normal text-[var(--foreground-muted)]">
                    Default rank is total kills, with fewer games as the tiebreaker.
                  </p>
                </div>
              </div>
              <Link
                href="/pokemon/stats"
                className="flex items-center gap-1.5 text-xs text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors font-bold"
              >
                More Stats
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
            {/* Sort Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {pokemonSortOptions.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setPokemonSort(opt.key)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg border-2 transition-colors ${
                    pokemonSort === opt.key
                      ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                      : "bg-[var(--background-secondary)] text-[var(--foreground-muted)] border-[var(--background-tertiary)] hover:border-[var(--primary)]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              <Link
                href="/pokemon/stats/fun-facts"
                className="px-3 py-1.5 text-xs font-bold rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] text-[var(--primary)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary-hover)]"
              >
                Fun Facts
              </Link>
              {pokemonSort === "winRate" && (
                <div className="flex items-center gap-1.5 ml-auto">
                  <label className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wide font-bold whitespace-nowrap">
                    Min GP
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={pokemonMinGP}
                    onChange={(e) => setPokemonMinGP(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-14 px-2 py-1 text-xs font-bold text-center rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none"
                  />
                </div>
              )}
            </div>
          </div>
          <div className="p-6 max-h-[500px] overflow-y-auto">
            {sortedPokemon.length === 0 ? (
              <p className="text-[var(--foreground-muted)] text-center py-8 text-sm">No data yet</p>
            ) : (
              <>
                {/* Header Row */}
                <div className="flex items-center gap-3 px-2 pb-3 mb-3 border-b border-[var(--background-tertiary)] text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide">
                  <div className="w-6"></div>
                  <div className="w-8"></div>
                  <div className="flex-1">Pokemon</div>
                  <div className="w-16 text-right">
                    {pokemonSort === "kills" && "Kills"}
                    {pokemonSort === "differential" && "Diff"}
                    {pokemonSort === "winRate" && "Win %"}
                    {pokemonSort === "gamesPlayed" && "Games"}
                    {pokemonSort === "championships" && "Champs"}
                  </div>
                </div>
                <div className="space-y-1">
                  {sortedPokemon.slice(0, 50).map((pokemon, index) => (
                    <Link
                      key={pokemon.id}
                      href={`/pokemon/${pokemon.id}`}
                      className="trainer-card group"
                    >
                      <div
                        className={`rank-badge flex-shrink-0 text-xs ${
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
                      <div className="w-8 h-8 flex-shrink-0">
                        {pokemon.spriteUrl ? (
                          <img
                            src={pokemon.spriteUrl}
                            alt={pokemon.displayName || pokemon.name}
                            className="w-8 h-8 object-contain"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded bg-[var(--background-tertiary)] flex items-center justify-center">
                            <span className="text-xs">?</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{pokemon.displayName || pokemon.name}</p>
                        <p className="text-xs text-[var(--foreground-muted)]">
                          {pokemon.kills}K / {pokemon.deaths}D ({pokemon.gamesPlayed} GP)
                        </p>
                      </div>
                      <div className="w-16 text-right">
                        {pokemonSort === "kills" && (
                          <span className="font-bold tabular-nums text-[var(--success)]">{pokemon.kills}</span>
                        )}
                        {pokemonSort === "differential" && (
                          <span
                            className={`font-bold tabular-nums ${
                              pokemon.differential > 0
                                ? "text-[var(--success)]"
                                : pokemon.differential < 0
                                ? "text-[var(--error)]"
                                : ""
                            }`}
                          >
                            {pokemon.differential > 0 ? "+" : ""}
                            {pokemon.differential}
                          </span>
                        )}
                        {pokemonSort === "winRate" && (
                          <span className="font-bold tabular-nums text-[var(--accent)]">{pokemon.winRate.toFixed(1)}%</span>
                        )}
                        {pokemonSort === "gamesPlayed" && (
                          <span className="font-bold tabular-nums">{pokemon.gamesPlayed}</span>
                        )}
                        {pokemonSort === "championships" && (
                          <span className="font-bold tabular-nums text-[var(--accent)]">{pokemon.championships}</span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Most Loved Section */}
      {mostLovedPairs.length > 0 && (
        <div className="poke-card p-0 overflow-hidden">
          <div className="p-4 sm:p-6 border-b-2 border-[var(--background-tertiary)]">
            <div className="section-title !mb-0">
              <div className="section-title-icon !bg-[#ec4899]" style={{ boxShadow: '0 4px 0 #9d174d' }}>
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <h3>Ride or Die</h3>
            </div>
            <p className="text-[var(--foreground-muted)] text-xs sm:text-sm mt-2">
              Coaches who just can&apos;t let go
            </p>
          </div>
          <div className="p-3 sm:p-6">
            {/* Header Row - hidden on mobile */}
            <div className="hidden sm:flex items-center gap-2 px-3 pb-2 mb-2 border-b border-[var(--background-tertiary)] text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide">
              <div className="w-6 shrink-0"></div>
              <div className="flex-1">Coach + Pokemon</div>
              <div className="w-24 text-right">Times Drafted</div>
            </div>
            <div className="max-h-[360px] space-y-1 overflow-y-auto pr-1">
              {mostLovedPairs.map((pair, index) => (
                <div
                  key={`${pair.coachId}-${pair.pokemonId}`}
                  className="trainer-card"
                >
                  <div
                    className={`rank-badge flex-shrink-0 text-xs ${
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
                  {/* Mobile layout: stacked with icons between */}
                  <div className="flex-1 min-w-0 sm:hidden">
                    <div className="flex items-center gap-1.5">
                      {pair.teamLogoUrl ? (
                        <img
                          src={pair.teamLogoUrl}
                          alt={pair.coachName}
                          className="w-4 h-4 object-contain rounded shrink-0"
                        />
                      ) : (
                        <div className="w-4 h-4 rounded bg-gradient-to-br from-[var(--primary)] to-[var(--gradient-end)] flex items-center justify-center shrink-0">
                          <span className="text-white text-[6px] font-bold">
                            {pair.coachName.substring(0, 2).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <Link href={`/coaches/${pair.coachId}`} className="font-bold text-xs hover:text-[var(--primary)] transition-colors truncate">
                        {pair.coachName}
                      </Link>
                      <svg className="w-3 h-3 text-[#ec4899] shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                      {pair.pokemonSpriteUrl ? (
                        <img
                          src={pair.pokemonSpriteUrl}
                          alt={pair.pokemonDisplayName || pair.pokemonName}
                          className="w-4 h-4 object-contain shrink-0"
                        />
                      ) : (
                        <div className="w-4 h-4 rounded bg-[var(--background-tertiary)] flex items-center justify-center shrink-0">
                          <span className="text-[8px]">?</span>
                        </div>
                      )}
                      <Link href={`/pokemon/${pair.pokemonId}`} className="font-bold text-xs hover:text-[var(--primary)] transition-colors truncate">
                        {pair.pokemonDisplayName || pair.pokemonName}
                      </Link>
                    </div>
                  </div>
                  {/* Desktop layout: inline with icons at end */}
                  <div className="hidden sm:flex items-center gap-2 flex-1 min-w-0">
                    <Link href={`/coaches/${pair.coachId}`} className="font-bold text-sm hover:text-[var(--primary)] transition-colors truncate">
                      {pair.coachName}
                    </Link>
                    <span className="text-[var(--foreground-muted)]">+</span>
                    <Link href={`/pokemon/${pair.pokemonId}`} className="font-bold text-sm hover:text-[var(--primary)] transition-colors truncate">
                      {pair.pokemonDisplayName || pair.pokemonName}
                    </Link>
                    <div className="flex items-center gap-1 ml-1">
                      {pair.teamLogoUrl ? (
                        <img
                          src={pair.teamLogoUrl}
                          alt={pair.coachName}
                          className="w-5 h-5 object-contain rounded"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded bg-gradient-to-br from-[var(--primary)] to-[var(--gradient-end)] flex items-center justify-center">
                          <span className="text-white text-[7px] font-bold">
                            {pair.coachName.substring(0, 2).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <svg className="w-3.5 h-3.5 text-[#ec4899]" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                      {pair.pokemonSpriteUrl ? (
                        <img
                          src={pair.pokemonSpriteUrl}
                          alt={pair.pokemonDisplayName || pair.pokemonName}
                          className="w-5 h-5 object-contain"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded bg-[var(--background-tertiary)] flex items-center justify-center">
                          <span className="text-[10px]">?</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="w-8 sm:w-24 text-right shrink-0">
                    <span className="font-bold tabular-nums text-[#ec4899] text-xs sm:text-base">{pair.draftCount}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
