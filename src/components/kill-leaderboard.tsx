"use client";

import { useState } from "react";
import Link from "next/link";

interface KillEntry {
  pokemonId: number;
  pokemonName: string;
  pokemonDisplayName: string | null;
  spriteUrl: string | null;
  kills: number;
  deaths: number;
  gamesPlayed: number;
  teamAbbreviation: string | null;
  differential: number;
}

type FilterType = "combined" | "regular" | "playoffs";

export function KillLeaderboard({
  combined,
  regular,
  playoffs,
  hasPlayoffs,
  divisionColor,
  divisionShadow,
}: {
  combined: KillEntry[];
  regular: KillEntry[];
  playoffs: KillEntry[];
  hasPlayoffs: boolean;
  divisionColor: string;
  divisionShadow: string;
}) {
  const [filter, setFilter] = useState<FilterType>(hasPlayoffs ? "combined" : "regular");

  const leaderboard = filter === "combined" ? combined : filter === "regular" ? regular : playoffs;

  return (
    <div className="poke-card p-4 sm:p-6 flex flex-col h-full">
      <div className="section-title !mb-4 !flex-col !items-start sm:!flex-row sm:!items-center sm:!justify-between !gap-3 sm:!gap-2">
        <div className="flex items-center gap-2">
          <div className="section-title-icon" style={{ background: divisionColor, boxShadow: `0 4px 0 ${divisionShadow}` }}>
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3>Kill Leaders</h3>
        </div>
        {hasPlayoffs && (
          <div className="flex gap-1.5">
            {(["combined", "regular", "playoffs"] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded transition-colors ${
                  filter === f
                    ? "text-white"
                    : "bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-white"
                }`}
                style={filter === f ? { backgroundColor: divisionColor } : undefined}
              >
                {f === "combined" ? "All" : f === "regular" ? "Regular" : "Playoffs"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mb-3 h-[2px] shrink-0 rounded-full" style={{ background: `linear-gradient(to right, ${divisionColor}, ${divisionColor}20)` }} />
      {leaderboard.length === 0 ? (
        <p className="text-[var(--foreground-muted)] text-center py-6 text-sm">
          No battle data yet
        </p>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto space-y-2">
            <div className="flex items-center gap-2 sm:gap-3 px-2 pb-1 text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide border-b border-[var(--background-tertiary)]">
              <div className="w-5 sm:w-8 shrink-0"></div>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-6 sm:w-7 shrink-0"></div>
                <span>Pokemon</span>
              </div>
              <div className="flex items-center shrink-0">
                <span className="w-6 sm:w-8 text-center">K</span>
                <span className="w-6 sm:w-8 text-center">D</span>
                <span className="w-7 sm:w-10 text-center">+/-</span>
                <span className="w-6 sm:w-8 text-center">GP</span>
              </div>
            </div>
            {leaderboard.map((entry, index) => (
              <Link key={`${entry.pokemonId}-${index}`} href={`/pokemon/${entry.pokemonId}`} className="trainer-card gap-2 sm:gap-3 group">
                <div className={`rank-badge w-5 h-5 sm:w-8 sm:h-8 text-[10px] sm:text-sm ${
                  index === 0 ? 'rank-1' :
                  index === 1 ? 'rank-2' :
                  index === 2 ? 'rank-3' :
                  'bg-[var(--background)] text-[var(--foreground-subtle)] border border-[var(--background-tertiary)]'
                }`}>
                  {index + 1}
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {entry.spriteUrl ? (
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded bg-[var(--background-tertiary)] flex items-center justify-center overflow-hidden flex-shrink-0">
                      <img
                        src={entry.spriteUrl}
                        alt={entry.pokemonDisplayName || entry.pokemonName}
                        className="w-5 h-5 sm:w-6 sm:h-6 object-contain group-hover:scale-110 transition-transform"
                      />
                    </div>
                  ) : (
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded bg-[var(--background-tertiary)] flex items-center justify-center flex-shrink-0">
                      <span className="text-[var(--foreground-muted)] text-xs">?</span>
                    </div>
                  )}
                  <span className="font-bold text-xs sm:text-sm text-[var(--foreground-muted)] group-hover:text-white transition-colors truncate">
                    {entry.pokemonDisplayName || entry.pokemonName}
                    {entry.teamAbbreviation && (
                      <span className="font-normal text-[var(--foreground-subtle)]">
                        <span className="mx-1.5 inline-block w-px h-3 bg-current opacity-30 align-middle" />
                        <span className="text-[10px] sm:text-xs">{entry.teamAbbreviation}</span>
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center shrink-0 text-xs sm:text-sm font-mono">
                  <span className="font-bold text-[var(--success)] w-6 sm:w-8 text-center">{entry.kills}</span>
                  <span className="font-bold text-[var(--error)] w-6 sm:w-8 text-center">{entry.deaths}</span>
                  <span className="font-bold text-white w-7 sm:w-10 text-center">
                    {entry.differential > 0 ? "+" : ""}{entry.differential}
                  </span>
                  <span className="text-[var(--foreground-muted)] w-6 sm:w-8 text-center">{entry.gamesPlayed}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
