"use client";

import { useState } from "react";

interface PokemonData {
  id: number;
  pokemon: {
    name: string;
    displayName?: string | null;
    spriteUrl?: string | null;
  } | null;
  kills: number | null;
  deaths: number | null;
  damageDealt: number | null;
  damageDealtIndirect: number | null;
  damageTaken: number | null;
  damageTakenIndirect: number | null;
  hpRestored: number | null;
}

interface ExpandablePokemonCardProps {
  pokemon: PokemonData;
  teamColor?: string;
}

export function ExpandablePokemonCard({ pokemon, teamColor }: ExpandablePokemonCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isDead = (pokemon.deaths || 0) > 0;

  // Check if there's any damage data to show
  const hasDamageData =
    pokemon.damageDealt !== null ||
    pokemon.damageDealtIndirect !== null ||
    pokemon.damageTaken !== null ||
    pokemon.damageTakenIndirect !== null ||
    pokemon.hpRestored !== null;

  return (
    <div
      className="rounded bg-[var(--background-tertiary)] overflow-hidden transition-all"
      style={{ borderLeft: teamColor ? `3px solid ${teamColor}` : undefined }}
    >
      {/* Main row - always visible */}
      <button
        onClick={() => hasDamageData && setIsExpanded(!isExpanded)}
        disabled={!hasDamageData}
        className={`w-full flex items-center justify-between px-3 py-2 ${
          hasDamageData ? "cursor-pointer hover:bg-white/5" : "cursor-default"
        }`}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {pokemon.pokemon?.spriteUrl ? (
            <img
              src={pokemon.pokemon.spriteUrl}
              alt={pokemon.pokemon.displayName || pokemon.pokemon.name}
              className={`w-7 h-7 sm:w-8 sm:h-8 object-contain shrink-0 ${isDead ? "grayscale opacity-50" : ""}`}
            />
          ) : (
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded bg-[var(--background-secondary)] flex items-center justify-center shrink-0">
              <span className="text-xs">?</span>
            </div>
          )}
          <span className={`font-medium text-xs sm:text-sm truncate text-left ${isDead ? "line-through opacity-50" : "text-white"}`}>
            {pokemon.pokemon?.displayName || pokemon.pokemon?.name}
          </span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 font-mono text-xs sm:text-sm">
            <span className="text-[var(--success)] font-bold">{pokemon.kills || 0} K</span>
            <span className="text-[var(--error)] font-bold">{pokemon.deaths || 0} D</span>
          </div>
          {hasDamageData && (
            <svg
              className={`w-4 h-4 text-[var(--foreground-muted)] transition-transform ${isExpanded ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && hasDamageData && (() => {
        const directDealt = pokemon.damageDealt ?? 0;
        const indirectDealt = pokemon.damageDealtIndirect ?? 0;
        const totalDealt = directDealt + indirectDealt;
        const directTaken = pokemon.damageTaken ?? 0;
        const indirectTaken = pokemon.damageTakenIndirect ?? 0;
        const totalTaken = directTaken + indirectTaken;
        const hpRestored = pokemon.hpRestored ?? 0;

        return (
          <div className="px-3 pb-3 pt-2 border-t border-[var(--background-secondary)]">
            <div className="grid grid-cols-2 gap-4 text-xs">
              {/* Damage Dealt Column */}
              <div className="space-y-1.5">
                <div className="text-[var(--foreground-muted)] text-[10px] uppercase font-bold tracking-wide">
                  Damage Dealt
                </div>
                <div className="space-y-0.5 pl-2 border-l-2 border-[var(--accent)]/30">
                  <div className="flex justify-between">
                    <span className="text-[var(--foreground-muted)]">Direct</span>
                    <span className="text-[var(--accent)] font-bold">{directDealt}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--foreground-muted)]">Indirect</span>
                    <span className="text-[var(--foreground-subtle)]">{indirectDealt}%</span>
                  </div>
                  <div className="flex justify-between pt-0.5 border-t border-[var(--background-secondary)]">
                    <span className="text-[var(--foreground)] font-medium">Total</span>
                    <span className="text-[var(--accent)] font-bold">{totalDealt}%</span>
                  </div>
                </div>
              </div>

              {/* Damage Taken Column */}
              <div className="space-y-1.5">
                <div className="text-[var(--foreground-muted)] text-[10px] uppercase font-bold tracking-wide">
                  Damage Taken
                </div>
                <div className="space-y-0.5 pl-2 border-l-2 border-[var(--error)]/30">
                  <div className="flex justify-between">
                    <span className="text-[var(--foreground-muted)]">Direct</span>
                    <span className="text-[var(--error)] font-bold">{directTaken}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--foreground-muted)]">Indirect</span>
                    <span className="text-[var(--foreground-subtle)]">{indirectTaken}%</span>
                  </div>
                  <div className="flex justify-between pt-0.5 border-t border-[var(--background-secondary)]">
                    <span className="text-[var(--foreground)] font-medium">Total</span>
                    <span className="text-[var(--error)] font-bold">{totalTaken}%</span>
                  </div>
                </div>
              </div>

              {/* HP Restored - only show if > 0 */}
              {hpRestored > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[var(--foreground-muted)] text-[10px] uppercase font-bold tracking-wide">
                    HP Restored
                  </div>
                  <div className="pl-2 border-l-2 border-[var(--success)]/30">
                    <span className="text-[var(--success)] font-bold">{hpRestored}%</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
