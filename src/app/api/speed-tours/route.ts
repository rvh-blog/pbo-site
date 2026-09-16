import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSiteFeatureSettings } from "@/lib/site-settings";
import { getSpeedTourPublicData, submitSpeedTourChoice } from "@/lib/speed-tours";

export const dynamic = "force-dynamic";

async function speedToursEnabled() {
  const settings = await getSiteFeatureSettings();
  return settings.speedToursEnabled;
}

export async function GET(request: NextRequest) {
  if (!(await speedToursEnabled())) return NextResponse.json({ error: "Speed Tours are not enabled" }, { status: 404 });
  const session = await getSession();
  const requestedId = Number(new URL(request.url).searchParams.get("tourId"));
  const data = await getSpeedTourPublicData(Number.isInteger(requestedId) && requestedId > 0 ? requestedId : null, session?.type === "coach" ? session.id : null);
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  if (!(await speedToursEnabled())) return NextResponse.json({ error: "Speed Tours are not enabled" }, { status: 404 });
  const session = await getSession();
  if (!session || session.type !== "coach") return NextResponse.json({ error: "Coach login required" }, { status: 401 });

  try {
    const body = await request.json();
    const action = body.action === "poison" ? "poison" : "pick";
    const tourId = Number(body.tourId);
    const pokemonId = Number(body.pokemonId);
    if (!Number.isInteger(tourId) || tourId <= 0 || !Number.isInteger(pokemonId) || pokemonId <= 0) {
      return NextResponse.json({ error: "A valid tour and Pokémon are required" }, { status: 400 });
    }
    const data = await submitSpeedTourChoice({ tourId, coachId: session.id, pokemonId, action });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to submit Speed Tour choice" }, { status: 400 });
  }
}
