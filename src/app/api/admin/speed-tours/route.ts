import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import {
  createSpeedTour,
  createSpeedTourBracket,
  endSpeedTour,
  forceAdvanceSpeedTour,
  forceNextSpeedTourRound,
  getSpeedTourAdminData,
  removeSpeedTourParticipant,
  startSpeedTourRound,
  updateSpeedTourBracketMatch,
} from "@/lib/speed-tours";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await getSpeedTourAdminData(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load Speed Tours" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    switch (body.action) {
      case "create": {
        const tour = await createSpeedTour({
          name: String(body.name || ""),
          priceSeasonId: Number(body.priceSeasonId),
        });
        return NextResponse.json({ success: true, tour });
      }
      case "start-round":
        await startSpeedTourRound(Number(body.tourId), body.criteria ?? null);
        return NextResponse.json({ success: true });
      case "create-bracket":
        await createSpeedTourBracket(Number(body.tourId), body.format === "double" ? "double" : "single");
        return NextResponse.json({ success: true });
      case "force-advance":
        await forceAdvanceSpeedTour(Number(body.tourId));
        return NextResponse.json({ success: true });
      case "force-next-round":
        await forceNextSpeedTourRound(Number(body.tourId));
        return NextResponse.json({ success: true });
      case "remove-participant":
        await removeSpeedTourParticipant(Number(body.tourId), Number(body.participantId));
        return NextResponse.json({ success: true });
      case "end-tour":
        await endSpeedTour(Number(body.tourId));
        return NextResponse.json({ success: true });
      case "bracket-result":
        await updateSpeedTourBracketMatch({
          matchId: Number(body.matchId),
          winnerParticipantId: Number(body.winnerParticipantId),
          scoreOne: Number(body.scoreOne),
          scoreTwo: Number(body.scoreTwo),
          gameReport: String(body.gameReport || ""),
        });
        return NextResponse.json({ success: true });
      default:
        return NextResponse.json({ error: "Unknown Speed Tour admin action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update Speed Tour" }, { status: 400 });
  }
}
