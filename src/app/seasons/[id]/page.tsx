import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { seasons, divisions, seasonCoaches, matches, playoffMatches } from "@/lib/schema";
import { eq, asc, and, isNotNull, lte, desc } from "drizzle-orm";
import { notFound } from "next/navigation";

type BattleLogItem = {
  id: number;
  matchId: number;
  type: "regular" | "playoff";
  week?: number;
  round?: number;
  team1Name?: string;
  team2Name?: string;
  team1Logo?: string | null;
  team2Logo?: string | null;
  team1Wins: number;
  team2Wins: number;
  winnerId: number | null;
  team1Id: number;
  team2Id: number;
  divisionName?: string;
};

function getRoundLabel(round: number): string {
  switch (round) {
    case 1: return "QF";
    case 2: return "SF";
    case 3: return "F";
    default: return `R${round}`;
  }
}

interface PageProps {
  params: Promise<{ id: string }>;
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

async function getStandings(divisionId: number) {
  const allCoaches = await db.query.seasonCoaches.findMany({
    where: eq(seasonCoaches.divisionId, divisionId),
    with: {
      coach: true,
    },
  });

  // Build map of replacement -> original teams
  const replacementMap = new Map<number, number[]>(); // active team ID -> list of predecessor IDs
  for (const sc of allCoaches) {
    if (!sc.isActive && sc.replacedById) {
      const predecessors = replacementMap.get(sc.replacedById) || [];
      predecessors.push(sc.id);
      replacementMap.set(sc.replacedById, predecessors);
    }
  }

  // Only include active teams in standings
  const activeCoaches = allCoaches.filter((sc) => sc.isActive);

  const standings = await Promise.all(
    activeCoaches.map(async (sc) => {
      // Get IDs to aggregate (this team + any predecessors)
      const teamIds = [sc.id, ...(replacementMap.get(sc.id) || [])];

      let wins = 0;
      let losses = 0;
      let differential = 0;

      // Aggregate stats from all team IDs (current + predecessors)
      // Only count regular season matches (week <= 100), exclude playoffs (week 101, 102, 103)
      for (const teamId of teamIds) {
        const matchesAsCoach1 = await db.query.matches.findMany({
          where: eq(matches.coach1SeasonId, teamId),
        });
        const matchesAsCoach2 = await db.query.matches.findMany({
          where: eq(matches.coach2SeasonId, teamId),
        });

        for (const m of matchesAsCoach1) {
          // Skip playoff matches (week > 100)
          if (m.week > 100) continue;
          if (m.winnerId === teamId) wins++;
          else if (m.winnerId) losses++;
          differential += m.coach1Differential || 0;
        }

        for (const m of matchesAsCoach2) {
          // Skip playoff matches (week > 100)
          if (m.week > 100) continue;
          if (m.winnerId === teamId) wins++;
          else if (m.winnerId) losses++;
          differential += m.coach2Differential || 0;
        }
      }

      return {
        ...sc,
        wins,
        losses,
        differential,
      };
    })
  );

  return standings.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.differential - a.differential;
  });
}

async function getRecentBattles(seasonId: number): Promise<BattleLogItem[]> {
  // Get regular matches (week <= 100 to exclude playoff placeholder weeks)
  const regularMatches = await db.query.matches.findMany({
    where: and(
      eq(matches.seasonId, seasonId),
      isNotNull(matches.winnerId),
      lte(matches.week, 100)
    ),
    orderBy: [desc(matches.week)],
    limit: 10,
    with: {
      coach1: true,
      coach2: true,
      division: true,
    },
  });

  // Get playoff matches for this season
  const playoffs = await db.query.playoffMatches.findMany({
    where: and(
      eq(playoffMatches.seasonId, seasonId),
      isNotNull(playoffMatches.winnerId)
    ),
    orderBy: [desc(playoffMatches.round)],
    limit: 10,
    with: {
      higherSeed: true,
      lowerSeed: true,
      division: true,
    },
  });

  // Convert regular matches to unified format
  const regularBattles: BattleLogItem[] = regularMatches.map((m) => ({
    id: m.id,
    matchId: m.id,
    type: "regular" as const,
    week: m.week,
    team1Name: m.coach1?.teamName,
    team2Name: m.coach2?.teamName,
    team1Logo: m.coach1?.teamLogoUrl,
    team2Logo: m.coach2?.teamLogoUrl,
    team1Wins: Math.max(0, m.coach1Differential || 0),
    team2Wins: Math.max(0, m.coach2Differential || 0),
    winnerId: m.winnerId,
    team1Id: m.coach1SeasonId,
    team2Id: m.coach2SeasonId,
    divisionName: m.division?.name,
  }));

  // Look up match IDs for playoffs and convert to unified format
  const playoffBattles: BattleLogItem[] = await Promise.all(
    playoffs.map(async (p) => {
      let matchId: number | null = null;
      if (p.higherSeedId && p.lowerSeedId) {
        const playoffWeek = 100 + p.round;
        const match = await db.query.matches.findFirst({
          where: and(
            eq(matches.divisionId, p.divisionId),
            eq(matches.week, playoffWeek),
            eq(matches.coach1SeasonId, p.higherSeedId),
            eq(matches.coach2SeasonId, p.lowerSeedId)
          ),
        });
        matchId = match?.id || null;
      }

      return {
        id: p.id + 100000,
        matchId: matchId || p.id,
        type: "playoff" as const,
        round: p.round,
        team1Name: p.higherSeed?.teamName,
        team2Name: p.lowerSeed?.teamName,
        team1Logo: p.higherSeed?.teamLogoUrl,
        team2Logo: p.lowerSeed?.teamLogoUrl,
        team1Wins: p.higherSeedWins || 0,
        team2Wins: p.lowerSeedWins || 0,
        winnerId: p.winnerId,
        team1Id: p.higherSeedId || 0,
        team2Id: p.lowerSeedId || 0,
        divisionName: p.division?.name,
      };
    })
  );

  // Division order priority: Stargazer, Sunset, Crystal, Neon
  const divisionOrder: Record<string, number> = {
    "Stargazer": 1,
    "Sunset": 2,
    "Crystal": 3,
    "Neon": 4,
  };

  // Combine and sort by week/round (latest first), then by division order
  const allBattles = [...regularBattles, ...playoffBattles];
  allBattles.sort((a, b) => {
    // First by week/round (latest first)
    const aOrder = a.type === "playoff" ? 100 + (a.round || 0) : (a.week || 0);
    const bOrder = b.type === "playoff" ? 100 + (b.round || 0) : (b.week || 0);
    if (bOrder !== aOrder) return bOrder - aOrder;
    // Then by division order (Stargazer first)
    const aDivOrder = divisionOrder[a.divisionName || ""] || 99;
    const bDivOrder = divisionOrder[b.divisionName || ""] || 99;
    return aDivOrder - bDivOrder;
  });

  return allBattles.slice(0, 5);
}

async function getPlayoffData(seasonId: number) {
  const playoffs = await db.query.playoffMatches.findMany({
    where: eq(playoffMatches.seasonId, seasonId),
    with: {
      division: true,
      higherSeed: { with: { coach: true } },
      lowerSeed: { with: { coach: true } },
      winner: { with: { coach: true } },
    },
    orderBy: (p, { asc }) => [asc(p.divisionId), asc(p.round), asc(p.bracketPosition)],
  });

  // Group by division
  const byDivision: Record<number, typeof playoffs> = {};
  for (const p of playoffs) {
    if (!byDivision[p.divisionId]) {
      byDivision[p.divisionId] = [];
    }
    byDivision[p.divisionId].push(p);
  }

  return byDivision;
}

export default async function SeasonPage({ params }: PageProps) {
  const resolvedParams = await params;
  const seasonId = parseInt(resolvedParams.id);
  const season = await getSeason(seasonId);

  if (!season) {
    notFound();
  }

  const recentBattles = await getRecentBattles(seasonId);
  const playoffsByDivision = await getPlayoffData(seasonId);
  const hasPlayoffs = Object.keys(playoffsByDivision).length > 0;

  return (
    <div className="space-y-10">
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
              <span className="text-[var(--foreground-subtle)]">{season.name}</span>
            </div>

            {/* Title */}
            <div className="flex items-center gap-4">
              <h1 className="font-pixel text-xl md:text-2xl text-white leading-relaxed">
                {season.name}
              </h1>
              {season.isCurrent && (
                <span className="live-badge">LIVE</span>
              )}
            </div>

            <p className="text-[var(--foreground-muted)] mt-2">
              Draft Budget: <span className="text-[var(--accent)] font-bold">{season.draftBudget} pts</span>
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <Link href={`/seasons/${season.id}/playoffs`}>
              <button className="btn-retro-secondary py-2 px-4 text-[10px] flex items-center gap-2">
                <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                </svg>
                Playoffs
              </button>
            </Link>
            <Link href={`/seasons/${season.id}/draft`}>
              <button className="btn-retro py-2 px-4 text-[10px] flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Draft Board
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* Division Quick Links */}
      <div className="flex flex-wrap gap-3">
        {season.divisions.map((div) => (
          <Link
            key={div.id}
            href={`/seasons/${season.id}/divisions/${div.id}`}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] hover:border-[var(--primary)] transition-all font-bold text-sm group"
          >
            {div.logoUrl && (
              <div className="w-6 h-6 rounded overflow-hidden bg-[var(--background-tertiary)] flex items-center justify-center">
                <Image
                  src={div.logoUrl}
                  alt={div.name}
                  width={24}
                  height={24}
                  className="object-contain group-hover:scale-110 transition-transform"
                />
              </div>
            )}
            <span className="text-[var(--foreground-muted)] group-hover:text-white transition-colors">
              {div.name}
            </span>
          </Link>
        ))}
      </div>

      {/* Playoff Preview */}
      {hasPlayoffs && (
        <Link href={`/seasons/${season.id}/playoffs`} className="block">
          <div className="poke-card p-0 overflow-hidden border-yellow-500/50 hover:border-yellow-500 transition-colors">
            <div className="px-6 py-4 bg-gradient-to-r from-yellow-500/20 to-transparent flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                </svg>
                <div>
                  <h2 className="font-pixel text-sm text-white">Playoffs Active</h2>
                  <p className="text-xs text-[var(--foreground-muted)]">View brackets and results</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-yellow-400 text-sm font-bold">
                <span>View Brackets</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
            <div className="p-6">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {season.divisions.map((div) => {
                  const divPlayoffs = playoffsByDivision[div.id] || [];
                  const finals = divPlayoffs.find(p => p.round === 3);
                  const champion = finals?.winner;
                  const inProgress = divPlayoffs.length > 0 && !champion;

                  return (
                    <div key={div.id} className="p-4 rounded-lg bg-[var(--background)]/50 border border-[var(--background-tertiary)]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm">{div.name}</span>
                        {champion ? (
                          <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                          </svg>
                        ) : inProgress ? (
                          <span className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse" />
                        ) : null}
                      </div>
                      {champion ? (
                        <div className="text-xs">
                          <span className="text-[var(--foreground-muted)]">Champion:</span>
                          <span className="ml-1 font-bold text-yellow-400">{champion.teamName}</span>
                        </div>
                      ) : inProgress ? (
                        <div className="text-xs text-[var(--foreground-muted)]">
                          {divPlayoffs.filter(p => p.winnerId).length}/{divPlayoffs.length} matches complete
                        </div>
                      ) : (
                        <div className="text-xs text-[var(--foreground-muted)]">
                          Not started
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* Standings by Division */}
      <div className="grid gap-8 lg:grid-cols-2">
        {await Promise.all(
          season.divisions.map(async (div) => {
            const standings = await getStandings(div.id);
            return (
              <div key={div.id} className="poke-card p-0 overflow-hidden group/card">
                <Link
                  href={`/seasons/${season.id}/divisions/${div.id}`}
                  className="block px-6 py-4 border-b-4 border-[var(--background-tertiary)] bg-[var(--background-secondary)] hover:bg-[var(--background-tertiary)] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {div.logoUrl && (
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-[var(--background-tertiary)] flex items-center justify-center">
                          <Image
                            src={div.logoUrl}
                            alt={div.name}
                            width={40}
                            height={40}
                            className="object-contain"
                          />
                        </div>
                      )}
                      <h2 className="font-pixel text-sm text-white">{div.name}</h2>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)] group-hover/card:text-[var(--primary)] transition-colors font-bold uppercase">
                      <span>Full Standings</span>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </Link>
                <div className="p-6">
                  {standings.length === 0 ? (
                    <p className="text-[var(--foreground-muted)] text-center py-4">
                      No coaches in this division
                    </p>
                  ) : (
                    <>
                      <table className="w-full">
                        <thead>
                          <tr className="text-[10px] text-[var(--foreground-muted)] uppercase font-bold">
                            <th className="text-left pb-3 w-12">#</th>
                            <th className="text-left pb-3">Team</th>
                            <th className="text-center pb-3 w-12">W</th>
                            <th className="text-center pb-3 w-12">L</th>
                            <th className="text-center pb-3 w-16">Diff</th>
                          </tr>
                        </thead>
                        <tbody>
                          {standings.slice(0, 4).map((s, i) => (
                            <tr key={s.id} className="border-t border-[var(--background-tertiary)]">
                              <td className="py-3">
                                <div className={`rank-badge ${i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'bg-[var(--background-tertiary)] text-[var(--foreground-muted)]'}`}>
                                  {i + 1}
                                </div>
                              </td>
                              <td className="py-3">
                                <Link
                                  href={`/coaches/${s.coachId}`}
                                  className="font-bold text-sm hover:text-[var(--primary)] transition-colors"
                                >
                                  {s.teamName}
                                </Link>
                                <p className="text-[10px] text-[var(--foreground-muted)]">
                                  {s.coach?.name}
                                </p>
                              </td>
                              <td className="py-3 text-center">
                                <span className="font-bold text-[var(--success)]">{s.wins}</span>
                              </td>
                              <td className="py-3 text-center">
                                <span className="font-bold text-[var(--error)]">{s.losses}</span>
                              </td>
                              <td className="py-3 text-center">
                                <span
                                  className={`font-bold ${
                                    s.differential > 0
                                      ? "text-[var(--success)]"
                                      : s.differential < 0
                                      ? "text-[var(--error)]"
                                      : "text-[var(--foreground-muted)]"
                                  }`}
                                >
                                  {s.differential > 0 ? "+" : ""}
                                  {s.differential}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {standings.length > 4 && (
                        <div className="mt-4 pt-4 border-t border-[var(--background-tertiary)] text-center">
                          <span className="text-xs text-[var(--foreground-muted)] font-bold">
                            +{standings.length - 4} more teams
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Recent Matches */}
      {recentBattles.length > 0 && (
        <div className="poke-card p-0 overflow-hidden">
          <div className="section-title mx-6 mt-6">
            <div className="section-title-icon">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6h6M6 3v6M18 21v-6M21 18h-6" />
              </svg>
            </div>
            <h3>Recent Battles</h3>
          </div>
          <div className="p-6 space-y-3">
            {recentBattles.map((battle) => (
              <Link
                key={battle.id}
                href={`/matches/${battle.matchId}`}
                className="block"
              >
                <div className="battle-log-item">
                  {/* Week/Round Badge */}
                  <div className={`week-badge shrink-0 ${battle.type === "playoff" ? "playoff" : ""}`}>
                    {battle.type === "playoff" ? (
                      <>
                        <span>Playoff</span>
                        <span>{getRoundLabel(battle.round || 1)}</span>
                      </>
                    ) : (
                      <>
                        <span>Week</span>
                        <span>{battle.week}</span>
                      </>
                    )}
                  </div>

                  {/* Matchup */}
                  <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    {/* Team 1 */}
                    <div className={`flex items-center gap-2 ${
                      battle.winnerId === battle.team1Id ? 'text-[var(--success)]' : 'text-[var(--foreground-muted)]'
                    }`}>
                      {battle.team1Logo && (
                        <Image
                          src={battle.team1Logo}
                          alt=""
                          width={24}
                          height={24}
                          className="rounded"
                        />
                      )}
                      <span className="font-bold text-sm truncate">
                        {battle.team1Name}
                      </span>
                    </div>

                    {/* Score */}
                    <div className="score-display whitespace-nowrap">
                      {battle.team1Wins}-{battle.team2Wins}
                    </div>

                    {/* Team 2 */}
                    <div className={`flex items-center gap-2 justify-end ${
                      battle.winnerId === battle.team2Id ? 'text-[var(--success)]' : 'text-[var(--foreground-muted)]'
                    }`}>
                      <span className="font-bold text-sm truncate text-right">
                        {battle.team2Name}
                      </span>
                      {battle.team2Logo && (
                        <Image
                          src={battle.team2Logo}
                          alt=""
                          width={24}
                          height={24}
                          className="rounded"
                        />
                      )}
                    </div>
                  </div>

                  {/* Division Badge */}
                  {battle.divisionName && (
                    <div className="shrink-0 px-2 py-1 text-[10px] font-bold rounded bg-[var(--background-tertiary)] text-[var(--foreground-muted)] uppercase">
                      {battle.divisionName}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
