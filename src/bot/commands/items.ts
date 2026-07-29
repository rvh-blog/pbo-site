import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { getDivisionItemUsage } from "../services/read-service";
import { selectCoachScope } from "../utils/coach-selection";
import { selectPublicDivision } from "../utils/division-selection";

export const data = new SlashCommandBuilder()
  .setName("items")
  .setDescription("View revealed held-item usage in this division");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const division = await selectPublicDivision(interaction, {
    customId: "items_division_select",
    title: "Revealed Items",
  });
  if (!division) return;
  const coachScope = await selectCoachScope(interaction, {
    customId: "items_coach_select",
    divisionId: division.id,
    divisionName: division.name,
    title: "Revealed Items",
    allowAll: true,
  });
  if (!coachScope) return;

  const items = await getDivisionItemUsage(division.id, coachScope.team?.id);
  const scopeLabel = coachScope.team
    ? `${coachScope.team.coachName} • ${coachScope.team.teamName}`
    : division.name;
  if (items.length === 0) {
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setTitle(`Revealed Items — ${scopeLabel}`)
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
      .setTitle(`Revealed Items — ${scopeLabel}`)
      .setDescription(lines.join("\n\n").slice(0, 4096))
      .setFooter({ text: "Only items explicitly revealed in recorded replays are counted." })
      .setColor(0x6366f1)],
  });
}
