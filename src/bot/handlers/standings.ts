import type { Message } from "discord.js";
import { getStandings } from "../services/stats-service";
import { createStandingsEmbed, createErrorEmbed } from "../utils/embeds";

/**
 * Handle !standings command
 *
 * Usage:
 * - !standings s9 sunset - Standings for S9 Sunset division
 *
 * Note: Season and division are required.
 */
export async function handleStandingsCommand(
  message: Message,
  args: string[]
): Promise<void> {
  try {
    // Require at least season and division
    if (args.length < 2) {
      const embed = createErrorEmbed(
        "Usage: `!standings s9 sunset`\n\nPlease specify both season (e.g., s9) and division name."
      );
      await message.reply({ embeds: [embed] });
      return;
    }

    // Check for season pattern
    const seasonMatch = args[0]?.match(/^s(\d+)$/i);

    if (!seasonMatch) {
      const embed = createErrorEmbed(
        "Please specify season like: s9, s10, etc.\n\nExample: `!standings s9 sunset`"
      );
      await message.reply({ embeds: [embed] });
      return;
    }

    const seasonNum = parseInt(seasonMatch[1]);
    const divisionName = args.slice(1).join(" ");

    const standings = await getStandings(seasonNum, divisionName);

    if (!standings) {
      const embed = createErrorEmbed(
        `Could not find division "${divisionName}" in Season ${seasonNum}.`
      );
      await message.reply({ embeds: [embed] });
      return;
    }

    const embed = createStandingsEmbed(
      standings.seasonName,
      standings.divisionName,
      standings.teams
    );
    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error("[Bot] Error in !standings command:", error);
    const embed = createErrorEmbed(
      "An error occurred while fetching standings data."
    );
    await message.reply({ embeds: [embed] });
  }
}
