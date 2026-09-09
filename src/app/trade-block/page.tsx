import type { Metadata } from "next";
import { LeagueLink as Link } from "@/components/league-context";
import { db } from "@/lib/db";
import { divisions, seasonCoaches, seasons } from "@/lib/schema";
import { desc, eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trade Block",
  description: "Browse Pokémon that PBO teams are open to trading.",
  alternates: { canonical: "/trade-block" },
};

type Listing = {
  id: string;
  teamName: string;
  coachName: string;
  coachId: number | null;
  divisionName: string;
  logoUrl: string | null;
  offered: string[];
  seeking: string;
  note: string;
  demo: boolean;
};

const fallbackListings: Listing[] = [
  {
    id: "demo-northstar",
    teamName: "Northstar",
    coachName: "Demo listing",
    coachId: null,
    divisionName: "Demo Division",
    logoUrl: null,
    offered: ["Rotom-Wash", "Skarmory"],
    seeking: "Open to offers",
    note: "Example listing shown while teams set up their trade blocks.",
    demo: true,
  },
  {
    id: "demo-nightfall",
    teamName: "Nightfall",
    coachName: "Demo listing",
    coachId: null,
    divisionName: "Demo Division",
    logoUrl: null,
    offered: ["Gholdengo"],
    seeking: "A reliable defensive pivot",
    note: "Example listing shown while teams set up their trade blocks.",
    demo: true,
  },
];

async function getListings(): Promise<{ seasonName: string; listings: Listing[]; usingDemoData: boolean }> {
  const season = await db.query.seasons.findFirst({
    columns: { id: true, name: true },
    where: eq(seasons.isCurrent, true),
  }) ?? await db.query.seasons.findFirst({
    columns: { id: true, name: true },
    orderBy: desc(seasons.seasonNumber),
  });

  if (!season) {
    return { seasonName: "Current season", listings: fallbackListings, usingDemoData: true };
  }

  const divisionRows = await db.query.divisions.findMany({
    columns: { id: true, name: true },
    where: eq(divisions.seasonId, season.id),
  });
  const divisionIds = divisionRows.map((division) => division.id);
  if (divisionIds.length === 0) {
    return { seasonName: season.name, listings: fallbackListings, usingDemoData: true };
  }

  const teams = await db.query.seasonCoaches.findMany({
    columns: { id: true, coachId: true, teamName: true, teamLogoUrl: true, isActive: true, divisionId: true },
    where: inArray(seasonCoaches.divisionId, divisionIds),
    with: {
      coach: { columns: { name: true } },
      rosters: {
        columns: { pokemonId: true },
        with: { pokemon: { columns: { displayName: true, name: true } } },
      },
    },
  });

  const divisionById = new Map(divisionRows.map((division) => [division.id, division.name]));
  const listings = teams
    .filter((team) => team.isActive !== false && team.rosters.length > 0)
    .flatMap((team) => {
      const offered = team.rosters
        .map((roster) => roster.pokemon?.displayName || roster.pokemon?.name || "Unknown Pokémon")
        .slice(0, 2);
      if (offered.length === 0) return [];
      return [{
        id: `roster-${team.id}`,
        teamName: team.teamName,
        coachName: team.coach?.name || "PBO coach",
        coachId: team.coachId,
        divisionName: divisionById.get(team.divisionId) || "Current division",
        logoUrl: team.teamLogoUrl,
        offered,
        seeking: "Open to offers",
        note: "Sample listing generated from this team’s current roster for the local preview.",
        demo: true,
      } satisfies Listing];
    })
    .slice(0, 12);

  return {
    seasonName: season.name,
    listings: listings.length > 0 ? listings : fallbackListings,
    usingDemoData: listings.length === 0 || listings.some((listing) => listing.demo),
  };
}

export default async function TradeBlockPage() {
  const { seasonName, listings, usingDemoData } = await getListings();

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="poke-card overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-lg border border-yellow-300/30 bg-yellow-300/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-yellow-200">
              <span aria-hidden="true">⇄</span>
              League marketplace
            </div>
            <h1 className="font-pixel text-3xl text-white sm:text-4xl">Trade Block</h1>
            <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)] sm:text-base">
              See which Pokémon teams may be willing to move, then start a conversation before a formal P2P trade is recorded.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--background-primary)]/60 px-4 py-3 text-sm text-[var(--foreground-muted)]">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--foreground-subtle)]">Viewing</div>
            <div className="mt-1 font-bold text-white">{seasonName}</div>
          </div>
        </div>
      </section>

      {usingDemoData && (
        <section className="rounded-xl border border-yellow-300/30 bg-yellow-300/10 px-4 py-3 text-sm leading-6 text-yellow-100" role="status">
          <strong>Preview mode:</strong> these are sample listings based on available roster data. They are not active trade commitments and do not change any rosters.
        </section>
      )}

      <section className="space-y-4" aria-labelledby="active-listings-heading">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="active-listings-heading" className="text-xl font-bold text-white">Active listings</h2>
            <p className="mt-1 text-sm text-[var(--foreground-muted)]">{listings.length} teams currently shown</p>
          </div>
          <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-200">Open to offers</span>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {listings.map((listing) => (
            <article key={listing.id} className="poke-card flex min-h-[260px] flex-col p-5 transition-transform hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-yellow-300/30 bg-yellow-300/10 text-lg font-black text-yellow-200" aria-hidden="true">
                    {listing.teamName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-white">{listing.teamName}</h3>
                    <p className="truncate text-xs text-[var(--foreground-muted)]">{listing.coachName} · {listing.divisionName}</p>
                  </div>
                </div>
                <span className="shrink-0 rounded-md bg-[var(--background-tertiary)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--foreground-subtle)]">Preview</span>
              </div>

              <div className="mt-5">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--foreground-subtle)]">Offering</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {listing.offered.map((name) => (
                    <span key={name} className="rounded-lg border border-blue-300/30 bg-blue-300/10 px-3 py-2 text-sm font-bold text-blue-100">{name}</span>
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--background-primary)]/60 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--foreground-subtle)]">Looking for</div>
                <div className="mt-1 text-sm font-bold text-white">{listing.seeking}</div>
              </div>

              <p className="mt-auto pt-4 text-xs leading-5 text-[var(--foreground-muted)]">{listing.note}</p>
              {listing.coachId ? (
                <Link href={`/coaches/${listing.coachId}`} className="mt-4 inline-flex items-center justify-center rounded-lg border border-yellow-300/40 px-3 py-2 text-xs font-bold uppercase tracking-wider text-yellow-200 transition-colors hover:bg-yellow-300/10">View coach profile →</Link>
              ) : (
                <span className="mt-4 inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold uppercase tracking-wider text-[var(--foreground-subtle)]">Offers coming soon</span>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="poke-card border-dashed p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-white">Want to list a Pokémon?</h2>
            <p className="mt-1 text-sm text-[var(--foreground-muted)]">Coach-submitted listings and offer requests will be connected to the audited P2P trade workflow in a later step.</p>
          </div>
          <span className="shrink-0 rounded-lg bg-yellow-300 px-4 py-2 text-center text-xs font-black uppercase tracking-wider text-slate-950">Coming soon</span>
        </div>
      </section>
    </main>
  );
}
