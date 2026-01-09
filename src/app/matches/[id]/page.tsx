import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { matches, matchPokemon, rosters, seasonPokemonPrices } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { MatchPreview } from "@/components/match-preview";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getMatch(id: number) {
  return await db.query.matches.findFirst({
    where: eq(matches.id, id),
    with: {
      season: true,
      division: true,
      coach1: {
        with: {
          coach: true,
          rosters: {
            with: { pokemon: true },
          },
        },
      },
      coach2: {
        with: {
          coach: true,
          rosters: {
            with: { pokemon: true },
          },
        },
      },
      winner: true,
      matchPokemon: {
        with: { pokemon: true, seasonCoach: true },
      },
    },
  });
}

async function getSeasonPokemonPrices(seasonId: number) {
  return await db.query.seasonPokemonPrices.findMany({
    where: eq(seasonPokemonPrices.seasonId, seasonId),
  });
}

// Helper to get display label for a week number
function getWeekLabel(week: number): string {
  if (week === 101) return "Quarterfinals";
  if (week === 102) return "Semifinals";
  if (week === 103) return "Finals";
  return `Week ${week}`;
}

export default async function MatchDetailPage({ params }: PageProps) {
  const resolvedParams = await params;
  const matchId = parseInt(resolvedParams.id);
  const match = await getMatch(matchId);

  if (!match) {
    notFound();
  }

  const isPlayed = match.winnerId !== null;
  const coach1 = match.coach1;
  const coach2 = match.coach2;

  // Get match Pokemon for each coach
  const coach1MatchPokemon = match.matchPokemon.filter(
    (mp) => mp.seasonCoachId === match.coach1SeasonId
  );
  const coach2MatchPokemon = match.matchPokemon.filter(
    (mp) => mp.seasonCoachId === match.coach2SeasonId
  );

  // Calculate totals for played match
  const coach1Kills = coach1MatchPokemon.reduce((sum, mp) => sum + (mp.kills || 0), 0);
  const coach1Deaths = coach1MatchPokemon.reduce((sum, mp) => sum + (mp.deaths || 0), 0);
  const coach2Kills = coach2MatchPokemon.reduce((sum, mp) => sum + (mp.kills || 0), 0);
  const coach2Deaths = coach2MatchPokemon.reduce((sum, mp) => sum + (mp.deaths || 0), 0);

  const coach1Won = match.winnerId === match.coach1SeasonId;
  const coach2Won = match.winnerId === match.coach2SeasonId;

  // Fetch season pokemon prices for tera captain display
  const pokemonPrices = await getSeasonPokemonPrices(match.seasonId);
  const priceMap = new Map(
    pokemonPrices.map((pp) => [pp.pokemonId, { basePrice: pp.price, teraCaptainCost: pp.teraCaptainCost }])
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="poke-card p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 mb-3 text-sm">
              <Link href={`/seasons/${match.seasonId}`} className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors">
                {match.season?.name}
              </Link>
              <span className="text-[var(--foreground-subtle)]">/</span>
              <Link
                href={`/seasons/${match.seasonId}/divisions/${match.divisionId}`}
                className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors"
              >
                {match.division?.name}
              </Link>
              <span className="text-[var(--foreground-subtle)]">/</span>
              <span className="text-[var(--foreground-subtle)]">{getWeekLabel(match.week)}</span>
            </div>

            {/* Title */}
            <h1 className="font-pixel text-xl md:text-2xl text-white leading-relaxed">
              {isPlayed ? "Match Results" : "Match Preview"}
            </h1>
          </div>

          {/* Status Badge */}
          <div className={`px-4 py-2 rounded-lg text-xs font-bold border-2 ${
            isPlayed
              ? "bg-[var(--success)]/20 text-[var(--success)] border-[var(--success)]/30"
              : "bg-[var(--accent)]/20 text-[var(--accent)] border-[var(--accent)]/30"
          }`}>
            {isPlayed ? "COMPLETED" : "UPCOMING"}
          </div>
        </div>
      </div>

      {/* Match Header */}
      <div className="poke-card p-6">
        <div className="flex flex-col items-center gap-6">

          {/* Teams */}
          <div className="w-full grid grid-cols-3 items-center gap-4">
            {/* Coach 1 */}
            <div className={`text-center ${coach1Won ? "opacity-100" : coach2Won ? "opacity-60" : ""}`}>
              <Link href={`/coaches/${coach1?.coachId}`} className="group">
                {coach1?.teamLogoUrl ? (
                  <div className="w-20 h-20 mx-auto mb-3 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] flex items-center justify-center overflow-hidden group-hover:border-[var(--primary)] transition-all">
                    <Image
                      src={coach1.teamLogoUrl}
                      alt={coach1.teamName}
                      width={80}
                      height={80}
                      className="object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 mx-auto mb-3 rounded-lg bg-[var(--primary)] border-2 border-[var(--background-tertiary)] flex items-center justify-center group-hover:border-[var(--primary)] transition-all">
                    <span className="text-white text-2xl font-black">
                      {coach1?.teamAbbreviation || coach1?.teamName?.substring(0, 2).toUpperCase()}
                    </span>
                  </div>
                )}
                <h2 className="text-lg font-bold group-hover:text-[var(--primary)] transition-colors">
                  {coach1?.teamName}
                </h2>
                <p className="text-sm text-[var(--foreground-muted)]">{coach1?.coach?.name}</p>
                {coach1?.coach?.eloRating && (
                  <p className="text-xs text-[var(--accent)] font-bold mt-1">{Math.round(coach1.coach.eloRating)} ELO</p>
                )}
              </Link>
              {coach1Won && (
                <span className="inline-block mt-2 px-3 py-1 text-[10px] font-bold rounded-lg bg-[var(--success)]/20 text-[var(--success)] border border-[var(--success)]/30 uppercase">
                  Winner
                </span>
              )}
            </div>

            {/* Score / VS */}
            <div className="text-center">
              {isPlayed ? (
                <div className="flex items-center justify-center gap-3">
                  <span className={`font-pixel text-3xl md:text-4xl ${coach1Won ? "text-[var(--success)]" : "text-[var(--foreground-muted)]"}`}>
                    {coach1Won ? Math.abs(match.coach1Differential || 0) : 0}
                  </span>
                  <span className="text-xl text-[var(--foreground-subtle)]">-</span>
                  <span className={`font-pixel text-3xl md:text-4xl ${coach2Won ? "text-[var(--success)]" : "text-[var(--foreground-muted)]"}`}>
                    {coach2Won ? Math.abs(match.coach2Differential || 0) : 0}
                  </span>
                </div>
              ) : (
                <div className="font-pixel text-2xl text-[var(--foreground-muted)]">VS</div>
              )}
              <p className="text-xs text-[var(--foreground-muted)] mt-2 uppercase font-bold">
                {getWeekLabel(match.week)}
              </p>
              {match.replayUrl && (
                <a
                  href={match.replayUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 text-[10px] font-bold rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-colors uppercase"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Watch Replay
                </a>
              )}
            </div>

            {/* Coach 2 */}
            <div className={`text-center ${coach2Won ? "opacity-100" : coach1Won ? "opacity-60" : ""}`}>
              <Link href={`/coaches/${coach2?.coachId}`} className="group">
                {coach2?.teamLogoUrl ? (
                  <div className="w-20 h-20 mx-auto mb-3 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] flex items-center justify-center overflow-hidden group-hover:border-[var(--primary)] transition-all">
                    <Image
                      src={coach2.teamLogoUrl}
                      alt={coach2.teamName}
                      width={80}
                      height={80}
                      className="object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 mx-auto mb-3 rounded-lg bg-[var(--primary)] border-2 border-[var(--background-tertiary)] flex items-center justify-center group-hover:border-[var(--primary)] transition-all">
                    <span className="text-white text-2xl font-black">
                      {coach2?.teamAbbreviation || coach2?.teamName?.substring(0, 2).toUpperCase()}
                    </span>
                  </div>
                )}
                <h2 className="text-lg font-bold group-hover:text-[var(--primary)] transition-colors">
                  {coach2?.teamName}
                </h2>
                <p className="text-sm text-[var(--foreground-muted)]">{coach2?.coach?.name}</p>
                {coach2?.coach?.eloRating && (
                  <p className="text-xs text-[var(--accent)] font-bold mt-1">{Math.round(coach2.coach.eloRating)} ELO</p>
                )}
              </Link>
              {coach2Won && (
                <span className="inline-block mt-2 px-3 py-1 text-[10px] font-bold rounded-lg bg-[var(--success)]/20 text-[var(--success)] border border-[var(--success)]/30 uppercase">
                  Winner
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Match Content */}
      {isPlayed ? (
        /* Played Match - Show Pokemon Stats */
        <div className="grid md:grid-cols-2 gap-6">
          {/* Coach 1 Pokemon */}
          <div className="poke-card p-0 overflow-hidden">
            <div className={`p-4 border-b-2 border-[var(--background-tertiary)] flex items-center justify-between ${
              coach1Won ? "bg-[var(--success)]/10" : ""
            }`}>
              <span className="font-bold text-white">{coach1?.teamAbbreviation || coach1?.teamName}</span>
              <div className="flex items-center gap-4 text-sm font-mono">
                <span className="text-[var(--success)] font-bold">{coach1Kills} K</span>
                <span className="text-[var(--error)] font-bold">{coach1Deaths} D</span>
              </div>
            </div>
            <div className="p-4 space-y-2">
              {coach1MatchPokemon.length > 0 ? (
                coach1MatchPokemon.map((mp) => (
                  <div
                    key={mp.id}
                    className={`flex items-center justify-between p-3 rounded-lg border-2 ${
                      (mp.deaths || 0) > 0
                        ? "bg-[var(--error)]/5 border-[var(--error)]/30"
                        : "bg-[var(--background-secondary)] border-[var(--background-tertiary)]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {mp.pokemon?.spriteUrl ? (
                        <img
                          src={mp.pokemon.spriteUrl}
                          alt={mp.pokemon.displayName || mp.pokemon.name}
                          className={`w-10 h-10 object-contain ${(mp.deaths || 0) > 0 ? "grayscale opacity-60" : ""}`}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded bg-[var(--background-tertiary)] flex items-center justify-center">
                          <span className="text-sm">?</span>
                        </div>
                      )}
                      <span className={`font-bold text-sm ${(mp.deaths || 0) > 0 ? "line-through opacity-60" : ""}`}>
                        {mp.pokemon?.displayName || mp.pokemon?.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-sm">
                      <span className="text-[var(--success)] font-bold">{mp.kills || 0}</span>
                      <span className="text-[var(--foreground-muted)]">/</span>
                      <span className="text-[var(--error)] font-bold">{mp.deaths || 0}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-[var(--foreground-muted)] text-center py-4">No Pokemon data</p>
              )}
            </div>
          </div>

          {/* Coach 2 Pokemon */}
          <div className="poke-card p-0 overflow-hidden">
            <div className={`p-4 border-b-2 border-[var(--background-tertiary)] flex items-center justify-between ${
              coach2Won ? "bg-[var(--success)]/10" : ""
            }`}>
              <span className="font-bold text-white">{coach2?.teamAbbreviation || coach2?.teamName}</span>
              <div className="flex items-center gap-4 text-sm font-mono">
                <span className="text-[var(--success)] font-bold">{coach2Kills} K</span>
                <span className="text-[var(--error)] font-bold">{coach2Deaths} D</span>
              </div>
            </div>
            <div className="p-4 space-y-2">
              {coach2MatchPokemon.length > 0 ? (
                coach2MatchPokemon.map((mp) => (
                  <div
                    key={mp.id}
                    className={`flex items-center justify-between p-3 rounded-lg border-2 ${
                      (mp.deaths || 0) > 0
                        ? "bg-[var(--error)]/5 border-[var(--error)]/30"
                        : "bg-[var(--background-secondary)] border-[var(--background-tertiary)]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {mp.pokemon?.spriteUrl ? (
                        <img
                          src={mp.pokemon.spriteUrl}
                          alt={mp.pokemon.displayName || mp.pokemon.name}
                          className={`w-10 h-10 object-contain ${(mp.deaths || 0) > 0 ? "grayscale opacity-60" : ""}`}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded bg-[var(--background-tertiary)] flex items-center justify-center">
                          <span className="text-sm">?</span>
                        </div>
                      )}
                      <span className={`font-bold text-sm ${(mp.deaths || 0) > 0 ? "line-through opacity-60" : ""}`}>
                        {mp.pokemon?.displayName || mp.pokemon?.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-sm">
                      <span className="text-[var(--success)] font-bold">{mp.kills || 0}</span>
                      <span className="text-[var(--foreground-muted)]">/</span>
                      <span className="text-[var(--error)] font-bold">{mp.deaths || 0}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-[var(--foreground-muted)] text-center py-4">No Pokemon data</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Upcoming Match - Preview with Full Rosters */
        coach1 && coach2 && (
          <MatchPreview
            team1={{
              teamName: coach1.teamName,
              teamAbbreviation: coach1.teamAbbreviation,
              rosters: coach1.rosters,
            }}
            team2={{
              teamName: coach2.teamName,
              teamAbbreviation: coach2.teamAbbreviation,
              rosters: coach2.rosters,
            }}
            priceMap={priceMap}
          />
        )
      )}
    </div>
  );
}
