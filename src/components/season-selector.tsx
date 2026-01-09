"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface SeasonOption {
  seasonCoachId: number;
  seasonNumber: number;
  seasonName: string;
  divisionName: string;
  isCurrent: boolean;
}

interface SeasonSelectorProps {
  seasons: SeasonOption[];
  selectedSeasonCoachId: number;
  coachId: number;
}

export function SeasonSelector({ seasons, selectedSeasonCoachId, coachId }: SeasonSelectorProps) {
  const router = useRouter();

  const handleSeasonChange = (seasonCoachId: number) => {
    if (seasonCoachId === selectedSeasonCoachId) return;
    router.push(`/coaches/${coachId}?sc=${seasonCoachId}`);
  };

  // Sort by season number descending (most recent first)
  const sortedSeasons = [...seasons].sort((a, b) => b.seasonNumber - a.seasonNumber);

  return (
    <div className="flex flex-wrap gap-2">
      {sortedSeasons.map((season) => (
        <button
          key={season.seasonCoachId}
          onClick={() => handleSeasonChange(season.seasonCoachId)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            season.seasonCoachId === selectedSeasonCoachId
              ? "bg-[var(--primary)] text-white"
              : "bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] text-[var(--foreground-muted)] hover:border-[var(--primary)] hover:text-white"
          }`}
        >
          S{season.seasonNumber}
        </button>
      ))}
    </div>
  );
}
