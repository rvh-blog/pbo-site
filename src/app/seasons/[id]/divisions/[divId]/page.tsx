import React from "react";
import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { divisions, seasons, seasonCoaches, matches, matchPokemon, pokemon, playoffMatches } from "@/lib/schema";
import { eq, and, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ScheduleSection } from "@/components/schedule-section";
import { SyncedHeightContainer } from "@/components/synced-height-container";
import { PlayoffBracket } from "@/components/playoff-bracket";

// Division hierarchy (1 = top, 4 = bottom)
// Stargazer (1) -> Sunset (2) -> Crystal (3) -> Neon (4)
const DIVISION_TIERS: Record<string, number> = {
  "Stargazer": 1,
  "Sunset": 2,
  "Crystal": 3,
  "Neon": 4,
};

interface PageProps {
  params: Promise<{ id: string; divId: string }>;
}

async function getDivision(divisionId: number) {
  return await db.query.divisions.findFirst({
    where: eq(divisions.id, divisionId),
    with: {
      season: true,
    },
  });
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
      let gamesPlayed = 0;

      // Aggregate stats from all team IDs (current + predecessors)
      // Only count regular season matches (week <= 100), exclude playoffs (week 101, 102, 103)
      for (const teamId of teamIds) {
        const matchesAsCoach1 = await db.query.matches.findMany({
          where: and(
            eq(matches.coach1SeasonId, teamId),
            eq(matches.divisionId, divisionId)
          ),
        });
        const matchesAsCoach2 = await db.query.matches.findMany({
          where: and(
            eq(matches.coach2SeasonId, teamId),
            eq(matches.divisionId, divisionId)
          ),
        });

        for (const m of matchesAsCoach1) {
          // Skip playoff matches (week > 100)
          if (m.week > 100) continue;
          if (m.winnerId) {
            gamesPlayed++;
            if (m.winnerId === teamId) wins++;
            else losses++;
          }
          differential += m.coach1Differential || 0;
        }

        for (const m of matchesAsCoach2) {
          // Skip playoff matches (week > 100)
          if (m.week > 100) continue;
          if (m.winnerId) {
            gamesPlayed++;
            if (m.winnerId === teamId) wins++;
            else losses++;
          }
          differential += m.coach2Differential || 0;
        }
      }

      return {
        ...sc,
        wins,
        losses,
        differential,
        gamesPlayed,
      };
    })
  );

  // Sort by wins, then differential
  return standings.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.differential - a.differential;
  });
}

async function getKillLeaderboard(divisionId: number) {
  // Get all match pokemon data for this division
  const divisionMatches = await db.query.matches.findMany({
    where: eq(matches.divisionId, divisionId),
  });

  const matchIds = divisionMatches.map((m) => m.id);

  if (matchIds.length === 0) return [];

  // Get all match pokemon records for these matches
  const allMatchPokemon = await db.query.matchPokemon.findMany({
    with: {
      pokemon: true,
      seasonCoach: true,
    },
  });

  // Filter to only division matches
  const divisionMatchPokemon = allMatchPokemon.filter((mp) =>
    matchIds.includes(mp.matchId)
  );

  // Aggregate stats by pokemon only (across all teams they played for)
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

  for (const mp of divisionMatchPokemon) {
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

  return leaderboard;
}

async function getSchedule(divisionId: number) {
  const allMatches = await db.query.matches.findMany({
    where: eq(matches.divisionId, divisionId),
    with: {
      coach1: { with: { coach: true } },
      coach2: { with: { coach: true } },
      matchPokemon: {
        with: {
          pokemon: true,
        },
      },
    },
    orderBy: (m, { asc }) => [asc(m.week), asc(m.id)],
  });

  // Get playoff fixtures that don't have match results yet
  const playoffs = await db.query.playoffMatches.findMany({
    where: eq(playoffMatches.divisionId, divisionId),
    with: {
      higherSeed: { with: { coach: true } },
      lowerSeed: { with: { coach: true } },
    },
  });

  // Group matches by week
  const schedule: Record<number, typeof allMatches> = {};
  let maxWeek = 0;

  for (const match of allMatches) {
    if (!schedule[match.week]) {
      schedule[match.week] = [];
    }
    schedule[match.week].push(match);
    maxWeek = Math.max(maxWeek, match.week);
  }

  // Add playoff fixtures that don't have corresponding matches yet
  for (const playoff of playoffs) {
    if (!playoff.higherSeedId || !playoff.lowerSeedId) continue;

    const playoffWeek = 100 + playoff.round;

    // Check if match already exists in schedule
    const existingMatch = allMatches.find(
      (m) =>
        m.week === playoffWeek &&
        m.coach1SeasonId === playoff.higherSeedId &&
        m.coach2SeasonId === playoff.lowerSeedId
    );

    if (!existingMatch && playoff.higherSeed && playoff.lowerSeed) {
      // Create a placeholder match object for the schedule
      // Use the playoff's matchId if available, otherwise negative ID
      const placeholderMatch = {
        id: playoff.matchId || -playoff.id, // Use real matchId if exists, else negative placeholder
        seasonId: playoff.seasonId,
        divisionId: playoff.divisionId,
        week: playoffWeek,
        coach1SeasonId: playoff.higherSeedId,
        coach2SeasonId: playoff.lowerSeedId,
        winnerId: null,
        coach1Differential: 0,
        coach2Differential: 0,
        isForfeit: false,
        playedAt: null,
        replayUrl: null,
        coach1: playoff.higherSeed,
        coach2: playoff.lowerSeed,
        matchPokemon: [],
      } as typeof allMatches[number];

      if (!schedule[playoffWeek]) {
        schedule[playoffWeek] = [];
      }
      schedule[playoffWeek].push(placeholderMatch);
      maxWeek = Math.max(maxWeek, playoffWeek);
    }
  }

  return { schedule, maxWeek };
}

async function getPlayoffBracket(divisionId: number) {
  const playoffs = await db.query.playoffMatches.findMany({
    where: eq(playoffMatches.divisionId, divisionId),
    with: {
      higherSeed: { with: { coach: true } },
      lowerSeed: { with: { coach: true } },
      winner: true,
    },
    orderBy: [asc(playoffMatches.round), asc(playoffMatches.bracketPosition)],
  });

  // Each playoff match should have a matchId if teams are assigned
  // Fall back to looking up by week/coaches for backwards compatibility
  const playoffsWithMatchIds = await Promise.all(
    playoffs.map(async (p) => {
      // If matchId already set on playoff match, use it
      if (p.matchId) {
        return p;
      }
      // No teams assigned yet
      if (!p.higherSeedId || !p.lowerSeedId) {
        return { ...p, matchId: null };
      }
      // Fall back to looking up match by week/coaches
      const playoffWeek = 100 + p.round;
      const match = await db.query.matches.findFirst({
        where: and(
          eq(matches.divisionId, divisionId),
          eq(matches.week, playoffWeek),
          eq(matches.coach1SeasonId, p.higherSeedId),
          eq(matches.coach2SeasonId, p.lowerSeedId)
        ),
      });
      return { ...p, matchId: match?.id || null };
    })
  );

  return playoffsWithMatchIds;
}

export default async function DivisionPage({ params }: PageProps) {
  const resolvedParams = await params;
  const seasonId = parseInt(resolvedParams.id);
  const divisionId = parseInt(resolvedParams.divId);

  const division = await getDivision(divisionId);

  if (!division || division.seasonId !== seasonId) {
    notFound();
  }

  const standings = await getStandings(divisionId);
  const killLeaderboard = await getKillLeaderboard(divisionId);
  const { schedule, maxWeek } = await getSchedule(divisionId);
  const playoffBracket = await getPlayoffBracket(divisionId);

  // Only show playoffs if at least one match has teams assigned
  const hasPlayoffTeams = playoffBracket.some(
    (m) => m.higherSeedId !== null || m.lowerSeedId !== null
  );

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
                href={`/seasons/${seasonId}`}
                className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors"
              >
                {division.season?.name}
              </Link>
              <span className="text-[var(--foreground-subtle)]">/</span>
              <span className="text-[var(--foreground-subtle)]">{division.name}</span>
            </div>

            {/* Title */}
            <div className="flex items-center gap-4">
              {division.logoUrl && (
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] flex items-center justify-center">
                  <Image
                    src={division.logoUrl}
                    alt={division.name}
                    width={48}
                    height={48}
                    className="object-contain"
                  />
                </div>
              )}
              <h1 className="font-pixel text-xl md:text-2xl text-white leading-relaxed">
                {division.name} Division
              </h1>
            </div>
          </div>

          {/* Action Button */}
          <Link href={`/seasons/${seasonId}`}>
            <button className="btn-retro-secondary py-2 px-4 text-[10px] flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Season
            </button>
          </Link>
        </div>
      </div>

      {/* Playoff Bracket - Show at top only when teams are assigned */}
      {hasPlayoffTeams && (
        <PlayoffBracket matches={playoffBracket} />
      )}

      {/* Side by Side Tables */}
      <SyncedHeightContainer
        leftContent={
          <div className="poke-card p-6 flex flex-col h-full">
            <div className="section-title">
              <div className="section-title-icon">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3>Standings</h3>
            </div>
            <div className="flex-1">
              {standings.length === 0 ? (
                <p className="text-[var(--foreground-muted)] text-center py-6 text-sm">
                  No teams yet
                </p>
              ) : (
                <div className="space-y-2">
                  {/* Header Row */}
                  <div className="flex items-center gap-3 px-2 pb-2 border-b border-[var(--background-tertiary)] text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide">
                    <div className="w-8"></div>
                    <div className="flex-1">Team</div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="w-8 text-center">W</span>
                      <span className="w-8 text-center">L</span>
                      <span className="w-10 text-center">+/-</span>
                      <span className="w-8 text-center">GP</span>
                    </div>
                  </div>
                  {standings.map((team, index) => {
                    const divisionTier = DIVISION_TIERS[division.name] || 2;
                    const isBottomDivision = divisionTier === 4;
                    const relegationStartIndex = standings.length - 2;
                    const isInRelegationZone = !isBottomDivision && index >= relegationStartIndex;

                    return (
                      <React.Fragment key={team.id}>
                        {/* Playoff cutoff line between 8th and 9th */}
                        {index === 8 && standings.length > 8 && (
                          <div className="flex items-center gap-2 py-2">
                            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--primary)] to-transparent" />
                            <span className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-wider whitespace-nowrap px-2">
                              Playoff Cutoff
                            </span>
                            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--primary)] to-transparent" />
                          </div>
                        )}
                        {/* Relegation zone divider */}
                        {!isBottomDivision && index === relegationStartIndex && standings.length > 2 && (
                          <div className="flex items-center gap-2 py-2">
                            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--error)] to-transparent" />
                            <span className="text-[10px] font-bold text-[var(--error)] uppercase tracking-wider whitespace-nowrap px-2">
                              Relegation Zone
                            </span>
                            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--error)] to-transparent" />
                          </div>
                        )}
                        <Link href={`/coaches/${team.coachId}`} className="block">
                          <div className={`trainer-card ${
                            index < 8 ? 'border-l-2 border-l-[var(--success)]/50' : ''
                          } ${isInRelegationZone ? 'border-l-2 border-l-[var(--error)]/50' : ''}`}>
                            {/* Rank Badge */}
                            <div className={`rank-badge ${
                              index === 0 ? 'rank-1' :
                              index === 1 ? 'rank-2' :
                              index === 2 ? 'rank-3' :
                              'bg-[var(--background)] text-[var(--foreground-subtle)] border border-[var(--background-tertiary)]'
                            }`}>
                              {index + 1}
                            </div>

                            {/* Team Info */}
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {team.teamLogoUrl ? (
                                <div className="w-7 h-7 rounded overflow-hidden bg-[var(--background-tertiary)] flex items-center justify-center flex-shrink-0">
                                  <Image
                                    src={team.teamLogoUrl}
                                    alt={team.teamName}
                                    width={28}
                                    height={28}
                                    className="object-contain"
                                  />
                                </div>
                              ) : (
                                <div className="w-7 h-7 rounded bg-[var(--primary)] flex items-center justify-center flex-shrink-0">
                                  <span className="text-white font-bold text-xs">
                                    {team.teamAbbreviation || team.teamName.substring(0, 2).toUpperCase()}
                                  </span>
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="font-bold text-sm text-[var(--foreground-muted)] group-hover:text-white transition-colors truncate">
                                  {team.teamName}
                                </div>
                                <div className="text-xs text-[var(--foreground-subtle)] truncate">
                                  {team.coach?.name}
                                </div>
                              </div>
                            </div>

                            {/* Stats */}
                            <div className="flex items-center gap-4 shrink-0 text-sm font-mono">
                              <span className="font-bold text-[var(--success)] w-8 text-center">{team.wins}</span>
                              <span className="font-bold text-[var(--error)] w-8 text-center">{team.losses}</span>
                              <span className="font-bold text-white w-10 text-center">
                                {team.differential > 0 ? "+" : ""}{team.differential}
                              </span>
                              <span className="text-[var(--foreground-muted)] w-8 text-center">{team.gamesPlayed}</span>
                            </div>
                          </div>
                        </Link>
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        }
        rightContent={
          <div className="poke-card p-6 flex flex-col h-full">
            <div className="section-title">
              <div className="section-title-icon !bg-[var(--error)]" style={{ boxShadow: '0 4px 0 #991b1b' }}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3>Kill Leaders</h3>
            </div>
            {killLeaderboard.length === 0 ? (
              <p className="text-[var(--foreground-muted)] text-center py-6 text-sm">
                No battle data yet
              </p>
            ) : (
              <>
                {/* Header Row - Fixed */}
                <div className="flex items-center gap-3 px-2 pb-2 mb-2 border-b border-[var(--background-tertiary)] text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide">
                  <div className="w-8"></div>
                  <div className="flex-1">Pokemon</div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="w-8 text-center">K</span>
                    <span className="w-8 text-center">D</span>
                    <span className="w-10 text-center">+/-</span>
                    <span className="w-8 text-center">GP</span>
                  </div>
                </div>
                {/* Scrollable List */}
                <div className="flex-1 overflow-y-auto space-y-2">
                  {killLeaderboard.map((entry, index) => (
                    <div key={`${entry.pokemonId}-${index}`} className="trainer-card group">
                      {/* Rank Badge */}
                      <div className={`rank-badge ${
                        index === 0 ? 'rank-1' :
                        index === 1 ? 'rank-2' :
                        index === 2 ? 'rank-3' :
                        'bg-[var(--background)] text-[var(--foreground-subtle)] border border-[var(--background-tertiary)]'
                      }`}>
                        {index + 1}
                      </div>

                      {/* Pokemon Info */}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {entry.spriteUrl ? (
                          <div className="w-7 h-7 rounded bg-[var(--background-tertiary)] flex items-center justify-center overflow-hidden flex-shrink-0">
                            <img
                              src={entry.spriteUrl}
                              alt={entry.pokemonDisplayName || entry.pokemonName}
                              className="w-6 h-6 object-contain group-hover:scale-110 transition-transform"
                            />
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded bg-[var(--background-tertiary)] flex items-center justify-center flex-shrink-0">
                            <span className="text-[var(--foreground-muted)] text-xs">?</span>
                          </div>
                        )}
                        <span className="font-bold text-sm text-[var(--foreground-muted)] group-hover:text-white transition-colors truncate">
                          {entry.pokemonDisplayName || entry.pokemonName}
                        </span>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-4 shrink-0 text-sm font-mono">
                        <span className="font-bold text-[var(--success)] w-8 text-center">{entry.kills}</span>
                        <span className="font-bold text-[var(--error)] w-8 text-center">{entry.deaths}</span>
                        <span className="font-bold text-white w-10 text-center">
                          {entry.differential > 0 ? "+" : ""}{entry.differential}
                        </span>
                        <span className="text-[var(--foreground-muted)] w-8 text-center">{entry.gamesPlayed}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        }
      />

      {/* Schedule Section */}
      <ScheduleSection schedule={schedule} maxWeek={maxWeek} />
    </div>
  );
}
