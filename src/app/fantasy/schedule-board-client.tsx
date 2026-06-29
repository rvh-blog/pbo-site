"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

export type FantasyScheduleRow = {
  id: number;
  week: number;
  divisionName: string | null;
  divisionColor: string | null;
  coach1SeasonId: number;
  coach2SeasonId: number;
  winnerId: number | null;
  coach1Differential: number | null;
  coach2Differential: number | null;
  coach1TeamName: string | null;
  coach2TeamName: string | null;
  coach1TeamLogoUrl: string | null;
  coach2TeamLogoUrl: string | null;
};

function teamShortName(teamName: string | null | undefined) {
  return teamName?.split(" ")[0] || "Winner";
}

function resultLabel(match: FantasyScheduleRow) {
  if (match.winnerId === match.coach1SeasonId) {
    return `${teamShortName(match.coach1TeamName)} +${Math.abs(match.coach1Differential ?? 0)}`;
  }
  if (match.winnerId === match.coach2SeasonId) {
    return `${teamShortName(match.coach2TeamName)} +${Math.abs(match.coach2Differential ?? 0)}`;
  }
  return "VS";
}

export function ScheduleBoardClient({
  defaultDivisionName,
  divisionNames,
  matches,
}: {
  defaultDivisionName?: string | null;
  divisionNames: string[];
  matches: FantasyScheduleRow[];
}) {
  const initialDivision =
    defaultDivisionName &&
    divisionNames.some((divisionName) => divisionName.toLowerCase() === defaultDivisionName.toLowerCase())
      ? defaultDivisionName
      : divisionNames[0] ?? "";
  const [selectedDivision, setSelectedDivision] = useState(initialDivision);
  const filteredMatches = useMemo(
    () =>
      matches.filter((match) =>
        selectedDivision
          ? match.divisionName?.toLowerCase() === selectedDivision.toLowerCase()
          : true
      ),
    [matches, selectedDivision]
  );

  return (
    <div className="poke-card p-4 sm:p-5">
      <div className="section-title">
        <div className="section-title-icon">
          <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3M5 11h14M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h3>Schedule</h3>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/50 p-1">
        {divisionNames.map((divisionName) => (
          <button
            key={divisionName}
            type="button"
            onClick={() => setSelectedDivision(divisionName)}
            className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase transition-colors ${
              selectedDivision.toLowerCase() === divisionName.toLowerCase()
                ? "bg-[var(--primary)] text-white"
                : "text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-white"
            }`}
          >
            {divisionName}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filteredMatches.map((match) => {
          const coach1Won = match.winnerId === match.coach1SeasonId;
          const coach2Won = match.winnerId === match.coach2SeasonId;
          const isResult = Boolean(match.winnerId);

          return (
            <Link key={match.id} href={`/matches/${match.id}`} className="block">
              <div className="battle-log-item">
                <div className={`week-badge ${match.week > 100 ? "playoff" : ""}`}>
                  <span>{match.week > 100 ? "Playoff" : "Week"}</span>
                  <span>{match.week > 100 ? match.week - 100 : match.week}</span>
                </div>
                <div className="grid min-w-0 flex-1 grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <div className={`flex min-w-0 items-center gap-2 ${coach1Won ? "text-[var(--success)]" : "text-[var(--foreground-muted)]"}`}>
                    {match.coach1TeamLogoUrl && (
                      <Image src={match.coach1TeamLogoUrl} alt="" width={24} height={24} className="hidden rounded sm:block" />
                    )}
                    <span className="truncate text-xs font-bold sm:text-sm">{match.coach1TeamName}</span>
                  </div>
                  <div className="score-display">
                    {isResult ? resultLabel(match) : "VS"}
                  </div>
                  <div className={`flex min-w-0 items-center justify-end gap-2 ${coach2Won ? "text-[var(--success)]" : "text-[var(--foreground-muted)]"}`}>
                    <span className="truncate text-right text-xs font-bold sm:text-sm">{match.coach2TeamName}</span>
                    {match.coach2TeamLogoUrl && (
                      <Image src={match.coach2TeamLogoUrl} alt="" width={24} height={24} className="hidden rounded sm:block" />
                    )}
                  </div>
                </div>
                {match.divisionName && (
                  <span
                    className="hidden rounded px-2 py-1 text-[10px] font-bold uppercase sm:inline-block"
                    style={{
                      color: match.divisionColor ?? "var(--foreground-muted)",
                      backgroundColor: match.divisionColor ? `${match.divisionColor}15` : "var(--background-tertiary)",
                      border: `1px solid ${match.divisionColor ? `${match.divisionColor}30` : "var(--background-tertiary)"}`,
                    }}
                  >
                    {match.divisionName}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
        {filteredMatches.length === 0 && (
          <p className="py-6 text-center text-sm text-[var(--foreground-muted)]">
            No matches found for this division.
          </p>
        )}
      </div>
    </div>
  );
}
