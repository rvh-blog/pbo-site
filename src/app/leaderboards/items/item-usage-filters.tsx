"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

type SeasonOption = {
  id: number;
  seasonNumber: number;
};

type DivisionOption = {
  id: number;
  name: string;
  seasonId: number;
  displayOrder: number | null;
};

export function ItemUsageFilters({
  seasons,
  divisions,
  selectedSeason,
  selectedDivision,
}: {
  seasons: SeasonOption[];
  divisions: DivisionOption[];
  selectedSeason: number | null;
  selectedDivision: number | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const navigate = (season: number | null, division: number | null) => {
    const params = new URLSearchParams();
    if (season !== null) params.set("season", String(season));
    if (division !== null) params.set("division", String(division));
    const query = params.toString();
    startTransition(() => {
      router.push(`/leaderboards/items${query ? `?${query}` : ""}`);
    });
  };

  return (
    <div className={`flex flex-wrap items-end gap-2 ${isPending ? "opacity-60" : ""}`}>
      <label className="text-xs font-bold uppercase text-[var(--foreground-muted)]">
        Season
        <select
          aria-label="Season"
          value={selectedSeason ?? ""}
          disabled={isPending}
          onChange={(event) => {
            const season = event.target.value ? Number(event.target.value) : null;
            const currentDivision = divisions.find(
              (division) => division.id === selectedDivision
            );
            const divisionBelongsToSeason =
              season === null ||
              seasons.find((option) => option.id === currentDivision?.seasonId)
                ?.seasonNumber === season;
            navigate(season, divisionBelongsToSeason ? selectedDivision : null);
          }}
          className="mt-1 block min-h-11 rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 py-2 text-sm font-normal normal-case text-white disabled:cursor-wait"
        >
          <option value="">All tracked seasons</option>
          {seasons.map((season) => (
            <option key={season.id} value={season.seasonNumber}>
              Season {season.seasonNumber}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs font-bold uppercase text-[var(--foreground-muted)]">
        Division
        <select
          aria-label="Division"
          value={selectedDivision ?? ""}
          disabled={isPending}
          onChange={(event) => {
            const divisionId = event.target.value ? Number(event.target.value) : null;
            const division = divisions.find((option) => option.id === divisionId);
            const divisionSeason = seasons.find(
              (season) => season.id === division?.seasonId
            )?.seasonNumber;
            navigate(divisionSeason ?? selectedSeason, divisionId);
          }}
          className="mt-1 block min-h-11 max-w-56 rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 py-2 text-sm font-normal normal-case text-white disabled:cursor-wait"
        >
          <option value="">All divisions</option>
          {seasons.map((season) => (
            <optgroup key={season.id} label={`Season ${season.seasonNumber}`}>
              {divisions
                .filter((division) => division.seasonId === season.id)
                .map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
    </div>
  );
}
