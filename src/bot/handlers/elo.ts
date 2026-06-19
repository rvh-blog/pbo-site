import type { Message } from "discord.js";
import {
  getTopElo,
  getDivisionElo,
  getCoachElo,
} from "../services/stats-service";
import {
  createEloEmbed,
  createCoachEloEmbed,
  createErrorEmbed,
} from "../utils/embeds";

/**
 * Handle !elo command
 *
 * Usage:
 * - !elo - Top 10 overall ELO
 * - !elo s9 sunset - ELO for S9 Sunset division
 * - !elo uprafael - ELO for specific coach
 */
export async function handleEloCommand(
  message: Message,
  args: string[]
): Promise<void> {
  try {
    // No args: top 10 overall
    if (args.length === 0) {
      const entries = await getTopElo(10);
      const embed = createEloEmbed("Top 10 ELO Rankings", entries);
      await message.reply({ embeds: [embed] });
      return;
    }

    // Check for season pattern (e.g., "s9", "S10")
    const seasonMatch = args[0]?.match(/^s(\d+)$/i);

    if (seasonMatch && args.length >= 2) {
      // Season + division: !elo s9 sunset
      const seasonNum = parseInt(seasonMatch[1]);
      const divisionName = args.slice(1).join(" ");

      const entries = await getDivisionElo(seasonNum, divisionName);

      if (!entries) {
        const embed = createErrorEmbed(
          `Could not find division "${divisionName}" in Season ${seasonNum}.`
        );
        await message.reply({ embeds: [embed] });
        return;
      }

      const embed = createEloEmbed(
        `S${seasonNum} ${divisionName} ELO Rankings`,
        entries
      );
      await message.reply({ embeds: [embed] });
      return;
    }

    // Coach name search: !elo uprafael
    const coachName = args.join(" ");
    const coachData = await getCoachElo(coachName);

    if (!coachData) {
      const embed = createErrorEmbed(
        `Could not find coach matching "${coachName}".`
      );
      await message.reply({ embeds: [embed] });
      return;
    }

    const embed = createCoachEloEmbed(
      coachData.name,
      coachData.elo,
      coachData.rank
    );
    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error("[Bot] Error in !elo command:", error);
    const embed = createErrorEmbed("An error occurred while fetching ELO data.");
    await message.reply({ embeds: [embed] });
  }
}
