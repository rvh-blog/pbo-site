import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { createAdminPoll, endAdminPoll, getAdminPoll, saveAdminPoll } from "@/lib/polls";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const poll = await getAdminPoll();
  return NextResponse.json({ poll });
}

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const action = String(body?.action ?? "update");

    if (action === "end") {
      await endAdminPoll(null);
    } else if (action === "create") {
      await createAdminPoll({
        question: String(body?.question ?? ""),
        options: Array.isArray(body?.options) ? body.options.map(String) : [],
        isActive: Boolean(body?.isActive ?? true),
      });
    } else {
      await saveAdminPoll({
        question: String(body?.question ?? ""),
        options: Array.isArray(body?.options) ? body.options.map(String) : [],
        isActive: Boolean(body?.isActive),
      });
    }

    const poll = await getAdminPoll();
    return NextResponse.json({ poll });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save poll" },
      { status: 400 }
    );
  }
}
