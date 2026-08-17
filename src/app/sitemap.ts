import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = [
    "",
    "/seasons",
    "/coaches",
    "/matchup-prep",
    "/draft-planner",
    "/analyzer",
    "/pick-ems",
    "/fantasy",
    "/blog",
    "/leaderboards",
    "/leaderboards/comprehensive",
    "/battle-record",
    "/pokemon/stats",
    "/pokemon/combinations",
    "/power-rankings",
  ];

  const [publicSeasons, publicCoaches] = await Promise.all([
    db.query.seasons.findMany({
      where: (season, { or, eq, isNull }) =>
        or(eq(season.isPublic, true), isNull(season.isPublic)),
      with: { divisions: true },
    }),
    db.query.coaches.findMany({ columns: { id: true } }),
  ]);

  const entries: MetadataRoute.Sitemap = staticRoutes.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: path === "" ? "daily" : "weekly",
    priority: path === "" ? 1 : 0.7,
  }));

  for (const season of publicSeasons) {
    entries.push({
      url: `${SITE_URL}/seasons/${season.id}`,
      changeFrequency: season.isCurrent ? "daily" : "monthly",
      priority: season.isCurrent ? 0.9 : 0.6,
    });
    entries.push({
      url: `${SITE_URL}/seasons/${season.id}/draft`,
      changeFrequency: season.isCurrent ? "daily" : "monthly",
      priority: 0.6,
    });
    for (const division of season.divisions) {
      entries.push({
        url: `${SITE_URL}/seasons/${season.id}/divisions/${division.id}`,
        changeFrequency: season.isCurrent ? "daily" : "monthly",
        priority: season.isCurrent ? 0.9 : 0.6,
      });
    }
  }

  for (const coach of publicCoaches) {
    entries.push({
      url: `${SITE_URL}/coaches/${coach.id}`,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }

  return entries;
}
