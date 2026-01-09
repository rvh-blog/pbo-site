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

interface Team {
  teamName: string;
  teamAbbreviation: string | null;
  rosters: RosterEntry[];
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
  priceMap
}: {
  roster: RosterEntry[];
  teamName: string;
  priceMap?: Map<number, PriceInfo>;
}) {
  // Sort by price descending
  const sortedRoster = [...roster].sort((a, b) => b.price - a.price);

  return (
    <div className="poke-card p-4">
      <h4 className="font-pixel text-xs text-center mb-4 text-white">
        {teamName}
      </h4>
      <div className="grid grid-cols-3 gap-2">
        {sortedRoster.map((r) => {
          const priceInfo = r.pokemon?.id ? priceMap?.get(r.pokemon.id) : undefined;
          const basePrice = priceInfo?.basePrice ?? r.price;
          const teraCost = priceInfo?.teraCaptainCost;

          return (
            <div
              key={r.id}
              className={`relative p-2 rounded-lg bg-[var(--background-secondary)] border-2 transition-all ${
                r.isTeraCaptain
                  ? "border-[var(--accent)]"
                  : "border-[var(--background-tertiary)]"
              }`}
            >
              {/* Tera Captain Badge */}
              {r.isTeraCaptain && (
                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center">
                  <svg className="w-3 h-3 text-black" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2L2 12l10 10 10-10L12 2z" />
                  </svg>
                </div>
              )}
              <div className="flex flex-col items-center text-center">
                {r.pokemon?.spriteUrl ? (
                  <img
                    src={r.pokemon.spriteUrl}
                    alt={r.pokemon.displayName || r.pokemon.name}
                    className="w-14 h-14 object-contain"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-[var(--background-tertiary)] flex items-center justify-center">
                    <span className="text-xl">?</span>
                  </div>
                )}
                <p className="font-bold text-xs mt-1 truncate w-full leading-tight">{r.pokemon?.displayName || r.pokemon?.name}</p>
                {/* Type badges */}
                {r.pokemon?.types && r.pokemon.types.length > 0 && (
                  <div className="flex gap-0.5 mt-1">
                    {r.pokemon.types.map((type) => (
                      <span
                        key={type}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${getTypeColor(type)}`}
                      >
                        {type.slice(0, 3)}
                      </span>
                    ))}
                  </div>
                )}
                {/* Price with tera captain bonus */}
                <p className="text-xs text-[var(--accent)] font-bold mt-1">
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
      </div>
    </div>
  );
}

function SpeedComparison({ team1Roster, team2Roster }: { team1Roster: RosterEntry[]; team2Roster: RosterEntry[] }) {
  // Sort both rosters by speed
  const sorted1 = [...team1Roster].sort(
    (a, b) => (b.pokemon?.speed || 0) - (a.pokemon?.speed || 0)
  );
  const sorted2 = [...team2Roster].sort(
    (a, b) => (b.pokemon?.speed || 0) - (a.pokemon?.speed || 0)
  );

  const maxLength = Math.max(sorted1.length, sorted2.length);

  return (
    <div className="poke-card p-3">
      <h4 className="font-pixel text-[10px] text-center mb-3 text-[var(--accent)]">
        Speed Tiers
      </h4>
      <div className="space-y-0.5">
        {Array.from({ length: maxLength }).map((_, index) => {
          const p1 = sorted1[index]?.pokemon;
          const p2 = sorted2[index]?.pokemon;
          const speed1 = p1?.speed || 0;
          const speed2 = p2?.speed || 0;

          return (
            <div
              key={index}
              className="flex items-center justify-center gap-1.5 py-1 px-1 rounded hover:bg-[var(--background-secondary)] transition-colors"
            >
              {/* Team 1 Sprite */}
              <div className="w-8 h-8 flex items-center justify-center">
                {p1?.spriteUrl ? (
                  <img src={p1.spriteUrl} alt={p1.name} className="w-8 h-8 object-contain" />
                ) : (
                  <span className="text-[var(--foreground-muted)] text-xs">-</span>
                )}
              </div>

              {/* Speed numbers in middle */}
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold font-mono tabular-nums w-8 text-right">
                  {p1 ? speed1 : "-"}
                </span>
                <div className="w-px h-5 bg-[var(--background-tertiary)]" />
                <span className="text-sm font-bold font-mono tabular-nums w-8 text-left">
                  {p2 ? speed2 : "-"}
                </span>
              </div>

              {/* Team 2 Sprite */}
              <div className="w-8 h-8 flex items-center justify-center">
                {p2?.spriteUrl ? (
                  <img src={p2.spriteUrl} alt={p2.name} className="w-8 h-8 object-contain" />
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
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[5fr_2fr_5fr] gap-4">
        {/* Team 1 Full Roster */}
        <RosterCard roster={team1.rosters} teamName={team1.teamAbbreviation || team1.teamName} priceMap={priceMap} />

        {/* Speed Comparison in Middle */}
        <SpeedComparison team1Roster={team1.rosters} team2Roster={team2.rosters} />

        {/* Team 2 Full Roster */}
        <RosterCard roster={team2.rosters} teamName={team2.teamAbbreviation || team2.teamName} priceMap={priceMap} />
      </div>
    </div>
  );
}
