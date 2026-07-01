"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface BettingSettings {
  bettingClosed: boolean;
  bettingUiHidden: boolean;
  fantasyUiHidden: boolean;
  blogUiHidden: boolean;
}

interface Division {
  id: number;
  name: string;
  displayOrder: number;
}

interface Season {
  id: number;
  name: string;
}

interface Match {
  id: number;
  week: number;
  isGameOfTheWeek: boolean;
  coach1: { teamName: string; teamAbbreviation: string | null };
  coach2: { teamName: string; teamAbbreviation: string | null };
}

interface Coach {
  id: number;
  name: string;
  pboCoin: number;
}

interface TriviaReward {
  id: number;
  amount: number;
  reason: string;
  awardedBy: string | null;
  createdAt: string;
  coach: { id: number; name: string };
}

export default function AdminBettingPage() {
  const [settings, setSettings] = useState<BettingSettings>({
    bettingClosed: false,
    bettingUiHidden: false,
    fantasyUiHidden: false,
    blogUiHidden: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // GOTW state
  const [season, setSeason] = useState<Season | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [weeks, setWeeks] = useState<number[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [matchesByDivision, setMatchesByDivision] = useState<Record<number, Match[]>>({});
  const [loadingGotw, setLoadingGotw] = useState(false);
  const [savingGotw, setSavingGotw] = useState<number | null>(null);

  // Trivia rewards state
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState<number | "">("");
  const [triviaAmount, setTriviaAmount] = useState<number>(10);
  const [triviaReason, setTriviaReason] = useState<string>("");
  const [awardingTrivia, setAwardingTrivia] = useState(false);
  const [triviaSuccess, setTriviaSuccess] = useState<string | null>(null);
  const [recentRewards, setRecentRewards] = useState<TriviaReward[]>([]);

  // Twitch badge state
  const [twitchBadgeCoaches, setTwitchBadgeCoaches] = useState<Set<number>>(new Set());
  const [twitchBadgeCoachId, setTwitchBadgeCoachId] = useState<number | "">("");
  const [togglingTwitchBadge, setTogglingTwitchBadge] = useState(false);

  useEffect(() => {
    fetchSettings();
    fetchGotwData();
    fetchCoaches();
    fetchRecentRewards();
    fetchTwitchBadges();
  }, []);

  useEffect(() => {
    if (selectedWeek !== null && divisions.length > 0) {
      fetchMatchesForWeek();
    }
  }, [selectedWeek, divisions]);

  async function fetchSettings() {
    try {
      const res = await fetch("/api/admin/pick-ems");
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (error) {
      console.error("Error fetching betting settings:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchGotwData() {
    try {
      const res = await fetch("/api/admin/gotw");
      if (res.ok) {
        const data = await res.json();
        setSeason(data.season);
        setDivisions(data.divisions || []);
        setWeeks(data.weeks || []);
        // Default to the last week
        if (data.weeks && data.weeks.length > 0) {
          setSelectedWeek(data.weeks[data.weeks.length - 1]);
        }
      }
    } catch (error) {
      console.error("Error fetching GOTW data:", error);
    }
  }

  async function fetchMatchesForWeek() {
    if (selectedWeek === null) return;
    setLoadingGotw(true);

    const newMatchesByDivision: Record<number, Match[]> = {};

    try {
      for (const division of divisions) {
        const res = await fetch(
          `/api/admin/gotw?seasonId=${season?.id}&divisionId=${division.id}&week=${selectedWeek}`
        );
        if (res.ok) {
          const data = await res.json();
          newMatchesByDivision[division.id] = data.matches || [];
        }
      }
      setMatchesByDivision(newMatchesByDivision);
    } catch (error) {
      console.error("Error fetching matches:", error);
    } finally {
      setLoadingGotw(false);
    }
  }

  async function updateSetting(key: keyof BettingSettings, value: boolean) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/pick-ems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });

      if (res.ok) {
        setSettings((prev) => ({ ...prev, [key]: value }));
      }
    } catch (error) {
      console.error("Error updating betting setting:", error);
    } finally {
      setSaving(false);
    }
  }

  async function setGotwForDivision(divisionId: number, matchId: number | null) {
    setSavingGotw(divisionId);

    const divisionMatches = matchesByDivision[divisionId] || [];
    const currentGotw = divisionMatches.find(m => m.isGameOfTheWeek);

    try {
      // First, unset the current GOTW if there is one
      if (currentGotw && currentGotw.id !== matchId) {
        await fetch("/api/admin/gotw", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId: currentGotw.id, isGameOfTheWeek: false }),
        });
      }

      // Then set the new GOTW if one is selected
      if (matchId !== null) {
        await fetch("/api/admin/gotw", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId, isGameOfTheWeek: true }),
        });
      }

      // Update local state
      setMatchesByDivision((prev) => ({
        ...prev,
        [divisionId]: (prev[divisionId] || []).map((m) => ({
          ...m,
          isGameOfTheWeek: m.id === matchId,
        })),
      }));
    } catch (error) {
      console.error("Error setting GOTW:", error);
    } finally {
      setSavingGotw(null);
    }
  }

  function getGotwMatchId(divisionId: number): number | null {
    const matches = matchesByDivision[divisionId] || [];
    const gotw = matches.find(m => m.isGameOfTheWeek);
    return gotw?.id ?? null;
  }

  async function fetchCoaches() {
    try {
      const res = await fetch("/api/coaches");
      if (res.ok) {
        const data = await res.json();
        // Sort by name
        const sorted = [...data].sort((a: Coach, b: Coach) =>
          a.name.localeCompare(b.name)
        );
        setCoaches(sorted);
      }
    } catch (error) {
      console.error("Error fetching coaches:", error);
    }
  }

  async function fetchRecentRewards() {
    try {
      const res = await fetch("/api/admin/trivia-rewards");
      if (res.ok) {
        const data = await res.json();
        setRecentRewards(data.rewards || []);
      }
    } catch (error) {
      console.error("Error fetching recent rewards:", error);
    }
  }

  async function awardTriviaReward() {
    if (!selectedCoachId || !triviaAmount || !triviaReason.trim()) return;

    const selectedCoach = coaches.find((coach) => coach.id === selectedCoachId);
    if (
      triviaAmount >= 250 &&
      !window.confirm(`Award ${triviaAmount} PBO Coin to ${selectedCoach?.name || "this coach"}?`)
    ) {
      return;
    }

    setAwardingTrivia(true);
    setTriviaSuccess(null);

    try {
      const res = await fetch("/api/admin/trivia-rewards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coachId: selectedCoachId,
          amount: triviaAmount,
          reason: triviaReason.trim(),
          awardedBy: "Admin", // Could be dynamic if we track who's logged in
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setTriviaSuccess(`Awarded ${triviaAmount} coins to ${selectedCoach?.name}. New balance: ${data.newBalance}`);
        setSelectedCoachId("");
        setTriviaAmount(10);
        setTriviaReason("");
        fetchRecentRewards();
        fetchCoaches(); // Refresh coin balances
      } else {
        const error = await res.json();
        alert(error.error || "Failed to award reward");
      }
    } catch (error) {
      console.error("Error awarding trivia reward:", error);
      alert("Failed to award reward");
    } finally {
      setAwardingTrivia(false);
    }
  }

  async function fetchTwitchBadges() {
    try {
      const res = await fetch("/api/admin/twitch-badge");
      if (res.ok) {
        const data = await res.json();
        setTwitchBadgeCoaches(new Set(data.coachIds || []));
      }
    } catch (error) {
      console.error("Error fetching twitch badges:", error);
    }
  }

  async function toggleTwitchBadge(coachId: number, grant: boolean) {
    setTogglingTwitchBadge(true);
    try {
      const res = await fetch("/api/admin/twitch-badge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachId, grant }),
      });
      if (res.ok) {
        setTwitchBadgeCoaches((prev) => {
          const next = new Set(prev);
          if (grant) next.add(coachId);
          else next.delete(coachId);
          return next;
        });
        setTwitchBadgeCoachId("");
      }
    } catch (error) {
      console.error("Error toggling twitch badge:", error);
    } finally {
      setTogglingTwitchBadge(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-[var(--foreground-muted)]">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white">Engagement</h1>

      {/* Games of the Week Section */}
      <Card>
        <CardHeader>
          <CardTitle>Games of the Week</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--foreground-muted)]">
            Select one match per division as the &quot;Game of the Week&quot;.
            Correct picks on GOTW matches award +15 bonus coins.
          </p>

          {/* Week Selector */}
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-white">Week:</label>
            <select
              value={selectedWeek ?? ""}
              onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
              className="px-3 py-2 bg-[var(--background-secondary)] border border-[var(--background-tertiary)] rounded-lg text-white"
            >
              {weeks.map((w) => (
                <option key={w} value={w}>
                  Week {w}
                </option>
              ))}
            </select>
          </div>

          {/* Division GOTW Dropdowns */}
          {loadingGotw ? (
            <div className="text-center text-[var(--foreground-muted)] py-4">
              Loading matches...
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {divisions.map((division) => {
                const matches = matchesByDivision[division.id] || [];
                const currentGotwId = getGotwMatchId(division.id);
                const isSaving = savingGotw === division.id;

                return (
                  <div
                    key={division.id}
                    className="p-4 bg-[var(--background-secondary)] rounded-lg"
                  >
                    <label className="block text-sm font-bold text-white mb-2">
                      {division.name}
                    </label>
                    <select
                      value={currentGotwId ?? ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        setGotwForDivision(
                          division.id,
                          value === "" ? null : parseInt(value)
                        );
                      }}
                      disabled={isSaving || matches.length === 0}
                      className={`w-full px-3 py-2 bg-[var(--background)] border rounded-lg text-white ${
                        currentGotwId
                          ? "border-yellow-500"
                          : "border-[var(--background-tertiary)]"
                      } ${isSaving ? "opacity-50" : ""}`}
                    >
                      <option value="">— No GOTW —</option>
                      {matches.map((match) => (
                        <option key={match.id} value={match.id}>
                          {match.coach1.teamAbbreviation || match.coach1.teamName} vs{" "}
                          {match.coach2.teamAbbreviation || match.coach2.teamName}
                        </option>
                      ))}
                    </select>
                    {matches.length === 0 && (
                      <p className="text-xs text-[var(--foreground-subtle)] mt-1">
                        No matches for this week
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trivia Rewards Section */}
      <Card>
        <CardHeader>
          <CardTitle>Trivia Rewards</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--foreground-muted)]">
            Award coins to coaches for trivia wins, minigame participation, or other achievements.
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Coach Selector */}
            <div>
              <label className="block text-sm font-medium text-white mb-1">Coach</label>
              <select
                value={selectedCoachId}
                onChange={(e) => setSelectedCoachId(e.target.value ? parseInt(e.target.value) : "")}
                className="w-full px-3 py-2 bg-[var(--background-secondary)] border border-[var(--background-tertiary)] rounded-lg text-white"
              >
                <option value="">Select a coach...</option>
                {coaches.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.name} ({coach.pboCoin} coins)
                  </option>
                ))}
              </select>
            </div>

            {/* Amount Input */}
            <div>
              <label className="block text-sm font-medium text-white mb-1">Amount (10-500)</label>
              <input
                type="number"
                min={10}
                max={500}
                value={triviaAmount}
                onChange={(e) => setTriviaAmount(Math.min(500, Math.max(10, parseInt(e.target.value) || 10)))}
                className="w-full px-3 py-2 bg-[var(--background-secondary)] border border-[var(--background-tertiary)] rounded-lg text-white"
              />
            </div>

            {/* Reason Input */}
            <div>
              <label className="block text-sm font-medium text-white mb-1">Reason</label>
              <input
                type="text"
                value={triviaReason}
                onChange={(e) => setTriviaReason(e.target.value)}
                placeholder="e.g., Trivia winner W2"
                className="w-full px-3 py-2 bg-[var(--background-secondary)] border border-[var(--background-tertiary)] rounded-lg text-white placeholder:text-[var(--foreground-subtle)]"
              />
            </div>

            {/* Award Button */}
            <div className="flex items-end">
              <button
                onClick={awardTriviaReward}
                disabled={awardingTrivia || !selectedCoachId || !triviaReason.trim()}
                className="w-full px-4 py-2 bg-[var(--accent)] text-white font-bold rounded-lg hover:bg-[var(--accent)]/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {awardingTrivia ? "Awarding..." : "Award Coins"}
              </button>
            </div>
          </div>

          {/* Success Message */}
          {triviaSuccess && (
            <div className="p-3 bg-green-600/20 text-green-400 rounded-lg text-sm">
              {triviaSuccess}
            </div>
          )}

          {/* Recent Rewards */}
          {recentRewards.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-bold text-[var(--foreground-muted)] mb-2">Recent Awards (This Season)</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {recentRewards.slice(0, 10).map((reward) => (
                  <div
                    key={reward.id}
                    className="flex items-center justify-between p-2 bg-[var(--background-secondary)] rounded text-sm"
                  >
                    <span className="text-white">
                      <span className="font-bold">{reward.coach.name}</span>
                      <span className="text-[var(--foreground-muted)]"> — {reward.reason}</span>
                      {reward.awardedBy && (
                        <span className="text-[var(--foreground-subtle)]"> by {reward.awardedBy}</span>
                      )}
                    </span>
                    <span className="text-[var(--accent)] font-mono">+{reward.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Twitch Badge Section */}
      <Card>
        <CardHeader>
          <CardTitle>Twitch Viewer Badge</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--foreground-muted)]">
            Award the Twitch Viewer badge to coaches who are active viewers during PBO broadcasts.
          </p>

          <div className="flex gap-4 items-end">
            <div className="flex-1 max-w-xs">
              <label className="block text-sm font-medium text-white mb-1">Coach</label>
              <select
                value={twitchBadgeCoachId}
                onChange={(e) => setTwitchBadgeCoachId(e.target.value ? parseInt(e.target.value) : "")}
                className="w-full px-3 py-2 bg-[var(--background-secondary)] border border-[var(--background-tertiary)] rounded-lg text-white"
              >
                <option value="">Select a coach...</option>
                {coaches
                  .filter((c) => !twitchBadgeCoaches.has(c.id))
                  .map((coach) => (
                    <option key={coach.id} value={coach.id}>
                      {coach.name}
                    </option>
                  ))}
              </select>
            </div>
            <button
              onClick={() => twitchBadgeCoachId && toggleTwitchBadge(twitchBadgeCoachId as number, true)}
              disabled={togglingTwitchBadge || !twitchBadgeCoachId}
              className="px-4 py-2 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {togglingTwitchBadge ? "Granting..." : "Grant Badge"}
            </button>
          </div>

          {twitchBadgeCoaches.size > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-bold text-[var(--foreground-muted)] mb-2">
                Current Badge Holders ({twitchBadgeCoaches.size})
              </h4>
              <div className="flex flex-wrap gap-2">
                {coaches
                  .filter((c) => twitchBadgeCoaches.has(c.id))
                  .map((coach) => (
                    <div
                      key={coach.id}
                      className="flex items-center gap-2 px-3 py-1.5 bg-purple-600/20 border border-purple-600/30 rounded-lg text-sm"
                    >
                      <span className="text-white font-medium">{coach.name}</span>
                      <button
                        onClick={() => toggleTwitchBadge(coach.id, false)}
                        disabled={togglingTwitchBadge}
                        className="text-purple-400 hover:text-red-400 transition-colors"
                        title="Remove badge"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Betting Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Feature Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Close Betting Toggle */}
          <div className="flex items-center justify-between p-4 bg-[var(--background-secondary)] rounded-lg">
            <div>
              <h3 className="font-bold text-white">Close Betting</h3>
              <p className="text-sm text-[var(--foreground-muted)] mt-1">
                Hides the bet icon from fixtures, preventing new bets from being placed.
                Existing bets will still resolve normally.
              </p>
            </div>
            <button
              onClick={() => updateSetting("bettingClosed", !settings.bettingClosed)}
              disabled={saving}
              className={`relative w-14 h-8 rounded-full transition-colors ${
                settings.bettingClosed
                  ? "bg-red-600"
                  : "bg-gray-600"
              }`}
            >
              <span
                className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform ${
                  settings.bettingClosed ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>

          {/* Hide Betting UI Toggle */}
          <div className="flex items-center justify-between p-4 bg-[var(--background-secondary)] rounded-lg">
            <div>
              <h3 className="font-bold text-white">Hide Betting UI</h3>
              <p className="text-sm text-[var(--foreground-muted)] mt-1">
                Hides all betting-related UI: the betting leaderboard tab and the bet rows
                below fixtures. Existing bets will still resolve normally.
              </p>
            </div>
            <button
              onClick={() => updateSetting("bettingUiHidden", !settings.bettingUiHidden)}
              disabled={saving}
              className={`relative w-14 h-8 rounded-full transition-colors ${
                settings.bettingUiHidden
                  ? "bg-red-600"
                  : "bg-gray-600"
              }`}
            >
              <span
                className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform ${
                  settings.bettingUiHidden ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-[var(--background-secondary)] rounded-lg">
            <div>
              <h3 className="font-bold text-white">Hide Fantasy</h3>
              <p className="text-sm text-[var(--foreground-muted)] mt-1">
                Removes Fantasy from navigation and blocks the public Fantasy page/API.
              </p>
            </div>
            <button
              onClick={() => updateSetting("fantasyUiHidden", !settings.fantasyUiHidden)}
              disabled={saving}
              className={`relative w-14 h-8 rounded-full transition-colors ${
                settings.fantasyUiHidden
                  ? "bg-red-600"
                  : "bg-gray-600"
              }`}
            >
              <span
                className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform ${
                  settings.fantasyUiHidden ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-[var(--background-secondary)] rounded-lg">
            <div>
              <h3 className="font-bold text-white">Hide Blog</h3>
              <p className="text-sm text-[var(--foreground-muted)] mt-1">
                Removes Blog from navigation and blocks public blog pages/new posts.
              </p>
            </div>
            <button
              onClick={() => updateSetting("blogUiHidden", !settings.blogUiHidden)}
              disabled={saving}
              className={`relative w-14 h-8 rounded-full transition-colors ${
                settings.blogUiHidden
                  ? "bg-red-600"
                  : "bg-gray-600"
              }`}
            >
              <span
                className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform ${
                  settings.blogUiHidden ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>

          {/* Status Summary */}
          <div className="p-4 border border-[var(--background-tertiary)] rounded-lg">
            <h4 className="font-bold text-sm text-[var(--foreground-muted)] mb-2">Current Status</h4>
            <div className="flex flex-wrap gap-4">
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                settings.bettingClosed
                  ? "bg-red-600/20 text-red-400"
                  : "bg-green-600/20 text-green-400"
              }`}>
                Betting: {settings.bettingClosed ? "CLOSED" : "OPEN"}
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                settings.bettingUiHidden
                  ? "bg-red-600/20 text-red-400"
                  : "bg-green-600/20 text-green-400"
              }`}>
                Betting UI: {settings.bettingUiHidden ? "HIDDEN" : "VISIBLE"}
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                settings.fantasyUiHidden
                  ? "bg-red-600/20 text-red-400"
                  : "bg-green-600/20 text-green-400"
              }`}>
                Fantasy: {settings.fantasyUiHidden ? "HIDDEN" : "VISIBLE"}
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                settings.blogUiHidden
                  ? "bg-red-600/20 text-red-400"
                  : "bg-green-600/20 text-green-400"
              }`}>
                Blog: {settings.blogUiHidden ? "HIDDEN" : "VISIBLE"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
