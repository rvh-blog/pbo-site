import Link from "next/link";
import { notFound } from "next/navigation";
import { ExperimentalStatsClient, type ExperimentalClientModule } from "../experimental-stats-client";
import { ExperimentalModuleNav } from "../experimental-module-nav";
import { getExperimentalStatsPageData, type ExperimentalModuleSlug } from "@/lib/experimental-stats-data";

export const dynamic = "force-dynamic";

const moduleCopy: Record<ExperimentalModuleSlug, { title: string; description: string; clientModule: ExperimentalClientModule }> = {
  pokemon: { title: "Pokémon Profiles", description: "Qualified percentile reports, totals, rates, move usage, item reveals, and recent match evidence.", clientModule: "pokemon" },
  coaches: { title: "Coach Profiles", description: "Observed replay tendencies and usage patterns without assigning strategic intent.", clientModule: "coaches" },
  compare: { title: "Compare", description: "Place two qualified Pokémon under the same replay filters and compare their output directly.", clientModule: "compare" },
  trends: { title: "Rolling Trends", description: "Compare a Pokémon's latest five appearances with the immediately preceding five.", clientModule: "rolling" },
  leaderboards: { title: "Custom Leaderboards", description: "Build filtered Pokémon or coach rankings and export the visible evidence as CSV.", clientModule: "leaderboard" },
  replays: { title: "Replay Search", description: "Find qualifying battles and open the recorded match or official replay source.", clientModule: "replays" },
  "battle-visualizer": { title: "Battle Visualizer", description: "Explore saved team HP, faint timing, and explicit item-reveal timing for one battle.", clientModule: "visualizer" },
  "rare-events": { title: "Rare Event Explorer", description: "Search unusual records that can be supported by currently saved replay evidence.", clientModule: "rare" },
  glossary: { title: "Metric Glossary", description: "Definitions and storage coverage for every proposed official replay-only metric and visual.", clientModule: "glossary" },
};

export function generateStaticParams() {
  return Object.keys(moduleCopy).map((module) => ({ module }));
}

export default async function ExperimentalModulePage({ params, searchParams }: { params: Promise<{ module: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ module }, query] = await Promise.all([params, searchParams]);
  if (!(module in moduleCopy)) notFound();
  const slug = module as ExperimentalModuleSlug;
  const copy = moduleCopy[slug];
  const { dataset, filters } = await getExperimentalStatsPageData(slug, query);

  return (
    <div className="experimental-stats-readable readable-content space-y-4 sm:space-y-6">
      <header className="poke-card bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.16),transparent_45%)] p-5 sm:p-7">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-wider text-[var(--foreground-muted)] sm:text-[10px]">
          <Link href="/leaderboards" className="hover:text-[var(--primary)]">PBO Stats</Link><span>/</span><Link href="/experimental-stats" className="hover:text-[var(--primary)]">Experimental Stats</Link><span>/</span><span className="text-violet-300">{copy.title}</span>
        </div>
        <h1 className="font-pixel text-lg leading-relaxed text-white sm:text-2xl">{copy.title}</h1>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-[var(--foreground-muted)] sm:text-sm sm:leading-6">{copy.description}</p>
      </header>
      <ExperimentalModuleNav active={slug} />
      <ExperimentalStatsClient dataset={dataset} initialModule={copy.clientModule} initialFilters={filters} standalone />
    </div>
  );
}
