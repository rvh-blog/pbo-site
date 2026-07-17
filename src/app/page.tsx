import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getActivePoll } from "@/lib/polls";
import { getSiteFeatureSettings } from "@/lib/site-settings";
import { PollCard } from "@/components/poll-card";
import { SyncedHeightGrid } from "@/components/synced-height-grid";
import { HomeLiveDraftRefresh } from "@/components/home-live-draft-refresh";
import { seasons, matches, coaches, seasonCoaches, playoffMatches, coachPurchases, storeItems } from "@/lib/schema";
import { eq, desc, asc, count, and, or, isNotNull, isNull, inArray } from "drizzle-orm";
import { compareDivisionNames, DIVISION_HIERARCHY } from "@/lib/division-order";

export const dynamic = 'force-dynamic';

const DIVISION_COLORS: Record<string, string> = {
  "Infinity": "#E2A3C7",
  "Infinty": "#E2A3C7",
  "Stargazer": "#3b82f6",
  "Sunset": "#fb923c",
  "Crystal": "#c084fc",
  "Neon": "#4ade80",
};

const DIVISION_ORDER = DIVISION_HIERARCHY;
const DRAFT_DIVISION_ORDER = DIVISION_HIERARCHY;
const RULEBOOK_URL = "https://docs.google.com/document/d/1BG35hVyaiSETTEmSNRON6ASE6ctepZf2yXCIxw2MAvM/edit?pli=1&tab=t.0#heading=h.ygaa1qaijmal";

function normalizeDivisionName(name: string) {
  const normalized = name.trim().toLowerCase();
  return normalized === "infinty" ? "infinity" : normalized;
}

type OffseasonChampion = {
  divisionId: number | null;
  divisionName: string;
  seasonId: number | null;
  seasonNumber: number | null;
  teamName: string | null;
  teamLogoUrl: string | null;
  coachName: string | null;
};

async function getCurrentGamesOfTheWeek(
  currentSeasonPromise: Promise<Awaited<ReturnType<typeof getCurrentSeason>>>
) {
  const currentSeason = await currentSeasonPromise;
  if (!currentSeason) return [];

  const featuredMatches = await db.query.matches.findMany({
    where: and(
      eq(matches.seasonId, currentSeason.id),
      eq(matches.isGameOfTheWeek, true)
    ),
    with: {
      division: true,
      coach1: true,
      coach2: true,
    },
  });

  if (featuredMatches.length === 0) return [];

  const displayWeek = Math.max(...featuredMatches.map((match) => match.week));

  return featuredMatches
    .filter((match) => match.week === displayWeek)
    .sort((a, b) => {
      const normalizedOrder = DRAFT_DIVISION_ORDER.map(normalizeDivisionName);
      const aOrder = normalizedOrder.indexOf(normalizeDivisionName(a.division?.name || ""));
      const bOrder = normalizedOrder.indexOf(normalizeDivisionName(b.division?.name || ""));
      return (aOrder === -1 ? 99 : aOrder) - (bOrder === -1 ? 99 : bOrder);
    });
}

async function getCurrentSeason() {
  return await db.query.seasons.findFirst({
    where: and(
      eq(seasons.isCurrent, true),
      or(eq(seasons.isPublic, true), isNull(seasons.isPublic))
    ),
    with: {
      divisions: true,
    },
    orderBy: [desc(seasons.seasonNumber)],
  });
}

async function getPreviousSeasonChampions(): Promise<OffseasonChampion[]> {
  const latestPublicSeason = await db.query.seasons.findFirst({
    where: or(eq(seasons.isPublic, true), isNull(seasons.isPublic)),
    orderBy: [desc(seasons.seasonNumber)],
  });

  if (!latestPublicSeason) {
    return DIVISION_ORDER.map((divisionName) => ({
      divisionId: null,
      divisionName,
      seasonId: null,
      seasonNumber: null,
      teamName: null,
      teamLogoUrl: null,
      coachName: null,
    }));
  }

  const finals = await db.query.playoffMatches.findMany({
    where: and(
      eq(playoffMatches.seasonId, latestPublicSeason.id),
      eq(playoffMatches.round, 3),
      isNotNull(playoffMatches.winnerId)
    ),
    with: {
      division: true,
      winner: {
        with: {
          coach: true,
        },
      },
    },
  });

  const finalsByDivision = new Map(finals.map((final) => [final.division?.name, final]));

  return DIVISION_ORDER.map((divisionName) => {
    const final = finalsByDivision.get(divisionName);

    return {
      divisionId: final?.divisionId ?? null,
      divisionName,
      seasonId: latestPublicSeason.id,
      seasonNumber: latestPublicSeason.seasonNumber,
      teamName: final?.winner?.teamName ?? null,
      teamLogoUrl: final?.winner?.teamLogoUrl ?? null,
      coachName: final?.winner?.coach?.name ?? null,
    };
  });
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
  endedAt: string | null;
  divisionName?: string;
};

type RecentDraftPick = {
  rosterId: number;
  draftOrder: number | null;
  pokemonName: string;
  spriteUrl: string | null;
  price: number;
  teamName: string;
  teamAbbreviation: string | null;
  teamLogoUrl: string | null;
  coachName: string | null;
};

type DivisionRecentDraftPicks = {
  seasonId: number;
  divisionId: number;
  divisionName: string;
  logoUrl: string | null;
  picks: RecentDraftPick[];
};

async function getRecentBattles(): Promise<BattleLogItem[]> {
  const publicSeasons = await db.query.seasons.findMany({
    columns: {
      id: true,
      seasonNumber: true,
    },
    where: or(eq(seasons.isPublic, true), isNull(seasons.isPublic)),
    orderBy: [desc(seasons.seasonNumber)],
  });
  const latestSeasonNumber = publicSeasons[0]?.seasonNumber || 10;
  const recentSeasonIds = publicSeasons
    .filter((season) => season.seasonNumber >= latestSeasonNumber - 1)
    .map((season) => season.id);

  if (recentSeasonIds.length === 0) {
    return [];
  }

  const [regularMatches, playoffs] = await Promise.all([
    db.query.matches.findMany({
      columns: {
        id: true,
        seasonId: true,
        week: true,
        coach1SeasonId: true,
        coach2SeasonId: true,
        winnerId: true,
        coach1Differential: true,
        coach2Differential: true,
        playedAt: true,
        endedAt: true,
      },
      where: and(
        isNotNull(matches.winnerId),
        inArray(matches.seasonId, recentSeasonIds)
      ),
      with: {
        coach1: {
          columns: {
            teamName: true,
            teamLogoUrl: true,
          },
        },
        coach2: {
          columns: {
            teamName: true,
            teamLogoUrl: true,
          },
        },
        division: {
          columns: {
            name: true,
          },
        },
        season: {
          columns: {
            seasonNumber: true,
          },
        },
      },
    }),
    db.query.playoffMatches.findMany({
      columns: {
        id: true,
        matchId: true,
        seasonId: true,
        divisionId: true,
        round: true,
        higherSeedId: true,
        lowerSeedId: true,
        winnerId: true,
        higherSeedWins: true,
        lowerSeedWins: true,
        playedAt: true,
      },
      where: and(
        isNotNull(playoffMatches.winnerId),
        inArray(playoffMatches.seasonId, recentSeasonIds)
      ),
      with: {
        higherSeed: {
          columns: {
            teamName: true,
            teamLogoUrl: true,
          },
        },
        lowerSeed: {
          columns: {
            teamName: true,
            teamLogoUrl: true,
          },
        },
        division: {
          columns: {
            name: true,
          },
        },
        season: {
          columns: {
            seasonNumber: true,
          },
        },
      },
    }),
  ]);

  // Filter to only recent seasons and sort
  const recentRegularMatches = regularMatches
    .filter(m =>
      m.week <= 100 &&
      (m.season?.seasonNumber || 0) >= latestSeasonNumber - 1
    )
    .sort((a, b) => {
      const aSeasonNum = a.season?.seasonNumber || 0;
      const bSeasonNum = b.season?.seasonNumber || 0;
      if (bSeasonNum !== aSeasonNum) return bSeasonNum - aSeasonNum;
      return (b.week || 0) - (a.week || 0);
    })
    .slice(0, 50);

  const recentPlayoffs = playoffs
    .filter(p =>
      (p.season?.seasonNumber || 0) >= latestSeasonNumber - 1
    );

  // Convert regular matches to unified format
  const regularBattles: BattleLogItem[] = recentRegularMatches.map((m) => ({
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
    endedAt: m.endedAt,
    divisionName: m.division?.name,
  }));

  // Build endedAt lookup from regular matches for playoff linking
  const endedAtByMatchId = new Map<number, string | null>();
  for (const m of regularMatches) {
    endedAtByMatchId.set(m.id, m.endedAt);
  }

  // Convert playoff matches - use the linked match ID from matches table
  const playoffBattles: BattleLogItem[] = recentPlayoffs.filter(p => p.matchId).map((p) => ({
    id: p.id + 100000,
    matchId: p.matchId!, // Use the linked match ID from matches table
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
    endedAt: p.matchId ? (endedAtByMatchId.get(p.matchId) ?? null) : null,
    divisionName: p.division?.name,
  }));

  // Combine and sort
  const allBattles = [...regularBattles, ...playoffBattles];
  allBattles.sort((a, b) => {
    // PRIMARY: By season number (newest first)
    if (b.seasonNumber !== a.seasonNumber) return b.seasonNumber - a.seasonNumber;
    // SECONDARY: By endedAt if both have it (most recently finished first)
    const aEnded = a.endedAt ? new Date(a.endedAt).getTime() : 0;
    const bEnded = b.endedAt ? new Date(b.endedAt).getTime() : 0;
    if (aEnded && bEnded && aEnded !== bEnded) return bEnded - aEnded;
    // TERTIARY: Matches with endedAt before those without
    if (aEnded && !bEnded) return -1;
    if (!aEnded && bEnded) return 1;
    // FALLBACK: By week/round (latest first), then division order
    const aOrder = a.type === "playoff" ? 100 + (a.round || 0) : (a.week || 0);
    const bOrder = b.type === "playoff" ? 100 + (b.round || 0) : (b.week || 0);
    if (bOrder !== aOrder) return bOrder - aOrder;
    return compareDivisionNames(a.divisionName, b.divisionName);
  });

  return allBattles.slice(0, 8);
}

async function getRecentDraftPicksByDivision(
  currentSeasonPromise: Promise<Awaited<ReturnType<typeof getCurrentSeason>>>
): Promise<DivisionRecentDraftPicks[]> {
  const currentSeason = await currentSeasonPromise;
  if (!currentSeason) return [];

  const sortedDivisions = [...currentSeason.divisions].sort((a, b) =>
    compareDivisionNames(a.name, b.name)
  );
  const divisionIds = sortedDivisions.map((division) => division.id);

  if (divisionIds.length === 0) {
    return [];
  }

  const teams = await db.query.seasonCoaches.findMany({
    where: inArray(seasonCoaches.divisionId, divisionIds),
    columns: {
      id: true,
      divisionId: true,
      teamName: true,
      teamAbbreviation: true,
      teamLogoUrl: true,
      isActive: true,
    },
    with: {
      coach: {
        columns: {
          name: true,
        },
      },
      rosters: {
        columns: {
          id: true,
          draftOrder: true,
          price: true,
        },
        with: {
          pokemon: {
            columns: {
              name: true,
              displayName: true,
              spriteUrl: true,
            },
          },
        },
      },
    },
  });

  const picksByDivision = new Map<number, RecentDraftPick[]>();

  for (const team of teams) {
    if (!team.isActive) continue;

    const divisionPicks = picksByDivision.get(team.divisionId) ?? [];
    for (const roster of team.rosters) {
      divisionPicks.push({
        rosterId: roster.id,
        draftOrder: roster.draftOrder,
        pokemonName: roster.pokemon?.displayName || roster.pokemon?.name || "Unknown",
        spriteUrl: roster.pokemon?.spriteUrl ?? null,
        price: roster.price,
        teamName: team.teamName,
        teamAbbreviation: team.teamAbbreviation,
        teamLogoUrl: team.teamLogoUrl,
        coachName: team.coach?.name ?? null,
      });
    }
    picksByDivision.set(team.divisionId, divisionPicks);
  }

  return sortedDivisions.map((division) => ({
    seasonId: currentSeason.id,
    divisionId: division.id,
    divisionName: division.name,
    logoUrl: division.logoUrl,
    picks: (picksByDivision.get(division.id) ?? [])
      .sort((a, b) => b.rosterId - a.rosterId)
      .slice(0, 10),
  }));
}

async function getStats(
  currentSeasonPromise: Promise<Awaited<ReturnType<typeof getCurrentSeason>>>
) {
  const currentSeason = await currentSeasonPromise;
  const allSeasons = await db.query.seasons.findMany();
  const publicSeasons = allSeasons.filter((season) => season.isPublic !== false);
  const publicSeasonIds = publicSeasons.map((season) => season.id);

  // Run count queries in parallel
  const [totalCoaches, totalMatches, currentSeasonMatches] = await Promise.all([
    db.select({ count: count() }).from(coaches),
    // Only count matches with results (winnerId is set)
    publicSeasonIds.length > 0
      ? db
          .select({ count: count() })
          .from(matches)
          .where(and(isNotNull(matches.winnerId), inArray(matches.seasonId, publicSeasonIds)))
      : Promise.resolve([{ count: 0 }]),
    currentSeason
      ? db
          .select({ count: count() })
          .from(matches)
          .where(and(isNotNull(matches.winnerId), eq(matches.seasonId, currentSeason.id)))
      : Promise.resolve([{ count: 0 }]),
  ]);

  return {
    coaches: totalCoaches[0].count,
    seasons: publicSeasons.length,
    matches: totalMatches[0].count,
    currentSeasonMatches: currentSeasonMatches[0].count,
  };
}

async function getCoachTypeUsage(): Promise<Map<number, string[]>> {
  // Get all matchPokemon entries with their Pokemon types and coachId
  const allMatchPokemon = await db.query.matchPokemon.findMany({
    columns: {},
    with: {
      pokemon: {
        columns: {
          types: true,
        },
      },
      seasonCoach: {
        columns: {
          coachId: true,
        },
      },
    },
  });

  // Count type usage per coachId
  const coachTypeCounts = new Map<number, Map<string, number>>();

  for (const mp of allMatchPokemon) {
    const coachId = mp.seasonCoach?.coachId;
    const types = mp.pokemon?.types;
    if (!coachId || !types) continue;

    if (!coachTypeCounts.has(coachId)) {
      coachTypeCounts.set(coachId, new Map());
    }
    const typeCounts = coachTypeCounts.get(coachId)!;

    // Count each type (a Pokemon can have 1-2 types)
    for (const type of types) {
      const lowerType = type.toLowerCase();
      typeCounts.set(lowerType, (typeCounts.get(lowerType) || 0) + 1);
    }
  }

  // For each coach, sort types by count and return top types
  const coachTopTypes = new Map<number, string[]>();
  for (const [coachId, typeCounts] of coachTypeCounts) {
    const sortedTypes = [...typeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type]) => type);
    coachTopTypes.set(coachId, sortedTypes.slice(0, 2)); // Top 2 types
  }

  return coachTopTypes;
}

async function getTopCoaches() {
  // Run all queries in parallel
  const [allCoachesForRank, typeUsage, showcasePurchases] = await Promise.all([
    // Get all coaches to calculate actual ranks
    db.query.coaches.findMany({
      columns: {
        id: true,
        name: true,
        eloRating: true,
      },
      orderBy: (c, { desc }) => [desc(c.eloRating)],
    }),
    getCoachTypeUsage(),
    // Get coaches with active showcase-slot purchases
    db
      .select({
        coachId: coachPurchases.coachId,
      })
      .from(coachPurchases)
      .innerJoin(storeItems, eq(coachPurchases.itemId, storeItems.id))
      .where(
        and(
          eq(storeItems.slug, "showcase-slot"),
          eq(coachPurchases.isActive, true)
        )
      ),
  ]);
  const coachesList = allCoachesForRank.slice(0, 10);

  // Build rank map from all coaches
  const rankMap = new Map<number, number>();
  allCoachesForRank.forEach((coach, idx) => {
    rankMap.set(coach.id, idx + 1);
  });

  // Get set of showcase coach IDs
  const showcaseCoachIds = new Set(showcasePurchases.map((p) => p.coachId));

  // Get set of top coach IDs
  const topCoachIds = new Set(coachesList.map((c) => c.id));

  // Find showcase coaches not already in top 10
  const additionalShowcaseCoachIds = [...showcaseCoachIds].filter(
    (id) => !topCoachIds.has(id)
  );

  // Fetch additional showcase coaches if any
  let additionalShowcaseCoaches: typeof coachesList = [];
  if (additionalShowcaseCoachIds.length > 0) {
    additionalShowcaseCoaches = await db.query.coaches.findMany({
      columns: {
        id: true,
        name: true,
        eloRating: true,
      },
      where: inArray(coaches.id, additionalShowcaseCoachIds),
    });
  }

  // Map top coaches with isShowcase flag and rank
  const topCoachesWithTypes = coachesList.map((coach, idx) => ({
    ...coach,
    topTypes: typeUsage.get(coach.id) || [],
    isShowcase: showcaseCoachIds.has(coach.id),
    rank: idx + 1,
  }));

  // Map additional showcase coaches with their actual rank
  const showcaseCoachesWithTypes = additionalShowcaseCoaches.map((coach) => ({
    ...coach,
    topTypes: typeUsage.get(coach.id) || [],
    isShowcase: true,
    rank: rankMap.get(coach.id) || 0,
  }));

  // Return combined list (top 10 first, then showcase sorted by rank)
  return [
    ...topCoachesWithTypes,
    ...showcaseCoachesWithTypes.sort((a, b) => a.rank - b.rank),
  ];
}

async function getHomePersonalization(currentSeasonPromise: Promise<Awaited<ReturnType<typeof getCurrentSeason>>>) {
  const [session, currentSeason] = await Promise.all([
    getSession(),
    currentSeasonPromise,
  ]);

  if (!session) {
    return null;
  }

  const pollPromise = getActivePoll(session);

  if (session.type !== "coach") {
    const poll = await pollPromise;
    return {
      user: session,
      activeTeam: null,
      nextMatch: null,
      opponent: null,
      poll,
    };
  }

  const coachTeamsPromise = db.query.seasonCoaches.findMany({
    where: eq(seasonCoaches.coachId, session.id),
    with: {
      division: {
        with: {
          season: true,
        },
      },
    },
  });
  const [poll, coachTeams] = await Promise.all([pollPromise, coachTeamsPromise]);

  const activeTeam = coachTeams.find((team) => {
    const teamSeason = team.division?.season;
    if (!teamSeason) return false;
    return currentSeason ? teamSeason.id === currentSeason.id : teamSeason.isCurrent;
  }) ?? null;

  if (!activeTeam?.division?.season) {
    return {
      user: session,
      activeTeam: null,
      nextMatch: null,
      opponent: null,
      poll,
    };
  }

  const nextMatch = await db.query.matches.findFirst({
    where: and(
      eq(matches.divisionId, activeTeam.divisionId),
      isNull(matches.winnerId),
      or(
        eq(matches.coach1SeasonId, activeTeam.id),
        eq(matches.coach2SeasonId, activeTeam.id)
      )
    ),
    with: {
      coach1: true,
      coach2: true,
    },
    orderBy: [asc(matches.week), asc(matches.scheduledAt)],
  });

  const opponent = nextMatch
    ? nextMatch.coach1SeasonId === activeTeam.id
      ? nextMatch.coach2
      : nextMatch.coach1
    : null;

  return {
    user: session,
    activeTeam,
    nextMatch,
    opponent,
    poll,
  };
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
  flying: "bg-indigo-400",
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

function StatsStrip({
  stats,
  className = "",
}: {
  stats: Awaited<ReturnType<typeof getStats>>;
  className?: string;
}) {
  return (
    <div className={`grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 ${className}`}>
      <div className="stat-card flex flex-col items-center justify-center text-center">
        <svg className="w-5 h-5 sm:w-6 sm:h-6 mb-1 sm:mb-2 text-[var(--secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <div className="font-mono font-bold text-xl sm:text-2xl text-white mb-0.5 sm:mb-1">{stats.coaches}</div>
        <div className="text-[9px] sm:text-[10px] text-[var(--foreground-subtle)] font-bold uppercase">Coaches</div>
      </div>
      <div className="stat-card flex flex-col items-center justify-center text-center">
        <svg className="w-5 h-5 sm:w-6 sm:h-6 mb-1 sm:mb-2 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <div className="font-mono font-bold text-xl sm:text-2xl text-white mb-0.5 sm:mb-1">{stats.seasons}</div>
        <div className="text-[9px] sm:text-[10px] text-[var(--foreground-subtle)] font-bold uppercase">Seasons</div>
      </div>
      <div className="stat-card flex flex-col items-center justify-center text-center">
        <svg className="w-5 h-5 sm:w-6 sm:h-6 mb-1 sm:mb-2 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6h6M6 3v6M18 21v-6M21 18h-6" />
        </svg>
        <div className="font-mono font-bold text-xl sm:text-2xl text-white mb-0.5 sm:mb-1">{stats.matches}</div>
        <div className="text-[9px] sm:text-[10px] text-[var(--foreground-subtle)] font-bold uppercase">Battles</div>
      </div>
    </div>
  );
}

function GamesOfTheWeekPanel({
  games,
  className = "",
}: {
  games: Awaited<ReturnType<typeof getCurrentGamesOfTheWeek>>;
  className?: string;
}) {
  if (games.length === 0) return null;

  return (
    <section className={`poke-card p-4 ${className}`}>
      <div className="mb-4 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-yellow-400">
          Games of the Week
        </p>
        <p className="mt-1 text-sm text-[var(--foreground-muted)]">
          Featured Matchups · Week {games[0].week}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {games.map((game) => {
          const divisionName = game.division?.name || "";
          const normalizedDivisionName = normalizeDivisionName(divisionName);
          const divisionLabel = normalizedDivisionName === "infinity" ? "Infinity" : divisionName;
          const divisionColor = normalizedDivisionName === "infinity"
            ? "#E2A3C7"
            : DIVISION_COLORS[divisionName] || "#facc15";
          return (
            <Link
              key={game.id}
              href={`/matches/${game.id}`}
              className="group min-w-0 overflow-hidden rounded-xl border bg-[var(--background-secondary)] transition-all hover:-translate-y-0.5 hover:bg-[var(--background-tertiary)]/70"
              style={{ borderColor: `${divisionColor}66`, boxShadow: `0 0 24px ${divisionColor}14` }}
            >
              <div className="border-b border-white/5 px-4 py-2 text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: divisionColor }}>
                  {divisionLabel || "Division"} Division
                </p>
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-3">
                {[game.coach1, game.coach2].map((team, index) => (
                  <div key={team?.id ?? index} className={`min-w-0 text-center ${index === 1 ? "order-3" : ""}`}>
                    <div className="mx-auto flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[var(--background)]">
                      {team?.teamLogoUrl ? (
                        <Image src={team.teamLogoUrl} alt="" width={40} height={40} className="h-10 w-10 object-contain" />
                      ) : (
                        <span className="text-xs font-bold text-[var(--foreground-muted)]">{team?.teamAbbreviation || "PBO"}</span>
                      )}
                    </div>
                    <p className="mt-1.5 min-h-8 text-xs font-bold leading-4 text-white">{team?.teamName || "TBD"}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--foreground-subtle)]">{team?.teamAbbreviation || ""}</p>
                  </div>
                ))}
                <span className="order-2 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-2.5 py-1 font-mono text-xs font-bold text-yellow-300">VS</span>
              </div>
              <div className="border-t border-white/5 px-3 py-1.5 text-center text-[9px] font-bold uppercase tracking-widest text-[var(--foreground-subtle)] transition-colors group-hover:text-white">
                View Match →
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function RecentDraftPicksPanel({ divisions }: { divisions: DivisionRecentDraftPicks[] }) {
  if (divisions.length === 0) return null;

  return (
    <section className="poke-card p-4 sm:p-6">
      <HomeLiveDraftRefresh />
      <div className="section-title">
        <div className="section-title-icon">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <h3>Recent Draft Picks</h3>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {divisions.map((division) => {
          const divisionName = division.divisionName.trim();
          const divisionColor = DIVISION_COLORS[divisionName] ?? "var(--primary)";

          return (
            <div
              key={division.divisionId}
              className="min-w-0 rounded-lg border bg-[var(--background-secondary)]/60 p-3"
              style={{
                borderColor: `${divisionColor}44`,
                boxShadow: `inset 0 1px 0 ${divisionColor}22`,
              }}
            >
              <div className="mb-3 flex items-center gap-2">
                {division.logoUrl ? (
                  <Image
                    src={division.logoUrl}
                    alt=""
                    width={28}
                    height={28}
                    className="h-7 w-7 shrink-0 rounded object-contain"
                  />
                ) : (
                  <div className="h-7 w-7 shrink-0 rounded bg-[var(--background-tertiary)]" />
                )}
                <div className="min-w-0">
                  <h4 className="truncate text-sm font-bold uppercase text-white">{divisionName}</h4>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--foreground-subtle)]">
                    Latest 10
                  </p>
                </div>
              </div>

              <Link
                href={`/seasons/${division.seasonId}/draft?division=${division.divisionId}`}
                className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-[var(--background-tertiary)] bg-[var(--background)]/70 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground-muted)] transition-colors hover:border-[var(--primary)] hover:text-white"
              >
                Draft Board
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>

              {division.picks.length > 0 ? (
                <div className="space-y-2">
                  {division.picks.map((pick) => (
                    <div
                      key={pick.rosterId}
                      className="rounded-md border border-[var(--background-tertiary)] bg-[var(--background)]/55 p-2"
                    >
                      <div className="flex items-center gap-2">
                        {pick.spriteUrl ? (
                          <Image
                            src={pick.spriteUrl}
                            alt=""
                            width={28}
                            height={28}
                            className="h-7 w-7 shrink-0 object-contain"
                          />
                        ) : (
                          <div className="h-7 w-7 shrink-0 rounded bg-[var(--background-tertiary)]" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-bold text-white">{pick.pokemonName}</div>
                          <div className="truncate text-[10px] text-[var(--foreground-subtle)]">
                            {pick.teamAbbreviation || pick.teamName}{pick.coachName ? ` / ${pick.coachName}` : ""}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-mono text-xs font-bold text-[var(--accent)]">{pick.price}</div>
                          <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">pts</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-dashed border-[var(--background-tertiary)] px-3 py-5 text-center text-xs text-[var(--foreground-muted)]">
                  No picks recorded yet
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PreviousChampionsPanel({ champions }: { champions: OffseasonChampion[] }) {
  return (
    <section className="poke-card p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-5">
        <div>
          <p className="text-[10px] text-[var(--foreground-subtle)] font-bold uppercase tracking-widest mb-2">
            Previous Season Champions
          </p>
          <h2 className="font-pixel text-sm sm:text-base text-white leading-relaxed">
            {champions[0]?.seasonNumber
              ? `Season ${champions[0].seasonNumber} Title Holders`
              : "Division Title Holders"}
          </h2>
        </div>
        <Link
          href={champions[0]?.seasonId ? `/seasons/${champions[0].seasonId}/playoffs` : "/seasons"}
          className="text-xs text-[var(--foreground-subtle)] hover:text-white uppercase font-bold tracking-widest transition-colors inline-flex items-center gap-2"
        >
          Playoff Brackets
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </Link>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {champions.map((champion) => {
          const divColor = DIVISION_COLORS[champion.divisionName];
          const championContent = (
            <div
              className="h-full rounded-lg border bg-[var(--background)]/45 p-4 transition-all hover:-translate-y-0.5 hover:bg-[var(--background)]/70"
              style={divColor
                ? { borderColor: `${divColor}55`, boxShadow: `inset 0 4px 0 ${divColor}` }
                : { borderColor: "var(--background-tertiary)" }
              }
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <span
                  className="inline-flex px-2 py-1 text-[10px] font-bold uppercase rounded"
                  style={divColor
                    ? { color: divColor, backgroundColor: `${divColor}18`, border: `1px solid ${divColor}35` }
                    : { color: "var(--foreground-muted)", backgroundColor: "var(--background-tertiary)" }
                  }
                >
                  {champion.divisionName}
                </span>
                <svg className="w-5 h-5 text-yellow-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C13.1 2 14 2.9 14 4V5H16C16 3.34 14.66 2 13 2H11C9.34 2 8 3.34 8 5H10V4C10 2.9 10.9 2 12 2ZM20 6H16V8H19V9C19 11.21 17.21 13 15 13H14V15H15C18.31 15 21 12.31 21 9V8C21 6.9 20.1 6 19 6H20ZM4 6H5C4.9 6 4 6.9 4 8V9C4 12.31 6.69 15 10 15H11V13H10C7.79 13 6 11.21 6 9V8H9V6H5C3.9 6 3 6.9 3 8V9C3 12.31 5.69 15 9 15H10V17H8V19H16V17H14V15H15C18.31 15 21 12.31 21 9V8C21 6.9 20.1 6 19 6H4ZM8 6H5V8H8V6ZM10 19V21H14V19H10Z" />
                </svg>
              </div>

              <div className="flex items-center gap-3 min-w-0">
                {champion.teamLogoUrl ? (
                  <Image
                    src={champion.teamLogoUrl}
                    alt=""
                    width={44}
                    height={44}
                    className="rounded-lg shrink-0"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-lg bg-[var(--background-tertiary)] flex items-center justify-center shrink-0">
                    <span className="text-sm font-mono text-[var(--foreground-subtle)]">--</span>
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-bold text-white text-sm truncate">
                    {champion.teamName || "TBD"}
                  </div>
                  <div className="text-[10px] text-[var(--foreground-subtle)] uppercase font-bold truncate mt-1">
                    {champion.coachName || "Champion"}
                  </div>
                </div>
              </div>
            </div>
          );

          return champion.divisionId && champion.seasonId ? (
            <Link
              key={champion.divisionName}
              href={`/seasons/${champion.seasonId}/divisions/${champion.divisionId}`}
              className="block"
            >
              {championContent}
            </Link>
          ) : (
            <div key={champion.divisionName}>{championContent}</div>
          );
        })}
      </div>
    </section>
  );
}

export default async function Home() {
  // Run all queries in parallel for much better performance on network-attached storage
  const currentSeasonPromise = getCurrentSeason();
  const featureSettingsPromise = getSiteFeatureSettings();
  const recentDraftPicksPromise = featureSettingsPromise.then((settings) =>
    settings.recentDraftPicksHidden
      ? []
      : getRecentDraftPicksByDivision(currentSeasonPromise)
  );
  const [currentSeason, previousSeasonChampions, recentBattles, recentDraftPicksByDivision, stats, gamesOfTheWeek, topCoaches, personalizedHome] = await Promise.all([
    currentSeasonPromise,
    getPreviousSeasonChampions(),
    getRecentBattles(),
    recentDraftPicksPromise,
    getStats(currentSeasonPromise),
    getCurrentGamesOfTheWeek(currentSeasonPromise),
    getTopCoaches(),
    getHomePersonalization(currentSeasonPromise),
  ]);
  const visibleTopCoaches = topCoaches.filter((coach, index) => index < 5 || coach.isShowcase);
  const previousSeasonPlayoffHref = previousSeasonChampions[0]?.seasonId
    ? `/seasons/${previousSeasonChampions[0].seasonId}/playoffs`
    : "/seasons";
  const currentSeasonPrimaryHref = currentSeason?.divisions[0]
    ? `/seasons/${currentSeason.id}/divisions/${currentSeason.divisions[0].id}`
    : currentSeason
      ? `/seasons/${currentSeason.id}`
      : "/seasons";

  return (
    <div className="space-y-16">
      <section className="relative">
        <div className="flex flex-col items-center justify-center space-y-8">
          <div className="text-center space-y-4 max-w-3xl">
            <p className="text-[10px] text-[var(--foreground-subtle)] font-bold uppercase tracking-widest">
              {currentSeason ? "Current Season" : "Offseason"}
            </p>
            <h1 className="text-4xl md:text-5xl font-bold text-white uppercase tracking-tight">
              {currentSeason ? currentSeason.name : "PBO Offseason Hub"}
            </h1>
            <p className="text-[var(--foreground-muted)] text-lg">
              {currentSeason
                ? "Follow the active league board, recent results, and your team shortcuts from one place."
                : "Review the latest champions, browse past seasons, and keep up with league history before the next draft."}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link href={currentSeason ? `/seasons/${currentSeason.id}` : "/seasons"}>
                <button className="btn-retro !bg-[#dc143c] hover:!bg-[#b01030]">
                  {currentSeason ? "View Season" : "Past Seasons"}
                </button>
              </Link>
              <Link
                href={currentSeason ? currentSeasonPrimaryHref : previousSeasonPlayoffHref}
                className="text-xs text-[var(--foreground-subtle)] hover:text-white uppercase font-bold tracking-widest transition-colors inline-flex items-center gap-2"
              >
                {currentSeason ? "Open First Division" : "Latest Playoffs"}
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
          </div>

          {/* League Pass Card */}
          {currentSeason && (
            <div className="w-full max-w-3xl mx-auto transform hover:scale-[1.02] transition-transform duration-300">
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
                          ID: {String(currentSeason.id).padStart(4, '0')}-S{currentSeason.seasonNumber}
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

      {currentSeason && (
        <RecentDraftPicksPanel divisions={recentDraftPicksByDivision} />
      )}

      {personalizedHome && (
        <section className="poke-card p-4 sm:p-5">
          <div className="your-league-layout">
            <div className="min-w-0">
              <p className="text-[10px] text-[var(--foreground-subtle)] font-bold uppercase tracking-widest mb-1.5">
                Your League
              </p>
              <h2 className="font-bold text-base text-white leading-tight">
                Welcome, {personalizedHome.user.name}
              </h2>
              <p className="mt-1.5 text-xs text-[var(--foreground-muted)]">
                {personalizedHome.activeTeam
                  ? "Active team, next matchup, and prep links."
                  : "No active-season team is linked to this account right now."}
              </p>
            </div>

            {personalizedHome.activeTeam ? (
              <div className="your-league-actions-grid">
                <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/45 p-3">
                  <div className="text-[10px] text-[var(--foreground-subtle)] uppercase font-bold tracking-widest">
                    Next Match
                  </div>
                  {personalizedHome.nextMatch ? (
                    <>
                      <div className="mt-2 font-bold text-white truncate">
                        Week {personalizedHome.nextMatch.week} vs {personalizedHome.opponent?.teamName ?? "TBD"}
                      </div>
                      <Link
                        href={`/matches/${personalizedHome.nextMatch.id}`}
                        className="mt-2 inline-flex text-xs text-[var(--foreground-subtle)] hover:text-white uppercase font-bold tracking-widest transition-colors"
                      >
                        Match Page
                      </Link>
                    </>
                  ) : (
                    <div className="mt-2 font-bold text-white">No pending match</div>
                  )}
                </div>

                <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/45 p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {personalizedHome.activeTeam.teamLogoUrl ? (
                      <Image
                        src={personalizedHome.activeTeam.teamLogoUrl}
                        alt=""
                        width={44}
                        height={44}
                        className="rounded-lg shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-lg bg-[var(--background-tertiary)] flex items-center justify-center shrink-0">
                        <span className="text-sm font-mono text-[var(--foreground-subtle)]">--</span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-bold text-white text-sm truncate">
                        {personalizedHome.activeTeam.teamName}
                      </div>
                      <div className="text-[10px] text-[var(--foreground-subtle)] uppercase font-bold truncate mt-1">
                        {personalizedHome.activeTeam.division?.season?.name} / {personalizedHome.activeTeam.division?.name}
                      </div>
                    </div>
                  </div>
                </div>

                <PollCard initialPoll={personalizedHome.poll} compact />

                <div className="your-league-link-grid grid grid-cols-2 gap-2 min-w-0">
                  <div className="grid gap-2">
                    <Link
                      href={`/seasons/${personalizedHome.activeTeam.division!.season!.id}/divisions/${personalizedHome.activeTeam.divisionId}`}
                      className="rounded-lg bg-[var(--background-tertiary)] px-3 py-2 text-center text-xs font-bold uppercase text-[var(--foreground-muted)] hover:text-white transition-colors"
                    >
                      Division
                    </Link>
                    <Link
                      href="/matchup-prep"
                      className="rounded-lg bg-[var(--background-tertiary)] px-3 py-2 text-center text-xs font-bold uppercase text-[var(--foreground-muted)] hover:text-white transition-colors"
                    >
                      Match Prep
                    </Link>
                    {currentSeason && (
                      <Link
                        href={`/seasons/${currentSeason.id}/draft?division=${personalizedHome.activeTeam.divisionId}`}
                        className="rounded-lg bg-[var(--background-tertiary)] px-3 py-2 text-center text-xs font-bold uppercase text-[var(--foreground-muted)] hover:text-white transition-colors"
                      >
                        Draft Board
                      </Link>
                    )}
                  </div>
                  <div className="grid gap-2 content-start">
                    <Link
                      href={`/coaches/${personalizedHome.user.id}`}
                      className="rounded-lg bg-[var(--background-tertiary)] px-3 py-2 text-center text-xs font-bold uppercase text-[var(--foreground-muted)] hover:text-white transition-colors"
                    >
                      My Page
                    </Link>
                    <a
                      href={RULEBOOK_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-[var(--background-tertiary)] px-3 py-2 text-center text-xs font-bold uppercase text-[var(--foreground-muted)] hover:text-white transition-colors"
                    >
                      Rulebook
                    </a>
                    {currentSeason && (
                      <>
                        <Link
                          href="/pick-ems"
                          className="rounded-lg bg-[var(--background-tertiary)] px-3 py-2 text-center text-xs font-bold uppercase text-[var(--foreground-muted)] hover:text-white transition-colors"
                        >
                          Pick-Ems
                        </Link>
                        <Link
                          href="/fantasy"
                          className="rounded-lg bg-[var(--background-tertiary)] px-3 py-2 text-center text-xs font-bold uppercase text-[var(--foreground-muted)] hover:text-white transition-colors"
                        >
                          Fantasy
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex w-full flex-col gap-3 lg:w-auto lg:max-w-[560px] lg:items-end">
                <div className="flex flex-wrap gap-2 lg:justify-end">
                {personalizedHome.user.type === "coach" && (
                  <Link
                    href={`/coaches/${personalizedHome.user.id}`}
                    className="inline-flex w-fit items-center justify-center whitespace-nowrap rounded-lg bg-[var(--background-tertiary)] px-3 py-2 text-xs font-bold uppercase text-[var(--foreground-muted)] hover:text-white transition-colors"
                  >
                    My Coach Page
                  </Link>
                )}
                <Link
                  href="/seasons"
                  className="inline-flex w-fit items-center justify-center whitespace-nowrap rounded-lg bg-[var(--background-tertiary)] px-3 py-2 text-xs font-bold uppercase text-[var(--foreground-muted)] hover:text-white transition-colors"
                >
                  Browse Seasons
                </Link>
                <Link
                  href="/pick-ems"
                  className="inline-flex w-fit items-center justify-center whitespace-nowrap rounded-lg bg-[var(--background-tertiary)] px-3 py-2 text-xs font-bold uppercase text-[var(--foreground-muted)] hover:text-white transition-colors"
                >
                  Pick-Ems
                </Link>
                <a
                  href={RULEBOOK_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-fit items-center justify-center whitespace-nowrap rounded-lg bg-[var(--background-tertiary)] px-3 py-2 text-xs font-bold uppercase text-[var(--foreground-muted)] hover:text-white transition-colors"
                >
                  Rulebook
                </a>
                </div>
                <div className="w-full max-w-md">
                  <PollCard initialPoll={personalizedHome.poll} compact />
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {!currentSeason && (
        <PreviousChampionsPanel champions={previousSeasonChampions} />
      )}

      <StatsStrip
        stats={stats}
        className="hidden lg:grid"
      />
      <GamesOfTheWeekPanel games={gamesOfTheWeek} className="hidden lg:block" />

      {/* Main Content Grid */}
      <SyncedHeightGrid
        mobileMiddleContent={
          <div className="space-y-4">
            <StatsStrip
              stats={stats}
              className="grid"
            />
            <GamesOfTheWeekPanel games={gamesOfTheWeek} />
          </div>
        }
        leftContent={
          <div className="poke-card p-6">
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
              <div className="space-y-3">
                {recentBattles.map((battle) => {
                  const divisionColorKey = normalizeDivisionName(battle.divisionName || "") === "infinity"
                    ? "Infinity"
                    : battle.divisionName || "";
                  const divisionColor = DIVISION_COLORS[divisionColorKey];

                  return (
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
                              className="rounded hidden xs:block sm:block shrink-0"
                            />
                          )}
                          <span className="font-bold text-xs sm:text-sm truncate">
                            {battle.team1Name}
                          </span>
                        </div>

                        {/* Score - Always centered */}
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
                              className="rounded hidden xs:block sm:block shrink-0"
                            />
                          )}
                        </div>
                      </div>

                      {/* Division Badge - hidden on mobile */}
                      <div className="shrink-0 w-[72px] text-center hidden sm:block">
                        {battle.divisionName && (
                          <span
                            className="inline-block px-2 py-1 text-[10px] font-bold rounded uppercase"
                            style={divisionColor
                              ? { color: divisionColor, backgroundColor: `${divisionColor}15`, border: `1px solid ${divisionColor}30` }
                              : { backgroundColor: 'var(--background-tertiary)', color: 'var(--foreground-muted)' }
                            }
                          >
                            {battle.divisionName}
                          </span>
                        )}
                      </div>
                    </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="text-[var(--foreground-muted)] text-center py-8">No battles recorded yet</p>
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
        }
        rightContent={
          <div className="poke-card p-6 h-full flex flex-col">
            {/* Section Title */}
            <div className="section-title flex-shrink-0">
              <div className="section-title-icon">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                </svg>
              </div>
              <h3>Top Trainers</h3>
            </div>

            {/* Trainer List - Scrollable */}
            {visibleTopCoaches.length > 0 ? (
              <div className="space-y-3 flex-1 overflow-y-auto min-h-0 pr-1">
                {visibleTopCoaches.map((coach) => {
                  // Showcase coaches always show their top 2 types
                  const showDualTypes = coach.rank <= 3 || coach.isShowcase;
                  const showSingleType = coach.rank >= 4 && coach.rank <= 5 && !coach.isShowcase;
                  const showDefaultOnly = coach.rank >= 6 && !coach.isShowcase;

                  return (
                    <Link key={coach.id} href={`/coaches/${coach.id}`} className="block">
                      <div className="trainer-card group">
                        {/* Rank Number */}
                        <div className={`rank-badge ${
                          coach.rank === 1 ? 'rank-1' :
                          coach.rank === 2 ? 'rank-2' :
                          coach.rank === 3 ? 'rank-3' :
                          'bg-[var(--background)] text-[var(--foreground-subtle)] border border-[var(--background-tertiary)]'
                        }`}>
                          {coach.rank}
                        </div>

                        {/* Name and Type Badges */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="font-bold text-sm text-[var(--foreground-muted)] group-hover:text-white transition-colors truncate">
                              {coach.name}
                            </div>
                            {coach.isShowcase && (
                              <span className="shrink-0 rounded bg-[var(--primary)]/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[var(--primary)]">
                                Showcase
                              </span>
                            )}
                          </div>
                          {/* Type Badges - based on most used Pokemon types */}
                          <div className="flex gap-1 mt-1">
                            {showDualTypes && (
                              coach.topTypes.length > 0 ? (
                                coach.topTypes.slice(0, 2).map((type) => (
                                  <span
                                    key={type}
                                    className={`px-1.5 py-0.5 text-[8px] rounded font-bold uppercase text-white ${typeColors[type] || typeColors.normal}`}
                                  >
                                    {type}
                                  </span>
                                ))
                              ) : (
                                <span className={`px-1.5 py-0.5 text-[8px] rounded font-bold uppercase text-white ${typeColors.normal}`}>Normal</span>
                              )
                            )}
                            {showSingleType && (
                              coach.topTypes.length > 0 ? (
                                <span
                                  className={`px-1.5 py-0.5 text-[8px] rounded font-bold uppercase text-white ${typeColors[coach.topTypes[0]] || typeColors.normal}`}
                                >
                                  {coach.topTypes[0]}
                                </span>
                              ) : (
                                <span className={`px-1.5 py-0.5 text-[8px] rounded font-bold uppercase text-white ${typeColors.normal}`}>Normal</span>
                              )
                            )}
                            {showDefaultOnly && (
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
                  );
                })}
              </div>
            ) : (
              <p className="text-[var(--foreground-muted)] text-center py-8">No trainers yet</p>
            )}

            {/* View All Link */}
            <div className="mt-6 text-center pt-4 border-t border-[var(--background-tertiary)] flex-shrink-0">
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
        }
      />

    </div>
  );
}
