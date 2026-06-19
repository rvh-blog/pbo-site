import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { coaches, seasonCoaches, matches } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

// Helper to format week display
function formatWeekDisplay(week: number): string {
  if (week === 101) return "QF";
  if (week === 102) return "SF";
  if (week === 103) return "F";
  return `W${week}`;
}

async function getCoach(id: number) {
  return await db.query.coaches.findFirst({
    where: eq(coaches.id, id),
  });
}

async function getCoachSeasons(coachId: number) {
  const seasons = await db.query.seasonCoaches.findMany({
    where: eq(seasonCoaches.coachId, coachId),
    with: {
      division: {
        with: {
          season: true,
        },
      },
    },
  });

  return seasons.sort((a, b) => {
    const seasonA = a.division?.season?.seasonNumber ?? 0;
    const seasonB = b.division?.season?.seasonNumber ?? 0;
    return seasonB - seasonA;
  });
}

async function getCoachMatches(seasonCoachIds: number[]) {
  if (seasonCoachIds.length === 0) return [];

  const allMatches = await db.query.matches.findMany({
    with: {
      coach1: { with: { coach: true } },
      coach2: { with: { coach: true } },
      division: { with: { season: true } },
    },
  });

  const relevantMatches = allMatches.filter(
    (m) =>
      seasonCoachIds.includes(m.coach1SeasonId) ||
      seasonCoachIds.includes(m.coach2SeasonId)
  );

  // Sort by season number (highest first), then by week (highest first)
  return relevantMatches.sort((a, b) => {
    const aSeasonNum = a.division?.season?.seasonNumber || 0;
    const bSeasonNum = b.division?.season?.seasonNumber || 0;
    if (bSeasonNum !== aSeasonNum) return bSeasonNum - aSeasonNum;
    return (b.week || 0) - (a.week || 0);
  });
}

export default async function CoachMatchesPage({ params }: PageProps) {
  const resolvedParams = await params;
  const coachId = parseInt(resolvedParams.id);

  // Fetch coach and seasons in parallel - both only need coachId
  const [coach, coachSeasons] = await Promise.all([
    getCoach(coachId),
    getCoachSeasons(coachId),
  ]);

  if (!coach) {
    notFound();
  }

  const seasonCoachIds = coachSeasons.map((sc) => sc.id);
  const coachMatches = await getCoachMatches(seasonCoachIds);

  // Get most recent season entry for header
  const mostRecentSeasonEntry = coachSeasons[0];

  // Group matches by season
  const matchesBySeason = new Map<number, typeof coachMatches>();
  for (const match of coachMatches) {
    const seasonNum = match.division?.season?.seasonNumber || 0;
    if (!matchesBySeason.has(seasonNum)) {
      matchesBySeason.set(seasonNum, []);
    }
    matchesBySeason.get(seasonNum)!.push(match);
  }

  // Calculate head-to-head records
  const h2hRecords = new Map<number, {
    opponentCoachId: number;
    opponentName: string;
    wins: number;
    losses: number;
  }>();

  for (const match of coachMatches) {
    // Check for double forfeit (isForfeit but no winner)
    const isDoubleForfeit = match.isForfeit && match.winnerId === null;

    // Skip matches that aren't completed (no winner and not a forfeit)
    if (!match.winnerId && !isDoubleForfeit) continue;

    const isCoach1 = seasonCoachIds.includes(match.coach1SeasonId);
    const opponent = isCoach1 ? match.coach2 : match.coach1;
    const opponentCoachId = opponent?.coach?.id || opponent?.coachId;

    if (!opponentCoachId) continue;

    // In a double forfeit, nobody wins - both lose
    const won = !isDoubleForfeit && match.winnerId === (isCoach1 ? match.coach1SeasonId : match.coach2SeasonId);

    if (!h2hRecords.has(opponentCoachId)) {
      h2hRecords.set(opponentCoachId, {
        opponentCoachId,
        opponentName: opponent?.coach?.name || "Unknown",
        wins: 0,
        losses: 0,
      });
    }

    const record = h2hRecords.get(opponentCoachId)!;
    if (won) {
      record.wins++;
    } else {
      record.losses++;
    }
  }

  // Sort H2H by total games played (descending)
  const h2hList = Array.from(h2hRecords.values())
    .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));

  // Calculate overall stats
  let totalWins = 0;
  let totalLosses = 0;
  for (const match of coachMatches) {
    const isDoubleForfeit = match.isForfeit && match.winnerId === null;

    // Skip matches that aren't completed
    if (!match.winnerId && !isDoubleForfeit) continue;

    const isCoach1 = seasonCoachIds.includes(match.coach1SeasonId);
    const mySeasonCoachId = isCoach1 ? match.coach1SeasonId : match.coach2SeasonId;

    if (isDoubleForfeit) {
      // Double forfeit counts as a loss
      totalLosses++;
    } else if (match.winnerId === mySeasonCoachId) {
      totalWins++;
    } else {
      totalLosses++;
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="poke-card p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 mb-3 text-sm">
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
                {mostRecentSeasonEntry?.teamName || coach.name}
              </Link>
              <span className="text-[var(--foreground-subtle)]">/</span>
              <span className="text-[var(--foreground-subtle)]">Match History</span>
            </div>

            {/* Title */}
            <div className="flex items-center gap-4">
              {mostRecentSeasonEntry?.teamLogoUrl && (
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] flex items-center justify-center">
                  <Image
                    src={mostRecentSeasonEntry.teamLogoUrl}
                    alt={mostRecentSeasonEntry.teamName}
                    width={48}
                    height={48}
                    className="object-contain"
                  />
                </div>
              )}
              <div>
                <h1 className="font-pixel text-xl md:text-2xl text-white leading-relaxed">
                  Match History
                </h1>
                <p className="text-[var(--foreground-muted)]">{coach.name}</p>
              </div>
            </div>
          </div>

          {/* Stats Summary */}
          <div className="flex items-center gap-4">
            <div className="text-center px-4 py-2 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)]">
              <p className="text-xl font-bold">
                <span className="text-[var(--success)]">{totalWins}</span>
                <span className="text-[var(--foreground-muted)]">-</span>
                <span className="text-[var(--error)]">{totalLosses}</span>
              </p>
              <p className="text-[10px] text-[var(--foreground-muted)] uppercase">All-Time</p>
            </div>
            <Link href={`/coaches/${coachId}`}>
              <button className="btn-retro-secondary py-2 px-4 text-[10px] flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Profile
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content - Side by Side */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* All Matches (Left) */}
        <div className="poke-card p-0 overflow-hidden">
          <div className="p-4 border-b-2 border-[var(--background-tertiary)]">
            <div className="section-title !mb-0">
              <div className="section-title-icon">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3>All Matches</h3>
            </div>
          </div>
          <div className="p-4 max-h-[600px] overflow-y-auto">
            {Array.from(matchesBySeason.entries())
              .sort((a, b) => b[0] - a[0])
              .map(([seasonNum, seasonMatches], seasonIndex) => {
                const seasonName = seasonMatches[0]?.division?.season?.name || `Season ${seasonNum}`;
                const seasonEntry = coachSeasons.find(sc => sc.division?.season?.seasonNumber === seasonNum);

                return (
                  <div key={seasonNum}>
                    {/* Season Divider */}
                    {seasonIndex > 0 && (
                      <div className="my-4 border-t-2 border-[var(--background-tertiary)]" />
                    )}

                    {/* Season Header */}
                    <div className="flex items-center justify-between mb-2 px-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[var(--primary)]">{seasonName}</span>
                        <span className="text-xs text-[var(--foreground-muted)]">
                          {seasonEntry?.division?.name}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-[var(--foreground-muted)]">
                        {seasonMatches.filter(m => {
                          if (!m.winnerId) return false;
                          const isCoach1 = seasonCoachIds.includes(m.coach1SeasonId);
                          const mySeasonCoachId = isCoach1 ? m.coach1SeasonId : m.coach2SeasonId;
                          return m.winnerId === mySeasonCoachId;
                        }).length}W-
                        {seasonMatches.filter(m => {
                          const isDoubleForfeit = m.isForfeit && m.winnerId === null;
                          if (!m.winnerId && !isDoubleForfeit) return false;
                          if (isDoubleForfeit) return true; // Double forfeit = loss
                          const isCoach1 = seasonCoachIds.includes(m.coach1SeasonId);
                          const mySeasonCoachId = isCoach1 ? m.coach1SeasonId : m.coach2SeasonId;
                          return m.winnerId !== mySeasonCoachId;
                        }).length}L
                      </span>
                    </div>

                    {/* Matches */}
                    <div className="space-y-1">
                      {seasonMatches.map((match) => {
                        const isCoach1 = seasonCoachIds.includes(match.coach1SeasonId);
                        const opponent = isCoach1 ? match.coach2 : match.coach1;
                        const mySeasonCoachId = isCoach1 ? match.coach1SeasonId : match.coach2SeasonId;
                        const isDoubleForfeit = match.isForfeit && match.winnerId === null;
                        const hasResult = match.winnerId !== null || isDoubleForfeit;
                        const won = !isDoubleForfeit && match.winnerId === mySeasonCoachId;
                        const myDiff = isCoach1 ? (match.coach1Differential || 0) : (match.coach2Differential || 0);

                        return (
                          <div
                            key={match.id}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm ${
                              hasResult
                                ? won
                                  ? "bg-[var(--success)]/10"
                                  : "bg-[var(--error)]/10"
                                : "bg-[var(--background-secondary)]"
                            }`}
                          >
                            {/* Week */}
                            <span className={`w-8 text-[10px] font-bold ${
                              match.week > 100 ? "text-[var(--accent)]" : "text-[var(--foreground-muted)]"
                            }`}>
                              {formatWeekDisplay(match.week)}
                            </span>

                            {/* Result */}
                            <span className={`w-6 font-bold text-xs ${
                              won ? "text-[var(--success)]" : hasResult ? "text-[var(--error)]" : "text-[var(--foreground-muted)]"
                            }`}>
                              {hasResult ? (won ? "W" : "L") : "-"}
                            </span>

                            {/* Opponent */}
                            <Link
                              href={`/coaches/${opponent?.coachId}`}
                              className="flex-1 truncate hover:text-[var(--primary)] transition-colors"
                            >
                              {opponent?.teamName}
                            </Link>

                            {/* Forfeit indicator */}
                            {match.isForfeit && (
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--error)] opacity-80">
                                FF
                              </span>
                            )}

                            {/* Score */}
                            <span className={`w-10 text-right font-mono text-xs ${
                              won ? "text-[var(--success)]" : hasResult ? "text-[var(--error)]" : "text-[var(--foreground-muted)]"
                            }`}>
                              {hasResult ? `${myDiff > 0 ? "+" : ""}${myDiff}` : "-"}
                            </span>

                            {/* Actions */}
                            <div className="flex items-center gap-1 ml-1">
                              <Link
                                href={`/matches/${match.id}`}
                                className="p-1 rounded hover:bg-[var(--background-tertiary)] transition-colors"
                                title="Match Details"
                              >
                                <svg className="w-3.5 h-3.5 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                              </Link>
                              {match.replayUrl ? (
                                <a
                                  href={match.replayUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 rounded hover:bg-[var(--background-tertiary)] transition-colors"
                                  title="Watch Replay"
                                >
                                  <svg className="w-3.5 h-3.5 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                </a>
                              ) : (
                                <span className="w-5" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Head-to-Head Records (Right) */}
        <div className="poke-card p-0 overflow-hidden">
          <div className="p-4 border-b-2 border-[var(--background-tertiary)]">
            <div className="section-title !mb-0">
              <div className="section-title-icon !bg-[var(--primary)]" style={{ boxShadow: '0 4px 0 #7c3aed' }}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3>Head-to-Head</h3>
            </div>
          </div>
          <div className="p-4 max-h-[600px] overflow-y-auto">
            {h2hList.length === 0 ? (
              <p className="text-[var(--foreground-muted)] text-center py-4 text-sm">
                No completed matches yet
              </p>
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center gap-2 px-2 pb-2 mb-2 border-b border-[var(--background-tertiary)] text-[10px] font-bold text-[var(--foreground-muted)] uppercase">
                  <div className="flex-1">Opponent</div>
                  <div className="w-14 text-center">Record</div>
                  <div className="w-12 text-center">Win%</div>
                </div>
                <div className="space-y-0.5">
                  {h2hList.map((h2h) => {
                    const totalGames = h2h.wins + h2h.losses;
                    const winPct = totalGames > 0 ? Math.round((h2h.wins / totalGames) * 100) : 0;
                    const isWinning = h2h.wins > h2h.losses;
                    const isLosing = h2h.losses > h2h.wins;

                    return (
                      <Link
                        key={h2h.opponentCoachId}
                        href={`/coaches/${h2h.opponentCoachId}`}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--background-secondary)] transition-colors text-sm"
                      >
                        <div className="flex-1 truncate">
                          {h2h.opponentName}
                        </div>
                        <div className="w-14 text-center">
                          <span className={`font-bold ${isWinning ? "text-[var(--success)]" : isLosing ? "text-[var(--error)]" : ""}`}>
                            {h2h.wins}-{h2h.losses}
                          </span>
                        </div>
                        <div className="w-12 text-center">
                          <span className={`text-xs ${winPct >= 50 ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
                            {winPct}%
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
