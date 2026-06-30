import { db } from "@/lib/db";
import { divisions, matches, matchPokemon, seasons, killEvents } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { filterPublicDivisions, getPublicVisibilityState, isPublicSeasonVisible } from "@/lib/public-visibility";

interface PageProps {
  params: Promise<{ id: string }>;
}

// Process pokemon leaderboard from pre-fetched data
function processPokemonLeaderboard(
  seasonMatchIds: Set<number>,
  allMatchPokemon: {
    id: number;
    matchId: number;
    pokemonId: number;
    kills: number | null;
    deaths: number | null;
    pokemon: {
      id: number;
      name: string;
      displayName: string | null;
      spriteUrl: string | null;
    } | null;
  }[]
) {
  // Filter to only season matches
  const seasonMatchPokemon = allMatchPokemon.filter((mp) =>
    seasonMatchIds.has(mp.matchId)
  );

  // Aggregate stats by pokemon
  const statsMap = new Map<
    number,
    {
      pokemonId: number;
      pokemonName: string;
      pokemonDisplayName: string | null;
      spriteUrl: string | null;
      kills: number;
      deaths: number;
      gamesPlayed: number;
    }
  >();

  for (const mp of seasonMatchPokemon) {
    const key = mp.pokemonId;

    if (!statsMap.has(key)) {
      statsMap.set(key, {
        pokemonId: mp.pokemonId,
        pokemonName: mp.pokemon?.name || "Unknown",
        pokemonDisplayName: mp.pokemon?.displayName || null,
        spriteUrl: mp.pokemon?.spriteUrl || null,
        kills: 0,
        deaths: 0,
        gamesPlayed: 0,
      });
    }

    const stats = statsMap.get(key)!;
    stats.kills += mp.kills || 0;
    stats.deaths += mp.deaths || 0;
    stats.gamesPlayed += 1;
  }

  // Convert to array and sort
  const leaderboard = Array.from(statsMap.values()).map((s) => ({
    ...s,
    differential: s.kills - s.deaths,
    kd: s.deaths > 0 ? (s.kills / s.deaths).toFixed(2) : s.kills > 0 ? "∞" : "0.00",
  }));

  // Sort by kills (desc), then differential (desc), then games played (asc)
  leaderboard.sort((a, b) => {
    if (b.kills !== a.kills) return b.kills - a.kills;
    if (b.differential !== a.differential) return b.differential - a.differential;
    return a.gamesPlayed - b.gamesPlayed;
  });

  return leaderboard;
}

// Process move leaderboard from pre-fetched data
function processMoveLeaderboard(
  seasonMatchIds: Set<number>,
  allKillEvents: {
    id: number;
    matchId: number;
    moveName: string | null;
    move: {
      id: number;
      displayName: string | null;
      type: string | null;
    } | null;
  }[]
) {
  // Filter to only season matches
  const seasonKillEvents = allKillEvents.filter((ke) =>
    seasonMatchIds.has(ke.matchId)
  );

  // Aggregate kills by move
  const moveKillsMap = new Map<
    string,
    {
      moveId: number | null;
      moveName: string;
      moveDisplayName: string | null;
      moveType: string | null;
      kills: number;
    }
  >();

  for (const event of seasonKillEvents) {
    const moveName = event.moveName || "Unknown";
    const key = moveName.toLowerCase();

    if (!moveKillsMap.has(key)) {
      moveKillsMap.set(key, {
        moveId: event.move?.id || null,
        moveName: moveName,
        moveDisplayName: event.move?.displayName || null,
        moveType: event.move?.type || null,
        kills: 0,
      });
    }

    moveKillsMap.get(key)!.kills += 1;
  }

  // Convert to array, filter out Unknown, and sort by kills
  const leaderboard = Array.from(moveKillsMap.values())
    .filter((entry) => entry.moveName.toLowerCase() !== "unknown");
  leaderboard.sort((a, b) => b.kills - a.kills);

  return leaderboard;
}

// Type colors for moves
const typeColors: Record<string, string> = {
  normal: "#A8A878",
  fire: "#F08030",
  water: "#6890F0",
  electric: "#F8D030",
  grass: "#78C850",
  ice: "#98D8D8",
  fighting: "#C03028",
  poison: "#A040A0",
  ground: "#E0C068",
  flying: "#A890F0",
  psychic: "#F85888",
  bug: "#A8B820",
  rock: "#B8A038",
  ghost: "#705898",
  dragon: "#7038F8",
  dark: "#705848",
  steel: "#B8B8D0",
  fairy: "#EE99AC",
};

export default async function KillLeadersPage({ params }: PageProps) {
  const { id } = await params;
  const seasonId = parseInt(id);

  if (isNaN(seasonId)) {
    notFound();
  }

  // Fetch all data in parallel
  const [season, seasonDivisions, seasonMatches, allMatchPokemon, allKillEvents, session, visibility] = await Promise.all([
    db.query.seasons.findFirst({
      where: eq(seasons.id, seasonId),
    }),
    db.query.divisions.findMany({
      where: eq(divisions.seasonId, seasonId),
    }),
    db.query.matches.findMany({
      where: eq(matches.seasonId, seasonId),
    }),
    db.query.matchPokemon.findMany({
      with: {
        pokemon: true,
      },
    }),
    db.query.killEvents.findMany({
      with: {
        move: true,
      },
    }),
    getSession(),
    getPublicVisibilityState(),
  ]);

  if (!season || (!session?.isMod && !isPublicSeasonVisible(season))) {
    notFound();
  }

  const visibleDivisionIds = new Set(
    (session?.isMod ? seasonDivisions : filterPublicDivisions(seasonDivisions, visibility)).map((division) => division.id)
  );

  // Create set of match IDs for efficient lookup
  const seasonMatchIds = new Set(
    seasonMatches
      .filter((match) => visibleDivisionIds.has(match.divisionId))
      .map((m) => m.id)
  );

  // Process leaderboards from pre-fetched data
  const pokemonLeaderboard = processPokemonLeaderboard(seasonMatchIds, allMatchPokemon);
  const moveLeaderboard = processMoveLeaderboard(seasonMatchIds, allKillEvents);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="poke-card p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 mb-3 text-sm">
              <Link
                href="/seasons"
                className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors"
              >
                Seasons
              </Link>
              <span className="text-[var(--foreground-subtle)]">/</span>
              <Link
                href={`/seasons/${seasonId}`}
                className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors"
              >
                {season.name}
              </Link>
              <span className="text-[var(--foreground-subtle)]">/</span>
              <span className="text-[var(--foreground-subtle)]">Kill Leaders</span>
            </div>

            {/* Title */}
            <div className="flex items-center gap-4">
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
              <h1 className="font-pixel text-xl md:text-2xl text-white leading-relaxed">
                Kill Leaders
              </h1>
            </div>

            <p className="text-[var(--foreground-muted)] mt-2">
              Pokemon and move statistics across all divisions
            </p>
          </div>

          {/* Action Button */}
          <Link href={`/seasons/${seasonId}`}>
            <button className="btn-retro-secondary py-2 px-4 text-[10px] flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Season
            </button>
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pokemon Leaderboard */}
        <div className="poke-card p-6">
          <div className="section-title mb-4">
            <div
              className="section-title-icon !bg-[var(--success)]"
              style={{ boxShadow: "0 4px 0 #166534" }}
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
            <h3>Pokemon ({pokemonLeaderboard.length})</h3>
          </div>

          {/* Header Row - pr-6 accounts for scrollbar */}
          <div className="flex items-center gap-1 sm:gap-2 px-2 pr-6 pb-2 mb-2 border-b border-[var(--background-tertiary)] text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide">
            <div className="w-5 sm:w-8 shrink-0"></div>
            <div className="flex items-center gap-2 flex-1 min-w-0">Pokemon</div>
            <div className="flex items-center shrink-0">
              <span className="w-6 sm:w-10 text-center">K</span>
              <span className="w-6 sm:w-10 text-center">D</span>
              <span className="w-8 sm:w-12 text-center">+/-</span>
              <span className="hidden sm:block w-12 text-center">K/D</span>
              <span className="w-6 sm:w-8 text-center">GP</span>
            </div>
          </div>

          {/* Pokemon List */}
          <div className="space-y-1 max-h-[600px] overflow-y-auto">
            {pokemonLeaderboard.map((entry, index) => (
              <Link
                key={entry.pokemonId}
                href={`/pokemon/${entry.pokemonId}`}
                className="trainer-card gap-1 sm:gap-2 group"
              >
                {/* Rank Badge */}
                <div
                  className={`rank-badge w-5 h-5 sm:w-8 sm:h-8 text-[10px] sm:text-xs shrink-0 ${
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
                <div className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0">
                  {entry.spriteUrl ? (
                    <img
                      src={entry.spriteUrl}
                      alt={entry.pokemonDisplayName || entry.pokemonName}
                      className="w-6 h-6 sm:w-7 sm:h-7 object-contain"
                    />
                  ) : (
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded bg-[var(--background-tertiary)] flex items-center justify-center">
                      <span className="text-xs">?</span>
                    </div>
                  )}
                  <span className="font-bold text-xs sm:text-sm truncate group-hover:text-[var(--primary)] transition-colors">
                    {entry.pokemonDisplayName || entry.pokemonName}
                  </span>
                </div>

                {/* Stats */}
                <div className="flex items-center text-xs sm:text-sm font-mono shrink-0">
                  <span className="w-6 sm:w-10 text-center font-bold text-[var(--success)]">
                    {entry.kills}
                  </span>
                  <span className="w-6 sm:w-10 text-center font-bold text-[var(--error)]">
                    {entry.deaths}
                  </span>
                  <span className={`w-8 sm:w-12 text-center font-bold ${
                    entry.differential > 0
                      ? "text-[var(--success)]"
                      : entry.differential < 0
                        ? "text-[var(--error)]"
                        : "text-[var(--foreground-muted)]"
                  }`}>
                    {entry.differential > 0 ? "+" : ""}{entry.differential}
                  </span>
                  <span className="hidden sm:block w-12 text-center text-[var(--foreground-muted)]">
                    {entry.kd}
                  </span>
                  <span className="w-6 sm:w-8 text-center text-[var(--foreground-muted)]">
                    {entry.gamesPlayed}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Move Leaderboard */}
        {season.seasonNumber >= 10 && (
          <div className="poke-card p-6">
            <div className="section-title mb-4">
              <div
                className="section-title-icon !bg-purple-600"
                style={{ boxShadow: "0 4px 0 #6b21a8" }}
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
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
              <h3>Moves ({moveLeaderboard.length})</h3>
            </div>

            {/* Header Row - pr-6 accounts for scrollbar */}
            <div className="flex items-center gap-1 sm:gap-2 px-2 pr-6 pb-2 mb-2 border-b border-[var(--background-tertiary)] text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide">
              <div className="w-5 sm:w-8 shrink-0"></div>
              <div className="flex items-center gap-2 flex-1 min-w-0">Move</div>
              <div className="w-10 sm:w-12 text-center shrink-0">Kills</div>
            </div>

            {/* Move List */}
            <div className="space-y-1 max-h-[600px] overflow-y-auto">
              {moveLeaderboard.map((entry, index) => {
                const content = (
                  <>
                    {/* Rank Badge */}
                    <div
                      className={`rank-badge w-5 h-5 sm:w-8 sm:h-8 text-[10px] sm:text-xs shrink-0 ${
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

                    {/* Move Info */}
                    <div className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0">
                      {entry.moveType && (
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{
                            backgroundColor: typeColors[entry.moveType] || "#888888",
                          }}
                          title={entry.moveType}
                        />
                      )}
                      <span className="font-bold text-xs sm:text-sm truncate group-hover:text-[var(--primary)] transition-colors">
                        {entry.moveDisplayName || entry.moveName}
                      </span>
                    </div>

                    {/* Kill Count */}
                    <div className="w-10 sm:w-12 text-center text-xs sm:text-sm font-mono font-bold text-[var(--success)] shrink-0">
                      {entry.kills}
                    </div>
                  </>
                );

                return entry.moveId ? (
                  <Link
                    key={entry.moveId}
                    href={`/moves/${entry.moveId}`}
                    className="trainer-card gap-1 sm:gap-2 group"
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={entry.moveName} className="trainer-card gap-1 sm:gap-2">
                    {content}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
