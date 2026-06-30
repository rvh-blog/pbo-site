import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { seasons, divisions, seasonCoaches, matches, playoffMatches, matchPokemon, killEvents, moves } from "@/lib/schema";
import { eq, asc, and, isNotNull, isNull, lte, desc, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getCoachesGlow } from "@/lib/glow-utils";
import { getGlowStyle } from "@/components/team-name-glow";
import { LocalTime } from "@/components/local-time";
import { KillLeadersToggle } from "@/components/kill-leaders-toggle";
import { computeAndSortStandings } from "@/lib/standings-sort";
import { getSession } from "@/lib/session";
import { filterPublicDivisions, getPublicVisibilityState, isPublicSeasonVisible } from "@/lib/public-visibility";

const DIVISION_COLORS: Record<string, string> = {
  "Stargazer": "#3b82f6",
  "Sunset": "#fb923c",
  "Crystal": "#c084fc",
  "Neon": "#4ade80",
};

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

type UpcomingBattleItem = {
  id: number;
  matchId: number;
  week: number;
  scheduledAt: string | null;
  isUnderway: boolean;
  team1Name?: string;
  team2Name?: string;
  team1Logo?: string | null;
  team2Logo?: string | null;
  team1Id: number;
  team2Id: number;
  divisionName?: string;
  divisionDisplayOrder?: number;
};

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

async function getStandings(divisionId: number, allDivisionMatches: Awaited<ReturnType<typeof db.query.matches.findMany>>) {
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

  // Filter matches for this division
  const divMatches = allDivisionMatches.filter(m => m.divisionId === divisionId);

  return computeAndSortStandings(activeCoaches, replacementMap, divMatches);
}

async function getUpcomingBattles(seasonId: number, visibleDivisionIds?: Set<number>): Promise<UpcomingBattleItem[]> {
  // Fetch all unplayed matches for this season
  const allUnplayed = await db.query.matches.findMany({
    where: and(
      eq(matches.seasonId, seasonId),
      isNull(matches.winnerId)
    ),
    with: {
      coach1: true,
      coach2: true,
      division: true,
    },
  });

  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;

  // Primary: matches with scheduledAt, still relevant (future or <1hr past)
  const visibleUnplayed = visibleDivisionIds
    ? allUnplayed.filter((m) => visibleDivisionIds.has(m.divisionId))
    : allUnplayed;

  const scheduled = visibleUnplayed.filter((m) => {
    if (!m.scheduledAt) return false;
    const scheduledTime = new Date(m.scheduledAt).getTime();
    return scheduledTime > now - ONE_HOUR;
  });

  if (scheduled.length > 0) {
    // Sort by scheduledAt ascending (soonest first)
    scheduled.sort((a, b) =>
      new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime()
    );

    return scheduled.slice(0, 5).map((m) => ({
      id: m.id,
      matchId: m.id,
      week: m.week,
      scheduledAt: m.scheduledAt,
      isUnderway: !!m.scheduledAt && new Date(m.scheduledAt).getTime() <= now,
      team1Name: m.coach1?.teamName,
      team2Name: m.coach2?.teamName,
      team1Logo: m.coach1?.teamLogoUrl,
      team2Logo: m.coach2?.teamLogoUrl,
      team1Id: m.coach1SeasonId,
      team2Id: m.coach2SeasonId,
      divisionName: m.division?.name,
    }));
  }

  // Fallback: no scheduled games — show earliest unplayed rounds, higher divisions first
  if (visibleUnplayed.length === 0) return [];

  // Find the earliest unplayed week
  const earliestWeek = Math.min(...visibleUnplayed.map((m) => m.week));
  const earliestWeekMatches = visibleUnplayed.filter((m) => m.week === earliestWeek);

  // Sort by division displayOrder (lower = higher priority)
  earliestWeekMatches.sort((a, b) => {
    const aOrder = a.division?.displayOrder ?? 99;
    const bOrder = b.division?.displayOrder ?? 99;
    return aOrder - bOrder;
  });

  return earliestWeekMatches.slice(0, 5).map((m) => ({
    id: m.id,
    matchId: m.id,
    week: m.week,
    scheduledAt: m.scheduledAt,
    isUnderway: false,
    team1Name: m.coach1?.teamName,
    team2Name: m.coach2?.teamName,
    team1Logo: m.coach1?.teamLogoUrl,
    team2Logo: m.coach2?.teamLogoUrl,
    team1Id: m.coach1SeasonId,
    team2Id: m.coach2SeasonId,
    divisionName: m.division?.name,
  }));
}

async function getRecentBattles(
  seasonId: number,
  allSeasonMatches: Awaited<ReturnType<typeof db.query.matches.findMany>>,
  visibleDivisionIds?: Set<number>
): Promise<BattleLogItem[]> {
  const [regularMatches, playoffs] = await Promise.all([
    db.query.matches.findMany({
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
    }),
    db.query.playoffMatches.findMany({
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
    }),
  ]);

  const visibleRegularMatches = visibleDivisionIds
    ? regularMatches.filter((m) => visibleDivisionIds.has(m.divisionId))
    : regularMatches;
  const visiblePlayoffs = visibleDivisionIds
    ? playoffs.filter((p) => visibleDivisionIds.has(p.divisionId))
    : playoffs;

  const regularBattles: BattleLogItem[] = visibleRegularMatches.map((m) => ({
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

  const playoffMatchLookup = new Map<string, number>();
  for (const m of allSeasonMatches) {
    if (visibleDivisionIds && !visibleDivisionIds.has(m.divisionId)) continue;
    if (m.week > 100) {
      const key = `${m.divisionId}-${m.week}-${m.coach1SeasonId}-${m.coach2SeasonId}`;
      playoffMatchLookup.set(key, m.id);
    }
  }

  const playoffBattles: BattleLogItem[] = visiblePlayoffs.map((p) => {
    let matchId: number | null = null;
    if (p.higherSeedId && p.lowerSeedId) {
      const playoffWeek = 100 + p.round;
      const key = `${p.divisionId}-${playoffWeek}-${p.higherSeedId}-${p.lowerSeedId}`;
      matchId = playoffMatchLookup.get(key) || null;
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
  });

  const divisionOrder: Record<string, number> = {
    "Stargazer": 1,
    "Sunset": 2,
    "Crystal": 3,
    "Neon": 4,
  };

  const allBattles = [...regularBattles, ...playoffBattles];
  allBattles.sort((a, b) => {
    const aOrder = a.type === "playoff" ? 100 + (a.round || 0) : (a.week || 0);
    const bOrder = b.type === "playoff" ? 100 + (b.round || 0) : (b.week || 0);
    if (bOrder !== aOrder) return bOrder - aOrder;
    const aDivOrder = divisionOrder[a.divisionName || ""] || 99;
    const bDivOrder = divisionOrder[b.divisionName || ""] || 99;
    return aDivOrder - bDivOrder;
  });

  return allBattles.slice(0, 5);
}

async function getSeasonKillLeaderboard(seasonId: number, visibleDivisionIds?: Set<number>) {
  // Get all matches for this season
  const seasonMatches = await db.query.matches.findMany({
    where: eq(matches.seasonId, seasonId),
  });

  const matchIds = seasonMatches
    .filter((m) => !visibleDivisionIds || visibleDivisionIds.has(m.divisionId))
    .map((m) => m.id);

  if (matchIds.length === 0) return [];

  // Get all match pokemon records
  const allMatchPokemon = await db.query.matchPokemon.findMany({
    with: {
      pokemon: true,
    },
  });

  // Filter to only season matches
  const seasonMatchPokemon = allMatchPokemon.filter((mp) =>
    matchIds.includes(mp.matchId)
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
  }));

  // Sort by kills (desc), then differential (desc), then games played (asc)
  leaderboard.sort((a, b) => {
    if (b.kills !== a.kills) return b.kills - a.kills;
    if (b.differential !== a.differential) return b.differential - a.differential;
    return a.gamesPlayed - b.gamesPlayed;
  });

  return leaderboard.slice(0, 7); // Top 7 to match Recent Battles height
}

async function getSeasonMoveKillLeaderboard(seasonId: number, visibleDivisionIds?: Set<number>) {
  // Get all matches for this season
  const seasonMatches = await db.query.matches.findMany({
    where: eq(matches.seasonId, seasonId),
  });

  const matchIds = seasonMatches
    .filter((m) => !visibleDivisionIds || visibleDivisionIds.has(m.divisionId))
    .map((m) => m.id);

  if (matchIds.length === 0) return [];

  // Get all kill events for these matches with move info
  const seasonKillEvents = await db.query.killEvents.findMany({
    where: inArray(killEvents.matchId, matchIds),
    with: {
      move: true,
    },
  });

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
    // Use moveId if available, otherwise use moveName as key
    const key = event.moveId ? `id:${event.moveId}` : `name:${event.moveName || event.cause}`;
    const displayName = event.move?.displayName || event.moveName || event.cause;

    if (!moveKillsMap.has(key)) {
      moveKillsMap.set(key, {
        moveId: event.moveId,
        moveName: event.move?.name || event.moveName || event.cause,
        moveDisplayName: displayName,
        moveType: event.move?.type || null,
        kills: 0,
      });
    }

    moveKillsMap.get(key)!.kills += 1;
  }

  // Convert to array and sort by kills descending
  const leaderboard = Array.from(moveKillsMap.values());
  leaderboard.sort((a, b) => b.kills - a.kills);

  return leaderboard.slice(0, 7); // Top 7 to match Pokemon leaderboard
}

async function getPlayoffData(seasonId: number, visibleDivisionIds?: Set<number>) {
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
    if (visibleDivisionIds && !visibleDivisionIds.has(p.divisionId)) continue;
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

  // Fetch all data in parallel
  const [season, allSeasonMatches, session, visibility] = await Promise.all([
    getSeason(seasonId),
    db.query.matches.findMany({
      where: eq(matches.seasonId, seasonId),
    }),
    getSession(),
    getPublicVisibilityState(),
  ]);

  if (!season || (!session?.isMod && !isPublicSeasonVisible(season))) {
    notFound();
  }

  if (!session?.isMod) {
    season.divisions = filterPublicDivisions(season.divisions, visibility);
  }

  const visibleDivisionIds = new Set(season.divisions.map((division) => division.id));
  const visibleSeasonMatches = allSeasonMatches.filter((match) => visibleDivisionIds.has(match.divisionId));

  const [killLeaderboard, moveKillLeaderboard, playoffsByDivision] = await Promise.all([
    getSeasonKillLeaderboard(seasonId, visibleDivisionIds),
    getSeasonMoveKillLeaderboard(seasonId, visibleDivisionIds),
    getPlayoffData(seasonId, visibleDivisionIds),
  ]);

  // Compute standings for all divisions in parallel
  const allStandings = await Promise.all(
    season.divisions.map(div => getStandings(div.id, visibleSeasonMatches))
  );

  // Collect all coach IDs across all divisions and fetch glow data once
  const allCoachIds = allStandings
    .flatMap(standings => standings.map(s => s.coachId))
    .filter((id): id is number => id !== null);

  const [upcomingBattles, recentBattles, glowDataMap] = await Promise.all([
    season.isCurrent ? getUpcomingBattles(seasonId, visibleDivisionIds) : Promise.resolve([]),
    season.isCurrent ? Promise.resolve([]) : getRecentBattles(seasonId, visibleSeasonMatches, visibleDivisionIds),
    getCoachesGlow(allCoachIds),
  ]);

  const hasPlayoffs = Object.keys(playoffsByDivision).length > 0;

  return (
    <div className="space-y-10">
      {/* Page Header */}
      <div className="poke-card p-4 sm:p-6">
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
              <h1 className="font-pixel text-lg sm:text-xl md:text-2xl text-white leading-relaxed">
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
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
            <Link href={`/seasons/${season.id}/playoffs`}>
              <button className="btn-retro-secondary w-full justify-center py-2 px-3 sm:px-4 text-[10px] flex items-center gap-2">
                <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                </svg>
                Playoffs
              </button>
            </Link>
            <Link href={`/seasons/${season.id}/draft`}>
              <button className="btn-retro w-full justify-center py-2 px-3 sm:px-4 text-[10px] flex items-center gap-2">
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
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0">
        {season.divisions.map((div) => {
          const divColor = DIVISION_COLORS[div.name];
          return (
            <Link
              key={div.id}
              href={`/seasons/${season.id}/divisions/${div.id}`}
              className="flex shrink-0 items-center gap-2 px-4 py-2 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] transition-all font-bold text-sm group"
              style={{ borderBottomColor: divColor ? `${divColor}66` : undefined }}
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
          );
        })}
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
                  const divColor = DIVISION_COLORS[div.name];

                  return (
                    <div
                      key={div.id}
                      className="p-4 rounded-lg bg-[var(--background)]/50 border border-[var(--background-tertiary)]"
                      style={{ borderLeftWidth: '3px', borderLeftColor: divColor || undefined }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm" style={{ color: divColor || undefined }}>{div.name}</span>
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
      <div className="grid gap-4 sm:gap-8 lg:grid-cols-2">
        {season.divisions.map((div, divIndex) => {
            const standings = allStandings[divIndex];
            const divColor = DIVISION_COLORS[div.name];
            return (
              <div
                key={div.id}
                className="poke-card p-0 overflow-hidden group/card"
              >
                <Link
                  href={`/seasons/${season.id}/divisions/${div.id}`}
                  className="block px-6 py-4 bg-[var(--background-secondary)] hover:bg-[var(--background-tertiary)] transition-colors border-b border-[var(--background-tertiary)]"
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
                    <div className="flex items-center gap-2 text-xs font-bold uppercase transition-colors" style={{ color: divColor || 'var(--foreground-muted)' }}>
                      <span>Full Standings</span>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </Link>
                <div className="h-[2px] shrink-0" style={{ background: `linear-gradient(to right, ${divColor}, ${divColor}20)` }} />
                <div className="p-4 pt-3 sm:p-6 sm:pt-4">
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
                                  className={`font-bold text-sm hover:text-[var(--primary)] transition-colors ${s.coachId && glowDataMap.has(s.coachId) ? 'team-name-glow' : ''}`}
                                  style={s.coachId ? getGlowStyle(glowDataMap.get(s.coachId)) : undefined}
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
                        <Link href={`/seasons/${season.id}/divisions/${div.id}`} className="block mt-4 pt-4 border-t border-[var(--background-tertiary)] text-center hover:opacity-80 transition-opacity">
                          <span className="text-xs font-bold" style={{ color: divColor || 'var(--foreground-muted)' }}>
                            +{standings.length - 4} more teams
                          </span>
                        </Link>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
        })}
      </div>

      {/* Battles & Kill Leaders */}
      {(upcomingBattles.length > 0 || recentBattles.length > 0 || killLeaderboard.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Upcoming Battles (active season) - 2/3 width */}
          {upcomingBattles.length > 0 && (
            <div className="lg:col-span-2 poke-card p-0 overflow-hidden">
              <div className="section-title mx-6 mt-6">
                <div className="section-title-icon">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3>Upcoming Battles</h3>
              </div>
              <div className="p-6 space-y-3">
                {upcomingBattles.map((battle) => (
                  <Link
                    key={battle.id}
                    href={`/matches/${battle.matchId}`}
                    className="block"
                  >
                    <div className={`battle-log-item ${battle.isUnderway ? 'ring-2 ring-[var(--error)]/40' : ''}`}>
                      {/* Week Badge */}
                      <div className={`week-badge shrink-0 ${battle.week > 100 ? "playoff" : ""}`}>
                        {battle.week > 100 ? (
                          <>
                            <span>Playoff</span>
                            <span>{battle.week === 101 ? "QF" : battle.week === 102 ? "SF" : "F"}</span>
                          </>
                        ) : (
                          <>
                            <span>Week</span>
                            <span>{battle.week}</span>
                          </>
                        )}
                      </div>

                      {/* Matchup */}
                      <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-1 sm:gap-2">
                        {/* Team 1 */}
                        <div className="flex items-center gap-1 sm:gap-2 min-w-0 text-white">
                          {battle.team1Logo && (
                            <Image
                              src={battle.team1Logo}
                              alt=""
                              width={24}
                              height={24}
                              className="rounded hidden sm:block shrink-0"
                            />
                          )}
                          <span className="font-bold text-xs sm:text-sm truncate">
                            {battle.team1Name}
                          </span>
                        </div>

                        {/* LIVE / Scheduled Time / VS */}
                        {battle.isUnderway ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--error)] animate-pulse" />
                            <span className="text-xs sm:text-sm font-bold text-[var(--error)] uppercase">LIVE</span>
                          </div>
                        ) : battle.scheduledAt ? (
                          <div className="flex flex-col items-center shrink-0 whitespace-nowrap">
                            <LocalTime
                              dateString={battle.scheduledAt}
                              format="time"
                              className="text-[10px] sm:text-xs font-bold text-[var(--accent)]"
                            />
                            <LocalTime
                              dateString={battle.scheduledAt}
                              format="date"
                              className="text-[8px] sm:text-[10px] text-[var(--foreground-subtle)] uppercase"
                            />
                          </div>
                        ) : (
                          <div className="score-display whitespace-nowrap shrink-0">
                            VS
                          </div>
                        )}

                        {/* Team 2 */}
                        <div className="flex items-center gap-1 sm:gap-2 justify-end min-w-0 text-white">
                          <span className="font-bold text-xs sm:text-sm truncate text-right">
                            {battle.team2Name}
                          </span>
                          {battle.team2Logo && (
                            <Image
                              src={battle.team2Logo}
                              alt=""
                              width={24}
                              height={24}
                              className="rounded hidden sm:block shrink-0"
                            />
                          )}
                        </div>
                      </div>

                      {/* Division Badge - hidden on mobile */}
                      <div className="shrink-0 w-[72px] text-center hidden sm:block">
                        {battle.divisionName && (
                          <span
                            className="inline-block px-2 py-1 text-[10px] font-bold rounded uppercase"
                            style={battle.divisionName && DIVISION_COLORS[battle.divisionName]
                              ? { color: DIVISION_COLORS[battle.divisionName], backgroundColor: `${DIVISION_COLORS[battle.divisionName]}15`, border: `1px solid ${DIVISION_COLORS[battle.divisionName]}30` }
                              : { backgroundColor: 'var(--background-tertiary)', color: 'var(--foreground-muted)' }
                            }
                          >
                            {battle.divisionName}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Recent Battles (past season) - 2/3 width */}
          {recentBattles.length > 0 && (
            <div className="lg:col-span-2 poke-card p-0 overflow-hidden">
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
                      <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-1 sm:gap-2">
                        {/* Team 1 */}
                        <div className={`flex items-center gap-1 sm:gap-2 min-w-0 ${
                          battle.winnerId === battle.team1Id ? 'text-[var(--success)]' : 'text-[var(--foreground-muted)]'
                        }`}>
                          {battle.team1Logo && (
                            <Image
                              src={battle.team1Logo}
                              alt=""
                              width={24}
                              height={24}
                              className="rounded hidden sm:block shrink-0"
                            />
                          )}
                          <span className="font-bold text-xs sm:text-sm truncate">
                            {battle.team1Name}
                          </span>
                        </div>

                        {/* Score */}
                        <div className="score-display whitespace-nowrap shrink-0">
                          {battle.team1Wins}-{battle.team2Wins}
                        </div>

                        {/* Team 2 */}
                        <div className={`flex items-center gap-1 sm:gap-2 justify-end min-w-0 ${
                          battle.winnerId === battle.team2Id ? 'text-[var(--success)]' : 'text-[var(--foreground-muted)]'
                        }`}>
                          <span className="font-bold text-xs sm:text-sm truncate text-right">
                            {battle.team2Name}
                          </span>
                          {battle.team2Logo && (
                            <Image
                              src={battle.team2Logo}
                              alt=""
                              width={24}
                              height={24}
                              className="rounded hidden sm:block shrink-0"
                            />
                          )}
                        </div>
                      </div>

                      {/* Division Badge - hidden on mobile */}
                      <div className="shrink-0 w-[72px] text-center hidden sm:block">
                        {battle.divisionName && (
                          <span
                            className="inline-block px-2 py-1 text-[10px] font-bold rounded uppercase"
                            style={battle.divisionName && DIVISION_COLORS[battle.divisionName]
                              ? { color: DIVISION_COLORS[battle.divisionName], backgroundColor: `${DIVISION_COLORS[battle.divisionName]}15`, border: `1px solid ${DIVISION_COLORS[battle.divisionName]}30` }
                              : { backgroundColor: 'var(--background-tertiary)', color: 'var(--foreground-muted)' }
                            }
                          >
                            {battle.divisionName}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Kill Leaders - 1/3 width */}
          {killLeaderboard.length > 0 && (
            <KillLeadersToggle
              pokemonLeaderboard={killLeaderboard}
              seasonId={season.id}
            />
          )}
        </div>
      )}
    </div>
  );
}
