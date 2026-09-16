import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSiteFeatureSettings } from "@/lib/site-settings";
import { SpeedToursClient } from "./speed-tours-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Speed Tours",
  description: "Timed off-season Pokémon drafting events.",
};

export default async function SpeedToursPage({ searchParams }: { searchParams: Promise<{ past?: string }> }) {
  const settings = await getSiteFeatureSettings();
  if (!settings.speedToursEnabled) notFound();
  const params = await searchParams;
  return <SpeedToursClient showPast={params.past === "true"} />;
}
