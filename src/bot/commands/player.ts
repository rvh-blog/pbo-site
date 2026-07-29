import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { getPokemonPerformance } from "../services/read-service";
import { selectCoachScope } from "../utils/coach-selection";
import { selectPublicDivision } from "../utils/division-selection";
import { createErrorEmbed } from "../utils/embeds";
import {
  handleResultVisibility,
  resultVisibilityRow,
} from "../utils/result-visibility";

export const data = new SlashCommandBuilder()
  .setName("player")
  .setDescription("View a Pokémon's performance and revealed-item tendencies")
  .addStringOption((option) => option
    .setName("pokemon")
    .setDescription("Pokémon name")
    .setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const division = await selectPublicDivision(interaction, {
    customId: "player_division_select",
    title: "Pokémon Performance",
  });
  if (!division) return;
  const coachScope = await selectCoachScope(interaction, {
    customId: "player_coach_select",
    divisionId: division.id,
    divisionName: division.name,
    title: "Pokémon Performance",
    allowAll: true,
  });
  if (!coachScope) return;

  const search = interaction.options.getString("pokemon", true).trim();
  const stats = await getPokemonPerformance(
    division.id,
    search,
    coachScope.team?.id
  );
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
    .setDescription(
      `${division.name}` +
      `${coachScope.team ? ` • ${coachScope.team.coachName}` : " • All Coaches"}` +
      `${stats.types.length ? ` • ${stats.types.join(" / ")}` : ""}`
    )
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
  const response = await interaction.editReply({
    embeds: [embed],
    components: [resultVisibilityRow("player_visibility")],
  });
  await handleResultVisibility(interaction, response, "player_visibility", {
    embeds: [embed],
  });
}
