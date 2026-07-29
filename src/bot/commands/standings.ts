import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { getChannelConfig } from "../services/discord-config";
import { getDivisionStandings } from "../services/read-service";
import { createErrorEmbed } from "../utils/embeds";

export const data = new SlashCommandBuilder()
  .setName("standings")
  .setDescription("View the current standings for this division");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const config = await getChannelConfig(interaction.channelId);
  if (!config) {
    await interaction.editReply({
      embeds: [createErrorEmbed("This channel is not configured for a division.")],
    });
    return;
  }

  const standings = await getDivisionStandings(config.divisionId);
  if (standings.length === 0) {
    await interaction.editReply({
      embeds: [createErrorEmbed("No active teams were found in this division.")],
    });
    return;
  }
  const lines = standings.slice(0, 25).map((team, index) =>
    `**${index + 1}. ${team.teamName}** — ${team.wins}-${team.losses} ` +
    `(${team.differential >= 0 ? "+" : ""}${team.differential})`
  );
  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setTitle(`${config.division.name} Standings`)
      .setDescription(lines.join("\n").slice(0, 4096))
      .setFooter({ text: "Ordered by wins, losses, differential, then team name." })
      .setColor(0x6366f1)],
  });
}
