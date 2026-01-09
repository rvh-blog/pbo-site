"use client";

import Link from "next/link";
import { useState } from "react";

interface Coach {
  id: number;
  name: string;
}

interface TopEloCoach {
  coach: Coach;
  teamName: string;
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
}

type CoachSortKey = "elo" | "wins" | "winRate" | "gamesPlayed";
type PokemonSortKey = "kills" | "differential" | "winRate" | "gamesPlayed";

interface LeaderboardsClientProps {
  topEloCoach: TopEloCoach | null;
  coachStats: CoachStat[];
  pokemonStats: PokemonStat[];
}

export function LeaderboardsClient({ topEloCoach, coachStats, pokemonStats }: LeaderboardsClientProps) {
  const [coachSort, setCoachSort] = useState<CoachSortKey>("elo");
  const [pokemonSort, setPokemonSort] = useState<PokemonSortKey>("kills");

  const sortedCoaches = [...coachStats].sort((a, b) => {
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
      default:
        return 0;
    }
  });

  const sortedPokemon = [...pokemonStats].sort((a, b) => {
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
      default:
        return 0;
    }
  });

  const coachSortOptions: { key: CoachSortKey; label: string }[] = [
    { key: "elo", label: "ELO" },
    { key: "wins", label: "Wins" },
    { key: "winRate", label: "Win %" },
    { key: "gamesPlayed", label: "Games" },
  ];

  const pokemonSortOptions: { key: PokemonSortKey; label: string }[] = [
    { key: "kills", label: "Kills" },
    { key: "differential", label: "Diff" },
    { key: "winRate", label: "Win %" },
    { key: "gamesPlayed", label: "Games" },
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
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)]">
            <svg className="w-4 h-4 text-[var(--accent)]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </svg>
            <span className="text-sm font-bold">{coachStats.length} Coaches</span>
          </div>
        </div>
      </div>

      {/* Top Rated Coach Spotlight */}
      {topEloCoach && (
        <div className="poke-card p-0 overflow-hidden">
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
                <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-light)] flex items-center justify-center border-2 border-[var(--background-tertiary)] group-hover:scale-105 transition-transform">
                  <span className="text-black text-3xl font-black">
                    {topEloCoach.coach.name.charAt(0).toUpperCase()}
                  </span>
                </div>
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
        <div className="poke-card p-0 overflow-hidden">
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
            <div className="flex flex-wrap gap-2">
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
                  </div>
                </div>
                <div className="space-y-1">
                  {sortedCoaches.map((coach, index) => (
                    <Link
                      key={coach.id}
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
                        <p className="font-bold text-sm group-hover:text-[var(--primary)] transition-colors truncate">
                          {coach.name}
                        </p>
                        <p className="text-xs text-[var(--foreground-muted)]">
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
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Pokemon Leaderboard */}
        <div className="poke-card p-0 overflow-hidden">
          <div className="p-6 border-b-2 border-[var(--background-tertiary)]">
            <div className="flex items-center justify-between mb-4">
              <div className="section-title !mb-0">
                <div className="section-title-icon !bg-[var(--error)]" style={{ boxShadow: '0 4px 0 #991b1b' }}>
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3>Pokemon All-Time</h3>
              </div>
            </div>
            {/* Sort Buttons */}
            <div className="flex flex-wrap gap-2">
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
                  </div>
                </div>
                <div className="space-y-1">
                  {sortedPokemon.slice(0, 50).map((pokemon, index) => (
                    <div
                      key={pokemon.id}
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
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
