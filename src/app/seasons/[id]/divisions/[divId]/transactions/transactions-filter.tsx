"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

interface TransactionsFilterProps {
  weeks: number[];
  currentWeek: number | null;
}

export function TransactionsFilter({
  weeks,
  currentWeek,
}: TransactionsFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleWeekChange = (week: number | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (week === null) {
      params.delete("week");
    } else {
      params.set("week", week.toString());
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="text-sm text-[var(--foreground-muted)]">Filter by week:</label>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handleWeekChange(null)}
          className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
            currentWeek === null
              ? "bg-[var(--primary)] text-white"
              : "bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-white"
          }`}
        >
          All
        </button>
        {weeks.map((week) => (
          <button
            key={week}
            onClick={() => handleWeekChange(week)}
            className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
              currentWeek === week
                ? "bg-[var(--primary)] text-white"
                : "bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-white"
            }`}
          >
            <span className="sm:hidden">W{week}</span>
            <span className="hidden sm:inline">Week {week}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
