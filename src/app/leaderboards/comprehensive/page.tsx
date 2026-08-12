import type { Metadata } from "next";
import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  divisions as divisionsTable,
  matches as matchesTable,
  matchPokemon,
} from "@/lib/schema";
import { getSession } from "@/lib/session";
import {
  filterPublicDivisions,
  getPublicVisibilityState,
  isPublicSeasonVisible,
} from "@/lib/public-visibility";
import { aggregateSeasonTeamPokemonLeaderboard } from "@/lib/pokemon-leaderboard";
import { ComprehensiveLeaderboardTable } from "./comprehensive-leaderboard-table";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Comprehensive Leaderboard",
  description: "Season-by-season Pokémon kill leaders across every PBO division.",
};

interface PageProps {
  searchParams: Promise<{ season?: string | string[] }>;
}

export default async function ComprehensiveLeaderboardPage({ searchParams }: PageProps) {
  const [allSeasons, session, visibility] = await Promise.all([
    db.query.seasons.findMany(),
    getSession(),
    getPublicVisibilityState(),
  ]);

  const visibleSeasons = (session?.isMod
    ? allSeasons
    : allSeasons.filter(isPublicSeasonVisible)
  ).sort((a, b) => b.seasonNumber - a.seasonNumber);

  const query = await searchParams;
  const requestedSeason = Array.isArray(query.season) ? query.season[0] : query.season;
  const allSeasonsSelected = requestedSeason === "all";
  const requestedSeasonId = Number(requestedSeason);
  const selectedSeason = !allSeasonsSelected
    ? visibleSeasons.find((season) => season.id === requestedSeasonId)
    || visibleSeasons.find((season) => season.isCurrent)
    || visibleSeasons[0]
    || null
    : null;
  const selectedSeasonIds = allSeasonsSelected
    ? visibleSeasons.map((season) => season.id)
    : selectedSeason
      ? [selectedSeason.id]
      : [];
  const selectedSeasonLabel = allSeasonsSelected ? "All Seasons" : selectedSeason?.name || "Season";

  if (selectedSeasonIds.length === 0) {
    return (
      <div className="poke-card p-8 text-center">
        <h1 className="font-pixel text-xl text-white">Comprehensive Leaderboard</h1>
        <p className="mt-3 text-sm text-[var(--foreground-muted)]">
          No public seasons are available yet.
        </p>
      </div>
    );
  }

  const [seasonDivisions, seasonMatches] = await Promise.all([
    db.query.divisions.findMany({
      where: selectedSeasonIds.length === 1
        ? eq(divisionsTable.seasonId, selectedSeasonIds[0])
        : inArray(divisionsTable.seasonId, selectedSeasonIds),
    }),
    db.query.matches.findMany({
      columns: {
        id: true,
        divisionId: true,
        seasonId: true,
        week: true,
        coach1SeasonId: true,
        coach2SeasonId: true,
        winnerId: true,
      },
      where: selectedSeasonIds.length === 1
        ? eq(matchesTable.seasonId, selectedSeasonIds[0])
        : inArray(matchesTable.seasonId, selectedSeasonIds),
    }),
  ]);

  const visibleDivisionIds = new Set(
    (session?.isMod
      ? seasonDivisions
      : filterPublicDivisions(seasonDivisions, visibility)
    ).map((division) => division.id)
  );
  const completedVisibleMatches = seasonMatches.filter((match) => (
    visibleDivisionIds.has(match.divisionId)
    && match.winnerId !== null
    && (match.winnerId === match.coach1SeasonId || match.winnerId === match.coach2SeasonId)
  ));
  const visibleMatchIds = completedVisibleMatches
    .map((match) => match.id);
  const visibleMatchIdSet = new Set(visibleMatchIds);
  const regularSeasonMatchIdSet = new Set(
    completedVisibleMatches
      .filter((match) => match.week <= 100)
      .map((match) => match.id)
  );
  const playoffMatchIdSet = new Set(
    completedVisibleMatches
      .filter((match) => match.week > 100)
      .map((match) => match.id)
  );

  const matchPokemonRows = visibleMatchIds.length > 0
    ? await db.query.matchPokemon.findMany({
        columns: {
          matchId: true,
          pokemonId: true,
          seasonCoachId: true,
          kills: true,
          deaths: true,
        },
        where: inArray(matchPokemon.matchId, visibleMatchIds),
        with: {
          pokemon: {
            columns: {
              id: true,
              name: true,
              displayName: true,
              spriteUrl: true,
            },
          },
          match: {
            columns: {
              id: true,
              week: true,
              coach1SeasonId: true,
              coach2SeasonId: true,
              winnerId: true,
              replayUrl: true,
              playedAt: true,
            },
            with: {
              coach1: {
                columns: {
                  id: true,
                  teamName: true,
                },
              },
              coach2: {
                columns: {
                  id: true,
                  teamName: true,
                },
              },
            },
          },
          seasonCoach: {
            columns: {
              id: true,
              teamName: true,
              teamAbbreviation: true,
            },
            with: {
              coach: {
                columns: {
                  id: true,
                  name: true,
                },
              },
              division: {
                columns: {
                  name: true,
                },
                with: {
                  season: {
                    columns: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      })
    : [];

  const overallLeaderboard = aggregateSeasonTeamPokemonLeaderboard(
    visibleMatchIdSet,
    matchPokemonRows
  );
  const regularSeasonLeaderboard = aggregateSeasonTeamPokemonLeaderboard(
    regularSeasonMatchIdSet,
    matchPokemonRows
  );
  const playoffLeaderboard = aggregateSeasonTeamPokemonLeaderboard(
    playoffMatchIdSet,
    matchPokemonRows
  );
  const totalKills = overallLeaderboard.reduce((sum, pokemon) => sum + pokemon.kills, 0);
  const totalDeaths = overallLeaderboard.reduce((sum, pokemon) => sum + pokemon.deaths, 0);

  return (
    <div className="space-y-6">
      <div className="poke-card p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm">
              <Link
                href="/leaderboards"
                className="text-[var(--foreground-muted)] transition-colors hover:text-[var(--primary)]"
              >
                PBO Stats
              </Link>
              <span className="text-[var(--foreground-subtle)]">/</span>
              <span className="text-[var(--foreground-subtle)]">
                Comprehensive Leaderboard
              </span>
            </div>
            <h1 className="font-pixel text-xl leading-relaxed text-white md:text-2xl">
              Comprehensive Leaderboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--foreground-muted)]">
              Every team&apos;s Pokémon ranked together across all divisions in the selected season.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <div className="rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 py-2">
              <div className="text-lg font-black text-white">{overallLeaderboard.length}</div>
              <div className="text-[9px] font-bold uppercase text-[var(--foreground-muted)]">
                Entries
              </div>
            </div>
            <div className="rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 py-2">
              <div className="text-lg font-black text-white">{visibleMatchIds.length}</div>
              <div className="text-[9px] font-bold uppercase text-[var(--foreground-muted)]">
                Matches
              </div>
            </div>
            <div className="rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 py-2">
              <div className="text-lg font-black text-[var(--success)]">{totalKills}</div>
              <div className="text-[9px] font-bold uppercase text-[var(--foreground-muted)]">
                Kills
              </div>
            </div>
            <div className="rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 py-2">
              <div className="text-lg font-black text-[var(--error)]">{totalDeaths}</div>
              <div className="text-[9px] font-bold uppercase text-[var(--foreground-muted)]">
                Deaths
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="poke-card p-4 sm:p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wide text-white">
              Select a season
            </h2>
            <p className="mt-1 text-xs text-[var(--foreground-muted)]">
              All visible divisions are combined automatically.
            </p>
          </div>
          <span className="rounded-full bg-[var(--primary)]/15 px-3 py-1 text-xs font-bold text-[var(--primary-light)]">
            {selectedSeasonLabel}
          </span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Link
            href="/leaderboards/comprehensive?season=all"
            className={`shrink-0 rounded-lg border-2 px-3 py-2 text-xs font-bold transition-colors ${
              allSeasonsSelected
                ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                : "border-[var(--background-tertiary)] bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            All Seasons
          </Link>
          {visibleSeasons.map((season) => {
            const active = !allSeasonsSelected && season.id === selectedSeason?.id;
            return (
              <Link
                key={season.id}
                href={`/leaderboards/comprehensive?season=${season.id}`}
                className={`shrink-0 rounded-lg border-2 px-3 py-2 text-xs font-bold transition-colors ${
                  active
                    ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                    : "border-[var(--background-tertiary)] bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:text-white"
                }`}
              >
                {season.name}
              </Link>
            );
          })}
        </div>
      </div>

      <ComprehensiveLeaderboardTable
        key={selectedSeasonLabel}
        overallEntries={overallLeaderboard}
        regularSeasonEntries={regularSeasonLeaderboard}
        playoffEntries={playoffLeaderboard}
        seasonName={selectedSeasonLabel}
        divisionCount={visibleDivisionIds.size}
        showSeasonColumn={allSeasonsSelected}
      />
    </div>
  );
}
