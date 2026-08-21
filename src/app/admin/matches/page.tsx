"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { computeAndSortStandings } from "@/lib/standings-sort";
import { getSeasonFormat } from "@/lib/season-format";
import { findBuiltInPokemonNameMatch } from "@/lib/replay-roster-matching-core";
import { usesExpandedHaxRules } from "@/lib/hax-rules";

type FavorableEvent = {
  type: "crit" | "miss" | "flinch" | "paralysis" | "freeze" | "burn" | "sleep" | "confusion" | "confusion-self-hit";
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
  replayUrl: string | null;
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

  // Schedule CSV upload
  const [scheduleCsvFile, setScheduleCsvFile] = useState("");
  const [scheduleCsvError, setScheduleCsvError] = useState("");
  const [schedulePreview, setSchedulePreview] = useState<Array<{ week: number; team1: string; team2: string }>>([]);
  const scheduleFileRef = useRef<HTMLInputElement>(null);

  // Match result entry
  const [selectedWeek, setSelectedWeek] = useState<string>("");
  const [selectedFixture, setSelectedFixture] = useState<Match | null>(null);
  const [selectedPlayoffFixture, setSelectedPlayoffFixture] = useState<PlayoffMatch | null>(null);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [matchForm, setMatchForm] = useState({
    winnerId: "",
    coach1Differential: "0",
    coach2Differential: "0",
    isForfeit: false,
    replayUrl: "",
  });
  const [team1Pokemon, setTeam1Pokemon] = useState<PokemonEntry[]>(
    Array(6).fill(null).map(() => ({ pokemonId: "", kills: "0", deaths: "0" }))
  );
  const [team2Pokemon, setTeam2Pokemon] = useState<PokemonEntry[]>(
    Array(6).fill(null).map(() => ({ pokemonId: "", kills: "0", deaths: "0" }))
  );
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState("");

  // Scraped data state
  const [zoroarkInvolved, setZoroarkInvolved] = useState(false);
  const [matchTimingData, setMatchTimingData] = useState<{ startedAt: string | null; endedAt: string | null }>({
    startedAt: null,
    endedAt: null,
  });
  const [matchEventData, setMatchEventData] = useState<{ turnSnapshots: unknown[] | null; keyEvents: unknown[] | null }>({
    turnSnapshots: null,
    keyEvents: null,
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

  useEffect(() => {
    fetchSeasons();
  }, []);

  useEffect(() => {
    if (selectedSeason) {
      fetchSeasonCoaches();
      fetchMatches();
      fetchPlayoffMatches();
    }
  }, [selectedSeason, selectedDivision]);

  useEffect(() => {
    if (!selectedSeason || selectedSeason.seasonNumber < 5 || selectedSeason.seasonNumber > 9) {
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
  }, [playoffMatches, selectedDivision, playoffForm.round]);

  async function fetchSeasons() {
    const res = await fetch("/api/seasons");
    const data = await res.json();
    setSeasons(data);
    const current = data.find((s: Season) => s.isCurrent);
    if (current) {
      setSelectedSeason(current);
    }
    setLoading(false);
  }

  async function fetchSeasonCoaches() {
    if (!selectedSeason) return;
    const res = await fetch(`/api/rosters?seasonId=${selectedSeason.id}`);
    const data = await res.json();
    setSeasonCoaches(Array.isArray(data) ? data : []);
  }

  async function fetchMatches() {
    if (!selectedSeason) return;
    let url = `/api/matches?seasonId=${selectedSeason.id}`;
    if (selectedDivision) {
      url += `&divisionId=${selectedDivision.id}`;
    }
    const res = await fetch(url);
    setMatches(await res.json());
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
    const completedMatches = matches.filter((match) => match.winnerId).length;
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

    await Promise.all(validSchedule.map((match) =>
      fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonId: selectedSeason.id,
          divisionId: selectedDivision.id,
          week: match.week,
          coach1SeasonId: match.coach1SeasonId,
          coach2SeasonId: match.coach2SeasonId,
        }),
      })
    ));

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

  const weekOptions = [
    ...regularWeeks.map((w) => ({ value: `week-${w}`, label: `Week ${w}` })),
    ...playoffRounds.map((r) => ({ value: `playoff-${r}`, label: getRoundName(r) })),
  ];

  const isPlayoffRound = selectedWeek.startsWith("playoff-");
  const selectedValue = parseInt(selectedWeek.split("-")[1]) || 0;

  const fixturesForWeek = isPlayoffRound
    ? []
    : matches.filter(
        (m) => m.week === selectedValue && (!selectedDivision || m.divisionId === selectedDivision.id)
      );

  const playoffFixturesForRound = isPlayoffRound
    ? playoffMatches.filter(
        (pm) => pm.round === selectedValue && (!selectedDivision || pm.divisionId === selectedDivision.id)
      )
    : [];

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

  function getSelectablePokemon(rosters: RosterEntry[] | undefined): Pokemon[] {
    const rosterPokemon = (rosters || []).map((entry) => entry.pokemon);
    const isHistoricalBackfillSeason = selectedSeason
      && selectedSeason.seasonNumber >= 5
      && selectedSeason.seasonNumber <= 9;

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

  async function handleSaveMatchResult() {
    const match = selectedFixture || editingMatch;
    const playoffMatch = selectedPlayoffFixture;

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
      if (
        !confirm(
          [
            `${existingMatch ? "Update" : "Create"} playoff result?`,
            "",
            `Match: ${getSeasonCoachName(seasonCoaches, playoffMatch.higherSeedId)} vs ${getSeasonCoachName(seasonCoaches, playoffMatch.lowerSeedId)}`,
            `Round: ${getRoundName(playoffMatch.round)}`,
            `Winner: ${winnerName}`,
            `Score differential: ${parseInt(matchForm.coach1Differential) || 0} / ${parseInt(matchForm.coach2Differential) || 0}`,
            `Pokemon stat rows: ${pokemonData.length}`,
            "Affected data: match result, standings, ELO dependencies, playoff advancement, bets, and pick-ems.",
          ].join("\n")
        )
      ) {
        return;
      }

      if (existingMatch) {
        await fetch("/api/matches", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: existingMatch.id,
            winnerId: matchForm.winnerId ? parseInt(matchForm.winnerId) : null,
            coach1Differential: parseInt(matchForm.coach1Differential) || 0,
            coach2Differential: parseInt(matchForm.coach2Differential) || 0,
            isForfeit: matchForm.isForfeit,
            replayUrl: matchForm.replayUrl || null,
            pokemonData,
            startedAt: matchTimingData.startedAt,
            endedAt: matchTimingData.endedAt,
            turnSnapshots: matchEventData.turnSnapshots,
            keyEvents: matchEventData.keyEvents,
            zoroarkInvolved,
          }),
        });
      } else {
        await fetch("/api/matches", {
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
            pokemonData,
            startedAt: matchTimingData.startedAt,
            endedAt: matchTimingData.endedAt,
            turnSnapshots: matchEventData.turnSnapshots,
            keyEvents: matchEventData.keyEvents,
            zoroarkInvolved,
          }),
        });
      }

      if (matchForm.winnerId) {
        const winnerId = parseInt(matchForm.winnerId);
        const higherSeedWins = winnerId === playoffMatch.higherSeedId
          ? Math.abs(parseInt(matchForm.coach1Differential))
          : 0;
        const lowerSeedWins = winnerId === playoffMatch.lowerSeedId
          ? Math.abs(parseInt(matchForm.coach2Differential))
          : 0;

        await fetch("/api/playoffs", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: playoffMatch.id,
            winnerId,
            higherSeedWins,
            lowerSeedWins,
          }),
        });

        await propagatePlayoffWinner(playoffMatch, winnerId);
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
    if (
      !confirm(
        [
          "Save match result?",
          "",
          `Match: ${match.coach1?.teamName || "TBD"} vs ${match.coach2?.teamName || "TBD"}`,
          `Week: ${match.week}`,
          `Winner: ${winnerName}`,
          `Score differential: ${parseInt(matchForm.coach1Differential) || 0} / ${parseInt(matchForm.coach2Differential) || 0}`,
          `Pokemon stat rows: ${pokemonData.length}`,
          `Replay attached: ${matchForm.replayUrl ? "yes" : "no"}`,
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
        pokemonData,
        startedAt: matchTimingData.startedAt,
        endedAt: matchTimingData.endedAt,
        turnSnapshots: matchEventData.turnSnapshots,
        keyEvents: matchEventData.keyEvents,
        zoroarkInvolved,
      }),
    });

    const result = await res.json();
    if (result.needsFullRecalc) setNeedsFullRecalc(true);

    if (match.week >= 101) {
      const playoffRound = match.week - 100;

      const playoffRes = await fetch(`/api/playoffs?seasonId=${match.seasonId}&divisionId=${match.divisionId}`);
      const freshPlayoffs: PlayoffMatch[] = await playoffRes.json();

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

        await fetch("/api/playoffs", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: playoffEntry.id,
            winnerId,
            higherSeedWins,
            lowerSeedWins,
          }),
        });

        await propagatePlayoffWinner(playoffEntry, winnerId);
      }

      fetchPlayoffMatches();
    }

    setSelectedFixture(null);
    setEditingMatch(null);
    resetForm();
    fetchMatches();
  }

  function resetForm() {
    setMatchForm({
      winnerId: "",
      coach1Differential: "0",
      coach2Differential: "0",
      isForfeit: false,
      replayUrl: "",
    });
    setTeam1Pokemon(Array(6).fill(null).map(() => ({ pokemonId: "", kills: "0", deaths: "0" })));
    setTeam2Pokemon(Array(6).fill(null).map(() => ({ pokemonId: "", kills: "0", deaths: "0" })));
    setScrapeError("");
    setMatchTimingData({ startedAt: null, endedAt: null });
    setMatchEventData({ turnSnapshots: null, keyEvents: null });
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
      });

      if (data.zoroarkInvolved) setZoroarkInvolved(true);

    } catch (error) {
      console.error("Scrape error:", error);
      setScrapeError(error instanceof Error ? error.message : "Failed to scrape replay");
    } finally {
      setScraping(false);
    }
  }

  async function propagatePlayoffWinner(playoffMatch: PlayoffMatch, winnerId: number) {
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
      return;
    }

    const res = await fetch(`/api/playoffs?seasonId=${seasonId}&divisionId=${divisionId}`);
    const freshPlayoffs: PlayoffMatch[] = await res.json();

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
      await fetch("/api/playoffs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });
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
      await fetch("/api/playoffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createData),
      });
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

  async function handleAddPlayoffMatch(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSeason || !selectedDivision) return;

    await fetch("/api/playoffs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seasonId: selectedSeason.id,
        divisionId: selectedDivision.id,
        round: parseInt(playoffForm.round),
        bracketPosition: parseInt(playoffForm.bracketPosition),
        higherSeedId: playoffForm.higherSeedId ? parseInt(playoffForm.higherSeedId) : null,
        lowerSeedId: playoffForm.lowerSeedId ? parseInt(playoffForm.lowerSeedId) : null,
      }),
    });

    setPlayoffForm({ round: "1", bracketPosition: "1", higherSeedId: "", lowerSeedId: "" });
    fetchPlayoffMatches();
    fetchMatches();
  }

  async function handleDeletePlayoffMatch(id: number) {
    if (!confirm("Delete this playoff match?")) return;
    const res = await fetch(`/api/playoffs?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const text = await res.text();
      alert(`Failed to delete: ${text || 'Unknown error'}`);
      return;
    }
    const result = await res.json();
    if (result.needsFullRecalc) setNeedsFullRecalc(true);
    setPlayoffMatches((prev) => prev.filter((pm) => pm.id !== id));
    await Promise.all([fetchPlayoffMatches(), fetchMatches()]);
  }

  const coachesInDivision = selectedDivision
    ? seasonCoaches.filter((sc) => sc.divisionId === selectedDivision.id)
    : seasonCoaches;
  const scheduleValidation = selectedSeason && selectedDivision && schedulePreview.length > 0
    ? validateScheduleUpload(schedulePreview, coachesInDivision, selectedSeason)
    : null;
  const displayedMatches = useMemo(() => {
    const query = matchSearch.trim().toLowerCase();
    if (!query) return matches;
    return matches.filter((match) =>
      match.week.toString().includes(query) ||
      match.division?.name.toLowerCase().includes(query) ||
      match.coach1?.teamName.toLowerCase().includes(query) ||
      match.coach2?.teamName.toLowerCase().includes(query) ||
      match.coach1?.coach?.name.toLowerCase().includes(query) ||
      match.coach2?.coach?.name.toLowerCase().includes(query)
    );
  }, [matches, matchSearch]);

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
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <Label>Season</Label>
              <Select
                value={selectedSeason?.id || ""}
                onChange={(e) => {
                  const season = seasons.find((s) => s.id === parseInt(e.target.value));
                  setSelectedSeason(season || null);
                  setSelectedDivision(null);
                }}
                className="w-48"
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
                  }}
                  className="w-48"
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
                    await fetch("/api/seasons", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: selectedSeason.id, isSchedulePublic: newValue }),
                    });
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
              <Card>
                <CardHeader>
                  <CardTitle>
                    {editingMatch ? `Edit Match: Week ${editingMatch.week}` : "Enter Match Result"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!editingMatch && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Select Week / Playoff Round</Label>
                        <Select
                          value={selectedWeek}
                          onChange={(e) => {
                            setSelectedWeek(e.target.value);
                            setSelectedFixture(null);
                          }}
                        >
                          <option value="">Choose week or round</option>
                          {weekOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <Label>Select Fixture</Label>
                        {isPlayoffRound ? (
                          <Select
                            value={selectedPlayoffFixture?.id || ""}
                            onChange={(e) => {
                              const pm = playoffFixturesForRound.find((p) => p.id === parseInt(e.target.value));
                              if (pm) {
                                if (!pm.higherSeedId || !pm.lowerSeedId) {
                                  return alert("Both teams must be set in the playoff bracket before entering results.");
                                }
                                setSelectedPlayoffFixture(pm);
                                setSelectedFixture(null);
                                setEditingMatch(null);
                                const existingMatch = findMatchForPlayoff(pm);
                                if (existingMatch) {
                                  loadMatchForm(existingMatch);
                                } else {
                                  resetForm();
                                }
                                fetchTimeSyncedRosters(pm.higherSeedId, pm.lowerSeedId, 100 + pm.round);
                              }
                            }}
                            disabled={!selectedWeek}
                          >
                            <option value="">Choose playoff fixture</option>
                            {playoffFixturesForRound.map((pm) => {
                              const existingMatch = findMatchForPlayoff(pm);
                              return (
                                <option key={pm.id} value={pm.id}>
                                  {pm.higherSeed?.teamName || "TBD"} vs {pm.lowerSeed?.teamName || "TBD"}
                                  {existingMatch?.winnerId ? " (completed)" : ""}
                                </option>
                              );
                            })}
                          </Select>
                        ) : (
                          <Select
                            value={selectedFixture?.id || ""}
                            onChange={(e) => {
                              const match = fixturesForWeek.find((m) => m.id === parseInt(e.target.value));
                              if (match) {
                                setSelectedFixture(match);
                                setEditingMatch(null);
                                setSelectedPlayoffFixture(null);
                                loadMatchForm(match);
                                fetchTimeSyncedRosters(match.coach1SeasonId, match.coach2SeasonId, match.week);
                              }
                            }}
                            disabled={!selectedWeek}
                          >
                            <option value="">Choose fixture</option>
                            {fixturesForWeek.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.coach1?.teamName} vs {m.coach2?.teamName}
                                {m.winnerId ? " (completed)" : ""}
                              </option>
                            ))}
                          </Select>
                        )}
                      </div>
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
                            {scraping ? "Scraping..." : "Scrape Data"}
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
                            <div className="flex items-end">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={matchForm.isForfeit}
                                  onChange={(e) => setMatchForm({ ...matchForm, isForfeit: e.target.checked })}
                                  className="w-4 h-4 accent-[var(--primary)]"
                                />
                                <span>Forfeit</span>
                              </label>
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
                                  {selectedSeason && selectedSeason.seasonNumber >= 5 && selectedSeason.seasonNumber <= 9 && (
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
                                  {selectedSeason && selectedSeason.seasonNumber >= 5 && selectedSeason.seasonNumber <= 9 && (
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
                        <Button onClick={handleSaveMatchResult}>Save Result</Button>
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
                  </div>
                  {matches.length === 0 ? (
                    <p className="text-[var(--foreground-muted)] text-center py-4">
                      No matches scheduled. Upload a schedule first.
                    </p>
                  ) : displayedMatches.length === 0 ? (
                    <p className="text-[var(--foreground-muted)] text-center py-4">
                      No matches match that search.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {displayedMatches.map((match) => (
                        <div
                          key={match.id}
                          className={`flex items-center justify-between p-3 rounded-lg ${
                            match.winnerId
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
                              {match.winnerId && (
                                <span className="text-[var(--foreground-muted)]">
                                  ({match.coach1Differential > 0 ? "+" : ""}{match.coach1Differential})
                                </span>
                              )}
                              <span className="text-[var(--foreground-muted)]">vs</span>
                              <span className={match.winnerId === match.coach2SeasonId ? "font-semibold text-[var(--success)]" : ""}>
                                {match.coach2?.teamName}
                              </span>
                              {match.winnerId && (
                                <span className="text-[var(--foreground-muted)]">
                                  ({match.coach2Differential > 0 ? "+" : ""}{match.coach2Differential})
                                </span>
                              )}
                            </div>
                            {match.isForfeit && (
                              <span className="px-2 py-0.5 text-xs rounded bg-[var(--warning)] text-black">FF</span>
                            )}
                            {!match.winnerId && (
                              <span className="px-2 py-0.5 text-xs rounded bg-[var(--warning)]/20 text-[var(--warning)]">
                                Pending
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingMatch(match);
                                setSelectedFixture(null);
                                setSelectedPlayoffFixture(null);
                                setSelectedWeek(`week-${match.week}`);
                                loadMatchForm(match);
                                fetchTimeSyncedRosters(match.coach1SeasonId, match.coach2SeasonId, match.week);
                              }}
                            >
                              Edit
                            </Button>
                            <Button type="button" size="sm" variant="destructive" onClick={() => handleDeleteMatch(match.id)}>
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))}
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
  const standings = computeAndSortStandings(
    coachesInDivision,
    new Map(),
    divisionMatches
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
          await fetch("/api/playoffs", {
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
