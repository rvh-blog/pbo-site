import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { getChannelConfig } from "../services/discord-config";
import { getPokemonPerformance } from "../services/read-service";
import { createErrorEmbed } from "../utils/embeds";

export const data = new SlashCommandBuilder()
  .setName("player")
  .setDescription("View a Pokémon's performance and revealed-item tendencies")
  .addStringOption((option) => option
    .setName("pokemon")
    .setDescription("Pokémon name")
    .setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const config = await getChannelConfig(interaction.channelId);
  if (!config) {
    await interaction.editReply({
      embeds: [createErrorEmbed("This channel is not configured for a division.")],
    });
    return;
  }

  const search = interaction.options.getString("pokemon", true).trim();
  const stats = await getPokemonPerformance(config.divisionId, search);
  if (!stats) {
    await interaction.editReply({
      embeds: [createErrorEmbed(`No Pokémon found matching "${search}".`)],
    });
    return;
  }

  const kd = stats.deaths > 0
    ? (stats.kills / stats.deaths).toFixed(2)
    : stats.kills > 0 ? "∞" : "0.00";
  const winRate = stats.games > 0 ? Math.round((stats.wins / stats.games) * 100) : 0;
  const items = stats.itemCounts.length > 0
    ? stats.itemCounts.slice(0, 10).map((item) => `${item.item} — ${item.count}`).join("\n")
    : "No held items have been revealed.";
  const embed = new EmbedBuilder()
    .setTitle(stats.name)
    .setDescription(`${config.division.name}${stats.types.length ? ` • ${stats.types.join(" / ")}` : ""}`)
    .addFields(
      {
        name: "Performance",
        value: `Games: **${stats.games}**\nRecord: **${stats.wins}-${stats.games - stats.wins}** (${winRate}%)`,
        inline: true,
      },
      {
        name: "K/D",
        value: `**${stats.kills}K / ${stats.deaths}D**\nRatio: **${kd}**`,
        inline: true,
      },
      {
        name: "Revealed Items",
        value: items,
      }
    )
    .setColor(0x6366f1);
  if (stats.spriteUrl?.startsWith("http")) embed.setThumbnail(stats.spriteUrl);
  await interaction.editReply({ embeds: [embed] });
}
