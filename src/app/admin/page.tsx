import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { db } from "@/lib/db";
import { seasons } from "@/lib/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

async function getCurrentSeason() {
  return await db.query.seasons.findFirst({
    where: eq(seasons.isCurrent, true),
    with: { divisions: true },
  });
}

const season11Checklist = [
  {
    title: "League Setup",
    items: [
      "Create the Season 11 record and divisions.",
      "Add teams as season coaches using the correct persistent coach account.",
      "Confirm team names, abbreviations, logos, divisions, and replacement links.",
      "Confirm Season 11 is marked current only when launch data is ready.",
    ],
  },
  {
    title: "ELO",
    items: [
      "Verify dynamic placement ELO for each Season 11 division.",
      "Exclude new placements from each division average.",
      "Spot-check average minus 100, rounded to the nearest 25.",
      "Run a full ELO recalculation on a copied database before production recalculation.",
    ],
  },
  {
    title: "Draft And Rosters",
    items: [
      "Import Season 11 Pokemon prices, bans, tera bans, and tera captain costs.",
      "Create initial rosters using Season 11 season_coaches IDs.",
      "Check roster limits, remaining budget, and tera captains.",
      "Confirm free agent pools are division-specific.",
    ],
  },
  {
    title: "Schedule And Results",
    items: [
      "Import Season 11 schedule with correct season, division, and season coach IDs.",
      "Check week numbers, dates, playoff weeks, and Game of the Week flags.",
      "Test replay parser and match report output on a Season 11 match.",
      "Confirm turns logic and updated report format apply only Season 11 onward.",
    ],
  },
  {
    title: "Betting And Pick-Ems",
    items: [
      "Confirm Season 11 pick-em participants and settings.",
      "Verify winner, kill, and death betting use Season 11 matches and rosters.",
      "Test one local match result settlement for bets, coins, and pick-em rewards.",
    ],
  },
  {
    title: "Blog And Admin Access",
    items: [
      "Grant blog posting permission only to approved coaches.",
      "Confirm admins can publish posts with images.",
      "Confirm approved coaches can publish text posts only.",
      "Confirm signed-in users can comment and reply, and admins can delete comments.",
    ],
  },
  {
    title: "Pre-Launch Verification",
    items: [
      "Run TypeScript, targeted ESLint, and production build.",
      "Back up production DB before imports, migrations, or recalculations.",
      "Browse Season 11 public pages and admin pages after deploy.",
      "Check /api/health, blog, divisions, rosters, schedule, and admin matches.",
    ],
  },
];

export default async function AdminDashboard() {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    redirect("/admin/login");
  }

  const currentSeason = await getCurrentSeason();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-[var(--foreground-muted)]">
          Manage your Pokemon Battle Organization
        </p>
      </div>

      {/* Current Season Status */}
      <Card>
        <CardContent className="py-4">
          {currentSeason ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full bg-[var(--success)] animate-pulse" />
                <div>
                  <p className="font-semibold">{currentSeason.name}</p>
                  <p className="text-sm text-[var(--foreground-muted)]">
                    {currentSeason.divisions.length} divisions &middot; Budget: {currentSeason.draftBudget} pts
                  </p>
                </div>
              </div>
              <Link href="/admin/seasons">
                <Button variant="outline" size="sm">Manage</Button>
              </Link>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full bg-[var(--foreground-muted)]" />
                <p className="text-[var(--foreground-muted)]">No active season</p>
              </div>
              <Link href="/admin/seasons">
                <Button size="sm">Create Season</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Season Setup Workflow */}
      <Card>
        <CardHeader>
          <CardTitle>Season Setup</CardTitle>
          <p className="text-sm text-[var(--foreground-muted)]">
            Follow these steps when setting up a new season
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Link href="/admin/seasons" className="block">
            <div className="p-4 rounded-lg border border-[var(--background-tertiary)] hover:border-[var(--primary)] hover:bg-[var(--background-secondary)] transition-colors">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-[var(--primary)] text-white flex items-center justify-center font-bold shrink-0">1</div>
                <div>
                  <p className="font-semibold">Seasons</p>
                  <p className="text-sm text-[var(--foreground-muted)]">
                    Create a new season, add divisions (Stargazer, Sunset, etc.), and set the draft budget. Mark as current when ready to go live.
                  </p>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/admin/coaches" className="block">
            <div className="p-4 rounded-lg border border-[var(--background-tertiary)] hover:border-[var(--primary)] hover:bg-[var(--background-secondary)] transition-colors">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-[var(--primary)] text-white flex items-center justify-center font-bold shrink-0">2</div>
                <div>
                  <p className="font-semibold">Coaches</p>
                  <p className="text-sm text-[var(--foreground-muted)]">
                    Add coach profiles. Coaches persist across seasons - you only need to add new participants.
                  </p>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/admin/rosters" className="block">
            <div className="p-4 rounded-lg border border-[var(--background-tertiary)] hover:border-[var(--primary)] hover:bg-[var(--background-secondary)] transition-colors">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-[var(--primary)] text-white flex items-center justify-center font-bold shrink-0">3</div>
                <div>
                  <p className="font-semibold">Rosters</p>
                  <p className="text-sm text-[var(--foreground-muted)]">
                    Assign coaches to divisions, set team names/logos, and add their drafted Pokemon and tera captain.
                  </p>
                </div>
              </div>
            </div>
          </Link>
        </CardContent>
      </Card>

      {/* During the Season */}
      <Card>
        <CardHeader>
          <CardTitle>During the Season</CardTitle>
          <p className="text-sm text-[var(--foreground-muted)]">
            Weekly tasks while the season is running
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Link href="/admin/matches" className="block">
            <div className="p-4 rounded-lg border border-[var(--background-tertiary)] hover:border-[var(--primary)] hover:bg-[var(--background-secondary)] transition-colors">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-[var(--secondary)] text-white flex items-center justify-center font-bold shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold">Matches</p>
                  <p className="text-sm text-[var(--foreground-muted)]">
                    Enter match results including scores and replay URLs. Use &quot;Scrape Replay&quot; to auto-import Pokemon kills/deaths from Showdown replays. Manage playoffs brackets here too.
                  </p>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/admin/transactions" className="block">
            <div className="p-4 rounded-lg border border-[var(--background-tertiary)] hover:border-[var(--primary)] hover:bg-[var(--background-secondary)] transition-colors">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-[var(--secondary)] text-white flex items-center justify-center font-bold shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold">Transactions</p>
                  <p className="text-sm text-[var(--foreground-muted)]">
                    Record mid-season roster changes: free agent pickups/drops, player-to-player trades, and tera captain swaps.
                  </p>
                </div>
              </div>
            </div>
          </Link>
        </CardContent>
      </Card>

      {/* Utilities */}
      <Card>
        <CardHeader>
          <CardTitle>Utilities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg border border-[var(--background-tertiary)]">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-[var(--accent)] text-white flex items-center justify-center font-bold shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <div>
                <p className="font-semibold">Recalculate ELO</p>
                <p className="text-sm text-[var(--foreground-muted)] mb-3">
                  Rebuilds all coach ELO ratings from match history. Use this after bulk importing data or if ratings seem incorrect. Found on the Coaches page.
                </p>
                <Link href="/admin/coaches">
                  <Button variant="outline" size="sm">Go to Coaches</Button>
                </Link>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-lg border border-[var(--background-tertiary)]">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-[var(--accent)] text-white flex items-center justify-center font-bold shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="font-semibold">Season 11 Launch Checklist</p>
                    <p className="text-sm text-[var(--foreground-muted)]">
                      Use this as the admin pre-launch pass before Season 11 data goes live.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href="/admin/seasons">
                      <Button variant="outline" size="sm">Seasons</Button>
                    </Link>
                    <Link href="/admin/rosters">
                      <Button variant="outline" size="sm">Rosters</Button>
                    </Link>
                    <Link href="/admin/matches">
                      <Button variant="outline" size="sm">Matches</Button>
                    </Link>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {season11Checklist.map((section) => (
                    <div
                      key={section.title}
                      className="rounded-lg bg-[var(--background-secondary)] p-3"
                    >
                      <p className="text-sm font-semibold text-white">{section.title}</p>
                      <div className="mt-3 space-y-2">
                        {section.items.map((item) => (
                          <label key={item} className="flex items-start gap-2 text-sm text-[var(--foreground-muted)]">
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 rounded border-[var(--background-tertiary)] accent-[var(--primary)]"
                            />
                            <span>{item}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
