import { db } from "@/lib/db";
import { matches, transactions, seasonCoaches, matchPokemon } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getDivisionColor } from "@/lib/division-colors";
import { getTimeSyncedRoster } from "@/lib/roster-utils";
import { type OverlayData } from "./overlay-client";
import { Overlay2Client } from "./overlay2-client-copy";
import type { MatchContext } from "./overlay2-client-copy";
import { computeAndSortStandings } from "@/lib/standings-sort";

// Division hierarchy (1 = top, 4 = bottom)
const DIVISION_TIERS: Record<string, number> = {
  "Infinity": 1,
  "Infinty": 1,
  "Stargazer": 1,
  "Sunset": 2,
  "Crystal": 3,
  "Neon": 4,
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ matchId?: string; battleUrl?: string }>;
}

export default async function Overlay2Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const matchId = parseInt(params.matchId || "0");
  const battleUrl = params.battleUrl || "";

  if (!matchId || !battleUrl) {
    return (
      <div style={{ color: "white", padding: 40, fontFamily: "sans-serif" }}>
        Missing matchId or battleUrl query parameters.
      </div>
    );
  }

  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
    with: {
      season: true,
      division: true,
      coach1: {
        with: {
          coach: true,
          rosters: {
            with: { pokemon: true },
          },
        },
      },
      coach2: {
        with: {
          coach: true,
          rosters: {
            with: { pokemon: true },
          },
        },
      },
    },
  });

  if (!match) {
    return (
      <div style={{ color: "white", padding: 40, fontFamily: "sans-serif" }}>
        Match not found.
      </div>
    );
  }

  const coach1 = match.coach1;
  const coach2 = match.coach2;

  // Time-synced rosters
  const [coach1Txs, coach2Txs] = await Promise.all([
    Promise.all([
      db.query.transactions.findMany({
        where: eq(transactions.seasonCoachId, match.coach1SeasonId),
      }),
      db.query.transactions.findMany({
        where: and(
          eq(transactions.type, "P2P_TRADE"),
          eq(transactions.tradingPartnerSeasonCoachId, match.coach1SeasonId),
        ),
      }),
    ]),
    Promise.all([
      db.query.transactions.findMany({
        where: eq(transactions.seasonCoachId, match.coach2SeasonId),
      }),
      db.query.transactions.findMany({
        where: and(
          eq(transactions.type, "P2P_TRADE"),
          eq(transactions.tradingPartnerSeasonCoachId, match.coach2SeasonId),
        ),
      }),
    ]),
  ]);

  const [roster1Result, roster2Result] = await Promise.all([
    getTimeSyncedRoster(
      match.coach1SeasonId,
      match.week,
      coach1?.rosters || [],
      [...coach1Txs[0], ...coach1Txs[1]] as any
    ),
    getTimeSyncedRoster(
      match.coach2SeasonId,
      match.week,
      coach2?.rosters || [],
      [...coach2Txs[0], ...coach2Txs[1]] as any
    ),
  ]);

  // W-L records + context data
  const [divisionMatches, allDivisionCoaches, allMatchPokemon] = await Promise.all([
    db.query.matches.findMany({
      where: eq(matches.divisionId, match.divisionId),
    }),
    db.query.seasonCoaches.findMany({
      where: eq(seasonCoaches.divisionId, match.divisionId),
      with: { coach: true },
    }),
    db.query.matchPokemon.findMany({
      with: { pokemon: true },
    }),
  ]);

  // Filter matchPokemon to only division matches
  const divisionMatchIds = new Set(divisionMatches.map((m) => m.id));
  const filteredMatchPokemon = allMatchPokemon.filter((mp) => divisionMatchIds.has(mp.matchId));

  function getRecord(seasonCoachId: number) {
    let wins = 0, losses = 0;
    for (const m of divisionMatches) {
      if (m.winnerId === null) continue;
      if (m.coach1SeasonId === seasonCoachId || m.coach2SeasonId === seasonCoachId) {
        if (m.winnerId === seasonCoachId) wins++;
        else losses++;
      }
    }
    return { wins, losses };
  }

  function buildRoster(result: typeof roster1Result) {
    return [
      ...result.filteredRosters.map((r) => ({
        pokemonId: r.pokemonId,
        name: r.pokemon?.name || "",
        displayName: r.pokemon?.displayName || r.pokemon?.name || "",
        spriteUrl: r.pokemon?.spriteUrl || null,
        types: r.pokemon?.types || [],
        isTeraCaptain: r.isTeraCaptain ?? false,
      })),
      ...result.droppedPokemonDetails.map((p) => ({
        pokemonId: p.id,
        name: p.name,
        displayName: p.displayName || p.name,
        spriteUrl: p.spriteUrl || null,
        types: p.types || [],
        isTeraCaptain: (p as any).isTeraCaptain ?? false,
      })),
    ];
  }

  const getWeekLabel = (week: number) => {
    if (week === 101) return "Quarterfinals";
    if (week === 102) return "Semifinals";
    if (week === 103) return "Finals";
    return `Week ${week}`;
  };

  // ── Compute Match Context ──
  const divisionName = match.division?.name || "";

  // 1. Division Standings (reuses pattern from division page)
  const replacementMap = new Map<number, number[]>();
  for (const sc of allDivisionCoaches) {
    if (!sc.isActive && sc.replacedById) {
      const predecessors = replacementMap.get(sc.replacedById) || [];
      predecessors.push(sc.id);
      replacementMap.set(sc.replacedById, predecessors);
    }
  }

  const activeCoaches = allDivisionCoaches.filter((sc) => sc.isActive);
  const standings = computeAndSortStandings(activeCoaches, replacementMap, divisionMatches)
    .map((s) => ({ ...s, gamesPlayed: s.wins + s.losses }));

  const totalTeams = standings.length;

  // Derive totalWeeks from ALL scheduled regular season matches (not just completed)
  // so that "games remaining" reflects the full season length.
  let totalWeeks = 0;
  for (const m of divisionMatches) {
    if (m.week <= 100) totalWeeks = Math.max(totalWeeks, m.week);
  }
  if (totalWeeks === 0) totalWeeks = 10;

  function getStandingsContext(seasonCoachId: number) {
    const idx = standings.findIndex((s) => s.id === seasonCoachId ||
      (replacementMap.get(s.id) || []).includes(seasonCoachId));
    if (idx === -1) return null;
    const team = standings[idx];
    const position = idx + 1;
    const gamesRemaining = Math.max(0, totalWeeks - team.gamesPlayed);
    const maxWins = team.wins + gamesRemaining;

    // Playoff: top 8 qualify
    let playoffStatus: "clinched" | "eliminated" | "contending" = "contending";
    if (totalTeams > 8) {
      const eighthPlace = standings[7];
      const eighthMaxWins = eighthPlace.wins + Math.max(0, totalWeeks - eighthPlace.gamesPlayed);
      if (team.wins > eighthMaxWins) playoffStatus = "clinched";
      else if (maxWins < eighthPlace.wins) playoffStatus = "eliminated";
    } else if (position <= 8) {
      playoffStatus = "clinched";
    }

    // Relegation: bottom 2 relegate (except Neon/tier 4)
    const divName = divisionName;
    const tier = DIVISION_TIERS[divName] || 2;
    let relegationStatus: "safe" | "danger" | "relegated" | "exempt" = tier === 4 ? "exempt" : "safe";
    if (tier !== 4 && totalTeams > 2) {
      const relegationLine = totalTeams - 2; // index of first relegation spot
      const safeTeam = standings[relegationLine - 1]; // last safe team
      if (safeTeam) {
        const safeMaxWins = safeTeam.wins + Math.max(0, totalWeeks - safeTeam.gamesPlayed);
        if (maxWins < safeTeam.wins) relegationStatus = "relegated";
        else if (position > relegationLine) relegationStatus = "danger";
      }
    }

    return {
      position, wins: team.wins, losses: team.losses, differential: team.differential,
      gamesPlayed: team.gamesPlayed, totalTeams, gamesRemaining, maxWins,
      playoffStatus, relegationStatus,
      teamAbbreviation: team.teamAbbreviation || team.teamName.slice(0, 3).toUpperCase(),
    };
  }

  // 2. Head-to-Head record
  const coach1Id = coach1?.coachId;
  const coach2Id = coach2?.coachId;
  let h2h = { coach1Wins: 0, coach2Wins: 0 };
  if (coach1Id && coach2Id) {
    // Get all seasonCoachIds for each persistent coach
    const allSeasonCoaches = await db.query.seasonCoaches.findMany();
    const coach1ScIds = new Set(allSeasonCoaches.filter((sc) => sc.coachId === coach1Id).map((sc) => sc.id));
    const coach2ScIds = new Set(allSeasonCoaches.filter((sc) => sc.coachId === coach2Id).map((sc) => sc.id));

    // Find all matches where they faced each other
    const allMatches = await db.query.matches.findMany();
    for (const m of allMatches) {
      if (!m.winnerId) continue;
      const c1IsCoach1 = coach1ScIds.has(m.coach1SeasonId) && coach2ScIds.has(m.coach2SeasonId);
      const c1IsCoach2 = coach1ScIds.has(m.coach2SeasonId) && coach2ScIds.has(m.coach1SeasonId);
      if (c1IsCoach1) {
        if (coach1ScIds.has(m.winnerId)) h2h.coach1Wins++;
        else h2h.coach2Wins++;
      } else if (c1IsCoach2) {
        if (coach1ScIds.has(m.winnerId)) h2h.coach1Wins++;
        else h2h.coach2Wins++;
      }
    }
  }

  // 3. Kill leaders per team (this season, this division)
  function getTeamKillLeader(seasonCoachId: number) {
    const teamIds = new Set([seasonCoachId, ...(replacementMap.get(seasonCoachId) || [])]);
    const killMap = new Map<number, { name: string; kills: number }>();
    for (const mp of filteredMatchPokemon) {
      if (!teamIds.has(mp.seasonCoachId)) continue;
      const kills = mp.kills || 0;
      if (kills === 0) continue;
      const existing = killMap.get(mp.pokemonId);
      if (existing) existing.kills += kills;
      else killMap.set(mp.pokemonId, { name: mp.pokemon?.displayName || mp.pokemon?.name || "Unknown", kills });
    }
    let best: { name: string; kills: number; pokemonId: number } | null = null;
    for (const [pokemonId, data] of killMap) {
      if (!best || data.kills > best.kills) best = { ...data, pokemonId };
    }
    return best;
  }

  // Division-wide kill rankings for context
  const divKillMap = new Map<number, number>();
  for (const mp of filteredMatchPokemon) {
    const kills = mp.kills || 0;
    if (kills === 0) continue;
    divKillMap.set(mp.pokemonId, (divKillMap.get(mp.pokemonId) || 0) + kills);
  }
  const divKillRanking = [...divKillMap.entries()].sort((a, b) => b[1] - a[1]);

  function getDivisionKillRank(pokemonId: number) {
    const idx = divKillRanking.findIndex(([id]) => id === pokemonId);
    return idx === -1 ? null : idx + 1;
  }

  // 4. Current form (last 3 results)
  function getForm(seasonCoachId: number): ("W" | "L")[] {
    const teamIds = new Set([seasonCoachId, ...(replacementMap.get(seasonCoachId) || [])]);
    const teamMatches = divisionMatches
      .filter((m) => m.week <= 100 && m.winnerId && (teamIds.has(m.coach1SeasonId) || teamIds.has(m.coach2SeasonId)))
      .sort((a, b) => b.week - a.week)
      .slice(0, 3);
    return teamMatches.map((m) => {
      if (teamIds.has(m.winnerId!)) return "W";
      return "L";
    });
  }

  const t1Standings = getStandingsContext(match.coach1SeasonId);
  const t2Standings = getStandingsContext(match.coach2SeasonId);
  const t1KillLeader = getTeamKillLeader(match.coach1SeasonId);
  const t2KillLeader = getTeamKillLeader(match.coach2SeasonId);

  const context: MatchContext = {
    team1: {
      standings: t1Standings,
      form: getForm(match.coach1SeasonId),
      killLeader: t1KillLeader ? {
        name: t1KillLeader.name,
        kills: t1KillLeader.kills,
        divisionRank: getDivisionKillRank(t1KillLeader.pokemonId),
      } : null,
    },
    team2: {
      standings: t2Standings,
      form: getForm(match.coach2SeasonId),
      killLeader: t2KillLeader ? {
        name: t2KillLeader.name,
        kills: t2KillLeader.kills,
        divisionRank: getDivisionKillRank(t2KillLeader.pokemonId),
      } : null,
    },
    h2h,
    divisionName: match.division?.name || "",
  };

  const data: OverlayData = {
    matchId: match.id,
    week: match.week,
    weekLabel: getWeekLabel(match.week),
    seasonName: match.season?.name || "",
    divisionName: match.division?.name || "",
    divisionColor: getDivisionColor(match.division?.name || ""),
    team1: {
      seasonCoachId: match.coach1SeasonId,
      teamName: coach1?.teamName || "",
      teamAbbreviation: coach1?.teamAbbreviation || "",
      teamLogoUrl: coach1?.teamLogoUrl || null,
      coachName: coach1?.coach?.name || "",
      eloRating: Math.round(coach1?.coach?.eloRating || 1000),
      record: getRecord(match.coach1SeasonId),
      roster: buildRoster(roster1Result),
    },
    team2: {
      seasonCoachId: match.coach2SeasonId,
      teamName: coach2?.teamName || "",
      teamAbbreviation: coach2?.teamAbbreviation || "",
      teamLogoUrl: coach2?.teamLogoUrl || null,
      coachName: coach2?.coach?.name || "",
      eloRating: Math.round(coach2?.coach?.eloRating || 1000),
      record: getRecord(match.coach2SeasonId),
      roster: buildRoster(roster2Result),
    },
  };

  return <Overlay2Client data={data} battleUrl={battleUrl} context={context} />;
}
