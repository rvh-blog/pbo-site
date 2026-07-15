import Link from "next/link";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { filterPublicDivisions, getPublicVisibilityState, isPublicSeasonVisible } from "@/lib/public-visibility";
import { processCombinationLeaderboards } from "@/lib/pokemon-combinations";
import { PokemonCombinationRankings } from "@/components/pokemon-combination-rankings";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "PBO Pokémon Combinations",
};

export default async function PokemonCombinationsPage() {
  const [allSeasons, allDivisions, allMatches, allMatchPokemon, session, visibility] = await Promise.all([
    db.query.seasons.findMany(),
    db.query.divisions.findMany(),
    db.query.matches.findMany(),
    db.query.matchPokemon.findMany({ with: { pokemon: true } }),
    getSession(),
    getPublicVisibilityState(),
  ]);

  const visibleSeasonIds = new Set(
    allSeasons
      .filter((season) => session?.isMod || isPublicSeasonVisible(season))
      .map((season) => season.id)
  );
  const publicDivisions = session?.isMod ? allDivisions : filterPublicDivisions(allDivisions, visibility);
  const visibleDivisionIds = new Set(
    publicDivisions
      .filter((division) => visibleSeasonIds.has(division.seasonId))
      .map((division) => division.id)
  );
  const visibleMatchIds = new Set(
    allMatches
      .filter((match) => visibleSeasonIds.has(match.seasonId) && visibleDivisionIds.has(match.divisionId))
      .map((match) => match.id)
  );
  const visibleMatchWinners = new Map(
    allMatches
      .filter((match) => visibleMatchIds.has(match.id))
      .map((match) => [match.id, match.winnerId] as const)
  );
  const leaderboards = processCombinationLeaderboards(visibleMatchIds, allMatchPokemon, visibleMatchWinners);
  const seasonCount = visibleSeasonIds.size;
  const battleCount = visibleMatchIds.size;

  return (
    <div className="space-y-8">
      <section className="poke-card p-6">
        <div className="mb-3 flex items-center gap-2 text-sm">
          <Link href="/pokemon/stats" className="text-[var(--foreground-muted)] hover:text-[var(--primary)]">Pokémon Stats</Link>
          <span className="text-[var(--foreground-subtle)]">/</span>
          <span className="text-[var(--foreground-subtle)]">Combinations</span>
        </div>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-pixel text-xl leading-relaxed text-white md:text-2xl">PBO Pokémon Combinations</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--foreground-muted)]">
              The most frequently used Pokémon pairs, trios, and quartets across every visible PBO season.
              New battle results are included automatically.
            </p>
          </div>
          <div className="flex gap-2 text-xs font-bold uppercase">
            <span className="rounded border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 py-2 text-[var(--foreground-muted)]">{seasonCount} seasons</span>
            <span className="rounded border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 py-2 text-[var(--foreground-muted)]">{battleCount} battles</span>
          </div>
        </div>
      </section>

      <PokemonCombinationRankings
        leaderboards={leaderboards}
        title="All-Time Battle Combinations"
        description="Each combination is counted once for every team lineup that brought those Pokémon together in a battle."
      />
    </div>
  );
}
