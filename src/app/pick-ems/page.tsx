import { db } from "@/lib/db";
import type { Metadata } from "next";
import { seasons, seasonCoaches } from "@/lib/schema";
import { eq, desc, and } from "drizzle-orm";
import { positiveId } from "@/lib/league-context";
import { PickEmsClient } from "./pick-ems-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Pick-Ems",
  description: "Make weekly PBO match predictions and follow the community pick-em standings.",
  alternates: { canonical: "/pick-ems" },
};

export interface CoachOption {
  id: number;
  name: string;
  teamName: string | null;
  teamLogoUrl: string | null;
  divisionName: string | null;
}

interface SeasonCoachOption extends CoachOption {
  seasonId: number | null;
}

async function getActiveSeason() {
  // Fetch both in parallel, prefer current season if it exists
  const [currentSeason, latestSeason] = await Promise.all([
    db.query.seasons.findFirst({
      where: eq(seasons.isCurrent, true),
    }),
    db.query.seasons.findFirst({
      orderBy: [desc(seasons.seasonNumber)],
    }),
  ]);

  return currentSeason || latestSeason;
}

async function getActiveCoachOptions(): Promise<SeasonCoachOption[]> {
  // Get all season coaches for this season
  const seasonCoachesList = await db.query.seasonCoaches.findMany({
    where: eq(seasonCoaches.isActive, true),
    with: {
      coach: true,
      division: {
        with: {
          season: true,
        },
      },
    },
  });

  return seasonCoachesList.map((sc) => ({
    id: sc.coachId,
    name: sc.coach?.name || "Unknown",
    teamName: sc.teamName,
    teamLogoUrl: sc.teamLogoUrl,
    divisionName: sc.division?.name || null,
    seasonId: sc.division?.season?.id ?? null,
  })).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

export default async function PickEmsPage({ searchParams }: { searchParams: Promise<{ seasonId?: string; divisionId?: string; week?: string }> }) {
  const params = await searchParams;
  const [season, allCoachOptions] = await Promise.all([
    positiveId(params.seasonId) ? db.query.seasons.findFirst({
      where: and(eq(seasons.id, positiveId(params.seasonId)!), eq(seasons.isPublic, true)),
    }) : getActiveSeason(),
    getActiveCoachOptions(),
  ]);

  if (!season) {
    return (
      <div className="poke-card p-8 text-center">
        <p className="text-[var(--foreground-muted)]">
          No active season found.
        </p>
      </div>
    );
  }

  const coachMap = new Map<number, CoachOption>();
  for (const { seasonId, ...coach } of allCoachOptions) {
    if (seasonId === season.id && !coachMap.has(coach.id)) {
      coachMap.set(coach.id, coach);
    }
  }
  const coachOptions = Array.from(coachMap.values());

  return (
    <PickEmsClient
      key={season.id}
      initialWeek={positiveId(params.week)}
      initialDivision={positiveId(params.divisionId)}
      season={{
        id: season.id,
        name: season.name,
        seasonNumber: season.seasonNumber,
        isSchedulePublic: season.isSchedulePublic ?? true,
      }}
      coachOptions={coachOptions}
    />
  );
}
