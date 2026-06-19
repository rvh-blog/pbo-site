import Link from "next/link";
import { db } from "@/lib/db";
import { moves, killEvents } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTypeColor } from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getMove(id: number) {
  return await db.query.moves.findFirst({
    where: eq(moves.id, id),
  });
}

async function getMoveKillStats(moveId: number) {
  const killEventsData = await db.query.killEvents.findMany({
    where: eq(killEvents.moveId, moveId),
    with: {
      killerPokemon: true,
      killerSeasonCoach: {
        with: {
          coach: true,
        },
      },
      match: {
        with: {
          division: {
            with: {
              season: true,
            },
          },
        },
      },
    },
  });

  return killEventsData;
}

export default async function MoveDetailPage({ params }: PageProps) {
  const resolvedParams = await params;
  const moveId = parseInt(resolvedParams.id);

  if (isNaN(moveId)) {
    notFound();
  }

  const [moveData, killEventsData] = await Promise.all([
    getMove(moveId),
    getMoveKillStats(moveId),
  ]);

  if (!moveData) {
    notFound();
  }

  // Aggregate stats
  const totalKills = killEventsData.length;

  // Aggregate by Pokemon
  const pokemonStatsMap = new Map<
    number,
    {
      pokemonId: number;
      pokemonName: string;
      pokemonDisplayName: string | null;
      spriteUrl: string | null;
      kills: number;
    }
  >();

  // Aggregate by Coach
  const coachStatsMap = new Map<
    number,
    {
      coachId: number;
      coachName: string;
      teamLogoUrl: string | null;
      kills: number;
    }
  >();

  // Track seasons this move has kills in
  const seasonSet = new Set<string>();
  const seasons: Array<{
    seasonId: number;
    seasonName: string;
    seasonNumber: number;
    kills: number;
  }> = [];
  const seasonKillsMap = new Map<number, number>();

  for (const event of killEventsData) {
    // Aggregate by Pokemon
    if (event.killerPokemonId && event.killerPokemon) {
      const pokemonId = event.killerPokemonId;
      const existing = pokemonStatsMap.get(pokemonId);
      if (existing) {
        existing.kills += 1;
      } else {
        pokemonStatsMap.set(pokemonId, {
          pokemonId,
          pokemonName: event.killerPokemon.name,
          pokemonDisplayName: event.killerPokemon.displayName,
          spriteUrl: event.killerPokemon.spriteUrl,
          kills: 1,
        });
      }
    }

    // Aggregate by Coach
    if (event.killerSeasonCoach?.coach) {
      const coachId = event.killerSeasonCoach.coach.id;
      const existing = coachStatsMap.get(coachId);
      if (existing) {
        existing.kills += 1;
      } else {
        coachStatsMap.set(coachId, {
          coachId,
          coachName: event.killerSeasonCoach.coach.name,
          teamLogoUrl: event.killerSeasonCoach.teamLogoUrl,
          kills: 1,
        });
      }
    }

    // Track seasons
    const seasonId = event.match?.division?.season?.id;
    if (seasonId) {
      seasonKillsMap.set(seasonId, (seasonKillsMap.get(seasonId) || 0) + 1);
      const key = `${seasonId}`;
      if (!seasonSet.has(key)) {
        seasonSet.add(key);
        seasons.push({
          seasonId,
          seasonName: event.match?.division?.season?.name || "Unknown",
          seasonNumber: event.match?.division?.season?.seasonNumber || 0,
          kills: 0,
        });
      }
    }
  }

  // Update season kills
  for (const season of seasons) {
    season.kills = seasonKillsMap.get(season.seasonId) || 0;
  }

  // Sort seasons by number descending
  seasons.sort((a, b) => b.seasonNumber - a.seasonNumber);

  // Get top Pokemon sorted by kills
  const topPokemon = Array.from(pokemonStatsMap.values())
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 10);

  // Get top Coaches sorted by kills
  const topCoaches = Array.from(coachStatsMap.values())
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 10);

  // Damage class display
  const damageClassDisplay = moveData.damageClass
    ? moveData.damageClass.charAt(0).toUpperCase() + moveData.damageClass.slice(1)
    : null;

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="poke-card p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          {/* Move Info */}
          <div className="flex-1">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 mb-2 text-sm">
              <Link
                href="/leaderboards"
                className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors"
              >
                Leaderboards
              </Link>
              <span className="text-[var(--foreground-subtle)]">/</span>
              <span className="text-[var(--foreground-subtle)]">Moves</span>
            </div>

            {/* Name */}
            <h1 className="font-pixel text-2xl md:text-3xl text-white leading-relaxed">
              {moveData.displayName || moveData.name}
            </h1>

            {/* Type & Class */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {moveData.type && (
                <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${getTypeColor(moveData.type)}`}>
                  {moveData.type}
                </span>
              )}
              {damageClassDisplay && (
                <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                  moveData.damageClass === "physical"
                    ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                    : moveData.damageClass === "special"
                      ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                      : "bg-gray-500/20 text-gray-400 border border-gray-500/30"
                }`}>
                  {damageClassDisplay}
                </span>
              )}
              {moveData.priority !== null && moveData.priority !== 0 && (
                <span className={`px-2 py-1 rounded text-xs font-bold ${
                  moveData.priority > 0
                    ? "bg-[var(--success)]/20 text-[var(--success)] border border-[var(--success)]/30"
                    : "bg-[var(--error)]/20 text-[var(--error)] border border-[var(--error)]/30"
                }`}>
                  Priority {moveData.priority > 0 ? "+" : ""}{moveData.priority}
                </span>
              )}
            </div>

            {/* Power / Accuracy / PP */}
            <div className="flex items-center gap-4 mt-3 text-sm">
              {moveData.power && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--foreground-muted)]">Power</span>
                  <span className="font-bold text-white">{moveData.power}</span>
                </div>
              )}
              {moveData.accuracy && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--foreground-muted)]">Acc</span>
                  <span className="font-bold text-white">{moveData.accuracy}%</span>
                </div>
              )}
              {moveData.pp && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--foreground-muted)]">PP</span>
                  <span className="font-bold text-white">{moveData.pp}</span>
                </div>
              )}
            </div>

            {/* Effect Description */}
            {moveData.effectDescription && (
              <p className="text-sm text-[var(--foreground-muted)] mt-3 max-w-xl">
                {moveData.effectDescription}
              </p>
            )}
          </div>

          {/* Total Kills - Prominent Display */}
          <div className="text-center sm:text-right shrink-0">
            <p className="text-4xl sm:text-5xl font-black text-[var(--success)]">{totalKills}</p>
            <p className="text-xs uppercase tracking-wide text-[var(--foreground-muted)] mt-1">Total Kills</p>
          </div>
        </div>
      </div>

      {/* Top Pokemon & Top Coaches Grid */}
      {(topPokemon.length > 0 || topCoaches.length > 0) && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Top Pokemon */}
          {topPokemon.length > 0 && (
            <div className="poke-card p-0 overflow-hidden">
              <div className="p-4 sm:p-6 border-b-2 border-[var(--background-tertiary)]">
                <div className="section-title !mb-0">
                  <div className="section-title-icon !bg-[var(--error)]" style={{ boxShadow: '0 4px 0 #991b1b' }}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3>Top Pokemon</h3>
                </div>
              </div>
              <div className="p-3 sm:p-6">
                {/* Header Row */}
                <div className="hidden sm:flex items-center gap-2 px-3 pb-2 mb-2 border-b border-[var(--background-tertiary)] text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide">
                  <div className="w-6 shrink-0"></div>
                  <div className="flex items-center gap-2 flex-1 min-w-0">Pokemon</div>
                  <div className="w-16 text-center shrink-0">Kills</div>
                </div>
                <div className="space-y-1">
                  {topPokemon.map((pokemon, index) => (
                    <Link
                      key={pokemon.pokemonId}
                      href={`/pokemon/${pokemon.pokemonId}`}
                      className="trainer-card group"
                    >
                      <div className={`rank-badge text-xs shrink-0 ${
                        index === 0 ? 'rank-1' :
                        index === 1 ? 'rank-2' :
                        index === 2 ? 'rank-3' :
                        'bg-[var(--background)] text-[var(--foreground-subtle)] border border-[var(--background-tertiary)]'
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {pokemon.spriteUrl ? (
                          <div className="w-7 h-7 rounded bg-[var(--background-tertiary)] flex items-center justify-center overflow-hidden shrink-0">
                            <img
                              src={pokemon.spriteUrl}
                              alt={pokemon.pokemonDisplayName || pokemon.pokemonName}
                              className="w-6 h-6 object-contain group-hover:scale-110 transition-transform"
                            />
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded bg-[var(--background-tertiary)] flex items-center justify-center shrink-0">
                            <span className="text-[var(--foreground-muted)] text-xs">?</span>
                          </div>
                        )}
                        <span className="font-bold text-sm truncate group-hover:text-[var(--primary)] transition-colors">
                          {pokemon.pokemonDisplayName || pokemon.pokemonName}
                        </span>
                      </div>
                      <div className="w-16 text-center text-sm font-mono font-bold text-[var(--success)] shrink-0">
                        {pokemon.kills}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Top Coaches */}
          {topCoaches.length > 0 && (
            <div className="poke-card p-0 overflow-hidden">
              <div className="p-4 sm:p-6 border-b-2 border-[var(--background-tertiary)]">
                <div className="section-title !mb-0">
                  <div className="section-title-icon !bg-[var(--accent)]" style={{ boxShadow: '0 4px 0 #a16207' }}>
                    <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <h3>Top Coaches</h3>
                </div>
              </div>
              <div className="p-3 sm:p-6">
                {/* Header Row */}
                <div className="hidden sm:flex items-center gap-2 px-3 pb-2 mb-2 border-b border-[var(--background-tertiary)] text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide">
                  <div className="w-6 shrink-0"></div>
                  <div className="flex items-center gap-2 flex-1 min-w-0">Coach</div>
                  <div className="w-16 text-center shrink-0">Kills</div>
                </div>
                <div className="space-y-1">
                  {topCoaches.map((coach, index) => (
                    <Link
                      key={coach.coachId}
                      href={`/coaches/${coach.coachId}`}
                      className="trainer-card group"
                    >
                      <div className={`rank-badge text-xs shrink-0 ${
                        index === 0 ? 'rank-1' :
                        index === 1 ? 'rank-2' :
                        index === 2 ? 'rank-3' :
                        'bg-[var(--background)] text-[var(--foreground-subtle)] border border-[var(--background-tertiary)]'
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {coach.teamLogoUrl ? (
                          <img
                            src={coach.teamLogoUrl}
                            alt={coach.coachName}
                            className="w-7 h-7 object-contain rounded shrink-0"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded bg-gradient-to-br from-[var(--primary)] to-[var(--gradient-end)] flex items-center justify-center shrink-0">
                            <span className="text-white text-[10px] font-bold">
                              {coach.coachName.substring(0, 2).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <span className="font-bold text-sm truncate group-hover:text-[var(--primary)] transition-colors">
                          {coach.coachName}
                        </span>
                      </div>
                      <div className="w-16 text-center text-sm font-mono font-bold text-[var(--success)] shrink-0">
                        {coach.kills}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Season Breakdown */}
      {seasons.length > 0 && (
        <div className="poke-card p-0 overflow-hidden">
          <div className="p-4 sm:p-6 border-b-2 border-[var(--background-tertiary)]">
            <div className="section-title !mb-0">
              <div className="section-title-icon">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3>Kills by Season</h3>
            </div>
          </div>
          <div className="p-3 sm:p-6">
            <div className="flex flex-wrap gap-2">
              {seasons.map((season) => (
                <Link
                  key={season.seasonId}
                  href={`/seasons/${season.seasonId}`}
                  className="px-3 py-2 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] hover:border-[var(--primary)] transition-colors text-sm"
                >
                  <span className="text-[var(--foreground-muted)]">{season.seasonName}</span>
                  <span className="mx-2 text-[var(--foreground-subtle)]">|</span>
                  <span className="font-bold text-[var(--success)]">{season.kills} kills</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {totalKills === 0 && (
        <div className="poke-card p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--background-secondary)] flex items-center justify-center">
            <svg className="w-8 h-8 text-[var(--foreground-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="font-bold text-lg mb-2">No Kill Data</h3>
          <p className="text-[var(--foreground-muted)]">
            This move hasn&apos;t recorded any kills yet.
          </p>
        </div>
      )}
    </div>
  );
}
