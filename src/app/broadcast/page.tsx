"use client";

import { useState, useEffect, useRef } from "react";
import { compareDivisions } from "@/lib/division-order";

interface Season {
  id: number;
  name: string;
  seasonNumber: number;
  isCurrent: boolean;
  divisions: { id: number; name: string; displayOrder: number }[];
}

interface MatchOption {
  id: number;
  week: number;
  coach1TeamName: string;
  coach2TeamName: string;
  isPlayed: boolean;
}

interface MultiCastGame {
  matchId: number;
  battleUrl: string;
  label: string;
}

function getWeekLabel(week: number): string {
  if (week === 101) return "QF";
  if (week === 102) return "SF";
  if (week === 103) return "Finals";
  return `Week ${week}`;
}

export default function BroadcastSetupPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [selectedDivisionId, setSelectedDivisionId] = useState<number | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [battleUrl, setBattleUrl] = useState("");
  const [selectedOverlay, setSelectedOverlay] = useState<"overlay" | "overlay2" | "multi-cast">("overlay");
  const [multiCastGames, setMultiCastGames] = useState<MultiCastGame[]>([]);
  const [loadingSeasons, setLoadingSeasons] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [prefilledMatchId, setPrefilledMatchId] = useState<number | null>(null);

  // Read ?matchId from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mid = params.get("matchId");
    if (mid) setPrefilledMatchId(parseInt(mid));
  }, []);

  // Fetch seasons on mount
  useEffect(() => {
    fetch("/api/seasons")
      .then((r) => r.json())
      .then((data: Season[]) => {
        setSeasons(data);
        // Don't auto-select season if we have a prefilled match — let the prefill logic handle it
        if (!prefilledMatchId) {
          const current = data.find((s) => s.isCurrent);
          if (current) setSelectedSeasonId(current.id);
          else if (data.length > 0) setSelectedSeasonId(data[0].id);
        }
        setLoadingSeasons(false);
      });
  }, [prefilledMatchId]);

  // Pre-fill dropdowns when we have a matchId from the URL
  useEffect(() => {
    if (!prefilledMatchId || seasons.length === 0) return;

    // Find the match across all divisions to determine season + division + week
    async function prefill() {
      for (const season of seasons) {
        for (const div of season.divisions || []) {
          const res = await fetch(`/api/broadcast/matches?divisionId=${div.id}`);
          const divMatches: MatchOption[] = await res.json();
          const found = divMatches.find((m) => m.id === prefilledMatchId);
          if (found) {
            setSelectedSeasonId(season.id);
            setSelectedDivisionId(div.id);
            setMatches(divMatches);
            setSelectedWeek(found.week);
            setSelectedMatchId(found.id);
            setPrefilledMatchId(null); // consumed
            return;
          }
        }
      }
      // Match not found — fall back to default behavior
      const current = seasons.find((s) => s.isCurrent);
      if (current) setSelectedSeasonId(current.id);
      else if (seasons.length > 0) setSelectedSeasonId(seasons[0].id);
      setPrefilledMatchId(null);
    }
    prefill();
  }, [prefilledMatchId, seasons]);

  // Fetch matches when division changes (skip if prefill already loaded them)
  useEffect(() => {
    if (!selectedDivisionId) {
      setMatches([]);
      return;
    }
    // If matches are already loaded for this division (from prefill), skip
    if (matches.length > 0 && matches.some((m) => m.id === selectedMatchId)) return;
    setLoadingMatches(true);
    setSelectedWeek(null);
    setSelectedMatchId(null);
    fetch(`/api/broadcast/matches?divisionId=${selectedDivisionId}`)
      .then((r) => r.json())
      .then((data: MatchOption[]) => {
        setMatches(data);
        setLoadingMatches(false);
      });
  }, [selectedDivisionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset week when division changes (after matches load)
  // (handled above in the fetch effect)

  // Reset match when week changes (only from user interaction, not prefill)
  const userChangedWeek = useRef(false);
  useEffect(() => {
    if (userChangedWeek.current) {
      setSelectedMatchId(null);
      userChangedWeek.current = false;
    }
  }, [selectedWeek]);

  // Reset division when season changes (only from user interaction, not prefill)
  const userChangedSeason = useRef(false);
  useEffect(() => {
    if (userChangedSeason.current) {
      setSelectedDivisionId(null);
      setSelectedWeek(null);
      setSelectedMatchId(null);
      setMatches([]);
      userChangedSeason.current = false;
    }
  }, [selectedSeasonId]);

  const selectedSeason = seasons.find((s) => s.id === selectedSeasonId);
  const divisions = [...(selectedSeason?.divisions ?? [])].sort(compareDivisions);

  // Derive distinct weeks from matches
  const weeks = [...new Set(matches.map((m) => m.week))].sort((a, b) => a - b);
  const filteredMatches = selectedWeek !== null ? matches.filter((m) => m.week === selectedWeek) : matches;

  const isValidBattleUrl =
    battleUrl.startsWith("https://play.pokemonshowdown.com/battle-") ||
    battleUrl.startsWith("http://play.pokemonshowdown.com/battle-");

  const selectedMatch = matches.find((match) => match.id === selectedMatchId);
  const isDuplicateMultiCastMatch = multiCastGames.some((game) => game.matchId === selectedMatchId);
  const canAddMultiCastGame = Boolean(
    selectedMatchId &&
    selectedMatch &&
    isValidBattleUrl &&
    multiCastGames.length < 4 &&
    !isDuplicateMultiCastMatch
  );
  const canLaunch = selectedOverlay === "multi-cast"
    ? multiCastGames.length > 0
    : Boolean(selectedMatchId && isValidBattleUrl);

  function addMultiCastGame() {
    if (!canAddMultiCastGame || !selectedMatchId || !selectedMatch) return;

    setMultiCastGames((games) => [
      ...games,
      {
        matchId: selectedMatchId,
        battleUrl,
        label: `${getWeekLabel(selectedMatch.week)}: ${selectedMatch.coach1TeamName} vs ${selectedMatch.coach2TeamName}`,
      },
    ]);
    setSelectedMatchId(null);
    setBattleUrl("");
  }

  function handleLaunch() {
    if (!canLaunch) return;

    if (selectedOverlay === "multi-cast") {
      const games = encodeURIComponent(JSON.stringify(multiCastGames));
      window.open(`/broadcast/multi-cast?games=${games}`, "_blank");
      return;
    }

    const url = `/broadcast/${selectedOverlay}?matchId=${selectedMatchId}&battleUrl=${encodeURIComponent(battleUrl)}`;
    window.open(url, "_blank");
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="poke-card p-6">
        <h1 className="font-pixel text-xl text-white mb-2">Broadcast</h1>
        <p className="text-sm text-[var(--foreground-muted)]">
          Launch a fullscreen broadcast view that auto-populates team info and tracks the battle in real-time.
        </p>
      </div>

      {/* Match Selection */}
      <div className="poke-card p-6 space-y-4">
        <h2 className="font-bold text-white text-sm uppercase tracking-wider">Select Match</h2>

        {/* Season */}
        <div>
          <label className="block text-xs text-[var(--foreground-muted)] mb-1">Season</label>
          <select
            className="w-full bg-[var(--background-tertiary)] text-white rounded-lg px-3 py-2 text-sm border border-[var(--background-tertiary)] focus:border-[var(--primary)] focus:outline-none"
            value={selectedSeasonId ?? ""}
            onChange={(e) => { userChangedSeason.current = true; setSelectedSeasonId(Number(e.target.value)); }}
            disabled={loadingSeasons}
          >
            {loadingSeasons && <option>Loading...</option>}
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.isCurrent ? " (Current)" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Division */}
        <div>
          <label className="block text-xs text-[var(--foreground-muted)] mb-1">Division</label>
          <select
            className="w-full bg-[var(--background-tertiary)] text-white rounded-lg px-3 py-2 text-sm border border-[var(--background-tertiary)] focus:border-[var(--primary)] focus:outline-none"
            value={selectedDivisionId ?? ""}
            onChange={(e) => setSelectedDivisionId(Number(e.target.value))}
            disabled={!selectedSeasonId}
          >
            <option value="">Select division...</option>
            {selectedSeasonId && (
              <optgroup label={selectedSeason?.name ?? "Selected Season"}>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        {/* Week */}
        <div>
          <label className="block text-xs text-[var(--foreground-muted)] mb-1">Week</label>
          <select
            className="w-full bg-[var(--background-tertiary)] text-white rounded-lg px-3 py-2 text-sm border border-[var(--background-tertiary)] focus:border-[var(--primary)] focus:outline-none"
            value={selectedWeek ?? ""}
            onChange={(e) => { userChangedWeek.current = true; setSelectedWeek(e.target.value ? Number(e.target.value) : null); }}
            disabled={!selectedDivisionId || loadingMatches || weeks.length === 0}
          >
            <option value="">All weeks</option>
            {weeks.map((w) => (
              <option key={w} value={w}>
                {getWeekLabel(w)}
              </option>
            ))}
          </select>
        </div>

        {/* Match */}
        <div>
          <label className="block text-xs text-[var(--foreground-muted)] mb-1">Match</label>
          <select
            className="w-full bg-[var(--background-tertiary)] text-white rounded-lg px-3 py-2 text-sm border border-[var(--background-tertiary)] focus:border-[var(--primary)] focus:outline-none"
            value={selectedMatchId ?? ""}
            onChange={(e) => setSelectedMatchId(Number(e.target.value))}
            disabled={!selectedDivisionId || loadingMatches}
          >
            <option value="">{loadingMatches ? "Loading..." : "Select match..."}</option>
            {filteredMatches.map((m) => (
              <option key={m.id} value={m.id}>
                {getWeekLabel(m.week)}: {m.coach1TeamName} vs {m.coach2TeamName}
                {m.isPlayed ? " (Played)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Battle URL */}
      <div className="poke-card p-6 space-y-4">
        <h2 className="font-bold text-white text-sm uppercase tracking-wider">Battle URL</h2>
        <div>
          <label className="block text-xs text-[var(--foreground-muted)] mb-1">
            Pokemon Showdown Battle URL
          </label>
          <input
            type="text"
            className="w-full bg-[var(--background-tertiary)] text-white rounded-lg px-3 py-2 text-sm border border-[var(--background-tertiary)] focus:border-[var(--primary)] focus:outline-none placeholder-[var(--foreground-subtle)]"
            placeholder="https://play.pokemonshowdown.com/battle-gen9draft-..."
            value={battleUrl}
            onChange={(e) => setBattleUrl(e.target.value.trim())}
          />
          {battleUrl && !isValidBattleUrl && (
            <p className="text-[var(--error)] text-xs mt-1">
              URL must start with https://play.pokemonshowdown.com/battle-
            </p>
          )}
        </div>
      </div>

      {/* Overlay Version */}
      <div className="poke-card p-6 space-y-4">
        <h2 className="font-bold text-white text-sm uppercase tracking-wider">Overlay Version</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedOverlay("overlay")}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-colors ${
              selectedOverlay === "overlay"
                ? "bg-[var(--primary)] text-white"
                : "bg-[var(--background-tertiary)] text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            v2
          </button>
          <button
            onClick={() => setSelectedOverlay("overlay2")}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-colors ${
              selectedOverlay === "overlay2"
                ? "bg-[var(--primary)] text-white"
                : "bg-[var(--background-tertiary)] text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            v1
          </button>
          <button
            onClick={() => setSelectedOverlay("multi-cast")}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-colors ${
              selectedOverlay === "multi-cast"
                ? "bg-[var(--primary)] text-white"
                : "bg-[var(--background-tertiary)] text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            Multi-Cast
          </button>
        </div>
      </div>

      {selectedOverlay === "multi-cast" && (
        <div className="poke-card p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-white text-sm uppercase tracking-wider">Multi-Cast Games</h2>
              <p className="mt-1 text-xs text-[var(--foreground-subtle)]">
                Add 1–4 matches. The first game is featured when three games are live.
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-1 font-mono text-xs font-bold text-white">
              {multiCastGames.length}/4
            </span>
          </div>

          <button
            type="button"
            onClick={addMultiCastGame}
            disabled={!canAddMultiCastGame}
            className={`w-full rounded-lg px-4 py-2.5 text-sm font-bold transition-colors ${
              canAddMultiCastGame
                ? "bg-[#9146ff] text-white hover:bg-[#7c3aed]"
                : "cursor-not-allowed bg-[var(--background-tertiary)] text-[var(--foreground-subtle)]"
            }`}
          >
            {multiCastGames.length >= 4
              ? "Four games added"
              : isDuplicateMultiCastMatch
                ? "Match already added"
                : "Add selected game"}
          </button>

          {multiCastGames.length > 0 && (
            <div className="space-y-2">
              {multiCastGames.map((game, index) => (
                <div
                  key={game.matchId}
                  className="flex items-center gap-3 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] p-3"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#9146ff]/20 font-mono text-xs font-bold text-[#b794ff]">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{game.label}</p>
                    <p className="truncate text-[10px] text-[var(--foreground-subtle)]">{game.battleUrl}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMultiCastGames((games) => games.filter((item) => item.matchId !== game.matchId))}
                    className="shrink-0 rounded-md px-2 py-1 text-xs font-bold text-[var(--error)] transition-colors hover:bg-[var(--error)]/10"
                    aria-label={`Remove ${game.label}`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Launch Button */}
      <div className="poke-card p-6 space-y-4">
        <button
          onClick={handleLaunch}
          disabled={!canLaunch}
          className={`w-full py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-colors ${
            canLaunch
              ? "bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]"
              : "bg-[var(--background-tertiary)] text-[var(--foreground-subtle)] cursor-not-allowed"
          }`}
        >
          {selectedOverlay === "multi-cast" ? "Launch Multi-Cast" : "Launch Broadcast"}
        </button>
        {!canLaunch && (
          <p className="text-xs text-[var(--foreground-subtle)] text-center">
            {selectedOverlay === "multi-cast"
              ? "Add at least one match and battle URL to launch Multi-Cast."
              : "Select a match and enter a valid battle URL to launch."}
          </p>
        )}
      </div>

      {/* Instructions */}
      <div className="poke-card p-6 space-y-4">
        <h2 className="font-bold text-white text-sm uppercase tracking-wider">Controls</h2>

        <ul className="text-sm text-[var(--foreground-muted)] space-y-2">
          <li><strong className="text-white">F</strong> &mdash; Toggle fullscreen</li>
          <li><strong className="text-white">H</strong> &mdash; Hide/show UI controls</li>
        </ul>

        <p className="text-xs text-[var(--foreground-subtle)] mt-2">
          The broadcast opens in a new tab and scales to fit any screen. Press F for fullscreen, then use OBS window capture if streaming.
        </p>
      </div>
    </div>
  );
}
