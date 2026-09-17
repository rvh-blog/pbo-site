"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, TextArea } from "@/components/ui/input";
import { computeAndSortStandings, getPlayoffEligibleStandings } from "@/lib/standings-sort";
import { getSeasonFormat } from "@/lib/season-format";
import { findBuiltInPokemonNameMatch } from "@/lib/replay-roster-matching-core";
import { usesExpandedHaxRules } from "@/lib/hax-rules";
import { isCompletedMatchResult, isDoubleForfeitResult } from "@/lib/match-result-utils";

type FavorableEvent = {
  type: "crit" | "miss" | "flinch" | "paralysis" | "freeze" | "burn" | "sleep" | "confusion" | "confusion-self-hit" | "secondary" | "status-turn" | "stat-drop";
  turn: number;
  description: string;
};

interface Coach {
  id: number;
  name: string;
}

interface Pokemon {
  id: number;
  name: string;
  displayName?: string | null;
  spriteUrl: string;
}

interface RosterEntry {
  id: number;
  pokemonId: number;
  pokemon: Pokemon;
}

interface SeasonCoach {
  id: number;
  teamName: string;
  coachId: number;
  divisionId: number;
  playoffDisqualified: boolean;
  coach: Coach;
  rosters: RosterEntry[];
}

interface Division {
  id: number;
  name: string;
  seasonId: number;
}

interface Season {
  id: number;
  name: string;
  seasonNumber: number;
  isCurrent: boolean;
  isSchedulePublic?: boolean;
  divisions: Division[];
}

interface MatchPokemon {
  id: number;
  pokemonId: number;
  seasonCoachId: number;
  kills: number;
  deaths: number;
  damageDealt?: number | null;
  damageDealtIndirect?: number | null;
  damageTaken?: number | null;
  damageTakenIndirect?: number | null;
  turnsActive?: number | null;
  hazardDamageTaken?: number | null;
  setupMovesUsed?: number | null;
  favorableCrits?: number | null;
  favorableMisses?: number | null;
  favorableFlinches?: number | null;
  favorableParalysis?: number | null;
  favorableFreezes?: number | null;
  favorableBurns?: number | null;
  favorableSleep?: number | null;
  favorableConfusions?: number | null;
  favorableConfusionSelfHits?: number | null;
  favorableEvents?: FavorableEvent[] | null;
  hpRestored?: number | null;
  movesUsed?: Record<string, number> | null;
  revealedItems?: Array<{ item: string; turn: number; source: string }> | null;
  pokemon: Pokemon;
}

interface Match {
  id: number;
  seasonId: number;
  divisionId: number;
  week: number;
  winnerId: number | null;
  coach1SeasonId: number;
  coach2SeasonId: number;
  coach1Differential: number;
  coach2Differential: number;
  isForfeit: boolean;
  playedAt: string | null;
  replayUrl: string | null;
  needsReview: boolean;
  reviewNotes: string | null;
  coach1: SeasonCoach;
  coach2: SeasonCoach;
  division: Division;
  matchPokemon: MatchPokemon[];
}

interface PlayoffMatch {
  id: number;
  seasonId: number;
  divisionId: number;
  round: number;
  bracketPosition: number;
  higherSeedId: number | null;
  lowerSeedId: number | null;
  winnerId: number | null;
  higherSeedWins: number;
  lowerSeedWins: number;
  higherSeed: SeasonCoach | null;
  lowerSeed: SeasonCoach | null;
}

interface PokemonEntry {
  pokemonId: string;
  kills: string;
  deaths: string;
  damageDealt?: number;
  damageDealtIndirect?: number;
  damageTaken?: number;
  damageTakenIndirect?: number;
  turnsActive?: number;
  hazardDamageTaken?: number;
  setupMovesUsed?: number;
  favorableCrits?: number;
  favorableMisses?: number;
  favorableFlinches?: number;
  favorableParalysis?: number;
  favorableFreezes?: number;
  favorableBurns?: number;
  favorableSleep?: number;
  favorableConfusions?: number;
  favorableConfusionSelfHits?: number;
  favorableEvents?: FavorableEvent[];
  hpRestored?: number;
  movesUsed?: Record<string, number>;
  revealedItems?: Array<{ item: string; turn: number; source: string }>;
}

type MatchPokemonPayload = {
  seasonCoachId: number;
  pokemonId: number;
  kills: number;
  deaths: number;
  damageDealt?: number;
  damageDealtIndirect?: number;
  damageTaken?: number;
  damageTakenIndirect?: number;
  turnsActive?: number;
  hazardDamageTaken?: number;
  setupMovesUsed?: number;
  favorableCrits?: number;
  favorableMisses?: number;
  favorableFlinches?: number;
  favorableParalysis?: number;
  favorableFreezes?: number;
  favorableBurns?: number;
  favorableSleep?: number;
  favorableConfusions?: number;
  favorableConfusionSelfHits?: number;
  favorableEvents?: FavorableEvent[];
  hpRestored?: number;
  movesUsed?: Record<string, number>;
  revealedItems?: Array<{ item: string; turn: number; source: string }>;
};

type TabType = "schedule" | "results" | "playoffs";
type MatchFilter = "all" | "pending" | "completed" | "forfeit" | "review";

type SaveMatchOptions = {
  openNextReview?: boolean;
  needsReview?: boolean;
  clearReviewNotes?: boolean;
  keepOpen?: boolean;
};

type ScheduleEntry = { week: number; team1: string; team2: string };

interface ScheduleValidation {
  validRows: Array<ScheduleEntry & { coach1SeasonId: number; coach2SeasonId: number }>;
  skippedRows: number;
  weeks: number[];
  issues: string[];
}

function getSeasonCoachName(coaches: SeasonCoach[], id: number | null | undefined) {
  if (!id) return "TBD";
  return coaches.find((coach) => coach.id === id)?.teamName || `Season coach ${id}`;
}

function createEmptyPokemonEntries(): PokemonEntry[] {
  return Array.from({ length: 6 }, () => ({ pokemonId: "", kills: "0", deaths: "0" }));
}

function isHistoricalStatsSeason(seasonNumber: number | undefined) {
  return seasonNumber !== undefined && seasonNumber >= 5 && seasonNumber <= 10;
}

function getMatchStatus(match: Match): "review" | "pending" | "forfeit" | "missing-replay" | "missing-pokemon" | "complete" {
  if (match.needsReview) return "review";
  if (!isCompletedMatchResult(match.winnerId, match.isForfeit)) return "pending";
  if (match.isForfeit) return "forfeit";
  if (!match.replayUrl?.trim()) return "missing-replay";
  if (!match.matchPokemon?.length) return "missing-pokemon";
  return "complete";
}

function getMatchStatusLabel(status: ReturnType<typeof getMatchStatus>) {
  switch (status) {
    case "review": return "Needs Review";
    case "pending": return "Needs Result";
    case "forfeit": return "Forfeit";
    case "missing-replay": return "Missing Replay";
    case "missing-pokemon": return "Missing Pokemon";
    case "complete": return "Complete";
  }
}

function getMatchStatusClasses(status: ReturnType<typeof getMatchStatus>) {
  switch (status) {
    case "review": return "bg-yellow-400 text-black";
    case "pending": return "bg-[var(--warning)]/20 text-[var(--warning)]";
    case "forfeit": return "bg-[var(--warning)] text-black";
    case "missing-replay": return "bg-orange-400/20 text-orange-200";
    case "missing-pokemon": return "bg-purple-400/20 text-purple-200";
    case "complete": return "bg-[var(--success)]/20 text-[var(--success)]";
  }
}

function formatMatchDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function summarizePokemonStats(entries: Array<{ pokemonId?: number | string; kills: number | string; deaths: number | string }>) {
  return {
    rows: entries.filter((entry) => entry.pokemonId === undefined || String(entry.pokemonId) !== "").length,
    kills: entries.reduce((total, entry) => total + (Number(entry.kills) || 0), 0),
    deaths: entries.reduce((total, entry) => total + (Number(entry.deaths) || 0), 0),
  };
}

export default function AdminMatchesPage() {
  const [activeTab, setActiveTab] = useState<TabType>("results");
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);
  const [selectedDivision, setSelectedDivision] = useState<Division | null>(null);
  const [seasonCoaches, setSeasonCoaches] = useState<SeasonCoach[]>([]);
  const [historicalPokemonPool, setHistoricalPokemonPool] = useState<Pokemon[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [playoffMatches, setPlayoffMatches] = useState<PlayoffMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [matchSearch, setMatchSearch] = useState("");
  const [matchFilter, setMatchFilter] = useState<MatchFilter>("all");
  const autoOpenedContextRef = useRef<string | null>(null);

  // Schedule CSV upload
  const [scheduleCsvFile, setScheduleCsvFile] = useState("");
  const [scheduleCsvError, setScheduleCsvError] = useState("");
  const [schedulePreview, setSchedulePreview] = useState<Array<{ week: number; team1: string; team2: string }>>([]);
  const scheduleFileRef = useRef<HTMLInputElement>(null);
  const resultEditorRef = useRef<HTMLDivElement>(null);
  const seasonDivisionRef = useRef<HTMLDivElement>(null);

  // Match result entry
  const [selectedFixture, setSelectedFixture] = useState<Match | null>(null);
  const [selectedPlayoffFixture, setSelectedPlayoffFixture] = useState<PlayoffMatch | null>(null);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [matchForm, setMatchForm] = useState({
    winnerId: "",
    coach1Differential: "0",
    coach2Differential: "0",
    isForfeit: false,
    replayUrl: "",
    needsReview: false,
    reviewNotes: "",
  });
  const [team1Pokemon, setTeam1Pokemon] = useState<PokemonEntry[]>(createEmptyPokemonEntries);
  const [team2Pokemon, setTeam2Pokemon] = useState<PokemonEntry[]>(createEmptyPokemonEntries);
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState("");

  // Scraped data state
  const [zoroarkInvolved, setZoroarkInvolved] = useState(false);
  const [matchTimingData, setMatchTimingData] = useState<{ startedAt: string | null; endedAt: string | null }>({
    startedAt: null,
    endedAt: null,
  });
  const [matchEventData, setMatchEventData] = useState<{ turnSnapshots: unknown[] | null; keyEvents: unknown[] | null; battleEvents: unknown[] | null }>({
    turnSnapshots: null,
    keyEvents: null,
    battleEvents: null,
  });

  // Time-synced rosters for accurate matching
  const [timeSyncedRosters1, setTimeSyncedRosters1] = useState<RosterEntry[] | null>(null);
  const [timeSyncedRosters2, setTimeSyncedRosters2] = useState<RosterEntry[] | null>(null);

  // Playoff entry
  const [playoffForm, setPlayoffForm] = useState({
    round: "1",
    bracketPosition: "1",
    higherSeedId: "",
    lowerSeedId: "",
  });

  // ELO recalculation
  const [needsFullRecalc, setNeedsFullRecalc] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [recalcMessage, setRecalcMessage] = useState<string | null>(null);

  function clearPokemonResultData() {
    setTeam1Pokemon(createEmptyPokemonEntries());
    setTeam2Pokemon(createEmptyPokemonEntries());
    setZoroarkInvolved(false);
    setMatchTimingData({ startedAt: null, endedAt: null });
    setMatchEventData({ turnSnapshots: null, keyEvents: null, battleEvents: null });
  }

  function declareForfeit() {
    if (!matchForm.winnerId) {
      alert("Select the winning team before declaring an FF. For both teams receiving a loss, use Declare Double FF.");
      return;
    }
    clearPokemonResultData();
    setMatchForm((current) => ({ ...current, isForfeit: true }));
  }

  function declareDoubleForfeit() {
    clearPokemonResultData();
    setMatchForm((current) => ({
      ...current,
      winnerId: "",
      coach1Differential: "-3",
      coach2Differential: "-3",
      isForfeit: true,
    }));
  }

  useEffect(() => {
    fetchSeasons();
  }, []);

  useEffect(() => {
    if (selectedSeason) {
      fetchSeasonCoaches();
      fetchMatches();
      fetchPlayoffMatches();
    }
    // These loaders intentionally capture the selected context for this refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeason, selectedDivision]);

  // If data finished loading while the admin was on another tab, open the next
  // pending result when they return to Results.
  useEffect(() => {
    if (activeTab !== "results" || !selectedSeason || matches.length === 0) return;
    const contextKey = `${selectedSeason.id}:${selectedDivision?.id || "all"}`;
    if (autoOpenedContextRef.current === contextKey) return;

    const nextPendingMatch = [...matches]
      .filter((match) => !isCompletedMatchResult(match.winnerId, match.isForfeit))
      .sort((a, b) => a.week - b.week || a.id - b.id)[0];
    if (!nextPendingMatch) return;

    autoOpenedContextRef.current = contextKey;
    openMatchForEditing(nextPendingMatch, false);
    // openMatchForEditing is intentionally invoked only once per season/division context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, matches, selectedDivision, selectedSeason]);

  useEffect(() => {
    try {
      if (selectedSeason) {
        window.localStorage.setItem("pbo-admin-season-id", String(selectedSeason.id));
      }
      if (selectedDivision) {
        window.localStorage.setItem("pbo-admin-division-id", String(selectedDivision.id));
      }
    } catch {
      // Local storage is only a convenience; the page still works without it.
    }
  }, [selectedSeason, selectedDivision]);

  useEffect(() => {
    if (!selectedSeason || !isHistoricalStatsSeason(selectedSeason.seasonNumber)) {
      setHistoricalPokemonPool([]);
      return;
    }

    const controller = new AbortController();

    async function fetchHistoricalPokemonPool() {
      try {
        const res = await fetch("/api/pokemon?view=admin", { signal: controller.signal });
        if (!res.ok) throw new Error("Failed to load Pokemon options");
        const data = await res.json();
        setHistoricalPokemonPool(Array.isArray(data) ? data : []);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Failed to fetch historical Pokemon pool:", err);
        setHistoricalPokemonPool([]);
      }
    }

    fetchHistoricalPokemonPool();
    return () => controller.abort();
  }, [selectedSeason]);

  // Auto-select next available bracket position
  useEffect(() => {
    if (!selectedDivision) return;
    const round = parseInt(playoffForm.round);
    const takenPositions = playoffMatches
      .filter((pm) => pm.round === round && pm.divisionId === selectedDivision.id)
      .map((pm) => pm.bracketPosition);
    const currentPos = parseInt(playoffForm.bracketPosition);
    if (takenPositions.includes(currentPos)) {
      const maxPositions = round === 1 ? 4 : round === 2 ? 2 : 1;
      const available = Array.from({ length: maxPositions }, (_, i) => i + 1).find(
        (p) => !takenPositions.includes(p)
      );
      if (available) {
        setPlayoffForm((prev) => ({ ...prev, bracketPosition: available.toString() }));
      }
    }
  }, [playoffMatches, selectedDivision, playoffForm.bracketPosition, playoffForm.round]);

  async function fetchSeasons() {
    const res = await fetch("/api/seasons");
    const data = await res.json();
    const availableSeasons: Season[] = Array.isArray(data) ? data : [];
    setSeasons(availableSeasons);
    const current = availableSeasons.find((s) => s.isCurrent) || availableSeasons[0];
    if (current) {
      setSelectedSeason(current);
      let savedDivisionId: number | null = null;
      try {
        const parsed = Number(window.localStorage.getItem("pbo-admin-division-id"));
        savedDivisionId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
      } catch {
        savedDivisionId = null;
      }
      setSelectedDivision(
        current.divisions.find((division) => division.id === savedDivisionId) ||
        current.divisions[0] ||
        null
      );
    }
    setLoading(false);
  }

  async function fetchSeasonCoaches() {
    if (!selectedSeason) return;
    const res = await fetch(`/api/rosters?seasonId=${selectedSeason.id}`);
    const data = await res.json();
    setSeasonCoaches(Array.isArray(data) ? data : []);
  }

  async function fetchMatches(): Promise<Match[]> {
    if (!selectedSeason) return [];
    let url = `/api/matches?seasonId=${selectedSeason.id}`;
    if (selectedDivision) {
      url += `&divisionId=${selectedDivision.id}`;
    }
    const res = await fetch(url);
    const data = await res.json();
    const nextMatches = Array.isArray(data) ? data : [];
    setMatches(nextMatches);

    const contextKey = `${selectedSeason.id}:${selectedDivision?.id || "all"}`;
    if (activeTab === "results" && autoOpenedContextRef.current !== contextKey) {
      autoOpenedContextRef.current = contextKey;
      const nextPendingMatch = [...nextMatches]
        .filter((match) => !isCompletedMatchResult(match.winnerId, match.isForfeit))
        .sort((a, b) => a.week - b.week || a.id - b.id)[0];
      if (nextPendingMatch) {
        openMatchForEditing(nextPendingMatch, false);
      }
    }
    return nextMatches;
  }

  async function fetchPlayoffMatches() {
    if (!selectedSeason) return;
    let url = `/api/playoffs?seasonId=${selectedSeason.id}`;
    if (selectedDivision) {
      url += `&divisionId=${selectedDivision.id}`;
    }
    const res = await fetch(url);
    const data = await res.json();
    setPlayoffMatches(Array.isArray(data) ? data : []);
  }

  async function fetchTimeSyncedRosters(coach1Id: number, coach2Id: number, week: number) {
    try {
      const [res1, res2] = await Promise.all([
        fetch(`/api/rosters/time-synced?seasonCoachId=${coach1Id}&week=${week}`),
        fetch(`/api/rosters/time-synced?seasonCoachId=${coach2Id}&week=${week}`),
      ]);
      const [data1, data2] = await Promise.all([res1.json(), res2.json()]);
      setTimeSyncedRosters1([...(data1.roster || []), ...(data1.dropped || [])]);
      setTimeSyncedRosters2([...(data2.roster || []), ...(data2.dropped || [])]);
    } catch (err) {
      console.error("Failed to fetch time-synced rosters:", err);
      setTimeSyncedRosters1(null);
      setTimeSyncedRosters2(null);
    }
  }

  async function handleRecalculateElo() {
    const completedMatches = matches.filter((match) => isCompletedMatchResult(match.winnerId, match.isForfeit)).length;
    if (
      !confirm(
        [
          "Recalculate ELO ratings for all coaches?",
          "",
          `Completed matches in current view: ${completedMatches}`,
          "Affected data: coach ELO ratings derived from match history.",
          "Use this after deleting or changing historical results.",
        ].join("\n")
      )
    ) {
      return;
    }
    setRecalculating(true);
    setRecalcMessage(null);
    try {
      const res = await fetch("/api/elo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "recalculateAll" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to recalculate ELO");
      setRecalcMessage(data.message);
      setNeedsFullRecalc(false);
    } catch (err: unknown) {
      setRecalcMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRecalculating(false);
    }
  }

  // Schedule CSV parsing
  function parseScheduleCSV(csvText: string) {
    try {
      const lines = csvText.trim().split("\n");
      if (lines.length < 2) {
        return { entries: [], error: "CSV must have a header row and at least one data row" };
      }

      const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
      const weekIdx = header.findIndex((h) => h === "week" || h === "round");
      const team1Idx = header.findIndex((h) => h === "team1" || h === "team 1" || h === "home");
      const team2Idx = header.findIndex((h) => h === "team2" || h === "team 2" || h === "away");

      if (weekIdx === -1 || team1Idx === -1 || team2Idx === -1) {
        return { entries: [], error: "CSV must have 'week', 'team1', and 'team2' columns" };
      }

      const entries: Array<{ week: number; team1: string; team2: string }> = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map((v) => v.trim());
        if (!values[team1Idx] || !values[team2Idx]) continue;

        entries.push({
          week: parseInt(values[weekIdx]) || 1,
          team1: values[team1Idx],
          team2: values[team2Idx],
        });
      }

      return { entries, error: null };
    } catch {
      return { entries: [], error: "Failed to parse CSV" };
    }
  }

  function handleScheduleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setScheduleCsvFile(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const { entries, error } = parseScheduleCSV(text);
      if (error) {
        setScheduleCsvError(error);
        setSchedulePreview([]);
      } else {
        setScheduleCsvError("");
        setSchedulePreview(entries);
      }
    };
    reader.readAsText(file);
  }

  function validateScheduleUpload(
    entries: ScheduleEntry[],
    coachesInDiv: SeasonCoach[],
    season: Season
  ): ScheduleValidation {
    const seasonFormat = getSeasonFormat(season.seasonNumber);
    const teamByName = new Map(coachesInDiv.map((coach) => [coach.teamName.toLowerCase(), coach]));
    const issues: string[] = [];
    const validRows: ScheduleValidation["validRows"] = [];
    let skippedRows = 0;

    for (const entry of entries) {
      const coach1 = teamByName.get(entry.team1.toLowerCase());
      const coach2 = teamByName.get(entry.team2.toLowerCase());
      if (!coach1 || !coach2) {
        skippedRows++;
        continue;
      }
      if (coach1.id === coach2.id) {
        issues.push(`Week ${entry.week}: ${entry.team1} is scheduled against itself.`);
        continue;
      }
      validRows.push({
        ...entry,
        coach1SeasonId: coach1.id,
        coach2SeasonId: coach2.id,
      });
    }

    const weeks = [...new Set(validRows.map((match) => match.week))].sort((a, b) => a - b);
    const expectedTeams = seasonFormat.teamsPerDivision;
    const expectedWeeks = seasonFormat.regularSeasonWeeks;
    const expectedFixtures = seasonFormat.fixturesPerRegularWeek;

    if (expectedTeams && coachesInDiv.length !== expectedTeams) {
      issues.push(`${season.name} expects ${expectedTeams} teams in each division; ${coachesInDiv.length} are assigned to this division.`);
    }

    if (expectedFixtures) {
      const expectedMatches = expectedFixtures * expectedWeeks;
      if (validRows.length !== expectedMatches) {
        issues.push(`Expected ${expectedMatches} valid regular-season matches (${expectedFixtures} per week for ${expectedWeeks} weeks); found ${validRows.length}.`);
      }

      const expectedWeekList = Array.from({ length: expectedWeeks }, (_, i) => i + 1);
      const invalidWeeks = weeks.filter((week) => !expectedWeekList.includes(week));
      const missingWeeks = expectedWeekList.filter((week) => !weeks.includes(week));
      if (invalidWeeks.length > 0) issues.push(`Regular-season uploads can only use weeks 1-${expectedWeeks}; found week ${invalidWeeks.join(", ")}.`);
      if (missingWeeks.length > 0) issues.push(`Missing week${missingWeeks.length === 1 ? "" : "s"} ${missingWeeks.join(", ")}.`);

      for (const week of expectedWeekList) {
        const weekMatches = validRows.filter((match) => match.week === week);
        const teamsThisWeek = new Set<number>();
        for (const match of weekMatches) {
          if (teamsThisWeek.has(match.coach1SeasonId)) {
            issues.push(`Week ${week}: ${match.team1} appears more than once.`);
          }
          if (teamsThisWeek.has(match.coach2SeasonId)) {
            issues.push(`Week ${week}: ${match.team2} appears more than once.`);
          }
          teamsThisWeek.add(match.coach1SeasonId);
          teamsThisWeek.add(match.coach2SeasonId);
        }
        if (weekMatches.length !== expectedFixtures) {
          issues.push(`Week ${week} should have ${expectedFixtures} matches; found ${weekMatches.length}.`);
        }
      }
    }

    return { validRows, skippedRows, weeks, issues };
  }

  async function handleUploadSchedule() {
    if (!selectedSeason || !selectedDivision || schedulePreview.length === 0) return;

    const coachesInDiv = seasonCoaches.filter((sc) => sc.divisionId === selectedDivision.id);
    const validation = validateScheduleUpload(schedulePreview, coachesInDiv, selectedSeason);
    const validSchedule = validation.validRows;

    if (validSchedule.length === 0) {
      setScheduleCsvError("No valid matches found. Make sure team names match exactly.");
      return;
    }

    if (validation.issues.length > 0) {
      setScheduleCsvError(validation.issues.join(" "));
      return;
    }

    if (
      !confirm(
        [
          `Upload ${validSchedule.length} schedule match${validSchedule.length === 1 ? "" : "es"}?`,
          "",
          `Season: ${selectedSeason.name}`,
          `Division: ${selectedDivision.name}`,
          `Weeks: ${validation.weeks.join(", ")}`,
          `Skipped rows: ${validation.skippedRows}`,
          "Affected data: schedule match rows. Existing matches are not removed.",
        ].join("\n")
      )
    ) {
      return;
    }

    try {
      const response = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulkSchedule",
          matches: validSchedule.map((match) => ({
            seasonId: selectedSeason.id,
            divisionId: selectedDivision.id,
            week: match.week,
            coach1SeasonId: match.coach1SeasonId,
            coach2SeasonId: match.coach2SeasonId,
          })),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setScheduleCsvError(result.error || "Failed to upload schedule");
        return;
      }
      if (result.skippedCount > 0) {
        alert(`Added ${result.createdCount} matches. Skipped ${result.skippedCount} matches that already existed.`);
      }
    } catch {
      setScheduleCsvError("Schedule upload failed. Please try again.");
      return;
    }

    setSchedulePreview([]);
    setScheduleCsvFile("");
    if (scheduleFileRef.current) scheduleFileRef.current.value = "";
    fetchMatches();
  }

  const getRoundName = (round: number) => {
    switch (round) {
      case 1: return "Quarterfinals";
      case 2: return "Semifinals";
      case 3: return "Finals";
      default: return `Round ${round}`;
    }
  };

  const regularWeeks = [...new Set(matches.map((m) => m.week))].filter((w) => w <= 100).sort((a, b) => a - b);
  const playoffRounds = [...new Set(playoffMatches.map((pm) => pm.round))].sort((a, b) => a - b);

  function findMatchForPlayoff(playoffMatch: PlayoffMatch): Match | undefined {
    const playoffWeek = 100 + playoffMatch.round;
    return matches.find(
      (m) =>
        m.week === playoffWeek &&
        m.divisionId === playoffMatch.divisionId &&
        ((m.coach1SeasonId === playoffMatch.higherSeedId && m.coach2SeasonId === playoffMatch.lowerSeedId) ||
         (m.coach1SeasonId === playoffMatch.lowerSeedId && m.coach2SeasonId === playoffMatch.higherSeedId))
    );
  }

  function loadMatchForm(match: Match) {
    setMatchForm({
      winnerId: match.winnerId?.toString() || "",
      coach1Differential: match.coach1Differential?.toString() || "0",
      coach2Differential: match.coach2Differential?.toString() || "0",
      isForfeit: match.isForfeit || false,
      replayUrl: match.replayUrl || "",
      needsReview: match.needsReview || false,
      reviewNotes: match.reviewNotes || "",
    });

    const coach1Pokemon = match.matchPokemon?.filter((mp) => mp.seasonCoachId === match.coach1SeasonId) || [];
    const coach2Pokemon = match.matchPokemon?.filter((mp) => mp.seasonCoachId === match.coach2SeasonId) || [];

    setTeam1Pokemon(
      Array(6).fill(null).map((_, i) => ({
        pokemonId: coach1Pokemon[i]?.pokemonId?.toString() || "",
        kills: coach1Pokemon[i]?.kills?.toString() || "0",
        deaths: coach1Pokemon[i]?.deaths?.toString() || "0",
        damageDealt: coach1Pokemon[i]?.damageDealt ?? undefined,
        damageDealtIndirect: coach1Pokemon[i]?.damageDealtIndirect ?? undefined,
        damageTaken: coach1Pokemon[i]?.damageTaken ?? undefined,
        damageTakenIndirect: coach1Pokemon[i]?.damageTakenIndirect ?? undefined,
        turnsActive: coach1Pokemon[i]?.turnsActive ?? undefined,
        hazardDamageTaken: coach1Pokemon[i]?.hazardDamageTaken ?? undefined,
        setupMovesUsed: coach1Pokemon[i]?.setupMovesUsed ?? undefined,
        favorableCrits: coach1Pokemon[i]?.favorableCrits ?? undefined,
        favorableMisses: coach1Pokemon[i]?.favorableMisses ?? undefined,
        favorableFlinches: coach1Pokemon[i]?.favorableFlinches ?? undefined,
        favorableParalysis: coach1Pokemon[i]?.favorableParalysis ?? undefined,
        favorableFreezes: coach1Pokemon[i]?.favorableFreezes ?? undefined,
        favorableBurns: coach1Pokemon[i]?.favorableBurns ?? undefined,
        favorableSleep: coach1Pokemon[i]?.favorableSleep ?? undefined,
        favorableConfusions: coach1Pokemon[i]?.favorableConfusions ?? undefined,
        favorableConfusionSelfHits: coach1Pokemon[i]?.favorableConfusionSelfHits ?? undefined,
        favorableEvents: coach1Pokemon[i]?.favorableEvents ?? undefined,
        hpRestored: coach1Pokemon[i]?.hpRestored ?? undefined,
        movesUsed: coach1Pokemon[i]?.movesUsed ?? undefined,
        revealedItems: coach1Pokemon[i]?.revealedItems ?? undefined,
      }))
    );
    setTeam2Pokemon(
      Array(6).fill(null).map((_, i) => ({
        pokemonId: coach2Pokemon[i]?.pokemonId?.toString() || "",
        kills: coach2Pokemon[i]?.kills?.toString() || "0",
        deaths: coach2Pokemon[i]?.deaths?.toString() || "0",
        damageDealt: coach2Pokemon[i]?.damageDealt ?? undefined,
        damageDealtIndirect: coach2Pokemon[i]?.damageDealtIndirect ?? undefined,
        damageTaken: coach2Pokemon[i]?.damageTaken ?? undefined,
        damageTakenIndirect: coach2Pokemon[i]?.damageTakenIndirect ?? undefined,
        turnsActive: coach2Pokemon[i]?.turnsActive ?? undefined,
        hazardDamageTaken: coach2Pokemon[i]?.hazardDamageTaken ?? undefined,
        setupMovesUsed: coach2Pokemon[i]?.setupMovesUsed ?? undefined,
        favorableCrits: coach2Pokemon[i]?.favorableCrits ?? undefined,
        favorableMisses: coach2Pokemon[i]?.favorableMisses ?? undefined,
        favorableFlinches: coach2Pokemon[i]?.favorableFlinches ?? undefined,
        favorableParalysis: coach2Pokemon[i]?.favorableParalysis ?? undefined,
        favorableFreezes: coach2Pokemon[i]?.favorableFreezes ?? undefined,
        favorableBurns: coach2Pokemon[i]?.favorableBurns ?? undefined,
        favorableSleep: coach2Pokemon[i]?.favorableSleep ?? undefined,
        favorableConfusions: coach2Pokemon[i]?.favorableConfusions ?? undefined,
        favorableConfusionSelfHits: coach2Pokemon[i]?.favorableConfusionSelfHits ?? undefined,
        favorableEvents: coach2Pokemon[i]?.favorableEvents ?? undefined,
        hpRestored: coach2Pokemon[i]?.hpRestored ?? undefined,
        movesUsed: coach2Pokemon[i]?.movesUsed ?? undefined,
        revealedItems: coach2Pokemon[i]?.revealedItems ?? undefined,
      }))
    );
  }

  function openMatchForEditing(match: Match, scrollToEditor = false) {
    setEditingMatch(match);
    setSelectedFixture(null);
    setSelectedPlayoffFixture(null);
    loadMatchForm(match);
    fetchTimeSyncedRosters(match.coach1SeasonId, match.coach2SeasonId, match.week);

    if (scrollToEditor) {
      requestAnimationFrame(() => {
        resultEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  function selectMatchFromPicker(value: string) {
    if (!value) {
      setSelectedFixture(null);
      setSelectedPlayoffFixture(null);
      setEditingMatch(null);
      resetForm();
      return;
    }

    if (value.startsWith("match-")) {
      const match = matches.find((entry) => entry.id === Number(value.slice("match-".length)));
      if (!match) return;
      setSelectedFixture(match);
      setEditingMatch(null);
      setSelectedPlayoffFixture(null);
      loadMatchForm(match);
      fetchTimeSyncedRosters(match.coach1SeasonId, match.coach2SeasonId, match.week);
      return;
    }

    const playoffMatch = playoffMatches.find(
      (entry) => entry.id === Number(value.slice("playoff-".length))
    );
    if (!playoffMatch) return;
    if (!playoffMatch.higherSeedId || !playoffMatch.lowerSeedId) {
      alert("Both teams must be set in the playoff bracket before entering results.");
      return;
    }

    setSelectedPlayoffFixture(playoffMatch);
    setSelectedFixture(null);
    setEditingMatch(null);
    const existingMatch = findMatchForPlayoff(playoffMatch);
    if (existingMatch) {
      loadMatchForm(existingMatch);
    } else {
      resetForm();
    }
    fetchTimeSyncedRosters(playoffMatch.higherSeedId, playoffMatch.lowerSeedId, 100 + playoffMatch.round);
  }

  async function handleClearReviewFlag() {
    const match = selectedFixture || editingMatch;
    if (!match) return;
    if (!confirm("Clear the review flag? This keeps the match result and stats unchanged.")) return;

    const reviewIndex = reviewMatches.findIndex((reviewMatch) => reviewMatch.id === match.id);
    const nextReviewId = reviewIndex >= 0 && reviewMatches.length > 1
      ? reviewMatches[(reviewIndex + 1) % reviewMatches.length]?.id
      : undefined;
    const res = await fetch("/api/matches", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: match.id, needsReview: false, reviewNotes: null }),
    });
    if (!res.ok) {
      alert("Failed to clear the review flag.");
      return;
    }

    const refreshedMatches = await fetchMatches();
    const nextReviewMatch = nextReviewId
      ? refreshedMatches.find((reviewMatch) => reviewMatch.id === nextReviewId)
      : undefined;
    if (nextReviewMatch) {
      openMatchForEditing(nextReviewMatch, true);
      return;
    }

    setSelectedFixture(null);
    setEditingMatch(null);
    resetForm();
  }

  function getSelectablePokemon(rosters: RosterEntry[] | undefined): Pokemon[] {
    const rosterPokemon = (rosters || []).map((entry) => entry.pokemon);
    const isHistoricalBackfillSeason = isHistoricalStatsSeason(selectedSeason?.seasonNumber);

    if (!isHistoricalBackfillSeason) return rosterPokemon;

    const pokemonById = new Map<number, Pokemon>();
    for (const entry of historicalPokemonPool) pokemonById.set(entry.id, entry);
    for (const entry of rosterPokemon) pokemonById.set(entry.id, entry);

    return Array.from(pokemonById.values()).sort((a, b) =>
      (a.displayName || a.name).localeCompare(b.displayName || b.name)
    );
  }

  function getPokemonName(options: Pokemon[], pokemonId: string): string {
    if (!pokemonId) return "";
    const entry = options.find((pokemon) => pokemon.id.toString() === pokemonId);
    return entry?.displayName || entry?.name || "";
  }

  async function handleSaveMatchResult(options?: SaveMatchOptions) {
    const match = selectedFixture || editingMatch;
    const playoffMatch = selectedPlayoffFixture;
    const openNextReview = options?.openNextReview === true;
    const saveNeedsReview = options?.needsReview ?? matchForm.needsReview;
    const saveReviewNotes = options?.clearReviewNotes
      ? null
      : matchForm.reviewNotes.trim() || null;
    const currentReviewIndex = match
      ? reviewMatches.findIndex((reviewMatch) => reviewMatch.id === match.id)
      : -1;
    const nextReviewId = currentReviewIndex >= 0 && reviewMatches.length > 1
      ? reviewMatches[(currentReviewIndex + 1) % reviewMatches.length]?.id
      : undefined;

    if (saveNeedsReview && !saveReviewNotes) {
      alert("Add a review reason before keeping this match flagged.");
      return;
    }

    if (playoffMatch && !match) {
      const existingMatch = findMatchForPlayoff(playoffMatch);
      const playoffWeek = 100 + playoffMatch.round;

      const pokemonData: MatchPokemonPayload[] = [];

      team1Pokemon.forEach((p) => {
        if (p.pokemonId && playoffMatch.higherSeedId) {
          pokemonData.push({
            seasonCoachId: playoffMatch.higherSeedId,
            pokemonId: parseInt(p.pokemonId),
            kills: parseInt(p.kills) || 0,
            deaths: parseInt(p.deaths) || 0,
            damageDealt: p.damageDealt,
            damageDealtIndirect: p.damageDealtIndirect,
            damageTaken: p.damageTaken,
            damageTakenIndirect: p.damageTakenIndirect,
            turnsActive: p.turnsActive,
            hazardDamageTaken: p.hazardDamageTaken,
            setupMovesUsed: p.setupMovesUsed,
            favorableCrits: p.favorableCrits,
            favorableMisses: p.favorableMisses,
            favorableFlinches: p.favorableFlinches,
            favorableParalysis: p.favorableParalysis,
            favorableFreezes: p.favorableFreezes,
            favorableBurns: p.favorableBurns,
            favorableSleep: p.favorableSleep,
            favorableConfusions: p.favorableConfusions,
            favorableConfusionSelfHits: p.favorableConfusionSelfHits,
            favorableEvents: p.favorableEvents,
            hpRestored: p.hpRestored,
            movesUsed: p.movesUsed,
            revealedItems: p.revealedItems,
          });
        }
      });

      team2Pokemon.forEach((p) => {
        if (p.pokemonId && playoffMatch.lowerSeedId) {
          pokemonData.push({
            seasonCoachId: playoffMatch.lowerSeedId,
            pokemonId: parseInt(p.pokemonId),
            kills: parseInt(p.kills) || 0,
            deaths: parseInt(p.deaths) || 0,
            damageDealt: p.damageDealt,
            damageDealtIndirect: p.damageDealtIndirect,
            damageTaken: p.damageTaken,
            damageTakenIndirect: p.damageTakenIndirect,
            turnsActive: p.turnsActive,
            hazardDamageTaken: p.hazardDamageTaken,
            setupMovesUsed: p.setupMovesUsed,
            favorableCrits: p.favorableCrits,
            favorableMisses: p.favorableMisses,
            favorableFlinches: p.favorableFlinches,
            favorableParalysis: p.favorableParalysis,
            favorableFreezes: p.favorableFreezes,
            favorableBurns: p.favorableBurns,
            favorableSleep: p.favorableSleep,
            favorableConfusions: p.favorableConfusions,
            favorableConfusionSelfHits: p.favorableConfusionSelfHits,
            favorableEvents: p.favorableEvents,
            hpRestored: p.hpRestored,
            movesUsed: p.movesUsed,
            revealedItems: p.revealedItems,
          });
        }
      });

      const winnerName = getSeasonCoachName(
        seasonCoaches,
        matchForm.winnerId ? parseInt(matchForm.winnerId) : null
      );
      const resultName = isDoubleForfeitResult(
        matchForm.winnerId ? parseInt(matchForm.winnerId) : null,
        matchForm.isForfeit
      ) ? "Double loss" : winnerName;
      if (
        !confirm(
          [
            `${existingMatch ? "Update" : "Create"} playoff result?`,
            "",
            `Match: ${getSeasonCoachName(seasonCoaches, playoffMatch.higherSeedId)} vs ${getSeasonCoachName(seasonCoaches, playoffMatch.lowerSeedId)}`,
            `Round: ${getRoundName(playoffMatch.round)}`,
            `Result: ${resultName}`,
            `Score differential: ${parseInt(matchForm.coach1Differential) || 0} / ${parseInt(matchForm.coach2Differential) || 0}`,
            `Pokemon stat rows: ${pokemonData.length}`,
            ...(isHistoricalStatsSeason(selectedSeason?.seasonNumber) ? ["Historical correction: Seasons 5–10"] : []),
            "Affected data: match result, standings, ELO dependencies, playoff advancement, bets, and pick-ems.",
          ].join("\n")
        )
      ) {
        return;
      }

      let matchResponse: Response;
      if (existingMatch) {
        matchResponse = await fetch("/api/matches", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: existingMatch.id,
            winnerId: matchForm.winnerId ? parseInt(matchForm.winnerId) : null,
            coach1Differential: parseInt(matchForm.coach1Differential) || 0,
            coach2Differential: parseInt(matchForm.coach2Differential) || 0,
            isForfeit: matchForm.isForfeit,
            replayUrl: matchForm.replayUrl || null,
            needsReview: saveNeedsReview,
            reviewNotes: saveReviewNotes,
            pokemonData,
            startedAt: matchTimingData.startedAt,
            endedAt: matchTimingData.endedAt,
            turnSnapshots: matchEventData.turnSnapshots,
            keyEvents: matchEventData.keyEvents,
            battleEvents: matchEventData.battleEvents,
            zoroarkInvolved,
          }),
        });
      } else {
        matchResponse = await fetch("/api/matches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seasonId: playoffMatch.seasonId,
            divisionId: playoffMatch.divisionId,
            week: playoffWeek,
            coach1SeasonId: playoffMatch.higherSeedId,
            coach2SeasonId: playoffMatch.lowerSeedId,
            winnerId: matchForm.winnerId ? parseInt(matchForm.winnerId) : null,
            coach1Differential: parseInt(matchForm.coach1Differential) || 0,
            coach2Differential: parseInt(matchForm.coach2Differential) || 0,
            isForfeit: matchForm.isForfeit,
            replayUrl: matchForm.replayUrl || null,
            needsReview: saveNeedsReview,
            reviewNotes: saveReviewNotes,
            pokemonData,
            startedAt: matchTimingData.startedAt,
            endedAt: matchTimingData.endedAt,
            turnSnapshots: matchEventData.turnSnapshots,
            keyEvents: matchEventData.keyEvents,
            battleEvents: matchEventData.battleEvents,
            zoroarkInvolved,
          }),
        });
      }

      const matchResult = await matchResponse.json().catch(() => ({}));
      if (!matchResponse.ok) {
        alert(matchResult.error || "Failed to save playoff match result.");
        return;
      }
      if (matchResult.needsFullRecalc) setNeedsFullRecalc(true);

      if (matchForm.winnerId) {
        const winnerId = parseInt(matchForm.winnerId);
        const higherSeedWins = winnerId === playoffMatch.higherSeedId
          ? Math.abs(parseInt(matchForm.coach1Differential))
          : 0;
        const lowerSeedWins = winnerId === playoffMatch.lowerSeedId
          ? Math.abs(parseInt(matchForm.coach2Differential))
          : 0;

        const playoffResponse = await fetch("/api/playoffs", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: playoffMatch.id,
            winnerId,
            higherSeedWins,
            lowerSeedWins,
          }),
        });
        const playoffResult = await playoffResponse.json().catch(() => ({}));
        if (!playoffResponse.ok) {
          alert(playoffResult.error || "Match saved, but playoff advancement failed.");
          return;
        }

        if (!(await propagatePlayoffWinner(playoffMatch, winnerId))) {
          alert("Match saved, but the next playoff slot could not be updated.");
          return;
        }
      }

      setSelectedPlayoffFixture(null);
      resetForm();
      fetchMatches();
      fetchPlayoffMatches();
      return;
    }

    if (!match) return;

    const pokemonData: MatchPokemonPayload[] = [];

    team1Pokemon.forEach((p) => {
      if (p.pokemonId) {
        pokemonData.push({
          seasonCoachId: match.coach1SeasonId,
          pokemonId: parseInt(p.pokemonId),
          kills: parseInt(p.kills) || 0,
          deaths: parseInt(p.deaths) || 0,
          damageDealt: p.damageDealt,
          damageDealtIndirect: p.damageDealtIndirect,
          damageTaken: p.damageTaken,
          damageTakenIndirect: p.damageTakenIndirect,
          turnsActive: p.turnsActive,
          hazardDamageTaken: p.hazardDamageTaken,
          setupMovesUsed: p.setupMovesUsed,
          favorableCrits: p.favorableCrits,
          favorableMisses: p.favorableMisses,
          favorableFlinches: p.favorableFlinches,
          favorableParalysis: p.favorableParalysis,
          favorableFreezes: p.favorableFreezes,
          favorableBurns: p.favorableBurns,
          favorableSleep: p.favorableSleep,
          favorableConfusions: p.favorableConfusions,
          favorableConfusionSelfHits: p.favorableConfusionSelfHits,
          favorableEvents: p.favorableEvents,
          hpRestored: p.hpRestored,
          movesUsed: p.movesUsed,
          revealedItems: p.revealedItems,
        });
      }
    });

    team2Pokemon.forEach((p) => {
      if (p.pokemonId) {
        pokemonData.push({
          seasonCoachId: match.coach2SeasonId,
          pokemonId: parseInt(p.pokemonId),
          kills: parseInt(p.kills) || 0,
          deaths: parseInt(p.deaths) || 0,
          damageDealt: p.damageDealt,
          damageDealtIndirect: p.damageDealtIndirect,
          damageTaken: p.damageTaken,
          damageTakenIndirect: p.damageTakenIndirect,
          turnsActive: p.turnsActive,
          hazardDamageTaken: p.hazardDamageTaken,
          setupMovesUsed: p.setupMovesUsed,
          favorableCrits: p.favorableCrits,
          favorableMisses: p.favorableMisses,
          favorableFlinches: p.favorableFlinches,
          favorableParalysis: p.favorableParalysis,
          favorableFreezes: p.favorableFreezes,
          favorableBurns: p.favorableBurns,
          favorableSleep: p.favorableSleep,
          favorableConfusions: p.favorableConfusions,
          favorableConfusionSelfHits: p.favorableConfusionSelfHits,
          favorableEvents: p.favorableEvents,
          hpRestored: p.hpRestored,
          movesUsed: p.movesUsed,
          revealedItems: p.revealedItems,
        });
      }
    });

    const winnerName = getSeasonCoachName(
      seasonCoaches,
      matchForm.winnerId ? parseInt(matchForm.winnerId) : null
    );
    const resultName = isDoubleForfeitResult(
      matchForm.winnerId ? parseInt(matchForm.winnerId) : null,
      matchForm.isForfeit
    ) ? "Double loss" : winnerName;
    if (
      !confirm(
        [
          "Save match result?",
          "",
          `Match: ${match.coach1?.teamName || "TBD"} vs ${match.coach2?.teamName || "TBD"}`,
          `Week: ${match.week}`,
          `Result: ${resultName}`,
          `Score differential: ${parseInt(matchForm.coach1Differential) || 0} / ${parseInt(matchForm.coach2Differential) || 0}`,
          `Pokemon stat rows: ${pokemonData.length}`,
          `Replay attached: ${matchForm.replayUrl ? "yes" : "no"}`,
          ...(isHistoricalStatsSeason(selectedSeason?.seasonNumber) ? ["Historical correction: Seasons 5–10"] : []),
          "Affected data: match result, standings, ELO dependencies, bets, and pick-ems.",
        ].join("\n")
      )
    ) {
      return;
    }

    const res = await fetch("/api/matches", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: match.id,
        winnerId: matchForm.winnerId ? parseInt(matchForm.winnerId) : null,
        coach1Differential: parseInt(matchForm.coach1Differential) || 0,
        coach2Differential: parseInt(matchForm.coach2Differential) || 0,
        isForfeit: matchForm.isForfeit,
        replayUrl: matchForm.replayUrl || null,
        needsReview: saveNeedsReview,
        reviewNotes: saveReviewNotes,
        pokemonData,
        startedAt: matchTimingData.startedAt,
        endedAt: matchTimingData.endedAt,
        turnSnapshots: matchEventData.turnSnapshots,
        keyEvents: matchEventData.keyEvents,
        battleEvents: matchEventData.battleEvents,
        zoroarkInvolved,
      }),
    });

    const result = await res.json();
    if (!res.ok) {
      alert(result.error || "Failed to save match result.");
      return;
    }
    if (result.needsFullRecalc) setNeedsFullRecalc(true);

    if (match.week >= 101) {
      const playoffRound = match.week - 100;

      const playoffRes = await fetch(`/api/playoffs?seasonId=${match.seasonId}&divisionId=${match.divisionId}`);
      const playoffData = await playoffRes.json().catch(() => []);
      if (!playoffRes.ok) {
        alert(playoffData.error || "Match saved, but playoff data could not be loaded.");
        return;
      }
      const freshPlayoffs: PlayoffMatch[] = Array.isArray(playoffData) ? playoffData : [];

      const playoffEntry = freshPlayoffs.find(
        (pm) =>
          pm.round === playoffRound &&
          ((pm.higherSeedId === match.coach1SeasonId && pm.lowerSeedId === match.coach2SeasonId) ||
           (pm.higherSeedId === match.coach2SeasonId && pm.lowerSeedId === match.coach1SeasonId))
      );

      if (playoffEntry && matchForm.winnerId) {
        const winnerId = parseInt(matchForm.winnerId);
        const isCoach1HigherSeed = playoffEntry.higherSeedId === match.coach1SeasonId;
        const higherSeedWins = winnerId === playoffEntry.higherSeedId
          ? Math.abs(parseInt(isCoach1HigherSeed ? matchForm.coach1Differential : matchForm.coach2Differential))
          : 0;
        const lowerSeedWins = winnerId === playoffEntry.lowerSeedId
          ? Math.abs(parseInt(isCoach1HigherSeed ? matchForm.coach2Differential : matchForm.coach1Differential))
          : 0;

        const playoffResponse = await fetch("/api/playoffs", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: playoffEntry.id,
            winnerId,
            higherSeedWins,
            lowerSeedWins,
          }),
        });
        const playoffResult = await playoffResponse.json().catch(() => ({}));
        if (!playoffResponse.ok) {
          alert(playoffResult.error || "Match saved, but playoff advancement failed.");
          return;
        }

        if (!(await propagatePlayoffWinner(playoffEntry, winnerId))) {
          alert("Match saved, but the next playoff slot could not be updated.");
          return;
        }
      }

      fetchPlayoffMatches();
    }

    const refreshedMatches = await fetchMatches();
    if (openNextReview && nextReviewId) {
      const nextReviewMatch = refreshedMatches.find((reviewMatch) => reviewMatch.id === nextReviewId);
      if (nextReviewMatch) {
        openMatchForEditing(nextReviewMatch, true);
        return;
      }
    }

    if (options?.keepOpen) return;

    setSelectedFixture(null);
    setEditingMatch(null);
    resetForm();
  }

  function resetForm() {
    setMatchForm({
      winnerId: "",
      coach1Differential: "0",
      coach2Differential: "0",
      isForfeit: false,
      replayUrl: "",
      needsReview: false,
      reviewNotes: "",
    });
    setTeam1Pokemon(Array(6).fill(null).map(() => ({ pokemonId: "", kills: "0", deaths: "0" })));
    setTeam2Pokemon(Array(6).fill(null).map(() => ({ pokemonId: "", kills: "0", deaths: "0" })));
    setScrapeError("");
    setMatchTimingData({ startedAt: null, endedAt: null });
    setMatchEventData({ turnSnapshots: null, keyEvents: null, battleEvents: null });
    setZoroarkInvolved(false);
    setTimeSyncedRosters1(null);
    setTimeSyncedRosters2(null);
  }

  function normalizeName(name: string): string {
    let normalized = name.toLowerCase()
      .replace(/[-\s]/g, "")
      .replace(/therian$/, "therian")
      .replace(/incarnate$/, "incarnate");

    if (normalized.startsWith("keldeo")) normalized = "keldeo";
    // PBO drafts base Silvally; Showdown exposes typed forms such as Silvally-Fairy.
    if (normalized.startsWith("silvally")) normalized = "silvally";
    if (normalized.startsWith("greninja")) normalized = "greninja";
    if (normalized.startsWith("mimikyu")) normalized = "mimikyu";
    if (normalized.startsWith("palafin")) normalized = "palafin";
    if (normalized === "shaymin" || normalized === "shayminland") normalized = "shaymin";
    if (normalized.startsWith("urshifu")) { normalized = normalized.replace(/\*/g, ""); normalized = "urshifu"; }
    if (normalized === "enamorus" || normalized === "enamorusincarnate") normalized = "enamorus";
    if (normalized === "landorus" || normalized === "landorusincarnate") normalized = "landorus";
    if (normalized === "tornadus" || normalized === "tornadusincarnate") normalized = "tornadus";
    if (normalized === "thundurus" || normalized === "thundurusincarnate") normalized = "thundurus";
    if (normalized.startsWith("squawkabilly")) normalized = "squawkabilly";
    if (normalized.startsWith("zarude")) normalized = "zarude";
    if (normalized.startsWith("florges")) normalized = "florges";
    if (normalized.startsWith("dudunsparce")) normalized = "dudunsparce";
    if (normalized.startsWith("alcremie") && normalized !== "alcremiegmax") normalized = "alcremie";
    if (normalized.startsWith("sinistcha")) normalized = "sinistcha";
    if (normalized.startsWith("aegislash")) normalized = "aegislash";
    if (normalized.startsWith("darmanitan") && !normalized.includes("galar")) normalized = "darmanitan";
    if (normalized.startsWith("darmanitangalar")) normalized = "darmanitangalar";
    if (normalized.startsWith("wishiwashi")) normalized = "wishiwashi";
    if (normalized.startsWith("morpeko")) normalized = "morpeko";
    if (normalized.startsWith("eiscue")) normalized = "eiscue";
    if (normalized.startsWith("cramorant")) normalized = "cramorant";
    if (normalized.startsWith("minior")) normalized = "minior";
    if (normalized.startsWith("zygarde")) normalized = "zygarde";
    if (normalized.startsWith("terapagos")) normalized = "terapagos";
    if (normalized.startsWith("tatsugiri")) normalized = "tatsugiri";
    if (normalized.startsWith("basculegion")) normalized = "basculegion";
    if (normalized.startsWith("castform")) normalized = "castform";
    if (normalized.startsWith("cherrim")) normalized = "cherrim";
    if (normalized.startsWith("maushold")) normalized = "maushold";
    if (normalized.startsWith("sinistea")) normalized = "sinistea";
    if (normalized.startsWith("polteageist")) normalized = "polteageist";
    if (normalized.startsWith("poltchageist")) normalized = "poltchageist";
    if (normalized.startsWith("gastrodon")) normalized = "gastrodon";
    if (normalized.startsWith("shellos")) normalized = "shellos";
    if (normalized.startsWith("vivillon")) normalized = "vivillon";
    if (normalized.startsWith("furfrou")) normalized = "furfrou";
    if (normalized.startsWith("floette") && normalized !== "floetteeternal") normalized = "floette";
    if (normalized.startsWith("flabebe")) normalized = "flabebe";
    if (normalized.startsWith("xerneas")) normalized = "xerneas";
    if (normalized.startsWith("pikachu") && normalized !== "pikachugmax" && normalized !== "pikachustarter") normalized = "pikachu";
    if (normalized.startsWith("unown")) normalized = "unown";
    if (normalized.startsWith("deerling")) normalized = "deerling";
    if (normalized.startsWith("sawsbuck")) normalized = "sawsbuck";
    if (normalized.startsWith("burmy")) normalized = "burmy";
    if (normalized.startsWith("indeedee")) normalized = "indeedee";
    if (normalized.startsWith("meowstic") && normalized !== "meowsticmega") normalized = "meowstic";

    return normalized;
  }

  function findReplayRosterMatch(roster: RosterEntry[], replayPokemonName: string) {
    const normalizedReplayName = normalizeName(replayPokemonName);
    const existingMatch = roster.find(
      (entry) =>
        normalizeName(entry.pokemon?.displayName || entry.pokemon?.name || "") ===
        normalizedReplayName
    );
    if (existingMatch) return existingMatch;

    return findBuiltInPokemonNameMatch(
      roster,
      replayPokemonName,
      (entry) => ({
        name: entry.pokemon?.name,
        displayName: entry.pokemon?.displayName,
      })
    );
  }

  async function handleScrapeReplay() {
    if (!matchForm.replayUrl) {
      setScrapeError("Please enter a replay URL first");
      return;
    }

    const currentMatch = selectedFixture || editingMatch;
    const playoffMatch = selectedPlayoffFixture;

    const team1Rosters = timeSyncedRosters1 || currentMatch?.coach1?.rosters ||
      seasonCoaches.find((sc) => sc.id === playoffMatch?.higherSeedId)?.rosters || [];
    const team2Rosters = timeSyncedRosters2 || currentMatch?.coach2?.rosters ||
      seasonCoaches.find((sc) => sc.id === playoffMatch?.lowerSeedId)?.rosters || [];

    if (team1Rosters.length === 0 && team2Rosters.length === 0) {
      setScrapeError("No roster data available to match Pokemon");
      return;
    }

    setScraping(true);
    setScrapeError("");
    setZoroarkInvolved(false);

    try {
      const res = await fetch("/api/replay-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          replayUrl: matchForm.replayUrl,
          expandedHaxRules: usesExpandedHaxRules(
            selectedSeason?.seasonNumber,
            currentMatch?.week ?? (playoffMatch ? 100 + playoffMatch.round : null),
            currentMatch?.id,
          ),
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to scrape replay");
      }

      const data = await res.json();

      let p1MatchesTeam1 = 0;
      let p1MatchesTeam2 = 0;
      let p2MatchesTeam1 = 0;
      let p2MatchesTeam2 = 0;

      for (const replayPoke of data.p1Team) {
        if (findReplayRosterMatch(team1Rosters, replayPoke.name)) p1MatchesTeam1++;
        if (findReplayRosterMatch(team2Rosters, replayPoke.name)) p1MatchesTeam2++;
      }

      for (const replayPoke of data.p2Team) {
        if (findReplayRosterMatch(team1Rosters, replayPoke.name)) p2MatchesTeam1++;
        if (findReplayRosterMatch(team2Rosters, replayPoke.name)) p2MatchesTeam2++;
      }

      const replayP1IsTeam1 = (p1MatchesTeam1 + p2MatchesTeam2) >= (p1MatchesTeam2 + p2MatchesTeam1);

      const team1ReplayData = replayP1IsTeam1 ? data.p1Team : data.p2Team;
      const team2ReplayData = replayP1IsTeam1 ? data.p2Team : data.p1Team;
      const team1Remaining = replayP1IsTeam1 ? data.p1Remaining : data.p2Remaining;
      const team2Remaining = replayP1IsTeam1 ? data.p2Remaining : data.p1Remaining;

      const newTeam1Pokemon: PokemonEntry[] = [];
      for (const replayPoke of team1ReplayData) {
        const matchingRoster = findReplayRosterMatch(team1Rosters, replayPoke.name);
        if (matchingRoster) {
          newTeam1Pokemon.push({
            pokemonId: matchingRoster.pokemonId.toString(),
            kills: replayPoke.kills.toString(),
            deaths: replayPoke.deaths.toString(),
            damageDealt: replayPoke.damageDealt,
            damageDealtIndirect: replayPoke.damageDealtIndirect,
            damageTaken: replayPoke.damageTaken,
            damageTakenIndirect: replayPoke.damageTakenIndirect,
            turnsActive: replayPoke.turnsActive,
            hazardDamageTaken: replayPoke.hazardDamageTaken,
            setupMovesUsed: replayPoke.setupMovesUsed,
            favorableCrits: replayPoke.favorableCrits,
            favorableMisses: replayPoke.favorableMisses,
            favorableFlinches: replayPoke.favorableFlinches,
            favorableParalysis: replayPoke.favorableParalysis,
            favorableFreezes: replayPoke.favorableFreezes,
            favorableBurns: replayPoke.favorableBurns,
            favorableSleep: replayPoke.favorableSleep,
            favorableConfusions: replayPoke.favorableConfusions,
            favorableConfusionSelfHits: replayPoke.favorableConfusionSelfHits,
            favorableEvents: replayPoke.favorableEvents,
            hpRestored: replayPoke.hpRestored,
            movesUsed: replayPoke.movesUsed,
            revealedItems: replayPoke.revealedItems,
          });
        }
      }
      while (newTeam1Pokemon.length < 6) {
        newTeam1Pokemon.push({ pokemonId: "", kills: "0", deaths: "0" });
      }
      setTeam1Pokemon(newTeam1Pokemon);

      const newTeam2Pokemon: PokemonEntry[] = [];
      for (const replayPoke of team2ReplayData) {
        const matchingRoster = findReplayRosterMatch(team2Rosters, replayPoke.name);
        if (matchingRoster) {
          newTeam2Pokemon.push({
            pokemonId: matchingRoster.pokemonId.toString(),
            kills: replayPoke.kills.toString(),
            deaths: replayPoke.deaths.toString(),
            damageDealt: replayPoke.damageDealt,
            damageDealtIndirect: replayPoke.damageDealtIndirect,
            damageTaken: replayPoke.damageTaken,
            damageTakenIndirect: replayPoke.damageTakenIndirect,
            turnsActive: replayPoke.turnsActive,
            hazardDamageTaken: replayPoke.hazardDamageTaken,
            setupMovesUsed: replayPoke.setupMovesUsed,
            favorableCrits: replayPoke.favorableCrits,
            favorableMisses: replayPoke.favorableMisses,
            favorableFlinches: replayPoke.favorableFlinches,
            favorableParalysis: replayPoke.favorableParalysis,
            favorableFreezes: replayPoke.favorableFreezes,
            favorableBurns: replayPoke.favorableBurns,
            favorableSleep: replayPoke.favorableSleep,
            favorableConfusions: replayPoke.favorableConfusions,
            favorableConfusionSelfHits: replayPoke.favorableConfusionSelfHits,
            favorableEvents: replayPoke.favorableEvents,
            hpRestored: replayPoke.hpRestored,
            movesUsed: replayPoke.movesUsed,
            revealedItems: replayPoke.revealedItems,
          });
        }
      }
      while (newTeam2Pokemon.length < 6) {
        newTeam2Pokemon.push({ pokemonId: "", kills: "0", deaths: "0" });
      }
      setTeam2Pokemon(newTeam2Pokemon);

      const team1Id = currentMatch?.coach1SeasonId || playoffMatch?.higherSeedId;
      const team2Id = currentMatch?.coach2SeasonId || playoffMatch?.lowerSeedId;

      let winnerId = "";
      if (replayP1IsTeam1) {
        winnerId = data.winner === "p1" ? (team1Id?.toString() || "") : (team2Id?.toString() || "");
      } else {
        winnerId = data.winner === "p1" ? (team2Id?.toString() || "") : (team1Id?.toString() || "");
      }

      const team1FinalDiff = winnerId === team1Id?.toString() ? team1Remaining : -team2Remaining;
      const team2FinalDiff = winnerId === team2Id?.toString() ? team2Remaining : -team1Remaining;

      setMatchForm({
        ...matchForm,
        winnerId,
        coach1Differential: team1FinalDiff.toString(),
        coach2Differential: team2FinalDiff.toString(),
        isForfeit: false,
      });

      setMatchTimingData({
        startedAt: data.startedAt || null,
        endedAt: data.endedAt || null,
      });

      setMatchEventData({
        turnSnapshots: data.turnSnapshots || null,
        keyEvents: data.keyEvents || null,
        battleEvents: data.battleEvents || null,
      });

      if (data.zoroarkInvolved) setZoroarkInvolved(true);

    } catch (error) {
      console.error("Scrape error:", error);
      setScrapeError(error instanceof Error ? error.message : "Failed to scrape replay");
    } finally {
      setScraping(false);
    }
  }

  async function propagatePlayoffWinner(playoffMatch: PlayoffMatch, winnerId: number): Promise<boolean> {
    try {
      const { round, bracketPosition, divisionId, seasonId } = playoffMatch;

      let nextRound: number;
      let nextPosition: number;
      let isHigherSeedSlot: boolean;

      if (round === 1) {
        nextRound = 2;
        nextPosition = bracketPosition <= 2 ? 1 : 2;
        isHigherSeedSlot = bracketPosition === 1 || bracketPosition === 3;
      } else if (round === 2) {
        nextRound = 3;
        nextPosition = 1;
        isHigherSeedSlot = bracketPosition === 1;
      } else {
        return true;
      }

      const res = await fetch(`/api/playoffs?seasonId=${seasonId}&divisionId=${divisionId}`);
      const playoffData = await res.json().catch(() => []);
      if (!res.ok || !Array.isArray(playoffData)) return false;
      const freshPlayoffs: PlayoffMatch[] = playoffData;

      const divisionPlayoffs = freshPlayoffs.filter(
        (pm) => pm.round === nextRound && pm.bracketPosition === nextPosition
      );

      if (divisionPlayoffs.length > 0) {
        const nextMatch = divisionPlayoffs[0];
        const updateData: Record<string, unknown> = { id: nextMatch.id };
        if (isHigherSeedSlot) {
          updateData.higherSeedId = winnerId;
        } else {
          updateData.lowerSeedId = winnerId;
        }
        const response = await fetch("/api/playoffs", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updateData),
        });
        return response.ok;
      } else {
        const createData: Record<string, unknown> = {
          seasonId,
          divisionId,
          round: nextRound,
          bracketPosition: nextPosition,
        };
        if (isHigherSeedSlot) {
          createData.higherSeedId = winnerId;
        } else {
          createData.lowerSeedId = winnerId;
        }
        const response = await fetch("/api/playoffs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createData),
        });
        return response.ok;
      }
    } catch (error) {
      console.error("Failed to propagate playoff winner:", error);
      return false;
    }
  }

  async function handleDeleteMatch(id: number) {
    const match = matches.find((m) => m.id === id);
    if (
      !confirm(
        [
          "Delete this match?",
          "",
          match
            ? `Match: Week ${match.week}, ${match.coach1?.teamName || "TBD"} vs ${match.coach2?.teamName || "TBD"}`
            : `Match ID: ${id}`,
          match ? `Completed result: ${match.winnerId ? "yes" : "no"}` : "",
          match ? `Pokemon stat rows: ${match.matchPokemon?.length || 0}` : "",
          "Affected data: match row, match Pokemon stats, standings, ELO dependencies, bets, and pick-ems.",
          "This cannot be undone.",
        ]
          .filter(Boolean)
          .join("\n")
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/matches?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const text = await res.text();
        alert(`Failed to delete: ${text || 'Unknown error'}`);
        return;
      }
      const result = await res.json();
      if (result.needsFullRecalc) setNeedsFullRecalc(true);
      await fetchMatches();
      await fetchPlayoffMatches();
    } catch (err) {
      alert(`Error deleting match: ${err}`);
    }
  }

  const coachesInDivision = selectedDivision
    ? seasonCoaches.filter((sc) => sc.divisionId === selectedDivision.id)
    : seasonCoaches;
  const scheduleValidation = selectedSeason && selectedDivision && schedulePreview.length > 0
    ? validateScheduleUpload(schedulePreview, coachesInDivision, selectedSeason)
    : null;
  const displayedMatches = useMemo(() => {
    const query = matchSearch.trim().toLowerCase();
    return [...matches]
      .filter((match) => {
        const matchesSearch = !query ||
          match.week.toString().includes(query) ||
          match.division?.name.toLowerCase().includes(query) ||
          match.coach1?.teamName.toLowerCase().includes(query) ||
          match.coach2?.teamName.toLowerCase().includes(query) ||
          match.coach1?.coach?.name.toLowerCase().includes(query) ||
          match.coach2?.coach?.name.toLowerCase().includes(query);
        const completed = isCompletedMatchResult(match.winnerId, match.isForfeit);
        const matchesFilter =
          matchFilter === "all" ||
          (matchFilter === "pending" && !completed) ||
          (matchFilter === "completed" && completed) ||
          (matchFilter === "forfeit" && match.isForfeit) ||
          (matchFilter === "review" && match.needsReview);
        return matchesSearch && matchesFilter;
      })
      .sort((a, b) => {
        if (a.needsReview !== b.needsReview) return a.needsReview ? -1 : 1;
        const aCompleted = isCompletedMatchResult(a.winnerId, a.isForfeit);
        const bCompleted = isCompletedMatchResult(b.winnerId, b.isForfeit);
        if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;
        return a.week - b.week || a.id - b.id;
      });
  }, [matches, matchFilter, matchSearch]);
  const reviewMatches = useMemo(
    () => matches
      .filter((match) => match.needsReview)
      .sort((a, b) => a.week - b.week || a.id - b.id),
    [matches]
  );
  const currentReviewIndex = (selectedFixture || editingMatch)
    ? reviewMatches.findIndex((match) => match.id === (selectedFixture || editingMatch)?.id)
    : -1;
  const reviewTarget = reviewMatches.length > 0
    ? reviewMatches[currentReviewIndex >= 0 ? (currentReviewIndex + 1) % reviewMatches.length : 0]
    : null;
  const nextPendingMatch = [...matches]
    .filter((match) => !isCompletedMatchResult(match.winnerId, match.isForfeit))
    .sort((a, b) => a.week - b.week || a.id - b.id)[0] || null;
  const selectedMatchSelectorValue = selectedPlayoffFixture
    ? `playoff-${selectedPlayoffFixture.id}`
    : (selectedFixture || editingMatch)
      ? `match-${(selectedFixture || editingMatch)!.id}`
      : "";
  const historicalCorrectionPreview = isHistoricalStatsSeason(selectedSeason?.seasonNumber) && (selectedFixture || editingMatch)
    ? {
        before: summarizePokemonStats((selectedFixture || editingMatch)!.matchPokemon),
        after: summarizePokemonStats([...team1Pokemon, ...team2Pokemon]),
      }
    : null;
  const matchFilterCounts: Record<MatchFilter, number> = {
    all: matches.length,
    pending: matches.filter((match) => !isCompletedMatchResult(match.winnerId, match.isForfeit)).length,
    completed: matches.filter((match) => isCompletedMatchResult(match.winnerId, match.isForfeit)).length,
    forfeit: matches.filter((match) => match.isForfeit).length,
    review: matches.filter((match) => match.needsReview).length,
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Match Management</h1>
        <p className="text-[var(--foreground-muted)]">
          Upload schedules, enter results, and manage playoffs
        </p>
      </div>

      {needsFullRecalc && (
        <div className="sticky top-20 z-40 flex items-center justify-between gap-4 rounded-lg border border-yellow-500/50 bg-yellow-900/95 p-4 shadow-lg backdrop-blur">
          <div>
            <p className="font-medium text-yellow-200">Historical data modified</p>
            <p className="text-sm text-yellow-200/70">
              Click &quot;Recalculate ELO&quot; when you&apos;re done editing to update all ratings.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button
              onClick={handleRecalculateElo}
              disabled={recalculating}
              className="bg-yellow-600 hover:bg-yellow-700 shrink-0"
            >
              {recalculating ? "Recalculating..." : "Recalculate ELO"}
            </Button>
            {recalcMessage && (
              <p className={`text-xs ${recalcMessage.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
                {recalcMessage}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[var(--card)]">
        {(["schedule", "results", "playoffs"] as TabType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-medium capitalize transition-colors ${
              activeTab === tab
                ? "border-b-2 border-[var(--primary)] text-[var(--primary)]"
                : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Season/Division Selector */}
      <Card ref={seasonDivisionRef} className="!p-4">
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label>Season</Label>
              <Select
                value={selectedSeason?.id || ""}
                onChange={(e) => {
                  const season = seasons.find((s) => s.id === parseInt(e.target.value));
                  setSelectedSeason(season || null);
                  setSelectedDivision(season?.divisions[0] || null);
                  setSelectedFixture(null);
                  setSelectedPlayoffFixture(null);
                  setEditingMatch(null);
                  resetForm();
                  autoOpenedContextRef.current = null;
                }}
                className="w-full sm:w-48"
              >
                <option value="">Select season</option>
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.isCurrent ? " (Current)" : ""}
                  </option>
                ))}
              </Select>
            </div>
            {selectedSeason && (
              <div>
                <Label>Division</Label>
                <Select
                  value={selectedDivision?.id || ""}
                  onChange={(e) => {
                    const div = selectedSeason.divisions.find((d) => d.id === parseInt(e.target.value));
                    setSelectedDivision(div || null);
                    setSelectedFixture(null);
                    setSelectedPlayoffFixture(null);
                    setEditingMatch(null);
                    resetForm();
                    autoOpenedContextRef.current = null;
                  }}
                  className="w-full sm:w-48"
                >
                  <option value="">Select a division</option>
                  <optgroup label={selectedSeason.name}>
                    {selectedSeason.divisions.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </optgroup>
                </Select>
              </div>
            )}
            {selectedSeason && activeTab === "schedule" && (
              <div className="ml-auto flex flex-col items-center">
                <button
                  type="button"
                  onClick={async () => {
                    const newValue = !(selectedSeason.isSchedulePublic ?? true);
                    if (!confirm(`Are you sure you want to ${newValue ? "show" : "hide"} the schedule on the public site?`)) return;
                    setSeasons(seasons.map((s) => s.id === selectedSeason.id ? { ...s, isSchedulePublic: newValue } : s));
                    setSelectedSeason({ ...selectedSeason, isSchedulePublic: newValue });
                    const response = await fetch("/api/seasons", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: selectedSeason.id, isSchedulePublic: newValue }),
                    });
                    if (!response.ok) {
                      const result = await response.json().catch(() => ({}));
                      setSeasons(seasons.map((s) => s.id === selectedSeason.id ? { ...s, isSchedulePublic: !newValue } : s));
                      setSelectedSeason({ ...selectedSeason, isSchedulePublic: !newValue });
                      alert(result.error || "Failed to update schedule visibility.");
                    }
                  }}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    (selectedSeason.isSchedulePublic ?? true)
                      ? "bg-green-600 hover:bg-green-700 text-white"
                      : "bg-red-600 hover:bg-red-700 text-white"
                  }`}
                >
                  {(selectedSeason.isSchedulePublic ?? true) ? "Schedule Visible" : "Schedule Hidden"}
                </button>
                <p className="text-xs text-gray-400 mt-1 text-center max-w-48">
                  Shows/hides the schedule on public division pages. Hide during pre-season.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedSeason && (
        <>
          {/* Schedule Tab */}
          {activeTab === "schedule" && (
            <Card>
              <CardHeader>
                <CardTitle>Upload Schedule</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selectedDivision ? (
                  <div className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-4">
                    <p className="text-sm font-medium text-[var(--warning)]">
                      Select a division above before uploading a schedule.
                    </p>
                    <p className="mt-2 text-xs text-[var(--foreground-muted)]">
                      Schedules are uploaded one division at a time with a CSV containing: week, team1, team2.
                    </p>
                    <Button className="mt-4" variant="outline" disabled>
                      Upload Schedule CSV
                    </Button>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-sm text-[var(--foreground-muted)] mb-2">
                        Upload a CSV with columns: week, team1, team2
                      </p>
                      <p className="text-xs text-[var(--foreground-muted)] mb-4">
                        Teams in division: {coachesInDivision.map((sc) => sc.teamName).join(", ")}
                      </p>
                      <div className="flex items-center gap-3">
                        <input
                          ref={scheduleFileRef}
                          type="file"
                          accept=".csv"
                          onChange={handleScheduleFileUpload}
                          className="hidden"
                        />
                        <Button variant="outline" onClick={() => scheduleFileRef.current?.click()}>
                          Upload Schedule CSV
                        </Button>
                        {scheduleCsvFile && <span className="text-sm">{scheduleCsvFile}</span>}
                      </div>
                      {scheduleCsvError && (
                        <p className="text-sm text-[var(--error)] mt-2">{scheduleCsvError}</p>
                      )}
                    </div>

                    {schedulePreview.length > 0 && (
                      <div className="space-y-2">
                        <p className="font-medium">Preview ({schedulePreview.length} matches):</p>
                        <div className="grid gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--background-secondary)] p-3 text-sm sm:grid-cols-4">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-[var(--foreground-muted)]">Target</p>
                            <p className="font-medium">{selectedDivision.name}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-[var(--foreground-muted)]">Valid rows</p>
                            <p className="font-medium text-[var(--success)]">{scheduleValidation?.validRows.length ?? 0}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-[var(--foreground-muted)]">Skipped rows</p>
                            <p className="font-medium text-[var(--warning)]">{scheduleValidation?.skippedRows ?? 0}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-[var(--foreground-muted)]">Weeks</p>
                            <p className="font-medium">{scheduleValidation && scheduleValidation.weeks.length > 0 ? scheduleValidation.weeks.join(", ") : "None"}</p>
                          </div>
                        </div>
                        {scheduleValidation && scheduleValidation.issues.length > 0 && (
                          <div className="rounded-lg border border-[var(--error)]/40 bg-[var(--error)]/10 p-3 text-sm text-[var(--error)]">
                            <p className="font-semibold">Fix before upload:</p>
                            <ul className="mt-2 list-disc space-y-1 pl-5">
                              {scheduleValidation.issues.slice(0, 8).map((issue) => (
                                <li key={issue}>{issue}</li>
                              ))}
                            </ul>
                            {scheduleValidation.issues.length > 8 && (
                              <p className="mt-2 text-xs">+{scheduleValidation.issues.length - 8} more issue{scheduleValidation.issues.length - 8 === 1 ? "" : "s"}</p>
                            )}
                          </div>
                        )}
                        <div className="max-h-60 overflow-y-auto space-y-1">
                          {schedulePreview.map((entry, i) => (
                            <div key={i} className="text-sm p-2 rounded bg-[var(--background-secondary)]">
                              Week {entry.week}: {entry.team1} vs {entry.team2}
                            </div>
                          ))}
                        </div>
                        <Button onClick={handleUploadSchedule} disabled={!!scheduleValidation?.issues.length}>
                          Upload Schedule
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Results Tab */}
          {activeTab === "results" && (
            <>
              {reviewMatches.length > 0 && (
                <Card className="sticky top-3 z-30 border-yellow-400/50 bg-yellow-400/10 shadow-lg">
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-yellow-200/80">Review Queue</p>
                      <p className="font-semibold text-yellow-100">
                        {reviewMatches.length} match{reviewMatches.length === 1 ? "" : "es"} need review
                      </p>
                      <p className="text-sm text-yellow-200/70">
                        {currentReviewIndex >= 0
                          ? `Reviewing ${currentReviewIndex + 1} of ${reviewMatches.length}`
                          : "Open the next flagged match to begin."}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="shrink-0 bg-yellow-500 text-black hover:bg-yellow-400"
                      onClick={() => reviewTarget && openMatchForEditing(reviewTarget, true)}
                    >
                      {currentReviewIndex >= 0 ? "Next Review" : "Review Next"}
                    </Button>
                  </CardContent>
                </Card>
              )}

              <Card ref={resultEditorRef}>
                <CardHeader>
                  <CardTitle>
                    {editingMatch ? `Edit Match: Week ${editingMatch.week}` : "Enter Match Result"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!editingMatch && (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <div className="min-w-0 flex-1">
                        <Label>Select Match</Label>
                        <Select
                          value={selectedMatchSelectorValue}
                          onChange={(e) => selectMatchFromPicker(e.target.value)}
                          disabled={matches.length === 0 && playoffMatches.length === 0}
                        >
                          <option value="">Choose a match</option>
                          {regularWeeks.map((week) => {
                            const weekMatches = matches
                              .filter((match) => match.week === week)
                              .sort((a, b) => a.id - b.id);
                            if (weekMatches.length === 0) return null;
                            return (
                              <optgroup key={`week-${week}`} label={`Week ${week}`}>
                                {weekMatches.map((match) => (
                                  <option key={match.id} value={`match-${match.id}`}>
                                    {match.needsReview ? "⚠ REVIEW — " : ""}
                                    {match.coach1?.teamName} vs {match.coach2?.teamName}
                                    {isCompletedMatchResult(match.winnerId, match.isForfeit) ? " (completed)" : " (needs result)"}
                                  </option>
                                ))}
                              </optgroup>
                            );
                          })}
                          {playoffRounds.map((round) => {
                            const roundMatches = playoffMatches.filter((match) => match.round === round);
                            return (
                              <optgroup key={`playoff-${round}`} label={getRoundName(round)}>
                                {roundMatches.map((playoffMatch) => {
                                  const existingMatch = findMatchForPlayoff(playoffMatch);
                                  return (
                                    <option key={playoffMatch.id} value={`playoff-${playoffMatch.id}`}>
                                      {playoffMatch.higherSeed?.teamName || "TBD"} vs {playoffMatch.lowerSeed?.teamName || "TBD"}
                                      {existingMatch?.needsReview ? " ⚠ REVIEW" : existingMatch?.winnerId ? " (completed)" : " (needs result)"}
                                    </option>
                                  );
                                })}
                              </optgroup>
                            );
                          })}
                        </Select>
                        <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                          Reviews are marked with ⚠ and pending matches are shown first in the list below.
                        </p>
                      </div>
                      <Button
                        type="button"
                        onClick={() => nextPendingMatch && openMatchForEditing(nextPendingMatch, true)}
                        disabled={!nextPendingMatch}
                        className="shrink-0"
                      >
                        Enter Next Result
                      </Button>
                    </div>
                  )}

                  {(selectedFixture || editingMatch || selectedPlayoffFixture) && (
                    <>
                      <div className="p-3 rounded-lg bg-[var(--background-secondary)]">
                        <p className="font-medium text-center text-lg">
                          {selectedPlayoffFixture
                            ? `${selectedPlayoffFixture.higherSeed?.teamName} vs ${selectedPlayoffFixture.lowerSeed?.teamName}`
                            : `${(selectedFixture || editingMatch)?.coach1?.teamName} vs ${(selectedFixture || editingMatch)?.coach2?.teamName}`}
                        </p>
                        {(selectedFixture || editingMatch) && (
                          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-[var(--foreground-muted)]">
                            <span>Week {(selectedFixture || editingMatch)?.week}</span>
                            <span>{(selectedFixture || editingMatch)?.division?.name}</span>
                            {matchForm.needsReview && (
                              <span className="rounded bg-yellow-400 px-2 py-0.5 font-semibold text-black">Needs Review</span>
                            )}
                            {matchForm.replayUrl && (
                              <a
                                href={matchForm.replayUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[var(--primary)] underline hover:text-[var(--foreground)]"
                              >
                                Open Replay
                              </a>
                            )}
                            {(selectedFixture || editingMatch)?.playedAt && (
                              <span>Recorded {formatMatchDate((selectedFixture || editingMatch)?.playedAt)}</span>
                            )}
                          </div>
                        )}
                        {(selectedFixture || editingMatch)?.needsReview && matchForm.reviewNotes && (
                          <p className="mt-2 text-center text-xs text-yellow-200">
                            Review reason: {matchForm.reviewNotes}
                          </p>
                        )}
                        {selectedPlayoffFixture && (
                          <p className="text-center text-sm text-[var(--primary)]">
                            {getRoundName(selectedPlayoffFixture.round)}
                          </p>
                        )}
                      </div>

                      {/* Replay URL with Scrape Button */}
                      <div className="p-4 rounded-lg border border-[var(--card-border)] bg-[var(--card)]">
                        <Label className="text-base font-medium">Replay URL (Optional)</Label>
                        <p className="text-xs text-[var(--foreground-muted)] mb-2">
                          Paste a Pokemon Showdown replay URL to auto-populate Pokemon, K/D, winner, and differential
                        </p>
                        <div className="flex gap-2">
                          <Input
                            value={matchForm.replayUrl}
                            onChange={(e) => setMatchForm({ ...matchForm, replayUrl: e.target.value })}
                            placeholder="https://replay.pokemonshowdown.com/..."
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            onClick={handleScrapeReplay}
                            disabled={scraping || !matchForm.replayUrl}
                            variant="outline"
                          >
                            {scraping
                              ? "Scraping..."
                              : matchForm.needsReview || (selectedFixture || editingMatch)?.needsReview
                                ? "Re-scrape Replay"
                                : "Scrape Data"}
                          </Button>
                        </div>
                        {scrapeError && (
                          <p className="text-sm text-[var(--error)] mt-2">{scrapeError}</p>
                        )}
                        {zoroarkInvolved && (
                          <p className="text-sm text-[var(--warning)] mt-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded">
                            Warning: Zoroark detected in this match. Due to Illusion, K/D stats may be inaccurate. Please verify manually.
                          </p>
                        )}
                        {matchTimingData.startedAt && (
                          <p className="text-xs text-[var(--success)] mt-2">
                            Match timing captured: {new Date(matchTimingData.startedAt).toLocaleString()}
                          </p>
                        )}
                      </div>

                      <div className={`rounded-lg border p-4 ${
                        matchForm.needsReview
                          ? "border-yellow-400 bg-yellow-400/15"
                          : "border-[var(--card-border)] bg-[var(--card)]"
                      }`}>
                        <Label>Review Status</Label>
                        <Select
                          value={matchForm.needsReview ? "review" : "approved"}
                          onChange={(event) => setMatchForm({
                            ...matchForm,
                            needsReview: event.target.value === "review",
                          })}
                        >
                          <option value="approved">Approved / Ready</option>
                          <option value="review">Needs Review</option>
                        </Select>
                        <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                          Flagged matches stay in the review queue until approved.
                        </p>
                        <Label className="mt-3">Review reason{matchForm.needsReview ? " *" : ""}</Label>
                        <TextArea
                          value={matchForm.reviewNotes}
                          onChange={(event) => setMatchForm({
                            ...matchForm,
                            reviewNotes: event.target.value,
                          })}
                          placeholder="Explain the replay, score, roster, format, or kill-attribution issue."
                          rows={3}
                          required={matchForm.needsReview}
                        />
                      </div>

                      {/* Result Fields */}
                      {(() => {
                        const currentMatch = selectedFixture || editingMatch;
                        const team1Id = currentMatch?.coach1SeasonId || selectedPlayoffFixture?.higherSeedId || "";
                        const team2Id = currentMatch?.coach2SeasonId || selectedPlayoffFixture?.lowerSeedId || "";
                        const team1Name = currentMatch?.coach1?.teamName || selectedPlayoffFixture?.higherSeed?.teamName;
                        const team2Name = currentMatch?.coach2?.teamName || selectedPlayoffFixture?.lowerSeed?.teamName;

                        return (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <Label>Winner</Label>
                              <Select
                                value={matchForm.winnerId}
                                onChange={(e) => setMatchForm({ ...matchForm, winnerId: e.target.value })}
                              >
                                <option value="">Select winner</option>
                                <option value={team1Id}>{team1Name}</option>
                                <option value={team2Id}>{team2Name}</option>
                              </Select>
                            </div>
                            <div>
                              <Label>{team1Name} Diff</Label>
                              <Input
                                type="number"
                                value={matchForm.coach1Differential}
                                onChange={(e) => setMatchForm({ ...matchForm, coach1Differential: e.target.value })}
                              />
                            </div>
                            <div>
                              <Label>{team2Name} Diff</Label>
                              <Input
                                type="number"
                                value={matchForm.coach2Differential}
                                onChange={(e) => setMatchForm({ ...matchForm, coach2Differential: e.target.value })}
                              />
                            </div>
                            <div className="col-span-2 md:col-span-4 rounded-lg border border-[var(--card-border)] bg-[var(--background-secondary)] p-3">
                              <Label>Forfeit Type</Label>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Button type="button" size="sm" variant="outline" onClick={declareForfeit}>
                                  Declare FF
                                </Button>
                                <Button type="button" size="sm" variant="destructive" onClick={declareDoubleForfeit}>
                                  Declare Double FF
                                </Button>
                                <label className="ml-1 flex items-center gap-2 cursor-pointer text-sm text-[var(--foreground-muted)]">
                                  <input
                                    type="checkbox"
                                    checked={matchForm.isForfeit}
                                    onChange={(e) => setMatchForm({ ...matchForm, isForfeit: e.target.checked })}
                                    className="h-4 w-4 accent-[var(--primary)]"
                                  />
                                  Forfeit flag enabled
                                </label>
                              </div>
                              <p className="mt-2 text-xs text-[var(--foreground-muted)]">
                                FF keeps one selected winner. Double FF clears the winner, sets both differentials to -3, and syncs both losses to Google Sheets.
                              </p>
                              <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                                A normal 0-0 game is separate: leave the forfeit flag off, select the winner, and keep both Diff fields at 0.
                              </p>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Pokemon K/D */}
                      {!matchForm.isForfeit && (
                        <>
                          {(() => {
                            const currentMatch = selectedFixture || editingMatch;
                            const team1Rosters = timeSyncedRosters1 || currentMatch?.coach1?.rosters ||
                              seasonCoaches.find((sc) => sc.id === selectedPlayoffFixture?.higherSeedId)?.rosters;
                            const team2Rosters = timeSyncedRosters2 || currentMatch?.coach2?.rosters ||
                              seasonCoaches.find((sc) => sc.id === selectedPlayoffFixture?.lowerSeedId)?.rosters;
                            const team1PokemonOptions = getSelectablePokemon(team1Rosters);
                            const team2PokemonOptions = getSelectablePokemon(team2Rosters);
                            const team1Name = currentMatch?.coach1?.teamName || selectedPlayoffFixture?.higherSeed?.teamName;
                            const team2Name = currentMatch?.coach2?.teamName || selectedPlayoffFixture?.lowerSeed?.teamName;

                            return (
                              <>
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <Label className="text-[var(--primary)]">
                                      {team1Name} Pokemon (6)
                                    </Label>
                                    <div className="flex gap-4 text-xs text-[var(--foreground-muted)]">
                                      <span className="w-16 text-center">Kills</span>
                                      <span className="w-16 text-center">Deaths</span>
                                    </div>
                                  </div>
                                  {selectedSeason && isHistoricalStatsSeason(selectedSeason.seasonNumber) && (
                                    <p className="mb-2 text-xs text-[var(--foreground-muted)]">
                                      Full Pokemon pool enabled for historical stat corrections.
                                    </p>
                                  )}
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {team1Pokemon.map((p, i) => {
                                      const selectedName = getPokemonName(team1PokemonOptions, p.pokemonId);
                                      return (
                                        <div key={i} className="flex items-center gap-2 p-2 rounded bg-[var(--background-secondary)]">
                                          <Select
                                            value={p.pokemonId}
                                            onChange={(e) => {
                                              const newPokemon = [...team1Pokemon];
                                              newPokemon[i] = { ...newPokemon[i], pokemonId: e.target.value };
                                              setTeam1Pokemon(newPokemon);
                                            }}
                                            className="flex-1"
                                          >
                                            <option value="">{selectedName || `Select Pokemon ${i + 1}`}</option>
                                            {team1PokemonOptions.map((pokemon) => (
                                              <option key={pokemon.id} value={pokemon.id}>
                                                {pokemon.displayName || pokemon.name}
                                              </option>
                                            ))}
                                          </Select>
                                          <div className="flex items-center gap-1">
                                            <span className="text-xs text-[var(--success)] font-medium">K:</span>
                                            <input
                                              type="number"
                                              value={p.kills}
                                              onChange={(e) => {
                                                const newPokemon = [...team1Pokemon];
                                                newPokemon[i] = { ...newPokemon[i], kills: e.target.value };
                                                setTeam1Pokemon(newPokemon);
                                              }}
                                              className="w-12 px-1 py-1 text-center rounded bg-[var(--background)] border border-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                                              min="0"
                                            />
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <span className="text-xs text-[var(--error)] font-medium">D:</span>
                                            <input
                                              type="number"
                                              value={p.deaths}
                                              onChange={(e) => {
                                                const newPokemon = [...team1Pokemon];
                                                newPokemon[i] = { ...newPokemon[i], deaths: e.target.value };
                                                setTeam1Pokemon(newPokemon);
                                              }}
                                              className="w-12 px-1 py-1 text-center rounded bg-[var(--background)] border border-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                                              min="0"
                                            />
                                          </div>
                                          <span
                                            className="max-w-28 truncate text-[9px] font-bold text-[var(--accent)]"
                                            title={p.revealedItems?.map((entry) => `${entry.item}, turn ${entry.turn}, ${entry.source}`).join(" → ") || "Unknown item"}
                                          >
                                            {p.revealedItems?.map((entry) => entry.item).join(" → ") || "Unknown"}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <Label className="text-[var(--secondary)]">
                                      {team2Name} Pokemon (6)
                                    </Label>
                                    <div className="flex gap-4 text-xs text-[var(--foreground-muted)]">
                                      <span className="w-16 text-center">Kills</span>
                                      <span className="w-16 text-center">Deaths</span>
                                    </div>
                                  </div>
                                  {selectedSeason && isHistoricalStatsSeason(selectedSeason.seasonNumber) && (
                                    <p className="mb-2 text-xs text-[var(--foreground-muted)]">
                                      Full Pokemon pool enabled for historical stat corrections.
                                    </p>
                                  )}
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {team2Pokemon.map((p, i) => {
                                      const selectedName = getPokemonName(team2PokemonOptions, p.pokemonId);
                                      return (
                                        <div key={i} className="flex items-center gap-2 p-2 rounded bg-[var(--background-secondary)]">
                                          <Select
                                            value={p.pokemonId}
                                            onChange={(e) => {
                                              const newPokemon = [...team2Pokemon];
                                              newPokemon[i] = { ...newPokemon[i], pokemonId: e.target.value };
                                              setTeam2Pokemon(newPokemon);
                                            }}
                                            className="flex-1"
                                          >
                                            <option value="">{selectedName || `Select Pokemon ${i + 1}`}</option>
                                            {team2PokemonOptions.map((pokemon) => (
                                              <option key={pokemon.id} value={pokemon.id}>
                                                {pokemon.displayName || pokemon.name}
                                              </option>
                                            ))}
                                          </Select>
                                          <div className="flex items-center gap-1">
                                            <span className="text-xs text-[var(--success)] font-medium">K:</span>
                                            <input
                                              type="number"
                                              value={p.kills}
                                              onChange={(e) => {
                                                const newPokemon = [...team2Pokemon];
                                                newPokemon[i] = { ...newPokemon[i], kills: e.target.value };
                                                setTeam2Pokemon(newPokemon);
                                              }}
                                              className="w-12 px-1 py-1 text-center rounded bg-[var(--background)] border border-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                                              min="0"
                                            />
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <span className="text-xs text-[var(--error)] font-medium">D:</span>
                                            <input
                                              type="number"
                                              value={p.deaths}
                                              onChange={(e) => {
                                                const newPokemon = [...team2Pokemon];
                                                newPokemon[i] = { ...newPokemon[i], deaths: e.target.value };
                                                setTeam2Pokemon(newPokemon);
                                              }}
                                              className="w-12 px-1 py-1 text-center rounded bg-[var(--background)] border border-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                                              min="0"
                                            />
                                          </div>
                                          <span
                                            className="max-w-28 truncate text-[9px] font-bold text-[var(--accent)]"
                                            title={p.revealedItems?.map((entry) => `${entry.item}, turn ${entry.turn}, ${entry.source}`).join(" → ") || "Unknown item"}
                                          >
                                            {p.revealedItems?.map((entry) => entry.item).join(" → ") || "Unknown"}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </>
                            );
                          })()}
                        </>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <div className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background-secondary)] px-3 py-2 text-xs text-[var(--foreground-muted)] sm:mr-auto sm:w-auto">
                          <span className="font-medium text-[var(--foreground)]">Save preview:</span>{" "}
                          {matchForm.winnerId
                            ? `${getSeasonCoachName(seasonCoaches, parseInt(matchForm.winnerId))} winner`
                            : "No winner selected"}
                          {" | "}
                          {team1Pokemon.filter((entry) => entry.pokemonId).length + team2Pokemon.filter((entry) => entry.pokemonId).length} Pokemon rows
                          {" | "}
                          {matchForm.replayUrl ? "replay attached" : "no replay"}
                        </div>
                        {historicalCorrectionPreview && (
                          <div className="w-full rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-100">
                            <span className="font-semibold">Historical correction (Season 5–10):</span>{" "}
                            Before {historicalCorrectionPreview.before.rows} rows / {historicalCorrectionPreview.before.kills} K / {historicalCorrectionPreview.before.deaths} D
                            {" → "}
                            After {historicalCorrectionPreview.after.rows} rows / {historicalCorrectionPreview.after.kills} K / {historicalCorrectionPreview.after.deaths} D
                          </div>
                        )}
                        {(selectedFixture || editingMatch)?.needsReview ? (
                          <>
                            <Button
                              type="button"
                              className="bg-green-600 text-white hover:bg-green-500"
                              onClick={() => handleSaveMatchResult({ needsReview: false, clearReviewNotes: true, openNextReview: true })}
                            >
                              Approve &amp; Save
                            </Button>
                            <Button
                              type="button"
                              className="bg-yellow-500 text-black hover:bg-yellow-400"
                              onClick={() => handleSaveMatchResult({ openNextReview: true })}
                            >
                              Save &amp; Open Next
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => handleSaveMatchResult({ needsReview: true, keepOpen: true })}
                            >
                              Keep Flagged
                            </Button>
                            <Button type="button" variant="outline" onClick={handleClearReviewFlag}>
                              Clear Flag
                            </Button>
                            {matchForm.replayUrl && (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={handleScrapeReplay}
                                disabled={scraping}
                              >
                                {scraping ? "Re-scraping..." : "Re-scrape Replay"}
                              </Button>
                            )}
                          </>
                        ) : (
                          <Button onClick={() => handleSaveMatchResult()}>Save Result</Button>
                        )}
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSelectedFixture(null);
                            setEditingMatch(null);
                            setSelectedPlayoffFixture(null);
                            resetForm();
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Matches List */}
              <Card>
                <CardHeader>
                  <CardTitle>All Matches ({displayedMatches.length}/{matches.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <Label>Search Matches</Label>
                    <Input
                      value={matchSearch}
                      onChange={(event) => setMatchSearch(event.target.value)}
                      placeholder="Search week, division, team, or coach"
                    />
                    <div className="mt-3 flex flex-wrap gap-2" aria-label="Match status filters">
                      {([
                        ["all", "All"],
                        ["pending", "Pending"],
                        ["completed", "Completed"],
                        ["forfeit", "Forfeit"],
                        ["review", "Needs Review"],
                      ] as Array<[MatchFilter, string]>).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={matchFilter === value}
                          onClick={() => setMatchFilter(value)}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                            matchFilter === value
                              ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                              : "border-[var(--card-border)] text-[var(--foreground-muted)] hover:border-[var(--primary)] hover:text-[var(--foreground)]"
                          }`}
                        >
                          {label} ({matchFilterCounts[value]})
                        </button>
                      ))}
                    </div>
                  </div>
                  {matches.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[var(--card-border)] bg-[var(--background-secondary)] p-6 text-center">
                      <p className="text-[var(--foreground-muted)]">
                        {selectedDivision ? "No matches scheduled for this division yet." : "Select a division to view and manage matches."}
                      </p>
                      {selectedDivision ? (
                        <Button className="mt-4" onClick={() => setActiveTab("schedule")}>
                          Upload Schedule
                        </Button>
                      ) : (
                        <Button
                          className="mt-4"
                          variant="outline"
                          onClick={() => seasonDivisionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                        >
                          Select a Division
                        </Button>
                      )}
                    </div>
                  ) : displayedMatches.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[var(--card-border)] p-6 text-center">
                      <p className="text-[var(--foreground-muted)]">No matches match these filters.</p>
                      <Button
                        className="mt-4"
                        variant="outline"
                        onClick={() => {
                          setMatchSearch("");
                          setMatchFilter("all");
                        }}
                      >
                        Clear Filters
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {displayedMatches.map((match) => {
                        const hasResult = isCompletedMatchResult(match.winnerId, match.isForfeit);
                        const isDoubleLoss = isDoubleForfeitResult(match.winnerId, match.isForfeit);
                        const matchStatus = getMatchStatus(match);

                        return (
                        <div
                          key={match.id}
                          className={`flex flex-col gap-3 rounded-lg p-3 sm:flex-row sm:items-center sm:justify-between ${
                            match.needsReview
                              ? "bg-yellow-400/15 border-2 border-yellow-400"
                              : hasResult
                              ? "bg-[var(--background-secondary)]"
                              : "bg-[var(--warning)]/10 border border-[var(--warning)]/30"
                          }`}
                        >
                          <div className="flex items-center gap-4 flex-wrap">
                            <span className="text-sm text-[var(--foreground-muted)] w-16">
                              Week {match.week}
                            </span>
                            <span className="text-sm text-[var(--foreground-muted)]">
                              {match.division?.name}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={match.winnerId === match.coach1SeasonId ? "font-semibold text-[var(--success)]" : ""}>
                                {match.coach1?.teamName}
                              </span>
                              {hasResult && (
                                <span className="text-[var(--foreground-muted)]">
                                  ({match.coach1Differential > 0 ? "+" : ""}{match.coach1Differential})
                                </span>
                              )}
                              <span className="text-[var(--foreground-muted)]">vs</span>
                              <span className={match.winnerId === match.coach2SeasonId ? "font-semibold text-[var(--success)]" : ""}>
                                {match.coach2?.teamName}
                              </span>
                              {hasResult && (
                                <span className="text-[var(--foreground-muted)]">
                                  ({match.coach2Differential > 0 ? "+" : ""}{match.coach2Differential})
                                </span>
                              )}
                            </div>
                            {match.isForfeit && (
                              <span className="px-2 py-0.5 text-xs rounded bg-[var(--warning)] text-black">
                                {isDoubleLoss ? "DOUBLE LOSS" : "FF"}
                              </span>
                            )}
                            <span
                              className={`rounded px-2 py-0.5 text-xs font-semibold ${getMatchStatusClasses(matchStatus)}`}
                              title={match.reviewNotes || undefined}
                            >
                              {getMatchStatusLabel(matchStatus)}
                            </span>
                            {match.needsReview && match.reviewNotes && (
                              <span className="max-w-xl text-xs text-yellow-200">
                                {match.reviewNotes}
                              </span>
                            )}
                            {match.replayUrl && (
                              <a
                                href={match.replayUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-[var(--primary)] underline hover:text-[var(--foreground)]"
                              >
                                Replay
                              </a>
                            )}
                            {match.playedAt && (
                              <span className="text-xs text-[var(--foreground-muted)]">
                                Recorded {formatMatchDate(match.playedAt)}
                              </span>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => openMatchForEditing(match, true)}
                            >
                              {match.needsReview ? "Review" : "Edit"}
                            </Button>
                            <Button type="button" size="sm" variant="destructive" onClick={() => handleDeleteMatch(match.id)}>
                              Delete
                            </Button>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* Playoffs Tab */}
          {activeTab === "playoffs" && (
            <Card>
              <CardHeader>
                <CardTitle>Playoff Bracket</CardTitle>
              </CardHeader>
              <CardContent>
                {!selectedDivision ? (
                  <p className="text-[var(--warning)]">Please select a division to manage playoffs.</p>
                ) : (
                  <PlayoffBracketBuilder
                    coachesInDivision={coachesInDivision}
                    existingMatches={playoffMatches.filter((pm) => pm.divisionId === selectedDivision.id)}
                    seasonId={selectedSeason!.id}
                    divisionId={selectedDivision.id}
                    divisionMatches={matches.filter((m) => m.divisionId === selectedDivision.id)}
                    onSaved={async () => {
                      await fetchPlayoffMatches();
                      await fetchMatches();
                    }}
                  />
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Playoff Bracket Builder
   ═══════════════════════════════════════════════ */

interface BracketSlot {
  round: number;
  bracketPosition: number;
  higherSeedId: string;
  lowerSeedId: string;
  existingId: number | null; // ID if already saved in DB
  winnerId: number | null;
}

function PlayoffBracketBuilder({
  coachesInDivision,
  existingMatches,
  seasonId,
  divisionId,
  divisionMatches,
  onSaved,
}: {
  coachesInDivision: SeasonCoach[];
  existingMatches: PlayoffMatch[];
  seasonId: number;
  divisionId: number;
  divisionMatches: Match[];
  onSaved: () => Promise<void>;
}) {
  // Compute standings using shared tiebreaker logic
  const standings = getPlayoffEligibleStandings(
    computeAndSortStandings(
      coachesInDivision,
      new Map(),
      divisionMatches
    )
  );
  const coachRank = new Map(standings.map((sc, i) => [sc.id, i + 1]));
  const coachesSorted = standings.map((s) => coachesInDivision.find((c) => c.id === s.id)!).filter(Boolean);
  const [saving, setSaving] = useState(false);
  const [slots, setSlots] = useState<BracketSlot[]>(() => {
    // Initialize all 7 bracket slots (4 QF + 2 SF + 1 Finals)
    const initial: BracketSlot[] = [];
    const structure = [
      { round: 1, positions: 4 },
      { round: 2, positions: 2 },
      { round: 3, positions: 1 },
    ];
    for (const { round, positions } of structure) {
      for (let pos = 1; pos <= positions; pos++) {
        const existing = existingMatches.find(
          (pm) => pm.round === round && pm.bracketPosition === pos
        );
        initial.push({
          round,
          bracketPosition: pos,
          higherSeedId: existing?.higherSeedId?.toString() || "",
          lowerSeedId: existing?.lowerSeedId?.toString() || "",
          existingId: existing?.id || null,
          winnerId: existing?.winnerId || null,
        });
      }
    }
    return initial;
  });

  function updateSlot(round: number, pos: number, field: "higherSeedId" | "lowerSeedId", value: string) {
    setSlots((prev) =>
      prev.map((s) =>
        s.round === round && s.bracketPosition === pos ? { ...s, [field]: value } : s
      )
    );
  }

  function getSlot(round: number, pos: number) {
    return slots.find((s) => s.round === round && s.bracketPosition === pos)!;
  }

  function getTeamName(id: string) {
    if (!id) return "TBD";
    const sc = coachesInDivision.find((c) => c.id === parseInt(id));
    return sc?.teamName || "TBD";
  }

  const roundLabel = (round: number) =>
    round === 1 ? "Quarterfinals" : round === 2 ? "Semifinals" : "Finals";

  // Check which slots have changes vs what's in DB
  const changedSlots = slots.filter((slot) => {
    const existing = existingMatches.find(
      (pm) => pm.round === slot.round && pm.bracketPosition === slot.bracketPosition
    );
    if (!existing) {
      return !!(slot.higherSeedId || slot.lowerSeedId);
    }
    return (
      (slot.higherSeedId || "") !== (existing.higherSeedId?.toString() || "") ||
      (slot.lowerSeedId || "") !== (existing.lowerSeedId?.toString() || "")
    );
  });
  const hasChanges = changedSlots.length > 0;

  async function handleSaveAll() {
    if (!hasChanges) return;
    if (
      !confirm(
        [
          `Save ${changedSlots.length} playoff bracket change${changedSlots.length === 1 ? "" : "s"}?`,
          "",
          ...changedSlots.map(
            (slot) =>
              `${roundLabel(slot.round)} ${slot.bracketPosition}: ${getTeamName(slot.higherSeedId)} vs ${getTeamName(slot.lowerSeedId)}`
          ),
          "",
          "Affected data: playoff bracket rows and future playoff result entry.",
        ].join("\n")
      )
    ) {
      return;
    }
    setSaving(true);

    try {
      for (const slot of slots) {
        const hasTeams = slot.higherSeedId || slot.lowerSeedId;
        const existing = existingMatches.find(
          (pm) => pm.round === slot.round && pm.bracketPosition === slot.bracketPosition
        );

        const isChanged = existing
          ? (slot.higherSeedId || "") !== (existing.higherSeedId?.toString() || "") ||
            (slot.lowerSeedId || "") !== (existing.lowerSeedId?.toString() || "")
          : hasTeams;

        if (!isChanged) continue;

        if (existing) {
          // Update existing
          await fetch("/api/playoffs", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: existing.id,
              higherSeedId: slot.higherSeedId ? parseInt(slot.higherSeedId) : null,
              lowerSeedId: slot.lowerSeedId ? parseInt(slot.lowerSeedId) : null,
            }),
          });
        } else if (hasTeams) {
          // Create new
      const response = await fetch("/api/playoffs", {
        method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              seasonId,
              divisionId,
              round: slot.round,
              bracketPosition: slot.bracketPosition,
              higherSeedId: slot.higherSeedId ? parseInt(slot.higherSeedId) : null,
              lowerSeedId: slot.lowerSeedId ? parseInt(slot.lowerSeedId) : null,
            }),
      });
      return response.ok;
    }
  }
      await onSaved();
    } catch (err) {
      alert(`Error saving bracket: ${err}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleClearAll() {
    if (
      !confirm(
        [
          `Delete ${existingMatches.length} playoff match${existingMatches.length === 1 ? "" : "es"} for this division?`,
          "",
          "Affected data: playoff bracket rows and any linked playoff progression data.",
          "This cannot be undone.",
        ].join("\n")
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      for (const pm of existingMatches) {
        await fetch(`/api/playoffs?id=${pm.id}`, { method: "DELETE" });
      }
      setSlots((prev) =>
        prev.map((s) => ({ ...s, higherSeedId: "", lowerSeedId: "", existingId: null, winnerId: null }))
      );
      await onSaved();
    } catch (err) {
      alert(`Error clearing bracket: ${err}`);
    } finally {
      setSaving(false);
    }
  }

  function TeamSelect({ round, pos, field, label }: { round: number; pos: number; field: "higherSeedId" | "lowerSeedId"; label: string }) {
    const slot = getSlot(round, pos);
    const otherField = field === "higherSeedId" ? "lowerSeedId" : "higherSeedId";
    const otherValue = slot[otherField];
    const isLocked = !!slot.winnerId;

    return (
      <Select
        value={slot[field]}
        onChange={(e) => updateSlot(round, pos, field, e.target.value)}
        disabled={isLocked}
        title={isLocked ? "Cannot edit — match has a result" : label}
      >
        <option value="">{label}</option>
        {coachesSorted
          .filter((sc) => !otherValue || sc.id !== parseInt(otherValue))
          .map((sc) => (
            <option key={sc.id} value={sc.id}>#{coachRank.get(sc.id)} {sc.teamName}</option>
          ))}
      </Select>
    );
  }

  function MatchCard({ round, pos }: { round: number; pos: number }) {
    const slot = getSlot(round, pos);
    const hasResult = !!slot.winnerId;

    return (
      <div className={`p-3 rounded-lg border ${hasResult ? "border-[var(--success)]/30 bg-[var(--success)]/5" : "border-[var(--background-tertiary)] bg-[var(--background-secondary)]"}`}>
        <div className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide mb-2">
          {roundLabel(round)} {round === 1 ? `#${pos}` : round === 2 ? `#${pos}` : ""}
          {hasResult && <span className="ml-2 text-[var(--success)]">Played</span>}
        </div>
        <div className="space-y-1.5">
          <TeamSelect round={round} pos={pos} field="higherSeedId" label="Higher Seed" />
          <div className="text-center text-[10px] text-[var(--foreground-subtle)] font-bold">VS</div>
          <TeamSelect round={round} pos={pos} field="lowerSeedId" label="Lower Seed" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Visual Bracket */}
      <div className="grid grid-cols-5 gap-3 items-center">
        {/* Left QF */}
        <div className="space-y-3">
          <MatchCard round={1} pos={1} />
          <MatchCard round={1} pos={2} />
        </div>

        {/* Left SF */}
        <div className="flex items-center justify-center">
          <div className="w-full">
            <MatchCard round={2} pos={1} />
          </div>
        </div>

        {/* Finals */}
        <div className="flex items-center justify-center">
          <div className="w-full">
            <MatchCard round={3} pos={1} />
          </div>
        </div>

        {/* Right SF */}
        <div className="flex items-center justify-center">
          <div className="w-full">
            <MatchCard round={2} pos={2} />
          </div>
        </div>

        {/* Right QF */}
        <div className="space-y-3">
          <MatchCard round={1} pos={3} />
          <MatchCard round={1} pos={4} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        {hasChanges && (
          <div className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background-secondary)] px-3 py-2 text-xs text-[var(--foreground-muted)] sm:mr-auto sm:w-auto">
            <span className="font-medium text-[var(--foreground)]">{changedSlots.length} bracket change{changedSlots.length === 1 ? "" : "s"}</span>
            {" "}ready to save
          </div>
        )}
        <Button onClick={handleSaveAll} disabled={!hasChanges || saving}>
          {saving ? "Saving..." : "Save Bracket"}
        </Button>
        {existingMatches.length > 0 && (
          <Button variant="destructive" onClick={handleClearAll} disabled={saving}>
            Clear All
          </Button>
        )}
        {hasChanges && (
          <span className="text-xs text-[var(--warning)]">Unsaved changes</span>
        )}
      </div>
    </div>
  );
}
