import { db } from "@/lib/db";
import {
  seasons,
  divisions,
  seasonCoaches,
  matches,
  matchPokemon,
  rosters,
  transactions,
  pokemon,
} from "@/lib/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { SlideshowClient } from "./slideshow-client";
import { computeAndSortStandings } from "@/lib/standings-sort";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Power Rankings Slideshow",
};

export interface SlideData {
  rank: number;
  totalTeams: number;
  seasonCoachId: number;
  teamName: string;
  teamAbbreviation: string | null;
  teamLogoUrl: string | null;
  coachName: string | null;
  wins: number;
  losses: number;
  differential: number;
  inheritedWins: number;
  inheritedLosses: number;
  inheritedDifferential: number;
  roster: RosterPokemon[];
  allPokemonStats: PokemonStatEntry[];
  schedule: ScheduleMatch[];
  nearbyStandings: StandingsEntry[];
  transactions: TransactionEntry[];
  faRemaining: number;
  p2pRemaining: number;
}

export interface PokemonStatEntry {
  pokemonId: number;
  name: string;
  displayName: string | null;
  spriteUrl: string | null;
  kills: number;
  deaths: number;
  gamesPlayed: number;
  isOnRoster: boolean;
  isTeraCaptain: boolean;
}

export interface RosterPokemon {
  pokemonId: number;
  name: string;
  displayName: string | null;
  spriteUrl: string | null;
  artworkUrl: string | null;
  speed: number;
  price: number;
  isTeraCaptain: boolean | null;
  kills: number;
  deaths: number;
  gamesPlayed: number;
}

export interface MatchPokemonStat {
  name: string;
  spriteUrl: string | null;
  kills: number;
  deaths: number;
}

export interface ScheduleMatch {
  week: number;
  opponentName: string;
  opponentAbbreviation: string | null;
  opponentLogoUrl: string | null;
  result: "W" | "L" | "upcoming";
  differential: number;
  myKills: number;
  opponentKills: number;
  myPokemon: MatchPokemonStat[];
  opponentPokemon: MatchPokemonStat[];
  isPredecessorGame: boolean;
  isForfeit: boolean;
  myTeamAbbreviation: string | null;
}

export interface StandingsEntry {
  rank: number;
  teamName: string;
  teamAbbreviation: string | null;
  wins: number;
  losses: number;
  differential: number;
  isCurrent: boolean;
}

export interface TransactionPokemon {
  name: string;
  spriteUrl: string | null;
  isTeraCaptain?: boolean;
}

export interface TransactionEntry {
  week: number;
  type: string;
  pokemonIn: TransactionPokemon[];
  pokemonOut: TransactionPokemon[];
  newTeraCaptain: TransactionPokemon | null;
  oldTeraCaptain: TransactionPokemon | null;
  budgetChange: number | null;
}

interface PageProps {
  searchParams: Promise<{ seasonId?: string; divisionId?: string; order?: string; hostedBy?: string }>;
}

export default async function SlideshowPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const seasonId = parseInt(params.seasonId || "0");
  const divisionId = parseInt(params.divisionId || "0");
  const orderParam = params.order || "";
  const hostedBy = params.hostedBy || "";

  if (!seasonId || !divisionId || !orderParam) {
    notFound();
  }

  const orderIds = orderParam.split(",").map(Number).filter(Boolean);
  if (orderIds.length === 0) notFound();

  // Fetch all data in parallel
  const [season, division, allCoaches, allDivisionMatches, allRosters, allTransactions, allPokemon] =
    await Promise.all([
      db.query.seasons.findFirst({ where: eq(seasons.id, seasonId) }),
      db.query.divisions.findFirst({ where: eq(divisions.id, divisionId) }),
      db.query.seasonCoaches.findMany({
        where: eq(seasonCoaches.divisionId, divisionId),
        with: { coach: true },
      }),
      db.query.matches.findMany({
        where: eq(matches.divisionId, divisionId),
        with: {
          coach1: true,
          coach2: true,
          matchPokemon: {
            with: { pokemon: true },
          },
        },
        orderBy: (m, { asc }) => [asc(m.week)],
      }),
      db.query.rosters.findMany({
        with: { pokemon: true, seasonCoach: true },
      }),
      db.query.transactions.findMany({
        where: eq(transactions.seasonId, seasonId),
      }),
      db.query.pokemon.findMany(),
    ]);

  if (!season || !division) notFound();

  // Build lookups
  const pokemonById = new Map(allPokemon.map((p) => [p.id, p]));
  const coachById = new Map(allCoaches.map((c) => [c.id, c]));

  // Build replacement map (inactive -> active)
  const replacementMap = new Map<number, number[]>();
  for (const sc of allCoaches) {
    if (!sc.isActive && sc.replacedById) {
      const predecessors = replacementMap.get(sc.replacedById) || [];
      predecessors.push(sc.id);
      replacementMap.set(sc.replacedById, predecessors);
    }
  }

  // Compute full standings for all active coaches
  const activeCoaches = allCoaches.filter((sc) => sc.isActive);
  const fullStandings = computeAndSortStandings(activeCoaches, replacementMap, allDivisionMatches);

  // Filter rosters to only this division's coaches
  const divCoachIds = new Set(allCoaches.map((c) => c.id));
  const divRosters = allRosters.filter((r) => divCoachIds.has(r.seasonCoachId));

  // Build per-coach match pokemon stats
  const coachPokemonStats = new Map<
    number,
    Map<number, { kills: number; deaths: number; gamesPlayed: number }>
  >();

  for (const m of allDivisionMatches) {
    for (const mp of m.matchPokemon) {
      if (!divCoachIds.has(mp.seasonCoachId)) continue;
      if (!coachPokemonStats.has(mp.seasonCoachId)) {
        coachPokemonStats.set(mp.seasonCoachId, new Map());
      }
      const pkStats = coachPokemonStats.get(mp.seasonCoachId)!;
      if (!pkStats.has(mp.pokemonId)) {
        pkStats.set(mp.pokemonId, { kills: 0, deaths: 0, gamesPlayed: 0 });
      }
      const stats = pkStats.get(mp.pokemonId)!;
      stats.kills += mp.kills || 0;
      stats.deaths += mp.deaths || 0;
      stats.gamesPlayed += 1;
    }
  }

  // Filter transactions to this division's coaches (include partner P2P trades)
  const divTransactions = allTransactions.filter(
    (tx) => divCoachIds.has(tx.seasonCoachId) ||
      (tx.type === "P2P_TRADE" && tx.tradingPartnerSeasonCoachId && divCoachIds.has(tx.tradingPartnerSeasonCoachId))
  );

  // Build roster TC lookup: "seasonCoachId-pokemonId" → isTeraCaptain
  const rosterTCMap = new Map<string, boolean>();
  for (const r of divRosters) {
    rosterTCMap.set(`${r.seasonCoachId}-${r.pokemonId}`, !!r.isTeraCaptain);
  }

  // Build slides
  const slides: SlideData[] = orderIds.map((scId, idx) => {
    const sc = coachById.get(scId);
    if (!sc) {
      return null;
    }

    const predecessorIds = replacementMap.get(sc.id) || [];
    const teamIds = new Set([sc.id, ...predecessorIds]);
    const hasPredecessor = predecessorIds.length > 0;

    // Compute W/L split: own games vs inherited
    let wins = 0, losses = 0, differential = 0;
    let inheritedWins = 0, inheritedLosses = 0, inheritedDifferential = 0;
    for (const m of allDivisionMatches) {
      if (m.week > 100) continue;
      const isOwn1 = m.coach1SeasonId === sc.id;
      const isOwn2 = m.coach2SeasonId === sc.id;
      const isPred1 = !isOwn1 && teamIds.has(m.coach1SeasonId);
      const isPred2 = !isOwn2 && teamIds.has(m.coach2SeasonId);

      if (isOwn1) {
        if (m.winnerId === m.coach1SeasonId) wins++;
        else if (m.winnerId) losses++;
        else if (m.isForfeit) losses++;
        differential += m.coach1Differential || 0;
      } else if (isPred1) {
        if (m.winnerId === m.coach1SeasonId) inheritedWins++;
        else if (m.winnerId) inheritedLosses++;
        else if (m.isForfeit) inheritedLosses++;
        inheritedDifferential += m.coach1Differential || 0;
      }
      if (isOwn2) {
        if (m.winnerId === m.coach2SeasonId) wins++;
        else if (m.winnerId) losses++;
        else if (m.isForfeit) losses++;
        differential += m.coach2Differential || 0;
      } else if (isPred2) {
        if (m.winnerId === m.coach2SeasonId) inheritedWins++;
        else if (m.winnerId) inheritedLosses++;
        else if (m.isForfeit) inheritedLosses++;
        inheritedDifferential += m.coach2Differential || 0;
      }
    }

    // Roster with stats — only from this coach's own games
    const coachRosters = divRosters.filter((r) => r.seasonCoachId === sc.id);
    const ownPokemonStats = coachPokemonStats.get(sc.id) || new Map();

    const roster = coachRosters.map((r) => {
      const stats = ownPokemonStats.get(r.pokemonId) || {
        kills: 0,
        deaths: 0,
        gamesPlayed: 0,
      };
      return {
        pokemonId: r.pokemonId,
        name: r.pokemon?.name || "Unknown",
        displayName: r.pokemon?.displayName || null,
        spriteUrl: r.pokemon?.spriteUrl || null,
        artworkUrl: r.pokemon?.artworkUrl || null,
        speed: r.pokemon?.speed || 0,
        price: r.price,
        isTeraCaptain: r.isTeraCaptain,
        kills: stats.kills,
        deaths: stats.deaths,
        gamesPlayed: stats.gamesPlayed,
        _draftOrder: r.draftOrder,
        _id: r.id,
      };
    });

    // Show the highest-point Pokemon first. Keep draft order and DB insertion
    // order as stable tie-breakers for Pokemon with the same point value.
    roster.sort((a, b) => {
      if (a.price !== b.price) return b.price - a.price;
      const aOrder = a._draftOrder ?? Infinity;
      const bOrder = b._draftOrder ?? Infinity;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a._id - b._id;
    });
    const sortedRoster: RosterPokemon[] = roster.map((item) => {
      const { _draftOrder, _id, ...entry } = item;
      void _draftOrder;
      void _id;
      return entry;
    });

    // All pokemon stats — only from this coach's own games (including dropped pokemon)
    const currentRosterIds = new Set(coachRosters.map((r) => r.pokemonId));
    const allPokemonStats: PokemonStatEntry[] = [];
    for (const [pkId, stats] of ownPokemonStats) {
      const pk = pokemonById.get(pkId);
      if (!pk) continue;
      const rosterEntry = coachRosters.find((r) => r.pokemonId === pkId);
      allPokemonStats.push({
        pokemonId: pkId,
        name: pk.name,
        displayName: pk.displayName || null,
        spriteUrl: pk.spriteUrl || null,
        kills: stats.kills,
        deaths: stats.deaths,
        gamesPlayed: stats.gamesPlayed,
        isOnRoster: currentRosterIds.has(pkId),
        isTeraCaptain: rosterEntry?.isTeraCaptain ?? false,
      });
    }
    // Sort: on roster first, then by kills desc
    allPokemonStats.sort((a, b) => {
      if (a.isOnRoster !== b.isOnRoster) return a.isOnRoster ? -1 : 1;
      return b.kills - a.kills;
    });

    // Schedule
    const schedule: ScheduleMatch[] = [];
    for (const m of allDivisionMatches) {
      if (m.week > 100) continue;
      const isCoach1 = teamIds.has(m.coach1SeasonId);
      const isCoach2 = teamIds.has(m.coach2SeasonId);
      if (!isCoach1 && !isCoach2) continue;

      const opponentScId = isCoach1 ? m.coach2SeasonId : m.coach1SeasonId;
      const opponent = m.coach1 && isCoach1 ? m.coach2 : m.coach1;

      let result: "W" | "L" | "upcoming" = "upcoming";
      let diff = 0;
      if (m.winnerId) {
        const myId = isCoach1 ? m.coach1SeasonId : m.coach2SeasonId;
        result = m.winnerId === myId ? "W" : "L";
        diff = isCoach1 ? m.coach1Differential || 0 : m.coach2Differential || 0;
      } else if (m.isForfeit) {
        result = "L";
      }

      // Compute kills per side and pokemon stats from matchPokemon
      const myScId = isCoach1 ? m.coach1SeasonId : m.coach2SeasonId;
      const oppScId = isCoach1 ? m.coach2SeasonId : m.coach1SeasonId;
      let myKills = 0, opponentKills = 0;
      const myPokemon: MatchPokemonStat[] = [];
      const opponentPokemon: MatchPokemonStat[] = [];
      for (const mp of m.matchPokemon) {
        const pk = mp.pokemon;
        const stat: MatchPokemonStat = {
          name: pk?.displayName || pk?.name || "Unknown",
          spriteUrl: pk?.spriteUrl || null,
          kills: mp.kills || 0,
          deaths: mp.deaths || 0,
        };
        if (mp.seasonCoachId === myScId) {
          myKills += mp.kills || 0;
          myPokemon.push(stat);
        } else {
          opponentKills += mp.kills || 0;
          opponentPokemon.push(stat);
        }
      }
      // Sort by kills desc
      myPokemon.sort((a, b) => b.kills - a.kills);
      opponentPokemon.sort((a, b) => b.kills - a.kills);

      // Determine if this was played by a predecessor
      const isPredecessorGame = isCoach1
        ? !new Set([sc.id]).has(m.coach1SeasonId)
        : !new Set([sc.id]).has(m.coach2SeasonId);

      // For predecessor games, show the original team's abbreviation
      const actualCoach = isCoach1 ? m.coach1 : m.coach2;
      const myTeamAbbreviation = isPredecessorGame
        ? (actualCoach?.teamAbbreviation || actualCoach?.teamName || null)
        : null;

      schedule.push({
        week: m.week,
        opponentName: opponent?.teamName || "Unknown",
        opponentAbbreviation: opponent?.teamAbbreviation || null,
        opponentLogoUrl: opponent?.teamLogoUrl || null,
        result,
        differential: diff,
        myKills,
        opponentKills,
        myPokemon,
        opponentPokemon,
        isPredecessorGame,
        isForfeit: !!m.isForfeit,
        myTeamAbbreviation,
      });
    }

    // Nearby standings (up to 7 teams, centered on current)
    const standingsIdx = fullStandings.findIndex((s) => s.id === sc.id);
    const total = fullStandings.length;
    const windowSize = Math.min(7, total);
    let nearbyStart = Math.max(0, standingsIdx - 3);
    let nearbyEnd = nearbyStart + windowSize;
    if (nearbyEnd > total) {
      nearbyEnd = total;
      nearbyStart = Math.max(0, nearbyEnd - windowSize);
    }
    const nearbyStandings: StandingsEntry[] = fullStandings
      .slice(nearbyStart, nearbyEnd)
      .map((s, i) => ({
        rank: nearbyStart + i + 1,
        teamName: s.teamName,
        teamAbbreviation: s.teamAbbreviation,
        wins: s.wins,
        losses: s.losses,
        differential: s.differential,
        isCurrent: s.id === sc.id,
      }));

    // Transactions for this coach (include partner P2P trades with swapped pokemonIn/Out)
    const toPokemon = (id: number): TransactionPokemon => {
      const pk = pokemonById.get(id);
      return { name: pk?.displayName || pk?.name || "?", spriteUrl: pk?.spriteUrl || null };
    };
    const toPokemonWithTC = (id: number, destSeasonCoachId: number): TransactionPokemon => {
      const pk = pokemonById.get(id);
      return {
        name: pk?.displayName || pk?.name || "?",
        spriteUrl: pk?.spriteUrl || null,
        isTeraCaptain: rosterTCMap.get(`${destSeasonCoachId}-${id}`) || false,
      };
    };
    // Collect primary + partner P2P trades for this coach
    const primaryTxs = divTransactions.filter((tx) => teamIds.has(tx.seasonCoachId));
    const partnerP2PTxs = divTransactions
      .filter((tx) => tx.type === "P2P_TRADE" && tx.tradingPartnerSeasonCoachId && teamIds.has(tx.tradingPartnerSeasonCoachId) && !teamIds.has(tx.seasonCoachId))
      .map((tx) => ({ ...tx, pokemonIn: tx.pokemonOut, pokemonOut: tx.pokemonIn }));
    const coachTxs = [...primaryTxs, ...partnerP2PTxs]
      .sort((a, b) => b.week - a.week)
      .map((tx) => {
        const pokemonInIds = (tx.pokemonIn as number[]) || [];
        const pokemonOutIds = (tx.pokemonOut as number[]) || [];
        if (tx.type === "P2P_TRADE") {
          // For P2P trades: pokemonIn arrived at this coach, pokemonOut went to the other coach
          const isPartner = !primaryTxs.includes(tx as any);
          const thisCoachId = isPartner ? tx.tradingPartnerSeasonCoachId! : tx.seasonCoachId;
          const otherCoachId = isPartner ? tx.seasonCoachId : tx.tradingPartnerSeasonCoachId!;
          return {
            week: tx.week,
            type: tx.type,
            pokemonIn: pokemonInIds.map((id) => toPokemonWithTC(id, thisCoachId)),
            pokemonOut: pokemonOutIds.map((id) => toPokemonWithTC(id, otherCoachId)),
            newTeraCaptain: tx.newTeraCaptainId ? toPokemon(tx.newTeraCaptainId) : null,
            oldTeraCaptain: tx.oldTeraCaptainId ? toPokemon(tx.oldTeraCaptainId) : null,
            budgetChange: tx.budgetChange,
          };
        }
        return {
          week: tx.week,
          type: tx.type,
          pokemonIn: pokemonInIds.map(toPokemon),
          pokemonOut: pokemonOutIds.map(toPokemon),
          newTeraCaptain: tx.newTeraCaptainId ? toPokemon(tx.newTeraCaptainId) : null,
          oldTeraCaptain: tx.oldTeraCaptainId ? toPokemon(tx.oldTeraCaptainId) : null,
          budgetChange: tx.budgetChange,
        };
      });

    // Compute transaction counts (FA/P2P remaining)
    // Only count transactions where countsAgainstLimit is true
    const countableTxs = allTransactions.filter(
      (tx) => tx.countsAgainstLimit && teamIds.has(tx.seasonCoachId)
    );
    const partnerP2PCount = allTransactions.filter(
      (tx) => tx.countsAgainstLimit && tx.type === "P2P_TRADE" &&
        tx.tradingPartnerSeasonCoachId && teamIds.has(tx.tradingPartnerSeasonCoachId) &&
        !teamIds.has(tx.seasonCoachId)
    ).length;
    let faUsed = 0;
    let p2pUsed = 0;
    for (const tx of countableTxs) {
      if (tx.type === "FA_PICKUP" || tx.type === "FA_SWAP") {
        faUsed++;
      } else if (tx.type === "TERA_SWAP" && tx.newTeraCaptainId) {
        faUsed++;
      } else if (tx.type === "P2P_TRADE") {
        p2pUsed++;
      }
    }
    p2pUsed += partnerP2PCount;

    return {
      rank: orderIds.length - idx,
      totalTeams: activeCoaches.length,
      seasonCoachId: sc.id,
      teamName: sc.teamName,
      teamAbbreviation: sc.teamAbbreviation,
      teamLogoUrl: sc.teamLogoUrl,
      coachName: sc.coach?.name || null,
      wins,
      losses,
      differential,
      inheritedWins,
      inheritedLosses,
      inheritedDifferential,
      roster: sortedRoster,
      allPokemonStats,
      schedule,
      nearbyStandings,
      transactions: coachTxs,
      faRemaining: Math.max(0, 6 - faUsed),
      p2pRemaining: Math.max(0, 6 - p2pUsed),
    };
  }).filter(Boolean) as SlideData[];

  const divisionInfo = {
    name: division.name,
    logoUrl: division.logoUrl,
    color: getDivisionColor(division.name),
  };

  const seasonInfo = {
    name: season.name,
  };

  return (
    <SlideshowClient
      slides={slides}
      division={divisionInfo}
      season={seasonInfo}
      hostedBy={hostedBy}
    />
  );
}

const DIVISION_COLORS: Record<string, string> = {
  Infinity: "#E2A3C7",
  Infinty: "#E2A3C7",
  Stargazer: "#3b82f6",
  Sunset: "#fb923c",
  Crystal: "#c084fc",
  Neon: "#4ade80",
};

function getDivisionColor(name: string | null | undefined) {
  const normalizedName = name?.trim().toLowerCase();
  if (!normalizedName) return "#64748b";

  const colorKey = Object.keys(DIVISION_COLORS).find(
    (divisionName) => divisionName.toLowerCase() === normalizedName
  );

  return colorKey ? DIVISION_COLORS[colorKey] : "#64748b";
}
