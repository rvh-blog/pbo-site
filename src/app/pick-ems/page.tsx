import { db } from "@/lib/db";
import { seasons, coaches, seasonCoaches } from "@/lib/schema";
import { eq, desc } from "drizzle-orm";
import { PickEmsClient } from "./pick-ems-client";

export const dynamic = "force-dynamic";

export interface CoachOption {
  id: number;
  name: string;
  teamName: string | null;
  teamLogoUrl: string | null;
  divisionName: string | null;
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

async function getCoachesForSeason(seasonId: number): Promise<CoachOption[]> {
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

  // Filter to just this season's coaches
  const filtered = seasonCoachesList.filter(
    (sc) => sc.division?.season?.id === seasonId
  );

  // Dedupe by coachId (a coach might be in multiple divisions)
  const coachMap = new Map<number, CoachOption>();
  for (const sc of filtered) {
    if (!coachMap.has(sc.coachId)) {
      coachMap.set(sc.coachId, {
        id: sc.coachId,
        name: sc.coach?.name || "Unknown",
        teamName: sc.teamName,
        teamLogoUrl: sc.teamLogoUrl,
        divisionName: sc.division?.name || null,
      });
    }
  }

  return Array.from(coachMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

export default async function PickEmsPage() {
  const season = await getActiveSeason();

  if (!season) {
    return (
      <div className="poke-card p-8 text-center">
        <p className="text-[var(--foreground-muted)]">
          No active season found.
        </p>
      </div>
    );
  }

  const coachOptions = await getCoachesForSeason(season.id);

  return (
    <PickEmsClient
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
