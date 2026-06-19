"use client";

import { getTypeColor } from "@/lib/utils";

interface Pokemon {
  id: number;
  name: string;
  displayName?: string | null;
  spriteUrl: string | null;
  hp: number | null;
  attack: number | null;
  defense: number | null;
  specialAttack: number | null;
  specialDefense: number | null;
  speed: number | null;
  types: string[] | null;
}

interface RosterEntry {
  id: number;
  price: number;
  isTeraCaptain: boolean | null;
  pokemon: Pokemon | null;
}

interface DroppedPokemon {
  id: number;
  name: string;
  displayName?: string | null;
  spriteUrl: string | null;
  types: string[] | null;
  speed: number | null;
  isTeraCaptain?: boolean;
}

interface Team {
  teamName: string;
  teamAbbreviation: string | null;
  rosters: RosterEntry[];
  droppedPokemon?: DroppedPokemon[];
}

interface PriceInfo {
  basePrice: number;
  teraCaptainCost: number | null;
}

interface MatchPreviewProps {
  team1: Team;
  team2: Team;
  priceMap?: Map<number, PriceInfo>;
}

function RosterCard({
  roster,
  teamName,
  priceMap,
  droppedPokemon
}: {
  roster: RosterEntry[];
  teamName: string;
  priceMap?: Map<number, PriceInfo>;
  droppedPokemon?: DroppedPokemon[];
}) {
  // Sort by price descending
  const sortedRoster = [...roster].sort((a, b) => b.price - a.price);

  return (
    <div className="poke-card p-3 sm:p-4">
      <h4 className="font-pixel text-[10px] sm:text-xs text-center mb-3 sm:mb-4 text-white">
        {teamName}
      </h4>
      <div className="grid grid-cols-3 gap-1 sm:gap-2">
        {sortedRoster.map((r) => {
          const priceInfo = r.pokemon?.id ? priceMap?.get(r.pokemon.id) : undefined;
          const basePrice = priceInfo?.basePrice ?? r.price;
          const teraCost = priceInfo?.teraCaptainCost;

          return (
            <div
              key={r.id}
              className={`relative p-1.5 sm:p-2 rounded-lg bg-[var(--background-secondary)] border-2 transition-all ${
                r.isTeraCaptain
                  ? "border-[var(--accent)]"
                  : "border-[var(--background-tertiary)]"
              }`}
            >
              {/* Tera Captain Badge */}
              {r.isTeraCaptain && (
                <div className="absolute -top-1.5 -right-1.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[var(--accent)] flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-black" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2L2 12l10 10 10-10L12 2z" />
                  </svg>
                </div>
              )}
              <div className="flex flex-col items-center text-center">
                {r.pokemon?.spriteUrl ? (
                  <img
                    src={r.pokemon.spriteUrl}
                    alt={r.pokemon.displayName || r.pokemon.name}
                    className="w-10 h-10 sm:w-14 sm:h-14 object-contain"
                  />
                ) : (
                  <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-lg bg-[var(--background-tertiary)] flex items-center justify-center">
                    <span className="text-base sm:text-xl">?</span>
                  </div>
                )}
                <p className="font-bold text-[10px] sm:text-xs mt-0.5 sm:mt-1 truncate w-full leading-tight">{r.pokemon?.displayName || r.pokemon?.name}</p>
                {/* Type badges */}
                {r.pokemon?.types && r.pokemon.types.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5 sm:mt-1">
                    {r.pokemon.types.map((type) => (
                      <span
                        key={type}
                        className={`px-1 sm:px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-bold uppercase ${getTypeColor(type)}`}
                      >
                        {type.slice(0, 3)}
                      </span>
                    ))}
                  </div>
                )}
                {/* Price with tera captain bonus */}
                <p className="text-[10px] sm:text-xs text-[var(--accent)] font-bold mt-0.5 sm:mt-1">
                  {r.isTeraCaptain && teraCost != null ? (
                    <>{basePrice} + {teraCost} pts</>
                  ) : (
                    <>{r.price} pts</>
                  )}
                </p>
              </div>
            </div>
          );
        })}
        {/* Dropped Pokemon (will be dropped in future week) */}
        {droppedPokemon?.map((p) => {
          const priceInfo = priceMap?.get(p.id);
          const basePrice = priceInfo?.basePrice ?? 0;
          const teraCost = priceInfo?.teraCaptainCost;

          return (
            <div
              key={`dropped-${p.id}`}
              className={`relative p-1.5 sm:p-2 rounded-lg bg-[var(--background-secondary)] border-2 transition-all ${
                p.isTeraCaptain
                  ? "border-[var(--accent)]"
                  : "border-[var(--background-tertiary)]"
              }`}
            >
              {/* Tera Captain Badge */}
              {p.isTeraCaptain && (
                <div className="absolute -top-1.5 -right-1.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[var(--accent)] flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-black" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2L2 12l10 10 10-10L12 2z" />
                  </svg>
                </div>
              )}
              <div className="flex flex-col items-center text-center">
                {p.spriteUrl ? (
                  <img
                    src={p.spriteUrl}
                    alt={p.displayName || p.name}
                    className="w-10 h-10 sm:w-14 sm:h-14 object-contain"
                  />
                ) : (
                  <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-lg bg-[var(--background-tertiary)] flex items-center justify-center">
                    <span className="text-base sm:text-xl">?</span>
                  </div>
                )}
                <p className="font-bold text-[10px] sm:text-xs mt-0.5 sm:mt-1 truncate w-full leading-tight">{p.displayName || p.name}</p>
                {p.types && p.types.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5 sm:mt-1">
                    {p.types.map((type) => (
                      <span
                        key={type}
                        className={`px-1 sm:px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-bold uppercase ${getTypeColor(type)}`}
                      >
                        {type.slice(0, 3)}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-[10px] sm:text-xs text-[var(--accent)] font-bold mt-0.5 sm:mt-1">
                  {p.isTeraCaptain && teraCost != null ? (
                    <>{basePrice} + {teraCost} pts</>
                  ) : (
                    <>{basePrice} pts</>
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SpeedComparison({ team1Roster, team2Roster, team1Dropped, team2Dropped }: {
  team1Roster: RosterEntry[];
  team2Roster: RosterEntry[];
  team1Dropped?: DroppedPokemon[];
  team2Dropped?: DroppedPokemon[];
}) {
  // Combine roster Pokemon with dropped Pokemon for speed comparison
  const team1Pokemon = [
    ...team1Roster.map(r => ({
      name: r.pokemon?.name || '',
      displayName: r.pokemon?.displayName,
      spriteUrl: r.pokemon?.spriteUrl || null,
      speed: r.pokemon?.speed || 0,
    })),
    ...(team1Dropped || []).map(p => ({
      name: p.name,
      displayName: p.displayName,
      spriteUrl: p.spriteUrl,
      speed: p.speed || 0,
    })),
  ].sort((a, b) => b.speed - a.speed);

  const team2Pokemon = [
    ...team2Roster.map(r => ({
      name: r.pokemon?.name || '',
      displayName: r.pokemon?.displayName,
      spriteUrl: r.pokemon?.spriteUrl || null,
      speed: r.pokemon?.speed || 0,
    })),
    ...(team2Dropped || []).map(p => ({
      name: p.name,
      displayName: p.displayName,
      spriteUrl: p.spriteUrl,
      speed: p.speed || 0,
    })),
  ].sort((a, b) => b.speed - a.speed);

  const maxLength = Math.max(team1Pokemon.length, team2Pokemon.length);

  // Mobile: horizontal layout with two rows
  // Desktop: vertical layout with side-by-side comparison
  return (
    <div className="poke-card p-2 sm:p-3">
      <h4 className="font-pixel text-[9px] sm:text-[10px] text-center mb-2 sm:mb-3 text-[var(--accent)]">
        Speed Tiers
      </h4>

      {/* Mobile: Horizontal rows for each team */}
      <div className="lg:hidden space-y-2">
        {/* Team 1 row */}
        <div className="flex justify-center gap-1 flex-wrap">
          {team1Pokemon.map((p, idx) => (
            <div key={idx} className="flex flex-col items-center">
              <div className="w-7 h-7">
                {p.spriteUrl ? (
                  <img src={p.spriteUrl} alt={p.name} className="w-7 h-7 object-contain" />
                ) : (
                  <span className="text-[var(--foreground-muted)] text-[10px]">?</span>
                )}
              </div>
              <span className="text-[9px] font-bold font-mono tabular-nums text-[var(--foreground-muted)]">
                {p.speed}
              </span>
            </div>
          ))}
        </div>
        {/* Divider */}
        <div className="h-px bg-[var(--background-tertiary)]" />
        {/* Team 2 row - flipped: numbers on top, sprites below */}
        <div className="flex justify-center gap-1 flex-wrap">
          {team2Pokemon.map((p, idx) => (
            <div key={idx} className="flex flex-col items-center">
              <span className="text-[9px] font-bold font-mono tabular-nums text-[var(--foreground-muted)]">
                {p.speed}
              </span>
              <div className="w-7 h-7">
                {p.spriteUrl ? (
                  <img src={p.spriteUrl} alt={p.name} className="w-7 h-7 object-contain" />
                ) : (
                  <span className="text-[var(--foreground-muted)] text-[10px]">?</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Desktop: Vertical side-by-side comparison */}
      <div className="hidden lg:block space-y-0">
        {Array.from({ length: maxLength }).map((_, index) => {
          const p1 = team1Pokemon[index];
          const p2 = team2Pokemon[index];
          const speed1 = p1?.speed || 0;
          const speed2 = p2?.speed || 0;

          return (
            <div
              key={index}
              className="flex items-center justify-center gap-1.5 py-1 px-1 rounded hover:bg-[var(--background-secondary)] transition-colors"
            >
              <div className="w-8 h-8 flex items-center justify-center">
                {p1?.spriteUrl ? (
                  <img src={p1.spriteUrl} alt={p1.name} className="w-8 h-8 object-contain" />
                ) : p1 ? (
                  <span className="text-[var(--foreground-muted)] text-xs">?</span>
                ) : (
                  <span className="text-[var(--foreground-muted)] text-xs">-</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold font-mono tabular-nums w-8 text-right">
                  {p1 ? speed1 : "-"}
                </span>
                <div className="w-px h-5 bg-[var(--background-tertiary)]" />
                <span className="text-sm font-bold font-mono tabular-nums w-8 text-left">
                  {p2 ? speed2 : "-"}
                </span>
              </div>
              <div className="w-8 h-8 flex items-center justify-center">
                {p2?.spriteUrl ? (
                  <img src={p2.spriteUrl} alt={p2.name} className="w-8 h-8 object-contain" />
                ) : p2 ? (
                  <span className="text-[var(--foreground-muted)] text-xs">?</span>
                ) : (
                  <span className="text-[var(--foreground-muted)] text-xs">-</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MatchPreview({ team1, team2, priceMap }: MatchPreviewProps) {
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Mobile Layout: Team1 -> Speed -> Team2 stacked */}
        <div className="lg:hidden space-y-3">
          <RosterCard
            roster={team1.rosters}
            teamName={team1.teamAbbreviation || team1.teamName}
            priceMap={priceMap}
            droppedPokemon={team1.droppedPokemon}
          />
          <SpeedComparison
            team1Roster={team1.rosters}
            team2Roster={team2.rosters}
            team1Dropped={team1.droppedPokemon}
            team2Dropped={team2.droppedPokemon}
          />
          <RosterCard
            roster={team2.rosters}
            teamName={team2.teamAbbreviation || team2.teamName}
            priceMap={priceMap}
            droppedPokemon={team2.droppedPokemon}
          />
        </div>

        {/* Desktop Layout: Team1 | Speed | Team2 side by side */}
        <div className="hidden lg:grid lg:grid-cols-[5fr_2fr_5fr] gap-4">
          <RosterCard
            roster={team1.rosters}
            teamName={team1.teamAbbreviation || team1.teamName}
            priceMap={priceMap}
            droppedPokemon={team1.droppedPokemon}
          />
          <SpeedComparison
            team1Roster={team1.rosters}
            team2Roster={team2.rosters}
            team1Dropped={team1.droppedPokemon}
            team2Dropped={team2.droppedPokemon}
          />
          <RosterCard
            roster={team2.rosters}
            teamName={team2.teamAbbreviation || team2.teamName}
            priceMap={priceMap}
            droppedPokemon={team2.droppedPokemon}
          />
      </div>
    </div>
  );
}
