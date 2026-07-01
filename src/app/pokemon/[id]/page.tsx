import Link from "next/link";
import { db } from "@/lib/db";
import { pokemon, matchPokemon, rosters, seasonPokemonPrices, seasons, playoffMatches } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTypeColor } from "@/lib/utils";
import { getAllCoachCosmetics } from "@/lib/glow-utils";
import { CoachRow } from "@/components/coach-row";
import { getPokemonAllTimeKillRank } from "@/lib/pokemon-leaderboard";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getPokemon(id: number) {
  return await db.query.pokemon.findFirst({
    where: eq(pokemon.id, id),
  });
}

async function getPokemonMatchStats(pokemonId: number) {
  return await db.query.matchPokemon.findMany({
    where: eq(matchPokemon.pokemonId, pokemonId),
    with: {
      match: {
        with: {
          coach1: true,
          coach2: true,
          division: {
            with: {
              season: true,
            },
          },
        },
      },
      seasonCoach: {
        with: {
          coach: true,
          division: {
            with: {
              season: true,
            },
          },
        },
      },
    },
  });
}

async function getPokemonRosters(pokemonId: number) {
  return await db.query.rosters.findMany({
    where: eq(rosters.pokemonId, pokemonId),
    with: {
      seasonCoach: {
        with: {
          coach: true,
          division: {
            with: {
              season: true,
            },
          },
        },
      },
    },
  });
}

async function getLatestPrice(pokemonId: number) {
  // Get all prices for this Pokemon with season info
  const prices = await db.query.seasonPokemonPrices.findMany({
    where: eq(seasonPokemonPrices.pokemonId, pokemonId),
    with: {
      season: true,
    },
  });

  if (prices.length === 0) return null;

  // Find the price from the season with the highest season number
  const latestPrice = prices.reduce((latest, current) => {
    const latestSeasonNum = latest.season?.seasonNumber || 0;
    const currentSeasonNum = current.season?.seasonNumber || 0;
    return currentSeasonNum > latestSeasonNum ? current : latest;
  });

  return latestPrice;
}

async function getChampionships(pokemonId: number) {
  // Get all playoff finals (round 3) that have a winner, and all rosters for this Pokemon in parallel
  const [finals, pokemonRosters] = await Promise.all([
    db.query.playoffMatches.findMany({
      where: eq(playoffMatches.round, 3),
      with: {
        winner: {
          with: {
            coach: true,
          },
        },
        division: {
          with: {
            season: true,
          },
        },
      },
    }),
    db.query.rosters.findMany({
      where: eq(rosters.pokemonId, pokemonId),
    }),
  ]);

  // Create a set of seasonCoachIds this Pokemon was rostered on
  const rosterSeasonCoachIds = new Set(pokemonRosters.map(r => r.seasonCoachId));

  // Filter to finals where this Pokemon was on the winning team's roster
  const championships = finals
    .filter(final => final.winnerId && final.winner && rosterSeasonCoachIds.has(final.winnerId))
    .map(final => ({
      seasonId: final.division?.season?.id || 0,
      seasonName: final.division?.season?.name || "Unknown",
      seasonNumber: final.division?.season?.seasonNumber || 0,
      divisionId: final.divisionId,
      divisionName: final.division?.name || "Unknown",
      coachName: final.winner!.coach?.name || "Unknown",
      teamName: final.winner!.teamName || "Unknown",
    }))
    .sort((a, b) => b.seasonNumber - a.seasonNumber);

  return championships;
}

async function getCurrentDrafts(pokemonId: number) {
  // Fetch current season and roster entries for this pokemon in parallel
  const [currentSeason, pokemonRosters] = await Promise.all([
    db.query.seasons.findFirst({
      where: eq(seasons.isCurrent, true),
    }),
    db.query.rosters.findMany({
      where: eq(rosters.pokemonId, pokemonId),
      with: {
        seasonCoach: {
          with: {
            coach: true,
            division: {
              with: {
                season: true,
              },
            },
          },
        },
      },
    }),
  ]);

  if (!currentSeason) return [];

  // Find all roster entries for current season where the team is still active
  const currentRosters = pokemonRosters.filter(
    (r) =>
      r.seasonCoach?.division?.season?.id === currentSeason.id &&
      r.seasonCoach?.isActive
  );

  if (currentRosters.length === 0) return [];

  // Define division order for sorting
  const divisionOrder = ["Stargazer", "Sunset", "Crystal", "Neon", "Unova", "Kalos"];

  return currentRosters
    .map((roster) => ({
      teamName: roster.seasonCoach!.teamName,
      teamLogoUrl: roster.seasonCoach!.teamLogoUrl,
      teamAbbreviation: roster.seasonCoach!.teamAbbreviation,
      coachId: roster.seasonCoach!.coachId,
      coachName: roster.seasonCoach!.coach?.name || "Unknown",
      divisionId: roster.seasonCoach!.divisionId,
      divisionName: roster.seasonCoach!.division?.name || "Unknown",
      seasonId: currentSeason.id,
      seasonName: currentSeason.name,
    }))
    .sort((a, b) => {
      // Sort by division order first
      const aIndex = divisionOrder.indexOf(a.divisionName);
      const bIndex = divisionOrder.indexOf(b.divisionName);
      const aOrder = aIndex === -1 ? 999 : aIndex;
      const bOrder = bIndex === -1 ? 999 : bIndex;
      if (aOrder !== bOrder) return aOrder - bOrder;
      // Then by team name alphabetically
      return a.teamName.localeCompare(b.teamName);
    });
}

// Helper to get stat bar color based on value
function getStatBarColor(value: number): string {
  if (value >= 130) return "bg-[#22c55e]"; // Green - excellent
  if (value >= 100) return "bg-[#84cc16]"; // Lime - good
  if (value >= 80) return "bg-[#eab308]"; // Yellow - average
  if (value >= 60) return "bg-[#f97316]"; // Orange - below average
  return "bg-[#ef4444]"; // Red - low
}

// Helper to get stat bar width percentage (max 200 base stat)
function getStatBarWidth(value: number): number {
  return Math.min((value / 180) * 100, 100);
}

export default async function PokemonDetailPage({ params }: PageProps) {
  const resolvedParams = await params;
  const pokemonId = parseInt(resolvedParams.id);

  if (isNaN(pokemonId)) {
    notFound();
  }

  const pokemonData = await getPokemon(pokemonId);

  if (!pokemonData) {
    notFound();
  }

  const [matchStats, rosterEntries, latestPriceData, championships, currentDrafts, allTimeRank] = await Promise.all([
    getPokemonMatchStats(pokemonId),
    getPokemonRosters(pokemonId),
    getLatestPrice(pokemonId),
    getChampionships(pokemonId),
    getCurrentDrafts(pokemonId),
    getPokemonAllTimeKillRank(pokemonId),
  ]);

  // Aggregate draft counts by coach (count unique seasons drafted)
  const draftCountMap = new Map<number, {
    coachId: number;
    coachName: string;
    teamLogoUrl: string | null;
    draftCount: number;
  }>();

  for (const roster of rosterEntries) {
    const coachId = roster.seasonCoach?.coach?.id;
    if (coachId) {
      const existing = draftCountMap.get(coachId);
      if (existing) {
        existing.draftCount += 1;
      } else {
        draftCountMap.set(coachId, {
          coachId,
          coachName: roster.seasonCoach?.coach?.name || "Unknown",
          teamLogoUrl: roster.seasonCoach?.teamLogoUrl || null,
          draftCount: 1,
        });
      }
    }
  }

  const mostDrafted = Array.from(draftCountMap.values())
    .sort((a, b) => b.draftCount - a.draftCount)
    .slice(0, 3);

  // Aggregate overall stats
  let totalKills = 0;
  let totalDeaths = 0;
  const totalGames = matchStats.length;
  let totalWins = 0;
  let totalLosses = 0;

  // Aggregate stats by coach
  const coachStatsMap = new Map<number, {
    coachId: number;
    coachName: string;
    teamName: string;
    teamAbbreviation: string | null;
    teamLogoUrl: string | null;
    kills: number;
    deaths: number;
    gamesPlayed: number;
    wins: number;
    losses: number;
    differential: number;
  }>();

  // Track seasons/divisions this Pokemon appeared in
  const seasonDivisionSet = new Set<string>();
  const seasonDivisions: Array<{
    seasonId: number;
    seasonName: string;
    seasonNumber: number;
    divisionId: number;
    divisionName: string;
  }> = [];

  for (const mp of matchStats) {
    const kills = mp.kills || 0;
    const deaths = mp.deaths || 0;
    totalKills += kills;
    totalDeaths += deaths;

    // Determine if this Pokemon's team won
    const mySeasonCoachId = mp.seasonCoachId;
    const isWin = mp.match?.winnerId === mySeasonCoachId;
    const isLoss = mp.match?.winnerId && mp.match.winnerId !== mySeasonCoachId;

    if (isWin) totalWins++;
    if (isLoss) totalLosses++;

    // Aggregate by coach
    const coachId = mp.seasonCoach?.coach?.id;
    if (coachId) {
      const existing = coachStatsMap.get(coachId);
      if (existing) {
        existing.kills += kills;
        existing.deaths += deaths;
        existing.gamesPlayed += 1;
        if (isWin) existing.wins += 1;
        if (isLoss) existing.losses += 1;
        existing.differential += kills - deaths;
      } else {
        coachStatsMap.set(coachId, {
          coachId,
          coachName: mp.seasonCoach?.coach?.name || "Unknown",
          teamName: mp.seasonCoach?.teamName || "Unknown",
          teamAbbreviation: mp.seasonCoach?.teamAbbreviation || null,
          teamLogoUrl: mp.seasonCoach?.teamLogoUrl || null,
          kills,
          deaths,
          gamesPlayed: 1,
          wins: isWin ? 1 : 0,
          losses: isLoss ? 1 : 0,
          differential: kills - deaths,
        });
      }
    }

    // Track season/division appearances
    const seasonId = mp.match?.division?.season?.id;
    const divisionId = mp.match?.divisionId;
    if (seasonId && divisionId) {
      const key = `${seasonId}-${divisionId}`;
      if (!seasonDivisionSet.has(key)) {
        seasonDivisionSet.add(key);
        seasonDivisions.push({
          seasonId,
          seasonName: mp.match?.division?.season?.name || "Unknown",
          seasonNumber: mp.match?.division?.season?.seasonNumber || 0,
          divisionId,
          divisionName: mp.match?.division?.name || "Unknown",
        });
      }
    }
  }

  // Sort season/divisions by season number descending
  seasonDivisions.sort((a, b) => b.seasonNumber - a.seasonNumber);

  // Get top coaches sorted by kills
  const topCoaches = Array.from(coachStatsMap.values())
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 10);

  // Fetch all cosmetic data (glow, row-bg, row-border) in 2 queries instead of 4
  const topCoachIds = topCoaches.map(c => c.coachId);
  const cosmetics = await getAllCoachCosmetics(topCoachIds);
  const rowBgDataMap = cosmetics.rowBg;
  const rowBorderDataMap = cosmetics.rowBorder;

  // Calculate derived stats
  const kdRatio = totalDeaths > 0
    ? (totalKills / totalDeaths).toFixed(2)
    : totalKills > 0 ? "∞" : "0.00";
  const winRate = totalWins + totalLosses > 0
    ? Math.round((totalWins / (totalWins + totalLosses)) * 100)
    : 0;

  // Base stats
  const baseStats = [
    { name: "HP", value: pokemonData.hp || 0, short: "HP" },
    { name: "Attack", value: pokemonData.attack || 0, short: "Atk" },
    { name: "Defense", value: pokemonData.defense || 0, short: "Def" },
    { name: "Sp. Atk", value: pokemonData.specialAttack || 0, short: "SpA" },
    { name: "Sp. Def", value: pokemonData.specialDefense || 0, short: "SpD" },
    { name: "Speed", value: pokemonData.speed || 0, short: "Spe" },
  ];

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="poke-card p-4 sm:p-6">
        {/* Mobile Layout */}
        <div className="flex items-start gap-3 md:hidden">
          {/* Pokemon Artwork / Sprite */}
          <div className="relative shrink-0">
            {pokemonData.artworkUrl ? (
              <div className="w-20 h-20 rounded-lg bg-[var(--background-secondary)] flex items-center justify-center border-2 border-[var(--background-tertiary)] overflow-hidden">
                <img
                  src={pokemonData.artworkUrl}
                  alt={pokemonData.displayName || pokemonData.name}
                  className="w-16 h-16 object-contain"
                />
              </div>
            ) : pokemonData.spriteUrl ? (
              <div className="w-20 h-20 rounded-lg bg-[var(--background-secondary)] flex items-center justify-center border-2 border-[var(--background-tertiary)]">
                <img
                  src={pokemonData.spriteUrl}
                  alt={pokemonData.displayName || pokemonData.name}
                  className="w-16 h-16 object-contain"
                />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-[var(--primary)] to-[var(--gradient-end)] flex items-center justify-center border-2 border-[var(--background-tertiary)]">
                <span className="text-white text-2xl font-black">?</span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 mb-1 text-xs">
              <Link
                href="/leaderboards"
                className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors"
              >
                Leaderboards
              </Link>
              <span className="text-[var(--foreground-subtle)]">/</span>
            </div>

            {/* Name */}
            <h1 className="font-pixel text-lg text-white leading-tight truncate">
              {pokemonData.displayName || pokemonData.name}
            </h1>

            {/* Types */}
            {pokemonData.types && pokemonData.types.length > 0 && (
              <div className="flex gap-1 mt-1.5">
                {pokemonData.types.map((type) => (
                  <span
                    key={type}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${getTypeColor(type)}`}
                  >
                    {type}
                  </span>
                ))}
              </div>
            )}

            {/* Price Info inline */}
            {latestPriceData && (
              <div className="flex items-center gap-2 mt-2">
                {latestPriceData.price === 0 ? (
                  <span className="text-lg font-bold text-[var(--error)]">Banned</span>
                ) : (
                  <>
                    <span className="text-xl font-bold tabular-nums text-[var(--accent)]">
                      {latestPriceData.price}
                    </span>
                    <span className="text-[10px] text-[var(--foreground-muted)] uppercase">pts</span>
                    <span className="text-xs text-[var(--foreground-muted)]">
                      TC: {latestPriceData.teraBanned ? (
                        <span className="text-[var(--error)] font-bold">Ban</span>
                      ) : (
                        <span className="font-bold text-white">+{latestPriceData.teraCaptainCost ?? 0}</span>
                      )}
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Smogon Link - Mobile */}
            <a
              href={`https://www.smogon.com/dex/sv/pokemon/${pokemonData.name}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-[10px] text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Smogon
            </a>
          </div>
        </div>

        {/* Desktop Layout */}
        <div className="hidden md:flex items-center gap-6">
          {/* Pokemon Artwork / Sprite */}
          <div className="relative">
            {pokemonData.artworkUrl ? (
              <div className="w-32 h-32 rounded-lg bg-[var(--background-secondary)] flex items-center justify-center border-2 border-[var(--background-tertiary)] overflow-hidden">
                <img
                  src={pokemonData.artworkUrl}
                  alt={pokemonData.displayName || pokemonData.name}
                  className="w-28 h-28 object-contain"
                />
              </div>
            ) : pokemonData.spriteUrl ? (
              <div className="w-32 h-32 rounded-lg bg-[var(--background-secondary)] flex items-center justify-center border-2 border-[var(--background-tertiary)]">
                <img
                  src={pokemonData.spriteUrl}
                  alt={pokemonData.displayName || pokemonData.name}
                  className="w-24 h-24 object-contain"
                />
              </div>
            ) : (
              <div className="w-32 h-32 rounded-lg bg-gradient-to-br from-[var(--primary)] to-[var(--gradient-end)] flex items-center justify-center border-2 border-[var(--background-tertiary)]">
                <span className="text-white text-4xl font-black">?</span>
              </div>
            )}
          </div>

          {/* Pokemon Info */}
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
              <span className="text-[var(--foreground-subtle)]">Pokemon</span>
            </div>

            {/* Name */}
            <h1 className="font-pixel text-2xl md:text-3xl text-white leading-relaxed">
              {pokemonData.displayName || pokemonData.name}
            </h1>

            {/* Types */}
            {pokemonData.types && pokemonData.types.length > 0 && (
              <div className="flex gap-1 mt-2">
                {pokemonData.types.map((type) => (
                  <span
                    key={type}
                    className={`px-2 py-1 rounded text-xs font-bold uppercase ${getTypeColor(type)}`}
                  >
                    {type}
                  </span>
                ))}
              </div>
            )}

            {/* Smogon Link */}
            <a
              href={`https://www.smogon.com/dex/sv/pokemon/${pokemonData.name}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-3 text-xs text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Smogon
            </a>
          </div>

          {/* Price Info */}
          {latestPriceData && (
            <div className="text-right">
              {latestPriceData.price === 0 ? (
                <>
                  <p className="text-3xl md:text-4xl font-bold text-[var(--error)]">
                    Banned
                  </p>
                  <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wide mt-1">
                    Not Available
                  </p>
                </>
              ) : (
                <>
                  <p className="text-4xl md:text-5xl font-bold tabular-nums text-[var(--accent)]">
                    {latestPriceData.price}
                  </p>
                  <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wide mt-1">
                    Points
                  </p>
                  <p className="text-sm text-[var(--foreground-muted)] mt-1">
                    TC: {latestPriceData.teraBanned ? (
                      <span className="text-[var(--error)] font-bold">Banned</span>
                    ) : (
                      <span className="font-bold text-white">+{latestPriceData.teraCaptainCost ?? 0}</span>
                    )}
                  </p>
                </>
              )}
              <p className="text-[10px] text-[var(--foreground-subtle)] mt-1">
                {latestPriceData.season?.name || "Current"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="poke-card p-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-[var(--foreground-muted)] mb-1">Kills</p>
          <p className="text-2xl font-black text-[var(--success)]">{totalKills}</p>
        </div>
        <div className="poke-card p-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-[var(--foreground-muted)] mb-1">Deaths</p>
          <p className="text-2xl font-black text-[var(--error)]">{totalDeaths}</p>
        </div>
        <div className="poke-card p-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-[var(--foreground-muted)] mb-1">K/D</p>
          <p className="text-2xl font-black text-white">{kdRatio}</p>
        </div>
        <Link
          href="/leaderboards#pokemon-all-time"
          className="poke-card p-4 text-center transition-colors hover:border-[var(--primary)]/60"
          title="View Pokemon All-Time leaderboard"
        >
          <p className="text-[10px] uppercase tracking-wide text-[var(--foreground-muted)] mb-1">All-Time Rank</p>
          <p className="text-2xl font-black text-[var(--accent)]">
            {allTimeRank.rank ? `#${allTimeRank.rank}` : "—"}
          </p>
          {allTimeRank.rank && (
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground-subtle)]">
              of {allTimeRank.totalRanked}
            </p>
          )}
          <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-[var(--foreground-subtle)]">
            By kills
          </p>
        </Link>
        <div className="poke-card p-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-[var(--foreground-muted)] mb-1">Games</p>
          <p className="text-2xl font-black text-white">{totalGames}</p>
        </div>
        <div className="poke-card p-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-[var(--foreground-muted)] mb-1">Win Rate</p>
          <p className={`text-2xl font-black ${winRate >= 50 ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}>
            {winRate}%
          </p>
        </div>
        <div className="poke-card p-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-[var(--foreground-muted)] mb-1">Diff</p>
          <p className={`text-2xl font-black ${
            totalKills - totalDeaths > 0 ? 'text-[var(--success)]' :
            totalKills - totalDeaths < 0 ? 'text-[var(--error)]' :
            'text-white'
          }`}>
            {totalKills - totalDeaths > 0 ? '+' : ''}{totalKills - totalDeaths}
          </p>
        </div>
      </div>

      {/* Base Stats & Top Coaches Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left Column: Base Stats + Most Drafted */}
        <div className="space-y-6">
          {/* Base Stats */}
          <div className="poke-card p-0 overflow-hidden">
            <div className="p-4 sm:p-6 border-b-2 border-[var(--background-tertiary)]">
              <div className="section-title !mb-0">
                <div className="section-title-icon">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3>Base Stats</h3>
              </div>
            </div>
            <div className="p-4 sm:p-6 space-y-2 sm:space-y-3">
              {baseStats.map((stat) => (
                <div key={stat.name} className="flex items-center gap-3">
                  <span className="w-12 text-xs font-bold text-[var(--foreground-muted)] uppercase">{stat.short}</span>
                  <div className="flex-1 h-4 bg-[var(--background-tertiary)] rounded overflow-hidden">
                    <div
                      className={`h-full ${getStatBarColor(stat.value)} transition-all`}
                      style={{ width: `${getStatBarWidth(stat.value)}%` }}
                    />
                  </div>
                  <span className="w-10 text-right font-mono font-bold text-sm">{stat.value}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-[var(--background-tertiary)] flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--foreground-muted)] uppercase">Total</span>
                <span className="font-mono font-bold text-lg text-[var(--accent)]">
                  {pokemonData.baseStatTotal || baseStats.reduce((sum, s) => sum + s.value, 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Most Times Drafted */}
          {mostDrafted.length > 0 && (
            <div className="poke-card p-0 overflow-hidden">
              <div className="p-4 sm:p-6 border-b-2 border-[var(--background-tertiary)]">
                <div className="section-title !mb-0">
                  <div className="section-title-icon !bg-[var(--primary)]" style={{ boxShadow: '0 4px 0 #6b21a8' }}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </div>
                  <h3>Most Drafted By</h3>
                </div>
              </div>
              <div className="p-3 sm:p-6">
                <div className="space-y-2">
                  {mostDrafted.map((entry, index) => (
                    <Link key={entry.coachId} href={`/coaches/${entry.coachId}`} className="trainer-card group">
                      <div className={`rank-badge text-xs shrink-0 ${
                        index === 0 ? 'rank-1' :
                        index === 1 ? 'rank-2' :
                        index === 2 ? 'rank-3' :
                        'bg-[var(--background)] text-[var(--foreground-subtle)] border border-[var(--background-tertiary)]'
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {entry.teamLogoUrl ? (
                          <img
                            src={entry.teamLogoUrl}
                            alt={entry.coachName}
                            className="w-7 h-7 object-contain rounded"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded bg-gradient-to-br from-[var(--primary)] to-[var(--gradient-end)] flex items-center justify-center">
                            <span className="text-white text-[10px] font-bold">
                              {entry.coachName.substring(0, 2).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <span className="font-bold text-sm truncate group-hover:text-[var(--primary)] transition-colors">
                          {entry.coachName}
                        </span>
                      </div>
                      <div className="text-sm font-mono font-bold text-[var(--accent)] shrink-0">
                        {entry.draftCount}x
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

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
              {/* Header Row - hidden on mobile */}
              <div className="hidden sm:flex items-center gap-2 px-3 pb-2 mb-2 border-b border-[var(--background-tertiary)] text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide">
                <div className="w-6 shrink-0"></div>
                <div className="flex items-center gap-2 flex-1 min-w-0">Coach</div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="w-10 text-center">K</span>
                  <span className="w-10 text-center">D</span>
                  <span className="w-12 text-center">K/D</span>
                  <span className="w-8 text-center">GP</span>
                </div>
              </div>
              <div className="space-y-1">
                {topCoaches.map((coach, index) => {
                  const kd = coach.deaths > 0
                    ? (coach.kills / coach.deaths).toFixed(2)
                    : coach.kills > 0 ? "∞" : "0.00";
                  const hasBg = rowBgDataMap.has(coach.coachId);
                  const hasBorder = rowBorderDataMap.has(coach.coachId);
                  return (
                    <CoachRow
                      key={coach.coachId}
                      href={`/coaches/${coach.coachId}`}
                      hasBg={hasBg}
                      hasBorder={hasBorder}
                      bgColor={rowBgDataMap.get(coach.coachId)?.colorData.color}
                      borderColor={rowBorderDataMap.get(coach.coachId)?.colorData.color}
                    >
                      <div className={`rank-badge text-xs shrink-0 ${
                        index === 0 ? 'rank-1' :
                        index === 1 ? 'rank-2' :
                        index === 2 ? 'rank-3' :
                        'bg-[var(--background)] text-[var(--foreground-subtle)] border border-[var(--background-tertiary)]'
                      }`}>
                        {index + 1}
                      </div>
                      {/* Mobile layout */}
                      <div className="flex-1 min-w-0 sm:hidden">
                        <div className="flex items-center gap-2">
                          {coach.teamLogoUrl ? (
                            <img
                              src={coach.teamLogoUrl}
                              alt={coach.teamName}
                              className="w-6 h-6 object-contain rounded shrink-0"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded bg-gradient-to-br from-[var(--primary)] to-[var(--gradient-end)] flex items-center justify-center shrink-0">
                              <span className="text-white text-[9px] font-bold">
                                {coach.teamAbbreviation || coach.teamName.substring(0, 2).toUpperCase()}
                              </span>
                            </div>
                          )}
                          <span className={`font-bold text-sm truncate group-hover:text-[var(--primary)] transition-colors ${hasBg ? 'text-white' : ''}`}>
                            {coach.coachName}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs font-mono">
                          <span className="font-bold text-[var(--success)]">{coach.kills}K</span>
                          <span className="font-bold text-[var(--error)]">{coach.deaths}D</span>
                          <span className={hasBg ? 'text-[var(--foreground)]' : 'text-[var(--foreground-muted)]'}>{kd} K/D</span>
                          <span className={hasBg ? 'text-[var(--foreground)]' : 'text-[var(--foreground-muted)]'}>{coach.gamesPlayed} GP</span>
                        </div>
                      </div>
                      {/* Desktop layout */}
                      <div className="hidden sm:flex items-center gap-2 flex-1 min-w-0">
                        {coach.teamLogoUrl ? (
                          <img
                            src={coach.teamLogoUrl}
                            alt={coach.teamName}
                            className="w-7 h-7 object-contain rounded"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded bg-gradient-to-br from-[var(--primary)] to-[var(--gradient-end)] flex items-center justify-center">
                            <span className="text-white text-[10px] font-bold">
                              {coach.teamAbbreviation || coach.teamName.substring(0, 2).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <span className={`font-bold text-sm truncate group-hover:text-[var(--primary)] transition-colors ${hasBg ? 'text-white' : ''}`}>
                          {coach.coachName}
                        </span>
                      </div>
                      <div className="hidden sm:flex items-center gap-2 text-sm font-mono shrink-0">
                        <span className="w-10 text-center font-bold text-[var(--success)]">{coach.kills}</span>
                        <span className="w-10 text-center font-bold text-[var(--error)]">{coach.deaths}</span>
                        <span className={`w-12 text-center ${hasBg ? 'text-[var(--foreground)]' : 'text-[var(--foreground-muted)]'}`}>{kd}</span>
                        <span className={`w-8 text-center ${hasBg ? 'text-[var(--foreground)]' : 'text-[var(--foreground-muted)]'}`}>{coach.gamesPlayed}</span>
                      </div>
                    </CoachRow>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Currently Drafted, Championships & Season Appearances */}
      {(currentDrafts.length > 0 || championships.length > 0 || seasonDivisions.length > 0) && (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Championships */}
          {championships.length > 0 && (
            <div className="poke-card p-0 overflow-hidden lg:col-span-1">
              <div className="p-4 sm:p-6 border-b-2 border-[var(--background-tertiary)]">
                <div className="section-title !mb-0">
                  <div className="section-title-icon !bg-[var(--accent)]" style={{ boxShadow: '0 4px 0 #a16207' }}>
                    <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                  </div>
                  <h3>Championships</h3>
                </div>
              </div>
              <div className="p-4 sm:p-6">
                {/* Total */}
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-[var(--background-tertiary)]">
                  <span className="text-sm font-bold text-[var(--foreground-muted)] uppercase">Total</span>
                  <span className="text-3xl font-black text-[var(--accent)]">{championships.length}</span>
                </div>

                {/* By Division */}
                <div className="space-y-2">
                  {(() => {
                    // Group championships by division
                    const divisionCounts = new Map<string, { name: string; count: number }>();
                    for (const champ of championships) {
                      const existing = divisionCounts.get(champ.divisionName);
                      if (existing) {
                        existing.count += 1;
                      } else {
                        divisionCounts.set(champ.divisionName, { name: champ.divisionName, count: 1 });
                      }
                    }
                    // Sort by predefined division order
                    const divisionOrder = ["Stargazer", "Sunset", "Crystal", "Neon", "Unova", "Kalos"];
                    const sorted = Array.from(divisionCounts.values()).sort((a, b) => {
                      const aIndex = divisionOrder.indexOf(a.name);
                      const bIndex = divisionOrder.indexOf(b.name);
                      // Put unknown divisions at the end
                      const aOrder = aIndex === -1 ? 999 : aIndex;
                      const bOrder = bIndex === -1 ? 999 : bIndex;
                      return aOrder - bOrder;
                    });
                    return sorted.map((div) => (
                      <div key={div.name} className="flex items-center justify-between">
                        <span className="text-sm text-[var(--foreground-muted)]">{div.name}</span>
                        <span className="text-lg font-bold text-white">{div.count}</span>
                      </div>
                    ));
                  })()}
                </div>

                {/* Championship List */}
                <div className="mt-4 pt-4 border-t border-[var(--background-tertiary)]">
                  <p className="text-[10px] uppercase tracking-wide text-[var(--foreground-muted)] mb-2">History</p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {championships.map((champ, i) => (
                      <Link
                        key={`${champ.seasonId}-${champ.divisionId}-${i}`}
                        href={`/seasons/${champ.seasonId}/divisions/${champ.divisionId}`}
                        className="block text-xs p-2 rounded bg-[var(--background-secondary)] hover:bg-[var(--background-tertiary)] transition-colors"
                      >
                        <span className="text-[var(--accent)] font-bold">S{champ.seasonNumber}</span>
                        <span className="mx-1 text-[var(--foreground-subtle)]">|</span>
                        <span className="text-[var(--foreground-muted)]">{champ.divisionName}</span>
                        <span className="mx-1 text-[var(--foreground-subtle)]">-</span>
                        <span className="text-white">{champ.teamName}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Currently Drafted */}
          {currentDrafts.length > 0 && (
            <div className="poke-card p-0 overflow-hidden lg:col-span-1">
              <div className="p-4 sm:p-6 border-b-2 border-[var(--background-tertiary)]">
                <div className="section-title !mb-0">
                  <div className="section-title-icon !bg-[var(--success)]" style={{ boxShadow: '0 4px 0 #166534' }}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3>Currently Drafted By</h3>
                </div>
              </div>
              <div className="p-4 sm:p-6 space-y-3">
                {currentDrafts.map((draft) => (
                  <div key={`${draft.divisionId}-${draft.coachId}`}>
                    <Link
                      href={`/seasons/${draft.seasonId}/divisions/${draft.divisionId}`}
                      className="flex items-center gap-4 p-3 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] hover:border-[var(--primary)] transition-colors group"
                    >
                      {draft.teamLogoUrl ? (
                        <img
                          src={draft.teamLogoUrl}
                          alt={draft.teamName}
                          className="w-12 h-12 object-contain rounded"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded bg-gradient-to-br from-[var(--primary)] to-[var(--gradient-end)] flex items-center justify-center">
                          <span className="text-white text-sm font-bold">
                            {draft.teamAbbreviation || draft.teamName.substring(0, 3).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-white group-hover:text-[var(--primary)] transition-colors truncate">
                          {draft.teamName}
                        </p>
                        <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                          {draft.divisionName}
                        </p>
                      </div>
                    </Link>
                    <Link
                      href={`/coaches/${draft.coachId}`}
                      className="block mt-2 text-xs text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors"
                    >
                      Coach: <span className="font-bold text-white">{draft.coachName}</span>
                    </Link>
                  </div>
                ))}
                <p className="text-[10px] text-[var(--foreground-subtle)] pt-2 border-t border-[var(--background-tertiary)]">
                  {currentDrafts[0].seasonName}
                </p>
              </div>
            </div>
          )}

          {/* Season Appearances */}
          {seasonDivisions.length > 0 && (
            <div className={`poke-card p-0 overflow-hidden ${
              championships.length > 0 && currentDrafts.length > 0 ? 'lg:col-span-1' :
              championships.length > 0 || currentDrafts.length > 0 ? 'lg:col-span-2' :
              'lg:col-span-3'
            }`}>
              <div className="p-4 sm:p-6 border-b-2 border-[var(--background-tertiary)]">
                <div className="section-title !mb-0">
                  <div className="section-title-icon">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3>Season Appearances</h3>
                </div>
              </div>
              <div className="p-3 sm:p-6">
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {seasonDivisions.map((sd) => (
                    <Link
                      key={`${sd.seasonId}-${sd.divisionId}`}
                      href={`/seasons/${sd.seasonId}/divisions/${sd.divisionId}`}
                      className="px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] hover:border-[var(--primary)] transition-colors text-xs sm:text-sm"
                    >
                      <span className="text-[var(--foreground-muted)]">{sd.seasonName}</span>
                      <span className="mx-1 sm:mx-2 text-[var(--foreground-subtle)]">|</span>
                      <span className="font-bold">{sd.divisionName}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {totalGames === 0 && (
        <div className="poke-card p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--background-secondary)] flex items-center justify-center">
            <svg className="w-8 h-8 text-[var(--foreground-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="font-bold text-lg mb-2">No Match Data</h3>
          <p className="text-[var(--foreground-muted)]">
            This Pokemon hasn&apos;t been used in any recorded matches yet.
          </p>
        </div>
      )}
    </div>
  );
}
