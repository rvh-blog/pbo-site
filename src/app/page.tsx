import Link from "next/link";
import Image from "next/image";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getHomePickEms } from "@/lib/home-pick-ems";
import { getRecentBattles } from "@/lib/home-recent-battles";
import { LeagueJourney } from "@/components/league-context";
import { getActivePoll } from "@/lib/polls";
import { getSiteFeatureSettings } from "@/lib/site-settings";
import { PollCard } from "@/components/poll-card";
import { SyncedHeightGrid } from "@/components/synced-height-grid";
import { HomeLiveDraftRefresh } from "@/components/home-live-draft-refresh";
import { LocalTime } from "@/components/local-time";
import { TwitchLiveStream } from "@/components/twitch-live-stream";
import { EmptyState } from "@/components/ui/empty-state";
import { seasons, matches, coaches, seasonCoaches, playoffMatches, coachPurchases, storeItems, matchPokemon } from "@/lib/schema";
import { eq, desc, asc, count, and, or, isNotNull, isNull, inArray } from "drizzle-orm";
import { compareDivisionNames, DIVISION_HIERARCHY } from "@/lib/division-order";
import { getUpcomingBattles, UpcomingBattleItem } from "@/lib/upcoming-battles";

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
  const publicSeasons = await db.query.seasons.findMany({
    columns: {
      id: true,
      seasonNumber: true,
    },
    with: {
      divisions: {
        columns: {
          id: true,
          name: true,
          displayOrder: true,
        },
      },
    },
    where: or(eq(seasons.isPublic, true), isNull(seasons.isPublic)),
    orderBy: [desc(seasons.seasonNumber)],
  });

  if (publicSeasons.length === 0) {
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
      inArray(playoffMatches.seasonId, publicSeasons.map((season) => season.id)),
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

  const championshipSeason = publicSeasons.find((season) =>
    finals.some((final) => final.seasonId === season.id)
  );

  if (!championshipSeason) {
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

  const championshipFinals = finals.filter(
    (final) => final.seasonId === championshipSeason.id
  );
  const championshipDivisions = [...championshipSeason.divisions].sort((a, b) => {
    const displayOrderDifference = (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
    return displayOrderDifference || compareDivisionNames(a.name, b.name);
  });

  return championshipDivisions.map((division) => {
    const final = championshipFinals.find(
      (candidate) =>
        candidate.divisionId === division.id ||
        normalizeDivisionName(candidate.division?.name || "") === normalizeDivisionName(division.name)
    );

    return {
      divisionId: division.id,
      divisionName: division.name,
      seasonId: championshipSeason.id,
      seasonNumber: championshipSeason.seasonNumber,
      teamName: final?.winner?.teamName ?? null,
      teamLogoUrl: final?.winner?.teamLogoUrl ?? null,
      coachName: final?.winner?.coach?.name ?? null,
    };
  });
}

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

async function getCoachTypeUsage(coachIds: number[]): Promise<Map<number, string[]>> {
  if (coachIds.length === 0) return new Map();
  const teamIds = db.select({ id: seasonCoaches.id }).from(seasonCoaches)
    .where(inArray(seasonCoaches.coachId, coachIds));
  // Get all matchPokemon entries with their Pokemon types and coachId
  const allMatchPokemon = await db.query.matchPokemon.findMany({
    where: inArray(matchPokemon.seasonCoachId, teamIds),
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
  const [allCoachesForRank, showcasePurchases] = await Promise.all([
    // Get all coaches to calculate actual ranks
    db.query.coaches.findMany({
      columns: {
        id: true,
        name: true,
        eloRating: true,
      },
      orderBy: (c, { desc }) => [desc(c.eloRating)],
    }),
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

  const additionalShowcaseCoaches = allCoachesForRank.filter((coach) => additionalShowcaseCoachIds.includes(coach.id));
  const typeUsage = await getCoachTypeUsage([
    ...coachesList.slice(0, 5).map((coach) => coach.id),
    ...showcaseCoachIds,
  ]);

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
  const pickEmsPromise = session.type === "coach" && currentSeason && currentSeason.isSchedulePublic !== false
    ? getHomePickEms(currentSeason.id, session.id) : Promise.resolve(null);

  if (session.type !== "coach") {
    const poll = await pollPromise;
    return {
      user: session,
      activeTeam: null,
      nextMatch: null,
      opponent: null,
      pickEms: null,
      poll,
    };
  }

  const coachTeamsPromise = db.query.seasonCoaches.findMany({
    where: and(eq(seasonCoaches.coachId, session.id), or(eq(seasonCoaches.isActive, true), isNull(seasonCoaches.isActive))),
    with: {
      division: {
        with: {
          season: true,
        },
      },
    },
  });
  const [poll, coachTeams, pickEms] = await Promise.all([pollPromise, coachTeamsPromise, pickEmsPromise]);

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
      pickEms,
      poll,
    };
  }

  const nextMatch = activeTeam.division.season.isSchedulePublic === false ? null : await db.query.matches.findFirst({
    where: and(
      eq(matches.divisionId, activeTeam.divisionId),
      isNull(matches.winnerId),
      or(eq(matches.isForfeit, false), isNull(matches.isForfeit)),
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
    pickEms,
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
    <div className={`grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 ${className}`}>
      <div className="stat-card flex flex-col items-center justify-center text-center">
        <svg className="w-5 h-5 sm:w-6 sm:h-6 mb-1 sm:mb-2 text-[var(--secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <div className="font-sans font-bold text-xl sm:text-2xl text-white mb-0.5 sm:mb-1">{stats.coaches}</div>
        <div className="text-[9px] sm:text-[10px] text-[var(--foreground-subtle)] font-bold uppercase">Coaches</div>
      </div>
      <div className="stat-card flex flex-col items-center justify-center text-center">
        <svg className="w-5 h-5 sm:w-6 sm:h-6 mb-1 sm:mb-2 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6h6M6 3v6M18 21v-6M21 18h-6" />
        </svg>
        <div className="font-sans font-bold text-xl sm:text-2xl text-white mb-0.5 sm:mb-1">{stats.matches}</div>
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
                        <Image src={team.teamLogoUrl} alt="" width={40} height={40} sizes="40px" className="h-10 w-10 object-contain" />
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

function UpcomingBattlesPanel({ battles }: { battles: UpcomingBattleItem[] }) {
  return (
    <section className="poke-card flex min-h-0 flex-1 flex-col overflow-hidden p-0">
      <div className="section-title mx-6 mt-6 shrink-0 justify-center">
        <div className="section-title-icon">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3>Upcoming Battles</h3>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-6">
        {battles.length === 0 ? (
          <EmptyState
            compact
            title="No upcoming battles"
            description="The next scheduled matchup will appear here as soon as a match time is published."
            actionHref="/seasons"
            actionLabel="Browse schedules"
          />
        ) : battles.map((battle) => {
          const divisionColorKey = normalizeDivisionName(battle.divisionName || "") === "infinity"
            ? "Infinity"
            : battle.divisionName || "";
          const divisionColor = DIVISION_COLORS[divisionColorKey];

          return (
            <Link
              key={battle.id}
              href={battle.matchId > 0 ? `/matches/${battle.matchId}` : "#"}
              className="block"
              aria-disabled={battle.matchId <= 0}
            >
              <div className={`battle-log-item relative justify-center ${battle.isUnderway ? "ring-2 ring-[var(--error)]/40" : ""}`}>
                <div className={`week-badge absolute left-3 top-1/2 shrink-0 -translate-y-1/2 sm:left-4 ${battle.week > 100 ? "playoff" : ""}`}>
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

                <div className="flex w-full min-w-0 flex-col items-center gap-1 pl-20">
                  <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-[7.5%]">
                    <div className="flex min-w-0 items-center justify-start gap-2 text-left text-white">
                      {battle.team1Logo && (
                        <Image src={battle.team1Logo} alt="" width={24} height={24} sizes="24px" className="rounded hidden sm:block shrink-0" />
                      )}
                      <span className="min-w-0 break-words text-xs font-bold leading-tight sm:text-sm">
                        {battle.team1Name}
                      </span>
                    </div>

                    <span className="text-[8px] font-bold uppercase leading-none text-[var(--foreground-subtle)]">vs</span>

                    <div className="flex min-w-0 items-center justify-end gap-2 text-right text-white">
                      <span className="min-w-0 break-words text-xs font-bold leading-tight sm:text-sm">
                        {battle.team2Name}
                      </span>
                      {battle.team2Logo && (
                        <Image src={battle.team2Logo} alt="" width={24} height={24} sizes="24px" className="rounded hidden sm:block shrink-0" />
                      )}
                    </div>
                  </div>

                  <div className="mt-1 flex w-full min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-[7.5%]">
                    {battle.isUnderway ? (
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--error)] animate-pulse" />
                        <span className="text-[10px] font-bold uppercase text-[var(--error)] sm:text-xs">Live</span>
                      </div>
                    ) : battle.scheduledAt ? (
                      <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
                        <LocalTime dateString={battle.scheduledAt} format="time" className="text-[10px] font-bold text-[var(--accent)] sm:text-xs" />
                        <LocalTime dateString={battle.scheduledAt} format="date" className="truncate text-[8px] uppercase text-[var(--foreground-subtle)] sm:text-[10px]" />
                      </div>
                    ) : (
                      <span className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Time TBD</span>
                    )}

                    {battle.divisionName && (
                      <span
                        className="shrink-0 rounded px-2 py-1 text-[9px] font-bold uppercase sm:text-[10px]"
                        style={divisionColor
                          ? { color: divisionColor, backgroundColor: `${divisionColor}15`, border: `1px solid ${divisionColor}30` }
                          : { backgroundColor: "var(--background-tertiary)", color: "var(--foreground-muted)" }
                        }
                      >
                        {battle.divisionName}
                      </span>
                    )}
                  </div>
                </div>
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
    <section className="order-6 poke-card deferred-section p-4 sm:p-6">
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
                    sizes="28px"
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
                            sizes="28px"
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
    <section className="order-10 poke-card p-5 sm:p-6">
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
                    sizes="44px"
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

const getCachedPublicHomeData = unstable_cache(
  async () => {
    const currentSeasonPromise = getCurrentSeason();
    const featureSettingsPromise = getSiteFeatureSettings();
    const recentDraftPicksPromise = featureSettingsPromise.then((settings) =>
      settings.recentDraftPicksHidden
        ? []
        : getRecentDraftPicksByDivision(currentSeasonPromise)
    );
    const upcomingBattlesPromise = currentSeasonPromise.then((season) =>
      season?.isCurrent ? getUpcomingBattles(season.id, undefined, null) : []
    );

    const [
      currentSeason,
      previousSeasonChampions,
      recentBattles,
      upcomingBattles,
      recentDraftPicksByDivision,
      stats,
      gamesOfTheWeek,
      topCoaches,
    ] = await Promise.all([
      currentSeasonPromise,
      getPreviousSeasonChampions(),
      getRecentBattles(),
      upcomingBattlesPromise,
      recentDraftPicksPromise,
      getStats(currentSeasonPromise),
      getCurrentGamesOfTheWeek(currentSeasonPromise),
      getTopCoaches(),
    ]);

    return {
      currentSeason,
      previousSeasonChampions,
      recentBattles,
      upcomingBattles,
      recentDraftPicksByDivision,
      stats,
      gamesOfTheWeek,
      topCoaches,
    };
  },
  ["home-public-data-v2"],
  { revalidate: 60, tags: ["home-public-data"] }
);

export default async function Home() {
  const publicHomeDataPromise = getCachedPublicHomeData();
  const currentSeasonPromise = publicHomeDataPromise.then((data) => data.currentSeason);
  const [publicHomeData, personalizedHome] = await Promise.all([
    publicHomeDataPromise,
    getHomePersonalization(currentSeasonPromise),
  ]);
  const {
    currentSeason,
    previousSeasonChampions,
    recentBattles,
    upcomingBattles,
    recentDraftPicksByDivision,
    stats,
    gamesOfTheWeek,
    topCoaches,
  } = publicHomeData;
  const visibleTopCoaches = topCoaches.filter((coach, index) => index < 5 || coach.isShowcase);
  const previousSeasonPlayoffHref = previousSeasonChampions[0]?.seasonId
    ? `/seasons/${previousSeasonChampions[0].seasonId}/playoffs`
    : "/seasons";
  const currentSeasonPrimaryHref = currentSeason?.divisions[0]
    ? `/seasons/${currentSeason.id}/divisions/${currentSeason.divisions[0].id}`
    : currentSeason
      ? `/seasons/${currentSeason.id}`
      : "/seasons";
  const quickActionLinks = [
    {
      href: currentSeason ? `/seasons/${currentSeason.id}` : "/seasons",
      label: currentSeason ? "Current Season" : "Past Seasons",
      iconPath: "M4 5h16v14H4zM8 3v4m8-4v4M4 10h16",
      accent: "border-cyan-400/25 bg-cyan-400/[0.06] hover:border-cyan-300/60",
    },
    { href: "/matchup-prep", label: "Match Prep", iconPath: "M4 6h16M4 12h16M4 18h10", accent: "border-rose-400/25 bg-rose-400/[0.06] hover:border-rose-300/60" },
    { href: "/pick-ems", label: "Pick-Ems", iconPath: "M5 5h14v14H5zM8 9h8M8 13h5", accent: "border-amber-400/25 bg-amber-400/[0.06] hover:border-amber-300/60" },
    { href: "/fantasy", label: "Fantasy Scout", iconPath: "M12 3l2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.9L12 3z", accent: "border-fuchsia-400/25 bg-fuchsia-400/[0.06] hover:border-fuchsia-300/60" },
    { href: "/draft-planner", label: "Free Agency", iconPath: "M9 5H7a2 2 0 00-2 2v12h14V7a2 2 0 00-2-2h-2m-6 0a3 3 0 006 0m-6 0a3 3 0 016 0", accent: "border-emerald-400/25 bg-emerald-400/[0.06] hover:border-emerald-300/60" },
    { href: "/leaderboards", label: "PBO Stats", iconPath: "M4 19V9m5 10V5m5 14v-7m5 7V3", accent: "border-violet-400/25 bg-violet-400/[0.06] hover:border-violet-300/60" },
  ];

  return (
    <div className="readable-content flex flex-col gap-8 sm:gap-10 lg:gap-12">
      <TwitchLiveStream />
      <section aria-labelledby="current-season-title" className="order-1 relative isolate overflow-hidden rounded-2xl border border-[var(--primary)]/35 bg-gradient-to-br from-[var(--background-secondary)] via-[var(--background-secondary)] to-[var(--primary)]/15 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.28)] sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-[var(--primary)]/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--foreground-muted)]">
              <span className={`h-2 w-2 rounded-full ${currentSeason ? "bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.9)]" : "bg-amber-300"}`} />
              {currentSeason ? "Live league dashboard" : "Offseason hub"}
            </div>
            <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--primary-light)]">
              {currentSeason ? `Season ${currentSeason.seasonNumber}` : "PBO"}
            </p>
            <h1 id="current-season-title" className="mt-2 text-3xl font-black uppercase tracking-[-0.04em] text-white sm:text-5xl">
              {currentSeason ? currentSeason.name : "PBO Offseason Hub"}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--foreground-muted)] sm:text-base">
              {currentSeason
                ? `${currentSeason.divisions.length} divisions · ${stats.currentSeasonMatches} battles recorded · standings, schedules, and game prep in one place`
                : "Review the latest champions, browse past seasons, and keep up with league history before the next draft."}
            </p>
          </div>

          <div className="relative grid gap-4 lg:w-[340px] lg:grid-cols-[1fr_auto] lg:items-center lg:border-l lg:border-white/10 lg:pl-7">
            <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
              <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2.5 lg:flex lg:items-center lg:justify-between lg:gap-5">
                <span className="block text-[9px] font-bold uppercase tracking-widest text-[var(--foreground-subtle)]">Divisions</span>
                <span className="mt-1 block font-mono text-lg font-bold text-white lg:mt-0">{currentSeason?.divisions.length ?? "--"}</span>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2.5 lg:flex lg:items-center lg:justify-between lg:gap-5">
                <span className="block text-[9px] font-bold uppercase tracking-widest text-[var(--foreground-subtle)]">Battles</span>
                <span className="mt-1 block font-mono text-lg font-bold text-white lg:mt-0">{stats.currentSeasonMatches}</span>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2.5 lg:flex lg:items-center lg:justify-between lg:gap-5">
                <span className="block text-[9px] font-bold uppercase tracking-widest text-[var(--foreground-subtle)]">Status</span>
                <span className="mt-1 block font-mono text-lg font-bold text-emerald-300 lg:mt-0">{currentSeason ? "LIVE" : "REST"}</span>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <Link
                href={currentSeason ? currentSeasonPrimaryHref : "/seasons"}
                className="btn-retro inline-flex min-h-11 items-center justify-center !bg-[#dc143c] px-5 shadow-[0_10px_24px_rgba(220,20,60,0.24)] hover:!bg-[#b01030]"
              >
                {currentSeason ? "View Standings" : "Past Seasons"}
              </Link>
              <Link
                href={currentSeason ? `/seasons/${currentSeason.id}` : previousSeasonPlayoffHref}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/10 bg-black/15 px-4 text-xs font-bold uppercase tracking-wider text-[var(--foreground-muted)] transition-all hover:border-white/30 hover:bg-white/5 hover:text-white"
              >
                {currentSeason ? "View Schedule" : "Latest Playoffs"}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {personalizedHome && (
        <section aria-labelledby="your-week-title" className="order-2 poke-card border-[var(--primary)]/20 bg-gradient-to-br from-[var(--card)] to-[var(--primary)]/[0.06] p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="section-kicker">Personalized dashboard</p>
              <h2 id="your-week-title" className="section-heading">Your Week</h2>
            </div>
            <p className="section-description">
              {personalizedHome.activeTeam
                ? `Welcome back, ${personalizedHome.user.name}.`
                : `Welcome, ${personalizedHome.user.name}.`}
            </p>
          </div>

          {personalizedHome.activeTeam ? (
            <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr_auto]">
              <div className="rounded-xl border border-[var(--background-tertiary)] bg-[var(--background)]/45 p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--foreground-subtle)]">
                  Next Match
                </div>
                {personalizedHome.nextMatch ? (
                  <>
                    <div className="mt-2 text-lg font-bold text-white">
                      {personalizedHome.nextMatch.week > 100 ? ["Quarterfinals", "Semifinals", "Finals"][personalizedHome.nextMatch.week - 101] || "Playoffs" : `Week ${personalizedHome.nextMatch.week}`} vs {personalizedHome.opponent?.teamName ?? "TBD"}
                    </div>
                    <p className="mt-2 text-sm text-[var(--foreground-muted)]">
                      {personalizedHome.nextMatch.scheduledAt
                        ? <LocalTime dateString={personalizedHome.nextMatch.scheduledAt} />
                        : "Time not scheduled yet"}
                    </p>
                    <Link
                      href={`/matches/${personalizedHome.nextMatch.id}`}
                      className="mt-2 inline-flex text-xs font-bold uppercase tracking-widest text-[var(--foreground-subtle)] transition-colors hover:text-white"
                    >
                      Open match page →
                    </Link>
                  </>
                ) : (
                  <div className="mt-2 text-lg font-bold text-white">{currentSeason?.isSchedulePublic === false ? "Schedule not published yet" : "No pending match"}</div>
                )}
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-[var(--background-tertiary)] bg-[var(--background)]/45 p-4">
                {personalizedHome.activeTeam.teamLogoUrl ? (
                  <Image
                    src={personalizedHome.activeTeam.teamLogoUrl}
                    alt=""
                    width={48}
                    height={48}
                    sizes="48px"
                    className="h-12 w-12 shrink-0 rounded-lg object-contain"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--background-tertiary)] text-sm font-mono text-[var(--foreground-subtle)]">
                    --
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate font-bold text-white">{personalizedHome.activeTeam.teamName}</div>
                  <div className="mt-1 truncate text-[10px] font-bold uppercase text-[var(--foreground-subtle)]">
                    {personalizedHome.activeTeam.division?.name} Division
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 lg:w-52">
                <Link
                  href={personalizedHome.nextMatch ? `/matchup-prep?matchId=${personalizedHome.nextMatch.id}&teamId=${personalizedHome.activeTeam.id}` : `/matchup-prep?seasonId=${currentSeason?.id}&divisionId=${personalizedHome.activeTeam.divisionId}&teamId=${personalizedHome.activeTeam.id}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--primary)] px-3 text-center text-xs font-bold uppercase text-white transition-colors hover:bg-[var(--primary-hover)]"
                >
                  Match Prep
                </Link>
                <Link
                  href="/pick-ems"
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--background-tertiary)] px-3 text-center text-xs font-bold uppercase text-[var(--foreground-muted)] transition-colors hover:text-white"
                >
                  Pick-Ems
                </Link>
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-[var(--background-tertiary)] bg-[var(--background)]/45 p-4 text-sm text-[var(--foreground-muted)]">
              Your account is not linked to a team in the current season. You can still follow the weekly activity below.
            </p>
          )}

          {personalizedHome.pickEms && (
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)]/45 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{personalizedHome.pickEms.missing
                  ? `${personalizedHome.pickEms.missing} pick-em prediction${personalizedHome.pickEms.missing === 1 ? "" : "s"} still to make`
                  : "Your open pick-ems are complete"}</p>
                <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                  {personalizedHome.pickEms.week > 100 ? "Playoffs" : `Week ${personalizedHome.pickEms.week}`} · Across all divisions
                </p>
                {personalizedHome.pickEms.nextDeadline ? <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                  Next missing pick locks: <LocalTime dateString={personalizedHome.pickEms.nextDeadline} />
                </p> : personalizedHome.pickEms.missing > 0 && <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                  Picks lock when each scheduled match starts.
                </p>}
              </div>
              <Link href={`/pick-ems?seasonId=${currentSeason?.id}&week=${personalizedHome.pickEms.week}`}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-white">
                {personalizedHome.pickEms.joined ? "Review picks" : "Join pick-ems"}
              </Link>
            </div>
          )}

          {personalizedHome.activeTeam && currentSeason && <div className="mt-4"><LeagueJourney context={{
            seasonId: currentSeason.id, seasonName: currentSeason.name,
            divisionId: personalizedHome.activeTeam.divisionId,
            divisionName: personalizedHome.activeTeam.division?.name,
            teamId: personalizedHome.activeTeam.id,
            week: personalizedHome.nextMatch?.week, matchId: personalizedHome.nextMatch?.id,
          }} /></div>}

          {personalizedHome.poll && (
            <div className="mt-5 border-t border-[var(--background-tertiary)] pt-5">
              <PollCard initialPoll={personalizedHome.poll} compact />
            </div>
          )}
        </section>
      )}

      {currentSeason && stats.currentSeasonMatches === 0 && (
        <RecentDraftPicksPanel divisions={recentDraftPicksByDivision} />
      )}

      <section aria-labelledby="league-hub-title" className="order-3 poke-card flex flex-col border-white/10 bg-[var(--background-secondary)]/80 p-5 sm:p-6">
        <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-kicker">Start here</p>
            <h2 id="league-hub-title" className="section-heading">Quick Actions</h2>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {quickActionLinks.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              title={item.label}
              className={`group relative flex min-h-[112px] min-w-0 cursor-pointer flex-col items-start justify-between overflow-hidden rounded-xl border px-3.5 py-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${item.accent}`}
            >
              <div className="flex w-full items-start justify-between gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/15 text-white/90">
                  <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={item.iconPath} />
                  </svg>
                </span>
                <svg className="mt-1 h-3.5 w-3.5 text-white/35 transition-all group-hover:translate-x-0.5 group-hover:text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-6-6 6 6-6 6" />
                </svg>
              </div>
              <span className="w-full truncate text-xs font-bold uppercase tracking-wide text-white/90 group-hover:text-white">{item.label}</span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-white/35">Open tool</span>
            </Link>
          ))}
        </div>

      </section>

      <section aria-labelledby="discovery-history-title" className="order-7 border-b border-white/10 pb-3">
        <p className="section-kicker">Across the league</p>
        <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h2 id="discovery-history-title" className="section-heading">Discovery &amp; History</h2>
          <p className="section-description">Trainer rankings, league totals, and the most recent division champions.</p>
        </div>
      </section>

      <PreviousChampionsPanel champions={previousSeasonChampions} />

      <StatsStrip
        stats={stats}
        className="order-9 grid"
      />

      <section aria-labelledby="league-activity-title" className="order-4 space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-kicker">{currentSeason?.name ?? "PBO"}</p>
            <h2 id="league-activity-title" className="section-heading">Current League Activity</h2>
          </div>
          <p className="section-description">Featured matchups, scheduled battles, and the latest results.</p>
        </div>
        <GamesOfTheWeekPanel games={gamesOfTheWeek} />
      </section>

      {/* Main Content Grid */}
      <div className="contents">
        <SyncedHeightGrid
        leftContent={
          <div className="poke-card p-4 sm:p-6">
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
                              sizes="24px"
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
                              sizes="24px"
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
              <EmptyState
                compact
                title="No results yet"
                description="Completed battles and replay links will appear here once the season gets underway."
                actionHref={currentSeason ? `/seasons/${currentSeason.id}` : "/seasons"}
                actionLabel="View season"
              />
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
        belowGridContent={
          <div className="order-11 mt-6 w-full">
            <div className="poke-card flex flex-col p-4 sm:p-6">
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
              <div className="max-h-[300px] space-y-3 overflow-y-auto pr-2">
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
              <EmptyState
                compact
                title="Trainer rankings are not ready"
                description="Rankings will populate after recorded matches produce ELO results."
                actionHref="/coaches"
                actionLabel="Browse coaches"
              />
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
          </div>
        }
        rightContent={
          <UpcomingBattlesPanel
            battles={upcomingBattles}
          />
        }
        />
      </div>

    </div>
  );
}
