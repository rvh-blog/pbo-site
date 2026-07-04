import { db } from "@/lib/db";
import { seasons, divisions, seasonPokemonPrices } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { DraftBoardGrid } from "@/components/draft-board-grid";
import { getSession } from "@/lib/session";
import { filterPublicDivisions, getPublicVisibilityState, isPublicSeasonVisible } from "@/lib/public-visibility";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ division?: string }>;
}

async function getSeason(id: number) {
  const season = await db.query.seasons.findFirst({
    where: eq(seasons.id, id),
    with: {
      divisions: true,
    },
  });

  if (season) {
    // Sort divisions by displayOrder
    season.divisions.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  }

  return season;
}

async function getPokemonWithPrices(seasonId: number) {
  const prices = await db.query.seasonPokemonPrices.findMany({
    where: eq(seasonPokemonPrices.seasonId, seasonId),
    with: {
      pokemon: true,
    },
  });

  return prices.map((p) => ({
    id: p.pokemon.id,
    name: p.pokemon.name,
    displayName: p.pokemon.displayName,
    spriteUrl: p.pokemon.spriteUrl,
    types: p.pokemon.types,
    moves: p.pokemon.moves,
    price: p.price,
    teraBanned: p.teraBanned,
    teraCaptainCost: p.teraCaptainCost,
    complexBanReason: p.complexBanReason,
    // Base stats for sorting
    hp: p.pokemon.hp,
    attack: p.pokemon.attack,
    defense: p.pokemon.defense,
    specialAttack: p.pokemon.specialAttack,
    specialDefense: p.pokemon.specialDefense,
    speed: p.pokemon.speed,
  }));
}

async function getRostersByDivision(seasonId: number) {
  // Fetch all data in parallel - no N+1 queries
  const [divisionsList, allCoaches, allRosters] = await Promise.all([
    db.query.divisions.findMany({
      where: eq(divisions.seasonId, seasonId),
    }),
    db.query.seasonCoaches.findMany(),
    db.query.rosters.findMany(),
  ]);

  // Build coach lookup by seasonCoachId
  const coachById = new Map(allCoaches.map(c => [c.id, c]));

  // Build division ID set for this season
  const divisionIds = new Set(divisionsList.map(d => d.id));

  // Build rosters grouped by division
  const result: Record<number, Record<number, { teamAbbr: string; teamName: string }>> = {};

  for (const div of divisionsList) {
    result[div.id] = {};
  }

  for (const r of allRosters) {
    const coach = coachById.get(r.seasonCoachId);
    // Only count Pokemon as taken if the coach is active (ignore dropout teams)
    if (!coach || !divisionIds.has(coach.divisionId) || !coach.isActive) continue;

    const abbr = coach.teamAbbreviation || coach.teamName.substring(0, 3).toUpperCase();
    result[coach.divisionId][r.pokemonId] = {
      teamAbbr: abbr,
      teamName: coach.teamName,
    };
  }

  return result;
}

export default async function DraftBoardPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const seasonId = parseInt(resolvedParams.id);
  const [season, session, visibility, pokemonList, rostersByDivision] = await Promise.all([
    getSeason(seasonId),
    getSession(),
    getPublicVisibilityState(),
    getPokemonWithPrices(seasonId),
    getRostersByDivision(seasonId),
  ]);

  if (!season || (!session?.isMod && !isPublicSeasonVisible(season))) {
    notFound();
  }

  if (!session?.isMod) {
    season.divisions = filterPublicDivisions(season.divisions, visibility);
  }

  // Get selected division (default to first)
  const selectedDivisionId = resolvedSearchParams.division
    ? parseInt(resolvedSearchParams.division)
    : season.divisions[0]?.id;

  const selectedDivision = season.divisions.find((d) => d.id === selectedDivisionId);
  if (!selectedDivision) {
    notFound();
  }

  const ownership = rostersByDivision[selectedDivisionId] || {};

  // Complex bans shown separately as a warning, but also appear in regular tiers
  const complexBans = pokemonList.filter((p) => p.complexBanReason);
  const regularPokemon = pokemonList; // All Pokemon appear in price tiers
  const hasTeraData = pokemonList.some((p) => p.teraBanned || p.teraCaptainCost !== null);

  complexBans.sort((a, b) => a.name.localeCompare(b.name));

  const draftablePokemon = regularPokemon.filter((p) => p.price > 0);

  return (
    <div className="space-y-6">
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
                href={`/seasons/${season.id}`}
                className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors"
              >
                {season.name}
              </Link>
              <span className="text-[var(--foreground-subtle)]">/</span>
              <span className="text-[var(--foreground-subtle)]">Draft Board</span>
            </div>

            {/* Title */}
            <div className="flex items-center gap-4">
              <svg className="w-8 h-8 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <h1 className="font-pixel text-xl md:text-2xl text-white leading-relaxed">
                Draft Board
              </h1>
            </div>

            <p className="text-[var(--foreground-muted)] mt-2">
              Budget: <span className="text-[var(--accent)] font-bold">{season.draftBudget} pts</span>
            </p>
          </div>

          {/* Action Button */}
          <Link href={`/seasons/${season.id}`}>
            <button className="btn-retro-secondary py-2 px-4 text-[10px] flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Season
            </button>
          </Link>
        </div>
      </div>

      {/* Division Tabs */}
      <div className="flex flex-wrap gap-2">
        {season.divisions.map((div) => (
          <Link
            key={div.id}
            href={`/seasons/${season.id}/draft?division=${div.id}`}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border-2 ${
              div.id === selectedDivisionId
                ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                : "bg-[var(--background-secondary)] border-[var(--background-tertiary)] hover:border-[var(--primary)]"
            }`}
          >
            {div.logoUrl && (
              <Image src={div.logoUrl} alt={div.name} width={20} height={20} className="rounded" />
            )}
            {div.name}
          </Link>
        ))}
      </div>

      {/* Legend */}
      <div className="poke-card p-4">
        <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--foreground-muted)]">
          <span className="font-bold text-white uppercase text-[10px]">Legend:</span>
          {hasTeraData && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded bg-[var(--error)]/20 text-[var(--error)] font-bold border border-[var(--error)]/30">B</span>
                <span>Tera Banned</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded bg-[var(--accent)]/20 text-[var(--accent)] font-bold border border-[var(--accent)]/30">3</span>
                <span>Tera Captain Cost</span>
              </div>
            </>
          )}
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 rounded bg-[var(--primary)] text-white font-bold text-[10px]">ABC</span>
            <span>Taken by Team</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 rounded bg-[var(--warning)]/20 text-[var(--warning)] font-bold border border-[var(--warning)]/30">!</span>
            <span>Complex Ban (ability/move restricted)</span>
          </div>
        </div>
      </div>

      {/* Draft Board Grid */}
      <DraftBoardGrid
        allPokemon={draftablePokemon}
        complexBans={complexBans}
        ownership={ownership}
      />
    </div>
  );
}
