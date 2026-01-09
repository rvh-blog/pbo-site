import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { db } from "@/lib/db";
import { coaches, seasons, pokemon, matches } from "@/lib/schema";
import { eq, count } from "drizzle-orm";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

async function getStats() {
  const [coachCount] = await db.select({ count: count() }).from(coaches);
  const [seasonCount] = await db.select({ count: count() }).from(seasons);
  const [pokemonCount] = await db.select({ count: count() }).from(pokemon);
  const [matchCount] = await db.select({ count: count() }).from(matches);
  const currentSeason = await db.query.seasons.findFirst({
    where: eq(seasons.isCurrent, true),
  });

  return {
    coaches: coachCount.count,
    seasons: seasonCount.count,
    pokemon: pokemonCount.count,
    matches: matchCount.count,
    currentSeason,
  };
}

export default async function AdminDashboard() {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    redirect("/admin/login");
  }

  const stats = await getStats();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-[var(--foreground-muted)]">
          Manage your Pokemon Battle Organization
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-[var(--foreground-muted)]">
              Coaches
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.coaches}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-[var(--foreground-muted)]">
              Seasons
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.seasons}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-[var(--foreground-muted)]">
              Pokemon
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.pokemon}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-[var(--foreground-muted)]">
              Matches
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.matches}</p>
          </CardContent>
        </Card>
      </div>

      {/* Current Season */}
      <Card>
        <CardHeader>
          <CardTitle>Current Season</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.currentSeason ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xl font-semibold">
                  {stats.currentSeason.name}
                </p>
                <p className="text-[var(--foreground-muted)]">
                  Budget: {stats.currentSeason.draftBudget} points
                </p>
              </div>
              <Link href="/admin/seasons">
                <Button variant="outline">Manage Seasons</Button>
              </Link>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-[var(--foreground-muted)] mb-4">
                No active season. Create one to get started.
              </p>
              <Link href="/admin/seasons">
                <Button>Create Season</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Link href="/admin/coaches">
              <Button variant="outline" className="w-full">
                Add Coach
              </Button>
            </Link>
            <Link href="/admin/seasons">
              <Button variant="outline" className="w-full">
                New Season
              </Button>
            </Link>
            <Link href="/admin/pokemon">
              <Button variant="outline" className="w-full">
                Add Pokemon
              </Button>
            </Link>
            <Link href="/admin/rosters">
              <Button variant="outline" className="w-full">
                Manage Rosters
              </Button>
            </Link>
            <Link href="/admin/matches">
              <Button variant="outline" className="w-full">
                Enter Match Results
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
