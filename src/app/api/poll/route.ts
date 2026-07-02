import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActivePoll, voteInPoll } from "@/lib/polls";

export async function GET() {
  try {
    const session = await getSession();
    const poll = await getActivePoll(session);
    return NextResponse.json({ poll });
  } catch (error) {
    console.error("Error fetching poll:", error);
    return NextResponse.json({ error: "Failed to fetch poll" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.type !== "coach") {
      return NextResponse.json({ error: "Coach login required" }, { status: 401 });
    }

    const body = await request.json();
    const pollId = Number(body?.pollId);
    const optionIndex = Number(body?.optionIndex);

    if (!Number.isInteger(pollId) || !Number.isInteger(optionIndex)) {
      return NextResponse.json({ error: "Invalid vote payload" }, { status: 400 });
    }

    await voteInPoll(pollId, session.id, optionIndex);
    const poll = await getActivePoll(session);
    return NextResponse.json({ poll });
  } catch (error) {
    console.error("Error submitting poll vote:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit vote" },
      { status: 400 }
    );
  }
}
