import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { logAdminAudit } from "@/lib/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOT_PID_FILE = process.env.DISCORD_BOT_PID_FILE || "/tmp/pbo-discord-bot.pid";

interface BotProcessStatus {
  configured: boolean;
  supervised: boolean;
  running: boolean;
  pid: number | null;
}

async function getBotProcessStatus(): Promise<BotProcessStatus> {
  const configured = Boolean(process.env.DISCORD_BOT_TOKEN);
  try {
    const value = (await readFile(BOT_PID_FILE, "utf8")).trim();
    const pid = Number(value);
    if (!Number.isInteger(pid) || pid <= 1) {
      return { configured, supervised: true, running: false, pid: null };
    }

    try {
      process.kill(pid, 0);
      return { configured, supervised: true, running: true, pid };
    } catch {
      return { configured, supervised: true, running: false, pid };
    }
  } catch {
    return { configured, supervised: false, running: false, pid: null };
  }
}

async function requireModerator(): Promise<NextResponse | null> {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Moderator access required." }, { status: 401 });
  }
  return null;
}

export async function GET(): Promise<NextResponse> {
  const denied = await requireModerator();
  if (denied) return denied;
  return NextResponse.json(await getBotProcessStatus());
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await requireModerator();
  if (denied) return denied;

  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.nextUrl.host) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const status = await getBotProcessStatus();
  if (!status.configured) {
    return NextResponse.json(
      { error: "The Discord bot token is not configured." },
      { status: 409 }
    );
  }
  if (!status.supervised || !status.pid) {
    return NextResponse.json(
      { error: "The bot supervisor is not available. Deploy the updated startup script first." },
      { status: 409 }
    );
  }
  if (!status.running) {
    return NextResponse.json(
      { error: "The bot process is not currently running. The supervisor should restart it automatically." },
      { status: 409 }
    );
  }

  const session = await getSession();
  try {
    process.kill(status.pid, "SIGTERM");
    await logAdminAudit({
      session,
      action: "restart_discord_bot",
      entityType: "discord_bot",
      entityId: status.pid,
      summary: `Requested a Discord bot restart for process ${status.pid}`,
      details: {
        previousPid: status.pid,
        channel: "admin_discord_controls",
      },
    });
    return NextResponse.json({
      success: true,
      previousPid: status.pid,
      message: "Restart requested. The bot supervisor is starting a fresh process.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown process error";
    await logAdminAudit({
      session,
      action: "restart_discord_bot",
      entityType: "discord_bot",
      entityId: status.pid,
      summary: `Discord bot restart failed for process ${status.pid}`,
      details: {
        previousPid: status.pid,
        error: message,
      },
    });
    return NextResponse.json(
      { error: `Could not restart the Discord bot: ${message}` },
      { status: 500 }
    );
  }
}
