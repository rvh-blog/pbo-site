import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { coaches, eloHistory, seasonCoaches, matches, rosters, seasonPokemonPrices, matchPokemon, transactions, pokemon } from "@/lib/schema";
import { eq, desc, and, inArray, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTransactionCounts } from "@/lib/transaction-service";
import { getTypeColor } from "@/lib/utils";
import { CopyTeamButton } from "@/components/copy-team-button";
import { SeasonSelector } from "@/components/season-selector";

// Helper to format week display (handles playoff rounds)
function formatWeekDisplay(week: number): string {
  if (week === 101) return "Quarterfinals";
  if (week === 102) return "Semifinals";
  if (week === 103) return "Finals";
  return `Week ${week}`;
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sc?: string }>;
}

async function getCoach(id: number) {
  return await db.query.coaches.findFirst({
    where: eq(coaches.id, id),
  });
}

async function getCoachEloHistory(coachId: number) {
  return await db.query.eloHistory.findMany({
    where: eq(eloHistory.coachId, coachId),
    orderBy: [desc(eloHistory.recordedAt)],
    limit: 20,
  });
}

async function getCoachSeasons(coachId: number) {
  const seasons = await db.query.seasonCoaches.findMany({
    where: eq(seasonCoaches.coachId, coachId),
    with: {
      division: {
        with: {
          season: true,
        },
      },
      rosters: {
        with: {
          pokemon: true,
        },
      },
    },
  });

  // Sort by season number descending (most recent first)
  return seasons.sort((a, b) => {
    const seasonA = a.division?.season?.seasonNumber ?? 0;
    const seasonB = b.division?.season?.seasonNumber ?? 0;
    return seasonB - seasonA;
  });
}

async function getCoachMatches(seasonCoachIds: number[]) {
  if (seasonCoachIds.length === 0) return [];

  const allMatches = await db.query.matches.findMany({
    with: {
      coach1: { with: { coach: true } },
      coach2: { with: { coach: true } },
      division: { with: { season: true } },
    },
  });

  const relevantMatches = allMatches.filter(
    (m) =>
      seasonCoachIds.includes(m.coach1SeasonId) ||
      seasonCoachIds.includes(m.coach2SeasonId)
  );

  // Sort by season number (highest first), then by week (highest first)
  return relevantMatches.sort((a, b) => {
    // By season number descending (higher = more recent)
    const aSeasonNum = a.division?.season?.seasonNumber || 0;
    const bSeasonNum = b.division?.season?.seasonNumber || 0;
    if (bSeasonNum !== aSeasonNum) return bSeasonNum - aSeasonNum;

    // Within same season, higher week = more recent
    return (b.week || 0) - (a.week || 0);
  });
}

async function getSeasonPokemonPrices(seasonId: number) {
  return await db.query.seasonPokemonPrices.findMany({
    where: eq(seasonPokemonPrices.seasonId, seasonId),
  });
}

async function getCoachMatchPokemon(seasonCoachIds: number[]) {
  if (seasonCoachIds.length === 0) return [];

  return await db.query.matchPokemon.findMany({
    where: inArray(matchPokemon.seasonCoachId, seasonCoachIds),
    with: {
      pokemon: true,
    },
  });
}

async function getOpponentMatchPokemon(matchIds: number[], seasonCoachIds: number[]) {
  if (matchIds.length === 0) return [];

  // Get all matchPokemon from the coach's matches
  const allMatchPokemon = await db.query.matchPokemon.findMany({
    where: inArray(matchPokemon.matchId, matchIds),
    with: {
      pokemon: true,
    },
  });

  // Filter to only opponent's Pokemon (not the coach's)
  return allMatchPokemon.filter(mp => !seasonCoachIds.includes(mp.seasonCoachId));
}

async function getCoachTransactions(seasonCoachIds: number[]) {
  if (seasonCoachIds.length === 0) return [];

  const allTxs = await db.query.transactions.findMany({
    orderBy: [desc(transactions.createdAt)],
  });

  // Filter to transactions involving any of this coach's season entries
  const relevantTxs = allTxs.filter(
    (tx) =>
      seasonCoachIds.includes(tx.seasonCoachId) ||
      (tx.tradingPartnerSeasonCoachId && seasonCoachIds.includes(tx.tradingPartnerSeasonCoachId))
  );

  // Enhance with Pokemon details
  const enhancedTxs = await Promise.all(
    relevantTxs.map(async (tx) => {
      const pokemonInIds = (tx.pokemonIn as number[]) || [];
      const pokemonOutIds = (tx.pokemonOut as number[]) || [];

      const pokemonInDetails = pokemonInIds.length > 0
        ? await db.query.pokemon.findMany({
            where: or(...pokemonInIds.map((id) => eq(pokemon.id, id))),
          })
        : [];

      const pokemonOutDetails = pokemonOutIds.length > 0
        ? await db.query.pokemon.findMany({
            where: or(...pokemonOutIds.map((id) => eq(pokemon.id, id))),
          })
        : [];

      const newTC = tx.newTeraCaptainId
        ? await db.query.pokemon.findFirst({ where: eq(pokemon.id, tx.newTeraCaptainId) })
        : null;

      const oldTC = tx.oldTeraCaptainId
        ? await db.query.pokemon.findFirst({ where: eq(pokemon.id, tx.oldTeraCaptainId) })
        : null;

      return {
        ...tx,
        pokemonInDetails,
        pokemonOutDetails,
        newTeraCaptainDetails: newTC,
        oldTeraCaptainDetails: oldTC,
      };
    })
  );

  return enhancedTxs;
}

export default async function CoachProfilePage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const coachId = parseInt(resolvedParams.id);
  const coach = await getCoach(coachId);

  if (!coach) {
    notFound();
  }

  const eloHistoryData = await getCoachEloHistory(coachId);
  const coachSeasons = await getCoachSeasons(coachId);
  const seasonCoachIds = coachSeasons.map((sc) => sc.id);
  const coachMatches = await getCoachMatches(seasonCoachIds);
  const coachMatchPokemon = await getCoachMatchPokemon(seasonCoachIds);
  const coachTransactions = await getCoachTransactions(seasonCoachIds);

  // Get opponent Pokemon data for nemesis stats
  const matchIds = coachMatches.map((m) => m.id);
  const opponentMatchPokemon = await getOpponentMatchPokemon(matchIds, seasonCoachIds);

  // Get most recent season entry (for header display - logo, team name)
  const mostRecentSeasonEntry = coachSeasons[0];

  // Also check if they're in the current season specifically
  const currentSeasonEntry = coachSeasons.find(
    (sc) => sc.division?.season?.isCurrent
  );

  // Determine selected season entry (from URL param or default to current/most recent)
  const selectedSeasonCoachId = resolvedSearchParams.sc
    ? parseInt(resolvedSearchParams.sc)
    : currentSeasonEntry?.id || coachSeasons[0]?.id;

  const selectedSeasonEntry = coachSeasons.find(
    (sc) => sc.id === selectedSeasonCoachId
  ) || coachSeasons[0];

  // Get transaction counts for selected season
  const txCounts = selectedSeasonEntry
    ? await getTransactionCounts(selectedSeasonEntry.id)
    : null;

  // Filter transactions to only show selected season
  const selectedSeasonTransactions = coachTransactions.filter(
    (tx: any) =>
      tx.seasonCoachId === selectedSeasonCoachId ||
      tx.tradingPartnerSeasonCoachId === selectedSeasonCoachId
  );

  // Build season options for the selector
  const seasonOptions = coachSeasons.map((sc) => ({
    seasonCoachId: sc.id,
    seasonNumber: sc.division?.season?.seasonNumber || 0,
    seasonName: sc.division?.season?.name || "Unknown",
    divisionName: sc.division?.name || "Unknown",
    isCurrent: sc.division?.season?.isCurrent || false,
  }));

  // Aggregate Pokemon stats for all-time kill leaderboard
  const pokemonStatsMap = new Map<number, {
    pokemonId: number;
    pokemonName: string;
    pokemonDisplayName: string;
    spriteUrl: string | null;
    kills: number;
    deaths: number;
    gamesPlayed: number;
  }>();

  for (const mp of coachMatchPokemon) {
    const existing = pokemonStatsMap.get(mp.pokemonId);
    if (existing) {
      existing.kills += mp.kills || 0;
      existing.deaths += mp.deaths || 0;
      existing.gamesPlayed += 1;
    } else {
      pokemonStatsMap.set(mp.pokemonId, {
        pokemonId: mp.pokemonId,
        pokemonName: mp.pokemon?.name || "Unknown",
        pokemonDisplayName: mp.pokemon?.displayName || mp.pokemon?.name || "Unknown",
        spriteUrl: mp.pokemon?.spriteUrl || null,
        kills: mp.kills || 0,
        deaths: mp.deaths || 0,
        gamesPlayed: 1,
      });
    }
  }

  const allTimeKillLeaders = Array.from(pokemonStatsMap.values())
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 9);

  // Aggregate nemesis Pokemon stats (opponent Pokemon that killed the most of this coach's team)
  const nemesisStatsMap = new Map<number, {
    pokemonId: number;
    pokemonName: string;
    pokemonDisplayName: string;
    spriteUrl: string | null;
    kills: number; // kills against this coach
  }>();

  for (const mp of opponentMatchPokemon) {
    const existing = nemesisStatsMap.get(mp.pokemonId);
    if (existing) {
      existing.kills += mp.kills || 0;
    } else {
      nemesisStatsMap.set(mp.pokemonId, {
        pokemonId: mp.pokemonId,
        pokemonName: mp.pokemon?.name || "Unknown",
        pokemonDisplayName: mp.pokemon?.displayName || mp.pokemon?.name || "Unknown",
        spriteUrl: mp.pokemon?.spriteUrl || null,
        kills: mp.kills || 0,
      });
    }
  }

  const nemesisPokemon = Array.from(nemesisStatsMap.values())
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 9);

  const currentElo = coach.eloRating;

  // Calculate all-time record
  let totalWins = 0;
  let totalLosses = 0;
  let totalDiff = 0;

  for (const match of coachMatches) {
    const isCoach1 = seasonCoachIds.includes(match.coach1SeasonId);
    const mySeasonCoachId = isCoach1 ? match.coach1SeasonId : match.coach2SeasonId;

    if (match.winnerId === mySeasonCoachId) {
      totalWins++;
    } else if (match.winnerId) {
      totalLosses++;
    }

    totalDiff += isCoach1
      ? match.coach1Differential || 0
      : match.coach2Differential || 0;
  }

  const winRate = totalWins + totalLosses > 0
    ? Math.round((totalWins / (totalWins + totalLosses)) * 100)
    : 0;

  // Get Pokemon prices for selected season to calculate tera captain cost breakdown
  const selectedSeasonId = selectedSeasonEntry?.division?.season?.id;
  const pokemonPrices = selectedSeasonId
    ? await getSeasonPokemonPrices(selectedSeasonId)
    : [];
  const priceMap = new Map(
    pokemonPrices.map((pp) => [pp.pokemonId, { basePrice: pp.price, teraCaptainCost: pp.teraCaptainCost }])
  );

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="poke-card p-6">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
          {/* Team Logo / Avatar */}
          <div className="relative">
            {mostRecentSeasonEntry?.teamLogoUrl ? (
              <div className="w-24 h-24 rounded-lg bg-[var(--background-secondary)] flex items-center justify-center border-2 border-[var(--background-tertiary)] overflow-hidden">
                <Image
                  src={mostRecentSeasonEntry.teamLogoUrl}
                  alt={mostRecentSeasonEntry.teamName}
                  width={96}
                  height={96}
                  className="object-contain"
                />
              </div>
            ) : (
              <div className="w-24 h-24 rounded-lg bg-gradient-to-br from-[var(--primary)] to-[var(--gradient-end)] flex items-center justify-center border-2 border-[var(--background-tertiary)]">
                <span className="text-white text-3xl font-black">
                  {mostRecentSeasonEntry?.teamAbbreviation || mostRecentSeasonEntry?.teamName?.substring(0, 2).toUpperCase() || coach.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            {/* Rank indicator for top ELO */}
            {currentElo >= 1100 && (
              <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center border-2 border-[var(--background)]">
                <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                </svg>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 mb-2 text-sm">
              <Link
                href="/coaches"
                className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors"
              >
                Coaches
              </Link>
              <span className="text-[var(--foreground-subtle)]">/</span>
            </div>
            {mostRecentSeasonEntry ? (
              <>
                <h1 className="text-xl md:text-2xl font-bold text-white">
                  {mostRecentSeasonEntry.teamName}
                </h1>
                <p className="text-[var(--foreground-muted)]">
                  {coach.name}
                </p>
              </>
            ) : (
              <h1 className="text-xl md:text-2xl font-bold text-white">
                {coach.name}
              </h1>
            )}
            <p className="text-xs text-[var(--foreground-muted)] mt-2">
              {coachSeasons.length} season{coachSeasons.length !== 1 ? 's' : ''} played
              {currentSeasonEntry && (
                <span className="ml-3 inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold rounded bg-[var(--success)]/20 text-[var(--success)] border border-[var(--success)]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
                  {currentSeasonEntry.division?.name}
                </span>
              )}
            </p>
          </div>

          {/* ELO Display */}
          <div className="text-center md:text-right">
            <p className={`text-4xl md:text-5xl font-bold tabular-nums ${
              currentElo >= 1100
                ? "text-[var(--success)]"
                : currentElo <= 900
                ? "text-[var(--error)]"
                : "text-[var(--accent)]"
            }`}>
              {Math.round(currentElo)}
            </p>
            <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wide mt-1">
              ELO Rating
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="poke-card p-4 text-center">
          <p className="text-2xl font-bold tabular-nums text-[var(--success)]">{totalWins}</p>
          <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wide mt-1">Wins</p>
        </div>
        <div className="poke-card p-4 text-center">
          <p className="text-2xl font-bold tabular-nums text-[var(--error)]">{totalLosses}</p>
          <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wide mt-1">Losses</p>
        </div>
        <div className="poke-card p-4 text-center">
          <p className="text-2xl font-bold tabular-nums">{winRate}%</p>
          <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wide mt-1">Win Rate</p>
        </div>
        <div className="poke-card p-4 text-center">
          <p className={`text-2xl font-bold tabular-nums ${
            totalDiff > 0 ? "text-[var(--success)]" : totalDiff < 0 ? "text-[var(--error)]" : ""
          }`}>
            {totalDiff > 0 ? "+" : ""}{totalDiff}
          </p>
          <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wide mt-1">Differential</p>
        </div>
        <div className="poke-card p-4 text-center col-span-2 md:col-span-1">
          <p className="text-2xl font-bold tabular-nums text-[var(--primary)]">{coachSeasons.length}</p>
          <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wide mt-1">Seasons</p>
        </div>
      </div>

      {/* Season Roster */}
      {selectedSeasonEntry && (
        <div className="poke-card p-0 overflow-hidden">
          <div className={`p-6 border-b-2 border-[var(--background-tertiary)] ${
            selectedSeasonEntry.division?.season?.isCurrent ? "bg-[var(--success)]/5" : "bg-[var(--primary)]/5"
          }`}>
            <div className="flex flex-col gap-4">
              {/* Season Selector - show if more than one season */}
              {seasonOptions.length > 1 && (
                <SeasonSelector
                  seasons={seasonOptions}
                  selectedSeasonCoachId={selectedSeasonCoachId}
                  coachId={coachId}
                />
              )}
              <div className="flex items-center justify-between">
                <div className="section-title !mb-0">
                  <div className={`section-title-icon ${
                    selectedSeasonEntry.division?.season?.isCurrent
                      ? "!bg-[var(--success)]"
                      : "!bg-[var(--primary)]"
                  }`} style={{ boxShadow: selectedSeasonEntry.division?.season?.isCurrent ? '0 4px 0 #166534' : '0 4px 0 #7c3aed' }}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <div>
                    <h3>{selectedSeasonEntry.teamName}</h3>
                    <p className="text-xs text-[var(--foreground-muted)] font-normal">
                      {selectedSeasonEntry.division?.season?.name} | {selectedSeasonEntry.division?.name}
                      {selectedSeasonEntry.division?.season?.isCurrent && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[var(--success)]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
                          Current
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <CopyTeamButton
                    pokemonNames={selectedSeasonEntry.rosters?.map((r: any) => r.pokemon?.displayName || r.pokemon?.name).filter(Boolean) || []}
                  />
                  <div className="text-right px-4 py-2 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)]">
                    <p className="text-xl font-bold text-[var(--accent)]">{selectedSeasonEntry.remainingBudget}</p>
                    <p className="text-[10px] text-[var(--foreground-muted)]">pts remaining</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="p-6">
            {selectedSeasonEntry.rosters && selectedSeasonEntry.rosters.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
                {/* Pokemon Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  {selectedSeasonEntry.rosters.map((r: any) => (
                    <div
                      key={r.id}
                      className={`relative p-4 rounded-lg bg-[var(--background-secondary)] border-2 transition-all group ${
                        r.isTeraCaptain
                          ? "border-[var(--accent)]"
                          : "border-[var(--background-tertiary)] hover:border-[var(--primary)]/50"
                      }`}
                    >
                      {/* Acquisition Badge (FA or Trade) */}
                      {r.acquiredVia && r.acquiredVia !== "DRAFT" && (
                        <div className="absolute top-2 left-2">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                            r.acquiredVia === "FA_PICKUP"
                              ? "bg-[var(--success)]/20 text-[var(--success)]"
                              : "bg-[var(--primary)]/20 text-[var(--primary)]"
                          }`}>
                            {r.acquiredVia === "FA_PICKUP" ? "FA" : "Trade"}
                          </span>
                        </div>
                      )}
                      {/* Tera Captain Badge */}
                      {r.isTeraCaptain && (
                        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[var(--accent)] flex items-center justify-center" title="Tera Captain">
                          <svg className="w-3.5 h-3.5 text-black" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2L2 12l10 10 10-10L12 2z" />
                          </svg>
                        </div>
                      )}
                      <div className="flex flex-col items-center justify-center text-center h-full">
                        {r.pokemon?.spriteUrl ? (
                          <div className="w-20 h-20 mb-3">
                            <img
                              src={r.pokemon.spriteUrl}
                              alt={r.pokemon.displayName || r.pokemon.name}
                              className="w-full h-full object-contain group-hover:scale-110 transition-transform"
                            />
                          </div>
                        ) : (
                          <div className="w-20 h-20 rounded-lg bg-[var(--background-tertiary)] flex items-center justify-center mb-3">
                            <span className="text-2xl">?</span>
                          </div>
                        )}
                        <p className="font-bold text-sm truncate w-full leading-tight">{r.pokemon?.displayName || r.pokemon?.name}</p>
                        {/* Type Badges */}
                        {r.pokemon?.types && r.pokemon.types.length > 0 && (
                          <div className="flex flex-wrap justify-center gap-1 mt-2">
                            {r.pokemon.types.map((type: string) => (
                              <span
                                key={type}
                                className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${getTypeColor(type)}`}
                              >
                                {type}
                              </span>
                            ))}
                          </div>
                        )}
                        {/* Price */}
                        <p className="text-xs text-[var(--accent)] font-bold mt-2">
                          {r.isTeraCaptain && r.pokemon?.id ? (
                            <>{priceMap.get(r.pokemon.id)?.basePrice ?? r.price} + {priceMap.get(r.pokemon.id)?.teraCaptainCost ?? 0} pts</>
                          ) : (
                            <>{r.price} pts</>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Speed Tiers - Vertical on right */}
                <div className="p-3 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] h-fit">
                  <h4 className="font-pixel text-[10px] text-center mb-3 text-[var(--accent)]">
                    Speed Tiers
                  </h4>
                  <div className="space-y-0.5">
                    {[...selectedSeasonEntry.rosters]
                      .sort((a: any, b: any) => (b.pokemon?.speed || 0) - (a.pokemon?.speed || 0))
                      .map((r: any) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-center gap-2 py-1 px-2 rounded hover:bg-[var(--background-tertiary)] transition-colors"
                        >
                          <div className="w-8 h-8 flex items-center justify-center">
                            {r.pokemon?.spriteUrl ? (
                              <img
                                src={r.pokemon.spriteUrl}
                                alt={r.pokemon.displayName || r.pokemon.name}
                                className="w-8 h-8 object-contain"
                              />
                            ) : (
                              <span className="text-[var(--foreground-muted)] text-xs">?</span>
                            )}
                          </div>
                          <span className="text-sm font-bold tabular-nums w-8 text-right">
                            {r.pokemon?.speed || "?"}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-[var(--foreground-muted)] text-center py-6 text-sm">No Pokemon drafted yet</p>
            )}
          </div>
        </div>
      )}

      {/* Transactions Section */}
      {selectedSeasonEntry && (
        <div className="poke-card p-0 overflow-hidden">
          <div className="p-6 border-b-2 border-[var(--background-tertiary)]">
            <div className="flex items-center justify-between">
              <div className="section-title !mb-0">
                <div className="section-title-icon !bg-[var(--accent)]" style={{ boxShadow: '0 4px 0 #b45309' }}>
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </div>
                <h3>{selectedSeasonEntry.division?.season?.name} Transactions</h3>
              </div>
              {txCounts && (
                <div className="flex gap-3">
                  <div className="text-center px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)]">
                    <p className="text-base font-bold">
                      <span className={txCounts.faRemaining === 0 ? "text-[var(--error)]" : "text-white"}>
                        {txCounts.faUsed}
                      </span>
                      <span className="text-[var(--foreground-muted)]">/6</span>
                    </p>
                    <p className="text-[9px] text-[var(--foreground-muted)] uppercase">FA</p>
                  </div>
                  <div className="text-center px-3 py-1.5 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)]">
                    <p className="text-base font-bold">
                      <span className={txCounts.p2pRemaining === 0 ? "text-[var(--error)]" : "text-white"}>
                        {txCounts.p2pUsed}
                      </span>
                      <span className="text-[var(--foreground-muted)]">/6</span>
                    </p>
                    <p className="text-[9px] text-[var(--foreground-muted)] uppercase">P2P</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="p-6">
            {selectedSeasonTransactions.length === 0 ? (
              <p className="text-[var(--foreground-muted)] text-center py-4 text-sm">
                No transactions this season
              </p>
            ) : (
              <>
                {/* Table Header */}
                <div className="flex items-center gap-3 px-2 pb-3 mb-3 border-b border-[var(--background-tertiary)] text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide">
                  <div className="w-10 text-center">Wk</div>
                  <div className="w-20">Type</div>
                  <div className="flex-1">Pokemon</div>
                  <div className="w-16 text-right">Pts</div>
                </div>
                {/* Table Rows */}
                <div className="space-y-1">
                  {selectedSeasonTransactions.map((tx: any) => {
                    const typeLabel = tx.type === "FA_PICKUP" ? "Pickup"
                      : tx.type === "FA_DROP" ? "Drop"
                      : tx.type === "FA_SWAP" ? "Swap"
                      : tx.type === "P2P_TRADE" ? "Trade"
                      : tx.type === "TERA_SWAP" ? "Tera"
                      : tx.type;
                    const typeColor = tx.type === "FA_PICKUP" ? "text-[var(--success)]"
                      : tx.type === "FA_DROP" ? "text-[var(--error)]"
                      : tx.type === "FA_SWAP" ? "text-[var(--accent)]"
                      : tx.type === "P2P_TRADE" ? "text-[var(--primary)]"
                      : "text-[var(--accent)]";

                    return (
                      <div key={tx.id} className="trainer-card">
                        {/* Week */}
                        <div className="w-10 text-center text-sm font-bold text-[var(--foreground-muted)]">
                          {tx.week}
                        </div>
                        {/* Type */}
                        <div className="w-20">
                          <span className={`text-sm font-bold ${typeColor}`}>{typeLabel}</span>
                          {!tx.countsAgainstLimit && (
                            <span className="ml-1 text-[8px] text-[var(--foreground-muted)]">(free)</span>
                          )}
                        </div>
                        {/* Pokemon In/Out */}
                        <div className="flex-1 flex flex-wrap items-center gap-2">
                          {tx.pokemonInDetails?.map((p: any) => (
                            <div key={p.id} className="flex items-center gap-1">
                              {p.spriteUrl && <img src={p.spriteUrl} alt="" className="w-6 h-6" />}
                              <span className="text-sm text-[var(--success)] font-bold">+{p.displayName || p.name}</span>
                            </div>
                          ))}
                          {tx.pokemonOutDetails?.map((p: any) => (
                            <div key={p.id} className="flex items-center gap-1">
                              {p.spriteUrl && <img src={p.spriteUrl} alt="" className="w-6 h-6" />}
                              <span className="text-sm text-[var(--error)] font-bold">-{p.displayName || p.name}</span>
                            </div>
                          ))}
                          {tx.type === "TERA_SWAP" && tx.newTeraCaptainDetails && (
                            <div className="flex items-center gap-1">
                              <span className="text-sm text-[var(--accent)]">TC → {tx.newTeraCaptainDetails.displayName || tx.newTeraCaptainDetails.name}</span>
                            </div>
                          )}
                          {tx.tradingPartnerAbbreviation && (
                            <span className="text-xs text-[var(--foreground-muted)]">
                              w/ {tx.tradingPartnerAbbreviation}
                            </span>
                          )}
                        </div>
                        {/* Budget Change */}
                        <div className="w-16 text-right">
                          {tx.budgetChange !== 0 && (
                            <span className={`text-sm font-bold ${
                              tx.budgetChange > 0 ? "text-[var(--success)]" : "text-[var(--error)]"
                            }`}>
                              {tx.budgetChange > 0 ? "+" : ""}{tx.budgetChange}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* All-Time Stats - Kill Leaders & Nemesis */}
      {(allTimeKillLeaders.length > 0 || nemesisPokemon.length > 0) && (
        <div className="grid lg:grid-cols-[2fr_1fr] gap-6">
          {/* All-Time Kill Leaders */}
          {allTimeKillLeaders.length > 0 && (
            <div className="poke-card p-0 overflow-hidden">
              <div className="p-6 border-b-2 border-[var(--background-tertiary)]">
                <div className="section-title !mb-0">
                  <div className="section-title-icon !bg-[var(--success)]" style={{ boxShadow: '0 4px 0 #166534' }}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3>All-Time Kill Leaders</h3>
                </div>
              </div>
              <div className="p-6">
                {/* Header Row */}
                <div className="flex items-center gap-2 px-3 pb-2 mb-2 border-b border-[var(--background-tertiary)] text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide">
                  <div className="w-6 shrink-0"></div>
                  <div className="flex items-center gap-2 flex-1 min-w-0">Pokemon</div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="w-10 text-center">K</span>
                    <span className="w-10 text-center">D</span>
                    <span className="w-12 text-center">K/D</span>
                    <span className="w-8 text-center">GP</span>
                  </div>
                </div>
                <div className="space-y-1">
                  {allTimeKillLeaders.map((pkmn, index) => {
                    const kd = pkmn.deaths > 0
                      ? (pkmn.kills / pkmn.deaths).toFixed(2)
                      : pkmn.kills > 0 ? "∞" : "0.00";
                    return (
                      <div key={pkmn.pokemonId} className="trainer-card">
                        <div className={`rank-badge text-xs shrink-0 ${
                          index === 0 ? 'rank-1' :
                          index === 1 ? 'rank-2' :
                          index === 2 ? 'rank-3' :
                          'bg-[var(--background)] text-[var(--foreground-subtle)] border border-[var(--background-tertiary)]'
                        }`}>
                          {index + 1}
                        </div>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {pkmn.spriteUrl ? (
                            <img
                              src={pkmn.spriteUrl}
                              alt={pkmn.pokemonDisplayName}
                              className="w-7 h-7 object-contain"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded bg-[var(--background-tertiary)] flex items-center justify-center">
                              <span className="text-xs">?</span>
                            </div>
                          )}
                          <span className="font-bold text-sm truncate">{pkmn.pokemonDisplayName}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm font-mono shrink-0">
                          <span className="w-10 text-center font-bold text-[var(--success)]">{pkmn.kills}</span>
                          <span className="w-10 text-center font-bold text-[var(--error)]">{pkmn.deaths}</span>
                          <span className="w-12 text-center text-[var(--foreground-muted)]">{kd}</span>
                          <span className="w-8 text-center text-[var(--foreground-muted)]">{pkmn.gamesPlayed}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Nemesis Pokemon - Most Kills Against This Coach */}
          {nemesisPokemon.length > 0 && (
            <div className="poke-card p-0 overflow-hidden">
              <div className="p-6 border-b-2 border-[var(--background-tertiary)]">
                <div className="section-title !mb-0">
                  <div className="section-title-icon !bg-[var(--error)]" style={{ boxShadow: '0 4px 0 #991b1b' }}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <h3>Biggest Threats</h3>
                </div>
              </div>
              <div className="p-6">
                {/* Header Row */}
                <div className="flex items-center gap-2 px-3 pb-2 mb-2 border-b border-[var(--background-tertiary)] text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide">
                  <div className="w-6 shrink-0"></div>
                  <div className="flex items-center gap-2 flex-1 min-w-0">Opponent Pokemon</div>
                  <div className="w-10 text-center shrink-0">KO's</div>
                </div>
                <div className="space-y-1">
                  {nemesisPokemon.map((pkmn, index) => (
                    <div key={pkmn.pokemonId} className="trainer-card">
                      <div className={`rank-badge text-xs shrink-0 ${
                        index === 0 ? 'rank-1' :
                        index === 1 ? 'rank-2' :
                        index === 2 ? 'rank-3' :
                        'bg-[var(--background)] text-[var(--foreground-subtle)] border border-[var(--background-tertiary)]'
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {pkmn.spriteUrl ? (
                          <img
                            src={pkmn.spriteUrl}
                            alt={pkmn.pokemonDisplayName}
                            className="w-7 h-7 object-contain"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded bg-[var(--background-tertiary)] flex items-center justify-center">
                            <span className="text-xs">?</span>
                          </div>
                        )}
                        <span className="font-bold text-sm truncate">{pkmn.pokemonDisplayName}</span>
                      </div>
                      <div className="w-10 text-center text-sm font-mono font-bold text-[var(--error)] shrink-0">
                        {pkmn.kills}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Season History & Recent Matches */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Season History */}
        <div className="poke-card p-0 overflow-hidden">
          <div className="p-6 border-b-2 border-[var(--background-tertiary)]">
            <div className="section-title !mb-0">
              <div className="section-title-icon">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3>Season History</h3>
            </div>
          </div>
          <div className="p-6">
            {coachSeasons.length === 0 ? (
              <p className="text-[var(--foreground-muted)] text-center py-6 text-sm">
                No season participation yet
              </p>
            ) : (
              <div className="space-y-2">
                {coachSeasons.map((sc) => (
                  <Link
                    key={sc.id}
                    href={`/seasons/${sc.division?.seasonId}`}
                    className="block trainer-card group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm group-hover:text-[var(--primary)] transition-colors truncate">
                        {sc.teamName}
                      </p>
                      <p className="text-xs text-[var(--foreground-muted)]">
                        {sc.division?.season?.name} | {sc.division?.name}
                      </p>
                    </div>
                    {sc.division?.season?.isCurrent && (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-[var(--success)]/20 text-[var(--success)] border border-[var(--success)]/30">
                        Current
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Matches */}
        <div className="poke-card p-0 overflow-hidden">
          <div className="p-6 border-b-2 border-[var(--background-tertiary)]">
            <div className="section-title !mb-0">
              <div className="section-title-icon !bg-[var(--error)]" style={{ boxShadow: '0 4px 0 #991b1b' }}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3>Recent Matches</h3>
            </div>
          </div>
          <div className="p-6">
            {coachMatches.length === 0 ? (
              <p className="text-[var(--foreground-muted)] text-center py-6 text-sm">
                No matches played yet
              </p>
            ) : (
              <div className="space-y-2">
                {coachMatches.slice(0, 8).map((match) => {
                  const isCoach1 = seasonCoachIds.includes(match.coach1SeasonId);
                  const won =
                    match.winnerId ===
                    (isCoach1 ? match.coach1SeasonId : match.coach2SeasonId);
                  const opponent = isCoach1 ? match.coach2 : match.coach1;
                  const myDiff = isCoach1
                    ? match.coach1Differential
                    : match.coach2Differential;

                  // Calculate score display (e.g., "4-0" instead of "+4")
                  // Format: winner's differential - 0 (same as match page)
                  let scoreDisplay = "-";
                  if (match.winnerId) {
                    const winnerDiff = Math.abs(myDiff || 0);
                    if (won) {
                      scoreDisplay = `${winnerDiff}-0`;
                    } else {
                      scoreDisplay = `0-${winnerDiff}`;
                    }
                  }

                  return (
                    <Link
                      key={match.id}
                      href={`/matches/${match.id}`}
                      className={`flex items-center justify-between p-3 rounded-lg border-2 hover:border-[var(--primary)] transition-all group ${
                        won
                          ? "bg-[var(--success)]/5 border-[var(--success)]/30"
                          : match.winnerId
                          ? "bg-[var(--error)]/5 border-[var(--error)]/30"
                          : "bg-[var(--background-secondary)] border-[var(--background-tertiary)]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                            won
                              ? "bg-[var(--success)]/20 text-[var(--success)]"
                              : "bg-[var(--error)]/20 text-[var(--error)]"
                          }`}
                        >
                          {won ? "W" : "L"}
                        </span>
                        <div>
                          <p className="font-bold text-sm group-hover:text-[var(--primary)] transition-colors">vs {opponent?.teamName}</p>
                          <p className="text-[10px] text-[var(--foreground-muted)]">
                            {match.division?.season?.name} | {formatWeekDisplay(match.week)}
                          </p>
                        </div>
                      </div>
                      <span className={`font-bold text-sm ${
                        won ? "text-[var(--success)]" : match.winnerId ? "text-[var(--error)]" : ""
                      }`}>
                        {scoreDisplay}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
