"use client";

import Link from "next/link";

type PokemonKillEntry = {
  pokemonId: number;
  pokemonName: string;
  pokemonDisplayName: string | null;
  spriteUrl: string | null;
  kills: number;
  deaths: number;
  differential: number;
};

interface KillLeadersToggleProps {
  pokemonLeaderboard: PokemonKillEntry[];
  seasonId?: number;
}

export function KillLeadersToggle({
  pokemonLeaderboard,
  seasonId,
}: KillLeadersToggleProps) {
  return (
    <div className="poke-card p-6 flex flex-col">
      <div className="section-title">
        <div
          className="section-title-icon !bg-[var(--error)]"
          style={{ boxShadow: "0 4px 0 #991b1b" }}
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
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <h3>Kill Leaders</h3>
        {seasonId && (
          <Link
            href={`/seasons/${seasonId}/kill-leaders`}
            className="ml-auto flex items-center gap-1.5 text-xs text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors font-bold"
          >
            View All
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}
      </div>

      {/* Leaderboard */}
      <div className="space-y-2 flex-1 overflow-y-auto">
        {/* Pokemon Header Row */}
        <div className="flex items-center gap-3 px-2 pb-1 text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide border-b border-[var(--background-tertiary)]">
          <div className="w-8 shrink-0"></div>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-7 shrink-0"></div>
            <span>Pokemon</span>
          </div>
          <div className="flex items-center shrink-0">
            <span className="w-8 text-center">K</span>
            <span className="w-8 text-center">D</span>
            <span className="w-10 text-center">+/-</span>
          </div>
        </div>
        {pokemonLeaderboard.map((entry, index) => (
          <Link
            key={entry.pokemonId}
            href={`/pokemon/${entry.pokemonId}`}
            className="trainer-card group"
          >
            {/* Rank Badge */}
            <div
              className={`rank-badge shrink-0 ${
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

            {/* Pokemon Info */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {entry.spriteUrl ? (
                <div className="w-7 h-7 rounded bg-[var(--background-tertiary)] flex items-center justify-center overflow-hidden flex-shrink-0">
                  <img
                    src={entry.spriteUrl}
                    alt={entry.pokemonDisplayName || entry.pokemonName}
                    className="w-6 h-6 object-contain group-hover:scale-110 transition-transform"
                  />
                </div>
              ) : (
                <div className="w-7 h-7 rounded bg-[var(--background-tertiary)] flex items-center justify-center flex-shrink-0">
                  <span className="text-[var(--foreground-muted)] text-xs">
                    ?
                  </span>
                </div>
              )}
              <span className="font-bold text-sm text-[var(--foreground-muted)] group-hover:text-white transition-colors truncate">
                {entry.pokemonDisplayName || entry.pokemonName}
              </span>
            </div>

            {/* Stats */}
            <div className="flex items-center shrink-0 text-sm font-mono">
              <span className="font-bold text-[var(--success)] w-8 text-center">
                {entry.kills}
              </span>
              <span className="font-bold text-[var(--error)] w-8 text-center">
                {entry.deaths}
              </span>
              <span className="font-bold text-white w-10 text-center">
                {entry.differential > 0 ? "+" : ""}
                {entry.differential}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
