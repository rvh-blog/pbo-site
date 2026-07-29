import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { getChannelConfig } from "../services/discord-config";
import { getDivisionItemUsage } from "../services/read-service";
import { createErrorEmbed } from "../utils/embeds";

export const data = new SlashCommandBuilder()
  .setName("items")
  .setDescription("View revealed held-item usage in this division");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const config = await getChannelConfig(interaction.channelId);
  if (!config) {
    await interaction.editReply({
      embeds: [createErrorEmbed("This channel is not configured for a division.")],
    });
    return;
  }

  const items = await getDivisionItemUsage(config.divisionId);
  if (items.length === 0) {
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setTitle(`Revealed Items — ${config.division.name}`)
        .setDescription("No held-item reveals have been recorded yet.")
        .setColor(0x6366f1)],
    });
    return;
  }

  const lines = items.slice(0, 15).map((item, index) => {
    const examples = item.pokemon.slice(0, 3).join(", ");
    return `**${index + 1}. ${item.item}** — ${item.reveals} reveal${item.reveals === 1 ? "" : "s"}${examples ? `\n${examples}` : ""}`;
  });
  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setTitle(`Revealed Items — ${config.division.name}`)
      .setDescription(lines.join("\n\n").slice(0, 4096))
      .setFooter({ text: "Only items explicitly revealed in recorded replays are counted." })
      .setColor(0x6366f1)],
  });
}
