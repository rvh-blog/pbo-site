import Link from "next/link";
import { db } from "@/lib/db";
import { seasonCoaches } from "@/lib/schema";
import { eq, count } from "drizzle-orm";

export const dynamic = 'force-dynamic';

async function getSeasons() {
  const allSeasons = await db.query.seasons.findMany({
    with: {
      divisions: true,
    },
    orderBy: (seasons, { desc }) => [desc(seasons.seasonNumber)],
  });

  // Filter to only public seasons and sort divisions by displayOrder
  const seasons = allSeasons.filter((s) => s.isPublic !== false);
  for (const season of seasons) {
    season.divisions.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  }

  // Get coach counts for each season
  const seasonsWithCounts = await Promise.all(
    seasons.map(async (season) => {
      const coachCount = await db
        .select({ count: count() })
        .from(seasonCoaches)
        .where(eq(seasonCoaches.divisionId, season.divisions[0]?.id || 0));

      let totalCoaches = 0;
      for (const div of season.divisions) {
        const divCount = await db
          .select({ count: count() })
          .from(seasonCoaches)
          .where(eq(seasonCoaches.divisionId, div.id));
        totalCoaches += divCount[0].count;
      }

      return {
        ...season,
        coachCount: totalCoaches,
      };
    })
  );

  return seasonsWithCounts;
}

export default async function SeasonsPage() {
  const seasons = await getSeasons();

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

      {seasons.length === 0 ? (
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
          {seasons.map((season) => (
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
    </div>
  );
}
