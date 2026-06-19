/**
 * PBO Wake Worker
 * /wake command that pings the site and updates when bot is online
 */

const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
};

const InteractionResponseType = {
  PONG: 1,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
};

interface Env {
  DISCORD_PUBLIC_KEY: string;
}

const SITE_URL = "https://pokemonbattle.org";
const DISCORD_API = "https://discord.com/api/v10";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("PBO Wake Bot - Use /wake in Discord", { status: 200 });
    }

    const signature = request.headers.get("X-Signature-Ed25519");
    const timestamp = request.headers.get("X-Signature-Timestamp");
    const body = await request.text();

    if (!signature || !timestamp) {
      return new Response("Missing signature", { status: 401 });
    }

    const isValid = await verifyDiscordSignature(body, signature, timestamp, env.DISCORD_PUBLIC_KEY);
    if (!isValid) {
      return new Response("Invalid signature", { status: 401 });
    }

    const interaction = JSON.parse(body);

    // Handle Discord PING (endpoint verification)
    if (interaction.type === InteractionType.PING) {
      return jsonResponse({ type: InteractionResponseType.PONG });
    }

    // Handle /wake command
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      // Start the wake process in the background
      ctx.waitUntil(wakeAndUpdate(interaction.application_id, interaction.token));

      // Return deferred response (shows "thinking..." spinner)
      return jsonResponse({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        data: { flags: 64 }, // Ephemeral
      });
    }

    return new Response("Unknown interaction type", { status: 400 });
  },
} satisfies ExportedHandler<Env>;

async function wakeAndUpdate(appId: string, token: string): Promise<void> {
  const maxAttempts = 20;
  const delayMs = 1000;
  let attempts = 0;

  // Keep pinging until site responds or we timeout
  while (attempts < maxAttempts) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${SITE_URL}/api/health`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        // Site is up! Update the message
        await editReply(appId, token, "**PBO Bot is now online!**");
        return;
      }
    } catch {
      // Site not responding yet, keep trying
    }

    attempts++;
    await sleep(delayMs);
  }

  // Timed out
  await editReply(appId, token, "**Wake timed out.** The bot may still be starting - try your command in a moment.");
}

async function editReply(appId: string, token: string, content: string): Promise<void> {
  const url = `${DISCORD_API}/webhooks/${appId}/${token}/messages/@original`;

  await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}

async function verifyDiscordSignature(
  body: string,
  signature: string,
  timestamp: string,
  publicKey: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const messageData = encoder.encode(timestamp + body);
    const keyData = hexToUint8Array(publicKey);

    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "Ed25519", namedCurve: "Ed25519" },
      false,
      ["verify"]
    );

    const signatureData = hexToUint8Array(signature);
    return await crypto.subtle.verify("Ed25519", key, signatureData, messageData);
  } catch {
    return false;
  }
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
