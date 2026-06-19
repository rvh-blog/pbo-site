import type { Message } from "discord.js";
import {
  getTopKills,
  getSeasonKills,
  getDivisionKills,
  getCoachKills,
} from "../services/stats-service";
import { createKillsEmbed, createErrorEmbed } from "../utils/embeds";

/**
 * Handle !kills command
 *
 * Usage:
 * - !kills - Top 10 all time
 * - !kills s9 - Top 10 for season 9
 * - !kills s9 sunset - Top 10 for S9 Sunset division
 * - !kills uprafael - Top 10 for specific coach
 */
export async function handleKillsCommand(
  message: Message,
  args: string[]
): Promise<void> {
  try {
    // No args: top 10 all time
    if (args.length === 0) {
      const entries = await getTopKills(10);
      const embed = createKillsEmbed("Top 10 Pokemon by Kills (All Time)", entries);
      await message.reply({ embeds: [embed] });
      return;
    }

    // Check for season pattern
    const seasonMatch = args[0]?.match(/^s(\d+)$/i);

    if (seasonMatch) {
      const seasonNum = parseInt(seasonMatch[1]);

      // Season + division: !kills s9 sunset
      if (args.length >= 2) {
        const divisionName = args.slice(1).join(" ");
        const entries = await getDivisionKills(seasonNum, divisionName, 10);

        if (!entries) {
          const embed = createErrorEmbed(
            `Could not find division "${divisionName}" in Season ${seasonNum}.`
          );
          await message.reply({ embeds: [embed] });
          return;
        }

        const embed = createKillsEmbed(
          `S${seasonNum} ${divisionName} Top Kills`,
          entries
        );
        await message.reply({ embeds: [embed] });
        return;
      }

      // Just season: !kills s9
      const entries = await getSeasonKills(seasonNum, 10);

      if (!entries) {
        const embed = createErrorEmbed(
          `Could not find Season ${seasonNum}.`
        );
        await message.reply({ embeds: [embed] });
        return;
      }

      const embed = createKillsEmbed(`S${seasonNum} Top Kills`, entries);
      await message.reply({ embeds: [embed] });
      return;
    }

    // Coach name search: !kills uprafael
    const coachName = args.join(" ");
    const coachData = await getCoachKills(coachName, 10);

    if (!coachData) {
      const embed = createErrorEmbed(
        `Could not find coach matching "${coachName}".`
      );
      await message.reply({ embeds: [embed] });
      return;
    }

    if (coachData.kills.length === 0) {
      const embed = createErrorEmbed(
        `${coachData.coachName} has no recorded kills.`
      );
      await message.reply({ embeds: [embed] });
      return;
    }

    const embed = createKillsEmbed(
      `${coachData.coachName}'s Top Pokemon by Kills`,
      coachData.kills
    );
    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error("[Bot] Error in !kills command:", error);
    const embed = createErrorEmbed(
      "An error occurred while fetching kill data."
    );
    await message.reply({ embeds: [embed] });
  }
}
