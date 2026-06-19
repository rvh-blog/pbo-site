/**
 * Register /wake command for PBO Wake bot
 * Usage: DISCORD_TOKEN=xxx node scripts/register-wake-command.js
 */

const APP_ID = "1462154799540863047";

async function registerCommand() {
  const token = process.env.DISCORD_TOKEN;

  if (!token) {
    console.error("Please set DISCORD_TOKEN environment variable");
    console.error("Usage: DISCORD_TOKEN=your_bot_token node scripts/register-wake-command.js");
    process.exit(1);
  }

  const command = {
    name: "wake",
    description: "Wake up the PBO Bot from sleep",
  };

  const response = await fetch(
    `https://discord.com/api/v10/applications/${APP_ID}/commands`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bot ${token}`,
      },
      body: JSON.stringify(command),
    }
  );

  if (response.ok) {
    const data = await response.json();
    console.log("✅ /wake command registered successfully!");
    console.log("Command ID:", data.id);
  } else {
    const error = await response.text();
    console.error("❌ Failed to register command:", error);
  }
}

registerCommand();
