import Link from "next/link";
import { db } from "@/lib/db";
import { filterPublicDivisions, getPublicVisibilityState, isPublicSeasonVisible } from "@/lib/public-visibility";

export const dynamic = 'force-dynamic';

// Legacy seasons (S1-S4) - different league structure
// S3-4 have data in DB, S1-2 are external only
const LEGACY_SEASONS = [
  { seasonNumber: 4, name: "Season 4" },
  { seasonNumber: 3, name: "Season 3" },
  {
    seasonNumber: 2,
    name: "Season 2",
    externalUrl: "https://docs.google.com/spreadsheets/d/111D9IPBCto7kKB5jnWBELhXer1IwfQOfFnNq2-sN0Co/edit",
    externalLabel: "Google Sheet",
  },
  {
    seasonNumber: 1,
    name: "Season 1",
    externalUrl: "https://www.youtube.com/playlist?list=PLgkySYBJau1M1HkU1mV7wCidYzOX_eQdQ",
    externalLabel: "YouTube Playlist",
    isVideo: true,
  },
];

// Season numbers that should appear in legacy section, not main grid
const LEGACY_SEASON_NUMBERS = new Set([1, 2, 3, 4]);

async function getSeasons() {
  // Run all queries in parallel
  const [allSeasons, allSeasonCoaches, visibility] = await Promise.all([
    db.query.seasons.findMany({
      with: {
        divisions: {
          columns: { id: true, name: true, seasonId: true, displayOrder: true, logoUrl: true },
        },
      },
      orderBy: (seasons, { desc }) => [desc(seasons.seasonNumber)],
    }),
    db.query.seasonCoaches.findMany({
      columns: { divisionId: true },
    }),
    getPublicVisibilityState(),
  ]);

  // Filter to only public seasons/divisions and sort divisions by displayOrder
  const seasons = allSeasons.filter(isPublicSeasonVisible);
  for (const season of seasons) {
    season.divisions = filterPublicDivisions(season.divisions, visibility);
    season.divisions.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  }

  // Count coaches per division in memory (no N+1 queries!)
  const coachCountByDivision = new Map<number, number>();
  for (const sc of allSeasonCoaches) {
    coachCountByDivision.set(sc.divisionId, (coachCountByDivision.get(sc.divisionId) || 0) + 1);
  }

  // Build seasons with counts using in-memory data
  const seasonsWithCounts = seasons.map((season) => {
    let totalCoaches = 0;
    for (const div of season.divisions) {
      totalCoaches += coachCountByDivision.get(div.id) || 0;
    }
    return {
      ...season,
      coachCount: totalCoaches,
    };
  });

  // Separate modern seasons from legacy seasons
  const modernSeasons = seasonsWithCounts.filter(s => !LEGACY_SEASON_NUMBERS.has(s.seasonNumber));
  const legacySeasons = seasonsWithCounts.filter(s => LEGACY_SEASON_NUMBERS.has(s.seasonNumber));

  return { modernSeasons, legacySeasons };
}

export default async function SeasonsPage() {
  const { modernSeasons, legacySeasons } = await getSeasons();

  // Build a map of legacy seasons from DB for easy lookup
  const legacySeasonMap = new Map(legacySeasons.map(s => [s.seasonNumber, s]));

  return (
    <div className="space-y-10">
      {/* Page Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl md:text-5xl font-bold text-white uppercase tracking-tight">
          Season <span className="text-[var(--primary)]">Archive</span>
        </h1>
        <p className="text-[var(--foreground-muted)] text-lg max-w-xl mx-auto">
          Browse all past and current seasons of PBO
        </p>
      </div>

      {modernSeasons.length === 0 ? (
        <div className="poke-card p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-[var(--background-tertiary)] flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[var(--foreground-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-[var(--foreground-muted)] text-lg font-bold">
            No seasons available yet.
          </p>
          <p className="text-[var(--foreground-subtle)] text-sm mt-2">
            Visit the admin panel to create your first season.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {modernSeasons.map((season) => (
            <Link key={season.id} href={`/seasons/${season.id}`} className="group block">
              <div className={`poke-card h-full p-6 transition-all duration-300 relative overflow-hidden ${
                season.isCurrent ? "border-[var(--primary)]" : ""
              } group-hover:border-[var(--primary)] group-hover:translate-y-[-2px]`}>
                {/* Current season glow */}
                {season.isCurrent && (
                  <div className="absolute -top-20 -right-20 w-40 h-40 bg-[var(--primary)] rounded-full blur-3xl opacity-20" />
                )}

                {/* Header */}
                <div className="relative flex items-start justify-between mb-4">
                  <div>
                    <h2 className="font-pixel text-sm text-white group-hover:text-[var(--primary)] transition-colors leading-relaxed">
                      {season.name}
                    </h2>
                    {season.isCurrent && (
                      <span className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 text-[10px] font-bold rounded bg-[var(--primary)] text-white">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        LIVE
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="font-pixel text-lg text-[var(--accent)]">{season.draftBudget}</span>
                    <p className="text-[10px] text-[var(--foreground-muted)] uppercase font-bold">Budget</p>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 rounded-lg bg-[var(--background)]/50 border border-[var(--background-tertiary)]">
                    <p className="font-pixel text-lg text-white">{season.divisions.length}</p>
                    <p className="text-[10px] text-[var(--foreground-muted)] uppercase font-bold">Divisions</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--background)]/50 border border-[var(--background-tertiary)]">
                    <p className="font-pixel text-lg text-white">{season.coachCount}</p>
                    <p className="text-[10px] text-[var(--foreground-muted)] uppercase font-bold">Coaches</p>
                  </div>
                </div>

                {/* Divisions */}
                <div className="flex flex-wrap gap-2">
                  {season.divisions.map((div) => (
                    <span
                      key={div.id}
                      className="px-2 py-1 text-[10px] font-bold rounded bg-[var(--background-tertiary)] text-[var(--foreground-muted)] uppercase"
                    >
                      {div.name}
                    </span>
                  ))}
                </div>

                {/* Hover arrow */}
                <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all">
                  <svg className="w-5 h-5 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Legacy Seasons Section */}
      <div className="mt-16 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-white uppercase tracking-tight">
            Legacy <span className="text-[var(--foreground-muted)]">Seasons</span>
          </h2>
          <p className="text-[var(--foreground-muted)] text-sm max-w-xl mx-auto">
            Seasons 1-4 used a different league structure which is not fully compatible with the site.
            Match results for Seasons 3 & 4 are available, but detailed Pokemon data (kills, deaths, damage) from these seasons is not.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {LEGACY_SEASONS.map((legacy) => {
            const dbSeason = legacySeasonMap.get(legacy.seasonNumber);
            const hasInternalPage = !!dbSeason;

            return (
              <div
                key={legacy.seasonNumber}
                className="poke-card p-5 border-dashed opacity-75 hover:opacity-100 transition-opacity"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-pixel text-sm text-[var(--foreground-muted)]">
                    {legacy.name}
                  </h3>
                  <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-[var(--background-tertiary)] text-[var(--foreground-subtle)] uppercase">
                    Legacy
                  </span>
                </div>

                <div className="space-y-2">
                  {hasInternalPage ? (
                    <Link
                      href={`/seasons/${dbSeason.id}`}
                      className="flex items-center justify-between p-2 rounded bg-[var(--background)]/50 border border-[var(--background-tertiary)] hover:border-[var(--primary)] hover:bg-[var(--background-tertiary)]/50 transition-all group"
                    >
                      <span className="text-xs font-medium text-[var(--foreground-muted)] group-hover:text-white transition-colors">
                        View Season
                      </span>
                      <svg className="w-4 h-4 text-[var(--foreground-subtle)] group-hover:text-[var(--primary)] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </Link>
                  ) : 'externalUrl' in legacy && legacy.externalUrl ? (
                    <a
                      href={legacy.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-2 rounded bg-[var(--background)]/50 border border-[var(--background-tertiary)] hover:border-[var(--primary)] hover:bg-[var(--background-tertiary)]/50 transition-all group"
                    >
                      <span className="text-xs font-medium text-[var(--foreground-muted)] group-hover:text-white transition-colors">
                        {legacy.externalLabel}
                      </span>
                      {'isVideo' in legacy && legacy.isVideo ? (
                        <svg className="w-4 h-4 text-[var(--error)] group-hover:text-[var(--error)]" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-[var(--foreground-subtle)] group-hover:text-[var(--primary)] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      )}
                    </a>
                  ) : (
                    <div className="flex items-center justify-center p-2 rounded bg-[var(--background)]/50 border border-[var(--background-tertiary)]">
                      <span className="text-xs text-[var(--foreground-subtle)]">Coming soon</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
