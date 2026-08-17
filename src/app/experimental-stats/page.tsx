import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  FlaskConical,
  GitCompareArrows,
  LineChart,
  ListFilter,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { matches } from "@/lib/schema";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Experimental Stats",
  description: "Replay-evidence analytics, percentile reports, rolling trends, and custom PBO leaderboards.",
};

const modules = [
  { href: "/experimental-stats/pokemon", title: "Pokémon Profiles", description: "Qualified percentiles, season totals, per-appearance rates, recent matches, moves, items, and survival.", icon: Sparkles, accent: "from-violet-500/25 to-fuchsia-500/5", color: "text-violet-300" },
  { href: "/experimental-stats/coaches", title: "Coach Profiles", description: "Observed usage, replay tendencies, damage composition, healing, items, setup, and favorable events.", icon: Users, accent: "from-cyan-500/20 to-blue-500/5", color: "text-cyan-300" },
  { href: "/experimental-stats/compare", title: "Compare", description: "Compare two Pokémon under the exact same filters using side-by-side metric bars.", icon: GitCompareArrows, accent: "from-fuchsia-500/20 to-cyan-500/5", color: "text-fuchsia-300" },
  { href: "/experimental-stats/trends", title: "Rolling Trends", description: "Latest five appearances against the immediately preceding five, with sample warnings.", icon: LineChart, accent: "from-emerald-500/20 to-teal-500/5", color: "text-emerald-300" },
  { href: "/experimental-stats/leaderboards", title: "Custom Leaderboards", description: "Pokémon or coach rankings, totals or rates, shared filters, and downloadable CSV output.", icon: ListFilter, accent: "from-amber-500/20 to-orange-500/5", color: "text-amber-300" },
  { href: "/experimental-stats/replays", title: "Replay Search", description: "Find qualifying matches and jump directly to the match page or official replay evidence.", icon: Search, accent: "from-blue-500/20 to-indigo-500/5", color: "text-blue-300" },
  { href: "/experimental-stats/battle-visualizer", title: "Battle Visualizer", description: "Explore saved team HP, faint order, replay length, and explicit held-item reveal timing.", icon: BarChart3, accent: "from-red-500/20 to-pink-500/5", color: "text-red-300" },
  { href: "/experimental-stats/rare-events", title: "Rare Event Explorer", description: "Evidence-linked records for long battles, late reveals, distinct moves, damage, healing, and faints.", icon: FlaskConical, accent: "from-purple-500/20 to-violet-500/5", color: "text-purple-300" },
  { href: "/experimental-stats/glossary", title: "Metric Glossary", description: "Definitions and coverage status for every proposed official replay-only statistic and visual.", icon: BookOpen, accent: "from-slate-500/20 to-slate-500/5", color: "text-slate-300" },
];

export default async function ExperimentalStatsPage() {
  const replayRows = await db.query.matches.findMany({
    where: isNotNull(matches.replayUrl),
    columns: { id: true, seasonId: true, turnSnapshots: true },
  });
  const seasonCount = new Set(replayRows.map((match) => match.seasonId)).size;
  const timelineCount = replayRows.filter((match) => match.turnSnapshots).length;

  return (
    <div className="experimental-stats-readable readable-content space-y-6">
      <header className="poke-card overflow-hidden p-0">
        <div className="relative overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.28),transparent_38%),linear-gradient(135deg,rgba(14,165,233,0.12),transparent_55%)] p-6 sm:p-8 lg:p-10">
          <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full border-[24px] border-violet-400/5" />
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-400/40 bg-violet-500/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-violet-200 sm:text-[10px]">
                <FlaskConical className="h-3.5 w-3.5" /> Replay evidence lab
              </div>
              <h1 className="font-pixel text-xl leading-relaxed text-white sm:text-2xl lg:text-3xl">Experimental Stats</h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-[var(--foreground-muted)] sm:text-base">
                A Savant-style home for official PBO replay analytics. Choose one focused report, apply the same auditable filters everywhere, and follow every unusual result back to its match evidence.
              </p>
              <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-bold text-[var(--foreground-muted)]">
                <span className="rounded-full border border-[var(--border)] bg-[var(--background)]/70 px-3 py-1.5">No inferred events</span>
                <span className="rounded-full border border-[var(--border)] bg-[var(--background)]/70 px-3 py-1.5">Qualified percentiles</span>
                <span className="rounded-full border border-[var(--border)] bg-[var(--background)]/70 px-3 py-1.5">Replay-linked records</span>
              </div>
              <Link href="/experimental-stats/pokemon?demo=1" className="btn-retro-primary mt-6 inline-flex items-center gap-2 px-4 py-3 text-[10px]"><Sparkles className="h-4 w-4" />Preview with demo stats</Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-xl border border-violet-400/20 bg-[var(--background)]/75 p-4 backdrop-blur"><div className="font-mono text-2xl font-black text-white">{replayRows.length}</div><div className="mt-1 text-[9px] font-black uppercase tracking-wider text-[var(--foreground-muted)]">Official replays</div></div>
              <div className="rounded-xl border border-cyan-400/20 bg-[var(--background)]/75 p-4 backdrop-blur"><div className="font-mono text-2xl font-black text-white">{seasonCount}</div><div className="mt-1 text-[9px] font-black uppercase tracking-wider text-[var(--foreground-muted)]">Seasons covered</div></div>
              <div className="col-span-2 rounded-xl border border-emerald-400/20 bg-[var(--background)]/75 p-4 backdrop-blur sm:col-span-1"><div className="font-mono text-2xl font-black text-white">{timelineCount}</div><div className="mt-1 text-[9px] font-black uppercase tracking-wider text-[var(--foreground-muted)]">HP timelines</div></div>
            </div>
          </div>
        </div>
      </header>

      <section>
        <div className="mb-4">
          <h2 className="font-pixel text-sm text-white">Explore the lab</h2>
          <p className="mt-2 text-xs text-[var(--foreground-muted)]">Each report loads its own data and preserves filters in the URL.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map(({ href, title, description, icon: Icon, accent, color }) => (
            <Link key={href} href={href} className={`group relative min-h-52 overflow-hidden rounded-2xl border-2 border-[var(--background-tertiary)] bg-gradient-to-br ${accent} p-5 transition duration-200 hover:-translate-y-1 hover:border-violet-400/40 hover:shadow-xl sm:p-6`}>
              <div className="flex items-start justify-between gap-4"><div className="rounded-xl border border-white/10 bg-[var(--background)]/70 p-3"><Icon className={`h-6 w-6 ${color}`} /></div><ChevronRight className="h-5 w-5 text-[var(--foreground-subtle)] transition-transform group-hover:translate-x-1 group-hover:text-white" /></div>
              <h3 className="mt-6 text-base font-black text-white">{title}</h3>
              <p className="mt-2 text-xs leading-5 text-[var(--foreground-muted)]">{description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 sm:p-5">
        <div className="flex gap-3"><BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" /><div><h2 className="text-sm font-black text-amber-100">Coverage is part of the statistic</h2><p className="mt-1 text-xs leading-5 text-amber-100/70">Older replays do not contain every saved summary field. Reports show coverage and qualification context; protocol metrics that were never stored remain in the glossary until normalized replay-event storage exists.</p></div></div>
      </section>
    </div>
  );
}
