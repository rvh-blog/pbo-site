"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

interface FantasyLeaderboardEntry {
  id: number;
  displayName: string;
  coachId: number | null;
  userId: number | null;
  week: number | null;
  totalScore: number;
  picks: {
    pokemonId: number;
    seasonCoachId: number | null;
    name: string;
    spriteUrl: string | null;
    score: number;
  }[];
}

interface FantasyEntryResponse {
  user: AuthUser | null;
  myEntry: {
    id: number;
    displayName: string;
    picks?: FantasySlotPick[];
    pokemonIds?: number[];
    seasonCoachIds?: (number | null)[];
    updatedAt: string;
  } | null;
  usedInstances?: FantasySlotPick[];
  leaderboard: FantasyLeaderboardEntry[];
  settings: {
    rosterSize: number;
    budget: number;
    scoringWeek?: number;
    leaderboardWeek?: number | "overall";
    leaderboardWeeks?: number[];
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

function getSlotStats(
  pokemon: FantasyPokemonOption,
  requiredDivisionName: string | null | undefined,
  blockedInstanceKeys: Set<string> = new Set()
) {
  const emptyStats = {
    seasonCoachId: null as number | null,
    score: 0,
    games: 0,
    kills: 0,
    deaths: 0,
    teamName: "",
  };

  if (requiredDivisionName) {
    const divisionStats = pokemon.divisionStats.find(
      (stats) =>
        normalizeDivisionName(stats.divisionName) ===
        normalizeDivisionName(requiredDivisionName) &&
        !blockedInstanceKeys.has(instanceKey({ pokemonId: pokemon.id, seasonCoachId: stats.seasonCoachId }))
    );

    return {
      seasonCoachId: divisionStats?.seasonCoachId ?? null,
      score: divisionStats?.score ?? 0,
      games: divisionStats?.games ?? 0,
      kills: divisionStats?.kills ?? 0,
      deaths: divisionStats?.deaths ?? 0,
      teamName: divisionStats?.teamName ?? "",
    };
  }

  const bestDivisionStats = pokemon.divisionStats
    .filter((stats) => !blockedInstanceKeys.has(instanceKey({ pokemonId: pokemon.id, seasonCoachId: stats.seasonCoachId })))
    .slice()
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.games - a.games;
    })[0];

  return bestDivisionStats
    ? {
        seasonCoachId: bestDivisionStats.seasonCoachId,
        score: bestDivisionStats.score,
        games: bestDivisionStats.games,
        kills: bestDivisionStats.kills,
        deaths: bestDivisionStats.deaths,
        teamName: bestDivisionStats.teamName,
      }
    : emptyStats;
}

function formatTeamLabel(teamName: string) {
  return teamName || "No start-week team";
}

export function FantasyEntryClient({
  seasonId,
  divisionNames,
  targetWeek,
  scoringThroughWeek,
  pokemon,
}: FantasyEntryClientProps) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<(FantasySlotPick | null)[]>([]);
  const [usedInstances, setUsedInstances] = useState<FantasySlotPick[]>([]);
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const [leaderboardTab, setLeaderboardTab] = useState<number | "overall">(
    targetWeek >= 1 && targetWeek <= 8 ? targetWeek : "overall"
  );
  const [leaderboard, setLeaderboard] = useState<FantasyLeaderboardEntry[]>([]);
  const [rosterSize, setRosterSize] = useState(6);
  const [budget, setBudget] = useState(90);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

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
  const normalizedSlots = useMemo(
    () => Array.from({ length: rosterSize }, (_, index) => selectedSlots[index] ?? null),
    [rosterSize, selectedSlots]
  );
  const selectedIds = normalizedSlots
    .map((slot) => slot?.pokemonId ?? null)
    .filter((id): id is number => id !== null);
  const selectedPokemon = normalizedSlots.map((slot) => (
    slot === null ? null : pokemonById.get(slot.pokemonId) ?? null
  ));
  const totalCost = selectedPokemon.reduce((sum, row) => sum + (row?.cost ?? 0), 0);
  const projectedScore = selectedPokemon.reduce((sum, row, index) => {
    if (!row) return sum;
    return sum + getSlotStats(row, slotRules[index]?.effectiveDivisionName).score;
  }, 0);
  const overBudget = totalCost > budget;
  const slotValidation = normalizedSlots.map((id, index) => {
    const row = id === null ? null : pokemonById.get(id.pokemonId);
    const requiredDivision = slotRules[index]?.effectiveDivisionName;
    if (!row || !requiredDivision) return true;
    return row.divisionNames.some(
      (divisionName) => normalizeDivisionName(divisionName) === normalizeDivisionName(requiredDivision)
    );
  });
  const slotsValid = slotValidation.every(Boolean);
  const activeSlotRule = slotRules[activeSlotIndex];
  const uniqueSelectedCount = new Set(selectedIds).size;
  const rosterComplete = selectedIds.length === rosterSize && uniqueSelectedCount === rosterSize;
  const canSave = authUser && rosterComplete && !overBudget && slotsValid && !saving;

  const filteredPokemon = pokemon
    .filter((row) => row.cost !== null)
    .filter((row) => !selectedIds.includes(row.id))
    .filter((row) => {
      const requiredDivision = activeSlotRule?.effectiveDivisionName;
      return getSlotStats(row, requiredDivision, usedInstanceKeys).seasonCoachId !== null;
    })
    .filter((row) => row.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => {
      const aStats = getSlotStats(a, activeSlotRule?.effectiveDivisionName, usedInstanceKeys);
      const bStats = getSlotStats(b, activeSlotRule?.effectiveDivisionName, usedInstanceKeys);
      if (bStats.score !== aStats.score) return bStats.score - aStats.score;
      if (bStats.games !== aStats.games) return bStats.games - aStats.games;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 80);

  const loadEntry = useCallback(async () => {
    setLoading(true);
    setError(null);
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
      setUsedInstances(data.usedInstances || []);
      setRosterSize(data.settings?.rosterSize || 6);
      setBudget(data.settings?.budget || 90);
      if (data.myEntry) {
        const entryPicks = data.myEntry.picks ??
          (data.myEntry.pokemonIds || []).map((pokemonId, index) => ({
            pokemonId,
            seasonCoachId: data.myEntry?.seasonCoachIds?.[index] ?? 0,
          }));
        setSelectedSlots(entryPicks.slice(0, data.settings?.rosterSize || 6));
        setSavedAt(data.myEntry.updatedAt);
      } else {
        setSelectedSlots([]);
        setSavedAt(null);
      }
    } catch {
      setError("Failed to load fantasy entry");
    } finally {
      setLoading(false);
    }
  }, [leaderboardTab, seasonId, targetWeek]);

  useEffect(() => {
    loadEntry();
  }, [loadEntry]);

  function removeSlot(index: number) {
    setSelectedSlots((prev) => {
      const next = Array.from({ length: rosterSize }, (_, slotIndex) => prev[slotIndex] ?? null);
      next[index] = null;
      return next;
    });
    setActiveSlotIndex(index);
  }

  function choosePokemon(id: number) {
    const row = pokemonById.get(id);
    const slotStats = row ? getSlotStats(row, activeSlotRule?.effectiveDivisionName, usedInstanceKeys) : null;
    if (!slotStats?.seasonCoachId) return;
    const seasonCoachId = slotStats.seasonCoachId;

    setSelectedSlots((prev) => {
      const next = Array.from({ length: rosterSize }, (_, slotIndex) => prev[slotIndex] ?? null);
      const existingIndex = next.findIndex((slot) => slot?.pokemonId === id);
      if (existingIndex !== -1) next[existingIndex] = null;
      next[activeSlotIndex] = { pokemonId: id, seasonCoachId };
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

      setSavedAt(data.entry?.updatedAt || new Date().toISOString());
      await loadEntry();
    } catch {
      setError("Failed to save fantasy roster");
    } finally {
      setSaving(false);
    }
  }

  function handleAuthSuccess(user: AuthUser) {
    setAuthUser(user);
    setShowAuthModal(false);
    loadEntry();
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
      <div className="poke-card p-4 sm:p-5">
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
            <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Score</div>
            <div className="font-mono text-sm font-bold text-[var(--accent)]">{formatScore(projectedScore)}</div>
          </div>
        </div>

        <div className="mb-4 grid gap-2 md:grid-cols-2">
          {Array.from({ length: rosterSize }).map((_, index) => {
            const row = selectedPokemon[index];
            const slotRule = slotRules[index];
            const requiredDivision = slotRule?.effectiveDivisionName;
            const slotStats = row ? getSlotStats(row, requiredDivision) : null;
            const slotIsValid = !row || !requiredDivision || row.divisionNames.some(
              (divisionName) => normalizeDivisionName(divisionName) === normalizeDivisionName(requiredDivision)
            );
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
                        {row.cost} pts - {formatScore(slotStats?.score ?? 0)} score
                      </div>
                    </div>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        removeSlot(index);
                      }}
                      className="text-xs font-bold text-[var(--error)] hover:text-white"
                    >
                      Remove
                    </button>
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
            {filteredPokemon.map((row) => {
              const selected = selectedIds.includes(row.id);
              const selectedIndex = normalizedSlots.findIndex((slot) => slot?.pokemonId === row.id);
              const slotStats = getSlotStats(row, activeSlotRule?.effectiveDivisionName, usedInstanceKeys);
              return (
                <button
                  key={row.id}
                  onClick={() => selected ? removeSlot(selectedIndex) : choosePokemon(row.id)}
                  className={`trainer-card text-left ${selected ? "border-[var(--primary)] bg-[var(--primary)]/10" : ""}`}
                >
                  <PokemonThumb pokemon={row} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-white">{row.name}</div>
                    <div className="truncate text-xs font-bold text-[var(--foreground-muted)]">
                      {formatTeamLabel(slotStats.teamName)}
                    </div>
                    <div className="text-[10px] text-[var(--foreground-subtle)]">
                      {row.cost} pts - {slotStats.games} games - {slotStats.kills}/{slotStats.deaths}
                    </div>
                  </div>
                  <div className="font-mono text-sm font-bold text-[var(--accent)]">
                    {formatScore(slotStats.score)}
                  </div>
                </button>
              );
            })}
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
            {(["overall", 1, 2, 3, 4, 5, 6, 7, 8] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setLeaderboardTab(tab)}
                className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase transition-colors ${
                  leaderboardTab === tab
                    ? "bg-[var(--primary)] text-white"
                    : "text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-white"
                }`}
              >
                {tab === "overall" ? "Overall" : `W${tab}`}
              </button>
            ))}
          </div>
        </div>

        {leaderboard.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--foreground-muted)]">
            No fantasy rosters saved yet.
          </p>
        ) : (
          <div className="space-y-2">
            {leaderboard.slice(0, 10).map((entry, index) => (
              <div key={entry.id} className="trainer-card">
                <div className={`rank-badge ${index === 0 ? "rank-1" : index === 1 ? "rank-2" : index === 2 ? "rank-3" : "bg-[var(--background)] text-[var(--foreground-subtle)]"}`}>
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-white">
                    {entry.coachId ? (
                      <Link href={`/coaches/${entry.coachId}`} className="hover:text-[var(--primary)]">
                        {entry.displayName}
                      </Link>
                    ) : (
                      entry.displayName
                    )}
                  </div>
                  <div className="mt-1 flex -space-x-1">
                    {entry.picks.slice(0, 6).map((pick) => (
                      <div
                        key={pick.pokemonId}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--background-secondary)] bg-[var(--background-tertiary)]"
                        title={pick.name}
                      >
                        {pick.spriteUrl && (
                          <Image src={pick.spriteUrl} alt="" width={24} height={24} className="object-contain" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="font-mono font-bold text-[var(--accent)]">
                  {formatScore(entry.totalScore)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
}
