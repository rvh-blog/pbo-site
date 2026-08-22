import { Events } from "discord.js";
import { createClient, loginClient } from "./client";
import { validateConfig } from "./config";
import { handleMessage } from "./handlers";
import { commands } from "./commands";
import { startMilestoneDelivery } from "./services/milestone-delivery";
import { databaseReady } from "@/lib/db";

async function main() {
  console.log("[Bot] Starting PBO Discord Bot...");
  await databaseReady;

  // Validate configuration
  const { valid, errors } = validateConfig();
  if (!valid) {
    console.error("[Bot] Configuration errors:");
    errors.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }

  // Create client
  const client = createClient();

  // Register slash commands
  for (const command of commands) {
    client.commands.set(command.data.name, command);
  }
  console.log(`[Bot] Loaded ${commands.length} slash commands`);

  // Register event handlers
  client.on(Events.MessageCreate, async (message) => {
    try {
      await handleMessage(message);
    } catch (error) {
      console.error("[Bot] Error handling message:", error);
    }
  });

  // Handle slash commands
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      console.error(`[Bot] No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error("[Bot] Error executing command:", error);
      const reply = interaction.replied || interaction.deferred
        ? interaction.followUp
        : interaction.reply;
      await reply({
        content: "There was an error while executing this command!",
        ephemeral: true,
      });
    }
  });

  // Login
  try {
    await loginClient(client);
    startMilestoneDelivery(client);
    console.log("[Bot] Bot is ready and listening for commands!");
  } catch (error) {
    console.error("[Bot] Failed to login:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("[Bot] Shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[Bot] Shutting down...");
  process.exit(0);
});

main().catch((error) => {
  console.error("[Bot] Fatal error:", error);
  process.exit(1);
});
