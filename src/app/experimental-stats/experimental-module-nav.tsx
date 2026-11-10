"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { ExperimentalModuleSlug } from "@/lib/experimental-stats-data";

export const experimentalModuleLinks: Array<{ slug: ExperimentalModuleSlug; label: string }> = [
  { slug: "pokemon", label: "Pokémon Profiles" },
  { slug: "coaches", label: "Coach Profiles" },
  { slug: "compare", label: "Compare" },
  { slug: "insights", label: "Insights" },
  { slug: "trends", label: "Rolling Trends" },
  { slug: "leaderboards", label: "Leaderboards" },
  { slug: "replays", label: "Replay Search" },
  { slug: "battle-visualizer", label: "Battle Visualizer" },
  { slug: "rare-events", label: "Rare Event Explorer" },
  { slug: "move-outcomes", label: "Move Outcomes" },
  { slug: "status-events", label: "Status Events" },
  { slug: "item-ability-events", label: "Item & Ability Events" },
  { slug: "signature-stats", label: "Signature Stats" },
  { slug: "team-stats", label: "Team Stats" },
  { slug: "top-plays", label: "Top Plays" },
  { slug: "visuals", label: "Visual Lab" },
  { slug: "glossary", label: "Metric Glossary" },
];

export function ExperimentalModuleNav({ active }: { active: ExperimentalModuleSlug }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hrefFor = (slug: ExperimentalModuleSlug) => {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    if (slug !== "battle-visualizer") nextSearchParams.delete("match");
    const suffix = nextSearchParams.toString() ? `?${nextSearchParams.toString()}` : "";
    return `/experimental-stats/${slug}${suffix}`;
  };

  return (
    <nav aria-label="Experimental Stats reports" className="poke-card grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center sm:gap-5 sm:p-5">
      <label className="block min-w-0">
        <span className="mb-1.5 block text-sm font-bold text-[var(--foreground)]">Choose a report</span>
        <select
          value={active}
          onChange={(event) => router.push(hrefFor(event.target.value as ExperimentalModuleSlug))}
          className="min-h-11 w-full min-w-0 touch-manipulation rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-base font-semibold text-[var(--foreground)] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
        >
          {experimentalModuleLinks.map((item) => <option key={item.slug} value={item.slug}>{item.label}</option>)}
        </select>
      </label>
      <p className="text-sm leading-6 text-[var(--foreground-muted)]">Switch reports here. Your active filters stay in the page link when you move between reports.</p>
    </nav>
  );
}
