import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { coaches, eloHistory, seasonCoaches, matches, rosters, seasonPokemonPrices, matchPokemon, transactions, pokemon, playoffMatches, bets, killBets, deathBets, coachPurchases, storeItems, pickEmParticipants, triviaRewards, fantasyRewards } from "@/lib/schema";
import * as schema from "@/lib/schema";
import { eq, desc, asc, and, inArray, or, isNotNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTransactionCounts } from "@/lib/transaction-service";
import { getTypeColor } from "@/lib/utils";
import { CopyTeamButton } from "@/components/copy-team-button";
import { SeasonSelector } from "@/components/season-selector";
import { MoveDataProvider, MoveDataToggleButton, MoveIcons } from "@/components/extended-icons-toggle";
import { MobileTooltip } from "@/components/mobile-tooltip";
import { CoachStoreButton } from "@/components/coach-store-button";
import { LogoFrame } from "@/components/logo-frame";
import { ProjectMewConfirmation } from "@/components/project-mew-confirmation";
import { PollCard } from "@/components/poll-card";
import { ShareButton } from "@/components/share-button";
import { getSession } from "@/lib/session";
import { getActivePoll } from "@/lib/polls";
import { isProjectMewReleased } from "@/lib/project-mew";
import { CHAMPION_GOLD_LOGO_FRAME_SLUG, isLogoFrameSlug, parseLogoFrameColors } from "@/lib/logo-frame-items";
import { MATCH_COMPLETION_COINS, STARTING_COACH_COINS } from "@/lib/coin-config";
import { getCoachProfileMilestones } from "@/lib/coach-milestones";

const COACH_YOUTUBE_URLS: Record<number, string> = {
  254: "https://www.youtube.com/user/AlmightyArceus",
};

function CoachYouTubeLink({ coachId }: { coachId: number }) {
  const youtubeUrl = COACH_YOUTUBE_URLS[coachId];
  if (!youtubeUrl) return null;

  return (
    <a
      href={youtubeUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="AlmightyArceus on YouTube"
      title="AlmightyArceus on YouTube"
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[#FF0000] transition-colors hover:bg-[#FF0000]/15 hover:text-red-400"
    >
      <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0C.488 3.45.029 5.804 0 12c.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0C23.512 20.55 23.971 18.196 24 12c-.029-6.185-.484-8.549-4.385-8.816zM9 16V8l8 3.993L9 16z" />
      </svg>
    </a>
  );
}

// Hazard move categories
const HAZARD_REMOVAL_MOVES = [
  { id: "rapid-spin", name: "Rapid Spin" },
  { id: "defog", name: "Defog" },
  { id: "mortal-spin", name: "Mortal Spin" },
  { id: "tidy-up", name: "Tidy Up" },
  { id: "court-change", name: "Court Change" },
];

const HAZARD_SETTER_MOVES = [
  { id: "stealth-rock", name: "Stealth Rock" },
  { id: "spikes", name: "Spikes" },
  { id: "toxic-spikes", name: "Toxic Spikes" },
  { id: "sticky-web", name: "Sticky Web" },
  { id: "ceaseless-edge", name: "Ceaseless Edge" },
  { id: "stone-axe", name: "Stone Axe" },
];

// Pivoting moves (excluding Baton Pass since most Pokemon have it)
const PIVOT_MOVES = [
  { id: "u-turn", name: "U-Turn" },
  { id: "volt-switch", name: "Volt Switch" },
  { id: "flip-turn", name: "Flip Turn" },
  { id: "parting-shot", name: "Parting Shot" },
  { id: "teleport", name: "Teleport" },
  { id: "chilly-reception", name: "Chilly Reception" },
  { id: "shed-tail", name: "Shed Tail" },
];

// Utility moves (used against foe)
const UTILITY_MOVES = [
  { id: "will-o-wisp", name: "Will-O-Wisp" },
  { id: "thunder-wave", name: "Thunder Wave" },
  { id: "toxic", name: "Toxic" },
  { id: "glare", name: "Glare" },
  { id: "taunt", name: "Taunt" },
  { id: "encore", name: "Encore" },
  { id: "whirlwind", name: "Whirlwind" },
  { id: "roar", name: "Roar" },
  { id: "dragon-tail", name: "Dragon Tail" },
  { id: "circle-throw", name: "Circle Throw" },
  { id: "trick", name: "Trick" },
  { id: "switcheroo", name: "Switcheroo" },
  { id: "yawn", name: "Yawn" },
  { id: "knock-off", name: "Knock Off" },
];

// Support moves (help team)
const SUPPORT_MOVES = [
  { id: "wish", name: "Wish" },
  { id: "healing-wish", name: "Healing Wish" },
  { id: "lunar-dance", name: "Lunar Dance" },
  { id: "aromatherapy", name: "Aromatherapy" },
  { id: "heal-bell", name: "Heal Bell" },
  { id: "tailwind", name: "Tailwind" },
  { id: "trick-room", name: "Trick Room" },
  { id: "reflect", name: "Reflect" },
  { id: "light-screen", name: "Light Screen" },
  { id: "aurora-veil", name: "Aurora Veil" },
  { id: "haze", name: "Haze" },
  { id: "memento", name: "Memento" },
];

// Priority moves
const PRIORITY_MOVES = [
  { id: "fake-out", name: "Fake Out" },
  { id: "first-impression", name: "First Impression" },
  { id: "extreme-speed", name: "Extreme Speed" },
  { id: "accelerock", name: "Accelerock" },
  { id: "aqua-jet", name: "Aqua Jet" },
  { id: "bullet-punch", name: "Bullet Punch" },
  { id: "ice-shard", name: "Ice Shard" },
  { id: "jet-punch", name: "Jet Punch" },
  { id: "mach-punch", name: "Mach Punch" },
  { id: "quick-attack", name: "Quick Attack" },
  { id: "shadow-sneak", name: "Shadow Sneak" },
  { id: "sucker-punch", name: "Sucker Punch" },
  { id: "vacuum-wave", name: "Vacuum Wave" },
  { id: "water-shuriken", name: "Water Shuriken" },
  { id: "grassy-glide", name: "Grassy Glide" },
];

function sortRosterByDisplayPrice<T extends {
  id?: number | string | null;
  price?: number | null;
  draftOrder?: number | null;
  acquiredWeek?: number | null;
  pokemonId?: number | null;
  isTeraCaptain?: boolean | null;
  pokemon?: { displayName?: string | null; name?: string | null } | null;
  displayName?: string | null;
  name?: string | null;
}>(
  roster: T[],
  priceMap: Map<number, { basePrice: number; teraCaptainCost: number | null }>,
) {
  return [...roster].sort((a, b) => {
    const getDisplayPrice = (entry: T) => {
      const numericId = typeof entry.id === "number" ? entry.id : undefined;
      const pokemonId = entry.pokemonId ?? numericId;
      const priceInfo = pokemonId ? priceMap.get(pokemonId) : undefined;
      const basePrice = priceInfo?.basePrice ?? entry.price ?? 0;
      const teraCost = entry.isTeraCaptain ? (priceInfo?.teraCaptainCost ?? 0) : 0;
      return basePrice + teraCost;
    };

    const priceDiff = getDisplayPrice(b) - getDisplayPrice(a);
    if (priceDiff !== 0) return priceDiff;

    const draftOrderDiff = (a.draftOrder ?? 999) - (b.draftOrder ?? 999);
    if (draftOrderDiff !== 0) return draftOrderDiff;

    const acquiredWeekDiff = (a.acquiredWeek ?? 999) - (b.acquiredWeek ?? 999);
    if (acquiredWeekDiff !== 0) return acquiredWeekDiff;

    const aName = a.pokemon?.displayName || a.pokemon?.name || a.displayName || a.name || "";
    const bName = b.pokemon?.displayName || b.pokemon?.name || b.displayName || b.name || "";
    return aName.localeCompare(bName);
  });
}

// Helper to get special moves a Pokemon has
function getSpecialMoves(pokemonMoves: string[] | null | undefined) {
  if (!pokemonMoves) return { removal: [], setters: [], pivots: [], utility: [], support: [], priority: [] };

  const removal = HAZARD_REMOVAL_MOVES.filter(m => pokemonMoves.includes(m.id));
  const setters = HAZARD_SETTER_MOVES.filter(m => pokemonMoves.includes(m.id));
  const pivots = PIVOT_MOVES.filter(m => pokemonMoves.includes(m.id));
  const utility = UTILITY_MOVES.filter(m => pokemonMoves.includes(m.id));
  const support = SUPPORT_MOVES.filter(m => pokemonMoves.includes(m.id));
  const priority = PRIORITY_MOVES.filter(m => pokemonMoves.includes(m.id));

  return { removal, setters, pivots, utility, support, priority };
}

// Legacy helper for backward compatibility
function getHazardMoves(pokemonMoves: string[] | null | undefined) {
  const moves = getSpecialMoves(pokemonMoves);
  return { removal: moves.removal, setters: moves.setters, pivots: moves.pivots };
}

// Helper to format week display (handles playoff rounds)
function formatWeekDisplay(week: number): string {
  if (week === 101) return "Quarterfinals";
  if (week === 102) return "Semifinals";
  if (week === 103) return "Finals";
  return `Week ${week}`;
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sc?: string }>;
}

async function getCoach(id: number) {
  return await db.query.coaches.findFirst({
    where: eq(coaches.id, id),
  });
}

async function getCoachEloHistory(coachId: number) {
  return await db.query.eloHistory.findMany({
    where: eq(eloHistory.coachId, coachId),
    orderBy: [desc(eloHistory.id)], // Order by ID (insertion order) for correct chronology
    limit: 20,
  });
}

async function getCoachSeasons(coachId: number) {
  const allParticipations = await db.query.seasonCoaches.findMany({
    where: eq(seasonCoaches.coachId, coachId),
    with: {
      division: {
        with: {
          season: true,
        },
      },
      rosters: {
        orderBy: (r: any, { asc, sql }: any) => [
          sql`CASE WHEN ${r.draftOrder} IS NULL THEN 1 ELSE 0 END`,
          asc(r.draftOrder),
          asc(r.id),
        ],
        with: {
          pokemon: true,
        },
      },
    },
  });

  const seasons = allParticipations.filter(
    (sc) => sc.division?.season?.isPublic !== false
  );

  if (seasons.length === 0) {
    return [];
  }

  const seasonCoachIds = seasons.map(s => s.id);

  // Bulk fetch all needed data in parallel
  const [allDivisionCoaches, allDivisionMatches, allTransactions, allPartnerP2PTxs, allPokemon] = await Promise.all([
    db.query.seasonCoaches.findMany(),
    db.query.matches.findMany(),
    db.query.transactions.findMany({
      where: inArray(transactions.seasonCoachId, seasonCoachIds),
    }),
    db.query.transactions.findMany({
      where: and(
        eq(transactions.type, "P2P_TRADE"),
        inArray(transactions.tradingPartnerSeasonCoachId, seasonCoachIds),
      ),
    }),
    db.query.pokemon.findMany(),
  ]);

  // Build lookups
  const coachById = new Map(allDivisionCoaches.map(c => [c.id, c]));
  const pokemonById = new Map(allPokemon.map(p => [p.id, p]));

  // Group matches by division
  const matchesByDivision = new Map<number, typeof allDivisionMatches>();
  for (const m of allDivisionMatches) {
    if (!matchesByDivision.has(m.divisionId)) {
      matchesByDivision.set(m.divisionId, []);
    }
    matchesByDivision.get(m.divisionId)!.push(m);
  }

  // Group transactions by season coach (including partner P2P trades with flipped pokemonIn/Out)
  const txBySeasonCoach = new Map<number, typeof allTransactions>();
  for (const tx of allTransactions) {
    if (!txBySeasonCoach.has(tx.seasonCoachId)) {
      txBySeasonCoach.set(tx.seasonCoachId, []);
    }
    txBySeasonCoach.get(tx.seasonCoachId)!.push(tx);
  }
  // Add partner P2P trades with pokemonIn/pokemonOut swapped to reflect partner's perspective
  for (const tx of allPartnerP2PTxs) {
    const partnerId = tx.tradingPartnerSeasonCoachId!;
    if (!txBySeasonCoach.has(partnerId)) {
      txBySeasonCoach.set(partnerId, []);
    }
    txBySeasonCoach.get(partnerId)!.push({
      ...tx,
      pokemonIn: tx.pokemonOut,
      pokemonOut: tx.pokemonIn,
    });
  }

  // Process each season using in-memory data
  const enhancedSeasons = seasons.map((sc) => {
    let replacedByTeam: string | null = null;
    let replacedTeam: string | null = null;
    let replacementWeek: number | null = null;

    const divMatches = matchesByDivision.get(sc.divisionId) || [];
    const scMatches = divMatches.filter(m =>
      m.coach1SeasonId === sc.id || m.coach2SeasonId === sc.id
    );

    // If this coach was replaced (dropout)
    if (!sc.isActive && sc.replacedById) {
      const replacement = coachById.get(sc.replacedById);
      replacedByTeam = replacement?.teamName || null;

      // Find the last week this coach played
      const lastMatch = scMatches
        .filter(m => m.week <= 100)
        .sort((a, b) => b.week - a.week)[0];
      if (lastMatch) {
        replacementWeek = lastMatch.week + 1;
      }
    }

    // Check if this coach replaced someone (MSR)
    const predecessor = allDivisionCoaches.find(c =>
      c.divisionId === sc.divisionId && c.replacedById === sc.id
    );
    if (predecessor) {
      replacedTeam = predecessor.teamName;

      // Find the first week this replacement coach played
      const firstMatch = scMatches
        .filter(m => m.week <= 100)
        .sort((a, b) => a.week - b.week)[0];
      if (firstMatch) {
        replacementWeek = firstMatch.week;
      }
    }

    // Get the highest completed week (regular season only)
    const lastCompletedWeek = scMatches
      .filter(m => m.week <= 100 && m.winnerId !== null)
      .reduce((max, m) => Math.max(max, m.week), 0);

    // For replacement teams, effectiveWeek must be at least their first scheduled match week
    const firstMatchWeek = scMatches
      .filter(m => m.week <= 100)
      .reduce((min, m) => Math.min(min, m.week), Infinity);
    const effectiveWeek = Math.max(lastCompletedWeek + 1, firstMatchWeek === Infinity ? 1 : firstMatchWeek);

    // Get transactions for this season coach
    const scTransactions = txBySeasonCoach.get(sc.id) || [];

    // Time-sync Tera Captain status based on TERA_SWAP transactions
    // Start with current TC set from roster (this is the FINAL state after all swaps)
    const teraCaptainIds = new Set<number>(
      sc.rosters?.filter((r) => r.isTeraCaptain).map((r) => r.pokemonId) || []
    );

    // Get future transactions that affected TC status (week > effectiveWeek) and reverse them
    // This includes TERA_SWAP and FA_SWAP/FA_DROP that removed a TC (oldTeraCaptainId set)
    const futureTeraChanges = scTransactions
      .filter((tx) => tx.week > effectiveWeek && (tx.type === "TERA_SWAP" || tx.oldTeraCaptainId || tx.newTeraCaptainId))
      .sort((a, b) => b.week !== a.week ? b.week - a.week : b.id - a.id); // Sort descending

    // Reverse each future change to get the state at effectiveWeek
    for (const tx of futureTeraChanges) {
      if (tx.newTeraCaptainId) {
        teraCaptainIds.delete(tx.newTeraCaptainId);
      }
      if (tx.oldTeraCaptainId) {
        teraCaptainIds.add(tx.oldTeraCaptainId);
      }
    }

    // Update rosters with time-synced Tera Captain status
    const timeSyncedRosters = sc.rosters?.map((r) => ({
      ...r,
      isTeraCaptain: teraCaptainIds.has(r.pokemonId),
    }));

    // Find Pokemon that were dropped/traded away in future weeks
    const droppedPokemonToShow: number[] = [];
    for (const tx of scTransactions) {
      if ((tx.type === "FA_DROP" || tx.type === "FA_SWAP" || tx.type === "P2P_TRADE") && tx.week > effectiveWeek) {
        const pokemonOut = tx.pokemonOut as number[] | null;
        if (pokemonOut) {
          for (const pokemonId of pokemonOut) {
            const acquisitionTx = scTransactions.find(t =>
              (t.type === "FA_PICKUP" || t.type === "FA_SWAP" || t.type === "P2P_TRADE") &&
              t.week < tx.week &&
              (t.pokemonIn as number[] | null)?.includes(pokemonId)
            );

            if (acquisitionTx) {
              if (acquisitionTx.week <= effectiveWeek) {
                droppedPokemonToShow.push(pokemonId);
              }
            } else {
              const priorDrop = scTransactions.find(t =>
                (t.type === "FA_DROP" || t.type === "FA_SWAP" || t.type === "P2P_TRADE") &&
                t.week <= effectiveWeek &&
                t.id !== tx.id &&
                (t.pokemonOut as number[] | null)?.includes(pokemonId)
              );
              if (!priorDrop) {
                droppedPokemonToShow.push(pokemonId);
              }
            }
          }
        }
      }
    }

    // Get dropped Pokemon details from lookup, including TC status
    const droppedPokemonDetails = droppedPokemonToShow
      .map(id => {
        const p = pokemonById.get(id);
        if (!p) return null;
        return { ...p, isTeraCaptain: teraCaptainIds.has(id) };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    return {
      ...sc,
      rosters: timeSyncedRosters,
      replacedByTeam,
      replacedTeam,
      replacementWeek,
      lastCompletedWeek,
      effectiveWeek,
      droppedPokemonDetails,
    };
  });

  // Sort by season number descending (most recent first)
  return enhancedSeasons.sort((a, b) => {
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
      // Must involve this coach
      (seasonCoachIds.includes(m.coach1SeasonId) ||
        seasonCoachIds.includes(m.coach2SeasonId)) &&
      // Only show matches that have been played (have a winner or is a forfeit)
      (m.winnerId !== null || m.isForfeit) &&
      // Only show matches from seasons with public schedules
      (m.division?.season?.isPublic !== false) &&
      (m.division?.season?.isSchedulePublic !== false)
  );

  // Sort by season number (highest first), then by week (highest first)
  return relevantMatches.sort((a, b) => {
    // By season number descending (higher = more recent)
    const aSeasonNum = a.division?.season?.seasonNumber || 0;
    const bSeasonNum = b.division?.season?.seasonNumber || 0;
    if (bSeasonNum !== aSeasonNum) return bSeasonNum - aSeasonNum;

    // Within same season, higher week = more recent
    return (b.week || 0) - (a.week || 0);
  });
}

async function getSeasonPokemonPrices(seasonId: number) {
  return await db.query.seasonPokemonPrices.findMany({
    where: eq(seasonPokemonPrices.seasonId, seasonId),
  });
}

async function getCoachMatchPokemon(seasonCoachIds: number[]) {
  if (seasonCoachIds.length === 0) return [];

  return await db.query.matchPokemon.findMany({
    where: inArray(matchPokemon.seasonCoachId, seasonCoachIds),
    with: {
      pokemon: true,
      match: {
        columns: {},
        with: {
          season: {
            columns: { seasonNumber: true },
          },
        },
      },
    },
  });
}

async function getOpponentMatchPokemon(matchIds: number[], seasonCoachIds: number[]) {
  if (matchIds.length === 0) return [];

  // Get all matchPokemon from the coach's matches
  const allMatchPokemon = await db.query.matchPokemon.findMany({
    where: inArray(matchPokemon.matchId, matchIds),
    with: {
      pokemon: true,
    },
  });

  // Filter to only opponent's Pokemon (not the coach's)
  return allMatchPokemon.filter(mp => !seasonCoachIds.includes(mp.seasonCoachId));
}

async function getCoachTransactions(seasonCoachIds: number[]) {
  if (seasonCoachIds.length === 0) return [];

  // Fetch transactions, all pokemon, and all rosters in parallel
  const [allTxs, allPokemon, allRosters] = await Promise.all([
    db.query.transactions.findMany({
      orderBy: [desc(transactions.week), desc(transactions.id)],
    }),
    db.query.pokemon.findMany(),
    db.query.rosters.findMany({
      columns: { seasonCoachId: true, pokemonId: true, isTeraCaptain: true },
    }),
  ]);

  // Build pokemon lookup
  const pokemonById = new Map(allPokemon.map(p => [p.id, p]));

  // Build roster TC lookup: "seasonCoachId-pokemonId" → isTeraCaptain
  const rosterTCMap = new Map<string, boolean>();
  for (const r of allRosters) {
    rosterTCMap.set(`${r.seasonCoachId}-${r.pokemonId}`, !!r.isTeraCaptain);
  }

  // Filter to transactions involving any of this coach's season entries
  const relevantTxs = allTxs.filter(
    (tx) =>
      seasonCoachIds.includes(tx.seasonCoachId) ||
      (tx.tradingPartnerSeasonCoachId && seasonCoachIds.includes(tx.tradingPartnerSeasonCoachId))
  );

  // Enhance with Pokemon details using lookup (no additional queries)
  const enhancedTxs = relevantTxs.map((tx) => {
    const pokemonInIds = (tx.pokemonIn as number[]) || [];
    const pokemonOutIds = (tx.pokemonOut as number[]) || [];

    const pokemonInDetails = pokemonInIds
      .map(id => {
        const p = pokemonById.get(id);
        if (!p) return null;
        // For P2P trades: pokemonIn goes to team1 (tx.seasonCoachId), look up TC on destination roster
        const isTeraCaptain = tx.type === "P2P_TRADE"
          ? rosterTCMap.get(`${tx.seasonCoachId}-${id}`) || false
          : undefined;
        return { ...p, isTeraCaptain };
      })
      .filter(Boolean);

    const pokemonOutDetails = pokemonOutIds
      .map(id => {
        const p = pokemonById.get(id);
        if (!p) return null;
        // For P2P trades: pokemonOut goes to team2 (tradingPartnerSeasonCoachId), look up TC on destination roster
        const isTeraCaptain = tx.type === "P2P_TRADE" && tx.tradingPartnerSeasonCoachId
          ? rosterTCMap.get(`${tx.tradingPartnerSeasonCoachId}-${id}`) || false
          : undefined;
        return { ...p, isTeraCaptain };
      })
      .filter(Boolean);

    const newTeraCaptainDetails = tx.newTeraCaptainId
      ? pokemonById.get(tx.newTeraCaptainId) || null
      : null;

    const oldTeraCaptainDetails = tx.oldTeraCaptainId
      ? pokemonById.get(tx.oldTeraCaptainId) || null
      : null;

    return {
      ...tx,
      pokemonInDetails,
      pokemonOutDetails,
      newTeraCaptainDetails,
      oldTeraCaptainDetails,
    };
  });

  return enhancedTxs;
}

// Get coin breakdown for a coach
async function getCoinBreakdown(coachId: number, seasonCoachIds: number[], publicSeasonIds: number[]) {
  const publicSeasonIdSet = new Set(publicSeasonIds);

  // Get all bets, store purchases, pick-em rewards, and trivia rewards for this coach in parallel
  const [coachBets, coachKillBets, coachDeathBets, purchases, allMatches, pickEmParticipants, coachTriviaRewards, coachFantasyRewards] = await Promise.all([
    db.query.bets.findMany({
      where: eq(bets.coachId, coachId),
    }),
    db.query.killBets.findMany({
      where: eq(killBets.coachId, coachId),
    }),
    db.query.deathBets.findMany({
      where: eq(deathBets.coachId, coachId),
    }),
    db.query.coachPurchases.findMany({
      where: eq(coachPurchases.coachId, coachId),
      with: {
        item: true,
      },
    }),
    db.query.matches.findMany({
      where: isNotNull(matches.winnerId),
    }),
    db.query.pickEmParticipants.findMany({
      where: eq(schema.pickEmParticipants.coachId, coachId),
      with: {
        rewards: true,
      },
    }),
    db.query.triviaRewards.findMany({
      where: eq(triviaRewards.coachId, coachId),
    }),
    db.query.fantasyRewards.findMany({
      where: eq(fantasyRewards.coachId, coachId),
    }),
  ]);

  const publicCompletedMatches = allMatches.filter((match) =>
    publicSeasonIdSet.has(match.seasonId)
  );
  const publicMatchIds = new Set(publicCompletedMatches.map((match) => match.id));

  // Calculate betting profit/loss (includes regular bets, kill bets, and death bets)
  let bettingProfit = 0;
  for (const bet of coachBets.filter((b) => publicMatchIds.has(b.matchId))) {
    if (bet.status === "won") {
      bettingProfit += (bet.payout || 0) - bet.amount;
    } else if (bet.status === "lost") {
      bettingProfit -= bet.amount;
    }
  }
  for (const bet of coachKillBets.filter((b) => publicMatchIds.has(b.matchId))) {
    if (bet.status === "won") {
      bettingProfit += (bet.payout || 0) - bet.amount;
    } else if (bet.status === "lost") {
      bettingProfit -= bet.amount;
    }
  }
  for (const bet of coachDeathBets.filter((b) => publicMatchIds.has(b.matchId))) {
    if (bet.status === "won") {
      bettingProfit += (bet.payout || 0) - bet.amount;
    } else if (bet.status === "lost") {
      bettingProfit -= bet.amount;
    }
  }

  // Separate paid purchases from bonus purchases
  const paidPurchases = purchases.filter((p) => !p.bonusReason);
  const bonusPurchases = purchases.filter((p) => p.bonusReason);

  // Calculate store purchases total (only paid ones affect balance)
  const storePurchasesTotal = paidPurchases.reduce((sum, p) => sum + (p.item?.price || 0), 0);
  const storePurchasesList = paidPurchases.map((p) => ({
    name: p.item?.name || "Unknown Item",
    price: p.item?.price || 0,
  }));
  const bonusPurchasesList = bonusPurchases.map((p) => ({
    name: p.item?.name || "Unknown Item",
    reason: p.bonusReason || "Bonus",
  }));

  let matchesPlayed = 0;
  let forfeitLosses = 0;
  for (const match of publicCompletedMatches) {
    const isCoach1 = seasonCoachIds.includes(match.coach1SeasonId);
    const isCoach2 = seasonCoachIds.includes(match.coach2SeasonId);

    if (isCoach1 || isCoach2) {
      if (match.isForfeit) {
        // Check if this coach was the loser (forfeited)
        const coachSeasonId = isCoach1 ? match.coach1SeasonId : match.coach2SeasonId;
        if (match.winnerId !== coachSeasonId) {
          forfeitLosses++;
        } else {
          // Winner of forfeit still gets coins
          matchesPlayed++;
        }
      } else {
        matchesPlayed++;
      }
    }
  }

  const matchCoins = matchesPlayed * MATCH_COMPLETION_COINS;

  // Calculate pick-em rewards total
  const pickEmRewardsTotal = pickEmParticipants.reduce((sum, p) => {
    return sum + p.rewards
      .filter((r) => publicSeasonIdSet.has(r.seasonId))
      .reduce((rSum, r) => rSum + r.amount, 0);
  }, 0);

  // Calculate trivia rewards total
  const publicTriviaRewards = coachTriviaRewards.filter((r) =>
    publicSeasonIdSet.has(r.seasonId)
  );
  const triviaRewardsTotal = publicTriviaRewards.reduce((sum, r) => sum + r.amount, 0);
  const triviaRewardsList = publicTriviaRewards.map((r) => ({
    amount: r.amount,
    reason: r.reason,
  }));
  const publicFantasyRewards = coachFantasyRewards.filter((r) =>
    publicSeasonIdSet.has(r.seasonId)
  );
  const fantasyRewardsTotal = publicFantasyRewards.reduce((sum, r) => sum + r.amount, 0);
  const fantasyRewardsList = publicFantasyRewards.map((r) => ({
    amount: r.amount,
    reason: r.reason,
  }));

  return {
    starting: STARTING_COACH_COINS,
    matchCoins,
    matchesPlayed,
    bettingProfit,
    pickEmRewards: pickEmRewardsTotal,
    fantasyRewards: fantasyRewardsTotal,
    fantasyRewardsList,
    triviaRewards: triviaRewardsTotal,
    triviaRewardsList,
    storePurchases: storePurchasesTotal,
    storePurchasesList,
    bonusPurchasesList,
    total: STARTING_COACH_COINS + matchCoins + bettingProfit + pickEmRewardsTotal + fantasyRewardsTotal + triviaRewardsTotal - storePurchasesTotal,
  };
}

// Get playoff result for a season coach (using pre-fetched data)
function getPlayoffResult(
  seasonCoachId: number,
  divisionId: number,
  allPlayoffs: Awaited<ReturnType<typeof db.query.playoffMatches.findMany>>
): string | null {
  // Find matches in this division where this coach participated
  const coachPlayoffs = allPlayoffs.filter(
    (p) => p.divisionId === divisionId &&
      (p.higherSeedId === seasonCoachId || p.lowerSeedId === seasonCoachId)
  );

  if (coachPlayoffs.length === 0) return null;

  // Check if they won the finals (round 3)
  const finals = coachPlayoffs.find((p) => p.round === 3);
  if (finals && finals.winnerId === seasonCoachId) {
    return "Champion";
  }

  // Find highest round they lost in
  let highestRoundLost = 0;
  for (const playoff of coachPlayoffs) {
    if (playoff.winnerId && playoff.winnerId !== seasonCoachId) {
      highestRoundLost = Math.max(highestRoundLost, playoff.round);
    }
  }

  if (highestRoundLost === 3) return "Finals";
  if (highestRoundLost === 2) return "Semis";
  if (highestRoundLost === 1) return "Quarters";

  // Still in playoffs (no loss yet) or match not played
  const hasUnfinishedMatch = coachPlayoffs.some((p) => !p.winnerId);
  if (hasUnfinishedMatch) return "In Playoffs";

  return null;
}

// Get regular season standing for a coach in their division (using pre-fetched data)
function getRegularSeasonPlacement(
  seasonCoachId: number,
  divisionId: number,
  allCoaches: Awaited<ReturnType<typeof db.query.seasonCoaches.findMany>>,
  allMatches: Awaited<ReturnType<typeof db.query.matches.findMany>>
): number | null {
  // Filter to coaches in this division
  const divisionCoaches = allCoaches.filter(sc => sc.divisionId === divisionId);

  // Build replacement map (same logic as division page)
  const replacementMap = new Map<number, number[]>();
  for (const sc of divisionCoaches) {
    if (!sc.isActive && sc.replacedById) {
      const predecessors = replacementMap.get(sc.replacedById) || [];
      predecessors.push(sc.id);
      replacementMap.set(sc.replacedById, predecessors);
    }
  }

  // Get active coaches only
  const activeCoaches = divisionCoaches.filter((sc) => sc.isActive);

  // Filter matches to this division
  const divisionMatches = allMatches.filter(m => m.divisionId === divisionId);

  // Calculate standings using in-memory data
  const standings = activeCoaches.map((sc) => {
    const teamIds = new Set([sc.id, ...(replacementMap.get(sc.id) || [])]);
    let wins = 0;
    let differential = 0;

    for (const m of divisionMatches) {
      if (m.week > 100) continue; // Skip playoffs

      if (teamIds.has(m.coach1SeasonId)) {
        if (m.winnerId === m.coach1SeasonId) wins++;
        differential += m.coach1Differential || 0;
      }
      if (teamIds.has(m.coach2SeasonId)) {
        if (m.winnerId === m.coach2SeasonId) wins++;
        differential += m.coach2Differential || 0;
      }
    }

    return { id: sc.id, wins, differential };
  });

  // Sort by wins, then differential
  standings.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.differential - a.differential;
  });

  // Find the coach's placement
  const targetCoach = divisionCoaches.find((sc) => sc.id === seasonCoachId);
  if (!targetCoach) return null;

  // If coach was replaced, find their replacement
  const activeId = targetCoach.isActive ? targetCoach.id : targetCoach.replacedById;
  if (!activeId) return null;

  const placement = standings.findIndex((s) => s.id === activeId);
  return placement >= 0 ? placement + 1 : null;
}

export default async function CoachProfilePage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const coachId = parseInt(resolvedParams.id);

  // Fetch initial data in parallel - all only need coachId
  const [coach, eloHistoryData, coachSeasons, session] = await Promise.all([
    getCoach(coachId),
    getCoachEloHistory(coachId),
    getCoachSeasons(coachId),
    getSession(),
  ]);

  if (!coach) {
    notFound();
  }

  const seasonCoachIds = coachSeasons.map((sc) => sc.id);
  const publicSeasonIds = Array.from(
    new Set(
      coachSeasons
        .map((sc) => sc.division?.season?.id)
        .filter((id): id is number => typeof id === "number")
    )
  );
  const publicDivisionIds = Array.from(
    new Set(coachSeasons.map((sc) => sc.divisionId))
  );
  const publicSeasonIdSet = new Set(publicSeasonIds);
  const publicDivisionIdSet = new Set(publicDivisionIds);

  // Compute selected season entry early so we can parallelize more queries
  const currentSeasonEntry = coachSeasons.find(
    (sc) => sc.division?.season?.isCurrent
  );
  const requestedSeasonCoachId = resolvedSearchParams.sc
    ? parseInt(resolvedSearchParams.sc)
    : currentSeasonEntry?.id || coachSeasons[0]?.id;
  const selectedSeasonEntry = coachSeasons.find(
    (sc) => sc.id === requestedSeasonCoachId
  ) || coachSeasons[0];
  const selectedSeasonCoachId = selectedSeasonEntry?.id;
  const selectedSeasonId = selectedSeasonEntry?.division?.season?.id;
  const projectMewReleased = isProjectMewReleased();
  const canEditProjectMew =
    projectMewReleased &&
    (session?.isMod ||
      (session?.type === "coach" && session.id === coachId));

  // Fetch shared data for placements and playoffs once - include txCounts and pokemonPrices
  const [coachMatches, coachMatchPokemon, coachTransactions, rawSeasonCoaches, rawMatches, rawPlayoffs, coinBreakdown, coachStorePurchases, txCounts, pokemonPrices, activePoll, coachMilestones] = await Promise.all([
    getCoachMatches(seasonCoachIds),
    getCoachMatchPokemon(seasonCoachIds),
    getCoachTransactions(seasonCoachIds),
    db.query.seasonCoaches.findMany(),
    db.query.matches.findMany(),
    db.query.playoffMatches.findMany(),
    getCoinBreakdown(coachId, seasonCoachIds, publicSeasonIds),
    db.query.coachPurchases.findMany({
      where: eq(coachPurchases.coachId, coachId),
      with: { item: true },
    }),
    selectedSeasonEntry ? getTransactionCounts(selectedSeasonEntry.id) : Promise.resolve(null),
    selectedSeasonId ? getSeasonPokemonPrices(selectedSeasonId) : Promise.resolve([]),
    getActivePoll(session),
    getCoachProfileMilestones(coachId),
  ]);
  const allSeasonCoaches = rawSeasonCoaches.filter((sc) =>
    publicDivisionIdSet.has(sc.divisionId)
  );
  const allMatches = rawMatches.filter((m) =>
    publicSeasonIdSet.has(m.seasonId)
  );
  const allPlayoffs = rawPlayoffs.filter((p) =>
    publicSeasonIdSet.has(p.seasonId)
  );

  // Get placement and playoff results for each season using pre-fetched data (no N+1)
  const seasonResults = coachSeasons.map((sc) => {
    const divisionId = sc.divisionId;
    const placement = getRegularSeasonPlacement(sc.id, divisionId, allSeasonCoaches, allMatches);
    const playoffResult = getPlayoffResult(sc.id, divisionId, allPlayoffs);
    return { seasonCoachId: sc.id, placement, playoffResult };
  });
  const seasonResultsMap = new Map(
    seasonResults.map((r) => [r.seasonCoachId, { placement: r.placement, playoffResult: r.playoffResult }])
  );

  // Collect championship wins for badge display, grouped by division
  const championshipWins = coachSeasons
    .filter((sc) => {
      const result = seasonResultsMap.get(sc.id);
      return result?.playoffResult === "Champion";
    })
    .map((sc) => ({
      divisionName: sc.division?.name || "",
      seasonNumber: sc.division?.season?.seasonNumber || 0,
    }));

  // Group by division - each badge shows all seasons won in that division
  const championshipsByDivision = new Map<string, number[]>();
  for (const win of championshipWins) {
    const existing = championshipsByDivision.get(win.divisionName) || [];
    existing.push(win.seasonNumber);
    championshipsByDivision.set(win.divisionName, existing);
  }

  const championships = Array.from(championshipsByDivision.entries()).map(([divisionName, seasons]) => ({
    divisionName,
    seasons: seasons.sort((a, b) => a - b),
  }));

  // Check if coach has Mister Moneybags badge
  const hasMoneybagsBadge = coachStorePurchases.some(
    (p) => p.item?.slug === "mister-moneybags" && p.isActive
  );

  // Check if coach has Twitch Viewer badge
  const hasTwitchBadge = coachStorePurchases.some(
    (p) => p.item?.slug === "twitch-badge" && p.isActive
  );

  const activeLogoFramePurchase = coachStorePurchases.find(
    (p) =>
      p.isActive &&
      p.item?.category === "logo_frame" &&
      (p.item.isActive ||
        (p.item.slug === CHAMPION_GOLD_LOGO_FRAME_SLUG &&
          championships.length > 0)) &&
      isLogoFrameSlug(p.item.slug)
  );
  const activeLogoFrameSlug = activeLogoFramePurchase?.item?.slug;
  const activeLogoFrameColors = parseLogoFrameColors(
    activeLogoFramePurchase?.borderColor
  );
  const profileLogoFrameSlug =
    activeLogoFrameSlug ||
    (championships.length > 0 ? CHAMPION_GOLD_LOGO_FRAME_SLUG : undefined);
  const profileLogoFrameColors =
    activeLogoFrameSlug === CHAMPION_GOLD_LOGO_FRAME_SLUG
      ? null
      : activeLogoFrameColors;

  // Get opponent Pokemon data for nemesis stats
  const matchIds = coachMatches.map((m) => m.id);
  const opponentMatchPokemon = await getOpponentMatchPokemon(matchIds, seasonCoachIds);

  // Get most recent season entry (for header display - logo, team name)
  const mostRecentSeasonEntry = coachSeasons[0];

  // Compute current season W-L record
  const currentSeasonRecord = currentSeasonEntry
    ? (() => {
        const scId = currentSeasonEntry.id;
        let wins = 0;
        let losses = 0;
        for (const m of allMatches) {
          if (m.week > 100) continue; // skip playoff matches
          if (m.coach1SeasonId === scId) {
            if (m.winnerId === m.coach1SeasonId) wins++;
            else if (m.winnerId !== null || m.isForfeit) losses++;
          } else if (m.coach2SeasonId === scId) {
            if (m.winnerId === m.coach2SeasonId) wins++;
            else if (m.winnerId !== null || m.isForfeit) losses++;
          }
        }
        return { wins, losses };
      })()
    : null;

  // Filter transactions to only show selected season, sorted by week descending (latest first)
  const selectedSeasonTransactions = coachTransactions
    .filter(
      (tx: any) =>
        tx.seasonCoachId === selectedSeasonCoachId ||
        tx.tradingPartnerSeasonCoachId === selectedSeasonCoachId
    )
    .sort((a: any, b: any) => b.week - a.week || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Build season coach lookup for trading partner info
  const seasonCoachById = new Map(allSeasonCoaches.map(sc => [sc.id, sc]));

  // Calculate division standings for opponent stats
  const divisionStandings = selectedSeasonEntry
    ? (() => {
        const divisionId = selectedSeasonEntry.divisionId;
        const divisionCoaches = allSeasonCoaches.filter(sc => sc.divisionId === divisionId);
        const divisionMatches = allMatches.filter(m => m.divisionId === divisionId && m.week <= 100);

        // Build replacement map
        const replacementMap = new Map<number, number[]>();
        for (const sc of divisionCoaches) {
          if (!sc.isActive && sc.replacedById) {
            const predecessors = replacementMap.get(sc.replacedById) || [];
            predecessors.push(sc.id);
            replacementMap.set(sc.replacedById, predecessors);
          }
        }

        const activeCoaches = divisionCoaches.filter(sc => sc.isActive);

        const standings = activeCoaches.map((sc) => {
          const teamIds = new Set([sc.id, ...(replacementMap.get(sc.id) || [])]);
          let wins = 0;
          let losses = 0;
          let differential = 0;
          let gamesPlayed = 0;

          for (const m of divisionMatches) {
            // Check if this is a double forfeit (isForfeit but no winner)
            const isDoubleForfeit = m.isForfeit && m.winnerId === null;

            if (teamIds.has(m.coach1SeasonId)) {
              if (m.winnerId !== null) {
                gamesPlayed++;
                if (m.winnerId === m.coach1SeasonId) wins++;
                else losses++;
              } else if (isDoubleForfeit) {
                // Double forfeit counts as a loss
                gamesPlayed++;
                losses++;
              }
              differential += m.coach1Differential || 0;
            }
            if (teamIds.has(m.coach2SeasonId)) {
              if (m.winnerId !== null) {
                gamesPlayed++;
                if (m.winnerId === m.coach2SeasonId) wins++;
                else losses++;
              } else if (isDoubleForfeit) {
                // Double forfeit counts as a loss
                gamesPlayed++;
                losses++;
              }
              differential += m.coach2Differential || 0;
            }
          }

          return { id: sc.id, wins, losses, differential, gamesPlayed };
        });

        // Sort by wins, then differential
        standings.sort((a, b) => {
          if (b.wins !== a.wins) return b.wins - a.wins;
          return b.differential - a.differential;
        });

        // Create lookup map with position
        const standingsMap = new Map<number, { position: number; wins: number; losses: number; differential: number; gamesPlayed: number }>();
        standings.forEach((s, idx) => {
          standingsMap.set(s.id, { position: idx + 1, ...s });
        });

        return standingsMap;
      })()
    : new Map();

  // Get upcoming matches for the selected season (matches with no winner yet and not forfeits)
  const upcomingMatches = selectedSeasonEntry
    ? allMatches
        .filter(
          (m) =>
            m.divisionId === selectedSeasonEntry.divisionId &&
            m.winnerId === null &&
            !m.isForfeit && // Exclude forfeits (including double forfeits)
            (m.coach1SeasonId === selectedSeasonCoachId || m.coach2SeasonId === selectedSeasonCoachId)
        )
        .sort((a, b) => a.week - b.week) // Sort by week ascending (next match first)
        .map((m) => {
          const opponentId = m.coach1SeasonId === selectedSeasonCoachId ? m.coach2SeasonId : m.coach1SeasonId;
          const opponent = allSeasonCoaches.find((sc) => sc.id === opponentId);
          const opponentStats = divisionStandings.get(opponentId);
          return {
            ...m,
            opponentId,
            opponentTeamName: opponent?.teamName || "Unknown",
            opponentLogoUrl: opponent?.teamLogoUrl || null,
            isHome: m.coach1SeasonId === selectedSeasonCoachId,
            opponentPosition: opponentStats?.position || null,
            opponentWins: opponentStats?.wins || 0,
            opponentLosses: opponentStats?.losses || 0,
            opponentDifferential: opponentStats?.differential || 0,
            opponentGamesPlayed: opponentStats?.gamesPlayed || 0,
          };
        })
    : [];

  // Build season options for the selector
  const seasonOptions = coachSeasons.map((sc) => ({
    seasonCoachId: sc.id,
    seasonNumber: sc.division?.season?.seasonNumber || 0,
    seasonName: sc.division?.season?.name || "Unknown",
    divisionName: sc.division?.name || "Unknown",
    isCurrent: sc.division?.season?.isCurrent || false,
  }));

  // Aggregate Pokemon stats for all-time kill leaderboard
  const pokemonStatsMap = new Map<number, {
    pokemonId: number;
    pokemonName: string;
    pokemonDisplayName: string;
    spriteUrl: string | null;
    kills: number;
    deaths: number;
    gamesPlayed: number;
  }>();

  for (const mp of coachMatchPokemon) {
    const existing = pokemonStatsMap.get(mp.pokemonId);
    if (existing) {
      existing.kills += mp.kills || 0;
      existing.deaths += mp.deaths || 0;
      existing.gamesPlayed += 1;
    } else {
      pokemonStatsMap.set(mp.pokemonId, {
        pokemonId: mp.pokemonId,
        pokemonName: mp.pokemon?.name || "Unknown",
        pokemonDisplayName: mp.pokemon?.displayName || mp.pokemon?.name || "Unknown",
        spriteUrl: mp.pokemon?.spriteUrl || null,
        kills: mp.kills || 0,
        deaths: mp.deaths || 0,
        gamesPlayed: 1,
      });
    }
  }

  const allTimeKillLeaders = Array.from(pokemonStatsMap.values())
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 9);

  const revealedItemMap = new Map<string, {
    pokemonId: number;
    pokemonDisplayName: string;
    spriteUrl: string | null;
    item: string;
    reveals: number;
  }>();

  for (const mp of coachMatchPokemon) {
    if (
      !mp.revealedItems?.length ||
      !mp.match?.season ||
      mp.match.season.seasonNumber < 5
    ) continue;
    for (const item of new Set(mp.revealedItems.map((reveal) => reveal.item))) {
      const key = `${mp.pokemonId}:${item.toLowerCase()}`;
      const existing = revealedItemMap.get(key);
      if (existing) {
        existing.reveals += 1;
      } else {
        revealedItemMap.set(key, {
          pokemonId: mp.pokemonId,
          pokemonDisplayName: mp.pokemon?.displayName || mp.pokemon?.name || "Unknown",
          spriteUrl: mp.pokemon?.spriteUrl || null,
          item,
          reveals: 1,
        });
      }
    }
  }

  const revealedItemTendencies = Array.from(revealedItemMap.values())
    .sort((a, b) => b.reveals - a.reveals || a.pokemonDisplayName.localeCompare(b.pokemonDisplayName))
    .slice(0, 9);

  // Aggregate nemesis Pokemon stats (opponent Pokemon that killed the most of this coach's team)
  const nemesisStatsMap = new Map<number, {
    pokemonId: number;
    pokemonName: string;
    pokemonDisplayName: string;
    spriteUrl: string | null;
    kills: number; // kills against this coach
  }>();

  for (const mp of opponentMatchPokemon) {
    const existing = nemesisStatsMap.get(mp.pokemonId);
    if (existing) {
      existing.kills += mp.kills || 0;
    } else {
      nemesisStatsMap.set(mp.pokemonId, {
        pokemonId: mp.pokemonId,
        pokemonName: mp.pokemon?.name || "Unknown",
        pokemonDisplayName: mp.pokemon?.displayName || mp.pokemon?.name || "Unknown",
        spriteUrl: mp.pokemon?.spriteUrl || null,
        kills: mp.kills || 0,
      });
    }
  }

  const nemesisPokemon = Array.from(nemesisStatsMap.values())
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 9);

  const currentElo = coach.eloRating;

  // Calculate coach's top 2 most used types
  const typeCounts = new Map<string, number>();
  for (const mp of coachMatchPokemon) {
    const types = mp.pokemon?.types;
    if (!types) continue;
    for (const type of types) {
      const lowerType = type.toLowerCase();
      typeCounts.set(lowerType, (typeCounts.get(lowerType) || 0) + 1);
    }
  }
  const topTypes = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([type]) => type);

  // Calculate all-time record
  let totalWins = 0;
  let totalLosses = 0;
  let totalDiff = 0;

  for (const match of coachMatches) {
    const isCoach1 = seasonCoachIds.includes(match.coach1SeasonId);
    const mySeasonCoachId = isCoach1 ? match.coach1SeasonId : match.coach2SeasonId;

    if (match.winnerId === mySeasonCoachId) {
      totalWins++;
    } else if (match.winnerId) {
      totalLosses++;
    }

    totalDiff += isCoach1
      ? match.coach1Differential || 0
      : match.coach2Differential || 0;
  }

  const winRate = totalWins + totalLosses > 0
    ? Math.round((totalWins / (totalWins + totalLosses)) * 100)
    : 0;

  // Build price map for tera captain cost breakdown
  const priceMap = new Map(
    pokemonPrices.map((pp) => [pp.pokemonId, { basePrice: pp.price, teraCaptainCost: pp.teraCaptainCost }])
  );

  // Calculate time-synced remaining budget
  const timeSyncedRemainingBudget = selectedSeasonEntry ? (() => {
    const effectiveWeek = selectedSeasonEntry.effectiveWeek || 1;
    const draftBudget = selectedSeasonEntry.division?.season?.draftBudget || 0;

    // Get filtered roster (already time-synced with TC status)
    const filteredRoster = (selectedSeasonEntry.rosters || [])
      .filter((r: any) => !r.acquiredWeek || r.acquiredWeek <= effectiveWeek);

    // Calculate total spent from time-synced roster
    let totalSpent = 0;
    for (const r of filteredRoster) {
      const priceInfo = priceMap.get(r.pokemonId);
      const basePrice = priceInfo?.basePrice ?? r.price;
      const tcCost = r.isTeraCaptain ? (priceInfo?.teraCaptainCost ?? 0) : 0;
      totalSpent += basePrice + tcCost;
    }

    // Add dropped Pokemon prices (including TC cost if they were a TC)
    const droppedPokemon = selectedSeasonEntry.droppedPokemonDetails || [];
    for (const p of droppedPokemon) {
      const priceInfo = priceMap.get((p as any).id);
      const basePrice = priceInfo?.basePrice ?? 0;
      const tcCost = (p as any).isTeraCaptain ? (priceInfo?.teraCaptainCost ?? 0) : 0;
      totalSpent += basePrice + tcCost;
    }

    return draftBudget - totalSpent;
  })() : 0;

  const liveMilestoneTitles = coachMilestones.filter((milestone) => milestone.isLiveTitle);
  const historicalMilestones = coachMilestones.filter((milestone) => !milestone.isLiveTitle);
  const milestonesBySeason = Array.from(
    historicalMilestones.reduce((groups, milestone) => {
      const seasonMilestones = groups.get(milestone.seasonNumber) ?? [];
      seasonMilestones.push(milestone);
      groups.set(milestone.seasonNumber, seasonMilestones);
      return groups;
    }, new Map<number, typeof historicalMilestones>()),
  )
    .sort(([leftSeason], [rightSeason]) => rightSeason - leftSeason)
    .map(([seasonNumber, seasonMilestones]) => ({
      seasonNumber,
      milestones: seasonMilestones.sort((left, right) => {
        const categoryOrder = { coach: 0, season: 1, pokemon: 2 };
        return categoryOrder[left.category] - categoryOrder[right.category]
          || left.title.localeCompare(right.title);
      }),
    }));

  return (
    <div className="readable-content space-y-6">
      {activePoll && <PollCard initialPoll={activePoll} />}

      {/* Mobile Championship & Special Badges */}
      {(championships.length > 0 || hasMoneybagsBadge || hasTwitchBadge) && (
        <div className="md:hidden relative p-[2px] rounded-xl bg-gradient-to-br from-[#c9a855] via-[#8b7355] to-[#c9a855]">
          <div
            className="relative rounded-[10px] px-5 py-4 overflow-hidden"
            style={{
              background: `
                linear-gradient(180deg,
                  rgba(255,215,0,0.08) 0%,
                  transparent 40%,
                  rgba(255,215,0,0.04) 100%
                ),
                repeating-linear-gradient(
                  -55deg,
                  rgba(255,210,130,0.05) 0px,
                  rgba(255,210,130,0.05) 3px,
                  transparent 3px,
                  transparent 16px
                ),
                linear-gradient(180deg, #1a1814 0%, #12100c 100%)
              `
            }}
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#ffd700]/40 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#3d3020]/80 to-transparent" />
            <div className="flex items-center justify-center gap-6">
              {championships.map((champ, i) => (
                <div key={i} className="flex flex-col items-center">
                  <div className="relative">
                    <div
                      className="absolute -inset-3"
                      style={{
                        background: 'radial-gradient(circle, rgba(255,175,55,0.85) 0%, rgba(255,200,100,0.5) 35%, transparent 65%)',
                        filter: 'blur(14px)',
                        transform: 'translateZ(0)'
                      }}
                    />
                    <Image
                      src={`/images/divisions/${champ.divisionName.toLowerCase()}-badge.png`}
                      alt={`${champ.divisionName} Champion`}
                      width={56}
                      height={56}
                      className="relative z-10"
                    />
                  </div>
                  <p className="text-[10px] font-semibold text-[#d4b869] mt-1.5 tracking-wide drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">
                    {champ.seasons.length > 1
                      ? `S${champ.seasons.join(" & S")} ${champ.divisionName}`
                      : `S${champ.seasons[0]} ${champ.divisionName}`
                    }
                  </p>
                </div>
              ))}
              {hasTwitchBadge && (
                <div className="flex flex-col items-center">
                  <div className="relative">
                    <div
                      className="absolute -inset-3"
                      style={{
                        background: 'radial-gradient(circle, rgba(145,70,255,0.85) 0%, rgba(145,70,255,0.5) 35%, transparent 65%)',
                        filter: 'blur(14px)',
                        transform: 'translateZ(0)'
                      }}
                    />
                    <Image
                      src="/images/divisions/twitch-badge4.png"
                      alt="Twitch MVP"
                      width={56}
                      height={56}
                      className="relative z-10"
                    />
                  </div>
                  <p className="text-[10px] font-semibold text-purple-400 mt-1.5 tracking-wide drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">
                    Twitch MVP
                  </p>
                </div>
              )}
              {hasMoneybagsBadge && (
                <div className="flex flex-col items-center">
                  <div className="relative">
                    <div
                      className="absolute -inset-3"
                      style={{
                        background: 'radial-gradient(circle, rgba(255,175,55,0.85) 0%, rgba(255,200,100,0.5) 35%, transparent 65%)',
                        filter: 'blur(14px)',
                        transform: 'translateZ(0)'
                      }}
                    />
                    <Image
                      src="/images/divisions/whale-badge3.png"
                      alt="PBO Whale"
                      width={56}
                      height={56}
                      className="relative z-10"
                    />
                  </div>
                  <p className="text-[10px] font-semibold text-[#d4b869] mt-1.5 tracking-wide drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">
                    PBO Whale
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <ShareButton
          title={`${mostRecentSeasonEntry?.teamName ?? coach.name} — PBO`}
          text={`View ${coach.name}'s PBO teams, record, Elo, and season history.`}
          path={`/coaches/${coachId}`}
          compact
        />
      </div>

      {/* Profile Header */}
      <div className="poke-card p-4 sm:p-6" style={{ overflow: 'visible' }}>
        <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
          {/* Mobile: Logo + ELO + Info stacked | Desktop: Logo, Info, ELO in row */}

          {/* Top row on mobile: Logo + ELO side by side */}
          <div className="flex items-start gap-4 md:contents">
            {/* Team Logo / Avatar */}
            <div className="relative shrink-0">
              {mostRecentSeasonEntry?.teamLogoUrl ? (
                <LogoFrame
                  slug={profileLogoFrameSlug}
                  colors={profileLogoFrameColors}
                  className="w-24 h-24 sm:w-20 sm:h-20 md:w-24 md:h-24"
                >
                  <div className="w-full h-full rounded-lg bg-[var(--background-secondary)] flex items-center justify-center border-2 border-[var(--background-tertiary)] overflow-hidden">
                    <Image
                      src={mostRecentSeasonEntry.teamLogoUrl}
                      alt={mostRecentSeasonEntry.teamName}
                      width={96}
                      height={96}
                      className="w-full h-full object-contain"
                    />
                  </div>
                </LogoFrame>
              ) : (
                <LogoFrame
                  slug={profileLogoFrameSlug}
                  colors={profileLogoFrameColors}
                  className="w-24 h-24 sm:w-20 sm:h-20 md:w-24 md:h-24"
                >
                  <div className="w-full h-full rounded-lg bg-gradient-to-br from-[var(--primary)] to-[var(--gradient-end)] flex items-center justify-center border-2 border-[var(--background-tertiary)]">
                    <span className="text-white text-3xl sm:text-2xl md:text-3xl font-black">
                      {mostRecentSeasonEntry?.teamAbbreviation || mostRecentSeasonEntry?.teamName?.substring(0, 2).toUpperCase() || coach.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                </LogoFrame>
              )}
              {/* Rank indicator for top ELO */}
              {currentElo >= 1100 && (
                <div className="absolute -top-2 -right-2 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-[var(--accent)] flex items-center justify-center border-2 border-[var(--background)]">
                  <svg className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-black" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Mobile: Info next to logo */}
            <div className="md:hidden flex-1 min-w-0">
              {/* Team name & coach + type badges */}
              {mostRecentSeasonEntry ? (
                <>
                  <h1 className="text-base sm:text-lg font-bold text-white truncate leading-tight">
                    {mostRecentSeasonEntry.teamName}
                  </h1>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-xs sm:text-sm text-[var(--foreground-muted)]">
                      {coach.name}
                    </p>
                    <CoachYouTubeLink coachId={coachId} />
                    {topTypes.length > 0 && topTypes.map((type) => (
                      <span
                        key={type}
                        className={`px-1.5 py-0.5 text-[8px] sm:text-[9px] rounded font-bold uppercase translate-y-px ${getTypeColor(type)}`}
                      >
                        {type}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <h1 className="text-base sm:text-lg font-bold text-white">
                    {coach.name}
                  </h1>
                  <CoachYouTubeLink coachId={coachId} />
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    {topTypes.length > 0 && topTypes.map((type) => (
                      <span
                        key={type}
                        className={`px-1.5 py-0.5 text-[8px] sm:text-[9px] rounded font-bold uppercase ${getTypeColor(type)}`}
                      >
                        {type}
                      </span>
                    ))}
                  </div>
                </>
              )}
              {/* ELO inline */}
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`text-xl sm:text-2xl font-bold tabular-nums ${
                  currentElo >= 1100
                    ? "text-[var(--success)]"
                    : currentElo <= 900
                    ? "text-[var(--error)]"
                    : "text-[var(--accent)]"
                }`}>
                  {Math.round(currentElo)}
                </span>
                <span className="text-[10px] text-[var(--foreground-muted)] uppercase">ELO</span>
                <Link
                  href={`/elo-tracker?coach=${coachId}`}
                  className="inline-flex items-center gap-0.5 text-[10px] text-[var(--primary)] hover:underline"
                >
                  History
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
              {/* Seasons count + PBOcoin */}
              <div className="flex items-center gap-2 flex-wrap mt-1.5">
                <span className="text-[10px] text-[var(--foreground-muted)]">
                  {coachSeasons.length} season{coachSeasons.length !== 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-1">
                  <svg className="w-3 h-3 text-[var(--accent)]" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.3"/>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
                    <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="bold" fill="currentColor">P</text>
                  </svg>
                  <span className="text-[10px] font-bold text-[var(--accent)]">{coach.pboCoin}</span>
                </div>
                <CoachStoreButton coachId={coachId} />
              </div>
            </div>
          </div>

          {/* Desktop: Info section */}
          <div className="hidden md:block min-w-0">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 mb-2 text-sm">
              <Link
                href="/coaches"
                className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors"
              >
                Coaches
              </Link>
              <span className="text-[var(--foreground-subtle)]">/</span>
            </div>
            {mostRecentSeasonEntry ? (
              <>
                <h1 className="text-xl md:text-2xl font-bold text-white truncate">
                  {mostRecentSeasonEntry.teamName}
                </h1>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-base text-[var(--foreground-muted)]">
                    {coach.name}
                  </p>
                  <CoachYouTubeLink coachId={coachId} />
                  {topTypes.length > 0 && (
                    <div className="flex gap-1">
                      {topTypes.map((type) => (
                        <span
                          key={type}
                          className={`px-2 py-0.5 text-[10px] rounded font-bold uppercase ${getTypeColor(type)}`}
                        >
                          {type}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <h1 className="text-xl md:text-2xl font-bold text-white">
                  {coach.name}
                </h1>
                <CoachYouTubeLink coachId={coachId} />
                {topTypes.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {topTypes.map((type) => (
                      <span
                        key={type}
                        className={`px-2 py-0.5 text-[10px] rounded font-bold uppercase ${getTypeColor(type)}`}
                      >
                        {type}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
            <p className="text-xs text-[var(--foreground-muted)] mt-2">
              {coachSeasons.length} season{coachSeasons.length !== 1 ? 's' : ''} played
              {currentSeasonEntry && (
                <span className="ml-3 inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold rounded bg-[var(--success)]/20 text-[var(--success)] border border-[var(--success)]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
                  {currentSeasonEntry.division?.name}
                  {currentSeasonRecord && (
                    <span className="ml-1">{currentSeasonRecord.wins}-{currentSeasonRecord.losses}</span>
                  )}
                </span>
              )}
            </p>
          </div>

          {/* Desktop: Championship & Special Badges */}
          {(championships.length > 0 || hasMoneybagsBadge || hasTwitchBadge) && (
            <div className="hidden md:flex items-center gap-6 ml-6 pl-6 border-l border-[var(--background-tertiary)]">
              {championships.map((champ, i) => (
                <div key={i} className="relative group cursor-pointer flex flex-col items-center">
                  <Image
                    src={`/images/divisions/${champ.divisionName.toLowerCase()}-badge.png`}
                    alt={`${champ.divisionName} Champion`}
                    width={88}
                    height={88}
                    className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] group-hover:drop-shadow-[0_4px_20px_rgba(255,215,0,0.5)] group-hover:scale-110 transition-all duration-200"
                  />
                  <p className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wider mt-1">
                    Champion
                  </p>
                  {/* Tooltip */}
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-full pt-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 pointer-events-none" style={{ zIndex: 9999 }}>
                    <div
                      className="relative px-6 py-4 rounded-lg border border-[#5a4a30] group-hover:border-[#8b7355] group-hover:shadow-[0_0_40px_rgba(255,200,100,0.2)] transition-all duration-300 overflow-hidden"
                      style={{
                        background: `
                          linear-gradient(135deg,
                            rgba(255,215,0,0.04) 0%,
                            transparent 50%,
                            rgba(255,215,0,0.05) 100%
                          ),
                          repeating-linear-gradient(
                            -55deg,
                            rgba(255,210,130,0.05) 0px,
                            rgba(255,210,130,0.05) 3px,
                            transparent 3px,
                            transparent 16px
                          ),
                          repeating-linear-gradient(
                            -55deg,
                            rgba(180,150,80,0.025) 8px,
                            rgba(180,150,80,0.025) 10px,
                            transparent 10px,
                            transparent 16px
                          ),
                          linear-gradient(180deg, #1f1a14 0%, #12100c 100%)
                        `
                      }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-[#ffd700]/5 via-transparent to-[#ffd700]/3 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c9a855] to-transparent opacity-40" />
                      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#3d3020] to-transparent" />
                      <p className="relative text-sm font-semibold text-[#e8d5a3] whitespace-nowrap text-center tracking-wide drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">
                        {champ.seasons.length > 1
                          ? `S${champ.seasons.join(" & S")} ${champ.divisionName} Champion`
                          : `S${champ.seasons[0]} ${champ.divisionName} Champion`
                        }
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {hasTwitchBadge && (
                <div className="relative group cursor-pointer flex flex-col items-center">
                  <Image
                    src="/images/divisions/twitch-badge4.png"
                    alt="Twitch MVP"
                    width={88}
                    height={88}
                    className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] group-hover:drop-shadow-[0_4px_20px_rgba(145,70,255,0.5)] group-hover:scale-110 transition-all duration-200"
                  />
                  <p className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wider mt-1">
                    Twitch MVP
                  </p>
                  {/* Tooltip */}
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-full pt-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 pointer-events-none" style={{ zIndex: 9999 }}>
                    <div className="px-6 py-4 rounded-lg border border-purple-800 bg-[#1a0f2e] group-hover:border-purple-600 group-hover:shadow-[0_0_40px_rgba(145,70,255,0.2)] transition-all duration-300">
                      <p className="text-sm font-semibold text-purple-300 whitespace-nowrap text-center tracking-wide">
                        Active Twitch Viewer
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {hasMoneybagsBadge && (
                <div className="relative group cursor-pointer flex flex-col items-center">
                  <Image
                    src="/images/divisions/whale-badge3.png"
                    alt="PBO Whale"
                    width={88}
                    height={88}
                    className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] group-hover:drop-shadow-[0_4px_20px_rgba(255,215,0,0.5)] group-hover:scale-110 transition-all duration-200"
                  />
                  <p className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wider mt-1">
                    PBO Whale
                  </p>
                  {/* Tooltip */}
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-full pt-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 pointer-events-none" style={{ zIndex: 9999 }}>
                    <div
                      className="relative px-6 py-4 rounded-lg border border-[#5a4a30] group-hover:border-[#8b7355] group-hover:shadow-[0_0_40px_rgba(255,200,100,0.2)] transition-all duration-300 overflow-hidden"
                      style={{
                        background: `
                          linear-gradient(135deg,
                            rgba(255,215,0,0.04) 0%,
                            transparent 50%,
                            rgba(255,215,0,0.05) 100%
                          ),
                          repeating-linear-gradient(
                            -55deg,
                            rgba(255,210,130,0.05) 0px,
                            rgba(255,210,130,0.05) 3px,
                            transparent 3px,
                            transparent 16px
                          ),
                          repeating-linear-gradient(
                            -55deg,
                            rgba(180,150,80,0.025) 8px,
                            rgba(180,150,80,0.025) 10px,
                            transparent 10px,
                            transparent 16px
                          ),
                          linear-gradient(180deg, #1f1a14 0%, #12100c 100%)
                        `
                      }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-[#ffd700]/5 via-transparent to-[#ffd700]/3 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c9a855] to-transparent opacity-40" />
                      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#3d3020] to-transparent" />
                      <p className="relative text-sm font-semibold text-[#e8d5a3] whitespace-nowrap text-center tracking-wide drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">
                        The PBO Whale
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Spacer to push ELO to right */}
          <div className="hidden md:block flex-1" />

          {/* Desktop: ELO Display */}
          <div className="hidden md:block text-right shrink-0">
            <p className={`text-4xl md:text-5xl font-bold tabular-nums ${
              currentElo >= 1100
                ? "text-[var(--success)]"
                : currentElo <= 900
                ? "text-[var(--error)]"
                : "text-[var(--accent)]"
            }`}>
              {Math.round(currentElo)}
            </p>
            <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wide mt-1">
              ELO Rating
            </p>
            <Link
              href={`/elo-tracker?coach=${coachId}`}
              className="inline-flex items-center gap-1 text-xs text-[var(--primary)] hover:underline mt-1"
            >
              View history
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <div className="flex items-center justify-end gap-1.5 mt-2">
              <MobileTooltip
                position="right"
                trigger={
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--accent)]/20 border border-[var(--accent)]/30 cursor-pointer">
                    <svg className="w-4 h-4 text-[var(--accent)]" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.3"/>
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
                      <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="bold" fill="currentColor">P</text>
                    </svg>
                    <span className="text-sm font-bold text-[var(--accent)]">{coach.pboCoin}</span>
                  </div>
                }
              >
                <div className="px-4 py-3 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--accent)]/30 shadow-lg whitespace-nowrap min-w-[240px] sm:min-w-[280px]">
                  <p className="text-xs font-bold text-[var(--accent)] uppercase tracking-wide mb-2">PBOcoin Breakdown</p>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[var(--foreground-muted)]">Starting balance</span>
                      <span className="text-[var(--success)] font-mono">+{coinBreakdown.starting}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--foreground-muted)]">Match rewards ({coinBreakdown.matchesPlayed} matches)</span>
                      <span className="text-[var(--success)] font-mono">+{coinBreakdown.matchCoins}</span>
                    </div>
                    {coinBreakdown.bettingProfit !== 0 && (
                      <div className="flex justify-between">
                        <span className="text-[var(--foreground-muted)]">Betting {coinBreakdown.bettingProfit >= 0 ? "profit" : "losses"}</span>
                        <span className={`font-mono ${coinBreakdown.bettingProfit >= 0 ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
                          {coinBreakdown.bettingProfit >= 0 ? "+" : ""}{coinBreakdown.bettingProfit}
                        </span>
                      </div>
                    )}
                    {coinBreakdown.pickEmRewards > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[var(--foreground-muted)]">Pick-em rewards</span>
                        <span className="text-[var(--success)] font-mono">+{coinBreakdown.pickEmRewards}</span>
                      </div>
                    )}
                    {coinBreakdown.fantasyRewards > 0 && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-[var(--foreground-muted)]">Fantasy rewards</span>
                          <span className="text-[var(--success)] font-mono">+{coinBreakdown.fantasyRewards}</span>
                        </div>
                        {coinBreakdown.fantasyRewardsList.length > 0 && (
                          <div className="pl-3 space-y-0.5">
                            {coinBreakdown.fantasyRewardsList.map((reward, idx) => (
                              <div key={idx} className="flex justify-between text-[10px]">
                                <span className="text-[var(--foreground-muted)]">{reward.reason}</span>
                                <span className="text-[var(--success)] font-mono">+{reward.amount}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    {coinBreakdown.triviaRewards > 0 && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-[var(--foreground-muted)]">Trivia rewards</span>
                          <span className="text-[var(--success)] font-mono">+{coinBreakdown.triviaRewards}</span>
                        </div>
                        {coinBreakdown.triviaRewardsList.length > 0 && (
                          <div className="pl-3 space-y-0.5">
                            {coinBreakdown.triviaRewardsList.map((reward, idx) => (
                              <div key={idx} className="flex justify-between text-[10px]">
                                <span className="text-[var(--foreground-muted)]">{reward.reason}</span>
                                <span className="text-[var(--success)] font-mono">+{reward.amount}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    {(coinBreakdown.storePurchases !== 0 || coinBreakdown.bonusPurchasesList.length > 0) && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-[var(--foreground-muted)]">Store purchases</span>
                          <span className={`font-mono ${coinBreakdown.storePurchases > 0 ? "text-[var(--error)]" : "text-[var(--foreground-muted)]"}`}>
                            {coinBreakdown.storePurchases > 0 ? `-${coinBreakdown.storePurchases}` : "0"}
                          </span>
                        </div>
                        {coinBreakdown.storePurchasesList.length > 0 && (
                          <div className="pl-3 space-y-0.5">
                            {coinBreakdown.storePurchasesList.map((purchase, idx) => (
                              <div key={idx} className="flex justify-between text-[10px]">
                                <span className="text-[var(--foreground-muted)]">{purchase.name}</span>
                                <span className="text-[var(--foreground-muted)] font-mono">-{purchase.price}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {coinBreakdown.bonusPurchasesList.length > 0 && (
                          <div className="pl-3 space-y-0.5">
                            {coinBreakdown.bonusPurchasesList.map((purchase, idx) => (
                              <div key={idx} className="flex justify-between text-[10px]">
                                <span className="text-[var(--foreground-muted)]">{purchase.name}</span>
                                <span className="text-purple-400 font-mono italic">{purchase.reason}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    <div className="border-t border-[var(--background-tertiary)] pt-1.5 mt-1.5 flex justify-between font-bold">
                      <span className="text-[var(--foreground)]">Total</span>
                      <span className="text-[var(--accent)] font-mono">{coach.pboCoin}</span>
                    </div>
                  </div>
                </div>
              </MobileTooltip>
              <CoachStoreButton coachId={coachId} />
            </div>
          </div>
        </div>
        {canEditProjectMew && (
          <div className="mt-4">
            <ProjectMewConfirmation
              coachId={coachId}
              initialConfirmed={coach.projectMewConfirmed ?? false}
            />
          </div>
        )}
      </div>

      {/* Stats Cards - Compact row on mobile, grid on desktop */}
      <div>
        <div className="poke-card p-3 flex justify-between sm:hidden">
          <div className="text-center">
            <p className="text-lg font-bold tabular-nums text-[var(--success)]">{totalWins}</p>
            <p className="text-[9px] text-[var(--foreground-muted)] uppercase">Wins</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold tabular-nums text-[var(--error)]">{totalLosses}</p>
            <p className="text-[9px] text-[var(--foreground-muted)] uppercase">Losses</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold tabular-nums">{winRate}%</p>
            <p className="text-[9px] text-[var(--foreground-muted)] uppercase">Win%</p>
          </div>
          <div className="text-center">
            <p className={`text-lg font-bold tabular-nums ${
              totalDiff > 0 ? "text-[var(--success)]" : totalDiff < 0 ? "text-[var(--error)]" : ""
            }`}>
              {totalDiff > 0 ? "+" : ""}{totalDiff}
            </p>
            <p className="text-[9px] text-[var(--foreground-muted)] uppercase">Diff</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold tabular-nums text-[var(--primary)]">{coachSeasons.length}</p>
            <p className="text-[9px] text-[var(--foreground-muted)] uppercase">Seasons</p>
          </div>
        </div>
        <div className="hidden sm:grid grid-cols-5 gap-3">
          <div className="poke-card p-4 text-center">
            <p className="text-2xl font-bold tabular-nums text-[var(--success)]">{totalWins}</p>
            <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wide mt-1">Wins</p>
          </div>
          <div className="poke-card p-4 text-center">
            <p className="text-2xl font-bold tabular-nums text-[var(--error)]">{totalLosses}</p>
            <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wide mt-1">Losses</p>
          </div>
          <div className="poke-card p-4 text-center">
            <p className="text-2xl font-bold tabular-nums">{winRate}%</p>
            <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wide mt-1">Win Rate</p>
          </div>
          <div className="poke-card p-4 text-center">
            <p className={`text-2xl font-bold tabular-nums ${
              totalDiff > 0 ? "text-[var(--success)]" : totalDiff < 0 ? "text-[var(--error)]" : ""
            }`}>
              {totalDiff > 0 ? "+" : ""}{totalDiff}
            </p>
            <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wide mt-1">Differential</p>
          </div>
          <div className="poke-card p-4 text-center">
            <p className="text-2xl font-bold tabular-nums text-[var(--primary)]">{coachSeasons.length}</p>
            <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wide mt-1">Seasons</p>
          </div>
        </div>
      </div>

      {/* Season Roster */}
      {selectedSeasonEntry && (
        <MoveDataProvider>
        <div className="poke-card p-0 overflow-hidden">
          <div className={`p-4 sm:p-6 border-b-2 border-[var(--background-tertiary)] ${
            selectedSeasonEntry.division?.season?.isCurrent ? "bg-[var(--success)]/5" : "bg-[var(--primary)]/5"
          }`}>
            <div className="flex flex-col gap-3 sm:gap-4">
              {/* Season Selector and Draft Analyzer link */}
              <div className="flex items-center justify-between gap-3">
                {seasonOptions.length > 1 ? (
                  <SeasonSelector
                    seasons={seasonOptions}
                    selectedSeasonCoachId={selectedSeasonCoachId}
                    coachId={coachId}
                  />
                ) : (
                  <div />
                )}
                <Link
                  href={`/draft-planner?coach=${coachId}&season=${selectedSeasonEntry.division?.season?.id}`}
                  className="flex items-center gap-1.5 text-xs text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors font-bold shrink-0"
                >
                  Free Agency
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="section-title !mb-0">
                  <div className={`section-title-icon ${
                    selectedSeasonEntry.division?.season?.isCurrent
                      ? "!bg-[var(--success)]"
                      : "!bg-[var(--primary)]"
                  }`} style={{ boxShadow: selectedSeasonEntry.division?.season?.isCurrent ? '0 4px 0 #166534' : '0 4px 0 #7c3aed' }}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate">{selectedSeasonEntry.teamName}</h3>
                    <p className="text-[10px] sm:text-xs text-[var(--foreground-muted)] font-normal">
                      {selectedSeasonEntry.division?.season?.name} | {selectedSeasonEntry.division?.name}
                      {selectedSeasonEntry.division?.season?.isCurrent && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[var(--success)]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
                          Current
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <MoveDataToggleButton />
                  <CopyTeamButton
                    pokemonNames={[
                      ...sortRosterByDisplayPrice(
                        (selectedSeasonEntry.rosters || [])
                          .filter((r) => !r.acquiredWeek || r.acquiredWeek <= selectedSeasonEntry.effectiveWeek),
                        priceMap,
                      )
                        .map((r) => r.pokemon?.displayName || r.pokemon?.name),
                      ...sortRosterByDisplayPrice(selectedSeasonEntry.droppedPokemonDetails || [], priceMap)
                        .map((p) => p.displayName || p.name),
                    ].filter(Boolean)}
                  />
                  <div className="text-right px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)]">
                    <p className="text-lg sm:text-xl font-bold text-[var(--accent)]">{timeSyncedRemainingBudget}</p>
                    <p className="text-[9px] sm:text-[10px] text-[var(--foreground-muted)]">pts remaining</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="p-4 sm:p-6">
            {selectedSeasonEntry.rosters && selectedSeasonEntry.rosters.length > 0 ? (
              (() => {
                // Pre-compute filtered Pokemon list
                const filteredRoster = sortRosterByDisplayPrice(
                  selectedSeasonEntry.rosters
                    .filter((r) => !r.acquiredWeek || r.acquiredWeek <= selectedSeasonEntry.effectiveWeek),
                  priceMap,
                );
                const droppedPokemon = sortRosterByDisplayPrice(selectedSeasonEntry.droppedPokemonDetails || [], priceMap);
                const allPokemonCount = filteredRoster.length + droppedPokemon.length;

                // Speed tiers data (used in both layouts)
                const speedTiersData = [
                  ...filteredRoster.map((r: any) => ({
                    id: r.id,
                    spriteUrl: r.pokemon?.spriteUrl,
                    name: r.pokemon?.displayName || r.pokemon?.name,
                    speed: r.pokemon?.speed || 0,
                    isPending: false,
                  })),
                  ...droppedPokemon.map((p: any) => ({
                    id: `dropped-${p.id}`,
                    spriteUrl: p.spriteUrl,
                    name: p.displayName || p.name,
                    speed: p.speed || 0,
                    isPending: true,
                  })),
                ].sort((a, b) => b.speed - a.speed);

                // Pokemon card renderer
                const renderPokemonCard = (r: any, isDropped: boolean = false, compact: boolean = false) => {
                  const pokemon = isDropped ? r : r.pokemon;
                  const specialMoves = getSpecialMoves(pokemon?.moves);
                  const basePrice = priceMap.get(pokemon?.id)?.basePrice ?? (isDropped ? 0 : r.price);

                  return (
                    <Link
                      key={isDropped ? `dropped-${r.id}` : r.id}
                      href={`/pokemon/${pokemon?.id}`}
                      className={`relative rounded-lg bg-[var(--background-secondary)] border-2 transition-all group ${
                        compact ? "p-1.5 overflow-hidden" : "p-2 sm:p-4"
                      } ${
                        r.isTeraCaptain
                          ? "border-[var(--accent)]"
                          : isDropped
                          ? "border-[var(--error)]/30 hover:border-[var(--primary)]/50"
                          : "border-[var(--background-tertiary)] hover:border-[var(--primary)]/50"
                      }`}
                    >
                      {/* Pending Drop Badge - only show for future drops */}
                      {isDropped && (
                        <div className={`absolute top-1 left-1 ${compact ? "" : "sm:top-2 sm:left-2"}`}>
                          <span className={`text-[8px] ${compact ? "" : "sm:text-[9px]"} px-1 ${compact ? "" : "sm:px-1.5"} py-0.5 rounded font-bold bg-[var(--error)]/20 text-[var(--error)]`}>
                            {compact ? "Drop" : "Pending Drop"}
                          </span>
                        </div>
                      )}
                      {/* Move Data Icons - Desktop: vertical on left edge */}
                      {!compact && (
                        <div className={`absolute left-1 sm:left-1.5 flex flex-col gap-0.5 sm:gap-1 ${isDropped ? "top-6 sm:top-8" : "top-1 sm:top-1.5"}`}>
                          <MoveIcons
                            removal={specialMoves.removal}
                            setters={specialMoves.setters}
                            pivots={specialMoves.pivots}
                            utility={specialMoves.utility}
                            support={specialMoves.support}
                            priority={specialMoves.priority}
                          />
                        </div>
                      )}
                      {/* Move Data Icons - Compact: vertical dots on left edge, tap to reveal */}
                      {compact && (
                        <div className={`absolute left-1 ${isDropped ? "top-5" : "top-1"}`}>
                          <MoveIcons
                            removal={specialMoves.removal}
                            setters={specialMoves.setters}
                            pivots={specialMoves.pivots}
                            utility={specialMoves.utility}
                            support={specialMoves.support}
                            priority={specialMoves.priority}
                            compact={true}
                          />
                        </div>
                      )}
                      {/* Tera Captain Badge */}
                      {r.isTeraCaptain && (
                        <div className={`absolute ${compact ? "-top-1 -right-1 w-4 h-4" : "-top-1.5 -right-1.5 sm:-top-2 sm:-right-2 w-5 h-5 sm:w-6 sm:h-6"} rounded-full bg-[var(--accent)] flex items-center justify-center`} title="Tera Captain">
                          <svg className={compact ? "w-2.5 h-2.5" : "w-3 h-3 sm:w-3.5 sm:h-3.5"} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2L2 12l10 10 10-10L12 2z" />
                          </svg>
                        </div>
                      )}
                      <div className="flex flex-col items-center justify-center text-center h-full">
                        {pokemon?.spriteUrl ? (
                          <div className={`${compact ? "w-10 h-10 mb-1" : "w-14 h-14 sm:w-20 sm:h-20 mb-1.5 sm:mb-3"} shrink-0 overflow-hidden`}>
                            <img
                              src={pokemon.spriteUrl}
                              alt={pokemon.displayName || pokemon.name}
                              loading="lazy"
                              decoding="async"
                              className="w-full h-full object-contain transition-none sm:transition-transform sm:group-hover:scale-110"
                            />
                          </div>
                        ) : (
                          <div className={`${compact ? "w-10 h-10 mb-1" : "w-14 h-14 sm:w-20 sm:h-20 mb-1.5 sm:mb-3"} rounded-lg bg-[var(--background-tertiary)] flex items-center justify-center`}>
                            <span className={compact ? "text-sm" : "text-xl sm:text-2xl"}>?</span>
                          </div>
                        )}
                        <p className={`font-bold truncate w-full leading-tight group-hover:text-[var(--primary)] transition-colors ${compact ? "text-[10px]" : "text-xs sm:text-sm"}`}>
                          {pokemon?.displayName || pokemon?.name}
                        </p>
                        {/* Type Badges */}
                        {pokemon?.types && pokemon.types.length > 0 && (
                          <div className={`flex flex-wrap justify-center ${compact ? "gap-0.5 mt-0.5" : "gap-0.5 sm:gap-1 mt-1 sm:mt-2"}`}>
                            {pokemon.types.map((type: string) => (
                              <span
                                key={type}
                                className={`rounded font-bold uppercase ${getTypeColor(type)} ${compact ? "px-1 py-0 text-[6px]" : "px-1.5 sm:px-2 py-0.5 text-[8px] sm:text-[9px]"}`}
                              >
                                {type}
                              </span>
                            ))}
                          </div>
                        )}
                        {/* Price */}
                        <p className={`text-[var(--accent)] font-bold ${compact ? "text-[8px] mt-0.5" : "text-[10px] sm:text-xs mt-1 sm:mt-2"}`}>
                          {r.isTeraCaptain && pokemon?.id ? (
                            <>{priceMap.get(pokemon.id)?.basePrice ?? (isDropped ? 0 : r.price)} + {priceMap.get(pokemon.id)?.teraCaptainCost ?? 0} pts</>
                          ) : (
                            <>{basePrice} pts</>
                          )}
                        </p>
                      </div>
                    </Link>
                  );
                };

                // Speed tiers component
                const renderSpeedTiers = (compact: boolean = false) => (
                  <div className={`rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] ${compact ? "p-1.5 w-12" : "p-1.5 sm:p-3 h-fit w-14 sm:w-auto"}`}>
                    <h4 className={`font-pixel text-center text-[var(--accent)] ${compact ? "text-[7px] mb-1" : "text-[8px] sm:text-[10px] mb-1.5 sm:mb-3"}`}>
                      <span className={compact ? "" : "hidden sm:inline"}>Speed{compact ? "" : " Tiers"}</span>
                      <span className={compact ? "hidden" : "sm:hidden"}>SPD</span>
                    </h4>
                    <div className="space-y-0">
                      {speedTiersData.map((pkmn: any) => (
                        <div
                          key={pkmn.id}
                          className={`flex items-center justify-center rounded hover:bg-[var(--background-tertiary)] transition-colors ${
                            compact ? "gap-0.5 py-0.5 px-0.5" : "gap-0.5 sm:gap-2 py-0.5 sm:py-1 px-0.5 sm:px-2"
                          } ${pkmn.isPending ? "opacity-75" : ""}`}
                        >
                          <div className={compact ? "w-4 h-4" : "w-5 h-5 sm:w-8 sm:h-8"} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {pkmn.spriteUrl ? (
                              <img
                                src={pkmn.spriteUrl}
                                alt={pkmn.name}
                                className={compact ? "w-4 h-4 object-contain" : "w-5 h-5 sm:w-8 sm:h-8 object-contain"}
                              />
                            ) : (
                              <span className={`text-[var(--foreground-muted)] ${compact ? "text-[6px]" : "text-[8px] sm:text-xs"}`}>?</span>
                            )}
                          </div>
                          <span className={`font-bold tabular-nums text-right ${compact ? "text-[8px] w-4" : "text-[10px] sm:text-sm w-5 sm:w-8"}`}>
                            {pkmn.speed || "?"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );

                return (
                  <>
                    {/* Mobile Layout: First 4 + Speed Tiers, then rest in 3-col */}
                    <div className="sm:hidden space-y-2">
                      {/* Top row: First 4 Pokemon (2x2) + Speed Tiers */}
                      <div className="flex gap-2">
                        <div className="grid grid-cols-2 gap-1.5 flex-1">
                          {filteredRoster.slice(0, 4).map((r: any) => renderPokemonCard(r, false, true))}
                        </div>
                        {renderSpeedTiers(true)}
                      </div>
                      {/* Bottom: Remaining Pokemon in 3-col grid */}
                      {(filteredRoster.length > 4 || droppedPokemon.length > 0) && (
                        <div className="grid grid-cols-3 gap-1.5">
                          {filteredRoster.slice(4).map((r: any) => renderPokemonCard(r, false, true))}
                          {droppedPokemon.map((p: any) => renderPokemonCard(p, true, true))}
                        </div>
                      )}
                    </div>

                    {/* Desktop Layout: Original 6-col grid + Speed Tiers */}
                    <div className="hidden sm:grid grid-cols-[1fr_auto] gap-4 lg:gap-6">
                      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
                        {filteredRoster.map((r: any) => renderPokemonCard(r, false, false))}
                        {droppedPokemon.map((p: any) => renderPokemonCard(p, true, false))}
                      </div>
                      {renderSpeedTiers(false)}
                    </div>
                  </>
                );
              })()
            ) : (
              <p className="text-[var(--foreground-muted)] text-center py-6 text-sm">No Pokemon drafted yet</p>
            )}
          </div>
        </div>
        </MoveDataProvider>
      )}

      {/* Transactions & Upcoming Matches Section */}
      {selectedSeasonEntry && (
        <div className="grid lg:grid-cols-[1fr_2fr] gap-4 sm:gap-6">
          {/* Transactions - appears first on mobile, second on desktop */}
          <div className="poke-card p-0 overflow-hidden order-1 lg:order-2">
            <div className="p-4 sm:p-6 border-b-2 border-[var(--background-tertiary)]">
              <div className="flex items-center justify-between gap-2">
                <div className="section-title !mb-0 min-w-0">
                  <div className="section-title-icon !bg-[var(--accent)]" style={{ boxShadow: '0 4px 0 #b45309' }}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </div>
                  <h3 className="truncate">
                    <span className="hidden sm:inline">{selectedSeasonEntry.division?.season?.name} </span>
                    Transactions
                  </h3>
                </div>
                {txCounts && (
                  <div className="flex gap-2 sm:gap-3 shrink-0">
                    <div className="text-center px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)]">
                      <p className="text-sm sm:text-base font-bold">
                        <span className={txCounts.faRemaining === 0 ? "text-[var(--error)]" : "text-white"}>
                          {txCounts.faRemaining}
                        </span>
                        <span className="text-[var(--foreground-muted)]">/6</span>
                      </p>
                      <p className="text-[8px] sm:text-[9px] text-[var(--foreground-muted)] uppercase">FA</p>
                    </div>
                    <div className="text-center px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)]">
                      <p className="text-sm sm:text-base font-bold">
                        <span className={txCounts.p2pRemaining === 0 ? "text-[var(--error)]" : "text-white"}>
                          {txCounts.p2pRemaining}
                        </span>
                        <span className="text-[var(--foreground-muted)]">/6</span>
                      </p>
                      <p className="text-[8px] sm:text-[9px] text-[var(--foreground-muted)] uppercase">P2P</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 sm:p-6 max-h-[440px] overflow-y-auto">
            {selectedSeasonTransactions.length === 0 ? (
              <p className="text-[var(--foreground-muted)] text-center py-4 text-sm">
                No transactions this season
              </p>
            ) : (
              <>
                {/* Table Header - hidden on mobile, show on sm+ */}
                <div className="hidden sm:flex items-center gap-3 px-2 pb-3 mb-3 border-b border-[var(--background-tertiary)] text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide">
                  <div className="w-10 text-center">Wk</div>
                  <div className="w-24">Type</div>
                  <div className="flex-1">Pokemon</div>
                  <div className="w-16 text-right">Pts</div>
                </div>
                {/* Table Rows */}
                <div className="space-y-1.5 sm:space-y-1">
                  {selectedSeasonTransactions.map((tx: any) => {
                    const typeLabel = tx.type === "FA_PICKUP" ? "Pickup"
                      : tx.type === "FA_DROP" ? "Drop"
                      : tx.type === "FA_SWAP" ? "Swap"
                      : tx.type === "P2P_TRADE" ? "Trade"
                      : tx.type === "TERA_SWAP" ? "Tera"
                      : tx.type;
                    const shortTypeLabel = tx.type === "FA_PICKUP" ? "+"
                      : tx.type === "FA_DROP" ? "-"
                      : tx.type === "FA_SWAP" ? "↔"
                      : tx.type === "P2P_TRADE" ? "P2P"
                      : tx.type === "TERA_SWAP" ? "TC"
                      : tx.type;
                    const typeColor = tx.type === "FA_PICKUP" ? "text-[var(--success)]"
                      : tx.type === "FA_DROP" ? "text-[var(--error)]"
                      : tx.type === "FA_SWAP" ? "text-[var(--accent)]"
                      : tx.type === "P2P_TRADE" ? "text-[var(--primary)]"
                      : "text-[var(--accent)]";

                    // For P2P trades, flip perspective if we're the trading partner
                    const isTradePartner = tx.type === "P2P_TRADE" && tx.tradingPartnerSeasonCoachId === selectedSeasonCoachId;
                    const pokemonOut = isTradePartner ? tx.pokemonInDetails : tx.pokemonOutDetails;
                    const pokemonIn = isTradePartner ? tx.pokemonOutDetails : tx.pokemonInDetails;

                    // Get trading partner info for P2P trades
                    const tradingPartnerId = isTradePartner ? tx.seasonCoachId : tx.tradingPartnerSeasonCoachId;
                    const tradingPartner = tradingPartnerId ? seasonCoachById.get(tradingPartnerId) : null;

                    // For P2P trades, team2 sees the opposite budget change
                    const displayBudgetChange = isTradePartner ? -(tx.budgetChange || 0) : (tx.budgetChange || 0);

                    return (
                      <div key={tx.id} className="trainer-card flex-col sm:flex-row gap-1.5 sm:gap-3">
                        {/* Mobile: Top row with Week, Type, Points */}
                        <div className="flex sm:hidden items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-[var(--foreground-muted)]">W{tx.week}</span>
                            <span className={`text-xs font-bold ${typeColor}`}>{typeLabel}</span>
                            {!tx.countsAgainstLimit && (
                              <span className="text-[8px] text-[var(--foreground-muted)] italic">(grace)</span>
                            )}
                          </div>
                          {displayBudgetChange !== 0 && (
                            <span className={`text-xs font-bold ${
                              displayBudgetChange > 0 ? "text-[var(--success)]" : "text-[var(--error)]"
                            }`}>
                              {displayBudgetChange > 0 ? "+" : ""}{displayBudgetChange} pts
                            </span>
                          )}
                        </div>
                        {/* Desktop: Week */}
                        <div className="hidden sm:block w-10 text-center text-sm font-bold text-[var(--foreground-muted)]">
                          {tx.week}
                        </div>
                        {/* Desktop: Type */}
                        <div className="hidden sm:flex sm:items-center sm:gap-1 w-24">
                          <span className={`text-sm font-bold ${typeColor}`}>{typeLabel}</span>
                          {!tx.countsAgainstLimit && (
                            <span className="text-[9px] text-[var(--foreground-muted)] italic">(grace)</span>
                          )}
                        </div>
                        {/* Pokemon In/Out */}
                        <div className="flex-1 flex flex-wrap items-center gap-1.5 sm:gap-2">
                          {/* Show out first, then arrow, then in (for swaps) */}
                          {pokemonOut?.map((p: any) => {
                            const wasTC = tx.type === "P2P_TRADE" ? !!p.isTeraCaptain : tx.oldTeraCaptainId === p.id;
                            return (
                              <div key={p.id} className="flex items-center gap-0.5 sm:gap-1">
                                {p.spriteUrl && <img src={p.spriteUrl} alt="" className="w-5 h-5 sm:w-6 sm:h-6" />}
                                <span className="text-xs sm:text-sm text-[var(--error)] font-bold">
                                  -{p.displayName || p.name}{wasTC ? " [TC]" : ""}
                                </span>
                              </div>
                            );
                          })}
                          {pokemonOut?.length > 0 && pokemonIn?.length > 0 && (
                            <span className="text-xs sm:text-sm text-[var(--foreground-muted)]">→</span>
                          )}
                          {pokemonIn?.map((p: any) => {
                            const isTC = tx.type === "P2P_TRADE" ? !!p.isTeraCaptain : tx.newTeraCaptainId === p.id;
                            return (
                              <div key={p.id} className="flex items-center gap-0.5 sm:gap-1">
                                {p.spriteUrl && <img src={p.spriteUrl} alt="" className="w-5 h-5 sm:w-6 sm:h-6" />}
                                <span className="text-xs sm:text-sm text-[var(--success)] font-bold">
                                  +{p.displayName || p.name}{isTC ? " [TC]" : ""}
                                </span>
                              </div>
                            );
                          })}
                          {tx.type === "P2P_TRADE" && tradingPartner && (
                            <Link
                              href={`/coaches/${tradingPartner.coachId}`}
                              className="flex items-center gap-1 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded bg-[var(--background-secondary)] hover:bg-[var(--background-tertiary)] transition-colors"
                            >
                              {tradingPartner.teamLogoUrl && (
                                <img
                                  src={tradingPartner.teamLogoUrl}
                                  alt={tradingPartner.teamName}
                                  className="w-4 h-4 sm:w-5 sm:h-5 object-contain"
                                />
                              )}
                              <span className="text-[10px] sm:text-xs text-[var(--foreground-muted)]">
                                w/ {tradingPartner.teamAbbreviation || tradingPartner.teamName?.substring(0, 3).toUpperCase()}
                              </span>
                            </Link>
                          )}
                          {tx.type === "TERA_SWAP" && (
                            <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                              {tx.oldTeraCaptainDetails && (
                                <div className="flex items-center gap-0.5 sm:gap-1">
                                  {tx.oldTeraCaptainDetails.spriteUrl && (
                                    <img src={tx.oldTeraCaptainDetails.spriteUrl} alt="" className="w-5 h-5 sm:w-6 sm:h-6" />
                                  )}
                                  <span className="text-xs sm:text-sm text-[var(--error)] font-bold">
                                    -{tx.oldTeraCaptainDetails.displayName || tx.oldTeraCaptainDetails.name} [TC]
                                  </span>
                                </div>
                              )}
                              {tx.oldTeraCaptainDetails && tx.newTeraCaptainDetails && (
                                <span className="text-xs sm:text-sm text-[var(--foreground-muted)]">→</span>
                              )}
                              {tx.newTeraCaptainDetails && (
                                <div className="flex items-center gap-0.5 sm:gap-1">
                                  {tx.newTeraCaptainDetails.spriteUrl && (
                                    <img src={tx.newTeraCaptainDetails.spriteUrl} alt="" className="w-5 h-5 sm:w-6 sm:h-6" />
                                  )}
                                  <span className="text-xs sm:text-sm text-[var(--success)] font-bold">
                                    +{tx.newTeraCaptainDetails.displayName || tx.newTeraCaptainDetails.name} [TC]
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {/* Desktop: Budget Change */}
                        <div className="hidden sm:block w-16 text-right">
                          {displayBudgetChange !== 0 && (
                            <span className={`text-sm font-bold ${
                              displayBudgetChange > 0 ? "text-[var(--success)]" : "text-[var(--error)]"
                            }`}>
                              {displayBudgetChange > 0 ? "+" : ""}{displayBudgetChange}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            </div>
          </div>

          {/* Upcoming Matches - appears second on mobile, first on desktop */}
          <div className="poke-card p-0 overflow-hidden order-2 lg:order-1">
            <div className="p-4 sm:p-6 border-b-2 border-[var(--background-tertiary)]">
              <div className="section-title !mb-0">
                <div className="section-title-icon !bg-[var(--primary)]" style={{ boxShadow: '0 4px 0 #1e40af' }}>
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3>Upcoming</h3>
              </div>
            </div>
            <div className="p-4 sm:p-6 max-h-[440px] overflow-y-auto">
              {selectedSeasonEntry.division?.season?.isSchedulePublic === false || upcomingMatches.length === 0 ? (
                <p className="text-[var(--foreground-muted)] text-center py-4 text-sm">
                  No upcoming matches
                </p>
              ) : (
                <div className="space-y-2">
                  {upcomingMatches.map((match) => (
                    <Link
                      key={match.id}
                      href={`/matches/${match.id}`}
                      className="trainer-card flex items-center gap-3 group"
                    >
                      <div className="text-center shrink-0 w-10">
                        {match.week > 100 ? (
                          <div className="px-1.5 py-1 rounded bg-[var(--accent)]/15 border border-[var(--accent)]/30">
                            <p className="text-[10px] text-[var(--accent)] uppercase font-bold leading-tight">
                              {match.week === 101 ? "QF" : match.week === 102 ? "SF" : "F"}
                            </p>
                          </div>
                        ) : (
                          <>
                            <p className="text-[10px] text-[var(--foreground-muted)] uppercase">Wk</p>
                            <p className="text-lg font-bold">{match.week}</p>
                          </>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {match.opponentLogoUrl && (
                            <img
                              src={match.opponentLogoUrl}
                              alt=""
                              className="w-8 h-8 object-contain shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-sm truncate group-hover:text-[var(--primary)] transition-colors">
                              vs {match.opponentTeamName}
                            </p>
                            <p className="text-[10px] text-[var(--foreground-muted)]">
                              {match.opponentPosition && (
                                <span className="font-medium">#{match.opponentPosition}</span>
                              )}
                              <span className={match.opponentPosition ? "ml-1" : ""}>
                                {match.opponentWins}-{match.opponentLosses}
                                <span className="mx-0.5">·</span>
                                <span className={match.opponentDifferential > 0 ? "text-[var(--success)]" : match.opponentDifferential < 0 ? "text-[var(--error)]" : ""}>
                                  {match.opponentDifferential > 0 ? "+" : match.opponentDifferential < 0 ? "" : "±"}{match.opponentDifferential}
                                </span>
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>
                      <svg className="w-4 h-4 text-[var(--foreground-muted)] group-hover:text-[var(--primary)] transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* All-Time Stats - Kill Leaders & Nemesis */}
      {(allTimeKillLeaders.length > 0 || nemesisPokemon.length > 0) && (
        <div className="grid lg:grid-cols-[2fr_1fr] gap-4 sm:gap-6">
          {/* All-Time Kill Leaders */}
          {allTimeKillLeaders.length > 0 && (
            <div className="poke-card p-0 overflow-hidden">
              <div className="p-4 sm:p-6 border-b-2 border-[var(--background-tertiary)]">
                <div className="flex items-center justify-between">
                  <div className="section-title !mb-0">
                    <div className="section-title-icon !bg-[var(--success)]" style={{ boxShadow: '0 4px 0 #166534' }}>
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <h3>
                      <span className="sm:hidden">Kill Leaders</span>
                      <span className="hidden sm:inline">All-Time Kill Leaders</span>
                    </h3>
                  </div>
                  <Link
                    href={`/coaches/${coachId}/pokemon-stats`}
                    className="flex items-center gap-1.5 text-xs text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors font-bold"
                  >
                    View All
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
              <div className="p-4 sm:p-6">
                {/* Header Row */}
                <div className="flex items-center gap-2 px-2 sm:px-3 pb-2 mb-2 border-b border-[var(--background-tertiary)] text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide">
                  <div className="w-5 sm:w-6 shrink-0"></div>
                  <div className="flex items-center gap-2 flex-1 min-w-0">Pokemon</div>
                  <div className="flex items-center shrink-0">
                    <span className="w-6 sm:w-10 text-center">K</span>
                    <span className="w-6 sm:w-10 text-center">D</span>
                    <span className="w-8 sm:w-12 text-center hidden sm:block">K/D</span>
                    <span className="w-6 sm:w-8 text-center">GP</span>
                  </div>
                </div>
                <div className="space-y-1">
                  {allTimeKillLeaders.map((pkmn, index) => {
                    const kd = pkmn.deaths > 0
                      ? (pkmn.kills / pkmn.deaths).toFixed(2)
                      : pkmn.kills > 0 ? "∞" : "0.00";
                    return (
                      <Link key={pkmn.pokemonId} href={`/pokemon/${pkmn.pokemonId}`} className="trainer-card gap-2 sm:gap-3 group">
                        <div className={`rank-badge w-5 h-5 sm:w-8 sm:h-8 text-[10px] sm:text-xs shrink-0 ${
                          index === 0 ? 'rank-1' :
                          index === 1 ? 'rank-2' :
                          index === 2 ? 'rank-3' :
                          'bg-[var(--background)] text-[var(--foreground-subtle)] border border-[var(--background-tertiary)]'
                        }`}>
                          {index + 1}
                        </div>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {pkmn.spriteUrl ? (
                            <img
                              src={pkmn.spriteUrl}
                              alt={pkmn.pokemonDisplayName}
                              className="w-6 h-6 sm:w-7 sm:h-7 object-contain"
                            />
                          ) : (
                            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded bg-[var(--background-tertiary)] flex items-center justify-center">
                              <span className="text-xs">?</span>
                            </div>
                          )}
                          <span className="font-bold text-xs sm:text-sm truncate group-hover:text-[var(--primary)] transition-colors">{pkmn.pokemonDisplayName}</span>
                        </div>
                        <div className="flex items-center text-xs sm:text-sm font-mono shrink-0">
                          <span className="w-6 sm:w-10 text-center font-bold text-[var(--success)]">{pkmn.kills}</span>
                          <span className="w-6 sm:w-10 text-center font-bold text-[var(--error)]">{pkmn.deaths}</span>
                          <span className="w-8 sm:w-12 text-center text-[var(--foreground-muted)] hidden sm:block">{kd}</span>
                          <span className="w-6 sm:w-8 text-center text-[var(--foreground-muted)]">{pkmn.gamesPlayed}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Nemesis Pokemon - Most Kills Against This Coach */}
          {nemesisPokemon.length > 0 && (
            <div className="poke-card p-0 overflow-hidden">
              <div className="p-4 sm:p-6 border-b-2 border-[var(--background-tertiary)]">
                <div className="section-title !mb-0">
                  <div className="section-title-icon !bg-[var(--error)]" style={{ boxShadow: '0 4px 0 #991b1b' }}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <h3>Biggest Threats</h3>
                </div>
              </div>
              <div className="p-4 sm:p-6">
                {/* Header Row */}
                <div className="flex items-center gap-2 px-2 sm:px-3 pb-2 mb-2 border-b border-[var(--background-tertiary)] text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide">
                  <div className="w-5 sm:w-6 shrink-0"></div>
                  <div className="flex items-center gap-2 flex-1 min-w-0">Opponent</div>
                  <div className="w-8 sm:w-10 text-center shrink-0">KO's</div>
                </div>
                <div className="space-y-1">
                  {nemesisPokemon.map((pkmn, index) => (
                    <Link key={pkmn.pokemonId} href={`/pokemon/${pkmn.pokemonId}`} className="trainer-card gap-2 sm:gap-3 group">
                      <div className={`rank-badge w-5 h-5 sm:w-8 sm:h-8 text-[10px] sm:text-xs shrink-0 ${
                        index === 0 ? 'rank-1' :
                        index === 1 ? 'rank-2' :
                        index === 2 ? 'rank-3' :
                        'bg-[var(--background)] text-[var(--foreground-subtle)] border border-[var(--background-tertiary)]'
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {pkmn.spriteUrl ? (
                          <img
                            src={pkmn.spriteUrl}
                            alt={pkmn.pokemonDisplayName}
                            className="w-6 h-6 sm:w-7 sm:h-7 object-contain"
                          />
                        ) : (
                          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded bg-[var(--background-tertiary)] flex items-center justify-center">
                            <span className="text-xs">?</span>
                          </div>
                        )}
                        <span className="font-bold text-xs sm:text-sm truncate group-hover:text-[var(--primary)] transition-colors">{pkmn.pokemonDisplayName}</span>
                      </div>
                      <div className="w-8 sm:w-10 text-center text-xs sm:text-sm font-mono font-bold text-[var(--error)] shrink-0">
                        {pkmn.kills}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {revealedItemTendencies.length > 0 && (
        <div className="poke-card p-0 overflow-hidden">
          <div className="p-4 sm:p-6 border-b-2 border-[var(--background-tertiary)]">
            <div className="section-title !mb-0">
              <div className="section-title-icon">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div>
                <h3>Revealed Item Tendencies</h3>
                <p className="mt-1 text-xs font-normal text-[var(--foreground-muted)]">
                  Only items explicitly shown in recorded replays
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-2 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
            {revealedItemTendencies.map((trend) => (
              <Link
                key={`${trend.pokemonId}-${trend.item}`}
                href={`/pokemon/${trend.pokemonId}`}
                className="trainer-card gap-3 group"
              >
                {trend.spriteUrl ? (
                  <img
                    src={trend.spriteUrl}
                    alt={trend.pokemonDisplayName}
                    className="h-9 w-9 shrink-0 object-contain"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold group-hover:text-[var(--primary)]">
                    {trend.pokemonDisplayName}
                  </p>
                  <p className="truncate text-xs text-[var(--foreground-muted)]">{trend.item}</p>
                </div>
                <span className="font-mono text-sm text-[var(--primary)]">{trend.reveals}×</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Season History & Recent Matches */}
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Season History */}
        <div className="poke-card p-0 overflow-hidden">
          <div className="p-4 sm:p-6 border-b-2 border-[var(--background-tertiary)]">
            <div className="section-title !mb-0">
              <div className="section-title-icon">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3>Season History</h3>
            </div>
          </div>
          <div className="p-4 sm:p-6">
            {coachSeasons.length === 0 ? (
              <p className="text-[var(--foreground-muted)] text-center py-6 text-sm">
                No season participation yet
              </p>
            ) : (
              <div className="space-y-2">
                {coachSeasons.map((sc) => {
                  const results = seasonResultsMap.get(sc.id);
                  const placement = results?.placement;
                  const playoffResult = results?.playoffResult;
                  const isCurrent = sc.division?.season?.isCurrent;
                  const isDropout = !sc.isActive && sc.replacedByTeam;
                  const isMSR = !!sc.replacedTeam;

                  return (
                    <Link
                      key={sc.id}
                      href={`/seasons/${sc.division?.seasonId}/divisions/${sc.divisionId}`}
                      className="block trainer-card gap-2 sm:gap-3 group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 sm:gap-2">
                          <p className="font-bold text-xs sm:text-sm group-hover:text-[var(--primary)] transition-colors truncate">
                            {sc.teamName}
                          </p>
                          {isCurrent && (
                            <span className="inline-flex items-center gap-0.5 sm:gap-1 px-1 sm:px-1.5 py-0.5 text-[8px] sm:text-[9px] font-bold rounded bg-[var(--success)]/20 text-[var(--success)] border border-[var(--success)]/30">
                              <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
                              Live
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] sm:text-xs text-[var(--foreground-muted)]">
                          {sc.division?.season?.name} | {sc.division?.name}
                        </p>
                      </div>
                      {/* Status indicator & Results */}
                      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                        {/* Dropout indicator */}
                        {isDropout && (
                          <MobileTooltip
                            position="right"
                            verticalPosition="top"
                            trigger={
                              <span className="inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded bg-[var(--error)]/20 text-[var(--error)] cursor-help">
                                <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                              </span>
                            }
                          >
                            <div className="px-3 py-2 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--error)]/30 shadow-lg whitespace-nowrap">
                              <p className="text-[10px] font-bold text-[var(--error)] uppercase tracking-wide mb-1">Dropout</p>
                              <p className="text-xs text-[var(--foreground)]">
                                Replaced by <span className="font-bold">{sc.replacedByTeam}</span>
                                {sc.replacementWeek && <span className="text-[var(--foreground-muted)]"> • Week {sc.replacementWeek}</span>}
                              </p>
                            </div>
                          </MobileTooltip>
                        )}
                        {/* Mid-season replacement indicator */}
                        {isMSR && (
                          <MobileTooltip
                            position="right"
                            verticalPosition="top"
                            trigger={
                              <span className="inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded bg-[var(--accent)]/20 text-[var(--accent)]">
                                <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                </svg>
                              </span>
                            }
                          >
                            <div className="px-3 py-2 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--accent)]/30 shadow-lg whitespace-nowrap">
                              <p className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-wide mb-1">Mid-Season Replacement</p>
                              <p className="text-xs text-[var(--foreground)]">
                                Replaced <span className="font-bold">{sc.replacedTeam}</span>
                                {sc.replacementWeek && <span className="text-[var(--foreground-muted)]"> • Week {sc.replacementWeek}</span>}
                              </p>
                            </div>
                          </MobileTooltip>
                        )}
                        {/* Regular Season Column */}
                        <div className="text-center w-8 sm:w-12">
                          <p className="text-[7px] sm:text-[8px] text-[var(--foreground-subtle)] uppercase tracking-wide">Reg</p>
                          {isDropout ? (
                            <p className="text-xs sm:text-sm text-[var(--foreground-subtle)]">-</p>
                          ) : placement ? (
                            <p className={`text-xs sm:text-sm font-bold ${
                              placement === 1 ? "text-[#ffd700]" :
                              placement === 2 ? "text-[#c0c0c0]" :
                              placement === 3 ? "text-[#cd7f32]" :
                              placement <= 8 ? "text-[var(--foreground)]" :
                              "text-[var(--foreground-muted)]"
                            }`}>
                              #{placement}
                            </p>
                          ) : (
                            <p className="text-xs sm:text-sm text-[var(--foreground-subtle)]">-</p>
                          )}
                        </div>
                        {/* Playoff Column */}
                        <div className="text-center w-10 sm:w-16">
                          <p className="text-[7px] sm:text-[8px] text-[var(--foreground-subtle)] uppercase tracking-wide">
                            <span className="hidden sm:inline">Playoffs</span>
                            <span className="sm:hidden">PO</span>
                          </p>
                          {playoffResult ? (
                            <p className={`text-xs sm:text-sm font-bold ${
                              playoffResult === "Champion" ? "text-[#ffd700]" :
                              playoffResult === "Finals" ? "text-[#c0c0c0]" :
                              playoffResult === "Semis" ? "text-[var(--primary)]" :
                              playoffResult === "Quarters" ? "text-[var(--accent)]" :
                              "text-[var(--success)]"
                            }`}>
                              {playoffResult === "Champion" ? "🏆" : playoffResult}
                            </p>
                          ) : (
                            <p className="text-xs sm:text-sm text-[var(--foreground-subtle)]">-</p>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Recent Matches */}
        <div className="poke-card p-0 overflow-hidden">
          <div className="p-6 border-b-2 border-[var(--background-tertiary)]">
            <div className="flex items-center justify-between">
              <div className="section-title !mb-0">
                <div className="section-title-icon !bg-[var(--error)]" style={{ boxShadow: '0 4px 0 #991b1b' }}>
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3>Recent Matches</h3>
              </div>
              <Link
                href={`/coaches/${coachId}/matches`}
                className="flex items-center gap-1.5 text-xs text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors font-bold"
              >
                View All
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
          <div className="p-6">
            {coachMatches.length === 0 ? (
              <p className="text-[var(--foreground-muted)] text-center py-6 text-sm">
                No matches played yet
              </p>
            ) : (
              <div className="space-y-2">
                {coachMatches.slice(0, 8).map((match) => {
                  const isCoach1 = seasonCoachIds.includes(match.coach1SeasonId);
                  const won =
                    match.winnerId ===
                    (isCoach1 ? match.coach1SeasonId : match.coach2SeasonId);
                  const opponent = isCoach1 ? match.coach2 : match.coach1;
                  const myDiff = isCoach1
                    ? match.coach1Differential
                    : match.coach2Differential;

                  // Calculate score display (e.g., "4-0" instead of "+4")
                  // Format: winner's differential - 0 (same as match page)
                  let scoreDisplay = "-";
                  if (match.winnerId) {
                    const winnerDiff = Math.abs(myDiff || 0);
                    if (won) {
                      scoreDisplay = `${winnerDiff}-0`;
                    } else {
                      scoreDisplay = `0-${winnerDiff}`;
                    }
                  }

                  return (
                    <div
                      key={match.id}
                      className={`flex items-center justify-between p-3 rounded-lg border-2 hover:border-[var(--primary)] transition-all group ${
                        won
                          ? "bg-[var(--success)]/5 border-[var(--success)]/30"
                          : match.winnerId
                          ? "bg-[var(--error)]/5 border-[var(--error)]/30"
                          : "bg-[var(--background-secondary)] border-[var(--background-tertiary)]"
                      }`}
                    >
                      <Link href={`/matches/${match.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                        <span
                          className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 ${
                            won
                              ? "bg-[var(--success)]/20 text-[var(--success)]"
                              : "bg-[var(--error)]/20 text-[var(--error)]"
                          }`}
                        >
                          {won ? "W" : "L"}
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-sm group-hover:text-[var(--primary)] transition-colors truncate">vs {opponent?.teamName}</p>
                          <p className="text-[10px] text-[var(--foreground-muted)]">
                            {match.division?.season?.name} | {formatWeekDisplay(match.week)}
                          </p>
                        </div>
                      </Link>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="w-[22px] flex items-center justify-center">
                          {match.isForfeit ? (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--error)] opacity-80">
                              FF
                            </span>
                          ) : match.replayUrl ? (
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
                          ) : null}
                        </div>
                        <span className={`font-bold text-sm ${
                          won ? "text-[var(--success)]" : match.winnerId ? "text-[var(--error)]" : ""
                        }`}>
                          {scoreDisplay}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Career Milestones */}
      <section className="poke-card overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b-2 border-[var(--background-tertiary)] p-5 sm:p-6">
          <div className="section-title !mb-0">
            <div
              className="section-title-icon !bg-amber-500"
              style={{ boxShadow: "0 4px 0 #b45309" }}
            >
              <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4zM7 6H4v1a4 4 0 004 4M17 6h3v1a4 4 0 01-4 4" />
              </svg>
            </div>
            <div>
              <h3>Milestones</h3>
              <p className="mt-0.5 text-xs font-normal text-[var(--foreground-muted)]">
                Career achievements earned by this coach and their Pokémon
              </p>
            </div>
          </div>
          {coachMilestones.length > 0 && (
            <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-bold text-amber-300">
              {coachMilestones.length}
            </span>
          )}
        </div>
        <div className="p-5 sm:p-6">
          {coachMilestones.length === 0 ? (
            <p className="py-4 text-center text-sm text-[var(--foreground-muted)]">
              No milestones earned yet.
            </p>
          ) : (
            <div className="max-h-[36rem] space-y-6 overflow-y-auto pr-1">
              {liveMilestoneTitles.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-yellow-300/40 bg-gradient-to-br from-yellow-300/[0.12] via-cyan-400/[0.08] to-transparent shadow-[0_0_28px_rgba(250,204,21,0.08)]">
                  <div className="flex items-center justify-between border-b border-yellow-300/25 px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-300/20 text-lg">
                        👑
                      </span>
                      <div>
                        <h4 className="font-black text-yellow-200">Live Titles</h4>
                        <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-subtle)]">
                          Held only while this coach remains the leader
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.9)]" />
                      Live
                    </span>
                  </div>
                  <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
                    {liveMilestoneTitles.map((milestone) => (
                      <Link
                        key={milestone.key}
                        href={milestone.pokemonId ? `/pokemon/${milestone.pokemonId}` : "#"}
                        className="group rounded-xl border border-yellow-300/30 bg-[var(--background-secondary)]/75 p-4 transition-all hover:-translate-y-0.5 hover:border-yellow-200/60 hover:shadow-[0_8px_24px_rgba(250,204,21,0.12)]"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="rounded-full bg-yellow-300/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-yellow-200">
                            Live badge
                          </span>
                          <span className="text-base transition-transform group-hover:scale-110">🏅</span>
                        </div>
                        <p className="font-black text-[var(--foreground)]">{milestone.title}</p>
                        <p className="mt-1 text-xs text-[var(--foreground-muted)]">{milestone.detail}</p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {milestonesBySeason.map(({ seasonNumber, milestones: seasonMilestones }) => (
                <div
                  key={seasonNumber}
                  className="overflow-hidden rounded-xl border border-[var(--background-tertiary)] bg-[var(--background-secondary)]/45"
                >
                  <div className="flex items-center justify-between border-b border-[var(--background-tertiary)] bg-gradient-to-r from-amber-400/10 to-transparent px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400/15 text-sm font-black text-amber-300">
                        S{seasonNumber}
                      </span>
                      <div>
                        <h4 className="font-black text-[var(--foreground)]">Season {seasonNumber}</h4>
                        <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-subtle)]">
                          Achievement collection
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full bg-[var(--background-tertiary)] px-2.5 py-1 text-[10px] font-bold text-[var(--foreground-muted)]">
                      {seasonMilestones.length} {seasonMilestones.length === 1 ? "milestone" : "milestones"}
                    </span>
                  </div>
                  <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
                    {seasonMilestones.map((milestone) => {
                      const card = (
                        <div className={`h-full rounded-xl border p-4 transition-colors ${
                          milestone.category === "coach"
                            ? "border-amber-400/25 bg-amber-400/[0.06]"
                            : milestone.category === "pokemon"
                              ? "border-cyan-400/25 bg-cyan-400/[0.06]"
                              : "border-violet-400/25 bg-violet-400/[0.06]"
                        }`}>
                          <div className="mb-2">
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                        milestone.category === "coach"
                          ? "bg-amber-400/15 text-amber-300"
                          : milestone.category === "pokemon"
                            ? "bg-cyan-400/15 text-cyan-300"
                            : "bg-violet-400/15 text-violet-300"
                      }`}>
                              {milestone.category === "season" ? "Team / Season" : milestone.category}
                            </span>
                          </div>
                          <p className="font-bold text-[var(--foreground)]">{milestone.title}</p>
                          <p className="mt-1 text-xs text-[var(--foreground-muted)]">{milestone.detail}</p>
                        </div>
                      );

                      return milestone.matchId ? (
                        <Link
                          key={milestone.key}
                          href={`/matches/${milestone.matchId}`}
                          className="block rounded-xl hover:ring-2 hover:ring-[var(--primary)]/40"
                        >
                          {card}
                        </Link>
                      ) : (
                        <div key={milestone.key}>{card}</div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

    </div>
  );
}
