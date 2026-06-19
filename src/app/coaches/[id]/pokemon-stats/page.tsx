import Link from "next/link";
import { db } from "@/lib/db";
import { coaches, seasonCoaches, matchPokemon, matches } from "@/lib/schema";
import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PokemonStatsTable } from "./pokemon-stats-table";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ season?: string; sort?: string; order?: string }>;
}

export default async function CoachPokemonStatsPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const coachId = parseInt(resolvedParams.id);
  const seasonFilter = resolvedSearchParams.season || "all";
  const sortBy = resolvedSearchParams.sort || "kills";
  const sortOrder = resolvedSearchParams.order || "desc";

  // Fetch coach and their seasons
  const [coach, coachSeasons] = await Promise.all([
    db.query.coaches.findFirst({
      where: eq(coaches.id, coachId),
    }),
    db.query.seasonCoaches.findMany({
      where: eq(seasonCoaches.coachId, coachId),
      with: {
        division: {
          with: {
            season: true,
          },
        },
      },
    }),
  ]);

  if (!coach) {
    notFound();
  }

  const seasonCoachIds = coachSeasons.map((sc) => sc.id);

  // Build a map of seasonCoachId to season info
  const seasonInfoMap = new Map(
    coachSeasons.map((sc) => [
      sc.id,
      {
        seasonId: sc.division?.season?.id,
        seasonName: sc.division?.season?.name || "Unknown",
        seasonNumber: sc.division?.season?.seasonNumber || 0,
      },
    ])
  );

  // Get all match pokemon for this coach with match info
  const allMatchPokemon = seasonCoachIds.length > 0
    ? await db.query.matchPokemon.findMany({
        where: inArray(matchPokemon.seasonCoachId, seasonCoachIds),
        with: {
          pokemon: true,
          match: true,
        },
      })
    : [];

  // Filter by season if specified
  const filteredMatchPokemon = seasonFilter === "all"
    ? allMatchPokemon
    : allMatchPokemon.filter((mp) => {
        const seasonInfo = seasonInfoMap.get(mp.seasonCoachId);
        return seasonInfo?.seasonId === parseInt(seasonFilter);
      });

  // Aggregate stats per Pokemon
  const pokemonStatsMap = new Map<number, {
    pokemonId: number;
    pokemonName: string;
    pokemonDisplayName: string;
    spriteUrl: string | null;
    types: string[] | null;
    kills: number;
    deaths: number;
    gamesPlayed: number;
    seasons: Set<number>;
  }>();

  for (const mp of filteredMatchPokemon) {
    const seasonInfo = seasonInfoMap.get(mp.seasonCoachId);
    const existing = pokemonStatsMap.get(mp.pokemonId);

    if (existing) {
      existing.kills += mp.kills || 0;
      existing.deaths += mp.deaths || 0;
      existing.gamesPlayed += 1;
      if (seasonInfo?.seasonId) {
        existing.seasons.add(seasonInfo.seasonId);
      }
    } else {
      const seasons = new Set<number>();
      if (seasonInfo?.seasonId) {
        seasons.add(seasonInfo.seasonId);
      }
      pokemonStatsMap.set(mp.pokemonId, {
        pokemonId: mp.pokemonId,
        pokemonName: mp.pokemon?.name || "Unknown",
        pokemonDisplayName: mp.pokemon?.displayName || mp.pokemon?.name || "Unknown",
        spriteUrl: mp.pokemon?.spriteUrl || null,
        types: mp.pokemon?.types || null,
        kills: mp.kills || 0,
        deaths: mp.deaths || 0,
        gamesPlayed: 1,
        seasons,
      });
    }
  }

  // Convert to array and add K/D ratio
  const pokemonStats = Array.from(pokemonStatsMap.values()).map((p) => ({
    ...p,
    kd: p.deaths > 0 ? p.kills / p.deaths : p.kills > 0 ? Infinity : 0,
    killsPerGame: p.gamesPlayed > 0 ? p.kills / p.gamesPlayed : 0,
    seasonsCount: p.seasons.size,
  }));

  // Sort the stats
  pokemonStats.sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case "kills":
        comparison = b.kills - a.kills;
        break;
      case "deaths":
        comparison = b.deaths - a.deaths;
        break;
      case "kd":
        // Handle Infinity for K/D
        if (a.kd === Infinity && b.kd === Infinity) comparison = 0;
        else if (a.kd === Infinity) comparison = -1;
        else if (b.kd === Infinity) comparison = 1;
        else comparison = b.kd - a.kd;
        break;
      case "gp":
        comparison = b.gamesPlayed - a.gamesPlayed;
        break;
      case "kpg":
        comparison = b.killsPerGame - a.killsPerGame;
        break;
      case "drafted":
        comparison = b.seasonsCount - a.seasonsCount;
        break;
      case "name":
        comparison = a.pokemonDisplayName.localeCompare(b.pokemonDisplayName);
        break;
      default:
        comparison = b.kills - a.kills;
    }
    return sortOrder === "asc" ? -comparison : comparison;
  });

  // Get unique seasons for filter dropdown
  const seasons = coachSeasons
    .filter((sc) => sc.division?.season)
    .map((sc) => ({
      id: sc.division!.season!.id,
      name: sc.division!.season!.name,
      seasonNumber: sc.division!.season!.seasonNumber,
    }))
    .filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i)
    .sort((a, b) => b.seasonNumber - a.seasonNumber);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page Header */}
      <div className="poke-card p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 mb-2 text-xs sm:text-sm">
              <Link
                href="/coaches"
                className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors"
              >
                Coaches
              </Link>
              <span className="text-[var(--foreground-subtle)]">/</span>
              <Link
                href={`/coaches/${coachId}`}
                className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors"
              >
                {coach.name}
              </Link>
              <span className="text-[var(--foreground-subtle)]">/</span>
              <span className="text-[var(--foreground-subtle)]">Pokemon Stats</span>
            </div>

            {/* Title */}
            <h1 className="font-pixel text-lg sm:text-xl md:text-2xl text-white leading-relaxed">
              Pokemon Stats
            </h1>
            <p className="text-sm text-[var(--foreground-muted)] mt-1">
              {pokemonStats.length} Pokemon • {filteredMatchPokemon.length} total appearances
            </p>
          </div>

          <Link href={`/coaches/${coachId}`}>
            <button className="btn-retro-secondary py-2 px-4 text-[10px] flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back
            </button>
          </Link>
        </div>
      </div>

      {/* Stats Table */}
      <PokemonStatsTable
        pokemonStats={pokemonStats}
        seasons={seasons}
        currentSeason={seasonFilter}
        currentSort={sortBy}
        currentOrder={sortOrder}
      />
    </div>
  );
}
