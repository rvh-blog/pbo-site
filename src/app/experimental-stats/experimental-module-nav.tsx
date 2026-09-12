"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ExperimentalModuleSlug } from "@/lib/experimental-stats-data";

export const experimentalModuleLinks: Array<{ slug: ExperimentalModuleSlug; label: string }> = [
  { slug: "pokemon", label: "Pokémon" },
  { slug: "coaches", label: "Coaches" },
  { slug: "compare", label: "Compare" },
  { slug: "insights", label: "Insights" },
  { slug: "trends", label: "Trends" },
  { slug: "leaderboards", label: "Leaderboards" },
  { slug: "replays", label: "Replays" },
  { slug: "battle-visualizer", label: "Visualizer" },
  { slug: "rare-events", label: "Rare Events" },
  { slug: "signature-stats", label: "Signature Stats" },
  { slug: "team-stats", label: "Team Stats" },
  { slug: "top-plays", label: "Top Plays" },
  { slug: "visuals", label: "Visual Lab" },
  { slug: "glossary", label: "Glossary" },
];

export function ExperimentalModuleNav({ active }: { active: ExperimentalModuleSlug }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hrefFor = (slug: ExperimentalModuleSlug) => {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    if (slug !== "battle-visualizer") nextSearchParams.delete("match");
    const suffix = nextSearchParams.toString() ? `?${nextSearchParams.toString()}` : "";
    return `/experimental-stats/${slug}${suffix}`;
  };

  return (
    <nav aria-label="Experimental Stats modules" className="poke-card p-3">
      <label className="block md:hidden">
        <span className="mb-1.5 block text-[9px] font-black uppercase tracking-wider text-[var(--foreground-muted)]">Report</span>
        <select
          value={active}
          onChange={(event) => router.push(hrefFor(event.target.value as ExperimentalModuleSlug))}
          className="w-full min-w-0 touch-manipulation rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-3 text-sm font-black text-white outline-none focus:border-[var(--primary)]"
        >
          {experimentalModuleLinks.map((item) => <option key={item.slug} value={item.slug}>{item.label}</option>)}
        </select>
      </label>
      <div className="hidden gap-1 overflow-x-auto md:flex">
        {experimentalModuleLinks.map((item) => {
          const href = hrefFor(item.slug);
          return <Link key={item.slug} href={href} aria-current={active === item.slug ? "page" : undefined} className={`shrink-0 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wide transition-colors ${active === item.slug ? "bg-[var(--primary)] text-white" : "text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-white"}`}>{item.label}</Link>;
        })}
      </div>
      <span className="sr-only">Current path: {pathname}</span>
    </nav>
  );
}
