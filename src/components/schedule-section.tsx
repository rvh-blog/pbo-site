"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LeagueJourney } from "@/components/league-context";
import { positiveId, type LeagueContext } from "@/lib/league-context";
import { EmptyState } from "@/components/ui/empty-state";
import { isCompletedMatchResult, isDoubleForfeitResult } from "@/lib/match-result-utils";

interface MatchPokemon {
  id: number;
  seasonCoachId: number;
  pokemonId: number;
  kills: number | null;
  deaths: number | null;
  pokemon: {
    id: number;
    name: string;
    displayName?: string | null;
    spriteUrl: string | null;
  } | null;
}

interface Match {
  id: number;
  seasonId: number;
  week: number;
  winnerId: number | null;
  replayUrl: string | null;
  coach1Differential: number | null;
  coach2Differential: number | null;
  coach1: {
    id: number;
    coachId: number;
    teamName: string;
    teamAbbreviation: string | null;
    teamLogoUrl: string | null;
    coach: { name: string } | null;
  };
  coach2: {
    id: number;
    coachId: number;
    teamName: string;
    teamAbbreviation: string | null;
    teamLogoUrl: string | null;
    coach: { name: string } | null;
  };
  isForfeit: boolean | null;
  isGameOfTheWeek?: boolean | null;
  scheduledAt: string | null;
  matchPokemon: MatchPokemon[];
}

interface ScheduleSectionProps {
  schedule: Record<number, Match[]>;
  maxWeek: number;
  divisionColor?: string;
  divisionShadow?: string;
  context?: LeagueContext;
}

// Helper to get display label for a week number
function getWeekLabel(week: number): string {
  if (week === 101) return "Quarterfinals";
  if (week === 102) return "Semifinals";
  if (week === 103) return "Finals";
  return `Week ${week}`;
}

// Find the earliest week that still has unplayed games
function getInitialWeek(schedule: Record<number, Match[]>, maxWeek: number): number {
  const allWeeks = Object.keys(schedule).map(Number).sort((a, b) => a - b);

  // Find the earliest week with at least one unplayed match
  for (const week of allWeeks) {
    const matches = schedule[week] || [];
    const hasUnplayedMatch = matches.some(m => !isCompletedMatchResult(m.winnerId, m.isForfeit));
    if (hasUnplayedMatch) {
      return week;
    }
  }

  // All matches played, default to maxWeek or 1
  return maxWeek || 1;
}

function formatSchedule(isoString: string): string {
  return new Date(isoString).toLocaleString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function ScheduleSection({
  schedule,
  maxWeek,
  divisionColor = "var(--accent)",
  divisionShadow = "#b45309",
  context,
}: ScheduleSectionProps) {
  const searchParams = useSearchParams();
  const requestedWeek = positiveId(searchParams.get("week"));
  const selectedWeek = requestedWeek && Object.hasOwn(schedule, requestedWeek)
    ? requestedWeek : getInitialWeek(schedule, maxWeek);
  const teamId = positiveId(searchParams.get("teamId"));
  const selectedTeam = teamId && Object.values(schedule).flat().some((match) => match.coach1.id === teamId || match.coach2.id === teamId) ? teamId : undefined;
  const setSelectedWeek = (week: number) => {
    const url = new URL(window.location.href);
    url.searchParams.set("week", String(week));
    window.history.pushState(null, "", url);
  };
  const [expandedMatches, setExpandedMatches] = useState<Set<number>>(new Set());
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setNow(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Get all weeks from schedule (includes playoff weeks 101, 102, 103)
  const allWeeks = Object.keys(schedule).map(Number).sort((a, b) => a - b);
  // Separate regular weeks and playoff weeks
  const regularWeeks = allWeeks.filter(w => w <= 100);
  const playoffWeeks = allWeeks.filter(w => w > 100);
  // Combine: regular weeks in order, then playoff weeks
  const weeks = [...regularWeeks, ...playoffWeeks];
  const matchesForWeek = schedule[selectedWeek] || [];

  const toggleMatch = (matchId: number) => {
    setExpandedMatches((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) {
        next.delete(matchId);
      } else {
        next.add(matchId);
      }
      return next;
    });
  };

  return (
    <div
      className="schedule-readable readable-content poke-card p-0 overflow-hidden"
      style={{
        borderColor: `${divisionColor}44`,
        background: `linear-gradient(180deg, ${divisionColor}0f, transparent 42%)`,
      }}
    >
      <div className="p-6 border-b-2" style={{ borderBottomColor: `${divisionColor}44` }}>
        <div className="section-title !mb-0">
          <div className="section-title-icon" style={{ background: divisionColor, boxShadow: `0 4px 0 ${divisionShadow}` }}>
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3>Schedule</h3>
        </div>
      </div>

      {context && <div className="p-3 sm:p-4"><LeagueJourney context={{
        ...context, week: selectedWeek, teamId: selectedTeam,
      }} /></div>}

      {/* Week Selector */}
      <div className="p-3 sm:p-4 border-b-2" style={{ borderBottomColor: `${divisionColor}33` }}>
        <div
          className="mobile-scroll-region flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0 scrollbar-thin"
          role="group"
          aria-label="Choose schedule week"
          tabIndex={0}
        >
          {weeks.map((week) => (
            <button
              key={week}
              onClick={() => setSelectedWeek(week)}
              aria-pressed={selectedWeek === week}
              className={`min-h-11 shrink-0 px-3 py-2 rounded-lg text-sm font-bold transition-colors border ${
                selectedWeek === week
                  ? week > 100
                    ? "text-white"
                    : "text-white"
                  : "bg-[var(--background-secondary)] border-[var(--background-tertiary)] hover:border-[var(--primary)]"
              }`}
              style={selectedWeek === week
                ? { backgroundColor: divisionColor, borderColor: divisionColor }
                : undefined}
            >
              {getWeekLabel(week)}
            </button>
          ))}
        </div>
      </div>

      {/* Matches for Selected Week */}
      <div className="p-4">
        {matchesForWeek.length === 0 ? (
          <EmptyState
            compact
            title={`No matches in ${getWeekLabel(selectedWeek)}`}
            description="Choose another week above, or return to the season overview to browse divisions and completed results."
          />
        ) : (
          <div className="space-y-3">
            {matchesForWeek.map((match) => {
              const hasResult = isCompletedMatchResult(match.winnerId, match.isForfeit);
              const isForfeit = match.isForfeit;
              const isDoubleLoss = isDoubleForfeitResult(match.winnerId, match.isForfeit);
              const team1Won = match.winnerId === match.coach1.id;
              const team2Won = match.winnerId === match.coach2.id;
              const isExpanded = expandedMatches.has(match.id);
              const ONE_HOUR = 60 * 60 * 1000;
              const isUnderway = !hasResult && now !== null && !!match.scheduledAt && (() => {
                const scheduledTime = new Date(match.scheduledAt!).getTime();
                return scheduledTime <= now && scheduledTime > now - ONE_HOUR;
              })();

              // Split Pokemon by team
              const team1Pokemon = match.matchPokemon.filter(
                (mp) => mp.seasonCoachId === match.coach1.id
              );
              const team2Pokemon = match.matchPokemon.filter(
                (mp) => mp.seasonCoachId === match.coach2.id
              );
              const hasPokemonStats = team1Pokemon.length > 0 || team2Pokemon.length > 0;

              return (
                <div
                  key={match.id}
                  className="rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] overflow-hidden"
                >
                  {/* Match Header */}
                  <div className="p-3">
                    {match.isGameOfTheWeek && (
                      <div className="mb-2 flex justify-center">
                        <span className="rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-[var(--accent)]">
                          Game of the Week
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 md:gap-4">
                      {/* Team 1 */}
                      <div className={`flex-1 min-w-0 ${hasResult && !team1Won ? "opacity-50" : ""}`}>
                        <Link href={`/coaches/${match.coach1.coachId}`} className="flex items-center gap-2 group">
                          {team1Won && (
                            <svg className="w-4 h-4 text-[var(--success)] flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                            </svg>
                          )}
                          {match.coach1.teamLogoUrl ? (
                            <div className="w-8 h-8 rounded overflow-hidden bg-[var(--background-tertiary)] flex items-center justify-center flex-shrink-0">
                              <Image
                                src={match.coach1.teamLogoUrl}
                                alt={match.coach1.teamName}
                                width={32}
                                height={32}
                                className="object-contain"
                              />
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded bg-gradient-to-br from-[var(--primary)] to-[var(--gradient-end)] flex items-center justify-center flex-shrink-0">
                              <span className="text-white font-bold text-xs">
                                {match.coach1.teamAbbreviation || match.coach1.teamName.substring(0, 2).toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className={`font-medium text-sm block truncate group-hover:text-[var(--primary)] transition-colors ${team1Won ? "text-[var(--success)]" : ""}`}>
                              {match.coach1.teamName}
                            </span>
                            <span className="text-xs text-[var(--foreground-muted)] hidden sm:block">
                              {match.coach1.coach?.name}
                            </span>
                          </div>
                        </Link>
                      </div>

                      {/* Score / vs */}
                      <div className="flex flex-col items-center gap-1 flex-shrink-0">
                        <div className="flex items-center gap-2 px-2 md:px-3 py-1 rounded bg-[var(--background-tertiary)]">
                          {hasResult ? (
                            <>
                              <span className={`font-mono font-bold text-sm ${team1Won ? "text-[var(--success)]" : ""}`}>
                                {(match.coach1Differential || 0) > 0 ? "+" : ""}
                                {match.coach1Differential || 0}
                              </span>
                              <span className="text-[var(--foreground-subtle)] text-xs">vs</span>
                              <span className={`font-mono font-bold text-sm ${team2Won ? "text-[var(--success)]" : ""}`}>
                                {(match.coach2Differential || 0) > 0 ? "+" : ""}
                                {match.coach2Differential || 0}
                              </span>
                            </>
                          ) : (
                            <span className="text-[var(--foreground-muted)] text-sm">vs</span>
                          )}
                        </div>
                        {isForfeit && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--error)] opacity-80">
                            {isDoubleLoss ? "Double Loss" : "Forfeit"}
                          </span>
                        )}
                      </div>

                      {/* Team 2 */}
                      <div className={`flex-1 min-w-0 ${hasResult && !team2Won ? "opacity-50" : ""}`}>
                        <Link href={`/coaches/${match.coach2.coachId}`} className="flex items-center justify-end gap-2 group">
                          <div className="min-w-0 text-right">
                            <span className={`font-medium text-sm block truncate group-hover:text-[var(--primary)] transition-colors ${team2Won ? "text-[var(--success)]" : ""}`}>
                              {match.coach2.teamName}
                            </span>
                            <span className="text-xs text-[var(--foreground-muted)] hidden sm:block">
                              {match.coach2.coach?.name}
                            </span>
                          </div>
                          {match.coach2.teamLogoUrl ? (
                            <div className="w-8 h-8 rounded overflow-hidden bg-[var(--background-tertiary)] flex items-center justify-center flex-shrink-0">
                              <Image
                                src={match.coach2.teamLogoUrl}
                                alt={match.coach2.teamName}
                                width={32}
                                height={32}
                                className="object-contain"
                              />
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded bg-gradient-to-br from-[var(--primary)] to-[var(--gradient-end)] flex items-center justify-center flex-shrink-0">
                              <span className="text-white font-bold text-xs">
                                {match.coach2.teamAbbreviation || match.coach2.teamName.substring(0, 2).toUpperCase()}
                              </span>
                            </div>
                          )}
                          {team2Won && (
                            <svg className="w-4 h-4 text-[var(--success)] flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                            </svg>
                          )}
                        </Link>
                      </div>
                    </div>

                    {/* Live indicator or scheduled time for upcoming matches */}
                    {!hasResult && match.scheduledAt && now !== null && (
                      isUnderway ? (
                        <div className="flex items-center justify-center gap-1.5 mt-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--error)] animate-pulse" />
                          <span className="text-[10px] sm:text-xs font-bold text-[var(--error)] uppercase">LIVE RIGHT NOW</span>
                        </div>
                      ) : (
                        <p className="text-[10px] sm:text-xs text-[var(--foreground-muted)] text-center mt-2">
                          {formatSchedule(match.scheduledAt)}
                        </p>
                      )
                    )}

                    {/* Action buttons row */}
                    <div className="schedule-actions flex flex-wrap items-center justify-center gap-2 mt-3 pt-3 border-t-2 border-[var(--background-tertiary)]">
                      {match.id > 0 ? (
                        <Link
                          href={`/matches/${match.id}`}
                          className="flex items-center gap-1.5 text-xs text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          {hasResult ? "Match Details" : "Match Preview"}
                        </Link>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs text-[var(--foreground-muted)]">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Upcoming
                        </span>
                      )}
                      {hasResult && hasPokemonStats && (
                        <button
                          onClick={() => toggleMatch(match.id)}
                          aria-expanded={isExpanded}
                          aria-controls={`match-stats-${match.id}`}
                          className="flex items-center gap-1.5 text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
                        >
                          <svg
                            className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                          {isExpanded ? "Hide Stats" : "View Stats"}
                        </button>
                      )}
                      {!hasResult && match.id > 0 && (
                        <Link href={`/matchup-prep?matchId=${match.id}${selectedTeam ? `&teamId=${selectedTeam}` : ""}`}
                          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--primary)]/15 px-3 text-sm font-semibold text-[var(--primary)]">
                          Scout matchup
                        </Link>
                      )}
                      {match.replayUrl && (
                        <a
                          href={match.replayUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Watch Replay
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Expanded Pokemon Stats */}
                  {isExpanded && hasPokemonStats && (
                    <div id={`match-stats-${match.id}`} className="border-t-2 border-[var(--background-tertiary)] bg-[var(--background)]/50 p-3">
                      <div className="grid grid-cols-2 gap-4">
                        {/* Team 1 Pokemon */}
                        <div>
                          <div className="text-xs font-medium text-[var(--foreground-muted)] mb-2 flex items-center gap-1.5">
                            {match.coach1.teamLogoUrl ? (
                              <Image
                                src={match.coach1.teamLogoUrl}
                                alt=""
                                width={16}
                                height={16}
                                className="object-contain rounded"
                              />
                            ) : (
                              <div className="w-4 h-4 rounded bg-gradient-to-br from-[var(--primary)] to-[var(--gradient-end)] flex items-center justify-center">
                                <span className="text-white text-[8px] font-bold">
                                  {match.coach1.teamAbbreviation?.charAt(0) || match.coach1.teamName.charAt(0)}
                                </span>
                              </div>
                            )}
                            {match.coach1.teamAbbreviation || match.coach1.teamName}
                          </div>
                          <div className="space-y-1">
                            {team1Pokemon.map((mp) => (
                              <div key={mp.id} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1.5">
                                  {mp.pokemon?.spriteUrl ? (
                                    <Image
                                      src={mp.pokemon.spriteUrl}
                                      alt={mp.pokemon.displayName || mp.pokemon.name}
                                      width={20}
                                      height={20}
                                      sizes="20px"
                                      className="w-5 h-5 object-contain"
                                    />
                                  ) : (
                                    <div className="w-5 h-5 bg-[var(--background-tertiary)] rounded" />
                                  )}
                                  <span className="truncate">{mp.pokemon?.displayName || mp.pokemon?.name}</span>
                                </div>
                                <div className="flex items-center gap-2 font-mono">
                                  <span className="text-[var(--success)]">{mp.kills || 0}K</span>
                                  <span className="text-[var(--error)]">{mp.deaths || 0}D</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Team 2 Pokemon */}
                        <div>
                          <div className="text-xs font-medium text-[var(--foreground-muted)] mb-2 flex items-center justify-end gap-1.5">
                            {match.coach2.teamAbbreviation || match.coach2.teamName}
                            {match.coach2.teamLogoUrl ? (
                              <Image
                                src={match.coach2.teamLogoUrl}
                                alt=""
                                width={16}
                                height={16}
                                className="object-contain rounded"
                              />
                            ) : (
                              <div className="w-4 h-4 rounded bg-gradient-to-br from-[var(--primary)] to-[var(--gradient-end)] flex items-center justify-center">
                                <span className="text-white text-[8px] font-bold">
                                  {match.coach2.teamAbbreviation?.charAt(0) || match.coach2.teamName.charAt(0)}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="space-y-1">
                            {team2Pokemon.map((mp) => (
                              <div key={mp.id} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2 font-mono">
                                  <span className="text-[var(--success)]">{mp.kills || 0}K</span>
                                  <span className="text-[var(--error)]">{mp.deaths || 0}D</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate text-right">{mp.pokemon?.displayName || mp.pokemon?.name}</span>
                                  {mp.pokemon?.spriteUrl ? (
                                    <Image
                                      src={mp.pokemon.spriteUrl}
                                      alt={mp.pokemon.displayName || mp.pokemon.name}
                                      width={20}
                                      height={20}
                                      sizes="20px"
                                      className="w-5 h-5 object-contain"
                                    />
                                  ) : (
                                    <div className="w-5 h-5 bg-[var(--background-tertiary)] rounded" />
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
