import React from "react";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { divisions, seasonCoaches, matches, playoffMatches } from "@/lib/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ScheduleSection } from "@/components/schedule-section";
import { SyncedHeightContainer } from "@/components/synced-height-container";
import { PlayoffBracket } from "@/components/playoff-bracket";
import { getAllCoachCosmetics } from "@/lib/glow-utils";
import { getGlowStyle } from "@/components/team-name-glow";
import { StandingsRow } from "@/components/standings-row";
import { computeAndSortStandings } from "@/lib/standings-sort";
import { getDivisionColor, getDivisionShadowColor } from "@/lib/division-colors";
import { KillLeaderboard } from "@/components/kill-leaderboard";
import { getSession } from "@/lib/session";
import { getPublicVisibilityState, isDivisionPubliclyVisible, isPublicSeasonVisible } from "@/lib/public-visibility";
import { DivisionMobileSubnav } from "@/components/division-mobile-subnav";
import { ShareButton } from "@/components/share-button";

type MovementRule = {
  relegationCount: number;
};

// Relegation markers by current standings.
const DIVISION_MOVEMENT_RULES: Record<string, MovementRule> = {
  infinity: { relegationCount: 2 },
  infinty: { relegationCount: 2 },
  stargazer: { relegationCount: 3 },
  sunset: { relegationCount: 3 },
  crystal: { relegationCount: 3 },
  neon: { relegationCount: 0 },
};

function getDivisionMovementRule(divisionName: string): MovementRule {
  return DIVISION_MOVEMENT_RULES[divisionName.trim().toLowerCase()] ?? {
    relegationCount: 3,
  };
}

interface PageProps {
  params: Promise<{ id: string; divId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id, divId } = await params;
  const division = await getDivision(Number(divId));
  if (!division) return { title: "Division" };
  const title = `${division.name} Division — ${division.season?.name ?? "PBO"}`;
  const description = `Standings, schedule, rosters, match results, and Pokémon leaders for the ${division.name} Division.`;
  return {
    title,
    description,
    alternates: { canonical: `/seasons/${id}/divisions/${divId}` },
    openGraph: {
      title,
      description,
      url: `/seasons/${id}/divisions/${divId}`,
    },
  };
}

async function getDivision(divisionId: number) {
  return await db.query.divisions.findFirst({
    where: eq(divisions.id, divisionId),
    with: {
      season: true,
    },
  });
}

type SeasonCoachWithCoach = Awaited<ReturnType<typeof db.query.seasonCoaches.findMany>>[0] & {
  coach: Awaited<ReturnType<typeof db.query.coaches.findMany>>[0] | null;
};

function getStandings(
  divisionId: number,
  allCoaches: SeasonCoachWithCoach[],
  allDivisionMatches: Awaited<ReturnType<typeof db.query.matches.findMany>>
) {
  // Filter coaches for this division
  const divisionCoaches = allCoaches.filter(sc => sc.divisionId === divisionId);

  // Build map of replacement -> original teams
  const replacementMap = new Map<number, number[]>(); // active team ID -> list of predecessor IDs
  for (const sc of divisionCoaches) {
    if (!sc.isActive && sc.replacedById) {
      const predecessors = replacementMap.get(sc.replacedById) || [];
      predecessors.push(sc.id);
      replacementMap.set(sc.replacedById, predecessors);
    }
  }

  // Only include active teams in standings
  const activeCoaches = divisionCoaches.filter((sc) => sc.isActive);

  const sorted = computeAndSortStandings(activeCoaches, replacementMap, allDivisionMatches);

  // Add gamesPlayed for display purposes
  return sorted.map((s) => ({
    ...s,
    gamesPlayed: s.wins + s.losses,
  }));
}

async function getKillLeaderboard(divisionId: number) {
  // Fetch both queries in parallel - filter in memory
  const [divisionMatches, allMatchPokemon] = await Promise.all([
    db.query.matches.findMany({
      where: eq(matches.divisionId, divisionId),
    }),
    db.query.matchPokemon.findMany({
      with: {
        pokemon: true,
        seasonCoach: true,
        match: true,
      },
    }),
  ]);

  const matchIds = divisionMatches.map((m) => m.id);

  if (matchIds.length === 0) return { combined: [], regular: [], playoffs: [], hasPlayoffs: false };

  // Filter to only division matches
  const divisionMatchPokemon = allMatchPokemon.filter((mp) =>
    matchIds.includes(mp.matchId)
  );

  const hasPlayoffs = divisionMatches.some((m) => m.week > 100);

  function buildLeaderboard(entries: typeof divisionMatchPokemon) {
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
        teamAbbreviation: string | null;
        latestMatchWeek: number;
      }
    >();

    for (const mp of entries) {
      const key = mp.pokemonId;
      const matchWeek = mp.match?.week || 0;

      if (!statsMap.has(key)) {
        statsMap.set(key, {
          pokemonId: mp.pokemonId,
          pokemonName: mp.pokemon?.name || "Unknown",
          pokemonDisplayName: mp.pokemon?.displayName || null,
          spriteUrl: mp.pokemon?.spriteUrl || null,
          kills: 0,
          deaths: 0,
          gamesPlayed: 0,
          teamAbbreviation: mp.seasonCoach?.teamAbbreviation || mp.seasonCoach?.teamName?.substring(0, 3).toUpperCase() || null,
          latestMatchWeek: matchWeek,
        });
      }

      const stats = statsMap.get(key)!;
      stats.kills += mp.kills || 0;
      stats.deaths += mp.deaths || 0;
      stats.gamesPlayed += 1;

      if (matchWeek > stats.latestMatchWeek) {
        stats.teamAbbreviation = mp.seasonCoach?.teamAbbreviation || mp.seasonCoach?.teamName?.substring(0, 3).toUpperCase() || null;
        stats.latestMatchWeek = matchWeek;
      }
    }

    const leaderboard = Array.from(statsMap.values()).map((s) => ({
      ...s,
      differential: s.kills - s.deaths,
    }));

    leaderboard.sort((a, b) => {
      if (b.kills !== a.kills) return b.kills - a.kills;
      if (b.differential !== a.differential) return b.differential - a.differential;
      return a.gamesPlayed - b.gamesPlayed;
    });

    return leaderboard;
  }

  return {
    combined: buildLeaderboard(divisionMatchPokemon),
    regular: buildLeaderboard(divisionMatchPokemon.filter((mp) => (mp.match?.week || 0) <= 100)),
    playoffs: buildLeaderboard(divisionMatchPokemon.filter((mp) => (mp.match?.week || 0) > 100)),
    hasPlayoffs,
  };
}

async function getSchedule(divisionId: number) {
  // Fetch matches and playoff fixtures in parallel
  const [allMatches, playoffs] = await Promise.all([
    db.query.matches.findMany({
      where: eq(matches.divisionId, divisionId),
      columns: {
        id: true,
        seasonId: true,
        divisionId: true,
        week: true,
        coach1SeasonId: true,
        coach2SeasonId: true,
        winnerId: true,
        coach1Differential: true,
        coach2Differential: true,
        isForfeit: true,
        replayUrl: true,
        scheduledAt: true,
      },
      with: {
        coach1: {
          columns: {
            id: true,
            coachId: true,
            teamName: true,
            teamAbbreviation: true,
            teamLogoUrl: true,
          },
          with: { coach: { columns: { name: true } } },
        },
        coach2: {
          columns: {
            id: true,
            coachId: true,
            teamName: true,
            teamAbbreviation: true,
            teamLogoUrl: true,
          },
          with: { coach: { columns: { name: true } } },
        },
        matchPokemon: {
          columns: {
            id: true,
            seasonCoachId: true,
            pokemonId: true,
            kills: true,
            deaths: true,
          },
          with: {
            pokemon: {
              columns: {
                id: true,
                name: true,
                displayName: true,
                spriteUrl: true,
              },
            },
          },
        },
      },
      orderBy: (m, { asc }) => [asc(m.week), asc(m.id)],
    }),
    db.query.playoffMatches.findMany({
      where: eq(playoffMatches.divisionId, divisionId),
      with: {
        higherSeed: { with: { coach: true } },
        lowerSeed: { with: { coach: true } },
      },
    }),
  ]);

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
        startedAt: null,
        endedAt: null,
        scheduledAt: null,
        turnSnapshots: null,
        keyEvents: null,
        decidingTurnsText: null,
        zoroarkInvolved: false,
        isGameOfTheWeek: false,
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

function getPlayoffBracket<T extends { matchId: number | null; higherSeedId: number | null; lowerSeedId: number | null; round: number }>(
  playoffs: T[],
  allDivisionMatches: Awaited<ReturnType<typeof db.query.matches.findMany>>
): T[] {
  // Build lookup for playoff match IDs
  const matchLookup = new Map<string, number>();
  for (const m of allDivisionMatches) {
    if (m.week > 100) {
      const key = `${m.week}-${m.coach1SeasonId}-${m.coach2SeasonId}`;
      matchLookup.set(key, m.id);
    }
  }

  // Map playoff matches to include matchId from lookup
  return playoffs.map((p): T => {
    // If matchId already set on playoff match, use it
    if (p.matchId) {
      return p;
    }
    // No teams assigned yet
    if (!p.higherSeedId || !p.lowerSeedId) {
      return { ...p, matchId: null };
    }
    // Look up match from pre-fetched data
    const playoffWeek = 100 + p.round;
    const key = `${playoffWeek}-${p.higherSeedId}-${p.lowerSeedId}`;
    const matchId = matchLookup.get(key) || null;
    return { ...p, matchId };
  });
}

export default async function DivisionPage({ params }: PageProps) {
  const resolvedParams = await params;
  const seasonId = parseInt(resolvedParams.id);
  const divisionId = parseInt(resolvedParams.divId);

  const [division, session, visibility] = await Promise.all([
    getDivision(divisionId),
    getSession(),
    getPublicVisibilityState(),
  ]);

  if (
    !division ||
    division.seasonId !== seasonId ||
    (!session?.isMod &&
      (!isDivisionPubliclyVisible(division, visibility) ||
        !division.season ||
        !isPublicSeasonVisible(division.season)))
  ) {
    notFound();
  }

  // Fetch ALL data in parallel - no sequential waits
  const [allCoaches, allDivisionMatches, playoffs, killLeaderboard, scheduleData] = await Promise.all([
    db.query.seasonCoaches.findMany({
      where: eq(seasonCoaches.divisionId, divisionId),
      with: { coach: true },
    }),
    db.query.matches.findMany({
      where: eq(matches.divisionId, divisionId),
    }),
    db.query.playoffMatches.findMany({
      where: eq(playoffMatches.divisionId, divisionId),
      with: {
        higherSeed: { with: { coach: true } },
        lowerSeed: { with: { coach: true } },
        winner: true,
      },
      orderBy: [asc(playoffMatches.round), asc(playoffMatches.bracketPosition)],
    }),
    getKillLeaderboard(divisionId),
    getSchedule(divisionId),
  ]);

  const { schedule, maxWeek } = scheduleData;

  // Process with pre-fetched data (no additional DB queries)
  const standings = getStandings(divisionId, allCoaches, allDivisionMatches);
  const playoffBracket = getPlayoffBracket(playoffs, allDivisionMatches);

  // Fetch all cosmetic data (glow, row-bg, row-border) in 2 queries instead of 6
  const coachIds = standings.map((s) => s.coachId).filter((id): id is number => id !== null);
  const cosmetics = await getAllCoachCosmetics(coachIds);
  const glowDataMap = cosmetics.glow;
  const rowBgDataMap = cosmetics.rowBg;
  const rowBorderDataMap = cosmetics.rowBorder;
  const logoFrameDataMap = cosmetics.logoFrame;

  // Only show playoffs if at least one match has teams assigned
  const hasPlayoffTeams = playoffBracket.some(
    (m) => m.higherSeedId !== null || m.lowerSeedId !== null
  );

  const divisionColor = getDivisionColor(division.name);
  const divisionShadow = getDivisionShadowColor(division.name);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div
        className="poke-card p-4 sm:p-6"
        style={{
          borderColor: `${divisionColor}55`,
          background: `linear-gradient(135deg, ${divisionColor}12, transparent 45%)`,
        }}
      >
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
              <span style={{ color: divisionColor }}>{division.name}</span>
            </div>

            {/* Title */}
            <div className="flex items-center gap-4">
              {division.logoUrl && (
                <div
                  className="w-12 h-12 rounded-lg overflow-hidden bg-[var(--background-secondary)] border-2 flex items-center justify-center"
                  style={{ borderColor: `${divisionColor}66`, boxShadow: `0 0 18px ${divisionColor}22` }}
                >
                  <Image
                    src={division.logoUrl}
                    alt={division.name}
                    width={48}
                    height={48}
                    className="object-contain"
                  />
                </div>
              )}
              <h1
                className="font-pixel text-lg sm:text-xl md:text-2xl leading-relaxed"
                style={{ color: divisionColor }}
              >
                {division.name} Division
              </h1>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
            <Link href={`/seasons/${seasonId}`}>
              <button className="btn-retro-secondary w-full justify-center py-2 px-2 sm:px-4 text-[10px] flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back
              </button>
            </Link>
            <Link href={`/seasons/${seasonId}/divisions/${divisionId}/transactions`}>
              <button className="btn-retro-secondary w-full justify-center py-2 px-2 sm:px-4 text-[10px] flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Transactions
              </button>
            </Link>
            <Link href={`/seasons/${seasonId}/divisions/${divisionId}/rosters`}>
              <button className="btn-retro w-full justify-center py-2 px-2 sm:px-4 text-[10px] flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Rosters
              </button>
            </Link>
            <ShareButton
              title={`${division.name} Division — ${division.season?.name ?? "PBO"}`}
              text={`Follow ${division.name} Division standings, schedules, and match results.`}
              path={`/seasons/${seasonId}/divisions/${divisionId}`}
              compact
            />
          </div>
        </div>
      </div>

      <DivisionMobileSubnav seasonId={seasonId} divisionId={divisionId} />

      {/* Playoff Bracket - Show at top only when teams are assigned */}
      {hasPlayoffTeams && (
        <PlayoffBracket matches={playoffBracket} />
      )}

      {/* Side by Side Tables */}
      <SyncedHeightContainer
        leftContent={
          <div
            id="standings"
            className="scroll-mt-32 poke-card p-4 sm:p-6 flex flex-col h-full"
            style={{
              borderColor: `${divisionColor}44`,
              background: `linear-gradient(180deg, ${divisionColor}0f, transparent 42%)`,
            }}
          >
            <div className="section-title !mb-4">
              <div className="section-title-icon" style={{ background: divisionColor, boxShadow: `0 4px 0 ${divisionShadow}` }}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3>Standings</h3>
            </div>
            <div className="mb-3 h-[2px] shrink-0 rounded-full" style={{ background: `linear-gradient(to right, ${divisionColor}, ${divisionColor}20)` }} />
            <div className="flex-1">
              {standings.length === 0 ? (
                <p className="text-[var(--foreground-muted)] text-center py-6 text-sm">
                  No teams yet
                </p>
              ) : (
                <div className="space-y-2">
                  {/* Header Row - matches trainer-card structure */}
                  <div className="flex items-center gap-2 sm:gap-3 px-2 pb-1 text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide border-b border-[var(--background-tertiary)]">
                    <div className="w-5 sm:w-8 shrink-0"></div>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-6 sm:w-7 shrink-0"></div>
                      <span>Team</span>
                    </div>
                    <div className="flex items-center shrink-0">
                      <span className="w-6 sm:w-8 text-center">W</span>
                      <span className="w-6 sm:w-8 text-center">L</span>
                      <span className="w-7 sm:w-10 text-center">+/-</span>
                      <span className="w-6 sm:w-8 text-center">GP</span>
                    </div>
                  </div>
                  {standings.map((team, index) => {
                    const movementRule = getDivisionMovementRule(division.name);
                    const relegationCount = Math.min(movementRule.relegationCount, standings.length);
                    const hasRelegationZone = relegationCount > 0 && standings.length > relegationCount;
                    const relegationStartIndex = standings.length - relegationCount;
                    const isInRelegationZone = hasRelegationZone && index >= relegationStartIndex;

                    return (
                      <React.Fragment key={team.id}>
                        {/* Playoff cutoff line between 8th and 9th */}
                        {index === 8 && standings.length > 8 && (
                          <div className="flex items-center gap-2 py-2">
                            <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${divisionColor}, transparent)` }} />
                            <span className="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap px-2" style={{ color: divisionColor }}>
                              Playoff Cutoff
                            </span>
                            <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${divisionColor}, transparent)` }} />
                          </div>
                        )}
                        {/* Relegation zone divider */}
                        {hasRelegationZone && index === relegationStartIndex && (
                          <div className="flex items-center gap-2 py-2">
                            <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, transparent, var(--error), transparent)" }} />
                            <span className="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap px-2 text-[var(--error)]">
                              Relegation Zone
                            </span>
                            <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, transparent, var(--error), transparent)" }} />
                          </div>
                        )}
                        <StandingsRow
                          team={team}
                          index={index}
                          isInRelegationZone={isInRelegationZone}
                          isInPromotionZone={false}
                          hasBg={!!(team.coachId && rowBgDataMap.has(team.coachId))}
                          hasBorder={!!(team.coachId && rowBorderDataMap.has(team.coachId))}
                          hasGlow={!!(team.coachId && glowDataMap.has(team.coachId))}
                          bgColor={team.coachId ? rowBgDataMap.get(team.coachId)?.colorData.color : undefined}
                          borderColor={team.coachId ? rowBorderDataMap.get(team.coachId)?.colorData.color : undefined}
                          glowStyle={team.coachId ? getGlowStyle(glowDataMap.get(team.coachId)) : undefined}
                          logoFrameSlug={team.coachId ? logoFrameDataMap.get(team.coachId)?.slug : undefined}
                          logoFrameColors={team.coachId ? logoFrameDataMap.get(team.coachId)?.colors : undefined}
                        />
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        }
        rightContent={
          <div id="leaders" className="scroll-mt-32 h-full">
            <KillLeaderboard
              combined={killLeaderboard.combined}
              regular={killLeaderboard.regular}
              playoffs={killLeaderboard.playoffs}
              hasPlayoffs={killLeaderboard.hasPlayoffs}
              divisionColor={divisionColor}
              divisionShadow={divisionShadow}
            />
          </div>
        }
      />

      {/* Schedule Section - pass empty schedule if not public */}
      <div id="schedule" className="scroll-mt-32">
        <ScheduleSection
          schedule={division.season?.isSchedulePublic === false ? {} : schedule}
          maxWeek={division.season?.isSchedulePublic === false ? 0 : maxWeek}
          divisionColor={divisionColor}
          divisionShadow={divisionShadow}
        />
      </div>
    </div>
  );
}
