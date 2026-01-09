import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { coaches, eloHistory, seasonCoaches, matches, seasons } from "@/lib/schema";
import { eq, desc, count } from "drizzle-orm";

async function getCoachesWithStats() {
  const allCoaches = await db.query.coaches.findMany();

  // Get the latest season by season number (highest = most recent)
  const latestSeason = await db.query.seasons.findFirst({
    orderBy: [desc(seasons.seasonNumber)],
  });
  const latestSeasonId = latestSeason?.id;

  const coachesWithStats = await Promise.all(
    allCoaches.map(async (coach) => {
      // Get all season participations
      const seasonParticipations = await db.query.seasonCoaches.findMany({
        where: eq(seasonCoaches.coachId, coach.id),
        with: {
          division: {
            with: {
              season: true,
            },
          },
        },
      });

      // Sort by season number descending to get most recent first
      seasonParticipations.sort((a, b) => {
        const seasonA = a.division?.season?.seasonNumber ?? 0;
        const seasonB = b.division?.season?.seasonNumber ?? 0;
        return seasonB - seasonA;
      });

      // Get the latest/current team info
      const latestTeam = seasonParticipations[0] || null;

      // Check if coach participated in the latest season
      const isActive = seasonParticipations.some(
        (sp) => sp.division?.season?.id === latestSeasonId
      );

      // Calculate total wins and losses
      let totalWins = 0;
      let totalLosses = 0;

      for (const sc of seasonParticipations) {
        const matchesAsCoach1 = await db.query.matches.findMany({
          where: eq(matches.coach1SeasonId, sc.id),
        });
        const matchesAsCoach2 = await db.query.matches.findMany({
          where: eq(matches.coach2SeasonId, sc.id),
        });

        for (const m of matchesAsCoach1) {
          if (m.winnerId === sc.id) totalWins++;
          else if (m.winnerId) totalLosses++;
        }

        for (const m of matchesAsCoach2) {
          if (m.winnerId === sc.id) totalWins++;
          else if (m.winnerId) totalLosses++;
        }
      }

      return {
        ...coach,
        totalWins,
        totalLosses,
        winRate: totalWins + totalLosses > 0
          ? Math.round((totalWins / (totalWins + totalLosses)) * 100)
          : 0,
        seasons: seasonParticipations.length,
        isActive,
        latestTeam: latestTeam ? {
          teamName: latestTeam.teamName,
          teamAbbreviation: latestTeam.teamAbbreviation,
          teamLogoUrl: latestTeam.teamLogoUrl,
          divisionName: latestTeam.division?.name,
        } : null,
      };
    })
  );

  return coachesWithStats.sort((a, b) => b.eloRating - a.eloRating);
}

export default async function CoachesPage() {
  const coaches = await getCoachesWithStats();

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="poke-card p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="font-pixel text-xl md:text-2xl text-white leading-relaxed">
              Coaches
            </h1>
            <p className="text-sm text-[var(--foreground-muted)] mt-1">
              All coaches ranked by ELO rating
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)]">
            <svg className="w-4 h-4 text-[var(--accent)]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </svg>
            <span className="text-sm font-bold">{coaches.length} Coaches</span>
          </div>
        </div>
      </div>

      {coaches.length === 0 ? (
        <div className="poke-card p-12 text-center">
          <div className="w-16 h-16 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[var(--foreground-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <p className="text-[var(--foreground-muted)]">
            No coaches registered yet.
          </p>
        </div>
      ) : (
        <div className="poke-card p-0 overflow-hidden">
          {/* Section Header */}
          <div className="p-6 border-b-2 border-[var(--background-tertiary)]">
            <div className="section-title !mb-0">
              <div className="section-title-icon">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3>ELO Rankings</h3>
            </div>
          </div>

          {/* Coach List */}
          <div className="divide-y-2 divide-[var(--background-tertiary)]">
            {coaches.map((coach, index) => (
              <Link key={coach.id} href={`/coaches/${coach.id}`} className="block group">
                <div className="flex items-center gap-4 p-4 hover:bg-[var(--background-secondary)]/50 transition-colors">
                  {/* Rank */}
                  <div className={`rank-badge flex-shrink-0 ${
                    index === 0 ? 'rank-1' :
                    index === 1 ? 'rank-2' :
                    index === 2 ? 'rank-3' :
                    'bg-[var(--background)] text-[var(--foreground-subtle)] border border-[var(--background-tertiary)]'
                  }`}>
                    {index + 1}
                  </div>

                  {/* Team Logo / Fallback Initial */}
                  {coach.latestTeam?.teamLogoUrl ? (
                    <div className="w-10 h-10 rounded-lg bg-[var(--background-secondary)] flex items-center justify-center flex-shrink-0 border-2 border-[var(--background-tertiary)] overflow-hidden">
                      <Image
                        src={coach.latestTeam.teamLogoUrl}
                        alt={coach.latestTeam.teamName}
                        width={40}
                        height={40}
                        className="object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--primary)] to-[var(--gradient-end)] flex items-center justify-center flex-shrink-0 border-2 border-[var(--background-tertiary)]">
                      <span className="text-white font-bold text-sm">
                        {coach.latestTeam?.teamAbbreviation?.substring(0, 2) || coach.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}

                  {/* Name & Team Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm group-hover:text-[var(--primary)] transition-colors truncate">
                      {coach.name}
                    </h3>
                    <p className="text-xs text-[var(--foreground-muted)] truncate">
                      {coach.latestTeam ? (
                        <>
                          {coach.latestTeam.teamName}
                          {coach.isActive && (
                            <span className="ml-1.5 inline-flex items-center gap-1 text-[var(--success)]">
                              <span className="w-1 h-1 rounded-full bg-[var(--success)] animate-pulse" />
                              Active
                            </span>
                          )}
                        </>
                      ) : (
                        `${coach.seasons} season${coach.seasons !== 1 ? 's' : ''}`
                      )}
                    </p>
                  </div>

                  {/* Stats - Desktop */}
                  <div className="hidden md:flex items-center gap-6 text-sm">
                    <div className="text-center w-12">
                      <p className="font-bold text-[var(--success)]">{coach.totalWins}</p>
                      <p className="text-[10px] text-[var(--foreground-muted)]">W</p>
                    </div>
                    <div className="text-center w-12">
                      <p className="font-bold text-[var(--error)]">{coach.totalLosses}</p>
                      <p className="text-[10px] text-[var(--foreground-muted)]">L</p>
                    </div>
                    <div className="text-center w-12">
                      <p className="font-bold">{coach.winRate}%</p>
                      <p className="text-[10px] text-[var(--foreground-muted)]">Win</p>
                    </div>
                  </div>

                  {/* ELO */}
                  <div className={`px-3 py-1.5 rounded-lg font-mono font-bold text-sm flex-shrink-0 ${
                    coach.eloRating >= 1100
                      ? "bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/30"
                      : coach.eloRating <= 900
                      ? "bg-[var(--error)]/10 text-[var(--error)] border border-[var(--error)]/30"
                      : "bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30"
                  }`}>
                    {Math.round(coach.eloRating)}
                  </div>

                  {/* Arrow */}
                  <div className="opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all flex-shrink-0">
                    <svg className="w-4 h-4 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
