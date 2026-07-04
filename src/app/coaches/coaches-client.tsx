"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { LogoFrame } from "@/components/logo-frame";

type Coach = {
  id: number;
  name: string;
  eloRating: number;
  latestTeam: {
    teamName: string;
    teamAbbreviation: string | null;
    teamLogoUrl: string | null;
    divisionName: string | undefined;
  } | null;
  logoFrame: {
    slug: string;
    colors: string[] | null;
  } | null;
  isActive: boolean;
  seasons: number;
};

type SeasonCoachEntry = {
  id: number; // season_coach id
  coachId: number;
  divisionId: number;
  seasonId: number;
  teamName: string;
};

type Match = {
  id: number;
  coach1SeasonId: number;
  coach2SeasonId: number;
  winnerId: number | null;
  coach1Differential: number | null;
  coach2Differential: number | null;
  isForfeit: boolean;
  divisionId: number;
  seasonId: number;
};

type Division = {
  id: number;
  name: string;
  seasonId: number;
};

type Season = {
  id: number;
  seasonNumber: number;
  name: string;
};

type Props = {
  coaches: Coach[];
  seasonCoachEntries: SeasonCoachEntry[];
  matches: Match[];
  divisions: Division[];
  seasons: Season[];
};

type SortKey = "elo" | "name" | "team" | "wins" | "losses" | "winRate" | "differential" | "games" | "seasons";
type SortDirection = "asc" | "desc";
type ActiveFilter = "all" | "active" | "inactive";

export function CoachesClient({ coaches, seasonCoachEntries, matches, divisions, seasons }: Props) {
  const [includeForfeits, setIncludeForfeits] = useState(true);
  const [showAllTimeStats, setShowAllTimeStats] = useState(true); // true = all-time, false = filtered
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [selectedDivisionId, setSelectedDivisionId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("elo");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Get divisions for selected season
  const filteredDivisions = useMemo(() => {
    if (!selectedSeasonId) return [];
    return divisions.filter(d => d.seasonId === selectedSeasonId);
  }, [selectedSeasonId, divisions]);

  // Reset division when season changes
  const handleSeasonChange = (seasonId: number | null) => {
    setSelectedSeasonId(seasonId);
    setSelectedDivisionId(null);
  };

  // Calculate stats for each coach based on filters
  const coachesWithStats = useMemo(() => {
    return coaches.map(coach => {
      // Get season coach IDs for this coach
      const relevantEntries = seasonCoachEntries.filter(sc => sc.coachId === coach.id);

      // For stats, use all-time or filtered based on toggle
      let statsEntries = relevantEntries;
      if (!showAllTimeStats) {
        if (selectedDivisionId) {
          statsEntries = relevantEntries.filter(sc => sc.divisionId === selectedDivisionId);
        } else if (selectedSeasonId) {
          statsEntries = relevantEntries.filter(sc => sc.seasonId === selectedSeasonId);
        }
      }

      // For filtering which coaches to show, always use season/division filter
      let filterEntries = relevantEntries;
      if (selectedDivisionId) {
        filterEntries = relevantEntries.filter(sc => sc.divisionId === selectedDivisionId);
      } else if (selectedSeasonId) {
        filterEntries = relevantEntries.filter(sc => sc.seasonId === selectedSeasonId);
      }

      const statsSeasonCoachIds = statsEntries.map(sc => sc.id);
      const hasMatchesInFilter = filterEntries.length > 0;

      // Filter matches for stats
      let relevantMatches = matches.filter(m =>
        statsSeasonCoachIds.includes(m.coach1SeasonId) || statsSeasonCoachIds.includes(m.coach2SeasonId)
      );

      // Filter by forfeit toggle
      if (!includeForfeits) {
        relevantMatches = relevantMatches.filter(m => !m.isForfeit);
      }

      let wins = 0;
      let losses = 0;
      let differential = 0;

      for (const match of relevantMatches) {
        const isCoach1 = statsSeasonCoachIds.includes(match.coach1SeasonId);
        const mySeasonCoachId = isCoach1 ? match.coach1SeasonId : match.coach2SeasonId;

        if (match.winnerId === mySeasonCoachId) {
          wins++;
        } else if (match.winnerId) {
          losses++;
        }

        if (match.winnerId) {
          differential += isCoach1
            ? match.coach1Differential ?? 0
            : match.coach2Differential ?? 0;
        }
      }

      const gamesPlayed = wins + losses;
      const winRate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;

      return {
        ...coach,
        totalWins: wins,
        totalLosses: losses,
        winRate,
        differential,
        gamesPlayed,
        hasMatchesInFilter,
      };
    });
  }, [coaches, seasonCoachEntries, matches, includeForfeits, showAllTimeStats, selectedSeasonId, selectedDivisionId]);

  // Filter out coaches with no games if filtering by season/division
  const displayedCoaches = useMemo(() => {
    let filtered = coachesWithStats;

    // If filtering by season or division, only show coaches who played in that filter
    if (selectedSeasonId || selectedDivisionId) {
      filtered = filtered.filter(c => c.hasMatchesInFilter);
    }

    // Filter by active status
    if (activeFilter === "active") {
      filtered = filtered.filter(c => c.isActive);
    } else if (activeFilter === "inactive") {
      filtered = filtered.filter(c => !c.isActive);
    }

    const normalizedSearch = search.trim().toLowerCase();
    if (normalizedSearch) {
      filtered = filtered.filter((coach) =>
        coach.name.toLowerCase().includes(normalizedSearch) ||
        coach.latestTeam?.teamName.toLowerCase().includes(normalizedSearch) ||
        coach.latestTeam?.teamAbbreviation?.toLowerCase().includes(normalizedSearch)
      );
    }

    return [...filtered].sort((a, b) => {
      let base = 0;
      switch (sortKey) {
        case "name":
          base = a.name.localeCompare(b.name);
          break;
        case "wins":
          base = a.totalWins - b.totalWins;
          break;
        case "losses":
          base = a.totalLosses - b.totalLosses;
          break;
        case "winRate":
          base = a.winRate - b.winRate;
          break;
        case "team":
          base = (a.latestTeam?.teamName ?? "").localeCompare(b.latestTeam?.teamName ?? "");
          break;
        case "differential":
          base = a.differential - b.differential;
          break;
        case "games":
          base = a.gamesPlayed - b.gamesPlayed;
          break;
        case "seasons":
          base = a.seasons - b.seasons;
          break;
        case "elo":
        default:
          base = a.eloRating - b.eloRating;
          break;
      }

      const sorted = sortDirection === "asc" ? base : -base;
      return sorted || b.eloRating - a.eloRating || a.name.localeCompare(b.name);
    });
  }, [coachesWithStats, selectedSeasonId, selectedDivisionId, activeFilter, search, sortDirection, sortKey]);

  function setSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "name" || nextKey === "team" ? "asc" : "desc");
  }

  function renderSortHeader(label: string, column: SortKey, align: "left" | "center" | "right" = "left") {
    const active = sortKey === column;

    return (
      <button
        key={column}
        type="button"
        onClick={() => setSort(column)}
        className={`flex w-full items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground-muted)] transition-colors hover:text-white ${
          align === "center" ? "justify-center text-center" : align === "right" ? "justify-end text-right" : "justify-start text-left"
        }`}
      >
        <span>{label}</span>
        <span className={active ? "text-[var(--primary)]" : "text-[var(--foreground-subtle)]"}>
          {active ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="poke-card p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="font-pixel text-xl md:text-2xl text-white leading-relaxed">
              Coaches
            </h1>
            <p className="text-sm text-[var(--foreground-muted)] mt-1">
              Search, filter, and sort coach records.
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)]">
            <svg className="w-4 h-4 text-[var(--accent)]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </svg>
            <span className="text-sm font-bold">{displayedCoaches.length} Coaches</span>
          </div>
        </div>
      </div>

      {displayedCoaches.length === 0 ? (
        <div className="poke-card p-12 text-center">
          <div className="w-16 h-16 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[var(--foreground-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <p className="text-[var(--foreground-muted)]">
            {selectedSeasonId || selectedDivisionId
              ? "No coaches found for this filter."
              : "No coaches registered yet."}
          </p>
        </div>
      ) : (
        <div className="poke-card p-0 overflow-hidden">
          {/* Section Header with Filters */}
          <div className="p-4 sm:p-6 border-b-2 border-[var(--background-tertiary)]">
            <div className="flex flex-col gap-4">
              {/* Title */}
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="section-title !mb-0 shrink-0">
                  <div className="section-title-icon">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h3>ELO Rankings</h3>
                </div>

                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--foreground-muted)]">
                    Current Season Coaches
                  </span>
                  <div className="flex w-full overflow-hidden rounded-lg border border-[var(--background-tertiary)] bg-[var(--background-secondary)] sm:w-auto">
                    {(["all", "active", "inactive"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setActiveFilter(value)}
                        className={`flex-1 px-3 py-2 text-[10px] font-bold uppercase transition-colors sm:flex-none sm:text-xs ${
                          activeFilter === value
                            ? "bg-[var(--primary)] text-white"
                            : "text-[var(--foreground-muted)] hover:text-white"
                        }`}
                      >
                        {value === "all" ? "All" : value === "active" ? "Active" : "Inactive"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Filters & Toggles */}
              <details className="sm:contents">
                <summary className="mobile-collapsible-summary sm:hidden">
                  <span>Filters</span>
                  <span className="text-[var(--foreground-muted)] normal-case">
                    {selectedDivisionId
                      ? divisions.find((d) => d.id === selectedDivisionId)?.name
                      : selectedSeasonId
                      ? seasons.find((s) => s.id === selectedSeasonId)?.name
                      : "All coaches"}
                  </span>
                </summary>
              <div className="mobile-collapsible-content flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                <label className="min-w-0 sm:w-52">
                  <span className="sr-only">Search coaches</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search coach or team"
                    className="w-full rounded-lg border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 py-1.5 text-sm text-white outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </label>

                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:w-auto">
                  <select
                    value={sortKey}
                    onChange={(event) => setSortKey(event.target.value as SortKey)}
                    className="min-w-0 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 py-1.5 text-sm text-white outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  >
                    <option value="elo">Sort: Elo</option>
                    <option value="name">Sort: Name</option>
                    <option value="team">Sort: Team</option>
                    <option value="wins">Sort: Wins</option>
                    <option value="losses">Sort: Losses</option>
                    <option value="winRate">Sort: Win %</option>
                    <option value="differential">Sort: Diff</option>
                    <option value="games">Sort: Games</option>
                    <option value="seasons">Sort: Seasons</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setSortDirection((current) => current === "asc" ? "desc" : "asc")}
                    className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 py-1.5 text-sm font-bold text-[var(--foreground-muted)] transition-colors hover:text-white"
                  >
                    {sortDirection === "asc" ? "Asc" : "Desc"}
                  </button>
                </div>

                {/* Filter Dropdowns Row */}
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  <span className="text-[10px] sm:text-xs text-[var(--foreground-muted)] whitespace-nowrap">Filter:</span>
                  <select
                    value={selectedSeasonId || ""}
                    onChange={(e) => handleSeasonChange(e.target.value ? Number(e.target.value) : null)}
                    className="px-2 sm:px-3 py-1.5 text-xs sm:text-sm rounded-lg bg-[var(--background-secondary)] border border-[var(--background-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  >
                    <option value="">All Seasons</option>
                    {seasons.map(s => (
                      <option key={s.id} value={s.id}>S{s.seasonNumber}</option>
                    ))}
                  </select>
                  <select
                    value={selectedDivisionId || ""}
                    onChange={(e) => setSelectedDivisionId(e.target.value ? Number(e.target.value) : null)}
                    disabled={!selectedSeasonId}
                    className="px-2 sm:px-3 py-1.5 text-xs sm:text-sm rounded-lg bg-[var(--background-secondary)] border border-[var(--background-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">All Divs</option>
                    {filteredDivisions.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                {/* Divider - desktop only */}
                <div className="hidden sm:block h-5 w-px bg-[var(--background-tertiary)]" />

                {/* Toggles Row */}
                <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
                  {/* All-Time Stats Toggle */}
                  <label className={`flex items-center gap-1.5 sm:gap-2 cursor-pointer ${(!selectedSeasonId && !selectedDivisionId) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <span className="text-[10px] sm:text-xs text-[var(--foreground-muted)] whitespace-nowrap">All-Time</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={showAllTimeStats}
                      disabled={!selectedSeasonId && !selectedDivisionId}
                      onClick={() => setShowAllTimeStats(!showAllTimeStats)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 focus:ring-offset-[var(--background)] disabled:cursor-not-allowed ${
                        showAllTimeStats ? 'bg-[var(--primary)]' : 'bg-[var(--background-tertiary)]'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                          showAllTimeStats ? 'translate-x-[18px]' : 'translate-x-[3px]'
                        }`}
                      />
                    </button>
                  </label>

                  {/* Include Forfeits Toggle */}
                  <label className="flex items-center gap-1.5 sm:gap-2 cursor-pointer">
                    <span className="text-[10px] sm:text-xs text-[var(--foreground-muted)] whitespace-nowrap">Forfeits</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={includeForfeits}
                      onClick={() => setIncludeForfeits(!includeForfeits)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 focus:ring-offset-[var(--background)] ${
                        includeForfeits ? 'bg-[var(--primary)]' : 'bg-[var(--background-tertiary)]'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                          includeForfeits ? 'translate-x-[18px]' : 'translate-x-[3px]'
                        }`}
                      />
                    </button>
                  </label>

                </div>
              </div>
              </details>
            </div>
          </div>

          <div className="hidden border-b-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)]/70 px-4 py-3 md:grid md:grid-cols-[3rem_3rem_minmax(10rem,1.3fr)_7rem_minmax(10rem,1fr)_4rem_4rem_4rem_5rem_5rem_5rem_5rem] md:items-center md:gap-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--foreground-muted)]">Rank</div>
            <div aria-hidden="true" />
            {renderSortHeader("Coach", "name")}
            <div className="text-center text-[10px] font-bold uppercase tracking-wide text-[var(--foreground-muted)]">Status</div>
            {renderSortHeader("Team", "team")}
            {renderSortHeader("GP", "games", "center")}
            {renderSortHeader("W", "wins", "center")}
            {renderSortHeader("L", "losses", "center")}
            {renderSortHeader("Win %", "winRate", "center")}
            {renderSortHeader("Diff", "differential", "center")}
            {renderSortHeader("Seasons", "seasons", "center")}
            {renderSortHeader("ELO", "elo", "right")}
          </div>

          {/* Coach List */}
          <div className="divide-y-2 divide-[var(--background-tertiary)]">
            {displayedCoaches.map((coach, index) => (
              <Link key={coach.id} href={`/coaches/${coach.id}`} className="block group">
                <div className="flex items-center gap-2 p-3 transition-colors hover:bg-[var(--background-secondary)]/50 sm:gap-4 sm:p-4 md:grid md:grid-cols-[3rem_3rem_minmax(10rem,1.3fr)_7rem_minmax(10rem,1fr)_4rem_4rem_4rem_5rem_5rem_5rem_5rem] md:items-center md:gap-3">
                  {/* Rank */}
                  <div className={`rank-badge w-5 h-5 sm:w-8 sm:h-8 text-[10px] sm:text-sm flex-shrink-0 ${
                    index === 0 ? 'rank-1' :
                    index === 1 ? 'rank-2' :
                    index === 2 ? 'rank-3' :
                    'bg-[var(--background)] text-[var(--foreground-subtle)] border border-[var(--background-tertiary)]'
                  }`}>
                    {index + 1}
                  </div>

                  {/* Team Logo / Fallback Initial */}
                  {coach.logoFrame?.slug ? (
                    <LogoFrame
                      slug={coach.logoFrame.slug}
                      colors={coach.logoFrame.colors}
                      className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0"
                    >
                      {coach.latestTeam?.teamLogoUrl ? (
                        <Image
                          src={coach.latestTeam.teamLogoUrl}
                          alt={coach.latestTeam.teamName}
                          width={40}
                          height={40}
                          className="object-contain"
                        />
                      ) : (
                        <span className="text-white font-bold text-xs sm:text-sm">
                          {coach.latestTeam?.teamAbbreviation?.substring(0, 2) || coach.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </LogoFrame>
                  ) : (
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg bg-[var(--background-secondary)] flex items-center justify-center flex-shrink-0 border border-[var(--background-tertiary)] overflow-hidden">
                      {coach.latestTeam?.teamLogoUrl ? (
                        <Image
                          src={coach.latestTeam.teamLogoUrl}
                          alt={coach.latestTeam.teamName}
                          width={40}
                          height={40}
                          className="object-contain"
                        />
                      ) : (
                        <span className="text-white font-bold text-xs sm:text-sm">
                          {coach.latestTeam?.teamAbbreviation?.substring(0, 2) || coach.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Name & Team Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-xs sm:text-sm group-hover:text-[var(--primary)] transition-colors truncate">
                      {coach.name}
                    </h3>
                    <p className="text-[10px] sm:text-xs text-[var(--foreground-muted)] truncate md:hidden">
                      {coach.latestTeam ? (
                        <>
                          {coach.latestTeam.teamName}
                          {coach.isActive && (
                            <span className="ml-1.5 inline-flex items-center gap-1 text-[var(--success)]">
                              <span className="w-1 h-1 rounded-full bg-[var(--success)] animate-pulse" />
                              Active
                            </span>
                          )}
                        </>
                      ) : (
                        `${coach.seasons} season${coach.seasons !== 1 ? 's' : ''}`
                      )}
                    </p>
                    {/* Stats - Mobile (below name) */}
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--foreground-muted)] md:hidden">
                      <span>{coach.gamesPlayed} GP</span>
                      <span className="text-[var(--success)] font-medium">{coach.totalWins}W</span>
                      <span className="mx-1">-</span>
                      <span className="text-[var(--error)] font-medium">{coach.totalLosses}L</span>
                      <span>{coach.winRate}%</span>
                      <span className={coach.differential >= 0 ? "text-[var(--success)]" : "text-[var(--error)]"}>
                        {coach.differential > 0 ? "+" : ""}{coach.differential}
                      </span>
                    </p>
                  </div>

                  <div className="hidden md:flex justify-center">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${
                      coach.isActive
                        ? "border-[var(--success)]/40 bg-[var(--success)]/10 text-[var(--success)]"
                        : "border-[var(--background-tertiary)] bg-[var(--background-secondary)] text-[var(--foreground-muted)]"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${coach.isActive ? "bg-[var(--success)]" : "bg-[var(--foreground-subtle)]"}`} />
                      {coach.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <div className="hidden min-w-0 md:block">
                    <p className="truncate text-sm font-medium text-white">
                      {coach.latestTeam?.teamName ?? "No team"}
                    </p>
                    <p className="truncate text-[10px] text-[var(--foreground-muted)]">
                      {coach.latestTeam?.divisionName ?? `${coach.seasons} season${coach.seasons !== 1 ? "s" : ""}`}
                    </p>
                  </div>

                  {/* Stats - Desktop */}
                  <div className="hidden md:contents text-sm">
                    <div className="text-center">
                      <p className="font-bold text-white">{coach.gamesPlayed}</p>
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-[var(--success)]">{coach.totalWins}</p>
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-[var(--error)]">{coach.totalLosses}</p>
                    </div>
                    <div className="text-center">
                      <p className="font-bold">{coach.winRate}%</p>
                    </div>
                    <div className="text-center">
                      <p className={`font-bold ${coach.differential >= 0 ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
                        {coach.differential > 0 ? "+" : ""}{coach.differential}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-white">{coach.seasons}</p>
                    </div>
                  </div>

                  {/* ELO */}
                  <div className={`justify-self-end px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg font-mono font-bold text-xs sm:text-sm flex-shrink-0 ${
                    coach.eloRating >= 1100
                      ? "bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/30"
                      : coach.eloRating <= 900
                      ? "bg-[var(--error)]/10 text-[var(--error)] border border-[var(--error)]/30"
                      : "bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30"
                  }`}>
                    {Math.round(coach.eloRating)}
                  </div>

                  {/* Arrow - Desktop only */}
                  <div className="hidden opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all flex-shrink-0">
                    <svg className="w-4 h-4 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
