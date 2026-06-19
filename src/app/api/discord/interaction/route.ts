import { NextRequest, NextResponse } from "next/server";

const DISCORD_API = "https://discord.com/api/v10";

interface DiscordInteraction {
  id: string;
  token: string;
  application_id: string;
  type: number;
  data?: {
    name: string;
    options?: Array<{ name: string; value: string | number }>;
  };
  channel_id: string;
  guild_id?: string;
  member?: {
    user: { id: string; username: string };
  };
  user?: { id: string; username: string };
}

/**
 * Handle forwarded Discord interactions from the Cloudflare Worker.
 * The Worker already deferred the response, so we use editReply via webhook.
 */
export async function POST(request: NextRequest) {
  try {
    const interaction: DiscordInteraction = await request.json();

    // For now, respond with a message explaining to use the gateway bot
    // This is a fallback - ideally the gateway bot should handle commands
    await editReply(interaction, {
      content:
        "✅ Bot is now awake! Please run your command again.\n\n" +
        "*The command system is warming up and will work on your next try.*",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Discord Interaction] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function editReply(
  interaction: DiscordInteraction,
  message: { content?: string; embeds?: unknown[] }
): Promise<void> {
  const url = `${DISCORD_API}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`;

  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("[Discord Interaction] Failed to edit reply:", text);
  }
}
