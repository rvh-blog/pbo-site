import { REST, Routes } from "discord.js";
import { config, validateConfig } from "./config";
import { commands as commandModules } from "./commands";

// Build command data from command modules
const commands = commandModules.map((cmd) => cmd.data.toJSON());

async function deployCommands() {
  console.log("[Deploy] Deploying slash commands...");

  // Validate configuration
  const { valid, errors } = validateConfig();
  if (!valid) {
    console.error("[Deploy] Configuration errors:");
    errors.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }

  const rest = new REST({ version: "10" }).setToken(config.token);

  try {
    console.log(`[Deploy] Started refreshing ${commands.length} application (/) commands.`);

    // Deploy globally (takes up to an hour to propagate)
    // For testing, you can deploy to a specific guild (instant)
    const guildId = process.env.DISCORD_DEV_GUILD_ID;

    if (guildId) {
      // Deploy to specific guild (instant, for development)
      const data = await rest.put(
        Routes.applicationGuildCommands(config.clientId, guildId),
        { body: commands }
      );
      console.log(`[Deploy] Successfully deployed ${(data as object[]).length} commands to guild ${guildId}.`);
    } else {
      // Deploy globally (production)
      const data = await rest.put(
        Routes.applicationCommands(config.clientId),
        { body: commands }
      );
      console.log(`[Deploy] Successfully deployed ${(data as object[]).length} commands globally.`);
    }
  } catch (error) {
    console.error("[Deploy] Error deploying commands:", error);
    process.exit(1);
  }
}

deployCommands();
