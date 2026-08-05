"use client";

import { useState, useEffect, useCallback, Fragment, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { AuthModal } from "@/components/auth-modal";
import { StoreModal } from "@/components/store-modal";
import { MobileTooltip } from "@/components/mobile-tooltip";
import { compareDivisions } from "@/lib/division-order";
import type { CoachOption } from "./page";

interface Season {
  id: number;
  name: string;
  seasonNumber: number;
  isSchedulePublic: boolean;
}

interface PickEmsClientProps {
  season: Season;
  coachOptions: CoachOption[];
}

interface Participant {
  id: number;
  name: string;
  seasonId: number;
  coachId: number | null;
}

interface AuthUser {
  type: "coach" | "spectator";
  id: number;
  name: string;
  isMod: boolean;
}

interface Standing {
  position: number;
  wins: number;
  losses: number;
  diff: number;
}

interface Match {
  id: number;
  week: number;
  winnerId: number | null;
  scheduledAt: string | null;
  isGameOfTheWeek: boolean;
  division: { id: number; name: string; displayOrder?: number };
  coach1: {
    id: number;
    teamName: string;
    teamAbbreviation: string | null;
    teamLogoUrl: string | null;
    coach: { id: number; name: string; eloRating: number };
  };
  coach2: {
    id: number;
    teamName: string;
    teamAbbreviation: string | null;
    teamLogoUrl: string | null;
    coach: { id: number; name: string; eloRating: number };
  };
  coach1Standing: Standing;
  coach2Standing: Standing;
  // Prior ELO for completed matches (ELO before the match was played)
  coach1EloBefore: number | null;
  coach2EloBefore: number | null;
}

interface Week {
  week: number;
  matches: Match[];
}

interface LeaderboardEntry {
  id: number;
  name: string;
  coachId: number | null;
  coachName: string | null;
  correct: number;
  total: number;
  pending: number;
  accuracy: number;
  rewards: number;
  rewardsByWeek: Record<number, number>;
  rewardsByDivision: Record<number, number>;
  rewardsByWeekAndDivision: Record<string, number>;
}

interface BettingLeaderboardEntry {
  bettorId: number;
  bettorType: "coach" | "spectator";
  bettorName: string;
  totalCoins: number;
  betsPlaced: number;
  betsWon: number;
  betsLost: number;
  betsPending: number;
  coinsWagered: number;
  coinsWon: number;
  coinsLost: number;
  profit: number;
}

interface RawBet {
  id: number;
  matchId: number;
  predictedWinnerId: number;
  bettorId: number;
  bettorType: "coach" | "spectator";
  bettorName: string;
  totalCoins: number;
  amount: number;
  odds: number;
  status: string;
  payout: number | null;
}

interface RawKillBet {
  id: number;
  matchId: number;
  pokemonId: number;
  pokemonName: string;
  seasonCoachId: number;
  killThreshold: number;
  betType: string;
  bettorId: number;
  bettorType: "coach" | "spectator";
  bettorName: string;
  totalCoins: number;
  amount: number;
  odds: number;
  status: string;
  payout: number | null;
}

interface RawDeathBet {
  id: number;
  matchId: number;
  pokemonId: number;
  pokemonName: string;
  seasonCoachId: number;
  betType: string;
  bettorId: number;
  bettorType: "coach" | "spectator";
  bettorName: string;
  totalCoins: number;
  amount: number;
  odds: number;
  status: string;
  payout: number | null;
}

interface Pick {
  matchId: number;
  predictedWinnerId: number;
}

interface Bet {
  id: number;
  matchId: number;
  predictedWinnerId: number;
  amount: number;
  odds: number;
  status: "pending" | "won" | "lost" | "refunded";
  payout: number | null;
}

interface KillBet {
  id: number;
  matchId: number;
  pokemonId: number;
  seasonCoachId: number;
  killThreshold: number;
  betType: "over" | "under";
  amount: number;
  odds: number;
  status: "pending" | "won" | "lost" | "refunded";
  payout: number | null;
  actualKills: number | null;
  pokemon?: {
    name: string;
    displayName: string | null;
    spriteUrl: string | null;
  };
}

interface DeathBet {
  id: number;
  matchId: number;
  pokemonId: number;
  seasonCoachId: number;
  betType: "dies" | "survives";
  amount: number;
  odds: number;
  status: "pending" | "won" | "lost" | "refunded";
  payout: number | null;
  actualDied: number | null;
  wasBrought: number | null;
  pokemon?: {
    name: string;
    displayName: string | null;
    spriteUrl: string | null;
  };
}

interface BettingState {
  bets: Bet[];
  killBets: KillBet[];
  deathBets: DeathBet[];
  balance: number;
  totalPending: number;
  availableBalance: number;
}

interface PickStats {
  coach1Picks: number;
  coach2Picks: number;
  totalPicks: number;
}

interface MatchMetadata {
  week: number;
  divisionId: number;
  winnerId: number | null;
}

interface ParticipantPick {
  matchId: number;
  predictedWinnerId: number;
}

function getWeekLabel(week: number): string {
  if (week === 101) return "Quarterfinals";
  if (week === 102) return "Semifinals";
  if (week === 103) return "Finals";
  return `Week ${week}`;
}

function TeamLogo({ url, teamName, size = 32 }: { url: string | null; teamName: string; size?: number }) {
  const [error, setError] = useState(false);

  if (!url || error) {
    return (
      <div
        className="rounded-full bg-[var(--background-tertiary)] flex items-center justify-center text-xs font-bold text-[var(--foreground-muted)]"
        style={{ width: size, height: size }}
      >
        {teamName.charAt(0)}
      </div>
    );
  }

  return (
    <Image
      src={url}
      alt={teamName}
      width={size}
      height={size}
      className="rounded-full"
      onError={() => setError(true)}
    />
  );
}

export function PickEmsClient({ season, coachOptions }: PickEmsClientProps) {
  // Auth state
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showStoreModal, setShowStoreModal] = useState(false);

  // Pick-ems state
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [myPicks, setMyPicks] = useState<Pick[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [bettingLeaderboard, setBettingLeaderboard] = useState<BettingLeaderboardEntry[]>([]);
  const [allBetsData, setAllBetsData] = useState<RawBet[]>([]);
  const [allKillBetsData, setAllKillBetsData] = useState<RawKillBet[]>([]);
  const [allDeathBetsData, setAllDeathBetsData] = useState<RawDeathBet[]>([]);
  const [bettingSettings, setBettingSettings] = useState<{ bettingClosed: boolean; bettingUiHidden: boolean }>({
    bettingClosed: false,
    bettingUiHidden: false,
  });
  const [leaderboardMode, setLeaderboardMode] = useState<"picks" | "betting">("picks");
  const [pickStats, setPickStats] = useState<Record<number, PickStats>>({});
  const [matchMetadata, setMatchMetadata] = useState<Record<number, MatchMetadata>>({});
  const [participantPicks, setParticipantPicks] = useState<Record<number, ParticipantPick[]>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Match pickers state (on-demand loading)
  const [showPickersForMatch, setShowPickersForMatch] = useState<number | null>(null);
  const [matchPickers, setMatchPickers] = useState<Record<number, {
    coach1Pickers: { id: number; name: string; coachId: number | null }[];
    coach2Pickers: { id: number; name: string; coachId: number | null }[];
  }>>({});
  const [loadingPickers, setLoadingPickers] = useState<number | null>(null);

  // Local picks state (before submission)
  const [localPicks, setLocalPicks] = useState<Map<number, number>>(new Map());

  // Betting state
  const [betting, setBetting] = useState<BettingState>({
    bets: [],
    killBets: [],
    deathBets: [],
    balance: 0,
    totalPending: 0,
    availableBalance: 0,
  });
  const [localBets, setLocalBets] = useState<Map<number, { amount: number; winnerId: number }>>(new Map());
  const [bettingOnMatch, setBettingOnMatch] = useState<number | null>(null);
  const [betErrorMatchId, setBetErrorMatchId] = useState<number | null>(null);

  // Kill bet state
  interface KillBetPokemon {
    pokemonId: number;
    pokemonName: string;
    displayName: string | null;
    spriteUrl: string | null;
    seasonCoachId: number;
    teamName: string;
    teamAbbreviation: string | null;
    expectedKills: number;
    thresholds: { threshold: number; overOdds: number; underOdds: number }[];
  }
  const [killBetOdds, setKillBetOdds] = useState<Map<number, KillBetPokemon[]>>(new Map()); // matchId -> pokemon list
  const [killBetLoading, setKillBetLoading] = useState<Set<number>>(new Set());
  const [localKillBets, setLocalKillBets] = useState<Map<number, { pokemonId: number; threshold: number; amount: number }[]>>(new Map());
  const [killBetError, setKillBetError] = useState<string | null>(null);
  const [killBetErrorMatchId, setKillBetErrorMatchId] = useState<number | null>(null);

  // Death bet state
  interface DeathBetPokemon {
    pokemonId: number;
    pokemonName: string;
    displayName: string | null;
    spriteUrl: string | null;
    seasonCoachId: number;
    teamName: string;
    teamAbbreviation: string | null;
    expectedDeathRate: number;
    broughtRate: number;
    diesOdds: number;
    survivesOdds: number;
  }
  const [deathBetOdds, setDeathBetOdds] = useState<Map<number, DeathBetPokemon[]>>(new Map()); // matchId -> pokemon list
  const [deathBetLoading, setDeathBetLoading] = useState<Set<number>>(new Set());
  const [localDeathBets, setLocalDeathBets] = useState<Map<number, { pokemonId: number; betType: "dies" | "survives"; amount: number }[]>>(new Map());
  const [deathBetError, setDeathBetError] = useState<string | null>(null);
  const [deathBetErrorMatchId, setDeathBetErrorMatchId] = useState<number | null>(null);

  // Add bet type selector state (matchId -> showing selector)
  const [showAddBetSelector, setShowAddBetSelector] = useState<number | null>(null);

  // Week filter (for picks section)
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  // Division filter (for picks section)
  const [selectedDivision, setSelectedDivision] = useState<number | null>(null);

  // Leaderboard filters (picks)
  const [leaderboardWeek, setLeaderboardWeek] = useState<number | null>(null); // null = full season
  const [leaderboardDivision, setLeaderboardDivision] = useState<number | null>(null); // null = all divisions

  // Leaderboard filters (betting)
  const [bettingLeaderboardWeek, setBettingLeaderboardWeek] = useState<number | null>(null);
  const [bettingLeaderboardDivision, setBettingLeaderboardDivision] = useState<number | null>(null);

  // Leaderboard sorting
  type PicksSortColumn = "correct" | "total" | "pending" | "accuracy" | "name" | "rewards";
  type BettingSortColumn = "profit" | "betsWon" | "betsLost" | "coinsWagered" | "totalCoins" | "bettorName";
  const [picksSortColumn, setPicksSortColumn] = useState<PicksSortColumn>("correct");
  const [picksSortDir, setPicksSortDir] = useState<"asc" | "desc">("desc");
  const [bettingSortColumn, setBettingSortColumn] = useState<BettingSortColumn>("profit");
  const [bettingSortDir, setBettingSortDir] = useState<"asc" | "desc">("desc");

  // Expanded bettor row (for viewing individual bets)
  const [expandedBettor, setExpandedBettor] = useState<string | null>(null); // "coach-1" or "spectator-2"

  // Check authentication on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (data.user) {
          setAuthUser(data.user);
        } else {
          setShowAuthModal(true);
        }
      } catch {
        setShowAuthModal(true);
      } finally {
        setAuthLoading(false);
      }
    }
    checkAuth();
  }, []);

  // Once authenticated, get or create participant for this season
  useEffect(() => {
    if (!authUser) return;

    // Capture authUser so TypeScript knows it won't be null in the async function
    const currentUser = authUser;

    async function getOrCreateParticipant() {
      try {
        // Try to find existing participant
        const res = await fetch(`/api/pick-ems/participants?seasonId=${season.id}&authUserId=${currentUser.id}&authUserType=${currentUser.type}`);
        const data = await res.json();

        if (data.participant) {
          setParticipant(data.participant);
        } else {
          // Create new participant
          const createRes = await fetch("/api/pick-ems/participants", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: currentUser.name,
              seasonId: season.id,
              coachId: currentUser.type === "coach" ? currentUser.id : undefined,
              userId: currentUser.type === "spectator" ? currentUser.id : undefined,
            }),
          });
          const createData = await createRes.json();
          if (!createData.error) {
            setParticipant(createData);
          }
        }
      } catch (err) {
        console.error("Failed to get/create participant:", err);
      }
    }

    getOrCreateParticipant();
  }, [authUser, season.id]);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const url = new URL("/api/pick-ems", window.location.origin);
      url.searchParams.set("seasonId", season.id.toString());
      if (participant) {
        url.searchParams.set("participantId", participant.id.toString());
      }

      const res = await fetch(url.toString());
      const data = await res.json();

      setWeeks(data.weeks || []);
      setMyPicks(data.myPicks || []);
      setLeaderboard(data.leaderboard || []);
      setBettingLeaderboard(data.bettingLeaderboard || []);
      setAllBetsData(data.allBets || []);
      setAllKillBetsData(data.allKillBets || []);
      setAllDeathBetsData(data.allDeathBets || []);
      setPickStats(data.pickStats || {});
      setMatchMetadata(data.matchMetadata || {});
      setParticipantPicks(data.participantPicks || {});
      if (data.bettingSettings) {
        setBettingSettings(data.bettingSettings);
      }

      // Initialize local picks from server picks
      const picksMap = new Map<number, number>();
      for (const pick of data.myPicks || []) {
        picksMap.set(pick.matchId, pick.predictedWinnerId);
      }
      setLocalPicks(picksMap);
    } catch (err) {
      setError("Failed to load pick-ems data");
    } finally {
      setLoading(false);
    }
  }, [season.id, participant]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch betting data
  const fetchBets = useCallback(async () => {
    if (!authUser) return;

    try {
      const [betsRes, killBetsRes, deathBetsRes] = await Promise.all([
        fetch("/api/bets?status=all"),
        fetch("/api/kill-bets"),
        fetch("/api/death-bets"),
      ]);
      const betsData = await betsRes.json();
      const killBetsData = await killBetsRes.json();
      const deathBetsData = await deathBetsRes.json();
      setBetting({
        bets: betsData.bets || [],
        killBets: killBetsData.bets || [],
        deathBets: deathBetsData.bets || [],
        balance: betsData.balance || 0,
        totalPending: betsData.totalPending || 0,
        availableBalance: betsData.availableBalance || 0,
      });
    } catch (err) {
      console.error("Failed to fetch bets:", err);
    }
  }, [authUser]);

  useEffect(() => {
    if (authUser) {
      fetchBets();
    }
  }, [authUser, fetchBets]);


  // Submit picks
  async function submitPicks() {
    if (!participant) return;

    const now = Date.now();

    // Get all pickable match IDs (incomplete and not underway)
    const pickableMatchIds = new Set<number>();
    for (const week of weeks) {
      for (const match of week.matches) {
        const isUnderway = match.winnerId === null && match.scheduledAt && new Date(match.scheduledAt).getTime() <= now;
        if (match.winnerId === null && !isUnderway) {
          pickableMatchIds.add(match.id);
        }
      }
    }

    // Only submit picks for pickable matches that have changed
    const serverPicksMap = new Map(myPicks.map((p) => [p.matchId, p.predictedWinnerId]));
    const picks = Array.from(localPicks.entries())
      .filter(([matchId, predictedWinnerId]) => {
        // Only include if match is pickable AND pick has changed
        return pickableMatchIds.has(matchId) && serverPicksMap.get(matchId) !== predictedWinnerId;
      })
      .map(([matchId, predictedWinnerId]) => ({
        matchId,
        predictedWinnerId,
      }));

    if (picks.length === 0) {
      setError("No new picks to submit");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/pick-ems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: participant.id,
          picks,
        }),
      });

      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }

      // Refresh data
      await fetchData();
    } catch (err) {
      setError("Failed to submit picks");
    } finally {
      setSubmitting(false);
    }
  }

  function handlePick(matchId: number, winnerId: number) {
    setLocalPicks((prev) => {
      const next = new Map(prev);
      next.set(matchId, winnerId);
      return next;
    });
  }

  // Betting functions
  async function placeBet(matchId: number, predictedWinnerId: number, amount: number) {
    if (amount < 1 || amount > betting.availableBalance) return;

    try {
      const res = await fetch("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, predictedWinnerId, amount }),
      });

      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }

      // Refresh betting data - don't close dropdown so user can still place kill bets
      await fetchBets();
      setLocalBets((prev) => {
        const next = new Map(prev);
        next.delete(matchId);
        return next;
      });
    } catch (err) {
      setError("Failed to place bet");
    }
  }

  async function cancelBet(betId: number) {
    try {
      const res = await fetch(`/api/bets?id=${betId}`, { method: "DELETE" });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      await fetchBets();
    } catch (err) {
      setError("Failed to cancel bet");
    }
  }

  async function cancelKillBet(betId: number) {
    try {
      const res = await fetch(`/api/kill-bets?betId=${betId}`, { method: "DELETE" });
      const data = await res.json();

      if (data.error) {
        setKillBetError(data.error);
        setKillBetErrorMatchId(null);
        return;
      }

      await fetchBets();
    } catch (err) {
      setKillBetError("Failed to cancel kill bet");
    }
  }

  async function cancelDeathBet(betId: number) {
    try {
      const res = await fetch(`/api/death-bets?betId=${betId}`, { method: "DELETE" });
      const data = await res.json();

      if (data.error) {
        setDeathBetError(data.error);
        setDeathBetErrorMatchId(null);
        return;
      }

      await fetchBets();
    } catch (err) {
      setDeathBetError("Failed to cancel death bet");
    }
  }

  // Fetch match pickers (on demand, only for completed matches)
  async function fetchMatchPickers(matchId: number) {
    if (matchPickers[matchId] || loadingPickers === matchId) return;

    setLoadingPickers(matchId);
    try {
      const res = await fetch(`/api/pick-ems/match-pickers?matchId=${matchId}`);
      const data = await res.json();

      if (!data.error) {
        setMatchPickers((prev) => ({
          ...prev,
          [matchId]: {
            coach1Pickers: data.coach1Pickers,
            coach2Pickers: data.coach2Pickers,
          },
        }));
      }
    } catch (err) {
      console.error("Failed to fetch match pickers:", err);
    } finally {
      setLoadingPickers(null);
    }
  }

  // Fetch kill bet odds for a match (on demand)
  async function fetchKillBetOdds(matchId: number) {
    if (killBetOdds.has(matchId) || killBetLoading.has(matchId)) return;

    setKillBetLoading((prev) => new Set(prev).add(matchId));
    try {
      const res = await fetch(`/api/kill-bets/odds?matchId=${matchId}`);
      const data = await res.json();

      if (!data.error) {
        const allPokemon: KillBetPokemon[] = [
          ...data.coach1.pokemon.map((p: KillBetPokemon) => ({ ...p, teamName: data.coach1.teamName })),
          ...data.coach2.pokemon.map((p: KillBetPokemon) => ({ ...p, teamName: data.coach2.teamName })),
        ];
        setKillBetOdds((prev) => new Map(prev).set(matchId, allPokemon));
      }
    } catch (err) {
      console.error("Failed to fetch kill bet odds:", err);
    } finally {
      setKillBetLoading((prev) => {
        const next = new Set(prev);
        next.delete(matchId);
        return next;
      });
    }
  }

  async function placeKillBet(matchId: number, pokemonId: number, seasonCoachId: number, threshold: number, amount: number) {
    // Clear any previous error for this match
    setKillBetError(null);
    setKillBetErrorMatchId(null);

    if (amount < 1 || amount > betting.availableBalance) {
      setKillBetError("Invalid bet amount");
      setKillBetErrorMatchId(matchId);
      return;
    }

    try {
      const res = await fetch("/api/kill-bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId,
          pokemonId,
          seasonCoachId,
          killThreshold: threshold,
          betType: "over",
          amount,
        }),
      });

      const data = await res.json();
      if (data.error) {
        setKillBetError(data.error);
        setKillBetErrorMatchId(matchId);
        return;
      }

      // Refresh betting data
      await fetchBets();

      // Remove the placed bet slot from local state
      setLocalKillBets((prev) => {
        const next = new Map(prev);
        const slots = prev.get(matchId) || [];
        // Find and remove the slot that matches this bet
        const updatedSlots = slots.filter(s =>
          !(s.pokemonId === pokemonId && s.threshold === threshold && s.amount === amount)
        );
        next.set(matchId, updatedSlots);
        return next;
      });
    } catch (err) {
      setKillBetError("Failed to place kill bet");
      setKillBetErrorMatchId(matchId);
    }
  }

  // Fetch death bet odds for a match (on demand)
  async function fetchDeathBetOdds(matchId: number) {
    if (deathBetOdds.has(matchId) || deathBetLoading.has(matchId)) return;

    setDeathBetLoading((prev) => new Set(prev).add(matchId));
    try {
      const res = await fetch(`/api/death-bet-odds?matchId=${matchId}`);
      const data = await res.json();

      if (!data.error) {
        const allPokemon: DeathBetPokemon[] = [
          ...data.coach1.pokemon.map((p: DeathBetPokemon) => ({ ...p, teamName: data.coach1.teamName, teamAbbreviation: data.coach1.teamAbbreviation })),
          ...data.coach2.pokemon.map((p: DeathBetPokemon) => ({ ...p, teamName: data.coach2.teamName, teamAbbreviation: data.coach2.teamAbbreviation })),
        ];
        setDeathBetOdds((prev) => new Map(prev).set(matchId, allPokemon));
      }
    } catch (err) {
      console.error("Failed to fetch death bet odds:", err);
    } finally {
      setDeathBetLoading((prev) => {
        const next = new Set(prev);
        next.delete(matchId);
        return next;
      });
    }
  }

  async function placeDeathBet(matchId: number, pokemonId: number, seasonCoachId: number, betType: "dies" | "survives", amount: number) {
    // Clear any previous error for this match
    setDeathBetError(null);
    setDeathBetErrorMatchId(null);

    if (amount < 1 || amount > betting.availableBalance) {
      setDeathBetError("Invalid bet amount");
      setDeathBetErrorMatchId(matchId);
      return;
    }

    try {
      const res = await fetch("/api/death-bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId,
          pokemonId,
          seasonCoachId,
          betType,
          amount,
        }),
      });

      const data = await res.json();
      if (data.error) {
        setDeathBetError(data.error);
        setDeathBetErrorMatchId(matchId);
        return;
      }

      // Refresh betting data
      await fetchBets();

      // Remove the placed bet slot from local state
      setLocalDeathBets((prev) => {
        const next = new Map(prev);
        const slots = prev.get(matchId) || [];
        // Find and remove the slot that matches this bet
        const updatedSlots = slots.filter(s =>
          !(s.pokemonId === pokemonId && s.betType === betType && s.amount === amount)
        );
        next.set(matchId, updatedSlots);
        return next;
      });
    } catch (err) {
      setDeathBetError("Failed to place death bet");
      setDeathBetErrorMatchId(matchId);
    }
  }

  function calculateOdds(playerElo: number, opponentElo: number): number {
    const winProb = 1 / (1 + Math.pow(3, (opponentElo - playerElo) / 400));
    const fairOdds = 1 / winProb;
    const adjustedOdds = 1 + (fairOdds - 1) * 0.9; // 10% house edge
    return Math.max(1.05, Math.min(10, adjustedOdds));
  }

  // Check if there are unsaved changes (only for pickable matches - incomplete and not underway)
  const hasUnsavedChanges = (() => {
    const now = Date.now();
    // Get all pickable match IDs (incomplete and not underway)
    const pickableMatchIds = new Set<number>();
    for (const week of weeks) {
      for (const match of week.matches) {
        const isUnderway = match.winnerId === null && match.scheduledAt && new Date(match.scheduledAt).getTime() <= now;
        if (match.winnerId === null && !isUnderway) {
          pickableMatchIds.add(match.id);
        }
      }
    }

    const serverPicks = new Map(myPicks.map((p) => [p.matchId, p.predictedWinnerId]));
    for (const [matchId, winnerId] of localPicks) {
      // Only count as unsaved if match is pickable
      if (pickableMatchIds.has(matchId) && serverPicks.get(matchId) !== winnerId) {
        return true;
      }
    }
    return false;
  })();

  // Get unique divisions from all weeks for leaderboard filter
  const allDivisions = (() => {
    const divMap = new Map<number, { id: number; name: string; displayOrder?: number }>();
    for (const week of weeks) {
      for (const match of week.matches) {
        if (!divMap.has(match.division.id)) {
          divMap.set(match.division.id, match.division);
        }
      }
    }
    return Array.from(divMap.values()).sort(compareDivisions);
  })();

  // Calculate which weeks are unlocked for picks/bets
  // Week N is unlocked if at least one match in week N-1 has a result
  // Week 1 is always unlocked, playoffs unlock when last regular week has a result
  const unlockedWeeks = useMemo(() => {
    const unlocked = new Set<number>();
    const weekNumbers = weeks.map(w => w.week).sort((a, b) => a - b);

    for (const weekNum of weekNumbers) {
      if (weekNum === 1) {
        // Week 1 is always unlocked
        unlocked.add(weekNum);
      } else if (weekNum >= 101) {
        // Playoffs - unlock if ANY regular season week (<=100) has a completed match
        const lastRegularWeek = weekNumbers.filter(w => w <= 100).pop();
        if (lastRegularWeek) {
          const lastWeekData = weeks.find(w => w.week === lastRegularWeek);
          if (lastWeekData?.matches.some(m => m.winnerId !== null)) {
            unlocked.add(weekNum);
          }
        }
      } else {
        // Regular weeks (2+) - unlock if previous week has at least one result
        const prevWeekData = weeks.find(w => w.week === weekNum - 1);
        if (prevWeekData?.matches.some(m => m.winnerId !== null)) {
          unlocked.add(weekNum);
        }
      }
    }

    return unlocked;
  }, [weeks]);

  // Check if a week is locked
  const isWeekLocked = (weekNum: number) => !unlockedWeeks.has(weekNum);

  // Set default week to earliest unlocked week with unplayed matches
  useEffect(() => {
    if (selectedWeek === null && weeks.length > 0 && unlockedWeeks.size > 0) {
      // Find first unlocked week with at least one unplayed match
      const weekWithUnplayed = weeks.find((w) =>
        unlockedWeeks.has(w.week) && w.matches.some((m) => m.winnerId === null)
      );
      // Fall back to first unlocked week if all matches are completed
      const firstUnlocked = weeks.find((w) => unlockedWeeks.has(w.week));
      setSelectedWeek(weekWithUnplayed?.week || firstUnlocked?.week || weeks[0]?.week || null);
    }
  }, [weeks, unlockedWeeks, selectedWeek]);

  // Compute filtered leaderboard
  const filteredLeaderboard = (() => {
    let data: LeaderboardEntry[];

    // If no filters, use original leaderboard
    if (leaderboardWeek === null && leaderboardDivision === null) {
      data = [...leaderboard];
    } else {
      // Calculate filtered scores and rewards
      data = leaderboard
        .map((entry) => {
          const picks = participantPicks[entry.id] || [];
          let correct = 0;
          let total = 0;
          let pending = 0;

          for (const pick of picks) {
            const meta = matchMetadata[pick.matchId];
            if (!meta) continue;

            // Apply week filter
            if (leaderboardWeek !== null && meta.week !== leaderboardWeek) continue;

            // Apply division filter
            if (leaderboardDivision !== null && meta.divisionId !== leaderboardDivision) continue;

            // Count the pick
            if (meta.winnerId === null) {
              pending++;
            } else {
              total++;
              if (pick.predictedWinnerId === meta.winnerId) {
                correct++;
              }
            }
          }

          // Calculate filtered rewards
          let filteredRewards = 0;
          if (leaderboardWeek !== null && leaderboardDivision !== null) {
            // Both filters: use the precise week+division lookup
            const key = `${leaderboardWeek}-${leaderboardDivision}`;
            filteredRewards = entry.rewardsByWeekAndDivision[key] || 0;
          } else if (leaderboardWeek !== null) {
            // Week filter only: all rewards for this week (overall + division)
            filteredRewards = entry.rewardsByWeek[leaderboardWeek] || 0;
          } else if (leaderboardDivision !== null) {
            // Division filter only: all rewards for this division across weeks
            filteredRewards = entry.rewardsByDivision[leaderboardDivision] || 0;
          }

          return {
            ...entry,
            correct,
            total,
            pending,
            accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
            rewards: filteredRewards,
          };
        })
        .filter((entry) => entry.total > 0 || entry.pending > 0);
    }

    // Apply sorting
    return data.sort((a, b) => {
      let cmp = 0;
      switch (picksSortColumn) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "correct":
          cmp = a.correct - b.correct;
          break;
        case "total":
          cmp = a.total - b.total;
          break;
        case "pending":
          cmp = a.pending - b.pending;
          break;
        case "accuracy":
          cmp = a.accuracy - b.accuracy;
          break;
        case "rewards":
          cmp = a.rewards - b.rewards;
          break;
      }
      return picksSortDir === "desc" ? -cmp : cmp;
    });
  })();

  // Compute filtered and sorted betting leaderboard
  const sortedBettingLeaderboard = (() => {
    // If no filters, use pre-computed leaderboard
    if (bettingLeaderboardWeek === null && bettingLeaderboardDivision === null) {
      return [...bettingLeaderboard].sort((a, b) => {
        let cmp = 0;
        switch (bettingSortColumn) {
          case "bettorName":
            cmp = a.bettorName.localeCompare(b.bettorName);
            break;
          case "profit":
            cmp = a.profit - b.profit;
            break;
          case "betsWon":
            cmp = a.betsWon - b.betsWon;
            break;
          case "betsLost":
            cmp = a.betsLost - b.betsLost;
            break;
          case "coinsWagered":
            cmp = a.coinsWagered - b.coinsWagered;
            break;
          case "totalCoins":
            cmp = a.totalCoins - b.totalCoins;
            break;
        }
        return bettingSortDir === "desc" ? -cmp : cmp;
      });
    }

    // Filter bets by week/division
    const filteredBets = allBetsData.filter((bet) => {
      const meta = matchMetadata[bet.matchId];
      if (!meta) return false;
      if (bettingLeaderboardWeek !== null && meta.week !== bettingLeaderboardWeek) return false;
      if (bettingLeaderboardDivision !== null && meta.divisionId !== bettingLeaderboardDivision) return false;
      return true;
    });

    // Filter kill bets by week/division
    const filteredKillBets = allKillBetsData.filter((bet) => {
      const meta = matchMetadata[bet.matchId];
      if (!meta) return false;
      if (bettingLeaderboardWeek !== null && meta.week !== bettingLeaderboardWeek) return false;
      if (bettingLeaderboardDivision !== null && meta.divisionId !== bettingLeaderboardDivision) return false;
      return true;
    });

    // Filter death bets by week/division
    const filteredDeathBets = allDeathBetsData.filter((bet) => {
      const meta = matchMetadata[bet.matchId];
      if (!meta) return false;
      if (bettingLeaderboardWeek !== null && meta.week !== bettingLeaderboardWeek) return false;
      if (bettingLeaderboardDivision !== null && meta.divisionId !== bettingLeaderboardDivision) return false;
      return true;
    });

    // Aggregate by bettor (coach or spectator)
    const statsMap = new Map<string, BettingLeaderboardEntry>();
    for (const bet of filteredBets) {
      const key = `${bet.bettorType}-${bet.bettorId}`;
      if (!statsMap.has(key)) {
        statsMap.set(key, {
          bettorId: bet.bettorId,
          bettorType: bet.bettorType,
          bettorName: bet.bettorName,
          totalCoins: bet.totalCoins,
          betsPlaced: 0,
          betsWon: 0,
          betsLost: 0,
          betsPending: 0,
          coinsWagered: 0,
          coinsWon: 0,
          coinsLost: 0,
          profit: 0,
        });
      }
      const stats = statsMap.get(key)!;
      stats.betsPlaced++;
      stats.coinsWagered += bet.amount;

      if (bet.status === "won") {
        stats.betsWon++;
        const profit = (bet.payout || 0) - bet.amount;
        stats.coinsWon += profit;
        stats.profit += profit;
      } else if (bet.status === "lost") {
        stats.betsLost++;
        stats.coinsLost += bet.amount;
        stats.profit -= bet.amount;
      } else if (bet.status === "pending") {
        stats.betsPending++;
      }
    }

    // Also aggregate kill bets
    for (const killBet of filteredKillBets) {
      const key = `${killBet.bettorType}-${killBet.bettorId}`;
      if (!statsMap.has(key)) {
        statsMap.set(key, {
          bettorId: killBet.bettorId,
          bettorType: killBet.bettorType,
          bettorName: killBet.bettorName,
          totalCoins: killBet.totalCoins,
          betsPlaced: 0,
          betsWon: 0,
          betsLost: 0,
          betsPending: 0,
          coinsWagered: 0,
          coinsWon: 0,
          coinsLost: 0,
          profit: 0,
        });
      }
      const stats = statsMap.get(key)!;
      stats.betsPlaced++;
      stats.coinsWagered += killBet.amount;

      if (killBet.status === "won") {
        stats.betsWon++;
        const profit = (killBet.payout || 0) - killBet.amount;
        stats.coinsWon += profit;
        stats.profit += profit;
      } else if (killBet.status === "lost") {
        stats.betsLost++;
        stats.coinsLost += killBet.amount;
        stats.profit -= killBet.amount;
      } else if (killBet.status === "pending") {
        stats.betsPending++;
      }
    }

    // Also aggregate death bets
    for (const deathBet of filteredDeathBets) {
      const key = `${deathBet.bettorType}-${deathBet.bettorId}`;
      if (!statsMap.has(key)) {
        statsMap.set(key, {
          bettorId: deathBet.bettorId,
          bettorType: deathBet.bettorType,
          bettorName: deathBet.bettorName,
          totalCoins: deathBet.totalCoins,
          betsPlaced: 0,
          betsWon: 0,
          betsLost: 0,
          betsPending: 0,
          coinsWagered: 0,
          coinsWon: 0,
          coinsLost: 0,
          profit: 0,
        });
      }
      const stats = statsMap.get(key)!;
      stats.betsPlaced++;
      stats.coinsWagered += deathBet.amount;

      if (deathBet.status === "won") {
        stats.betsWon++;
        const profit = (deathBet.payout || 0) - deathBet.amount;
        stats.coinsWon += profit;
        stats.profit += profit;
      } else if (deathBet.status === "lost") {
        stats.betsLost++;
        stats.coinsLost += deathBet.amount;
        stats.profit -= deathBet.amount;
      } else if (deathBet.status === "pending") {
        stats.betsPending++;
      }
    }

    // Sort
    return Array.from(statsMap.values()).sort((a, b) => {
      let cmp = 0;
      switch (bettingSortColumn) {
        case "bettorName":
          cmp = a.bettorName.localeCompare(b.bettorName);
          break;
        case "profit":
          cmp = a.profit - b.profit;
          break;
        case "betsWon":
          cmp = a.betsWon - b.betsWon;
          break;
        case "betsLost":
          cmp = a.betsLost - b.betsLost;
          break;
        case "coinsWagered":
          cmp = a.coinsWagered - b.coinsWagered;
          break;
        case "totalCoins":
          cmp = a.totalCoins - b.totalCoins;
          break;
      }
      return bettingSortDir === "desc" ? -cmp : cmp;
    });
  })();

  // Logout
  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore errors
    }
    setAuthUser(null);
    setParticipant(null);
    setLocalPicks(new Map());
    setShowAuthModal(true);
  }

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="poke-card p-8 text-center">
        <p className="text-[var(--foreground-muted)]">Loading...</p>
      </div>
    );
  }

  return (
    <div className="readable-content space-y-6">
      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={(user) => {
          setAuthUser(user);
          setShowAuthModal(false);
        }}
      />

      {/* Store Modal */}
      {authUser?.type === "coach" && (
        <StoreModal
          isOpen={showStoreModal}
          onClose={() => setShowStoreModal(false)}
          balance={betting.balance}
          onBalanceChange={(newBalance) => {
            setBetting((prev) => ({ ...prev, balance: newBalance }));
          }}
        />
      )}

      {/* Header */}
      <div className="poke-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-pixel text-xl md:text-2xl text-white">
              Pick-Ems
            </h1>
            <p className="text-sm text-[var(--foreground-muted)]">
              S{season.seasonNumber} - Predict match winners
            </p>
          </div>
          {authUser && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--accent)]/20 border border-[var(--accent)]/30">
                  <svg className="w-4 h-4 text-[var(--accent)]" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.3"/>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
                    <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="bold" fill="currentColor">P</text>
                  </svg>
                  <span className="text-sm font-bold text-[var(--accent)]">{betting.availableBalance}</span>
                  {betting.totalPending > 0 && (
                    <span className="text-[10px] text-[var(--foreground-muted)]">
                      ({betting.totalPending} pending)
                    </span>
                  )}
                </div>
                {authUser.type === "coach" && (
                  <button
                    onClick={() => setShowStoreModal(true)}
                    className="p-1.5 rounded-full bg-[var(--accent)]/20 border border-[var(--accent)]/30 text-[var(--accent)] hover:bg-[var(--accent)]/30 transition-colors"
                    title="PBO Store"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </button>
                )}
              </div>
              <span className="text-sm text-[var(--foreground-muted)]">
                <span className="text-[var(--accent)] font-bold">{authUser.name}</span>
                {authUser.isMod && (
                  <span className="ml-1 px-1.5 py-0.5 text-[9px] font-bold rounded bg-[var(--primary)]/20 text-[var(--primary)]">
                    MOD
                  </span>
                )}
              </span>
              <button
                onClick={logout}
                className="text-xs text-[var(--error)] hover:underline"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="poke-card p-4 sm:p-5">
        <div className="section-title">
          <div className="section-title-icon">
            <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3>About Pick-Ems</h3>
        </div>
        <div className="grid gap-3 text-sm leading-6 text-[var(--foreground-muted)] md:grid-cols-3">
          <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/50 p-3">
            <h4 className="mb-2 font-bold uppercase text-white">How It Works</h4>
            <p>
              Signed-in users pick winners for scheduled matches. Picks can be changed
              until a match starts or is completed.
            </p>
          </div>
          <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/50 p-3">
            <h4 className="mb-2 font-bold uppercase text-white">Scoring</h4>
            <p>
              Correct picks count toward the leaderboard. If a result changes later,
              affected pick-em rewards are reversed and recalculated.
            </p>
          </div>
          <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/50 p-3">
            <h4 className="mb-2 font-bold uppercase text-white">Rewards</h4>
            <p>
              Weekly overall pays 200, 100, and 75 PBO Coin. Division winners get 75,
              correct Game of the Week picks get 15, and ties split prizes evenly.
            </p>
          </div>
        </div>
      </div>

      {/* Show sign in prompt if not authenticated */}
      {!authUser && (
        <div className="poke-card p-6 text-center">
          <h2 className="text-lg font-bold text-white mb-2">Sign in to participate</h2>
          <p className="text-sm text-[var(--foreground-muted)] mb-4">
            Create an account or sign in to make your picks.
          </p>
          <button
            onClick={() => setShowAuthModal(true)}
            className="px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:bg-[var(--primary)]/80"
          >
            Sign In / Create Account
          </button>
        </div>
      )}

      {/* Main Content (when authenticated and participant exists) */}
      {authUser && participant && (
        <>
          {/* Leaderboard */}
          <div className="poke-card p-0 overflow-hidden">
            <div className="p-3 sm:p-4 border-b-2 border-[var(--background-tertiary)] flex items-center justify-between gap-2">
              <h2 className="text-base sm:text-lg font-bold text-white shrink-0">Leaderboard</h2>
              <div className="flex items-center gap-2">
                <MobileTooltip
                  position="right"
                  trigger={
                    <div className="w-6 h-6 rounded-full bg-[var(--background-tertiary)] flex items-center justify-center hover:bg-[var(--primary)]/20 transition-colors cursor-help">
                      <svg className="w-4 h-4 text-[var(--foreground-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  }
                >
                  <div className="max-w-[calc(100vw-2rem)] rounded-lg border-2 border-[var(--primary)]/30 bg-[var(--background-secondary)] px-4 py-3 shadow-lg sm:min-w-[320px]">
                    <p className="text-xs font-bold text-[var(--primary)] uppercase tracking-wide mb-3">Pick-Ems Rewards</p>

                    {/* Overall Rewards */}
                    <div className="mb-3">
                      <p className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide mb-1.5">Weekly Overall (All Divisions)</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-[var(--foreground-muted)]">🥇 1st Place</span>
                          <span className="text-[var(--accent)] font-mono font-bold">+200</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--foreground-muted)]">🥈 2nd Place</span>
                          <span className="text-[var(--accent)] font-mono font-bold">+100</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--foreground-muted)]">🥉 3rd Place</span>
                          <span className="text-[var(--accent)] font-mono font-bold">+75</span>
                        </div>
                      </div>
                    </div>

                    {/* Division Rewards */}
                    <div className="mb-3">
                      <p className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide mb-1.5">Weekly Per Division</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-[var(--foreground-muted)]">🏆 1st Place</span>
                          <span className="text-[var(--accent)] font-mono font-bold">+75</span>
                        </div>
                      </div>
                    </div>

                    {/* GOTW Bonus */}
                    <div className="mb-3">
                      <p className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide mb-1.5">Game of the Week Bonus (1 per division)</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-[var(--foreground-muted)]">⭐ Correct GOTW Pick</span>
                          <span className="text-[var(--accent)] font-mono font-bold">+15</span>
                        </div>
                      </div>
                    </div>

                    {/* Rules */}
                    <div className="border-t border-[var(--background-tertiary)] pt-2.5 mt-2.5">
                      <p className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide mb-1.5">How It Works</p>
                      <ul className="text-[10px] text-[var(--foreground-muted)] space-y-1">
                        <li>• Rewards given when all week&apos;s matches complete</li>
                        <li>• Ties split the prize pool evenly</li>
                      </ul>
                    </div>
                  </div>
                </MobileTooltip>
                {/* Toggle between Picks and Betting */}
                {!bettingSettings.bettingUiHidden && (
                  <div className="flex rounded-lg bg-[var(--background-tertiary)] p-0.5">
                  <button
                    onClick={() => setLeaderboardMode("picks")}
                    className={`px-2 sm:px-3 py-1 text-[10px] sm:text-xs font-bold rounded-md transition-all ${
                      leaderboardMode === "picks"
                        ? "bg-[var(--primary)] text-white"
                        : "text-[var(--foreground-muted)] hover:text-white"
                    }`}
                  >
                    Pick-Ems
                  </button>
                  <button
                    onClick={() => setLeaderboardMode("betting")}
                    className={`px-2 sm:px-3 py-1 text-[10px] sm:text-xs font-bold rounded-md transition-all flex items-center gap-1 ${
                      leaderboardMode === "betting"
                        ? "bg-[var(--accent)] text-black"
                        : "text-[var(--foreground-muted)] hover:text-white"
                    }`}
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="12" r="10" opacity="0.3"/>
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
                      <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="bold">P</text>
                    </svg>
                    Betting
                  </button>
                  </div>
                )}
              </div>
            </div>

            {/* Pick-Ems Leaderboard */}
            {leaderboardMode === "picks" && (
              <>
                {/* Leaderboard Filters */}
                <div className="p-2 sm:p-3 border-b border-[var(--background-tertiary)] bg-[var(--background-secondary)] space-y-2">
                  {/* Week Filter - Wraps on mobile */}
                  <div className="flex gap-1.5 sm:gap-2 flex-wrap">
                    <button
                      onClick={() => setLeaderboardWeek(null)}
                      className={`px-2 sm:px-3 py-1 rounded text-[10px] sm:text-xs font-bold transition-all ${
                        leaderboardWeek === null
                          ? "bg-[var(--primary)] text-white"
                          : "bg-[var(--background-tertiary)] text-[var(--foreground-muted)] hover:text-white"
                      }`}
                    >
                      Season
                    </button>
                    {weeks.map((week) => (
                      <button
                        key={week.week}
                        onClick={() => setLeaderboardWeek(week.week)}
                        className={`px-2 sm:px-3 py-1 rounded text-[10px] sm:text-xs font-bold transition-all ${
                          leaderboardWeek === week.week
                            ? "bg-[var(--primary)] text-white"
                            : "bg-[var(--background-tertiary)] text-[var(--foreground-muted)] hover:text-white"
                        }`}
                      >
                        {week.week >= 101 ? getWeekLabel(week.week) : `W${week.week}`}
                      </button>
                    ))}
                  </div>

                  {/* Division Filter */}
                  {allDivisions.length > 1 && (
                    <div className="flex gap-1.5 sm:gap-2 flex-wrap">
                      <button
                        onClick={() => setLeaderboardDivision(null)}
                        className={`px-2 sm:px-3 py-1 rounded text-[10px] sm:text-xs font-medium transition-all ${
                          leaderboardDivision === null
                            ? "bg-[var(--accent)] text-white"
                            : "bg-[var(--background-tertiary)] text-[var(--foreground-muted)] hover:text-white"
                        }`}
                      >
                        All
                      </button>
                      {allDivisions.map((div) => (
                        <button
                          key={div.id}
                          onClick={() => setLeaderboardDivision(div.id)}
                          className={`px-2 sm:px-3 py-1 rounded text-[10px] sm:text-xs font-medium transition-all ${
                            leaderboardDivision === div.id
                              ? "bg-[var(--accent)] text-white"
                              : "bg-[var(--background-tertiary)] text-[var(--foreground-muted)] hover:text-white"
                          }`}
                        >
                          {div.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {filteredLeaderboard.length === 0 ? (
                  <div className="p-6 text-center text-[var(--foreground-muted)]">
                    {leaderboard.length === 0
                      ? "No picks made yet. Be the first!"
                      : "No picks for this filter."}
                  </div>
                ) : (
                  <div className="overflow-auto max-h-[50vh] sm:max-h-[400px]">
                    <table className="w-full text-[11px] sm:text-sm">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-[var(--background-secondary)] text-[var(--foreground-muted)] text-[9px] sm:text-xs uppercase">
                          <th className="px-1 sm:px-3 py-1.5 sm:py-2 text-center w-6 sm:w-10">#</th>
                          <th
                            className="px-1 sm:px-3 py-1.5 sm:py-2 text-left cursor-pointer hover:text-white transition-colors"
                            onClick={() => {
                              if (picksSortColumn === "name") {
                                setPicksSortDir(picksSortDir === "asc" ? "desc" : "asc");
                              } else {
                                setPicksSortColumn("name");
                                setPicksSortDir("asc");
                              }
                            }}
                          >
                            Name {picksSortColumn === "name" && (picksSortDir === "desc" ? "↓" : "↑")}
                          </th>
                          <th
                            className="px-1 sm:px-3 py-1.5 sm:py-2 text-center cursor-pointer hover:text-white transition-colors"
                            onClick={() => {
                              if (picksSortColumn === "correct") {
                                setPicksSortDir(picksSortDir === "asc" ? "desc" : "asc");
                              } else {
                                setPicksSortColumn("correct");
                                setPicksSortDir("desc");
                              }
                            }}
                          >
                            <span className="sm:hidden">✓</span>
                            <span className="hidden sm:inline">Correct</span>
                            {picksSortColumn === "correct" && (picksSortDir === "desc" ? " ↓" : " ↑")}
                          </th>
                          <th
                            className="px-1 sm:px-3 py-1.5 sm:py-2 text-center cursor-pointer hover:text-white transition-colors"
                            onClick={() => {
                              if (picksSortColumn === "total") {
                                setPicksSortDir(picksSortDir === "asc" ? "desc" : "asc");
                              } else {
                                setPicksSortColumn("total");
                                setPicksSortDir("desc");
                              }
                            }}
                          >
                            <span className="sm:hidden">T</span>
                            <span className="hidden sm:inline">Total</span>
                            {picksSortColumn === "total" && (picksSortDir === "desc" ? " ↓" : " ↑")}
                          </th>
                          <th
                            className="px-1 sm:px-3 py-1.5 sm:py-2 text-center cursor-pointer hover:text-white transition-colors"
                            onClick={() => {
                              if (picksSortColumn === "pending") {
                                setPicksSortDir(picksSortDir === "asc" ? "desc" : "asc");
                              } else {
                                setPicksSortColumn("pending");
                                setPicksSortDir("desc");
                              }
                            }}
                          >
                            <span className="sm:hidden">P</span>
                            <span className="hidden sm:inline">Pend.</span>
                            {picksSortColumn === "pending" && (picksSortDir === "desc" ? " ↓" : " ↑")}
                          </th>
                          <th
                            className="px-1 sm:px-3 py-1.5 sm:py-2 text-center cursor-pointer hover:text-white transition-colors"
                            onClick={() => {
                              if (picksSortColumn === "accuracy") {
                                setPicksSortDir(picksSortDir === "asc" ? "desc" : "asc");
                              } else {
                                setPicksSortColumn("accuracy");
                                setPicksSortDir("desc");
                              }
                            }}
                          >
                            <span className="sm:hidden">%</span>
                            <span className="hidden sm:inline">Acc.</span>
                            {picksSortColumn === "accuracy" && (picksSortDir === "desc" ? " ↓" : " ↑")}
                          </th>
                          <th
                            className="px-1 sm:px-3 py-1.5 sm:py-2 text-center cursor-pointer hover:text-white transition-colors"
                            onClick={() => {
                              if (picksSortColumn === "rewards") {
                                setPicksSortDir(picksSortDir === "asc" ? "desc" : "asc");
                              } else {
                                setPicksSortColumn("rewards");
                                setPicksSortDir("desc");
                              }
                            }}
                          >
                            <span className="sm:hidden">R</span>
                            <span className="hidden sm:inline">Rewards</span>
                            {picksSortColumn === "rewards" && (picksSortDir === "desc" ? " ↓" : " ↑")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLeaderboard.map((entry, i) => (
                          <tr
                            key={entry.id}
                            className={`border-t border-[var(--background-tertiary)] ${
                              entry.id === participant.id
                                ? "bg-[var(--primary)]/10"
                                : "hover:bg-[var(--background-secondary)]/50"
                            }`}
                          >
                            <td className="px-1 sm:px-4 py-1.5 sm:py-3 text-center">
                              <span className={`font-bold ${
                                i === 0 ? "text-[var(--accent)]" :
                                i === 1 ? "text-gray-300" :
                                i === 2 ? "text-amber-600" :
                                "text-[var(--foreground-muted)]"
                              }`}>
                                {i + 1}
                              </span>
                            </td>
                            <td className="px-1 sm:px-4 py-1.5 sm:py-3">
                              <div className="flex items-center gap-1">
                                {entry.coachId ? (
                                  <Link
                                    href={`/coaches/${entry.coachId}`}
                                    className="text-[var(--primary)] hover:underline font-medium truncate max-w-[100px] sm:max-w-none"
                                  >
                                    {entry.name}
                                  </Link>
                                ) : (
                                  <span className="text-[var(--foreground)] truncate max-w-[100px] sm:max-w-none">{entry.name}</span>
                                )}
                                {entry.id === participant.id && (
                                  <span className="text-[9px] sm:text-xs text-[var(--accent)] shrink-0">(You)</span>
                                )}
                              </div>
                            </td>
                            <td className="px-1 sm:px-4 py-1.5 sm:py-3 text-center font-mono font-bold text-[var(--success)]">
                              {entry.correct}
                            </td>
                            <td className="px-1 sm:px-4 py-1.5 sm:py-3 text-center font-mono">
                              {entry.total}
                            </td>
                            <td className="px-1 sm:px-4 py-1.5 sm:py-3 text-center font-mono text-[var(--foreground-muted)]">
                              {entry.pending}
                            </td>
                            <td className="px-1 sm:px-4 py-1.5 sm:py-3 text-center font-mono">
                              {entry.accuracy}%
                            </td>
                            <td className="px-1 sm:px-4 py-1.5 sm:py-3 text-center font-mono">
                              {entry.rewards > 0 ? (
                                <span className="text-[var(--accent)]">+{entry.rewards}</span>
                              ) : (
                                <span className="text-[var(--foreground-muted)]">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* Betting Leaderboard */}
            {leaderboardMode === "betting" && !bettingSettings.bettingUiHidden && (
              <>
                {/* Betting Leaderboard Filters */}
                <div className="p-2 sm:p-3 border-b border-[var(--background-tertiary)] bg-[var(--background-secondary)] space-y-2">
                  {/* Week Filter */}
                  <div className="flex gap-1.5 sm:gap-2 flex-wrap">
                    <button
                      onClick={() => setBettingLeaderboardWeek(null)}
                      className={`px-2 sm:px-3 py-1 rounded text-[10px] sm:text-xs font-bold transition-all ${
                        bettingLeaderboardWeek === null
                          ? "bg-[var(--primary)] text-white"
                          : "bg-[var(--background-tertiary)] text-[var(--foreground-muted)] hover:text-white"
                      }`}
                    >
                      Season
                    </button>
                    {weeks.map((week) => (
                      <button
                        key={week.week}
                        onClick={() => setBettingLeaderboardWeek(week.week)}
                        className={`px-2 sm:px-3 py-1 rounded text-[10px] sm:text-xs font-bold transition-all ${
                          bettingLeaderboardWeek === week.week
                            ? "bg-[var(--primary)] text-white"
                            : "bg-[var(--background-tertiary)] text-[var(--foreground-muted)] hover:text-white"
                        }`}
                      >
                        {week.week >= 101 ? getWeekLabel(week.week) : `W${week.week}`}
                      </button>
                    ))}
                  </div>

                  {/* Division Filter */}
                  {allDivisions.length > 1 && (
                    <div className="flex gap-1.5 sm:gap-2 flex-wrap">
                      <button
                        onClick={() => setBettingLeaderboardDivision(null)}
                        className={`px-2 sm:px-3 py-1 rounded text-[10px] sm:text-xs font-medium transition-all ${
                          bettingLeaderboardDivision === null
                            ? "bg-[var(--accent)] text-white"
                            : "bg-[var(--background-tertiary)] text-[var(--foreground-muted)] hover:text-white"
                        }`}
                      >
                        All
                      </button>
                      {allDivisions.map((div) => (
                        <button
                          key={div.id}
                          onClick={() => setBettingLeaderboardDivision(div.id)}
                          className={`px-2 sm:px-3 py-1 rounded text-[10px] sm:text-xs font-medium transition-all ${
                            bettingLeaderboardDivision === div.id
                              ? "bg-[var(--accent)] text-white"
                              : "bg-[var(--background-tertiary)] text-[var(--foreground-muted)] hover:text-white"
                          }`}
                        >
                          {div.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {sortedBettingLeaderboard.length === 0 ? (
                  <div className="p-6 text-center text-[var(--foreground-muted)]">
                    {bettingLeaderboard.length === 0
                      ? "No bets placed yet this season."
                      : "No bets for this filter."}
                  </div>
                ) : (
                  <div className="overflow-auto max-h-[50vh] sm:max-h-[400px]">
                    <table className="w-full text-[11px] sm:text-sm">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-[var(--background-secondary)] text-[var(--foreground-muted)] text-[9px] sm:text-xs uppercase">
                          <th className="px-1 sm:px-4 py-1.5 sm:py-2 text-center w-6 sm:w-10">#</th>
                          <th
                            className="px-1 sm:px-4 py-1.5 sm:py-2 text-left cursor-pointer hover:text-white transition-colors"
                            onClick={() => {
                              if (bettingSortColumn === "bettorName") {
                                setBettingSortDir(bettingSortDir === "asc" ? "desc" : "asc");
                              } else {
                                setBettingSortColumn("bettorName");
                                setBettingSortDir("asc");
                              }
                            }}
                          >
                            Bettor {bettingSortColumn === "bettorName" && (bettingSortDir === "desc" ? "↓" : "↑")}
                          </th>
                          <th
                            className="px-1 sm:px-4 py-1.5 sm:py-2 text-center cursor-pointer hover:text-white transition-colors"
                            onClick={() => {
                              if (bettingSortColumn === "profit") {
                                setBettingSortDir(bettingSortDir === "asc" ? "desc" : "asc");
                              } else {
                                setBettingSortColumn("profit");
                                setBettingSortDir("desc");
                              }
                            }}
                          >
                            <span className="hidden sm:inline">Profit</span>
                            <span className="sm:hidden">+/-</span>
                            {bettingSortColumn === "profit" && (bettingSortDir === "desc" ? " ↓" : " ↑")}
                          </th>
                          <th
                            className="px-1 sm:px-4 py-1.5 sm:py-2 text-center cursor-pointer hover:text-white transition-colors"
                            onClick={() => {
                              if (bettingSortColumn === "betsWon") {
                                setBettingSortDir(bettingSortDir === "asc" ? "desc" : "asc");
                              } else {
                                setBettingSortColumn("betsWon");
                                setBettingSortDir("desc");
                              }
                            }}
                          >
                            <span className="hidden sm:inline">Won</span>
                            <span className="sm:hidden">W</span>
                            {bettingSortColumn === "betsWon" && (bettingSortDir === "desc" ? " ↓" : " ↑")}
                          </th>
                          <th
                            className="px-1 sm:px-4 py-1.5 sm:py-2 text-center cursor-pointer hover:text-white transition-colors"
                            onClick={() => {
                              if (bettingSortColumn === "betsLost") {
                                setBettingSortDir(bettingSortDir === "asc" ? "desc" : "asc");
                              } else {
                                setBettingSortColumn("betsLost");
                                setBettingSortDir("desc");
                              }
                            }}
                          >
                            <span className="hidden sm:inline">Lost</span>
                            <span className="sm:hidden">L</span>
                            {bettingSortColumn === "betsLost" && (bettingSortDir === "desc" ? " ↓" : " ↑")}
                          </th>
                          <th
                            className="px-1 sm:px-4 py-1.5 sm:py-2 text-center cursor-pointer hover:text-white transition-colors"
                            onClick={() => {
                              if (bettingSortColumn === "coinsWagered") {
                                setBettingSortDir(bettingSortDir === "asc" ? "desc" : "asc");
                              } else {
                                setBettingSortColumn("coinsWagered");
                                setBettingSortDir("desc");
                              }
                            }}
                          >
                            <span className="hidden sm:inline">Wagered</span>
                            <span className="sm:hidden">Wg</span>
                            {bettingSortColumn === "coinsWagered" && (bettingSortDir === "desc" ? " ↓" : " ↑")}
                          </th>
                          <th
                            className="px-1 sm:px-4 py-1.5 sm:py-2 text-center cursor-pointer hover:text-white transition-colors"
                            onClick={() => {
                              if (bettingSortColumn === "totalCoins") {
                                setBettingSortDir(bettingSortDir === "asc" ? "desc" : "asc");
                              } else {
                                setBettingSortColumn("totalCoins");
                                setBettingSortDir("desc");
                              }
                            }}
                          >
                            <div className="flex items-center justify-center gap-0.5">
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="12" cy="12" r="10" opacity="0.3"/>
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
                                <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="bold">P</text>
                              </svg>
                              {bettingSortColumn === "totalCoins" && (bettingSortDir === "desc" ? "↓" : "↑")}
                            </div>
                          </th>
                          <th className="w-6 sm:w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedBettingLeaderboard.map((entry, i) => {
                          const bettorKey = `${entry.bettorType}-${entry.bettorId}`;
                          const isExpanded = expandedBettor === bettorKey;

                          // Get this bettor's bets (filtered by current week/division)
                          const bettorBets = allBetsData.filter((bet) => {
                            if (bet.bettorType !== entry.bettorType || bet.bettorId !== entry.bettorId) return false;
                            const meta = matchMetadata[bet.matchId];
                            if (!meta) return false;
                            if (bettingLeaderboardWeek !== null && meta.week !== bettingLeaderboardWeek) return false;
                            if (bettingLeaderboardDivision !== null && meta.divisionId !== bettingLeaderboardDivision) return false;
                            return true;
                          });

                          // Get this bettor's kill bets (filtered by current week/division)
                          const bettorKillBets = allKillBetsData.filter((killBet) => {
                            if (killBet.bettorType !== entry.bettorType || killBet.bettorId !== entry.bettorId) return false;
                            const meta = matchMetadata[killBet.matchId];
                            if (!meta) return false;
                            if (bettingLeaderboardWeek !== null && meta.week !== bettingLeaderboardWeek) return false;
                            if (bettingLeaderboardDivision !== null && meta.divisionId !== bettingLeaderboardDivision) return false;
                            return true;
                          });

                          // Get this bettor's death bets (filtered by current week/division)
                          const bettorDeathBets = allDeathBetsData.filter((deathBet) => {
                            if (deathBet.bettorType !== entry.bettorType || deathBet.bettorId !== entry.bettorId) return false;
                            const meta = matchMetadata[deathBet.matchId];
                            if (!meta) return false;
                            if (bettingLeaderboardWeek !== null && meta.week !== bettingLeaderboardWeek) return false;
                            if (bettingLeaderboardDivision !== null && meta.divisionId !== bettingLeaderboardDivision) return false;
                            return true;
                          });

                          // Build match lookup from weeks data
                          const matchLookup: Record<number, Match> = {};
                          weeks.forEach(w => w.matches.forEach(m => { matchLookup[m.id] = m; }));

                          return (
                            <Fragment key={bettorKey}>
                              <tr
                                className={`border-t border-[var(--background-tertiary)] cursor-pointer ${
                                  authUser?.type === entry.bettorType && authUser.id === entry.bettorId
                                    ? "bg-[var(--accent)]/10"
                                    : isExpanded ? "bg-[var(--background-secondary)]" : "hover:bg-[var(--background-secondary)]/50"
                                }`}
                                onClick={() => setExpandedBettor(isExpanded ? null : bettorKey)}
                              >
                                <td className="px-1 sm:px-4 py-1.5 sm:py-3 text-center">
                                  <span className={`font-bold ${
                                    i === 0 ? "text-[var(--accent)]" :
                                    i === 1 ? "text-gray-300" :
                                    i === 2 ? "text-amber-600" :
                                    "text-[var(--foreground-muted)]"
                                  }`}>
                                    {i + 1}
                                  </span>
                                </td>
                                <td className="px-1 sm:px-4 py-1.5 sm:py-3">
                                  <div className="flex items-center gap-1">
                                    {entry.bettorType === "coach" ? (
                                      <Link
                                        href={`/coaches/${entry.bettorId}`}
                                        className="text-[var(--primary)] hover:underline font-medium truncate max-w-[100px] sm:max-w-none"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {entry.bettorName}
                                      </Link>
                                    ) : (
                                      <span className="font-medium truncate max-w-[100px] sm:max-w-none text-[var(--foreground-muted)]">
                                        {entry.bettorName}
                                      </span>
                                    )}
                                    {authUser?.type === entry.bettorType && authUser.id === entry.bettorId && (
                                      <span className="text-[9px] sm:text-xs text-[var(--accent)] shrink-0">(You)</span>
                                    )}
                                  </div>
                                </td>
                                <td className={`px-1 sm:px-4 py-1.5 sm:py-3 text-center font-mono font-bold ${
                                  entry.profit > 0 ? "text-[var(--success)]" :
                                  entry.profit < 0 ? "text-[var(--error)]" :
                                  "text-[var(--foreground-muted)]"
                                }`}>
                                  {entry.profit > 0 ? "+" : ""}{entry.profit}
                                </td>
                                <td className="px-1 sm:px-4 py-1.5 sm:py-3 text-center font-mono text-[var(--success)]">
                                  {entry.betsWon}
                                </td>
                                <td className="px-1 sm:px-4 py-1.5 sm:py-3 text-center font-mono text-[var(--error)]">
                                  {entry.betsLost}
                                </td>
                                <td className="px-1 sm:px-4 py-1.5 sm:py-3 text-center font-mono text-[var(--foreground-muted)]">
                                  {entry.coinsWagered}
                                </td>
                                <td className="px-1 sm:px-4 py-1.5 sm:py-3 text-center font-mono font-bold text-[var(--accent)]">
                                  {entry.totalCoins}
                                </td>
                                <td className="px-1 py-1.5 sm:py-3 text-center">
                                  <svg className={`w-4 h-4 text-[var(--foreground-muted)] transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr>
                                  <td colSpan={8} className="bg-[var(--background-tertiary)]/50 px-2 sm:px-4 py-2">
                                    <div className="space-y-1">
                                      {bettorBets.length === 0 && bettorKillBets.length === 0 && bettorDeathBets.length === 0 ? (
                                        <div className="text-xs text-[var(--foreground-muted)] text-center py-2">No bets for this filter</div>
                                      ) : (
                                        <>
                                          {/* Winner bets */}
                                          {bettorBets.map((bet) => {
                                            const match = matchLookup[bet.matchId];
                                            if (!match) return null;
                                            const betOnCoach1 = bet.predictedWinnerId === match.coach1.id;
                                            const pickedTeam = betOnCoach1 ? match.coach1.teamName : match.coach2.teamName;
                                            const opponentTeam = betOnCoach1 ? match.coach2.teamName : match.coach1.teamName;
                                            const isWin = bet.status === "won";
                                            const isLoss = bet.status === "lost";
                                            // Check for cheating (lost but predicted correctly)
                                            const predictedCorrectly = bet.predictedWinnerId === match.winnerId;
                                            const isCheating = isLoss && predictedCorrectly;

                                            return (
                                              <div
                                                key={`bet-${bet.id}`}
                                                className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[10px] sm:text-xs ${
                                                  isWin ? "bg-[var(--success)]/10" :
                                                  isLoss ? "bg-[var(--error)]/10" :
                                                  "bg-[var(--background-secondary)]"
                                                }`}
                                              >
                                                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                                                  <span className="text-[var(--foreground-muted)] shrink-0">W{match.week}</span>
                                                  <span className="font-medium truncate">{pickedTeam}</span>
                                                  <span className="text-[var(--foreground-muted)] font-mono shrink-0">@{bet.odds.toFixed(2)}x</span>
                                                  <span className="hidden sm:inline text-[var(--foreground-muted)]">vs</span>
                                                  <span className="hidden sm:inline text-[var(--foreground-muted)] truncate">{opponentTeam}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                                                  <span className="font-mono">{bet.amount}</span>
                                                  <span className={`font-bold min-w-[45px] text-right ${
                                                    isWin ? "text-[var(--success)]" :
                                                    isLoss ? "text-[var(--error)]" :
                                                    "text-[var(--foreground-muted)]"
                                                  }`}>
                                                    {isWin ? `+${(bet.payout || 0) - bet.amount}` :
                                                     isCheating ? "Cheat" :
                                                     isLoss ? `-${bet.amount}` :
                                                     "Pending"}
                                                  </span>
                                                </div>
                                              </div>
                                            );
                                          })}
                                          {/* Kill bets */}
                                          {bettorKillBets.map((killBet) => {
                                            const match = matchLookup[killBet.matchId];
                                            if (!match) return null;
                                            const isWin = killBet.status === "won";
                                            const isLoss = killBet.status === "lost";
                                            // Find which team the Pokemon belongs to and the opponent
                                            const isCoach1Pokemon = killBet.seasonCoachId === match.coach1.id;
                                            const teamAbbrev = isCoach1Pokemon
                                              ? (match.coach1.teamAbbreviation || match.coach1.teamName.substring(0, 3).toUpperCase())
                                              : (match.coach2.teamAbbreviation || match.coach2.teamName.substring(0, 3).toUpperCase());
                                            const opponentTeam = isCoach1Pokemon ? match.coach2.teamName : match.coach1.teamName;
                                            const killsText = killBet.betType === "over"
                                              ? `${killBet.killThreshold}+ Kills`
                                              : `<${killBet.killThreshold} Kills`;

                                            return (
                                              <div
                                                key={`killbet-${killBet.id}`}
                                                className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[10px] sm:text-xs ${
                                                  isWin ? "bg-[var(--success)]/10" :
                                                  isLoss ? "bg-[var(--error)]/10" :
                                                  "bg-[var(--background-secondary)]"
                                                }`}
                                              >
                                                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                                                  <span className="text-[var(--foreground-muted)] shrink-0">W{match.week}</span>
                                                  <span className="font-medium truncate">
                                                    {killBet.pokemonName} ({teamAbbrev}) {killsText}
                                                  </span>
                                                  <span className="text-[var(--foreground-muted)] font-mono shrink-0">@{killBet.odds.toFixed(2)}x</span>
                                                  <span className="hidden sm:inline text-[var(--foreground-muted)]">vs</span>
                                                  <span className="hidden sm:inline text-[var(--foreground-muted)] truncate">{opponentTeam}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                                                  <span className="font-mono">{killBet.amount}</span>
                                                  <span className={`font-bold min-w-[45px] text-right ${
                                                    isWin ? "text-[var(--success)]" :
                                                    isLoss ? "text-[var(--error)]" :
                                                    "text-[var(--foreground-muted)]"
                                                  }`}>
                                                    {isWin ? `+${(killBet.payout || 0) - killBet.amount}` :
                                                     isLoss ? `-${killBet.amount}` :
                                                     "Pending"}
                                                  </span>
                                                </div>
                                              </div>
                                            );
                                          })}
                                          {/* Death bets */}
                                          {bettorDeathBets.map((deathBet) => {
                                            const match = matchLookup[deathBet.matchId];
                                            if (!match) return null;
                                            const isWin = deathBet.status === "won";
                                            const isLoss = deathBet.status === "lost";
                                            // Find which team the Pokemon belongs to and the opponent
                                            const isCoach1Pokemon = deathBet.seasonCoachId === match.coach1.id;
                                            const teamAbbrev = isCoach1Pokemon
                                              ? (match.coach1.teamAbbreviation || match.coach1.teamName.substring(0, 3).toUpperCase())
                                              : (match.coach2.teamAbbreviation || match.coach2.teamName.substring(0, 3).toUpperCase());
                                            const opponentTeam = isCoach1Pokemon ? match.coach2.teamName : match.coach1.teamName;
                                            const deathText = deathBet.betType === "dies" ? "Dies" : "Survives";

                                            return (
                                              <div
                                                key={`deathbet-${deathBet.id}`}
                                                className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[10px] sm:text-xs ${
                                                  isWin ? "bg-[var(--success)]/10" :
                                                  isLoss ? "bg-[var(--error)]/10" :
                                                  "bg-[var(--background-secondary)]"
                                                }`}
                                              >
                                                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                                                  <span className="text-[var(--foreground-muted)] shrink-0">W{match.week}</span>
                                                  <span className="font-medium truncate">
                                                    {deathBet.pokemonName} ({teamAbbrev}) {deathText}
                                                  </span>
                                                  <span className="text-[var(--foreground-muted)] font-mono shrink-0">@{deathBet.odds.toFixed(2)}x</span>
                                                  <span className="hidden sm:inline text-[var(--foreground-muted)]">vs</span>
                                                  <span className="hidden sm:inline text-[var(--foreground-muted)] truncate">{opponentTeam}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                                                  <span className="font-mono">{deathBet.amount}</span>
                                                  <span className={`font-bold min-w-[45px] text-right ${
                                                    isWin ? "text-[var(--success)]" :
                                                    isLoss ? "text-[var(--error)]" :
                                                    "text-[var(--foreground-muted)]"
                                                  }`}>
                                                    {isWin ? `+${(deathBet.payout || 0) - deathBet.amount}` :
                                                     isLoss ? `-${deathBet.amount}` :
                                                     "Pending"}
                                                  </span>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Make Picks */}
          {weeks.length > 0 && season.isSchedulePublic && (
            <div className="poke-card p-0 overflow-hidden">
              <div className="p-4 border-b-2 border-[var(--background-tertiary)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-white">Make Your Picks</h2>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    Select the team you think will win each match
                  </p>
                </div>
                {hasUnsavedChanges && (
                  <button
                    onClick={submitPicks}
                    disabled={submitting}
                    className="px-4 py-2 bg-[var(--success)] text-white rounded-md hover:bg-[var(--success)]/80 disabled:opacity-50 text-sm font-bold shrink-0"
                  >
                    {submitting ? "Saving..." : "Save Picks"}
                  </button>
                )}
              </div>

              {/* Week Filter - Wraps on mobile */}
              <div className="p-2 sm:p-3 border-b border-[var(--background-tertiary)] bg-[var(--background-secondary)]">
                <div className="flex gap-1.5 sm:gap-2 flex-wrap">
                  {weeks.map((week) => {
                    // Check if all matches in this week have picks
                    const allPicked = week.matches.every((m) => myPicks.some((p) => p.matchId === m.id));
                    const locked = isWeekLocked(week.week);
                    return (
                      <button
                        key={week.week}
                        onClick={() => !locked && setSelectedWeek(week.week)}
                        disabled={locked}
                        title={locked ? "Opens when previous week has results" : undefined}
                        className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-bold transition-all flex items-center gap-1 sm:gap-1.5 ${
                          locked
                            ? "bg-[var(--background-tertiary)]/50 text-[var(--foreground-muted)]/50 cursor-not-allowed"
                            : selectedWeek === week.week
                              ? "bg-[var(--primary)] text-white"
                              : "bg-[var(--background-tertiary)] text-[var(--foreground-muted)] hover:text-white"
                        }`}
                      >
                        {locked && (
                          <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        )}
                        {week.week >= 101 ? getWeekLabel(week.week) : `W${week.week}`}
                        {!locked && allPicked && (
                          <svg className="w-3 h-3 text-[var(--success)]" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Division Filter */}
              {(() => {
                // Get unique divisions from the selected week's matches
                const selectedWeekData = weeks.find((w) => w.week === selectedWeek);
                if (!selectedWeekData) return null;

                const divisions = Array.from(
                  new Map(
                    selectedWeekData.matches.map((m) => [m.division.id, m.division])
                  ).values()
                ).sort(compareDivisions);

                if (divisions.length <= 1) return null;

                // Auto-select first division if none selected
                if (selectedDivision === null && divisions.length > 0) {
                  setTimeout(() => setSelectedDivision(divisions[0].id), 0);
                }

                return (
                  <div className="px-2 sm:px-3 py-2 border-b border-[var(--background-tertiary)]">
                    <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
                      <div className="flex gap-1.5 sm:gap-2 sm:flex-wrap min-w-max sm:min-w-0">
                        {divisions.map((div) => {
                          const divMatches = selectedWeekData.matches.filter((m) => m.division.id === div.id);
                          const allPicked = divMatches.every((m) => myPicks.some((p) => p.matchId === m.id));
                          return (
                            <button
                              key={div.id}
                              onClick={() => setSelectedDivision(div.id)}
                              className={`px-2 sm:px-3 py-1 rounded text-[10px] sm:text-xs font-medium transition-all flex items-center gap-1 sm:gap-1.5 whitespace-nowrap ${
                                selectedDivision === div.id
                                  ? "bg-[var(--accent)] text-white"
                                  : "bg-[var(--background-tertiary)] text-[var(--foreground-muted)] hover:text-white"
                              }`}
                            >
                              {div.name}
                              {allPicked && (
                                <svg className="w-3 h-3 text-[var(--success)]" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {error && (
                <div className="p-4 bg-[var(--error)]/10 border-b border-[var(--error)]">
                  <p className="text-sm text-[var(--error)]">{error}</p>
                </div>
              )}

              <div className="divide-y divide-[var(--background-tertiary)]">
                {weeks
                  .filter((week) => week.week === selectedWeek)
                  .map((week) => {
                    // Filter matches by division if selected
                    const filteredMatches = selectedDivision === null
                      ? week.matches
                      : week.matches.filter((m) => m.division.id === selectedDivision);

                    return (
                  <div key={week.week} className="p-2 sm:p-4">
                    <h3 className="font-bold text-[var(--accent)] mb-2 sm:mb-3 text-sm sm:text-base">
                      {getWeekLabel(week.week)}
                      {selectedDivision !== null && (
                        <span className="ml-2 text-xs sm:text-sm font-normal text-[var(--foreground-muted)]">
                          ({filteredMatches[0]?.division.name})
                        </span>
                      )}
                    </h3>
                    <div className="space-y-4 sm:space-y-3 divide-y divide-[var(--background-tertiary)] sm:divide-y-0">
                      {filteredMatches.map((match) => {
                        const currentPick = localPicks.get(match.id);
                        const serverPick = myPicks.find((p) => p.matchId === match.id);
                        const isChanged = currentPick !== serverPick?.predictedWinnerId;
                        const hasSavedPick = serverPick !== undefined;
                        const stats = pickStats[match.id];
                        const coach1Pct = stats && stats.totalPicks > 0
                          ? Math.round((stats.coach1Picks / stats.totalPicks) * 100)
                          : 0;
                        const coach2Pct = stats && stats.totalPicks > 0
                          ? Math.round((stats.coach2Picks / stats.totalPicks) * 100)
                          : 0;

                        // Check if match is completed or underway
                        const isCompleted = match.winnerId !== null;
                        const isUnderway = !isCompleted && !!match.scheduledAt && new Date(match.scheduledAt).getTime() <= Date.now();
                        const isLocked = isCompleted || isUnderway;
                        const userPickedCorrectly = isCompleted && serverPick && serverPick.predictedWinnerId === match.winnerId;
                        const userPickedWrong = isCompleted && serverPick && serverPick.predictedWinnerId !== match.winnerId;
                        const userMissedPick = isCompleted && !serverPick;

                        return (
                          <div
                            key={match.id}
                            className={`pt-4 first:pt-0 sm:pt-0 sm:p-3 sm:rounded-lg sm:bg-[var(--background-secondary)] ${
                              isChanged && !isLocked ? "sm:ring-2 sm:ring-[var(--accent)]" : ""
                            } ${isLocked ? "opacity-90" : ""}`}
                          >
                            <div className="flex items-start sm:items-center justify-between gap-2 mb-2">
                              <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                                <span className="text-[10px] sm:text-xs text-[var(--foreground-muted)]">
                                  {match.division.name}
                                </span>
                                {match.isGameOfTheWeek && (
                                  <span className="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold bg-yellow-500/20 text-yellow-400 flex items-center gap-1">
                                    <span>★</span>
                                    GOTW
                                  </span>
                                )}
                                {isUnderway && (
                                  <span className="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold bg-[var(--error)]/20 text-[var(--error)] flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--error)] animate-pulse" />
                                    UNDERWAY
                                  </span>
                                )}
                                {isCompleted && (
                                  <span className="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold bg-[var(--background-tertiary)] text-[var(--foreground-muted)]">
                                    PLAYED
                                  </span>
                                )}
                                {userPickedCorrectly && (
                                  <span className="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold bg-[var(--success)]/20 text-[var(--success)]">
                                    CORRECT
                                  </span>
                                )}
                                {userPickedWrong && (
                                  <span className="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold bg-[var(--error)]/20 text-[var(--error)]">
                                    WRONG
                                  </span>
                                )}
                                {userMissedPick && (
                                  <span className="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold bg-[var(--foreground-muted)]/20 text-[var(--foreground-muted)]">
                                    MISSED
                                  </span>
                                )}
                              </div>
                              <a
                                href={`/matches/${match.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] sm:text-xs text-[var(--primary)] hover:underline flex items-center gap-1 shrink-0"
                              >
                                {isCompleted ? "View" : isUnderway ? "Live" : "Preview"}
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            </div>
                            {/* Mobile: stacked layout */}
                            <div className="flex flex-col gap-1.5 sm:hidden">
                              {/* Team 1 */}
                              {(() => {
                                // Use prior ELO for completed matches
                                const elo1 = isCompleted && match.coach1EloBefore ? match.coach1EloBefore : match.coach1.coach.eloRating;
                                const elo2 = isCompleted && match.coach2EloBefore ? match.coach2EloBefore : match.coach2.coach.eloRating;
                                const winProb = 1 / (1 + Math.pow(3, (elo2 - elo1) / 400));
                                const isFavored = winProb > 0.5;
                                return (
                                  <button
                                    onClick={() => !isLocked && handlePick(match.id, match.coach1.id)}
                                    disabled={isLocked}
                                    className={`flex items-center gap-2 p-2 rounded-md transition-all ${
                                      isCompleted
                                        ? match.winnerId === match.coach1.id
                                          ? "bg-[var(--success)]/30 ring-2 ring-[var(--success)]"
                                          : serverPick?.predictedWinnerId === match.coach1.id
                                            ? "bg-[var(--error)]/20"
                                            : "bg-[var(--background-tertiary)]/50"
                                        : isUnderway
                                          ? serverPick?.predictedWinnerId === match.coach1.id
                                            ? "bg-[var(--primary)]/50 text-white/70"
                                            : "bg-[var(--background-tertiary)]/50"
                                          : currentPick === match.coach1.id
                                            ? "bg-[var(--primary)] text-white"
                                            : "bg-[var(--background-tertiary)] hover:bg-[var(--background-tertiary)]/70"
                                    } ${isLocked ? "cursor-default" : "cursor-pointer"}`}
                                  >
                                    <TeamLogo url={match.coach1.teamLogoUrl} teamName={match.coach1.teamName} size={28} />
                                    <div className="flex-1 min-w-0 text-left">
                                      <div className="text-xs font-bold truncate flex items-center gap-1">
                                        {match.coach1.teamName}
                                        {isCompleted && match.winnerId === match.coach1.id && (
                                          <svg className="w-3.5 h-3.5 text-[var(--success)] shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                          </svg>
                                        )}
                                      </div>
                                      <div className={`flex items-center gap-1.5 text-[10px] ${
                                        isCompleted
                                          ? "text-[var(--foreground-muted)]"
                                          : currentPick === match.coach1.id
                                            ? "text-white/70"
                                            : "text-[var(--foreground-muted)]"
                                      }`}>
                                        <span className="font-bold">#{match.coach1Standing.position}</span>
                                        <span className="opacity-40">·</span>
                                        <span>{match.coach1Standing.wins}-{match.coach1Standing.losses}</span>
                                        <span className="opacity-40">·</span>
                                        <span className="font-mono">{Math.round(elo1)}<span className="opacity-60 ml-0.5 text-[9px]">ELO</span></span>
                                      </div>
                                    </div>
                                    <div className={`text-right shrink-0 ${
                                      isCompleted
                                        ? "text-[var(--foreground-muted)]"
                                        : currentPick === match.coach1.id
                                          ? "text-white"
                                          : ""
                                    }`}>
                                      <div className={`text-sm font-bold ${isFavored ? "text-[var(--success)]" : ""}`}>
                                        {Math.round(winProb * 100)}%
                                      </div>
                                      {(hasSavedPick || isCompleted) && stats && stats.totalPicks > 0 && (
                                        <div className="text-[9px] opacity-60">{coach1Pct}% picked</div>
                                      )}
                                    </div>
                                  </button>
                                );
                              })()}

                              {/* VS divider with bet button */}
                              <div className="flex items-center gap-2 px-2">
                                <div className="flex-1 h-px bg-[var(--background-tertiary)]" />
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-[var(--foreground-muted)] font-bold">VS</span>
                                  {/* Bet button */}
                                  {authUser && !isLocked && betting.availableBalance > 0 && !bettingSettings.bettingClosed && (() => {
                                    const existingBet = betting.bets.find(
                                      (b) => b.matchId === match.id && b.status === "pending"
                                    );

                                    return (
                                      <button
                                        onClick={() => {
                                          setBettingOnMatch(bettingOnMatch === match.id ? null : match.id);
                                          if (bettingOnMatch !== match.id) {
                                            fetchKillBetOdds(match.id);
                                          }
                                        }}
                                        className={`w-7 h-7 rounded-full border flex items-center justify-center transition-all active:scale-95 ${
                                          existingBet
                                            ? "bg-[var(--accent)]/20 border-[var(--accent)]/40"
                                            : "bg-[var(--background-tertiary)] border-[var(--glass-border)] hover:bg-[var(--accent)]/20 hover:border-[var(--accent)]/40"
                                        }`}
                                        title={existingBet ? "View/add bets" : "Place a bet"}
                                      >
                                        <svg className={`w-4 h-4 ${existingBet ? "text-[var(--accent)]" : "text-[var(--foreground-muted)]"}`} viewBox="0 0 24 24" fill="currentColor">
                                          <circle cx="12" cy="12" r="10" opacity="0.3"/>
                                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
                                          <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="bold">P</text>
                                        </svg>
                                      </button>
                                    );
                                  })()}
                                  </div>
                                <div className="flex-1 h-px bg-[var(--background-tertiary)]" />
                              </div>

                              {/* Team 2 */}
                              {(() => {
                                // Use prior ELO for completed matches
                                const elo1 = isCompleted && match.coach1EloBefore ? match.coach1EloBefore : match.coach1.coach.eloRating;
                                const elo2 = isCompleted && match.coach2EloBefore ? match.coach2EloBefore : match.coach2.coach.eloRating;
                                const winProb = 1 / (1 + Math.pow(3, (elo1 - elo2) / 400));
                                const isFavored = winProb > 0.5;
                                return (
                                  <button
                                    onClick={() => !isLocked && handlePick(match.id, match.coach2.id)}
                                    disabled={isLocked}
                                    className={`flex items-center gap-2 p-2 rounded-md transition-all ${
                                      isCompleted
                                        ? match.winnerId === match.coach2.id
                                          ? "bg-[var(--success)]/30 ring-2 ring-[var(--success)]"
                                          : serverPick?.predictedWinnerId === match.coach2.id
                                            ? "bg-[var(--error)]/20"
                                            : "bg-[var(--background-tertiary)]/50"
                                        : isUnderway
                                          ? serverPick?.predictedWinnerId === match.coach2.id
                                            ? "bg-[var(--primary)]/50 text-white/70"
                                            : "bg-[var(--background-tertiary)]/50"
                                          : currentPick === match.coach2.id
                                            ? "bg-[var(--primary)] text-white"
                                            : "bg-[var(--background-tertiary)] hover:bg-[var(--background-tertiary)]/70"
                                    } ${isLocked ? "cursor-default" : "cursor-pointer"}`}
                                  >
                                    <TeamLogo url={match.coach2.teamLogoUrl} teamName={match.coach2.teamName} size={28} />
                                    <div className="flex-1 min-w-0 text-left">
                                      <div className="text-xs font-bold truncate flex items-center gap-1">
                                        {match.coach2.teamName}
                                        {isCompleted && match.winnerId === match.coach2.id && (
                                          <svg className="w-3.5 h-3.5 text-[var(--success)] shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                          </svg>
                                        )}
                                      </div>
                                      <div className={`flex items-center gap-1.5 text-[10px] ${
                                        isCompleted
                                          ? "text-[var(--foreground-muted)]"
                                          : currentPick === match.coach2.id
                                            ? "text-white/70"
                                            : "text-[var(--foreground-muted)]"
                                      }`}>
                                        <span className="font-bold">#{match.coach2Standing.position}</span>
                                        <span className="opacity-40">·</span>
                                        <span>{match.coach2Standing.wins}-{match.coach2Standing.losses}</span>
                                        <span className="opacity-40">·</span>
                                        <span className="font-mono">{Math.round(elo2)}<span className="opacity-60 ml-0.5 text-[9px]">ELO</span></span>
                                      </div>
                                    </div>
                                    <div className={`text-right shrink-0 ${
                                      isCompleted
                                        ? "text-[var(--foreground-muted)]"
                                        : currentPick === match.coach2.id
                                          ? "text-white"
                                          : ""
                                    }`}>
                                      <div className={`text-sm font-bold ${isFavored ? "text-[var(--success)]" : ""}`}>
                                        {Math.round(winProb * 100)}%
                                      </div>
                                      {(hasSavedPick || isCompleted) && stats && stats.totalPicks > 0 && (
                                        <div className="text-[9px] opacity-60">{coach2Pct}% picked</div>
                                      )}
                                    </div>
                                  </button>
                                );
                              })()}
                            </div>

                            {/* Desktop: side-by-side layout */}
                            <div className="hidden sm:flex items-stretch gap-3">
                              {/* Team 1 */}
                              <button
                                onClick={() => !isLocked && handlePick(match.id, match.coach1.id)}
                                disabled={isLocked}
                                className={`flex-1 flex flex-col p-3 rounded-md transition-all ${
                                  isCompleted
                                    ? match.winnerId === match.coach1.id
                                      ? "bg-[var(--success)]/30 ring-2 ring-[var(--success)]"
                                      : serverPick?.predictedWinnerId === match.coach1.id
                                        ? "bg-[var(--error)]/20"
                                        : "bg-[var(--background-tertiary)]/50"
                                    : isUnderway
                                      ? serverPick?.predictedWinnerId === match.coach1.id
                                        ? "bg-[var(--primary)]/50 text-white/70"
                                        : "bg-[var(--background-tertiary)]/50"
                                      : currentPick === match.coach1.id
                                        ? "bg-[var(--primary)] text-white"
                                        : "bg-[var(--background-tertiary)] hover:bg-[var(--background-tertiary)]/70"
                                } ${isLocked ? "cursor-default" : "cursor-pointer"}`}
                              >
                                <div className="flex items-center gap-3">
                                  <TeamLogo url={match.coach1.teamLogoUrl} teamName={match.coach1.teamName} size={24} />
                                  <div className="flex-1 min-w-0 text-left">
                                    <div className="text-sm font-bold truncate flex items-center gap-1">
                                      {match.coach1.teamName}
                                      {isCompleted && match.winnerId === match.coach1.id && (
                                        <svg className="w-4 h-4 text-[var(--success)] shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                      )}
                                    </div>
                                  </div>
                                  {(() => {
                                    // Use prior ELO for completed matches
                                    const elo1 = isCompleted && match.coach1EloBefore ? match.coach1EloBefore : match.coach1.coach.eloRating;
                                    const elo2 = isCompleted && match.coach2EloBefore ? match.coach2EloBefore : match.coach2.coach.eloRating;
                                    const winProb = 1 / (1 + Math.pow(3, (elo2 - elo1) / 400));
                                    const isFavored = winProb > 0.5;
                                    return (
                                      <div className={`flex items-center gap-1.5 text-xs shrink-0 ${
                                        isCompleted
                                          ? "text-[var(--foreground-muted)]"
                                          : currentPick === match.coach1.id
                                            ? "text-white/80"
                                            : "text-[var(--foreground-muted)]"
                                      }`}>
                                        <span className="font-bold">#{match.coach1Standing.position}</span>
                                        <span className="opacity-40">·</span>
                                        <span>{match.coach1Standing.wins}-{match.coach1Standing.losses}</span>
                                        <span className="opacity-40">·</span>
                                        <span className="font-mono">{Math.round(elo1)}<span className="opacity-60 ml-0.5 text-[10px]">ELO</span></span>
                                        <span className="opacity-40">·</span>
                                        <span className={`font-bold ${isFavored ? "text-[var(--success)]" : ""}`}>
                                          {Math.round(winProb * 100)}% win
                                        </span>
                                      </div>
                                    );
                                  })()}
                                </div>
                                {(hasSavedPick || isCompleted) && stats && stats.totalPicks > 0 && (
                                  <div className="mt-2 pt-2 border-t border-white/20">
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1 h-1.5 bg-black/20 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full ${
                                            isCompleted
                                              ? match.winnerId === match.coach1.id
                                                ? "bg-[var(--success)]"
                                                : "bg-[var(--foreground-muted)]"
                                              : currentPick === match.coach1.id
                                                ? "bg-white"
                                                : "bg-[var(--primary)]"
                                          }`}
                                          style={{ width: `${coach1Pct}%` }}
                                        />
                                      </div>
                                      <span className={`text-xs font-bold ${
                                        isCompleted
                                          ? "text-[var(--foreground)]"
                                          : currentPick === match.coach1.id
                                            ? "text-white"
                                            : "text-[var(--foreground)]"
                                      }`}>
                                        {coach1Pct}% picked
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </button>

                              <div className="flex flex-col items-center gap-1 shrink-0">
                                <span className="text-xs text-[var(--foreground-muted)] font-bold">
                                  vs
                                </span>
                                {/* Bet button */}
                                {authUser && !isLocked && betting.availableBalance > 0 && !bettingSettings.bettingClosed && (() => {
                                  const existingBet = betting.bets.find(
                                    (b) => b.matchId === match.id && b.status === "pending"
                                  );

                                  return (
                                    <button
                                      onClick={() => {
                                        setBettingOnMatch(bettingOnMatch === match.id ? null : match.id);
                                        if (bettingOnMatch !== match.id) {
                                          fetchKillBetOdds(match.id);
                                          fetchDeathBetOdds(match.id);
                                        }
                                      }}
                                      className={`w-8 h-8 sm:w-6 sm:h-6 rounded-full border flex items-center justify-center transition-all group active:scale-95 ${
                                        existingBet
                                          ? "bg-[var(--accent)]/20 border-[var(--accent)]/40"
                                          : "bg-[var(--background-tertiary)] border-[var(--glass-border)] hover:bg-[var(--accent)]/20 hover:border-[var(--accent)]/40"
                                      }`}
                                      title={existingBet ? "View/add bets" : "Place a bet"}
                                    >
                                      <svg className={`w-4 h-4 sm:w-3.5 sm:h-3.5 transition-colors ${existingBet ? "text-[var(--accent)]" : "text-[var(--foreground-muted)] group-hover:text-[var(--accent)]"}`} viewBox="0 0 24 24" fill="currentColor">
                                        <circle cx="12" cy="12" r="10" opacity="0.3"/>
                                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
                                        <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="bold">P</text>
                                      </svg>
                                    </button>
                                  );
                                })()}
                                </div>

                              {/* Team 2 */}
                              <button
                                onClick={() => !isLocked && handlePick(match.id, match.coach2.id)}
                                disabled={isLocked}
                                className={`flex-1 flex flex-col p-3 rounded-md transition-all ${
                                  isCompleted
                                    ? match.winnerId === match.coach2.id
                                      ? "bg-[var(--success)]/30 ring-2 ring-[var(--success)]"
                                      : serverPick?.predictedWinnerId === match.coach2.id
                                        ? "bg-[var(--error)]/20"
                                        : "bg-[var(--background-tertiary)]/50"
                                    : isUnderway
                                      ? serverPick?.predictedWinnerId === match.coach2.id
                                        ? "bg-[var(--primary)]/50 text-white/70"
                                        : "bg-[var(--background-tertiary)]/50"
                                      : currentPick === match.coach2.id
                                        ? "bg-[var(--primary)] text-white"
                                        : "bg-[var(--background-tertiary)] hover:bg-[var(--background-tertiary)]/70"
                                } ${isLocked ? "cursor-default" : "cursor-pointer"}`}
                              >
                                <div className="flex items-center gap-3">
                                  <TeamLogo url={match.coach2.teamLogoUrl} teamName={match.coach2.teamName} size={24} />
                                  <div className="flex-1 min-w-0 text-left">
                                    <div className="text-sm font-bold truncate flex items-center gap-1">
                                      {match.coach2.teamName}
                                      {isCompleted && match.winnerId === match.coach2.id && (
                                        <svg className="w-4 h-4 text-[var(--success)] shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                      )}
                                    </div>
                                  </div>
                                  {(() => {
                                    // Use prior ELO for completed matches
                                    const elo1 = isCompleted && match.coach1EloBefore ? match.coach1EloBefore : match.coach1.coach.eloRating;
                                    const elo2 = isCompleted && match.coach2EloBefore ? match.coach2EloBefore : match.coach2.coach.eloRating;
                                    const winProb = 1 / (1 + Math.pow(3, (elo1 - elo2) / 400));
                                    const isFavored = winProb > 0.5;
                                    return (
                                      <div className={`flex items-center gap-1.5 text-xs shrink-0 ${
                                        isCompleted
                                          ? "text-[var(--foreground-muted)]"
                                          : currentPick === match.coach2.id
                                            ? "text-white/80"
                                            : "text-[var(--foreground-muted)]"
                                      }`}>
                                        <span className="font-bold">#{match.coach2Standing.position}</span>
                                        <span className="opacity-40">·</span>
                                        <span>{match.coach2Standing.wins}-{match.coach2Standing.losses}</span>
                                        <span className="opacity-40">·</span>
                                        <span className="font-mono">{Math.round(elo2)}<span className="opacity-60 ml-0.5 text-[10px]">ELO</span></span>
                                        <span className="opacity-40">·</span>
                                        <span className={`font-bold ${isFavored ? "text-[var(--success)]" : ""}`}>
                                          {Math.round(winProb * 100)}% win
                                        </span>
                                      </div>
                                    );
                                  })()}
                                </div>
                                {/* Show percentage after saving pick or when completed */}
                                {(hasSavedPick || isCompleted) && stats && stats.totalPicks > 0 && (
                                  <div className="mt-2 pt-2 border-t border-white/20">
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1 h-1.5 bg-black/20 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full ${
                                            isCompleted
                                              ? match.winnerId === match.coach2.id
                                                ? "bg-[var(--success)]"
                                                : "bg-[var(--foreground-muted)]"
                                              : currentPick === match.coach2.id
                                                ? "bg-white"
                                                : "bg-[var(--primary)]"
                                          }`}
                                          style={{ width: `${coach2Pct}%` }}
                                        />
                                      </div>
                                      <span className={`text-xs font-bold ${
                                        isCompleted
                                          ? "text-[var(--foreground)]"
                                          : currentPick === match.coach2.id
                                            ? "text-white"
                                            : "text-[var(--foreground)]"
                                      }`}>
                                        {coach2Pct}% picked
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </button>
                            </div>
                            {/* Total picks indicator - clickable on completed matches */}
                            {(hasSavedPick || isCompleted) && stats && stats.totalPicks > 0 && (
                              <div className="mt-2">
                                {isCompleted ? (
                                  <button
                                    onClick={() => {
                                      if (showPickersForMatch === match.id) {
                                        setShowPickersForMatch(null);
                                      } else {
                                        setShowPickersForMatch(match.id);
                                        fetchMatchPickers(match.id);
                                      }
                                    }}
                                    className="w-full text-center text-[10px] text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors flex items-center justify-center gap-1"
                                  >
                                    <span>{stats.totalPicks} {stats.totalPicks === 1 ? "pick" : "picks"} submitted</span>
                                    <svg
                                      className={`w-3 h-3 transition-transform ${showPickersForMatch === match.id ? "rotate-180" : ""}`}
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </button>
                                ) : (
                                  <div className="text-center text-[10px] text-[var(--foreground-muted)]">
                                    {stats.totalPicks} {stats.totalPicks === 1 ? "pick" : "picks"} submitted
                                  </div>
                                )}
                                {/* Pickers list (only for completed matches) */}
                                {isCompleted && showPickersForMatch === match.id && (
                                  <div className="mt-2 p-2 rounded bg-[var(--background-tertiary)]/50 text-xs">
                                    {loadingPickers === match.id ? (
                                      <div className="text-center text-[var(--foreground-muted)] py-2">Loading...</div>
                                    ) : matchPickers[match.id] ? (
                                      <div className="grid grid-cols-2 gap-2">
                                        {/* Coach 1 pickers */}
                                        <div>
                                          <div className={`text-[10px] font-bold mb-1 ${match.winnerId === match.coach1.id ? "text-[var(--success)]" : "text-[var(--foreground-muted)]"}`}>
                                            {match.coach1.teamName} ({matchPickers[match.id].coach1Pickers.length})
                                          </div>
                                          <div className="space-y-0.5 max-h-24 overflow-y-auto">
                                            {matchPickers[match.id].coach1Pickers.map((picker) => (
                                              <div
                                                key={picker.id}
                                                className={`truncate ${match.winnerId === match.coach1.id ? "text-[var(--success)]" : "text-[var(--error)]"}`}
                                              >
                                                {picker.coachId ? (
                                                  <a href={`/coaches/${picker.coachId}`} className="hover:underline">{picker.name}</a>
                                                ) : (
                                                  picker.name
                                                )}
                                              </div>
                                            ))}
                                            {matchPickers[match.id].coach1Pickers.length === 0 && (
                                              <div className="text-[var(--foreground-muted)] italic">No picks</div>
                                            )}
                                          </div>
                                        </div>
                                        {/* Coach 2 pickers */}
                                        <div>
                                          <div className={`text-[10px] font-bold mb-1 ${match.winnerId === match.coach2.id ? "text-[var(--success)]" : "text-[var(--foreground-muted)]"}`}>
                                            {match.coach2.teamName} ({matchPickers[match.id].coach2Pickers.length})
                                          </div>
                                          <div className="space-y-0.5 max-h-24 overflow-y-auto">
                                            {matchPickers[match.id].coach2Pickers.map((picker) => (
                                              <div
                                                key={picker.id}
                                                className={`truncate ${match.winnerId === match.coach2.id ? "text-[var(--success)]" : "text-[var(--error)]"}`}
                                              >
                                                {picker.coachId ? (
                                                  <a href={`/coaches/${picker.coachId}`} className="hover:underline">{picker.name}</a>
                                                ) : (
                                                  picker.name
                                                )}
                                              </div>
                                            ))}
                                            {matchPickers[match.id].coach2Pickers.length === 0 && (
                                              <div className="text-[var(--foreground-muted)] italic">No picks</div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Betting Section - for any authenticated user on incomplete matches */}
                            {authUser && !isCompleted && (() => {
                              const existingBet = betting.bets.find(
                                (b) => b.matchId === match.id && b.status === "pending"
                              );
                              const existingKillBets = betting.killBets.filter(
                                (kb) => kb.matchId === match.id && kb.status === "pending"
                              );
                              const existingDeathBets = betting.deathBets.filter(
                                (db) => db.matchId === match.id && db.status === "pending"
                              );
                              const localBet = localBets.get(match.id);

                              // Show existing bets summary when NOT in betting mode (and betting UI is not hidden)
                              if (!bettingSettings.bettingUiHidden && (existingBet || existingKillBets.length > 0 || existingDeathBets.length > 0) && bettingOnMatch !== match.id) {
                                return (
                                  <div className="mt-3 pt-3 border-t border-[var(--background-tertiary)] space-y-2">
                                    {/* Winner bet */}
                                    {existingBet && (() => {
                                      const betOnCoach1 = existingBet.predictedWinnerId === match.coach1.id;
                                      const teamName = betOnCoach1 ? match.coach1.teamName : match.coach2.teamName;
                                      const potentialPayout = Math.floor(existingBet.amount * existingBet.odds);
                                      return (
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded bg-[var(--accent)]/10 border border-[var(--accent)]/30">
                                          <div className="text-xs flex flex-wrap items-center gap-x-1 gap-y-0.5">
                                            <span className="font-bold text-[var(--accent)] inline-flex items-center gap-0.5">
                                              {existingBet.amount}
                                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" opacity="0.3"/><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/><text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="bold">P</text></svg>
                                            </span>
                                            <span className="text-[var(--foreground-muted)]">on</span>
                                            <span className="font-bold">{teamName}</span>
                                            <span className="text-[var(--foreground-muted)]">@ {existingBet.odds.toFixed(2)}x</span>
                                            <span className="text-[var(--success)] font-medium">→ +{potentialPayout - existingBet.amount}</span>
                                          </div>
                                          {!isUnderway && (
                                            <button
                                              onClick={() => cancelBet(existingBet.id)}
                                              className="text-xs px-2 py-1 rounded bg-[var(--error)]/10 text-[var(--error)] hover:bg-[var(--error)]/20 transition-colors shrink-0 self-end sm:self-auto"
                                            >
                                              Cancel
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })()}
                                    {/* Kill bets */}
                                    {existingKillBets.map((kb) => {
                                      const pokeName = kb.pokemon?.displayName || kb.pokemon?.name || "Pokemon";
                                      const potentialPayout = Math.floor(kb.amount * kb.odds);
                                      return (
                                        <div key={kb.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded bg-[var(--accent)]/10 border border-[var(--accent)]/30">
                                          <div className="text-xs flex flex-wrap items-center gap-x-1 gap-y-0.5">
                                            <span className="font-bold text-[var(--accent)] inline-flex items-center gap-0.5">
                                              {kb.amount}
                                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" opacity="0.3"/><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/><text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="bold">P</text></svg>
                                            </span>
                                            <span className="text-[var(--foreground-muted)]">on</span>
                                            <span className="font-bold">{pokeName} {kb.killThreshold}+ kills</span>
                                            <span className="text-[var(--foreground-muted)]">@ {kb.odds.toFixed(2)}x</span>
                                            <span className="text-[var(--success)] font-medium">→ +{potentialPayout - kb.amount}</span>
                                          </div>
                                          {!isUnderway && (
                                            <button
                                              onClick={() => cancelKillBet(kb.id)}
                                              className="text-xs px-2 py-1 rounded bg-[var(--error)]/10 text-[var(--error)] hover:bg-[var(--error)]/20 transition-colors shrink-0 self-end sm:self-auto"
                                            >
                                              Cancel
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })}
                                    {/* Death bets */}
                                    {existingDeathBets.map((db) => {
                                      const pokeName = db.pokemon?.displayName || db.pokemon?.name || "Pokemon";
                                      const potentialPayout = Math.floor(db.amount * db.odds);
                                      return (
                                        <div key={db.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded bg-[var(--accent)]/10 border border-[var(--accent)]/30">
                                          <div className="text-xs flex flex-wrap items-center gap-x-1 gap-y-0.5">
                                            <span className="font-bold text-[var(--accent)] inline-flex items-center gap-0.5">
                                              {db.amount}
                                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" opacity="0.3"/><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/><text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="bold">P</text></svg>
                                            </span>
                                            <span className="text-[var(--foreground-muted)]">on</span>
                                            <span className="font-bold">{pokeName} {db.betType === "dies" ? "dies" : "survives"}</span>
                                            <span className="text-[var(--foreground-muted)]">@ {db.odds.toFixed(2)}x</span>
                                            <span className="text-[var(--success)] font-medium">→ +{potentialPayout - db.amount}</span>
                                          </div>
                                          {!isUnderway && (
                                            <button
                                              onClick={() => cancelDeathBet(db.id)}
                                              className="text-xs px-2 py-1 rounded bg-[var(--error)]/10 text-[var(--error)] hover:bg-[var(--error)]/20 transition-colors shrink-0 self-end sm:self-auto"
                                            >
                                              Cancel
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              }

                              // Show bet input form when triggered by coin button
                              if (bettingOnMatch === match.id) {
                                // Default to pick-em choice, then localBet, then coach1
                                const betWinnerId = localBet?.winnerId || currentPick || match.coach1.id;
                                const betOnCoach1 = betWinnerId === match.coach1.id;
                                const playerElo = betOnCoach1 ? match.coach1.coach.eloRating : match.coach2.coach.eloRating;
                                const opponentElo = betOnCoach1 ? match.coach2.coach.eloRating : match.coach1.coach.eloRating;
                                const odds = calculateOdds(playerElo, opponentElo);
                                const betAmount = localBet?.amount || 10;
                                const potentialPayout = Math.floor(betAmount * odds);

                                // Calculate odds for both teams for the dropdown
                                const coach1Odds = calculateOdds(match.coach1.coach.eloRating, match.coach2.coach.eloRating);
                                const coach2Odds = calculateOdds(match.coach2.coach.eloRating, match.coach1.coach.eloRating);

                                // Kill bet state - now supports multiple bets per match
                                const matchKillOdds = killBetOdds.get(match.id) || [];
                                const isLoadingKillOdds = killBetLoading.has(match.id);
                                const killBetSlots = localKillBets.get(match.id) || [{ pokemonId: 0, threshold: 1, amount: 10 }];
                                const existingKillBets = betting.killBets.filter(kb => kb.matchId === match.id && kb.status === "pending");

                                // Death bet state
                                const matchDeathOdds = deathBetOdds.get(match.id) || [];
                                const isLoadingDeathOdds = deathBetLoading.has(match.id);
                                const deathBetSlots = localDeathBets.get(match.id) || [{ pokemonId: 0, betType: "dies" as const, amount: 10 }];
                                const existingDeathBets = betting.deathBets.filter(db => db.matchId === match.id && db.status === "pending");

                                return (
                                  <div className="mt-3 pt-3 border-t border-[var(--background-tertiary)] space-y-3">
                                    {/* Balance display */}
                                    <div className="flex items-center gap-2 text-xs">
                                      <span className="text-[var(--foreground-muted)]">Balance:</span>
                                      <span className="font-bold text-[var(--accent)] inline-flex items-center gap-0.5">
                                        {betting.availableBalance}
                                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" opacity="0.3"/><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/><text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="bold">P</text></svg>
                                      </span>
                                      {betting.totalPending > 0 && (
                                        <span className="text-[var(--foreground-muted)]">({betting.totalPending} pending)</span>
                                      )}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                      {/* Left: Winner Bet */}
                                      <div className={`p-3 rounded bg-[var(--background-tertiary)]/50 border border-[var(--glass-border)]/50 ${existingBet ? "flex flex-col gap-2" : "space-y-2"}`}>
                                        {existingBet ? (
                                          // Show existing bet
                                          <>
                                            <div className="flex items-center justify-between">
                                              <span className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase">Winner</span>
                                              <span className="text-xs font-bold text-[var(--accent)]">{existingBet.odds.toFixed(2)}x</span>
                                            </div>
                                            <div className="text-xs font-bold truncate">
                                              {existingBet.predictedWinnerId === match.coach1.id ? match.coach1.teamName : match.coach2.teamName}
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs font-bold text-[var(--accent)] inline-flex items-center gap-0.5">
                                                {existingBet.amount}
                                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" opacity="0.3"/><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/><text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="bold">P</text></svg>
                                              </span>
                                              <span className="text-[10px] text-[var(--success)]">+{Math.floor(existingBet.amount * existingBet.odds) - existingBet.amount}</span>
                                            </div>
                                            <div className="flex-1" />
                                            <button
                                              onClick={() => cancelBet(existingBet.id)}
                                              className="self-start px-3 py-1 text-xs font-bold bg-[var(--error)]/20 text-[var(--error)] rounded hover:bg-[var(--error)]/30 active:scale-95 transition-transform"
                                            >
                                              Cancel Bet
                                            </button>
                                          </>
                                        ) : (
                                          // Show new bet form
                                          <>
                                            <div className="flex items-center justify-between">
                                              <span className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase">Winner</span>
                                              <span className="text-xs font-bold text-[var(--accent)]">{odds.toFixed(2)}x</span>
                                            </div>
                                            <select
                                              value={betWinnerId}
                                              onChange={(e) => {
                                                const winnerId = parseInt(e.target.value);
                                                setLocalBets((prev) => {
                                                  const next = new Map(prev);
                                                  next.set(match.id, { amount: betAmount, winnerId });
                                                  return next;
                                                });
                                              }}
                                              className="w-full px-1 py-1 text-xs font-bold bg-[var(--background-secondary)] border border-[var(--glass-border)] rounded focus:border-[var(--accent)]/50 focus:outline-none"
                                            >
                                              <option value={match.coach1.id}>
                                                {match.coach1.teamName} ({coach1Odds.toFixed(2)}x)
                                              </option>
                                              <option value={match.coach2.id}>
                                                {match.coach2.teamName} ({coach2Odds.toFixed(2)}x)
                                              </option>
                                            </select>
                                            <div className="flex items-center gap-2">
                                              <input
                                                type="number"
                                                min="1"
                                                max={betting.availableBalance}
                                                value={betAmount}
                                                onChange={(e) => {
                                                  const amt = Math.max(1, Math.min(betting.availableBalance, parseInt(e.target.value) || 1));
                                                  setLocalBets((prev) => {
                                                    const next = new Map(prev);
                                                    next.set(match.id, { amount: amt, winnerId: betWinnerId });
                                                    return next;
                                                  });
                                                }}
                                                className="w-14 px-2 py-1 text-xs bg-[var(--background-secondary)] border border-[var(--glass-border)] rounded focus:border-[var(--accent)]/50 focus:outline-none"
                                              />
                                              <span className="text-[10px] text-[var(--success)]">+{potentialPayout - betAmount}</span>
                                            </div>
                                            <button
                                              onClick={() => placeBet(match.id, betWinnerId, betAmount)}
                                              disabled={betAmount < 1 || betAmount > betting.availableBalance}
                                              className="px-3 py-1 text-xs font-bold bg-[var(--accent)] text-black rounded hover:bg-[var(--accent)]/80 disabled:opacity-50 active:scale-95 transition-transform"
                                            >
                                              Place Bet
                                            </button>
                                          </>
                                        )}
                                      </div>

                                      {/* Existing Kill Bets */}
                                      {existingKillBets.map((kb) => (
                                        <div key={kb.id} className="p-3 rounded bg-[var(--background-tertiary)]/50 border border-[var(--accent)]/30 flex flex-col gap-2">
                                          <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase">Kills</span>
                                            <span className="text-xs font-bold text-[var(--accent)]">{kb.odds.toFixed(2)}x</span>
                                          </div>
                                          <div className="text-xs font-bold truncate">
                                            {kb.pokemon?.displayName || kb.pokemon?.name || "Pokemon"} {kb.killThreshold}+
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-[var(--accent)] inline-flex items-center gap-0.5">
                                              {kb.amount}
                                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" opacity="0.3"/><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/><text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="bold">P</text></svg>
                                            </span>
                                            <span className="text-[10px] text-[var(--success)]">+{Math.floor(kb.amount * kb.odds) - kb.amount}</span>
                                          </div>
                                          <div className="flex-1" />
                                          <button
                                            onClick={() => cancelKillBet(kb.id)}
                                            className="self-start px-3 py-1 text-xs font-bold bg-[var(--error)]/20 text-[var(--error)] rounded hover:bg-[var(--error)]/30 active:scale-95 transition-transform"
                                          >
                                            Cancel Bet
                                          </button>
                                        </div>
                                      ))}

                                      {/* Existing Death Bets */}
                                      {existingDeathBets.map((db) => (
                                        <div key={db.id} className="p-3 rounded bg-[var(--background-tertiary)]/50 border border-[var(--accent)]/30 flex flex-col gap-2">
                                          <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase">Death</span>
                                            <span className="text-xs font-bold text-[var(--accent)]">{db.odds.toFixed(2)}x</span>
                                          </div>
                                          <div className="text-xs font-bold truncate">
                                            {db.pokemon?.displayName || db.pokemon?.name || "Pokemon"} {db.betType === "dies" ? "dies" : "survives"}
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-[var(--accent)] inline-flex items-center gap-0.5">
                                              {db.amount}
                                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" opacity="0.3"/><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/><text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="bold">P</text></svg>
                                            </span>
                                            <span className="text-[10px] text-[var(--success)]">+{Math.floor(db.amount * db.odds) - db.amount}</span>
                                          </div>
                                          <div className="flex-1" />
                                          <button
                                            onClick={() => cancelDeathBet(db.id)}
                                            className="self-start px-3 py-1 text-xs font-bold bg-[var(--error)]/20 text-[var(--error)] rounded hover:bg-[var(--error)]/30 active:scale-95 transition-transform"
                                          >
                                            Cancel Bet
                                          </button>
                                        </div>
                                      ))}

                                      {/* Kill Bet Slots */}
                                      {killBetSlots.map((slot, slotIndex) => {
                                        const selectedKillPokemon = slot.pokemonId ? matchKillOdds.find(p => p.pokemonId === slot.pokemonId) : null;
                                        const killOddsData = selectedKillPokemon?.thresholds.find(t => t.threshold === (slot.threshold ?? 1));
                                        const killOdds = killOddsData?.overOdds || 0;
                                        const killPotentialPayout = Math.floor((slot.amount ?? 10) * killOdds);

                                        return (
                                          <div key={slotIndex} className="p-3 rounded bg-[var(--background-tertiary)]/50 border border-[var(--glass-border)]/50 space-y-2">
                                            <div className="flex items-center justify-between">
                                              <span className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase">Kills</span>
                                              <span className="text-xs font-bold text-[var(--accent)]">{selectedKillPokemon ? `${killOdds.toFixed(2)}x` : "-"}</span>
                                            </div>
                                            {isLoadingKillOdds ? (
                                              <div className="text-xs text-[var(--foreground-muted)] py-1">Loading...</div>
                                            ) : (
                                              <>
                                                <div className="flex items-center gap-1">
                                                  <select
                                                    value={slot.pokemonId || ""}
                                                    onChange={(e) => {
                                                      const pokemonId = parseInt(e.target.value);
                                                      setLocalKillBets((prev) => {
                                                        const next = new Map(prev);
                                                        const slots = [...(prev.get(match.id) || [])];
                                                        slots[slotIndex] = { ...slots[slotIndex], pokemonId };
                                                        next.set(match.id, slots);
                                                        return next;
                                                      });
                                                    }}
                                                    className="flex-1 min-w-0 px-1 py-1 text-xs bg-[var(--background-secondary)] border border-[var(--glass-border)] rounded focus:border-[var(--accent)]/50 focus:outline-none"
                                                  >
                                                    <option value="">Pokemon...</option>
                                                    {matchKillOdds.map((p) => {
                                                      const pOdds = p.thresholds.find(t => t.threshold === (slot.threshold ?? 1))?.overOdds || 0;
                                                      const teamAbbr = p.teamAbbreviation || p.teamName.split(" ")[0].slice(0, 3);
                                                      return (
                                                        <option key={p.pokemonId} value={p.pokemonId}>
                                                          {p.displayName || p.pokemonName} ({teamAbbr}) {pOdds.toFixed(1)}x
                                                        </option>
                                                      );
                                                    })}
                                                  </select>
                                                  <div className="flex items-center border border-[var(--glass-border)] rounded overflow-hidden shrink-0">
                                                    <button
                                                      onClick={() => {
                                                        setLocalKillBets((prev) => {
                                                          const next = new Map(prev);
                                                          const slots = [...(prev.get(match.id) || [])];
                                                          slots[slotIndex] = { ...slots[slotIndex], threshold: Math.max(1, (slot.threshold ?? 1) - 1) };
                                                          next.set(match.id, slots);
                                                          return next;
                                                        });
                                                      }}
                                                      className="px-1 py-0.5 text-xs bg-[var(--background-secondary)] hover:bg-[var(--background-tertiary)]"
                                                    >
                                                      -
                                                    </button>
                                                    <span className="px-1.5 py-0.5 text-xs font-bold bg-[var(--background-secondary)] min-w-[24px] text-center">{slot.threshold ?? 1}+</span>
                                                    <button
                                                      onClick={() => {
                                                        setLocalKillBets((prev) => {
                                                          const next = new Map(prev);
                                                          const slots = [...(prev.get(match.id) || [])];
                                                          slots[slotIndex] = { ...slots[slotIndex], threshold: Math.min(6, (slot.threshold ?? 1) + 1) };
                                                          next.set(match.id, slots);
                                                          return next;
                                                        });
                                                      }}
                                                      className="px-1 py-0.5 text-xs bg-[var(--background-secondary)] hover:bg-[var(--background-tertiary)]"
                                                    >
                                                      +
                                                    </button>
                                                  </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                  <input
                                                    type="number"
                                                    min="1"
                                                    max={betting.availableBalance}
                                                    value={slot.amount ?? 10}
                                                    onChange={(e) => {
                                                      const amt = Math.max(1, Math.min(betting.availableBalance, parseInt(e.target.value) || 1));
                                                      setLocalKillBets((prev) => {
                                                        const next = new Map(prev);
                                                        const slots = [...(prev.get(match.id) || [])];
                                                        slots[slotIndex] = { ...slots[slotIndex], amount: amt };
                                                        next.set(match.id, slots);
                                                        return next;
                                                      });
                                                    }}
                                                    className="w-14 px-2 py-1 text-xs bg-[var(--background-secondary)] border border-[var(--glass-border)] rounded focus:border-[var(--accent)]/50 focus:outline-none"
                                                  />
                                                  {selectedKillPokemon && (
                                                    <span className="text-[10px] text-[var(--success)]">+{killPotentialPayout - (slot.amount ?? 10)}</span>
                                                  )}
                                                </div>
                                                <button
                                                  onClick={() => selectedKillPokemon && placeKillBet(match.id, selectedKillPokemon.pokemonId, selectedKillPokemon.seasonCoachId, slot.threshold ?? 1, slot.amount ?? 10)}
                                                  disabled={!selectedKillPokemon || (slot.amount ?? 10) < 1 || (slot.amount ?? 10) > betting.availableBalance}
                                                  className="px-3 py-1 text-xs font-bold bg-[var(--accent)] text-black rounded hover:bg-[var(--accent)]/80 disabled:opacity-50 active:scale-95 transition-transform"
                                                >
                                                  Place Bet
                                                </button>
                                              </>
                                            )}
                                          </div>
                                        );
                                      })}

                                      {/* Death Bet Slots */}
                                      {deathBetSlots.map((slot, slotIndex) => {
                                        const selectedDeathPokemon = slot.pokemonId ? matchDeathOdds.find(p => p.pokemonId === slot.pokemonId) : null;
                                        const deathOdds = selectedDeathPokemon ? (slot.betType === "dies" ? selectedDeathPokemon.diesOdds : selectedDeathPokemon.survivesOdds) : 0;
                                        const deathPotentialPayout = Math.floor((slot.amount ?? 10) * deathOdds);

                                        return (
                                          <div key={`death-${slotIndex}`} className="p-3 rounded bg-[var(--background-tertiary)]/50 border border-[var(--glass-border)]/50 space-y-2">
                                            <div className="flex items-center justify-between">
                                              <span className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase">Death</span>
                                              <span className="text-xs font-bold text-[var(--accent)]">{selectedDeathPokemon ? `${deathOdds.toFixed(2)}x` : "-"}</span>
                                            </div>
                                            {isLoadingDeathOdds ? (
                                              <div className="text-xs text-[var(--foreground-muted)] py-1">Loading...</div>
                                            ) : (
                                              <>
                                                <div className="flex items-center gap-1">
                                                  <select
                                                    value={slot.pokemonId || ""}
                                                    onChange={(e) => {
                                                      const pokemonId = parseInt(e.target.value);
                                                      setLocalDeathBets((prev) => {
                                                        const next = new Map(prev);
                                                        const defaultSlot = { pokemonId: 0, betType: "dies" as const, amount: 10 };
                                                        const slots = [...(prev.get(match.id) || [defaultSlot])];
                                                        slots[slotIndex] = { ...(slots[slotIndex] || defaultSlot), pokemonId };
                                                        next.set(match.id, slots);
                                                        return next;
                                                      });
                                                    }}
                                                    className="flex-1 min-w-0 px-1 py-1 text-xs bg-[var(--background-secondary)] border border-[var(--glass-border)] rounded focus:border-[var(--accent)]/50 focus:outline-none"
                                                  >
                                                    <option value="">Pokemon...</option>
                                                    {matchDeathOdds.map((p) => {
                                                      const pOdds = slot.betType === "dies" ? p.diesOdds : p.survivesOdds;
                                                      const teamAbbr = p.teamAbbreviation || p.teamName.split(" ")[0].slice(0, 3);
                                                      return (
                                                        <option key={p.pokemonId} value={p.pokemonId}>
                                                          {p.displayName || p.pokemonName} ({teamAbbr}) {pOdds.toFixed(1)}x
                                                        </option>
                                                      );
                                                    })}
                                                  </select>
                                                  <select
                                                    value={slot.betType}
                                                    onChange={(e) => {
                                                      const betType = e.target.value as "dies" | "survives";
                                                      setLocalDeathBets((prev) => {
                                                        const next = new Map(prev);
                                                        const defaultSlot = { pokemonId: 0, betType: "dies" as const, amount: 10 };
                                                        const slots = [...(prev.get(match.id) || [defaultSlot])];
                                                        slots[slotIndex] = { ...(slots[slotIndex] || defaultSlot), betType };
                                                        next.set(match.id, slots);
                                                        return next;
                                                      });
                                                    }}
                                                    className="px-1 py-1 text-xs bg-[var(--background-secondary)] border border-[var(--glass-border)] rounded focus:border-[var(--accent)]/50 focus:outline-none shrink-0"
                                                  >
                                                    <option value="dies">Dies</option>
                                                    <option value="survives">Survives</option>
                                                  </select>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                  <input
                                                    type="number"
                                                    min="1"
                                                    max={betting.availableBalance}
                                                    value={slot.amount ?? 10}
                                                    onChange={(e) => {
                                                      const amt = Math.max(1, Math.min(betting.availableBalance, parseInt(e.target.value) || 1));
                                                      setLocalDeathBets((prev) => {
                                                        const next = new Map(prev);
                                                        const defaultSlot = { pokemonId: 0, betType: "dies" as const, amount: 10 };
                                                        const slots = [...(prev.get(match.id) || [defaultSlot])];
                                                        slots[slotIndex] = { ...(slots[slotIndex] || defaultSlot), amount: amt };
                                                        next.set(match.id, slots);
                                                        return next;
                                                      });
                                                    }}
                                                    className="w-14 px-2 py-1 text-xs bg-[var(--background-secondary)] border border-[var(--glass-border)] rounded focus:border-[var(--accent)]/50 focus:outline-none"
                                                  />
                                                  {selectedDeathPokemon && (
                                                    <span className="text-[10px] text-[var(--success)]">+{deathPotentialPayout - (slot.amount ?? 10)}</span>
                                                  )}
                                                </div>
                                                <button
                                                  onClick={() => selectedDeathPokemon && placeDeathBet(match.id, selectedDeathPokemon.pokemonId, selectedDeathPokemon.seasonCoachId, slot.betType, slot.amount ?? 10)}
                                                  disabled={!selectedDeathPokemon || (slot.amount ?? 10) < 1 || (slot.amount ?? 10) > betting.availableBalance}
                                                  className="px-3 py-1 text-xs font-bold bg-[var(--accent)] text-black rounded hover:bg-[var(--accent)]/80 disabled:opacity-50 active:scale-95 transition-transform"
                                                >
                                                  Place Bet
                                                </button>
                                              </>
                                            )}
                                          </div>
                                        );
                                      })}

                                      {/* Add Bet Button / Selector */}
                                      {showAddBetSelector === match.id ? (
                                        <div className="flex flex-col gap-1 p-2 rounded bg-[var(--background-tertiary)]/50 border border-[var(--glass-border)]/50 self-center">
                                          <button
                                            onClick={() => {
                                              setLocalKillBets((prev) => {
                                                const next = new Map(prev);
                                                const currentSlots = prev.get(match.id) || [];
                                                next.set(match.id, [...currentSlots, { pokemonId: 0, threshold: 1, amount: 10 }]);
                                                return next;
                                              });
                                              setShowAddBetSelector(null);
                                            }}
                                            className="px-3 py-1 text-xs font-medium bg-[var(--background-secondary)] hover:bg-[var(--accent)]/20 rounded transition-colors"
                                          >
                                            Kills
                                          </button>
                                          <button
                                            onClick={() => {
                                              setLocalDeathBets((prev) => {
                                                const next = new Map(prev);
                                                const currentSlots = prev.get(match.id) || [];
                                                next.set(match.id, [...currentSlots, { pokemonId: 0, betType: "dies" as const, amount: 10 }]);
                                                return next;
                                              });
                                              setShowAddBetSelector(null);
                                            }}
                                            className="px-3 py-1 text-xs font-medium bg-[var(--background-secondary)] hover:bg-[var(--accent)]/20 rounded transition-colors"
                                          >
                                            Death
                                          </button>
                                          <button
                                            onClick={() => setShowAddBetSelector(null)}
                                            className="px-3 py-0.5 text-[10px] text-[var(--foreground-muted)] hover:text-white transition-colors"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => setShowAddBetSelector(match.id)}
                                          className="w-8 h-8 rounded bg-[var(--background-tertiary)]/30 border border-dashed border-[var(--glass-border)]/50 flex items-center justify-center hover:bg-[var(--background-tertiary)]/50 transition-colors self-center"
                                          title="Add another bet"
                                        >
                                          <span className="text-lg text-[var(--foreground-muted)]">+</span>
                                        </button>
                                      )}
                                    </div>

                                    {/* Kill Bet Error (inline) */}
                                    {killBetErrorMatchId === match.id && killBetError && (
                                      <div className="flex items-center justify-center gap-2 p-2 rounded bg-[var(--error)]/10 border border-[var(--error)]/30 text-xs text-[var(--error)]">
                                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        <span>{killBetError}</span>
                                      </div>
                                    )}

                                    {/* Death Bet Error (inline) */}
                                    {deathBetErrorMatchId === match.id && deathBetError && (
                                      <div className="flex items-center justify-center gap-2 p-2 rounded bg-[var(--error)]/10 border border-[var(--error)]/30 text-xs text-[var(--error)]">
                                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        <span>{deathBetError}</span>
                                      </div>
                                    )}

                                    {/* Close button */}
                                    <div className="text-left sm:pl-0">
                                      <button
                                        onClick={() => {
                                          setBettingOnMatch(null);
                                          setShowAddBetSelector(null);
                                          setLocalBets((prev) => {
                                            const next = new Map(prev);
                                            next.delete(match.id);
                                            return next;
                                          });
                                          setLocalKillBets((prev) => {
                                            const next = new Map(prev);
                                            next.delete(match.id);
                                            return next;
                                          });
                                          setLocalDeathBets((prev) => {
                                            const next = new Map(prev);
                                            next.delete(match.id);
                                            return next;
                                          });
                                        }}
                                        className="text-xs text-[var(--foreground-muted)] hover:text-white"
                                      >
                                        Close
                                      </button>
                                    </div>
                                  </div>
                                );
                              }

                              // Show inline error if user clicked bet without selecting team
                              if (betErrorMatchId === match.id) {
                                return (
                                  <div className="mt-3 pt-3 border-t border-[var(--background-tertiary)]">
                                    <div className="flex items-center justify-center gap-2 p-2 rounded bg-[var(--error)]/10 border border-[var(--error)]/30 text-xs text-[var(--error)]">
                                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                      </svg>
                                      <span>Select a team first, then place your bet</span>
                                    </div>
                                  </div>
                                );
                              }

                              // No UI shown - coin button in "vs" area triggers betting
                              return null;
                            })()}

                            {/* Show resolved bets for completed matches */}
                            {authUser && isCompleted && (() => {
                              const resolvedBet = betting.bets.find(
                                (b) => b.matchId === match.id && b.status !== "pending"
                              );
                              if (!resolvedBet) return null;

                              const betOnCoach1 = resolvedBet.predictedWinnerId === match.coach1.id;
                              const teamName = betOnCoach1 ? match.coach1.teamName : match.coach2.teamName;
                              const isWin = resolvedBet.status === "won";
                              const isRefund = resolvedBet.status === "refunded";
                              // Cheating detected: bet was lost but they predicted the actual winner
                              const predictedCorrectly = resolvedBet.predictedWinnerId === match.winnerId;
                              const isCheating = resolvedBet.status === "lost" && predictedCorrectly;

                              return (
                                <div className={`mt-3 pt-3 border-t border-[var(--background-tertiary)]`}>
                                  <div className={`flex items-center justify-between gap-2 p-2 rounded ${
                                    isWin ? "bg-[var(--success)]/10 border border-[var(--success)]/30" :
                                    isRefund ? "bg-[var(--foreground-muted)]/10 border border-[var(--foreground-muted)]/30" :
                                    "bg-[var(--error)]/10 border border-[var(--error)]/30"
                                  }`}>
                                    <div className="text-xs">
                                      <span className="font-bold inline-flex items-center gap-0.5">{resolvedBet.amount} <svg className="w-3 h-3 inline" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" opacity="0.3"/><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/><text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="bold">P</text></svg></span>
                                      <span className="text-[var(--foreground-muted)]"> on {teamName}</span>
                                    </div>
                                    <div className={`text-xs font-bold ${
                                      isWin ? "text-[var(--success)]" :
                                      isRefund ? "text-[var(--foreground-muted)]" :
                                      "text-[var(--error)]"
                                    }`}>
                                      {isWin ? `+${(resolvedBet.payout || 0) - resolvedBet.amount}` :
                                       isRefund ? "Refunded" :
                                       isCheating ? "Cheat detected" :
                                       `-${resolvedBet.amount}`}
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                    );
                  })}
              </div>

              {hasUnsavedChanges && (
                <div className="p-4 border-t border-[var(--background-tertiary)] bg-[var(--background-secondary)]">
                  <button
                    onClick={submitPicks}
                    disabled={submitting}
                    className="w-full px-4 py-3 bg-[var(--success)] text-white rounded-md hover:bg-[var(--success)]/80 disabled:opacity-50 font-bold"
                  >
                    {submitting ? "Saving..." : "Save All Picks"}
                  </button>
                </div>
              )}
            </div>
          )}

          {(weeks.length === 0 || !season.isSchedulePublic) && (
            <div className="poke-card p-6 text-center">
              <p className="text-[var(--foreground-muted)]">
                No matches found for this season. Check back later!
              </p>
            </div>
          )}
        </>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-[var(--foreground-muted)] text-center mt-6">
        PBOcoin is a virtual currency with no monetary value. It cannot be purchased, transferred, or redeemed for real-world goods or currency.
      </p>
    </div>
  );
}
