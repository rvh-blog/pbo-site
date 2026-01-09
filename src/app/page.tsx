import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { seasons, matches, coaches, seasonCoaches, playoffMatches } from "@/lib/schema";
import { eq, desc, count, and, isNotNull, lte } from "drizzle-orm";

// Cache page for 5 minutes
export const revalidate = 300;

async function getCurrentSeason() {
  const result = await db.query.seasons.findFirst({
    where: eq(seasons.isCurrent, true),
    with: {
      divisions: true,
    },
  });
  if (result && result.isPublic === false) {
    return null;
  }
  return result;
}

type BattleLogItem = {
  id: number;
  matchId: number; // Actual match ID for linking
  type: "regular" | "playoff";
  week?: number;
  round?: number; // 1 = QF, 2 = SF, 3 = F
  seasonId: number;
  seasonNumber: number; // Internal season number for sorting
  team1Name?: string;
  team2Name?: string;
  team1Logo?: string | null;
  team2Logo?: string | null;
  team1Wins: number;
  team2Wins: number;
  winnerId: number | null;
  team1Id: number;
  team2Id: number;
  playedAt: string | null;
  divisionName?: string;
};

async function getRecentBattles(): Promise<BattleLogItem[]> {
  // Get regular matches (week <= 100 to exclude playoff placeholder weeks)
  // Order by seasonNumber (not seasonId) to get matches from latest season
  const regularMatches = await db.query.matches.findMany({
    where: and(isNotNull(matches.winnerId), lte(matches.week, 100)),
    orderBy: [desc(matches.seasonId), desc(matches.week)],
    limit: 50, // Get more to filter/sort properly
    with: {
      coach1: true,
      coach2: true,
      division: true,
      season: true,
    },
  });

  // Get playoff matches
  const playoffs = await db.query.playoffMatches.findMany({
    where: isNotNull(playoffMatches.winnerId),
    orderBy: [desc(playoffMatches.seasonId), desc(playoffMatches.round)],
    limit: 50,
    with: {
      higherSeed: true,
      lowerSeed: true,
      division: true,
      season: true,
    },
  });

  // Convert to unified format
  const regularBattles: BattleLogItem[] = regularMatches.map((m) => ({
    id: m.id,
    matchId: m.id,
    type: "regular" as const,
    week: m.week,
    seasonId: m.seasonId,
    seasonNumber: m.season?.seasonNumber || 0,
    team1Name: m.coach1?.teamName,
    team2Name: m.coach2?.teamName,
    team1Logo: m.coach1?.teamLogoUrl,
    team2Logo: m.coach2?.teamLogoUrl,
    team1Wins: Math.max(0, m.coach1Differential || 0),
    team2Wins: Math.max(0, m.coach2Differential || 0),
    winnerId: m.winnerId,
    team1Id: m.coach1SeasonId,
    team2Id: m.coach2SeasonId,
    playedAt: m.playedAt,
    divisionName: m.division?.name,
  }));

  // Look up corresponding match IDs for playoff matches (stored as week 100+round in matches table)
  const playoffBattles: BattleLogItem[] = await Promise.all(
    playoffs.map(async (p) => {
      // Find the corresponding match in the matches table
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
        id: p.id + 100000, // Offset to avoid ID collisions in React keys
        matchId: matchId || p.id, // Fall back to playoff ID if no match found
        type: "playoff" as const,
        round: p.round,
        seasonId: p.seasonId,
        seasonNumber: p.season?.seasonNumber || 0,
        team1Name: p.higherSeed?.teamName,
        team2Name: p.lowerSeed?.teamName,
        team1Logo: p.higherSeed?.teamLogoUrl,
        team2Logo: p.lowerSeed?.teamLogoUrl,
        team1Wins: p.higherSeedWins || 0,
        team2Wins: p.lowerSeedWins || 0,
        winnerId: p.winnerId,
        team1Id: p.higherSeedId || 0,
        team2Id: p.lowerSeedId || 0,
        playedAt: p.playedAt,
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

  // Combine and sort by seasonNumber (desc), then week/round (desc), then division order
  const allBattles = [...regularBattles, ...playoffBattles];
  allBattles.sort((a, b) => {
    // First by seasonNumber (newest/highest first)
    if (b.seasonNumber !== a.seasonNumber) return b.seasonNumber - a.seasonNumber;
    // Then by week/round (latest first)
    const aOrder = a.type === "playoff" ? 100 + (a.round || 0) : (a.week || 0);
    const bOrder = b.type === "playoff" ? 100 + (b.round || 0) : (b.week || 0);
    if (bOrder !== aOrder) return bOrder - aOrder;
    // Finally by division order (Stargazer first)
    const aDivOrder = divisionOrder[a.divisionName || ""] || 99;
    const bDivOrder = divisionOrder[b.divisionName || ""] || 99;
    return aDivOrder - bDivOrder;
  });

  return allBattles.slice(0, 8);
}

async function getStats() {
  const totalCoaches = await db.select({ count: count() }).from(coaches);
  const totalSeasons = await db.select({ count: count() }).from(seasons);
  const totalMatches = await db.select({ count: count() }).from(matches);

  return {
    coaches: totalCoaches[0].count,
    seasons: totalSeasons[0].count,
    matches: totalMatches[0].count,
  };
}

async function getStargazerChampion() {
  // Find the latest Stargazer division finals winner (by seasonNumber, not seasonId)
  const allFinals = await db.query.playoffMatches.findMany({
    where: and(
      eq(playoffMatches.round, 3), // Finals
      isNotNull(playoffMatches.winnerId)
    ),
    with: {
      division: true,
      season: true,
      winner: {
        with: { coach: true }
      },
    },
  });

  // Filter for Stargazer division and sort by seasonNumber descending
  const stargazerFinals = allFinals
    .filter(f => f.division?.name === "Stargazer")
    .sort((a, b) => (b.season?.seasonNumber || 0) - (a.season?.seasonNumber || 0));

  return stargazerFinals[0]?.winner || null;
}

async function getTopCoaches() {
  return await db.query.coaches.findMany({
    orderBy: (c, { desc }) => [desc(c.eloRating)],
    limit: 10, // More coaches to fill the taller box
  });
}

// Type color map for badges
const typeColors: Record<string, string> = {
  normal: "bg-gray-400",
  fire: "bg-orange-500",
  water: "bg-blue-500",
  electric: "bg-yellow-400",
  grass: "bg-green-500",
  ice: "bg-cyan-300",
  fighting: "bg-red-700",
  poison: "bg-purple-500",
  ground: "bg-amber-600",
  flying: "bg-indigo-300",
  psychic: "bg-pink-500",
  bug: "bg-lime-500",
  rock: "bg-amber-700",
  ghost: "bg-purple-700",
  dragon: "bg-violet-600",
  dark: "bg-gray-700",
  steel: "bg-slate-400",
  fairy: "bg-pink-300",
};

function getRoundLabel(round: number): string {
  switch (round) {
    case 1: return "QF";
    case 2: return "SF";
    case 3: return "F";
    default: return `R${round}`;
  }
}

export default async function Home() {
  const currentSeason = await getCurrentSeason();
  const recentBattles = await getRecentBattles();
  const stats = await getStats();
  const topCoaches = await getTopCoaches();
  const stargazerChampion = await getStargazerChampion();

  return (
    <div className="space-y-16">
      {/* Hero Section - "Continue Game" Feel */}
      <section className="relative">
        <div className="flex flex-col items-center justify-center space-y-8">
          {/* Welcome Text */}
          <div className="text-center space-y-4 max-w-2xl">
            <h1 className="text-4xl md:text-5xl font-bold text-white uppercase tracking-tight">
              Welcome Back, <span className="text-[var(--primary)]">Trainer</span>
            </h1>
            <p className="text-[var(--foreground-muted)] text-lg">
              {currentSeason
                ? "The league is currently in session. Review the board or manage your team."
                : "No active season. Check out past seasons or await the next draft."}
            </p>
          </div>

          {/* League Pass Card */}
          {currentSeason && (
            <div className="w-full max-w-lg mx-auto transform hover:scale-[1.02] transition-transform duration-300">
              <div className="league-pass">
                <div className="league-pass-inner flex flex-col justify-between">
                  {/* Background Pattern */}
                  <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--background-tertiary)]/30 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />

                  {/* Header */}
                  <div className="flex justify-between items-start z-10">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="live-badge">LIVE</span>
                        <span className="font-mono text-[var(--foreground-muted)] text-xs">
                          ID: {String(currentSeason.id).padStart(4, '0')}-{new Date().getFullYear()}
                        </span>
                      </div>
                      <h2 className="font-pixel text-xl md:text-2xl text-white leading-relaxed">
                        {currentSeason.name}
                      </h2>
                    </div>
                    {/* Pokeball Icon Top Right */}
                    <div className="w-12 h-12 rounded-full border-4 border-[var(--foreground-subtle)] flex items-center justify-center bg-slate-300 overflow-hidden relative shadow-inner">
                      <div className="absolute top-1/2 w-full h-1 bg-[var(--foreground-subtle)] -translate-y-1/2" />
                      <div className="absolute top-1/2 left-1/2 w-4 h-4 bg-slate-300 border-4 border-[var(--foreground-subtle)] rounded-full -translate-x-1/2 -translate-y-1/2 z-10" />
                      <div className="absolute top-0 w-full h-1/2 bg-[var(--primary)]" />
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-3 gap-4 mt-6 z-10">
                    <div className="bg-[var(--background)]/50 rounded p-2 border border-[var(--background-tertiary)]">
                      <p className="text-[10px] text-[var(--foreground-muted)] uppercase mb-1">Budget</p>
                      <p className="font-mono text-lg">{currentSeason.draftBudget}</p>
                    </div>
                    <div className="bg-[var(--background)]/50 rounded p-2 border border-[var(--background-tertiary)]">
                      <p className="text-[10px] text-[var(--foreground-muted)] uppercase mb-1">Divisions</p>
                      <p className="font-mono text-lg text-[var(--accent)]">{currentSeason.divisions.length}</p>
                    </div>
                    <div className="bg-[var(--background)]/50 rounded p-2 border border-[var(--background-tertiary)]">
                      <p className="text-[10px] text-[var(--foreground-muted)] uppercase mb-1">Status</p>
                      <p className="font-mono text-xs leading-6 text-[var(--success)] truncate">Active</p>
                    </div>
                  </div>

                  {/* Bottom Bar */}
                  <div className="mt-6 pt-4 border-t border-[var(--background-tertiary)] flex justify-between items-center z-10">
                    <div className="flex -space-x-2">
                      {currentSeason.divisions.slice(0, 3).map((div, i) => (
                        <div
                          key={div.id}
                          className={`w-6 h-6 rounded-full border-2 border-[var(--background-secondary)] ${
                            i === 0 ? 'bg-[var(--primary)]' : i === 1 ? 'bg-[var(--secondary)]' : 'bg-[var(--accent)]'
                          }`}
                          title={div.name}
                        />
                      ))}
                      {currentSeason.divisions.length > 3 && (
                        <div className="w-6 h-6 rounded-full border-2 border-[var(--background-secondary)] bg-[var(--background-tertiary)] flex items-center justify-center text-[8px]">
                          +{currentSeason.divisions.length - 3}
                        </div>
                      )}
                    </div>
                    <Link
                      href={`/seasons/${currentSeason.id}`}
                      className="text-[10px] font-pixel text-[var(--foreground-muted)] flex items-center gap-2 hover:text-white transition-colors"
                    >
                      RESUME
                      <svg className="w-3 h-3 animate-bounce-x" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </section>

      {/* Stats Strip (Game Style) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card flex flex-col items-center justify-center text-center">
          <svg className="w-6 h-6 mb-2 text-[var(--secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <div className="font-mono font-bold text-2xl text-white mb-1">{stats.coaches}</div>
          <div className="text-[10px] text-[var(--foreground-subtle)] font-bold uppercase">Coaches</div>
        </div>
        <div className="stat-card flex flex-col items-center justify-center text-center">
          <svg className="w-6 h-6 mb-2 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <div className="font-mono font-bold text-2xl text-white mb-1">{stats.seasons}</div>
          <div className="text-[10px] text-[var(--foreground-subtle)] font-bold uppercase">Seasons</div>
        </div>
        <div className="stat-card flex flex-col items-center justify-center text-center">
          {/* Crossed Swords Icon */}
          <svg className="w-6 h-6 mb-2 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6h6M6 3v6M18 21v-6M21 18h-6" />
          </svg>
          <div className="font-mono font-bold text-2xl text-white mb-1">{stats.matches}</div>
          <div className="text-[10px] text-[var(--foreground-subtle)] font-bold uppercase">Battles</div>
        </div>
        <div className="stat-card flex flex-col items-center justify-center text-center">
          {/* Trophy Icon */}
          <svg className="w-6 h-6 mb-2 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C13.1 2 14 2.9 14 4V5H16C16 3.34 14.66 2 13 2H11C9.34 2 8 3.34 8 5H10V4C10 2.9 10.9 2 12 2ZM20 6H16V8H19V9C19 11.21 17.21 13 15 13H14V15H15C18.31 15 21 12.31 21 9V8C21 6.9 20.1 6 19 6H20ZM4 6H5C4.9 6 4 6.9 4 8V9C4 12.31 6.69 15 10 15H11V13H10C7.79 13 6 11.21 6 9V8H9V6H5C3.9 6 3 6.9 3 8V9C3 12.31 5.69 15 9 15H10V17H8V19H16V17H14V15H15C18.31 15 21 12.31 21 9V8C21 6.9 20.1 6 19 6H4ZM8 6H5V8H8V6ZM10 19V21H14V19H10Z" />
          </svg>
          <div className="font-bold text-lg text-white mb-1 truncate max-w-full px-1">
            {stargazerChampion?.teamName || '--'}
          </div>
          <div className="text-[10px] text-[var(--foreground-subtle)] font-bold uppercase">Champion</div>
        </div>
      </div>

      {/* Main Content Grid - Same Height Columns */}
      <div className="grid lg:grid-cols-3 gap-6 items-stretch">
        {/* Left Column: Battle Log */}
        <div className="lg:col-span-2">
          <div className="poke-card p-6 h-full flex flex-col">
            {/* Section Title */}
            <div className="section-title">
              <div className="section-title-icon">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3>Battle Log</h3>
            </div>

            {/* Battle Log Items */}
            {recentBattles.length > 0 ? (
              <div className="space-y-3 flex-1">
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

                      {/* Matchup - Fixed width columns for alignment */}
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

                        {/* Score - Always centered */}
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
            ) : (
              <p className="text-[var(--foreground-muted)] text-center py-8 flex-1 flex items-center justify-center">No battles recorded yet</p>
            )}

            {/* View All Link */}
            {currentSeason && (
              <div className="mt-6 text-center pt-4 border-t border-[var(--background-tertiary)]">
                <Link
                  href={`/seasons/${currentSeason.id}`}
                  className="text-xs text-[var(--foreground-subtle)] hover:text-white uppercase font-bold tracking-widest transition-colors inline-flex items-center gap-2"
                >
                  View All Records
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Top Trainers */}
        <div>
          <div className="poke-card p-6 h-full flex flex-col">
            {/* Section Title */}
            <div className="section-title">
              <div className="section-title-icon">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                </svg>
              </div>
              <h3>Top Trainers</h3>
            </div>

            {/* Trainer List */}
            {topCoaches.length > 0 ? (
              <div className="space-y-3 flex-1">
                {topCoaches.map((coach, idx) => (
                  <Link key={coach.id} href={`/coaches/${coach.id}`} className="block">
                    <div className="trainer-card group">
                      {/* Rank Number */}
                      <div className={`rank-badge ${
                        idx === 0 ? 'rank-1' :
                        idx === 1 ? 'rank-2' :
                        idx === 2 ? 'rank-3' :
                        'bg-[var(--background)] text-[var(--foreground-subtle)] border border-[var(--background-tertiary)]'
                      }`}>
                        {idx + 1}
                      </div>

                      {/* Name and Type Badges */}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-[var(--foreground-muted)] group-hover:text-white transition-colors truncate">
                          {coach.name}
                        </div>
                        {/* Type Badges - using placeholder types based on rank */}
                        <div className="flex gap-1 mt-1">
                          {idx === 0 && (
                            <>
                              <span className={`px-1.5 py-0.5 text-[8px] rounded font-bold uppercase text-white ${typeColors.dragon}`}>Dragon</span>
                              <span className={`px-1.5 py-0.5 text-[8px] rounded font-bold uppercase text-white ${typeColors.steel}`}>Steel</span>
                            </>
                          )}
                          {idx === 1 && (
                            <>
                              <span className={`px-1.5 py-0.5 text-[8px] rounded font-bold uppercase text-white ${typeColors.fire}`}>Fire</span>
                              <span className={`px-1.5 py-0.5 text-[8px] rounded font-bold uppercase text-white ${typeColors.fighting}`}>Fighting</span>
                            </>
                          )}
                          {idx === 2 && (
                            <>
                              <span className={`px-1.5 py-0.5 text-[8px] rounded font-bold uppercase text-white ${typeColors.water}`}>Water</span>
                              <span className={`px-1.5 py-0.5 text-[8px] rounded font-bold uppercase text-white ${typeColors.fairy}`}>Fairy</span>
                            </>
                          )}
                          {idx === 3 && (
                            <span className={`px-1.5 py-0.5 text-[8px] rounded font-bold uppercase text-white ${typeColors.ghost}`}>Ghost</span>
                          )}
                          {idx === 4 && (
                            <span className={`px-1.5 py-0.5 text-[8px] rounded font-bold uppercase text-white ${typeColors.electric}`}>Electric</span>
                          )}
                          {idx >= 5 && (
                            <span className={`px-1.5 py-0.5 text-[8px] rounded font-bold uppercase text-white ${typeColors.normal}`}>Normal</span>
                          )}
                        </div>
                      </div>

                      {/* ELO */}
                      <div className="text-right shrink-0">
                        <div className="elo-display">{Math.round(coach.eloRating)}</div>
                        <div className="text-[9px] text-[var(--foreground-subtle)] uppercase font-bold">ELO</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-[var(--foreground-muted)] text-center py-8 flex-1 flex items-center justify-center">No trainers yet</p>
            )}

            {/* View All Link */}
            <div className="mt-6 text-center pt-4 border-t border-[var(--background-tertiary)]">
              <Link
                href="/leaderboards"
                className="text-xs text-[var(--foreground-subtle)] hover:text-white uppercase font-bold tracking-widest transition-colors inline-flex items-center gap-2"
              >
                View Full Leaderboard
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* No Season Warning */}
      {!currentSeason && (
        <section className="poke-card p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-[var(--warning)]/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[var(--warning)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="font-pixel text-sm text-[var(--warning)] mb-2">No Active Season</h3>
          <p className="text-[var(--foreground-muted)] mb-6">
            No season is currently active. Visit the admin panel to create a new season.
          </p>
          <Link href="/admin">
            <button className="btn-retro">Go to Admin Panel</button>
          </Link>
        </section>
      )}
    </div>
  );
}
