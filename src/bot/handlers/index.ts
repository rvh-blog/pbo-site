import type { Message } from "discord.js";
import { config } from "../config";
import { handleEloCommand } from "./elo";
import { handleStandingsCommand } from "./standings";
import { handleKillsCommand } from "./kills";

// Map of prefix commands
const commands: Record<
  string,
  (message: Message, args: string[]) => Promise<void>
> = {
  elo: handleEloCommand,
  standings: handleStandingsCommand,
  kills: handleKillsCommand,
};

/**
 * Handle incoming messages and route prefix commands
 */
export async function handleMessage(message: Message): Promise<void> {
  // Ignore bot messages
  if (message.author.bot) return;

  // Check if message starts with prefix
  if (!message.content.startsWith(config.prefix)) return;

  // Parse command and args
  const args = message.content.slice(config.prefix.length).trim().split(/\s+/);
  const commandName = args.shift()?.toLowerCase();

  if (!commandName) return;

  // Find and execute command
  const command = commands[commandName];
  if (command) {
    await command(message, args);
  }
}
