import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { matches, seasonPokemonPrices, eloHistory, transactions, coachPurchases, storeItems } from "@/lib/schema";
import { eq, and, lt, desc, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { MatchPreview } from "@/components/match-preview";
import { VictoryAnimation } from "@/components/victory-animation";
import { ScheduleEditor } from "@/components/schedule-editor";
import { ExpandablePokemonCard } from "@/components/expandable-pokemon-card";
import { HpChart } from "@/components/hp-chart";
import { DecidingTurnsPanel } from "@/components/deciding-turns-panel";
import { ShareButton } from "@/components/share-button";
import { getSession } from "@/lib/session";
import { getMatchDecidingTurnsEditorHiddenKey, getSiteSetting } from "@/lib/site-settings";
import { getTimeSyncedRoster as getTimeSyncedRosterUtil } from "@/lib/roster-utils";
import type { TimeSyncTransaction } from "@/lib/roster-utils";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getMatch(id: number) {
  return await db.query.matches.findFirst({
    where: eq(matches.id, id),
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
      winner: true,
      matchPokemon: {
        with: { pokemon: true, seasonCoach: true },
      },
    },
  });
}

async function getSeasonPokemonPrices(seasonId: number) {
  return await db.query.seasonPokemonPrices.findMany({
    where: eq(seasonPokemonPrices.seasonId, seasonId),
  });
}

// Get ELO change data for both coaches in this match
async function getMatchEloChanges(matchId: number, coach1Id: number | undefined, coach2Id: number | undefined) {
  if (!coach1Id || !coach2Id) return { coach1: null, coach2: null };

  // Get ELO after this match for both coaches
  const eloAfterMatch = await db.query.eloHistory.findMany({
    where: eq(eloHistory.matchId, matchId),
  });

  const coach1After = eloAfterMatch.find(e => e.coachId === coach1Id);
  const coach2After = eloAfterMatch.find(e => e.coachId === coach2Id);

  // Get ELO before this match (the previous entry for each coach) - fetch in parallel
  const [coach1PrevEntry, coach2PrevEntry] = await Promise.all([
    coach1After
      ? db.query.eloHistory.findFirst({
          where: and(
            eq(eloHistory.coachId, coach1Id),
            lt(eloHistory.id, coach1After.id)
          ),
          orderBy: [desc(eloHistory.id)],
        })
      : Promise.resolve(null),
    coach2After
      ? db.query.eloHistory.findFirst({
          where: and(
            eq(eloHistory.coachId, coach2Id),
            lt(eloHistory.id, coach2After.id)
          ),
          orderBy: [desc(eloHistory.id)],
        })
      : Promise.resolve(null),
  ]);

  const coach1Before = coach1PrevEntry?.eloRating ?? null;
  const coach2Before = coach2PrevEntry?.eloRating ?? null;

  return {
    coach1: coach1After ? {
      before: coach1Before,
      after: coach1After.eloRating,
      delta: coach1Before !== null ? Math.round(coach1After.eloRating - coach1Before) : null,
    } : null,
    coach2: coach2After ? {
      before: coach2Before,
      after: coach2After.eloRating,
      delta: coach2Before !== null ? Math.round(coach2After.eloRating - coach2Before) : null,
    } : null,
  };
}

// Helper to get display label for a week number
function getWeekLabel(week: number): string {
  if (week === 101) return "Quarterfinals";
  if (week === 102) return "Semifinals";
  if (week === 103) return "Finals";
  return `Week ${week}`;
}

type MatchKeyEvent = {
  turn: number;
  type: "faint" | "win";
  player: "p1" | "p2";
  pokemon?: string;
  killer?: string;
  killerPlayer?: "p1" | "p2";
  move?: string;
  cause?: string;
};

type BattleSummaryPokemon = {
  id: number;
  pokemon: {
    name: string;
    displayName?: string | null;
    spriteUrl?: string | null;
  } | null;
  kills: number | null;
  deaths: number | null;
  damageDealt: number | null;
  damageDealtIndirect: number | null;
  damageTakenIndirect: number | null;
  turnsActive: number | null;
  hazardDamageTaken: number | null;
  setupMovesUsed: number | null;
  favorableCrits: number | null;
  favorableMisses: number | null;
  favorableFlinches: number | null;
  favorableParalysis: number | null;
  favorableFreezes: number | null;
  favorableBurns: number | null;
  favorableSleep: number | null;
  revealedItems: Array<{ item: string; turn: number; source: string }> | null;
};

type TimeSyncedPokemon = {
  id: number;
  name: string;
  displayName: string | null;
  spriteUrl: string | null;
  types: string[] | null;
  abilities: { name: string; isHidden: boolean }[] | null;
  hp: number | null;
  attack: number | null;
  defense: number | null;
  specialAttack: number | null;
  specialDefense: number | null;
  speed: number | null;
  baseStatTotal: number | null;
  moves: string[] | null;
};

type TimeSyncedRosterEntry = {
  id: number;
  pokemonId: number;
  seasonCoachId: number;
  price: number;
  acquiredWeek: number | null;
  acquiredVia: string | null;
  isTeraCaptain: boolean | null;
  pokemon: TimeSyncedPokemon | null;
};

type MatchPreviewDroppedPokemon = {
  id: number;
  name: string;
  displayName?: string | null;
  spriteUrl: string | null;
  types: string[] | null;
  speed: number | null;
  isTeraCaptain?: boolean;
};

function getPokemonLabel(mp: BattleSummaryPokemon) {
  return mp.pokemon?.displayName || mp.pokemon?.name || "Pokemon";
}

function formatKnownNumber(value: number | null | undefined, suffix = "") {
  return value === null || value === undefined ? "x" : `${value}${suffix}`;
}

function getBattleSummaryStats(teamPokemon: BattleSummaryPokemon[]) {
  const hasHazardDamage = teamPokemon.some((mp) => mp.hazardDamageTaken !== null);
  const hasSetupMoves = teamPokemon.some((mp) => mp.setupMovesUsed !== null);
  const hasFavorableEvents = teamPokemon.some(
    (mp) =>
      mp.favorableCrits !== null ||
      mp.favorableMisses !== null ||
      mp.favorableFlinches !== null ||
      mp.favorableParalysis !== null ||
      mp.favorableFreezes !== null ||
      mp.favorableBurns !== null ||
      mp.favorableSleep !== null
  );

  return {
    hazardDamageTaken: hasHazardDamage
      ? `${Math.round(teamPokemon.reduce((sum, mp) => sum + (mp.hazardDamageTaken || 0), 0))}%`
      : "x",
    setupMoves: hasSetupMoves
      ? teamPokemon.reduce((sum, mp) => sum + (mp.setupMovesUsed || 0), 0)
      : "x",
    favorableEvents: hasFavorableEvents
      ? teamPokemon.reduce(
          (sum, mp) =>
            sum +
            (mp.favorableCrits || 0) +
            (mp.favorableMisses || 0) +
            (mp.favorableFlinches || 0) +
            (mp.favorableParalysis || 0) +
            (mp.favorableFreezes || 0) +
            (mp.favorableBurns || 0) +
            (mp.favorableSleep || 0),
          0
        )
      : "x",
  };
}

function BattleSummaryTeam({
  teamName,
  logoUrl,
  pokemonRows,
  align,
}: {
  teamName: string;
  logoUrl?: string | null;
  pokemonRows: BattleSummaryPokemon[];
  align: "left" | "right";
}) {
  const stats = getBattleSummaryStats(pokemonRows);

  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-3 ${align === "right" ? "justify-end" : ""}`}>
        {align === "left" && (
          <div className="w-14 h-14 rounded bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden shrink-0">
            {logoUrl ? (
              <Image src={logoUrl} alt={teamName} width={56} height={56} className="object-contain" />
            ) : (
              <span className="text-xs font-black text-white">{teamName.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
        )}
        <div className={align === "right" ? "text-right" : ""}>
          <div className="text-[10px] uppercase font-black text-white/55">Team</div>
          <div className="text-sm sm:text-base font-black text-white leading-tight">{teamName}</div>
        </div>
        {align === "right" && (
          <div className="w-14 h-14 rounded bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden shrink-0">
            {logoUrl ? (
              <Image src={logoUrl} alt={teamName} width={56} height={56} className="object-contain" />
            ) : (
              <span className="text-xs font-black text-white">{teamName.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5 text-center">
        {[
          ["Hazard Damage Taken", stats.hazardDamageTaken],
          ["Set Up Moves Used", stats.setupMoves],
          ["Favorable Crits/Flinch/Miss/Status Proc", stats.favorableEvents],
        ].map(([label, value]) => (
          <div key={label} className="flex min-h-[60px] flex-col rounded border border-white/15 bg-black/35 px-2 py-1.5">
            <div className="flex min-h-[22px] items-start justify-center text-[9px] sm:text-[10px] uppercase font-black text-white/55 leading-tight">
              {label === "Favorable Crits/Flinch/Miss/Status Proc" ? (
                <span>
                  <span className="block">Favorable Crits/Flinches</span>
                  <span className="block">Miss/Status Proc</span>
                </span>
              ) : (
                label
              )}
            </div>
            <div className="mt-0.5 text-lg sm:text-xl font-black text-white">{value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded border border-white/15 bg-black/30">
        <div className="grid grid-cols-[1fr_52px_82px_56px] bg-white/10 px-2 py-1.5 text-[9px] uppercase font-black text-white/55">
          <span>Pokemon</span>
          <span className="text-center">Kills</span>
          <span className="text-center">Damage</span>
          <span className="text-center">Turns</span>
        </div>
        <div className="divide-y divide-white/10">
          {pokemonRows.map((mp) => {
            const kills = mp.kills || 0;
            const deaths = mp.deaths || 0;
            const totalDamage = Math.round((mp.damageDealt || 0) + (mp.damageDealtIndirect || 0));
            const rowTone = mp.turnsActive === 0
              ? "bg-gray-500/18 border-gray-400/30"
              : deaths > 0
                ? "bg-red-500/18 border-red-400/30"
                : "bg-emerald-500/18 border-emerald-400/30";

            return (
              <div key={mp.id} className={`grid grid-cols-[1fr_52px_82px_56px] items-center border-l-4 ${rowTone} px-2 py-1.5`}>
                <div className="flex items-center gap-2 min-w-0">
                  {mp.pokemon?.spriteUrl ? (
                    <Image
                      src={mp.pokemon.spriteUrl}
                      alt={getPokemonLabel(mp)}
                      width={32}
                      height={32}
                      className="w-8 h-8 object-contain shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded bg-white/10 shrink-0" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-xs sm:text-sm font-black text-white">{getPokemonLabel(mp)}</span>
                    <span
                      className="block truncate text-[9px] font-bold text-[var(--accent)]"
                      title={mp.revealedItems?.map((entry) => `${entry.item}, turn ${entry.turn}, ${entry.source}`).join(" → ") || "Unknown item"}
                    >
                      {mp.revealedItems?.map((entry) => entry.item).join(" → ") || "Unknown item"}
                    </span>
                  </span>
                </div>
                <span className="text-center font-mono text-sm font-black text-white">{kills}</span>
                <span className="text-center font-mono text-sm font-black text-white">{totalDamage}%</span>
                <span className="text-center font-mono text-sm font-black text-white">{formatKnownNumber(mp.turnsActive)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BattleSummaryPanel({
  canEditDecidingTurns,
  canManageDecidingTurnsEditorVisibility,
  coach1Name,
  coach2Name,
  coach1LogoUrl,
  coach2LogoUrl,
  coach1Pokemon,
  coach2Pokemon,
  decidingTurnsText,
  decidingTurnsEditorHidden,
  matchId,
}: {
  canEditDecidingTurns: boolean;
  canManageDecidingTurnsEditorVisibility: boolean;
  coach1Name: string;
  coach2Name: string;
  coach1LogoUrl?: string | null;
  coach2LogoUrl?: string | null;
  coach1Pokemon: BattleSummaryPokemon[];
  coach2Pokemon: BattleSummaryPokemon[];
  decidingTurnsText: string | null;
  decidingTurnsEditorHidden: boolean;
  matchId: number;
}) {
  return (
    <div className="poke-card overflow-visible p-3 sm:p-5 md:overflow-hidden">
      <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background-secondary)] p-3 sm:p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px_minmax(0,1fr)]">
          <div className="order-1 xl:order-none">
            <BattleSummaryTeam
              teamName={coach1Name}
              logoUrl={coach1LogoUrl}
              pokemonRows={coach1Pokemon}
              align="left"
            />
          </div>

          <div className="order-3 xl:order-none">
            <DecidingTurnsPanel
              canEdit={canEditDecidingTurns}
              canManageEditorVisibility={canManageDecidingTurnsEditorVisibility}
              initialText={decidingTurnsText}
              initialEditorHidden={decidingTurnsEditorHidden}
              matchId={matchId}
            />
          </div>

          <div className="order-2 xl:order-none">
            <BattleSummaryTeam
              teamName={coach2Name}
              logoUrl={coach2LogoUrl}
              pokemonRows={coach2Pokemon}
              align="right"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Get time-synced roster for a coach at a specific match week
async function getTimeSyncedRoster(
  seasonCoachId: number,
  matchWeek: number,
  currentRosters: TimeSyncedRosterEntry[]
): Promise<{
  filteredRosters: TimeSyncedRosterEntry[];
  droppedPokemonDetails: MatchPreviewDroppedPokemon[];
}> {
  // Get transactions for this coach (as primary or trading partner)
  const [primaryTxs, partnerTxs] = await Promise.all([
    db.query.transactions.findMany({
      where: eq(transactions.seasonCoachId, seasonCoachId),
    }),
    db.query.transactions.findMany({
      where: and(
        eq(transactions.type, "P2P_TRADE"),
        eq(transactions.tradingPartnerSeasonCoachId, seasonCoachId),
      ),
    }),
  ]);
  const coachTxs = [...primaryTxs, ...partnerTxs];

  const syncedRoster = await getTimeSyncedRosterUtil(seasonCoachId, matchWeek, currentRosters, coachTxs as TimeSyncTransaction[]);

  return {
    filteredRosters: syncedRoster.filteredRosters as unknown as TimeSyncedRosterEntry[],
    droppedPokemonDetails: syncedRoster.droppedPokemonDetails as unknown as MatchPreviewDroppedPokemon[],
  };
}

export default async function MatchDetailPage({ params }: PageProps) {
  const resolvedParams = await params;
  const matchId = parseInt(resolvedParams.id);
  const match = await getMatch(matchId);

  if (!match) {
    notFound();
  }

  const isPlayed = match.winnerId !== null;
  const ONE_HOUR = 60 * 60 * 1000;
  const now = new Date().getTime();
  const isUnderway = !isPlayed && !!match.scheduledAt &&
    new Date(match.scheduledAt).getTime() <= now &&
    new Date(match.scheduledAt).getTime() > now - ONE_HOUR;
  const coach1 = match.coach1;
  const coach2 = match.coach2;

  // Get match Pokemon for each coach
  const coach1MatchPokemon = match.matchPokemon.filter(
    (mp) => mp.seasonCoachId === match.coach1SeasonId
  );
  const coach2MatchPokemon = match.matchPokemon.filter(
    (mp) => mp.seasonCoachId === match.coach2SeasonId
  );

  // Calculate totals for played match
  const coach1Kills = coach1MatchPokemon.reduce((sum, mp) => sum + (mp.kills || 0), 0);
  const coach1Deaths = coach1MatchPokemon.reduce((sum, mp) => sum + (mp.deaths || 0), 0);
  const coach2Kills = coach2MatchPokemon.reduce((sum, mp) => sum + (mp.kills || 0), 0);
  const coach2Deaths = coach2MatchPokemon.reduce((sum, mp) => sum + (mp.deaths || 0), 0);

  const coach1Won = match.winnerId === match.coach1SeasonId;
  const coach2Won = match.winnerId === match.coach2SeasonId;

  // Fetch all secondary data in parallel
  const winnerCoachId = coach1Won ? coach1?.coachId : coach2Won ? coach2?.coachId : null;
  const coachIds = [coach1?.coachId, coach2?.coachId].filter((id): id is number => id !== undefined);
  const needsTimeSyncedRosters = !isPlayed && coach1 && coach2;

  const [
    pokemonPrices,
    eloChanges,
    storeItemsList,
    session,
    allPurchases,
    coach1TimeSyncedRoster,
    coach2TimeSyncedRoster,
    decidingTurnsEditorHiddenSetting,
  ] = await Promise.all([
    getSeasonPokemonPrices(match.seasonId),
    getMatchEloChanges(matchId, coach1?.coachId, coach2?.coachId),
    db.query.storeItems.findMany({
      where: inArray(storeItems.slug, ["victory-animation", "blue-team", "red-team"]),
    }),
    getSession(),
    coachIds.length > 0
      ? db.query.coachPurchases.findMany({
          where: and(
            inArray(coachPurchases.coachId, coachIds),
            eq(coachPurchases.isActive, true)
          ),
        })
      : Promise.resolve([]),
    needsTimeSyncedRosters
      ? getTimeSyncedRoster(match.coach1SeasonId, match.week, coach1?.rosters || [])
      : Promise.resolve(null),
    needsTimeSyncedRosters
      ? getTimeSyncedRoster(match.coach2SeasonId, match.week, coach2?.rosters || [])
      : Promise.resolve(null),
    getSiteSetting(getMatchDecidingTurnsEditorHiddenKey(match.id)),
  ]);

  const victoryAnimItem = storeItemsList.find(i => i.slug === "victory-animation");
  const blueTeamItem = storeItemsList.find(i => i.slug === "blue-team");
  const redTeamItem = storeItemsList.find(i => i.slug === "red-team");

  // Check if winner has victory animation purchase
  let showVictoryAnimation = false;
  if (isPlayed && winnerCoachId && victoryAnimItem) {
    showVictoryAnimation = allPurchases.some(
      p => p.coachId === winnerCoachId && p.itemId === victoryAnimItem.id
    );
  }

  // Determine team colors based on blue-team/red-team purchases
  const coach1BlueTeam = blueTeamItem && allPurchases.some(p => p.coachId === coach1?.coachId && p.itemId === blueTeamItem.id);
  const coach1RedTeam = redTeamItem && allPurchases.some(p => p.coachId === coach1?.coachId && p.itemId === redTeamItem.id);
  const coach2BlueTeam = blueTeamItem && allPurchases.some(p => p.coachId === coach2?.coachId && p.itemId === blueTeamItem.id);
  const coach2RedTeam = redTeamItem && allPurchases.some(p => p.coachId === coach2?.coachId && p.itemId === redTeamItem.id);

  // Apply same logic as matchup-prep: determine if coach1 should be blue or red
  // Default: coach1 = blue, coach2 = red
  // If coach1 wants red OR coach2 wants blue → swap (coach1 = red, coach2 = blue)
  let coach1IsBlue = true;
  if ((coach1BlueTeam && coach2BlueTeam) || (coach1RedTeam && coach2RedTeam)) {
    // Conflict: both want the same side → default behavior
    coach1IsBlue = true;
  } else if (coach1RedTeam || coach2BlueTeam) {
    // Swap: coach1 becomes red, coach2 becomes blue
    coach1IsBlue = false;
  }
  const priceMap = new Map(
    pokemonPrices.map((pp) => [pp.pokemonId, { basePrice: pp.price, teraCaptainCost: pp.teraCaptainCost }])
  );

  // Determine if current user can edit the schedule
  const canEditSchedule = !isPlayed && (
    session?.isMod ||
    (session?.type === "coach" && (session.id === coach1?.coachId || session.id === coach2?.coachId))
  );
  const showBattleSummaryOnly =
    match.id === 2778 ||
    (isPlayed && (match.season?.seasonNumber ?? 0) >= 11);
  const decidingTurnsEditorHidden = decidingTurnsEditorHiddenSetting?.value === "true";

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Victory Animation */}
      {showVictoryAnimation && (
        <VictoryAnimation winnerSide={coach1Won ? "left" : "right"} />
      )}

      <div className="flex justify-end">
        <ShareButton
          title={`${coach1?.teamName ?? "PBO"} vs ${coach2?.teamName ?? "PBO"}`}
          text={`${match.season?.name ?? "PBO"} · ${match.division?.name ?? "Division"} · ${getWeekLabel(match.week)}`}
          path={`/matches/${match.id}`}
          compact
        />
      </div>

      {/* The Season 11+ report uses the compact broadcast-style composition;
          older and upcoming matches retain the standard page heading. */}
      {!showBattleSummaryOnly && <div className="poke-card p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-6">
          <div className="min-w-0">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3 text-xs sm:text-sm flex-wrap">
              <Link href={`/seasons/${match.seasonId}`} className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors">
                {match.season?.name}
              </Link>
              <span className="text-[var(--foreground-subtle)]">/</span>
              <Link
                href={`/seasons/${match.seasonId}/divisions/${match.divisionId}`}
                className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors truncate"
              >
                {match.division?.name}
              </Link>
              <span className="text-[var(--foreground-subtle)]">/</span>
              <span className="text-[var(--foreground-subtle)]">{getWeekLabel(match.week)}</span>
            </div>

            {/* Title */}
            <h1 className="font-pixel text-base sm:text-xl md:text-2xl text-white leading-relaxed">
              {isPlayed ? "Match Results" : "Match Preview"}
            </h1>
          </div>

          {/* Status Badge */}
          <div className="flex items-center gap-2 shrink-0">
            {match.isForfeit && (
              <div className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-bold border-2 bg-[var(--error)]/20 text-[var(--error)] border-[var(--error)]/30">
                FORFEIT
              </div>
            )}
            <div className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-bold border-2 flex items-center gap-1.5 ${
              isPlayed
                ? "bg-[var(--success)]/20 text-[var(--success)] border-[var(--success)]/30"
                : isUnderway
                  ? "bg-[var(--error)]/20 text-[var(--error)] border-[var(--error)]/30"
                  : "bg-[var(--accent)]/20 text-[var(--accent)] border-[var(--accent)]/30"
            }`}>
              {isPlayed ? "COMPLETED" : isUnderway ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--error)] animate-pulse" />
                  LIVE
                </>
              ) : "UPCOMING"}
            </div>
            {!isPlayed && (
              <Link
                href={`/broadcast?matchId=${matchId}`}
                className="px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg border-2 border-[var(--foreground-subtle)]/30 text-[var(--foreground-subtle)] hover:text-[var(--foreground-muted)] hover:border-[var(--foreground-subtle)]/50 transition-colors flex items-center justify-center"
                title="Broadcast overlay"
              >
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </Link>
            )}
          </div>
        </div>
      </div>}

      {/* Match Header */}
      <div className="poke-card p-4 sm:p-6">
        <div className="flex flex-col items-center gap-4 sm:gap-6">

          {/* Teams */}
          <div className="w-full grid grid-cols-3 items-center gap-2 sm:gap-4">
            {/* Coach 1 */}
            <div className={`text-center ${coach1Won ? "opacity-100" : coach2Won ? "opacity-60" : ""}`}>
              <Link href={`/coaches/${coach1?.coachId}`} className="group">
                {coach1?.teamLogoUrl ? (
                  <div className="w-14 h-14 sm:w-20 sm:h-20 mx-auto mb-2 sm:mb-3 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] flex items-center justify-center overflow-hidden group-hover:border-[var(--primary)] transition-all">
                    <Image
                      src={coach1.teamLogoUrl}
                      alt={coach1.teamName}
                      width={80}
                      height={80}
                      className="object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-14 h-14 sm:w-20 sm:h-20 mx-auto mb-2 sm:mb-3 rounded-lg bg-[var(--primary)] border-2 border-[var(--background-tertiary)] flex items-center justify-center group-hover:border-[var(--primary)] transition-all">
                    <span className="text-white text-lg sm:text-2xl font-black">
                      {coach1?.teamAbbreviation || coach1?.teamName?.substring(0, 2).toUpperCase()}
                    </span>
                  </div>
                )}
                <h2 className="text-xs sm:text-lg font-bold group-hover:text-[var(--primary)] transition-colors truncate px-1">
                  {coach1?.teamName}
                </h2>
                <p className="text-[10px] sm:text-sm text-[var(--foreground-muted)] truncate">{coach1?.coach?.name}</p>
                {isPlayed && eloChanges.coach1 ? (
                  <div className="flex items-center justify-center gap-1 sm:gap-1.5 mt-1 flex-wrap">
                    <span className="text-[10px] sm:text-xs text-[var(--foreground-muted)]">
                      {eloChanges.coach1.before !== null ? Math.round(eloChanges.coach1.before) : "?"}
                    </span>
                    <span className="text-[10px] sm:text-xs text-[var(--foreground-muted)]">&rarr;</span>
                    <span className="text-[10px] sm:text-xs text-[var(--accent)] font-bold">
                      {Math.round(eloChanges.coach1.after)}
                    </span>
                    {eloChanges.coach1.delta !== null && (
                      <span className={`text-[10px] sm:text-xs font-bold ${eloChanges.coach1.delta >= 0 ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
                        ({eloChanges.coach1.delta >= 0 ? "+" : ""}{eloChanges.coach1.delta})
                      </span>
                    )}
                  </div>
                ) : coach1?.coach?.eloRating ? (
                  <div className="flex items-center justify-center gap-1.5 mt-1 text-[10px] sm:text-xs">
                    <span className="text-[var(--accent)] font-bold">{Math.round(coach1.coach.eloRating)} ELO</span>
                    {coach2?.coach?.eloRating && (() => {
                      const winProb = 1 / (1 + Math.pow(3, (coach2.coach.eloRating - coach1.coach.eloRating) / 400));
                      return (
                        <>
                          <span className="text-[var(--foreground-subtle)]">·</span>
                          <span className={winProb > 0.5 ? "text-[var(--success)] font-bold" : "text-[var(--foreground-muted)]"}>
                            {Math.round(winProb * 100)}% win
                          </span>
                        </>
                      );
                    })()}
                  </div>
                ) : null}
              </Link>
              {coach1Won && (
                <span className="inline-block mt-1.5 sm:mt-2 px-2 sm:px-3 py-0.5 sm:py-1 text-[8px] sm:text-[10px] font-bold rounded-lg bg-[var(--success)]/20 text-[var(--success)] border border-[var(--success)]/30 uppercase">
                  Winner
                </span>
              )}
            </div>

            {/* Score / VS */}
            <div className="text-center">
              {isPlayed ? (
                <div className="flex items-center justify-center gap-1.5 sm:gap-3">
                  <span className={`font-pixel text-2xl sm:text-3xl md:text-4xl ${coach1Won ? "text-[var(--success)]" : "text-[var(--foreground-muted)]"}`}>
                    {coach1Won ? Math.abs(match.coach1Differential || 0) : 0}
                  </span>
                  <span className="text-base sm:text-xl text-[var(--foreground-subtle)]">-</span>
                  <span className={`font-pixel text-2xl sm:text-3xl md:text-4xl ${coach2Won ? "text-[var(--success)]" : "text-[var(--foreground-muted)]"}`}>
                    {coach2Won ? Math.abs(match.coach2Differential || 0) : 0}
                  </span>
                </div>
              ) : (
                <div className="font-pixel text-lg sm:text-2xl text-[var(--foreground-muted)]">VS</div>
              )}
              <p className="text-[10px] sm:text-xs text-[var(--foreground-muted)] mt-1.5 sm:mt-2 uppercase font-bold">
                {getWeekLabel(match.week)}
              </p>
              {/* Match Duration */}
              {match.startedAt && match.endedAt && (() => {
                const start = new Date(match.startedAt);
                const end = new Date(match.endedAt);
                const durationMs = end.getTime() - start.getTime();
                const durationMins = Math.round(durationMs / 60000);
                if (durationMins > 0) {
                  return (
                    <p className="text-[10px] sm:text-xs text-[var(--foreground-subtle)] mt-1">
                      Duration: {durationMins} min
                    </p>
                  );
                }
                return null;
              })()}
              {/* Scheduled Time (upcoming matches only) */}
              {!isPlayed && (
                <ScheduleEditor
                  matchId={matchId}
                  scheduledAt={match.scheduledAt ?? null}
                  canEdit={!!canEditSchedule}
                />
              )}
              {(match.replayUrl || !isPlayed) && (
                <div className="flex flex-wrap items-center justify-center gap-2 mt-2 sm:mt-3">
                  {match.replayUrl && (
                    <a
                      href={match.replayUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 text-[9px] sm:text-[10px] font-bold rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-colors uppercase"
                    >
                      <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="hidden sm:inline">Watch </span>Replay
                    </a>
                  )}
                  {!isPlayed && (
                    <>
                      <Link
                        href={`/matchup-prep?matchId=${matchId}`}
                        className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 text-[9px] sm:text-[10px] font-bold rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 hover:bg-[var(--accent)]/30 transition-colors uppercase"
                      >
                        <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                        </svg>
                        <span className="hidden sm:inline">Matchup </span>Prep
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Coach 2 */}
            <div className={`text-center ${coach2Won ? "opacity-100" : coach1Won ? "opacity-60" : ""}`}>
              <Link href={`/coaches/${coach2?.coachId}`} className="group">
                {coach2?.teamLogoUrl ? (
                  <div className="w-14 h-14 sm:w-20 sm:h-20 mx-auto mb-2 sm:mb-3 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] flex items-center justify-center overflow-hidden group-hover:border-[var(--primary)] transition-all">
                    <Image
                      src={coach2.teamLogoUrl}
                      alt={coach2.teamName}
                      width={80}
                      height={80}
                      className="object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-14 h-14 sm:w-20 sm:h-20 mx-auto mb-2 sm:mb-3 rounded-lg bg-[var(--primary)] border-2 border-[var(--background-tertiary)] flex items-center justify-center group-hover:border-[var(--primary)] transition-all">
                    <span className="text-white text-lg sm:text-2xl font-black">
                      {coach2?.teamAbbreviation || coach2?.teamName?.substring(0, 2).toUpperCase()}
                    </span>
                  </div>
                )}
                <h2 className="text-xs sm:text-lg font-bold group-hover:text-[var(--primary)] transition-colors truncate px-1">
                  {coach2?.teamName}
                </h2>
                <p className="text-[10px] sm:text-sm text-[var(--foreground-muted)] truncate">{coach2?.coach?.name}</p>
                {isPlayed && eloChanges.coach2 ? (
                  <div className="flex items-center justify-center gap-1 sm:gap-1.5 mt-1 flex-wrap">
                    <span className="text-[10px] sm:text-xs text-[var(--foreground-muted)]">
                      {eloChanges.coach2.before !== null ? Math.round(eloChanges.coach2.before) : "?"}
                    </span>
                    <span className="text-[10px] sm:text-xs text-[var(--foreground-muted)]">&rarr;</span>
                    <span className="text-[10px] sm:text-xs text-[var(--accent)] font-bold">
                      {Math.round(eloChanges.coach2.after)}
                    </span>
                    {eloChanges.coach2.delta !== null && (
                      <span className={`text-[10px] sm:text-xs font-bold ${eloChanges.coach2.delta >= 0 ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
                        ({eloChanges.coach2.delta >= 0 ? "+" : ""}{eloChanges.coach2.delta})
                      </span>
                    )}
                  </div>
                ) : coach2?.coach?.eloRating ? (
                  <div className="flex items-center justify-center gap-1.5 mt-1 text-[10px] sm:text-xs">
                    <span className="text-[var(--accent)] font-bold">{Math.round(coach2.coach.eloRating)} ELO</span>
                    {coach1?.coach?.eloRating && (() => {
                      const winProb = 1 / (1 + Math.pow(3, (coach1.coach.eloRating - coach2.coach.eloRating) / 400));
                      return (
                        <>
                          <span className="text-[var(--foreground-subtle)]">·</span>
                          <span className={winProb > 0.5 ? "text-[var(--success)] font-bold" : "text-[var(--foreground-muted)]"}>
                            {Math.round(winProb * 100)}% win
                          </span>
                        </>
                      );
                    })()}
                  </div>
                ) : null}
              </Link>
              {coach2Won && (
                <span className="inline-block mt-1.5 sm:mt-2 px-2 sm:px-3 py-0.5 sm:py-1 text-[8px] sm:text-[10px] font-bold rounded-lg bg-[var(--success)]/20 text-[var(--success)] border border-[var(--success)]/30 uppercase">
                  Winner
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Match Content */}
      {isPlayed ? (
        <>
          {showBattleSummaryOnly && (() => {
            return (
              <BattleSummaryPanel
                coach1Name={coach1?.teamName || "Gotham City Golbats"}
                coach2Name={coach2?.teamName || "Long Island Tyranitars"}
                coach1LogoUrl={coach1?.teamLogoUrl}
                coach2LogoUrl={coach2?.teamLogoUrl}
                coach1Pokemon={coach1MatchPokemon}
                coach2Pokemon={coach2MatchPokemon}
                decidingTurnsText={match.decidingTurnsText}
                decidingTurnsEditorHidden={decidingTurnsEditorHidden}
                canEditDecidingTurns={Boolean(session?.isMod || session?.isEditor)}
                canManageDecidingTurnsEditorVisibility={Boolean(session?.isMod)}
                matchId={match.id}
              />
            );
          })()}

          {/* Played Match - Show Pokemon Stats */}
          {!showBattleSummaryOnly && (() => {
            const team1Color = coach1IsBlue ? "#3b82f6" : "#ef4444";
            const team2Color = coach1IsBlue ? "#ef4444" : "#3b82f6";
            return (
              <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
                {/* Coach 1 Pokemon */}
                <div className="poke-card p-0 overflow-hidden">
                  <div className="p-3 sm:p-4 border-b-2 border-[var(--background-tertiary)] flex items-center justify-between">
                    <span className="font-bold text-white text-sm sm:text-base truncate">{coach1?.teamAbbreviation || coach1?.teamName}</span>
                    <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm font-mono shrink-0">
                      <span className="text-[var(--success)] font-bold">{coach1Kills} K</span>
                      <span className="text-[var(--error)] font-bold">{coach1Deaths} D</span>
                    </div>
                  </div>
                  <div className="p-3 sm:p-4 space-y-1.5">
                    {coach1MatchPokemon.length > 0 ? (
                      coach1MatchPokemon.map((mp) => (
                        <ExpandablePokemonCard key={mp.id} pokemon={mp} teamColor={team1Color} />
                      ))
                    ) : (
                      <p className="text-[var(--foreground-muted)] text-center py-4 text-sm">No Pokemon data</p>
                    )}
                  </div>
                </div>

                {/* Coach 2 Pokemon */}
                <div className="poke-card p-0 overflow-hidden">
                  <div className="p-3 sm:p-4 border-b-2 border-[var(--background-tertiary)] flex items-center justify-between">
                    <span className="font-bold text-white text-sm sm:text-base truncate">{coach2?.teamAbbreviation || coach2?.teamName}</span>
                    <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm font-mono shrink-0">
                      <span className="text-[var(--success)] font-bold">{coach2Kills} K</span>
                      <span className="text-[var(--error)] font-bold">{coach2Deaths} D</span>
                    </div>
                  </div>
                  <div className="p-3 sm:p-4 space-y-1.5">
                    {coach2MatchPokemon.length > 0 ? (
                      coach2MatchPokemon.map((mp) => (
                        <ExpandablePokemonCard key={mp.id} pokemon={mp} teamColor={team2Color} />
                      ))
                    ) : (
                      <p className="text-[var(--foreground-muted)] text-center py-4 text-sm">No Pokemon data</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Key Events Timeline */}
          {!showBattleSummaryOnly && match.keyEvents && (() => {
            const keyEvents = JSON.parse(match.keyEvents) as MatchKeyEvent[];
            if (keyEvents.length === 0) return null;

            // Infer p1IsCoach1 from the win event
            const winEvent = keyEvents.find(e => e.type === "win");
            let p1IsCoach1 = true; // default
            if (winEvent && match.winnerId) {
              const p1Won = winEvent.player === "p1";
              const coach1Won = match.winnerId === match.coach1SeasonId;
              p1IsCoach1 = p1Won === coach1Won;
            }

            // Helper to get team info for a player
            const getTeamInfo = (player: "p1" | "p2") => {
              const isCoach1 = (player === "p1") === p1IsCoach1;
              const name = isCoach1 ? (coach1?.teamName || "Team 1") : (coach2?.teamName || "Team 2");
              // Apply team color based on purchases: coach1IsBlue determines if coach1 is blue or red
              const isBlue = isCoach1 ? coach1IsBlue : !coach1IsBlue;
              return {
                name,
                possessive: name.endsWith("s") ? "'" : "'s", // "Alakazams'" vs "Team 1's"
                color: isBlue ? "#3b82f6" : "#ef4444",
                isCoach1,
              };
            };

            return (
              <div className="poke-card p-0 overflow-hidden">
                <div className="p-3 sm:p-4 border-b-2 border-[var(--background-tertiary)]">
                  <span className="font-bold text-white text-sm sm:text-base">Key Events</span>
                </div>
                <div className="p-3 sm:p-4 space-y-1.5">
                  {keyEvents.map((event, index) => {
                    const team = getTeamInfo(event.player);
                    const killerTeam = event.killerPlayer ? getTeamInfo(event.killerPlayer) : null;

                    if (event.type === "win") {
                      return (
                        <div
                          key={index}
                          className="flex items-center gap-3 px-3 py-2 rounded bg-[var(--background-tertiary)]"
                          style={{ borderLeft: `3px solid ${team.color}` }}
                        >
                          <span className="text-[10px] sm:text-xs font-bold text-[var(--foreground-muted)] w-8 shrink-0 font-mono">GG</span>
                          <span className="text-xs sm:text-sm">
                            <span className="font-bold" style={{ color: team.color }}>{team.name}</span>
                            <span className="text-[var(--foreground-muted)]"> wins!</span>
                          </span>
                        </div>
                      );
                    }

                    // Faint event - row color indicates who got the kill
                    const rowColor = killerTeam ? killerTeam.color : team.color;

                    return (
                      <div
                        key={index}
                        className="flex items-center gap-3 px-3 py-2 rounded bg-[var(--background-tertiary)]"
                        style={{ borderLeft: `3px solid ${rowColor}` }}
                      >
                        <span className="text-[10px] sm:text-xs font-bold text-[var(--foreground-muted)] w-8 shrink-0 font-mono">T{event.turn}</span>
                        <span className="text-xs sm:text-sm">
                          <span className="font-bold" style={{ color: team.color }}>{team.name}</span>
                          <span className="text-[var(--foreground-muted)]">{team.possessive} </span>
                          <span className="text-white font-medium">{event.pokemon}</span>
                          <span className="text-[var(--foreground-muted)]"> fainted</span>
                          {event.move && killerTeam && (
                            <>
                              <span className="text-[var(--foreground-muted)]"> from </span>
                              <span className="text-white">{event.move}</span>
                              <span className="text-[var(--foreground-muted)]"> by </span>
                              <span className="font-bold" style={{ color: killerTeam.color }}>{killerTeam.name}</span>
                              <span className="text-[var(--foreground-muted)]">{killerTeam.possessive} </span>
                              <span className="text-white font-medium">{event.killer}</span>
                            </>
                          )}
                          {event.cause && !event.move && (
                            <>
                              <span className="text-[var(--foreground-muted)]"> from </span>
                              <span className="text-white">{event.cause}</span>
                              {killerTeam && event.killer && (
                                <>
                                  <span className="text-[var(--foreground-muted)]"> by </span>
                                  <span className="font-bold" style={{ color: killerTeam.color }}>{killerTeam.name}</span>
                                  <span className="text-[var(--foreground-muted)]">{killerTeam.possessive} </span>
                                  <span className="text-white font-medium">{event.killer}</span>
                                </>
                              )}
                            </>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* HP Chart */}
          {match.turnSnapshots && (() => {
            interface TurnSnapshot {
              turn: number;
              p1TotalHp: number;
              p2TotalHp: number;
            }
            interface KeyEventForChart {
              turn: number;
              type: "faint" | "win";
              player: "p1" | "p2";
              pokemon?: string;
              killer?: string;
              killerPlayer?: "p1" | "p2";
            }
            const turnSnapshots = JSON.parse(match.turnSnapshots) as TurnSnapshot[];
            if (turnSnapshots.length === 0) return null;

            // Parse key events for chart markers
            const keyEventsForChart: KeyEventForChart[] = match.keyEvents
              ? JSON.parse(match.keyEvents)
              : [];

            // Infer p1IsCoach1 from key events win event (same logic as above)
            let p1IsCoach1 = true;
            const winEvent = keyEventsForChart.find(e => e.type === "win");
            if (winEvent && match.winnerId) {
              const p1Won = winEvent.player === "p1";
              const coach1Won = match.winnerId === match.coach1SeasonId;
              p1IsCoach1 = p1Won === coach1Won;
            }

            const team1Name = coach1?.teamName || "Team 1";
            const team2Name = coach2?.teamName || "Team 2";
            const team1Color = coach1IsBlue ? "#3b82f6" : "#ef4444";
            const team2Color = coach1IsBlue ? "#ef4444" : "#3b82f6";

            return (
              <div className="poke-card p-0 overflow-hidden">
                <div className="p-3 sm:p-4 border-b-2 border-[var(--background-tertiary)]">
                  <span className="font-bold text-white text-sm sm:text-base">HP Over Time</span>
                </div>
                <div className="p-3 sm:p-4">
                  <HpChart
                    turnSnapshots={turnSnapshots}
                    keyEvents={keyEventsForChart}
                    team1Name={team1Name}
                    team2Name={team2Name}
                    team1Color={team1Color}
                    team2Color={team2Color}
                    p1IsCoach1={p1IsCoach1}
                  />
                </div>
              </div>
            );
          })()}

          {/* Zoroark Warning */}
          {match.zoroarkInvolved && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-[var(--warning)]/10 border border-[var(--warning)]/30">
              <svg className="w-5 h-5 text-[var(--warning)] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="text-sm">
                <span className="font-bold text-[var(--warning)]">Zoroark detected</span>
                <span className="text-[var(--foreground-muted)]"> — Stats may be inaccurate due to Illusion ability disguising Pokemon identities during battle.</span>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Upcoming Match - Preview with Full Rosters (time-synced) */
        coach1 && coach2 && coach1TimeSyncedRoster && coach2TimeSyncedRoster && (
          <MatchPreview
            team1={{
              teamName: coach1.teamName,
              teamAbbreviation: coach1.teamAbbreviation,
              rosters: coach1TimeSyncedRoster.filteredRosters,
              droppedPokemon: coach1TimeSyncedRoster.droppedPokemonDetails,
            }}
            team2={{
              teamName: coach2.teamName,
              teamAbbreviation: coach2.teamAbbreviation,
              rosters: coach2TimeSyncedRoster.filteredRosters,
              droppedPokemon: coach2TimeSyncedRoster.droppedPokemonDetails,
            }}
            priceMap={priceMap}
          />
        )
      )}
    </div>
  );
}
