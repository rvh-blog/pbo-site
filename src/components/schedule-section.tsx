"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

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
    teamName: string;
    teamAbbreviation: string | null;
    teamLogoUrl: string | null;
    coach: { name: string } | null;
  };
  coach2: {
    id: number;
    teamName: string;
    teamAbbreviation: string | null;
    teamLogoUrl: string | null;
    coach: { name: string } | null;
  };
  matchPokemon: MatchPokemon[];
}

interface ScheduleSectionProps {
  schedule: Record<number, Match[]>;
  maxWeek: number;
}

// Helper to get display label for a week number
function getWeekLabel(week: number): string {
  if (week === 101) return "Quarterfinals";
  if (week === 102) return "Semifinals";
  if (week === 103) return "Finals";
  return `Week ${week}`;
}

export function ScheduleSection({ schedule, maxWeek }: ScheduleSectionProps) {
  const [selectedWeek, setSelectedWeek] = useState(maxWeek || 1);
  const [expandedMatches, setExpandedMatches] = useState<Set<number>>(new Set());

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
    <div className="poke-card p-0 overflow-hidden">
      <div className="p-6 border-b-2 border-[var(--background-tertiary)]">
        <div className="section-title !mb-0">
          <div className="section-title-icon !bg-[var(--accent)]" style={{ boxShadow: '0 4px 0 #b45309' }}>
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3>Schedule</h3>
        </div>
      </div>

      {/* Week Selector */}
      <div className="p-4 border-b-2 border-[var(--background-tertiary)]">
        <div className="flex flex-wrap gap-2">
          {weeks.map((week) => (
            <button
              key={week}
              onClick={() => setSelectedWeek(week)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border-2 ${
                selectedWeek === week
                  ? week > 100
                    ? "bg-[var(--accent)] text-black border-[var(--accent)]"
                    : "bg-[var(--primary)] text-white border-[var(--primary)]"
                  : "bg-[var(--background-secondary)] border-[var(--background-tertiary)] hover:border-[var(--primary)]"
              }`}
            >
              {getWeekLabel(week)}
            </button>
          ))}
        </div>
      </div>

      {/* Matches for Selected Week */}
      <div className="p-4">
        {matchesForWeek.length === 0 ? (
          <p className="text-[var(--foreground-muted)] text-center py-4 text-sm">
            No matches scheduled for {getWeekLabel(selectedWeek)}
          </p>
        ) : (
          <div className="space-y-3">
            {matchesForWeek.map((match) => {
              const hasResult = match.winnerId !== null;
              const team1Won = match.winnerId === match.coach1.id;
              const team2Won = match.winnerId === match.coach2.id;
              const isExpanded = expandedMatches.has(match.id);

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
                    <div className="flex items-center justify-between gap-2 md:gap-4">
                      {/* Team 1 */}
                      <div className={`flex-1 min-w-0 ${hasResult && !team1Won ? "opacity-50" : ""}`}>
                        <div className="flex items-center gap-2">
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
                            <span className={`font-medium text-sm block truncate ${team1Won ? "text-[var(--success)]" : ""}`}>
                              {match.coach1.teamName}
                            </span>
                            <span className="text-xs text-[var(--foreground-muted)] hidden sm:block">
                              {match.coach1.coach?.name}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Score / vs */}
                      <div className="flex items-center gap-2 px-2 md:px-3 py-1 rounded bg-[var(--background-tertiary)] flex-shrink-0">
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

                      {/* Team 2 */}
                      <div className={`flex-1 min-w-0 ${hasResult && !team2Won ? "opacity-50" : ""}`}>
                        <div className="flex items-center justify-end gap-2">
                          <div className="min-w-0 text-right">
                            <span className={`font-medium text-sm block truncate ${team2Won ? "text-[var(--success)]" : ""}`}>
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
                        </div>
                      </div>
                    </div>

                    {/* Action buttons row */}
                    <div className="flex items-center justify-center gap-3 mt-3 pt-3 border-t-2 border-[var(--background-tertiary)]">
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
                    <div className="border-t-2 border-[var(--background-tertiary)] bg-[var(--background)]/50 p-3">
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
                                    <img
                                      src={mp.pokemon.spriteUrl}
                                      alt={mp.pokemon.displayName || mp.pokemon.name}
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
                                    <img
                                      src={mp.pokemon.spriteUrl}
                                      alt={mp.pokemon.displayName || mp.pokemon.name}
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
