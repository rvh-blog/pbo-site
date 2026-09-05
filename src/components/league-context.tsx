"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore, type ComponentProps } from "react";
import { leagueHref, type LeagueContext } from "@/lib/league-context";

const key = "pbo-league-context-v1";
let snapshot = "{}";
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  try { snapshot = sessionStorage.getItem(key) || "{}"; } catch { /* Storage is optional. */ }
  listener();
  return () => { listeners.delete(listener); };
}
function getSnapshot() { return snapshot; }
function getServerSnapshot() { return "{}"; }
export function rememberLeagueContext(context: LeagueContext) {
  snapshot = JSON.stringify(context);
  try { sessionStorage.setItem(key, snapshot); } catch { /* Keep in-memory navigation working. */ }
  listeners.forEach((listener) => listener());
}
export function useLeagueContext(): LeagueContext {
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as LeagueContext : {};
  } catch { return {}; }
}

export function LeagueLink({ href, ...props }: ComponentProps<typeof Link>) {
  const context = useLeagueContext();
  return <Link {...props} href={typeof href === "string" ? leagueHref(href, context) : href} />;
}

/** Pages publish validated selections; sibling links retain the current browsing scope. */
export function LeagueJourney({ context: selection }: { context: LeagueContext }) {
  const saved = useLeagueContext();
  const context = saved.seasonId === selection.seasonId && saved.divisionId === selection.divisionId
    ? { ...saved, ...selection } : selection;
  const serialized = JSON.stringify(context);
  useEffect(() => {
    rememberLeagueContext(JSON.parse(serialized) as LeagueContext);
  }, [serialized]);
  if (!context.seasonId || !context.divisionId) return null;
  const division = `/seasons/${context.seasonId}/divisions/${context.divisionId}`;
  const links = [
    { href: `${division}#standings`, label: "Standings" },
    { href: `${division}#schedule`, label: "Schedule" },
    { href: `${division}/rosters`, label: "Rosters" },
    { href: "/matchup-prep", label: "Scout opponent" },
    { href: "/compare", label: "Compare coaches" },
    { href: "/leaderboards/items", label: "Item stats" },
  ];
  return (
    <nav aria-label="Continue exploring this division" className="rounded-xl border border-[var(--card-border)] bg-[var(--background-secondary)] p-3 sm:p-4">
      <p className="mb-2 text-sm text-[var(--foreground-muted)]">
        {context.seasonName || `Season ${context.seasonId}`} · {context.divisionName || "Selected division"}
        {context.week ? ` · ${context.week > 100 ? ["Quarterfinals", "Semifinals", "Finals"][context.week - 101] || "Playoffs" : `Week ${context.week}`}` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {links.map((link) => <Link key={link.label} href={leagueHref(link.href, context)}
          className="inline-flex min-h-11 items-center rounded-lg border border-[var(--card-border)] px-3 text-sm font-semibold hover:bg-[var(--background-tertiary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]">
          {link.label}
        </Link>)}
      </div>
    </nav>
  );
}
