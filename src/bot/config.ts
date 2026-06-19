// Load environment variables from .env.local (for local development)
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

// Discord bot configuration
export const config = {
  token: process.env.DISCORD_BOT_TOKEN || "",
  clientId: process.env.DISCORD_CLIENT_ID || "",
  prefix: "!", // For prefix commands (!elo, !standings, !kills)
};

// Validate required environment variables
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.token) {
    errors.push("DISCORD_BOT_TOKEN is not set");
  }

  if (!config.clientId) {
    errors.push("DISCORD_CLIENT_ID is not set");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
