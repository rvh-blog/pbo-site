import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  ComponentType,
  EmbedBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { getDivisionTeams, getTeamProfile } from "../services/read-service";
import { selectPublicDivision } from "../utils/division-selection";
import { createErrorEmbed } from "../utils/embeds";
import {
  handleResultVisibility,
  resultVisibilityRow,
} from "../utils/result-visibility";

export const data = new SlashCommandBuilder()
  .setName("team")
  .setDescription("View a team's roster, budget, record, and next match");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const division = await selectPublicDivision(interaction, {
    customId: "team_division_select",
    title: "Team Information",
  });
  if (!division) return;

  const teams = await getDivisionTeams(division.id);
  if (teams.length === 0) {
    await interaction.editReply({
      embeds: [createErrorEmbed("No active teams were found in this division.")],
    });
    return;
  }

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("team_select")
      .setPlaceholder("Select a coach")
      .addOptions(teams.slice(0, 25).map((team) => ({
        label: team.coachName.slice(0, 100),
        description: `${team.teamName} • ${team.remainingBudget} points remaining`.slice(0, 100),
        value: team.id.toString(),
      })))
  );
  const response = await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setTitle(`Teams — ${division.name}`)
      .setDescription("Select a coach to view that season's team information.")
      .setColor(0x6366f1)],
    components: [row],
  });

  try {
    const selected = await response.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      filter: (component) => component.user.id === interaction.user.id,
      time: 120_000,
    });
    await selected.deferUpdate();
    const profile = await getTeamProfile(division.id, Number(selected.values[0]));
    if (!profile) {
      await interaction.editReply({
        embeds: [createErrorEmbed("That team could not be found.")],
        components: [],
      });
      return;
    }

    const roster = profile.roster.length > 0
      ? profile.roster.map((entry) =>
        `${entry.isTeraCaptain ? "◆ " : ""}${entry.name} — ${entry.price} pts`
      ).join("\n").slice(0, 1024)
      : "No Pokémon currently rostered.";
    const nextMatch = profile.nextMatch
      ? `Week ${profile.nextMatch.week} vs **${profile.nextMatch.opponent}**` +
        (profile.nextMatch.scheduledAt
          ? `\n<t:${Math.floor(new Date(profile.nextMatch.scheduledAt).getTime() / 1000)}:F>`
          : "\nTime not scheduled")
      : "No remaining fixture.";

    const embed = new EmbedBuilder()
      .setTitle(profile.teamName)
      .setDescription(`Coach: **${profile.coachName}**`)
      .addFields(
        {
          name: "Record",
          value: `${profile.wins}-${profile.losses} (${profile.differential >= 0 ? "+" : ""}${profile.differential})`,
          inline: true,
        },
        {
          name: "Budget",
          value: `${profile.remainingBudget} pts`,
          inline: true,
        },
        {
          name: `Roster (${profile.roster.length})`,
          value: roster,
        },
        {
          name: "Next Match",
          value: nextMatch,
        }
      )
      .setColor(0x6366f1);
    const finalResponse = await interaction.editReply({
      embeds: [embed],
      components: [resultVisibilityRow("team_visibility")],
    });
    await handleResultVisibility(
      interaction,
      finalResponse,
      "team_visibility",
      { embeds: [embed] }
    );
  } catch {
    await interaction.editReply({
      embeds: [createErrorEmbed("Selection timed out. Run /team to try again.")],
      components: [],
    });
  }
}
