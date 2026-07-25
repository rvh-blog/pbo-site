"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AuthModal } from "@/components/auth-modal";

export interface FantasyPokemonOption {
  id: number;
  name: string;
  spriteUrl: string | null;
  cost: number | null;
  divisionNames: string[];
  divisionStats: {
    divisionName: string;
    seasonCoachId: number;
    teamName: string;
    score: number;
    games: number;
    kills: number;
    deaths: number;
    bringRate: number;
    opponentName: string | null;
  }[];
  totalScore: number;
  games: number;
  kills: number;
  deaths: number;
}

interface FantasyEntryClientProps {
  seasonId: number;
  divisionNames: string[];
  targetWeek: number;
  scoringThroughWeek: number;
  nextLockAt: string | null;
  pokemon: FantasyPokemonOption[];
}

interface AuthUser {
  type: "coach" | "spectator";
  id: number;
  name: string;
  isMod: boolean;
}

type FantasySlotPick = {
  pokemonId: number;
  seasonCoachId: number;
};

type FantasyUsedInstance = FantasySlotPick & {
  entryWeek: number;
  name: string;
  spriteUrl: string | null;
  teamName: string;
  divisionName: string;
};

interface FantasyLeaderboardEntry {
  id: number;
  displayName: string;
  coachId: number | null;
  userId: number | null;
  week: number | null;
  totalScore: number;
  weeklyScore: number;
  seasonTotal: number;
  rank: number;
  rankMovement: number | null;
  weeksEntered: number;
  averageScore: number;
  picks: {
    pokemonId: number;
    seasonCoachId: number | null;
    name: string;
    spriteUrl: string | null;
    score: number;
    teamName: string;
    divisionName: string;
    kills: number;
    deaths: number;
    wins: number;
    losses: number;
  }[];
  weeklyHistory: {
    week: number;
    score: number;
    rank: number;
    picks: FantasyLeaderboardEntry["picks"];
    rewardAmount: number;
  }[];
}

interface FantasyEntryResponse {
  user: AuthUser | null;
  myEntry: {
    id: number;
    displayName: string;
    picks?: (FantasySlotPick & { score?: number })[];
    pokemonIds?: number[];
    seasonCoachIds?: (number | null)[];
    updatedAt: string;
  } | null;
  usedInstances?: FantasyUsedInstance[];
  lockedSeasonCoachIds?: number[];
  previousWeekSummary?: {
    week: number;
    rank: number | null;
    totalScore: number | null;
    rewardAmount: number;
    rankMovement: number | null;
    beatPercent: number | null;
    bestPick: FantasyLeaderboardEntry["picks"][number] | null;
    worstPick: FantasyLeaderboardEntry["picks"][number] | null;
    optimalScore: number | null;
    optimalCost: number | null;
    optimalPicks: {
      pokemonId: number;
      seasonCoachId: number;
      name: string;
      spriteUrl: string | null;
      divisionName: string;
      teamName: string;
      cost: number;
      score: number;
    }[];
    pointsLeftOnBoard: number | null;
    isComplete: boolean;
  } | null;
  leaderboard: FantasyLeaderboardEntry[];
  settings: {
    rosterSize: number;
    budget: number;
    scoringWeek?: number;
    leaderboardWeek?: number | "overall";
    leaderboardWeeks?: number[];
    weekStatuses?: Record<number, "upcoming" | "in-progress" | "complete">;
    myEntryWeeks?: number[];
  };
  error?: string;
}

function formatScore(value: number) {
  return value.toFixed(1);
}

function PokemonThumb({ pokemon }: { pokemon: { name: string; spriteUrl: string | null } }) {
  return pokemon.spriteUrl ? (
    <Image
      src={pokemon.spriteUrl}
      alt=""
      width={30}
      height={30}
      className="object-contain"
    />
  ) : (
    <div className="h-[30px] w-[30px] rounded-full bg-[var(--background-tertiary)]" />
  );
}

const SLOT_RULES = [
  { label: "Slot 1", divisionName: "Infinity", missingSeasonLabel: "Any Division", missingSeasonNote: "Infinity starts in S11" },
  { label: "Slot 2", divisionName: "Stargazer" },
  { label: "Slot 3", divisionName: "Sunset" },
  { label: "Slot 4", divisionName: "Crystal" },
  { label: "Slot 5", divisionName: "Neon" },
  { label: "Slot 6", divisionName: null },
] as const;

function normalizeDivisionName(name: string) {
  return name.trim().toLowerCase();
}

function instanceKey(pick: FantasySlotPick | { pokemonId: number; seasonCoachId: number | null }) {
  return `${pick.pokemonId}:${pick.seasonCoachId ?? 0}`;
}

function leaderboardParticipantKey(entry: {
  id: number;
  coachId: number | null;
  userId: number | null;
}) {
  if (entry.coachId !== null) return `coach:${entry.coachId}`;
  if (entry.userId !== null) return `user:${entry.userId}`;
  return `entry:${entry.id}`;
}

function getPickedStats(pokemon: FantasyPokemonOption, seasonCoachId: number) {
  return pokemon.divisionStats.find((stats) => stats.seasonCoachId === seasonCoachId) ?? null;
}

function formatTeamLabel(teamName: string) {
  return teamName || "No start-week team";
}

function scoreBreakdown(pick: FantasyLeaderboardEntry["picks"][number]) {
  if (pick.kills === 0 && pick.deaths === 0 && pick.wins === 0 && pick.losses === 0) {
    return "Not brought · 0 points";
  }
  const resultPoints = pick.wins > 0 ? 2 : pick.losses > 0 ? -2 : 0;
  return `${pick.kills} KO${pick.kills === 1 ? "" : "s"} × 5 − ${pick.deaths} death${pick.deaths === 1 ? "" : "s"} ${resultPoints >= 0 ? "+" : "−"} ${Math.abs(resultPoints)} result = ${formatScore(pick.score)}`;
}

export function FantasyEntryClient({
  seasonId,
  divisionNames,
  targetWeek,
  scoringThroughWeek,
  nextLockAt,
  pokemon,
}: FantasyEntryClientProps) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<(FantasySlotPick | null)[]>([]);
  const [weeklyScores, setWeeklyScores] = useState<Map<string, number>>(new Map());
  const [usedInstances, setUsedInstances] = useState<FantasyUsedInstance[]>([]);
  const [lockedSeasonCoachIds, setLockedSeasonCoachIds] = useState<number[]>([]);
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const [leaderboardTab, setLeaderboardTab] = useState<number | "overall">(
    targetWeek > 0 ? targetWeek : "overall"
  );
  const [leaderboard, setLeaderboard] = useState<FantasyLeaderboardEntry[]>([]);
  const [leaderboardWeeks, setLeaderboardWeeks] = useState<number[]>([]);
  const [weekStatuses, setWeekStatuses] = useState<Record<number, "upcoming" | "in-progress" | "complete">>({});
  const [myEntryWeeks, setMyEntryWeeks] = useState<number[]>([]);
  const [visibleLeaderboardCount, setVisibleLeaderboardCount] = useState(25);
  const [expandedParticipant, setExpandedParticipant] = useState<string | null>(null);
  const [detailLoadingParticipant, setDetailLoadingParticipant] = useState<string | null>(null);
  const [rosterSize, setRosterSize] = useState(6);
  const [budget, setBudget] = useState(90);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [previousWeekSummary, setPreviousWeekSummary] = useState<
    FantasyEntryResponse["previousWeekSummary"]
  >(null);
  const [currentTime, setCurrentTime] = useState(0);
  const draftDirtyRef = useRef(false);
  const liveRequestRef = useRef<AbortController | null>(null);

  const pokemonById = useMemo(
    () => new Map(pokemon.map((row) => [row.id, row])),
    [pokemon]
  );
  const availableDivisions = useMemo(
    () => new Set(divisionNames.map(normalizeDivisionName)),
    [divisionNames]
  );
  const slotRules = useMemo(
    () => SLOT_RULES.map((rule) => {
      const divisionMissing =
        rule.divisionName !== null &&
        !availableDivisions.has(normalizeDivisionName(rule.divisionName));

      return {
        ...rule,
        effectiveDivisionName: divisionMissing ? null : rule.divisionName,
        displayDivisionName: divisionMissing
          ? ("missingSeasonLabel" in rule ? rule.missingSeasonLabel : "Any Division")
          : rule.divisionName ?? "Any Division",
        note: divisionMissing && "missingSeasonNote" in rule ? rule.missingSeasonNote : undefined,
      };
    }),
    [availableDivisions]
  );

  const usedInstanceKeys = useMemo(
    () => new Set(usedInstances.map(instanceKey)),
    [usedInstances]
  );
  const lockedSeasonCoachIdSet = useMemo(
    () => new Set(lockedSeasonCoachIds),
    [lockedSeasonCoachIds]
  );
  const normalizedSlots = useMemo(
    () => Array.from({ length: rosterSize }, (_, index) => selectedSlots[index] ?? null),
    [rosterSize, selectedSlots]
  );
  const selectedIds = normalizedSlots
    .map((slot) => slot?.pokemonId ?? null)
    .filter((id): id is number => id !== null);
  const selectedInstanceKeys = normalizedSlots
    .filter((slot): slot is FantasySlotPick => slot !== null)
    .map(instanceKey);
  const selectedPokemon = normalizedSlots.map((slot) => (
    slot === null ? null : pokemonById.get(slot.pokemonId) ?? null
  ));
  const totalCost = selectedPokemon.reduce((sum, row) => sum + (row?.cost ?? 0), 0);
  const liveScore = selectedPokemon.reduce((sum, row, index) => {
    if (!row) return sum;
    const slot = normalizedSlots[index];
    if (!slot) return sum;
    return sum + (weeklyScores.get(instanceKey(slot)) ?? 0);
  }, 0);
  const overBudget = totalCost > budget;
  const slotValidation = normalizedSlots.map((slot, index) => {
    const row = slot === null ? null : pokemonById.get(slot.pokemonId);
    const stats = row && slot ? getPickedStats(row, slot.seasonCoachId) : null;
    const requiredDivision = slotRules[index]?.effectiveDivisionName;
    if (!row || !stats) return slot === null;
    if (!requiredDivision) return true;
    return normalizeDivisionName(stats.divisionName) === normalizeDivisionName(requiredDivision);
  });
  const slotsValid = slotValidation.every(Boolean);
  const activeSlotRule = slotRules[activeSlotIndex];
  const uniqueSelectedCount = new Set(selectedIds).size;
  const uniqueSelectedInstanceCount = new Set(selectedInstanceKeys).size;
  const rosterComplete =
    selectedIds.length === rosterSize &&
    uniqueSelectedCount === rosterSize &&
    uniqueSelectedInstanceCount === rosterSize;
  const canSave = authUser && rosterComplete && !overBudget && slotsValid && !saving;
  const saveBlockers = [
    ...(!authUser ? ["Sign in to save your roster."] : []),
    ...(selectedIds.length < rosterSize
      ? [`Fill ${rosterSize - selectedIds.length} remaining roster slot${rosterSize - selectedIds.length === 1 ? "" : "s"}.`]
      : []),
    ...(uniqueSelectedCount < selectedIds.length ? ["Each roster slot must use a unique Pokemon species."] : []),
    ...(uniqueSelectedInstanceCount < selectedInstanceKeys.length ? ["The same Pokemon and team instance cannot be selected twice."] : []),
    ...(overBudget ? [`Remove ${Math.abs(budget - totalCost)} points to reach the ${budget}-point budget.`] : []),
    ...(!slotsValid
      ? normalizedSlots.flatMap((slot, index) => (
          slotValidation[index] || slot === null
            ? []
            : [`Slot ${index + 1} must use ${slotRules[index]?.displayDivisionName ?? "an eligible division"}.`]
        ))
      : []),
  ];
  const rosterStatus = loading
    ? "Loading"
    : !authUser
      ? "Sign in to play"
      : savedAt
        ? "Roster saved"
        : rosterComplete
          ? "Ready to save"
          : `${selectedIds.length} of ${rosterSize} selected`;
  const budgetRemaining = budget - totalCost;
  const nextLockTime = nextLockAt ? new Date(nextLockAt).getTime() : null;
  const minutesUntilLock = nextLockTime === null
    ? null
    : Math.max(0, Math.ceil((nextLockTime - currentTime) / 60_000));
  const nextLockLabel = nextLockAt && currentTime === 0
    ? "Scheduled"
    : minutesUntilLock === null
    ? "Per matchup"
    : minutesUntilLock === 0
      ? "Locking now"
      : minutesUntilLock < 60
        ? `${minutesUntilLock}m`
        : minutesUntilLock < 1_440
          ? `${Math.floor(minutesUntilLock / 60)}h ${minutesUntilLock % 60}m`
      : `${Math.floor(minutesUntilLock / 1_440)}d ${Math.floor((minutesUntilLock % 1_440) / 60)}h`;
  const myLeaderboardEntry = authUser
    ? leaderboard.find((entry) => (
        authUser.type === "coach"
          ? entry.coachId === authUser.id
          : entry.userId === authUser.id
      )) ?? null
    : null;
  const entryAhead = myLeaderboardEntry
    ? [...leaderboard]
        .filter((entry) => entry.rank < myLeaderboardEntry.rank)
        .sort((a, b) => b.rank - a.rank)[0] ?? null
    : null;
  const pointsToNextRank = myLeaderboardEntry && entryAhead
    ? Math.max(0, entryAhead.totalScore - myLeaderboardEntry.totalScore)
    : null;
  const recapIsSelectedWeek = previousWeekSummary?.week === targetWeek;

  const selectedInstanceKeySet = useMemo(
    () => new Set(selectedInstanceKeys),
    [selectedInstanceKeys]
  );
  const filteredPokemonInstances = pokemon
    .flatMap((row) =>
      row.cost === null
        ? []
        : row.divisionStats.map((stats) => ({
            pokemon: row,
            stats,
            key: instanceKey({ pokemonId: row.id, seasonCoachId: stats.seasonCoachId }),
          }))
    )
    .filter((option) => !selectedIds.includes(option.pokemon.id))
    .filter((option) => !selectedInstanceKeySet.has(option.key))
    .filter((option) => !usedInstanceKeys.has(option.key))
    .filter((option) => !lockedSeasonCoachIdSet.has(option.stats.seasonCoachId))
    .filter((option) => {
      const requiredDivision = activeSlotRule?.effectiveDivisionName;
      return requiredDivision
        ? normalizeDivisionName(option.stats.divisionName) === normalizeDivisionName(requiredDivision)
        : true;
    })
    .filter((option) => option.pokemon.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => {
      if (b.stats.score !== a.stats.score) return b.stats.score - a.stats.score;
      if (b.stats.games !== a.stats.games) return b.stats.games - a.stats.games;
      const nameCompare = a.pokemon.name.localeCompare(b.pokemon.name);
      if (nameCompare !== 0) return nameCompare;
      return a.stats.teamName.localeCompare(b.stats.teamName);
    })
    .slice(0, 80);
  const nextWeekAvailablePool = pokemon
    .flatMap((row) =>
      row.cost === null
        ? []
        : row.divisionStats.map((stats) => ({
            pokemon: row,
            stats,
            key: instanceKey({ pokemonId: row.id, seasonCoachId: stats.seasonCoachId }),
          }))
    )
    .filter((option) => !usedInstanceKeys.has(option.key))
    .filter((option) => !lockedSeasonCoachIdSet.has(option.stats.seasonCoachId))
    .sort((a, b) => b.stats.score - a.stats.score);

  const loadEntry = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch(
        `/api/fantasy-entry?seasonId=${seasonId}&week=${targetWeek}&leaderboardWeek=${leaderboardTab}`
      );
      const data: FantasyEntryResponse = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load fantasy entry");
        return;
      }

      setAuthUser(data.user);
      setLeaderboard(data.leaderboard || []);
      setLeaderboardWeeks(data.settings?.leaderboardWeeks || []);
      setWeekStatuses(data.settings?.weekStatuses || {});
      setMyEntryWeeks(data.settings?.myEntryWeeks || []);
      setUsedInstances(data.usedInstances || []);
      setLockedSeasonCoachIds(data.lockedSeasonCoachIds || []);
      setPreviousWeekSummary(data.previousWeekSummary ?? null);
      setRosterSize(data.settings?.rosterSize || 6);
      setBudget(data.settings?.budget || 90);
      if (data.myEntry) {
        const entryPicks = data.myEntry.picks ??
          (data.myEntry.pokemonIds || []).map((pokemonId, index) => ({
            pokemonId,
            seasonCoachId: data.myEntry?.seasonCoachIds?.[index] ?? 0,
          }));
        setWeeklyScores(
          new Map<string, number>(
            entryPicks.map((pick) => [
              instanceKey(pick),
              "score" in pick && typeof pick.score === "number" ? pick.score : 0,
            ])
          )
        );
        if (!draftDirtyRef.current) {
          setSelectedSlots(entryPicks.slice(0, data.settings?.rosterSize || 6));
          setSavedAt(data.myEntry.updatedAt);
        }
      } else if (!draftDirtyRef.current) {
        setWeeklyScores(new Map());
        setSelectedSlots([]);
        setSavedAt(null);
      }
    } catch {
      if (!silent) setError("Failed to load fantasy entry");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [leaderboardTab, seasonId, targetWeek]);

  const loadLiveScores = useCallback(async () => {
    if (document.visibilityState !== "visible" || liveRequestRef.current) return;
    const controller = new AbortController();
    liveRequestRef.current = controller;
    try {
      const response = await fetch(
        `/api/fantasy-entry?seasonId=${seasonId}&week=${targetWeek}&leaderboardWeek=${leaderboardTab}&mode=live`,
        { signal: controller.signal, cache: "no-store" }
      );
      if (!response.ok) return;
      const data = await response.json() as {
        leaderboard?: Array<{
          id: number;
          coachId: number | null;
          userId: number | null;
          rank: number;
          totalScore: number;
          weeklyScore: number;
          seasonTotal: number;
          rankMovement: number | null;
          weeksEntered: number;
          averageScore: number;
          picks: (FantasySlotPick & { score: number })[];
        }>;
        weekStatuses?: Record<number, "upcoming" | "in-progress" | "complete">;
      };
      if (data.weekStatuses) setWeekStatuses(data.weekStatuses);
      if (!data.leaderboard) return;

      const liveRows = new Map(
        data.leaderboard.map((entry) => [leaderboardParticipantKey(entry), entry])
      );
      if (leaderboard.length !== liveRows.size) {
        await loadEntry(true);
        return;
      }
      setLeaderboard((current) => {
        return current.map((entry) => {
          const live = liveRows.get(leaderboardParticipantKey(entry));
          if (!live) return entry;
          const livePickScores = new Map(live.picks.map((pick) => [instanceKey(pick), pick.score]));
          return {
            ...entry,
            rank: live.rank,
            totalScore: live.totalScore,
            weeklyScore: live.weeklyScore,
            seasonTotal: live.seasonTotal,
            rankMovement: live.rankMovement,
            weeksEntered: live.weeksEntered,
            averageScore: live.averageScore,
            picks: entry.picks.map((pick) => ({
              ...pick,
              score: livePickScores.get(instanceKey(pick)) ?? pick.score,
            })),
          };
        }).sort((a, b) => a.rank - b.rank);
      });
      setWeeklyScores((current) => {
        if (!authUser) return current;
        const mine = data.leaderboard?.find((entry) => (
          authUser.type === "coach"
            ? entry.coachId === authUser.id
            : entry.userId === authUser.id
        ));
        return mine
          ? new Map(mine.picks.map((pick) => [instanceKey(pick), pick.score]))
          : current;
      });
    } catch (requestError) {
      if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
        // A live refresh is best-effort; the last successful scores stay visible.
      }
    } finally {
      if (liveRequestRef.current === controller) liveRequestRef.current = null;
    }
  }, [authUser, leaderboard.length, leaderboardTab, loadEntry, seasonId, targetWeek]);

  const loadParticipantDetails = useCallback(async (participantKey: string) => {
    const existing = leaderboard.find(
      (entry) => leaderboardParticipantKey(entry) === participantKey
    );
    if (existing?.weeklyHistory.length) return;

    setDetailLoadingParticipant(participantKey);
    try {
      const response = await fetch(
        `/api/fantasy-entry?seasonId=${seasonId}&week=${targetWeek}&leaderboardWeek=${leaderboardTab}&mode=details&participant=${encodeURIComponent(participantKey)}`
      );
      if (!response.ok) return;
      const data = await response.json() as { detail?: FantasyLeaderboardEntry | null };
      if (!data.detail) return;
      setLeaderboard((current) => current.map((entry) => (
        leaderboardParticipantKey(entry) === participantKey ? data.detail! : entry
      )));
    } finally {
      setDetailLoadingParticipant((current) => current === participantKey ? null : current);
    }
  }, [leaderboard, leaderboardTab, seasonId, targetWeek]);

  useEffect(() => {
    loadEntry(false);
  }, [loadEntry]);

  useEffect(() => {
    setVisibleLeaderboardCount(25);
    setExpandedParticipant(null);
  }, [leaderboardTab]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadLiveScores();
    }, 30_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") loadLiveScores();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      liveRequestRef.current?.abort();
      liveRequestRef.current = null;
    };
  }, [loadLiveScores]);

  useEffect(() => {
    if (!nextLockAt) return;
    setCurrentTime(Date.now());
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [nextLockAt]);

  function removeSlot(index: number) {
    draftDirtyRef.current = true;
    setSavedAt(null);
    setSelectedSlots((prev) => {
      const next = Array.from({ length: rosterSize }, (_, slotIndex) => prev[slotIndex] ?? null);
      next[index] = null;
      return next;
    });
    setActiveSlotIndex(index);
  }

  function choosePokemon(pokemonId: number, seasonCoachId: number) {
    draftDirtyRef.current = true;
    setSavedAt(null);
    setSelectedSlots((prev) => {
      const next = Array.from({ length: rosterSize }, (_, slotIndex) => prev[slotIndex] ?? null);
      const selectedKey = instanceKey({ pokemonId, seasonCoachId });
      const existingIndex = next.findIndex((slot) => slot !== null && instanceKey(slot) === selectedKey);
      if (existingIndex !== -1) next[existingIndex] = null;
      next[activeSlotIndex] = { pokemonId, seasonCoachId };
      const nextEmptyIndex = next.findIndex((slot, index) => slot === null && index > activeSlotIndex);
      setActiveSlotIndex(nextEmptyIndex === -1 ? activeSlotIndex : nextEmptyIndex);
      return next;
    });
  }

  async function saveRoster() {
    if (!authUser) {
      setShowAuthModal(true);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/fantasy-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonId,
          week: targetWeek,
          picks: normalizedSlots.filter((slot): slot is FantasySlotPick => slot !== null),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save fantasy roster");
        return;
      }

      draftDirtyRef.current = false;
      setSavedAt(data.entry?.updatedAt || new Date().toISOString());
      await loadEntry(true);
    } catch {
      setError("Failed to save fantasy roster");
    } finally {
      setSaving(false);
    }
  }

  function handleAuthSuccess(user: AuthUser) {
    setAuthUser(user);
    setShowAuthModal(false);
    draftDirtyRef.current = false;
    loadEntry(false);
  }

  return (
    <div className="space-y-5">
      <section className="poke-card overflow-hidden p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wide text-[var(--foreground-subtle)]">
              This week
            </div>
            <h2 className="mt-1 font-pixel text-base text-white">Week {targetWeek} Game Plan</h2>
            <p className="mt-2 text-sm text-[var(--foreground-muted)]">
              Finish your six picks before their individual matchups begin.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!authUser) {
                setShowAuthModal(true);
                return;
              }
              document.getElementById("fantasy-roster-builder")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="btn-retro shrink-0 px-4 py-3 text-[9px]"
          >
            {authUser ? "Build / Edit Roster" : "Sign In & Build"}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/60 p-3">
            <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Roster</div>
            <div className={`mt-1 text-sm font-bold ${savedAt ? "text-[var(--success)]" : "text-white"}`}>
              {rosterStatus}
            </div>
            <div className="mt-1 text-[10px] text-[var(--foreground-subtle)]">{selectedIds.length}/{rosterSize} slots filled</div>
          </div>
          <div className={`rounded-lg border p-3 ${overBudget ? "border-[var(--error)]/50 bg-[var(--error)]/10" : "border-[var(--background-tertiary)] bg-[var(--background)]/60"}`}>
            <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Budget left</div>
            <div className={`mt-1 font-mono text-lg font-bold ${overBudget ? "text-[var(--error)]" : "text-[var(--accent)]"}`}>
              {budgetRemaining}
            </div>
            <div className="mt-1 text-[10px] text-[var(--foreground-subtle)]">{totalCost}/{budget} used</div>
          </div>
          <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/60 p-3">
            <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Next lock</div>
            <div className="mt-1 font-mono text-lg font-bold text-white">{nextLockLabel}</div>
            <div className="mt-1 truncate text-[10px] text-[var(--foreground-subtle)]">
              {nextLockAt ? new Date(nextLockAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Each pick locks at match time"}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/60 p-3">
            <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">
              {recapIsSelectedWeek ? "Selected result" : "Last week"}
            </div>
            <div className="mt-1 text-sm font-bold text-white">
              {!authUser
                ? "Sign in to view"
                : previousWeekSummary?.rank
                  ? `#${previousWeekSummary.rank} · ${formatScore(previousWeekSummary.totalScore ?? 0)} pts`
                  : previousWeekSummary
                    ? "No entry"
                    : "Not available"}
            </div>
            <div className="mt-1 text-[10px] text-[var(--foreground-subtle)]">
              {previousWeekSummary
                ? `Week ${previousWeekSummary.week}${previousWeekSummary.rewardAmount > 0 ? ` · +${previousWeekSummary.rewardAmount} PBO Coin` : ""}`
                : recapIsSelectedWeek ? "Selected result and reward" : "Previous result and reward"}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--background-tertiary)] pt-3">
          <span className="text-xs text-[var(--foreground-muted)]">Live roster score</span>
          <span className="font-mono text-lg font-bold text-[var(--accent)]">{formatScore(liveScore)}</span>
        </div>
      </section>

      {previousWeekSummary?.isComplete && previousWeekSummary.totalScore !== null && (
        <section className="poke-card overflow-hidden p-4 sm:p-5">
          <div className="section-title">
            <div className="section-title-icon bg-emerald-600">
              <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5 2a8 8 0 11-16 0 8 8 0 0116 0z" />
              </svg>
            </div>
            <h3>Week {previousWeekSummary.week} Recap</h3>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/60 p-3">
              <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Finish</div>
              <div className="mt-1 font-mono text-lg font-bold text-white">
                {previousWeekSummary.rank ? `#${previousWeekSummary.rank}` : "--"}
              </div>
              <div className="text-[10px] text-[var(--foreground-subtle)]">
                {previousWeekSummary.rankMovement === null
                  ? "First result"
                  : previousWeekSummary.rankMovement === 0
                    ? "No rank change"
                    : `${previousWeekSummary.rankMovement > 0 ? "↑" : "↓"} ${Math.abs(previousWeekSummary.rankMovement)} from prior week`}
              </div>
            </div>
            <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/60 p-3">
              <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Score</div>
              <div className="mt-1 font-mono text-lg font-bold text-[var(--accent)]">
                {formatScore(previousWeekSummary.totalScore)}
              </div>
              <div className="text-[10px] text-[var(--foreground-subtle)]">
                Beat {previousWeekSummary.beatPercent ?? 0}% of entries
              </div>
            </div>
            <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/60 p-3">
              <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Reward</div>
              <div className="mt-1 font-mono text-lg font-bold text-amber-300">
                +{previousWeekSummary.rewardAmount}
              </div>
              <div className="text-[10px] text-[var(--foreground-subtle)]">PBO Coin</div>
            </div>
            <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/60 p-3">
              <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Left on board</div>
              <div className="mt-1 font-mono text-lg font-bold text-white">
                {previousWeekSummary.pointsLeftOnBoard === null
                  ? "--"
                  : formatScore(previousWeekSummary.pointsLeftOnBoard)}
              </div>
              <div className="text-[10px] text-[var(--foreground-subtle)]">
                Best legal: {previousWeekSummary.optimalScore === null ? "--" : formatScore(previousWeekSummary.optimalScore)}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {[["Best pick", previousWeekSummary.bestPick], ["Worst pick", previousWeekSummary.worstPick]].map(([label, pick]) => {
              const typedPick = pick as FantasyLeaderboardEntry["picks"][number] | null;
              return (
                <div key={label as string} className="trainer-card">
                  {typedPick?.spriteUrl && (
                    <Image src={typedPick.spriteUrl} alt="" width={34} height={34} className="object-contain" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">{label as string}</div>
                    <div className="truncate text-sm font-bold text-white">{typedPick?.name ?? "--"}</div>
                    <div className="truncate text-[10px] text-[var(--foreground-subtle)]">{typedPick?.teamName ?? ""}</div>
                  </div>
                  <div className="font-mono font-bold text-[var(--accent)]">
                    {typedPick ? formatScore(typedPick.score) : "--"}
                  </div>
                </div>
              );
            })}
            <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/60 p-3">
              <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Week {targetWeek} pool</div>
              <div className="mt-1 text-sm font-bold text-white">{nextWeekAvailablePool.length} available team instances</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {nextWeekAvailablePool.slice(0, 5).map(({ pokemon: row, stats, key }) => (
                  <span key={key} title={`${row.name} · ${stats.teamName}`}>
                    <PokemonThumb pokemon={row} />
                  </span>
                ))}
              </div>
            </div>
          </div>

          {previousWeekSummary.optimalPicks.length > 0 && (
            <details className="mt-4 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/50 p-3">
              <summary className="cursor-pointer text-xs font-bold uppercase text-white">
                Highest-scoring legal roster · {previousWeekSummary.optimalCost}/{budget} points
              </summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {previousWeekSummary.optimalPicks.map((pick, index) => (
                  <div key={`${pick.pokemonId}:${pick.seasonCoachId}`} className="trainer-card">
                    <span className="rank-badge bg-[var(--background-tertiary)] text-[var(--foreground-muted)]">{index + 1}</span>
                    {pick.spriteUrl && <Image src={pick.spriteUrl} alt="" width={30} height={30} className="object-contain" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold text-white">{pick.name}</div>
                      <div className="truncate text-[10px] text-[var(--foreground-subtle)]">{pick.teamName}</div>
                    </div>
                    <div className="font-mono text-xs font-bold text-[var(--accent)]">{formatScore(pick.score)}</div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
      <div id="fantasy-roster-builder" className="poke-card scroll-mt-24 p-4 sm:p-5">
        <div className="section-title">
          <div className="section-title-icon">
            <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-6a2 2 0 012-2h8m0 0l-3-3m3 3l-3 3M5 7h4m-4 4h4m-4 4h4" />
            </svg>
          </div>
          <h3>My Fantasy Roster</h3>
        </div>

        {!authUser && !loading && (
          <div className="mb-4 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[var(--foreground-muted)]">
                Sign in with a coach or spectator account to save a fantasy roster.
              </p>
              <button
                onClick={() => setShowAuthModal(true)}
                className="btn-retro py-2 px-4 text-[9px]"
              >
                Log In
              </button>
            </div>
          </div>
        )}

        <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
          <div className={`rounded-lg border px-3 py-2 ${overBudget ? "border-[var(--error)] bg-[var(--error)]/10" : "border-[var(--background-tertiary)] bg-[var(--background)]/60"}`}>
            <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Budget</div>
            <div className={`font-mono text-sm font-bold ${overBudget ? "text-[var(--error)]" : "text-white"}`}>
              {totalCost}/{budget}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/60 px-3 py-2">
            <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Slots</div>
            <div className="font-mono text-sm font-bold text-white">{selectedIds.length}/{rosterSize}</div>
          </div>
          <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/60 px-3 py-2">
            <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Live score</div>
            <div className="font-mono text-sm font-bold text-[var(--accent)]">{formatScore(liveScore)}</div>
          </div>
        </div>

        <div className="mb-4 grid gap-2 md:grid-cols-3">
          {Array.from({ length: rosterSize }).map((_, index) => {
            const row = selectedPokemon[index];
            const slotRule = slotRules[index];
            const requiredDivision = slotRule?.effectiveDivisionName;
            const slotPick = normalizedSlots[index];
            const slotStats = row && slotPick ? getPickedStats(row, slotPick.seasonCoachId) : null;
            const slotIsLocked = slotPick ? lockedSeasonCoachIdSet.has(slotPick.seasonCoachId) : false;
            const slotIsValid =
              !row ||
              !slotPick ||
              (slotStats !== null &&
                (!requiredDivision ||
                  normalizeDivisionName(slotStats.divisionName) === normalizeDivisionName(requiredDivision)));
            const isActiveSlot = activeSlotIndex === index;

            return (
              <div
                key={index}
                onClick={() => setActiveSlotIndex(index)}
                className={`flex min-h-[76px] cursor-pointer items-center gap-3 rounded-lg border bg-[var(--background)]/50 px-3 py-2 transition-colors ${
                  !slotIsValid
                    ? "border-[var(--error)]/50"
                    : isActiveSlot
                      ? "border-[var(--primary)] bg-[var(--primary)]/10"
                      : "border-[var(--background-tertiary)]"
                }`}
              >
                <div className="rank-badge bg-[var(--background-tertiary)] text-[var(--foreground-muted)]">
                  {index + 1}
                </div>
                {row ? (
                  <>
                    <PokemonThumb pokemon={row} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-white">{row.name}</div>
                      <div className="truncate text-xs font-bold text-[var(--foreground-muted)]">
                        {formatTeamLabel(slotStats?.teamName ?? "")}
                      </div>
                      <div className="text-[10px] text-[var(--foreground-subtle)]">
                        {row.cost} pts · {formatScore(
                          slotPick ? (weeklyScores.get(instanceKey(slotPick)) ?? 0) : 0
                        )} score
                      </div>
                    </div>
                    {slotIsLocked ? (
                      <span className="rounded bg-amber-500/15 px-2 py-1 text-[10px] font-bold uppercase text-amber-300">
                        Locked
                      </span>
                    ) : (
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          removeSlot(index);
                        }}
                        className="text-xs font-bold text-[var(--error)] hover:text-white"
                      >
                        Remove
                      </button>
                    )}
                  </>
                ) : (
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-[var(--foreground-muted)]">
                      {slotRule?.displayDivisionName || "Any Division"}
                    </div>
                    <div className="truncate text-[10px] text-[var(--foreground-subtle)]">
                      {slotRule?.label}
                      {slotRule?.note ? ` - ${slotRule.note}` : ""}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Pokemon..."
            className="min-w-0 flex-1 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--primary)]"
          />
          <button
            onClick={saveRoster}
            disabled={!canSave}
            className="btn-retro-secondary py-2 px-4 text-[9px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Roster"}
          </button>
        </div>

        {!canSave && !saving && saveBlockers.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-400/25 bg-amber-400/10 p-3">
            <div className="text-[9px] font-bold uppercase text-amber-300">Before you can save</div>
            <ul className="mt-2 space-y-1 text-xs text-[var(--foreground-muted)]">
              {saveBlockers.map((blocker) => (
                <li key={blocker}>• {blocker}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="sticky bottom-2 z-20 mb-4 flex items-center gap-3 rounded-lg border border-[var(--primary)]/40 bg-[var(--background-secondary)]/95 p-3 shadow-xl backdrop-blur sm:hidden">
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Fantasy roster</div>
            <div className="mt-0.5 text-xs font-bold text-white">
              {selectedIds.length}/{rosterSize} picks · {budgetRemaining} budget left
            </div>
          </div>
          <button
            type="button"
            onClick={saveRoster}
            disabled={!canSave}
            className="btn-retro-secondary shrink-0 px-3 py-2 text-[9px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        <div className="mb-3 text-xs text-[var(--foreground-subtle)]">
          Adding for {activeSlotRule?.label}: {activeSlotRule?.displayDivisionName || "Any Division"} -
          {" "}using performance through Week {scoringThroughWeek} and Week {targetWeek} roster labels
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-[var(--error)]/30 bg-[var(--error)]/10 p-3 text-sm text-[var(--error)]">
            {error}
          </div>
        )}

        {!slotsValid && (
          <div className="mb-4 rounded-lg border border-[var(--error)]/30 bg-[var(--error)]/10 p-3 text-sm text-[var(--error)]">
            One or more Pokemon do not match their assigned division slot.
          </div>
        )}

        {savedAt && (
          <p className="mb-4 text-xs text-[var(--success)]">
            Roster saved.
          </p>
        )}

        <div className="max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
          <div className="grid gap-2 sm:grid-cols-2">
            {filteredPokemonInstances.map(({ pokemon: row, stats, key }) => {
              const selectedIndex = normalizedSlots.findIndex((slot) => slot !== null && instanceKey(slot) === key);
              const selected = selectedIndex !== -1;
              return (
                <button
                  key={key}
                  onClick={() => selected ? removeSlot(selectedIndex) : choosePokemon(row.id, stats.seasonCoachId)}
                  className={`trainer-card text-left ${selected ? "border-[var(--primary)] bg-[var(--primary)]/10" : ""}`}
                >
                  <PokemonThumb pokemon={row} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-white">{row.name}</div>
                    <div className="truncate text-xs font-bold text-[var(--foreground-muted)]">
                      {formatTeamLabel(stats.teamName)}
                    </div>
                    <div className="text-[10px] text-[var(--foreground-subtle)]">
                      {row.cost} pts · {stats.divisionName} · vs {stats.opponentName ?? "TBD"} · {stats.bringRate}% brought
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-bold text-[var(--accent)]">
                      {formatScore(stats.score)}
                    </div>
                    <div className="text-[9px] uppercase text-[var(--foreground-subtle)]">scouting</div>
                  </div>
                </button>
              );
            })}
            {filteredPokemonInstances.length === 0 && (
              <p className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/50 p-4 text-center text-sm text-[var(--foreground-muted)] sm:col-span-2">
                No available Pokemon match this search and slot.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="poke-card p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3">
          <div className="section-title mb-0">
            <div className="section-title-icon">
              <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 15l4-4 4 4 5-8" />
              </svg>
            </div>
            <h3>Fantasy Leaderboard</h3>
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/50 p-1">
            {(["overall", ...leaderboardWeeks] as (number | "overall")[]).map((tab) => {
              const status = tab === "overall" ? null : weekStatuses[tab];
              const hasEntry = tab === "overall" || myEntryWeeks.includes(tab);
              const statusLabel = tab === "overall"
                ? "Season standings"
                : authUser && !hasEntry
                  ? "No entry"
                  : status === "complete"
                    ? "Complete"
                    : status === "in-progress"
                      ? "In progress"
                      : "Upcoming";
              return (
                <button
                  key={tab}
                  type="button"
                  title={statusLabel}
                  onClick={() => setLeaderboardTab(tab)}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold uppercase transition-colors ${
                    leaderboardTab === tab
                      ? "bg-[var(--primary)] text-white"
                      : "text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-white"
                  }`}
                >
                  {tab === "overall" ? "Overall" : `W${tab}`}
                  {tab !== "overall" && (
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        authUser && !hasEntry
                          ? "bg-slate-500"
                          : status === "complete"
                            ? "bg-emerald-400"
                            : status === "in-progress"
                              ? "bg-amber-400"
                              : "bg-sky-400"
                      }`}
                      aria-label={statusLabel}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {leaderboard.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--foreground-muted)]">
            No fantasy rosters saved yet.
          </p>
        ) : (
          <>
          {myLeaderboardEntry && (
            <div className="mb-3 rounded-lg border border-[var(--primary)]/45 bg-[var(--primary)]/10 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[9px] font-bold uppercase text-[var(--primary)]">Your position</div>
                  <div className="mt-1 text-sm font-bold text-white">
                    #{myLeaderboardEntry.rank} · {formatScore(myLeaderboardEntry.totalScore)} points
                  </div>
                </div>
                <div className="text-right text-[10px] text-[var(--foreground-muted)]">
                  {pointsToNextRank === null
                    ? myLeaderboardEntry.rank === 1 ? "You are leading" : "No higher entry"
                    : `${formatScore(pointsToNextRank)} points to next rank`}
                </div>
              </div>
            </div>
          )}
          <div
            className="max-h-[720px] space-y-2 overflow-y-auto pr-2"
            aria-label="Fantasy leaderboard rankings"
            aria-live="polite"
          >
            {leaderboard.slice(0, visibleLeaderboardCount).map((entry) => {
              const participantKey = leaderboardParticipantKey(entry);
              const isExpanded = expandedParticipant === participantKey;
              const isMine = Boolean(authUser) && (
                authUser?.type === "coach"
                  ? entry.coachId === authUser.id
                  : entry.userId === authUser?.id
              );
              const profileHref = `/fantasy/profile/${
                entry.coachId ? `coach-${entry.coachId}` : `user-${entry.userId}`
              }?seasonId=${seasonId}`;
              const toggleExpanded = () => {
                if (isExpanded) {
                  setExpandedParticipant(null);
                  return;
                }
                setExpandedParticipant(participantKey);
                if (leaderboardTab === "overall") {
                  void loadParticipantDetails(participantKey);
                }
              };
              const lineupsToShow = leaderboardTab === "overall"
                ? entry.weeklyHistory
                : [{
                    week: leaderboardTab,
                    score: entry.weeklyScore,
                    rank: entry.rank,
                    picks: entry.picks,
                  }];
              return (
                <div
                  key={participantKey}
                  className={`overflow-hidden rounded-lg border bg-[var(--background)]/40 ${
                    isMine
                      ? "border-[var(--primary)] ring-1 ring-[var(--primary)]/30"
                      : entry.rank <= 3
                        ? "border-amber-400/35"
                        : "border-[var(--background-tertiary)]"
                  }`}
                >
                  <div
                    className="trainer-card cursor-pointer border-0 bg-transparent transition-colors hover:bg-[var(--background-tertiary)]/40"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={toggleExpanded}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleExpanded();
                      }
                    }}
                  >
                    <div className={`rank-badge ${entry.rank === 1 ? "rank-1" : entry.rank === 2 ? "rank-2" : entry.rank === 3 ? "rank-3" : "bg-[var(--background)] text-[var(--foreground-subtle)]"}`}>
                      {entry.rank}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-bold text-white">
                          <Link
                            href={profileHref}
                            onClick={(event) => event.stopPropagation()}
                            className="hover:text-[var(--primary)]"
                          >
                            {entry.displayName}{isMine ? " (You)" : ""}
                          </Link>
                        </div>
                        {entry.rankMovement !== null && entry.rankMovement !== 0 && (
                          <span className={`text-[10px] font-bold ${entry.rankMovement > 0 ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
                            {entry.rankMovement > 0 ? "↑" : "↓"}{Math.abs(entry.rankMovement)}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-[10px] text-[var(--foreground-subtle)]">
                        {entry.weeksEntered} week{entry.weeksEntered === 1 ? "" : "s"} · {formatScore(entry.averageScore)} avg · {formatScore(entry.seasonTotal)} season total
                      </div>
                      <div className="mt-1.5 flex -space-x-1">
                        {entry.picks.slice(0, 6).map((pick) => (
                          <div
                            key={`${pick.pokemonId}:${pick.seasonCoachId}`}
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--background-secondary)] bg-[var(--background-tertiary)]"
                            title={`${pick.name} · ${formatScore(pick.score)} points`}
                          >
                            {pick.spriteUrl && (
                              <Image src={pick.spriteUrl} alt="" width={26} height={26} className="object-contain" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-[var(--accent)]">
                        {formatScore(entry.weeklyScore)}
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleExpanded();
                        }}
                        className="mt-1 inline-flex items-center gap-1 text-[9px] font-bold uppercase text-[var(--foreground-muted)] hover:text-white"
                      >
                        {isExpanded ? "Hide lineup" : "View lineup"}
                        <svg
                          className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-[var(--background-tertiary)] p-3">
                      {leaderboardTab === "overall" &&
                      detailLoadingParticipant === participantKey &&
                      entry.weeklyHistory.length === 0 ? (
                        <div className="space-y-2" aria-label="Loading lineup">
                          <div className="h-4 w-32 animate-pulse rounded bg-[var(--background-tertiary)]" />
                          <div className="h-16 animate-pulse rounded bg-[var(--background-secondary)]" />
                        </div>
                      ) : (
                      <div className="space-y-3">
                        {lineupsToShow.map((week) => (
                          <div key={week.week} className="rounded-lg bg-[var(--background-secondary)] p-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-bold uppercase text-white">
                                Week {week.week} lineup · #{week.rank}
                              </span>
                              <span className="font-mono text-xs font-bold text-[var(--accent)]">{formatScore(week.score)}</span>
                            </div>
                            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                              {week.picks.map((pick, pickIndex) => (
                                <div key={`${pick.pokemonId}:${pick.seasonCoachId}`} className="flex min-w-0 items-center gap-2 rounded bg-[var(--background)]/60 px-2 py-1.5">
                                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--background-tertiary)] text-[9px] font-bold text-[var(--foreground-muted)]">
                                    {pickIndex + 1}
                                  </span>
                                  {pick.spriteUrl && <Image src={pick.spriteUrl} alt="" width={28} height={28} className="shrink-0 object-contain" />}
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[10px] font-bold text-white">{pick.name}</span>
                                    <span className="block truncate text-[9px] text-[var(--foreground-subtle)]">
                                      {pick.teamName || "Unknown team"}{pick.divisionName ? ` · ${pick.divisionName}` : ""}
                                    </span>
                                    <span className="block truncate text-[9px] text-[var(--foreground-subtle)]">
                                      {scoreBreakdown(pick)}
                                    </span>
                                  </span>
                                  <span className="shrink-0 font-mono text-[10px] font-bold text-[var(--accent)]">{formatScore(pick.score)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {visibleLeaderboardCount < leaderboard.length && (
              <button
                type="button"
                onClick={() => setVisibleLeaderboardCount((count) => count + 25)}
                className="w-full rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/50 px-3 py-2 text-[10px] font-bold uppercase text-[var(--foreground-muted)] transition-colors hover:border-[var(--primary)] hover:text-white"
              >
                Show 25 more
              </button>
            )}
          </div>
          </>
        )}
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
      />
      </div>
    </div>
  );
}
