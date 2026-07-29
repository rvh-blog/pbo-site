import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  ComponentType,
  EmbedBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { getTeamProfile, getUpcomingDivisionMatches } from "../services/read-service";
import { selectCoachScope } from "../utils/coach-selection";
import { selectPublicDivision } from "../utils/division-selection";
import { createErrorEmbed } from "../utils/embeds";
import {
  handleResultVisibility,
  resultVisibilityRow,
} from "../utils/result-visibility";

export const data = new SlashCommandBuilder()
  .setName("matchup")
  .setDescription("Compare the rosters and records in an upcoming matchup");

function rosterText(profile: NonNullable<Awaited<ReturnType<typeof getTeamProfile>>>): string {
  return profile.roster.length > 0
    ? profile.roster.map((entry) =>
      `${entry.isTeraCaptain ? "◆ " : ""}${entry.name} (${entry.price})`
    ).join("\n").slice(0, 1024)
    : "No Pokémon rostered.";
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const division = await selectPublicDivision(interaction, {
    customId: "matchup_division_select",
    title: "Upcoming Matchups",
  });
  if (!division) return;
  const coachScope = await selectCoachScope(interaction, {
    customId: "matchup_coach_select",
    divisionId: division.id,
    divisionName: division.name,
    title: "Upcoming Matchups",
    allowAll: true,
  });
  if (!coachScope) return;

  const allFixtures = await getUpcomingDivisionMatches(division.id);
  const fixtures = coachScope.team
    ? allFixtures.filter((fixture) =>
      fixture.team1Id === coachScope.team?.id ||
      fixture.team2Id === coachScope.team?.id
    )
    : allFixtures;
  if (fixtures.length === 0) {
    await interaction.editReply({
      embeds: [createErrorEmbed("No unplayed matchups remain in this division.")],
    });
    return;
  }

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("matchup_select")
      .setPlaceholder("Select an upcoming matchup")
      .addOptions(fixtures.slice(0, 25).map((fixture) => ({
        label: `${fixture.team1Name} vs ${fixture.team2Name}`.slice(0, 100),
        description: `Week ${fixture.week}${fixture.scheduledAt ? " • Scheduled" : " • Time TBD"}`,
        value: fixture.matchId.toString(),
      })))
  );
  const response = await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setTitle(`Upcoming Matchups — ${division.name}`)
      .setDescription("Select a fixture to compare both teams.")
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
    const fixture = fixtures.find((entry) => entry.matchId === Number(selected.values[0]));
    if (!fixture) {
      await interaction.editReply({
        embeds: [createErrorEmbed("That matchup could not be found.")],
        components: [],
      });
      return;
    }

    const [team1, team2] = await Promise.all([
      getTeamProfile(division.id, fixture.team1Id),
      getTeamProfile(division.id, fixture.team2Id),
    ]);
    if (!team1 || !team2) {
      await interaction.editReply({
        embeds: [createErrorEmbed("One of the matchup teams could not be loaded.")],
        components: [],
      });
      return;
    }

    const scheduled = fixture.scheduledAt
      ? `<t:${Math.floor(new Date(fixture.scheduledAt).getTime() / 1000)}:F>`
      : "Time not scheduled";
    const embed = new EmbedBuilder()
      .setTitle(`${team1.teamName} vs ${team2.teamName}`)
      .setDescription(`Week ${fixture.week}\n${scheduled}`)
      .addFields(
        {
          name: team1.teamName,
          value: `Coach: **${team1.coachName}**\nRecord: **${team1.wins}-${team1.losses}**\nBudget: **${team1.remainingBudget}**`,
          inline: true,
        },
        {
          name: team2.teamName,
          value: `Coach: **${team2.coachName}**\nRecord: **${team2.wins}-${team2.losses}**\nBudget: **${team2.remainingBudget}**`,
          inline: true,
        },
        {
          name: `${team1.teamName} Roster`,
          value: rosterText(team1),
          inline: true,
        },
        {
          name: `${team2.teamName} Roster`,
          value: rosterText(team2),
          inline: true,
        }
      )
      .setColor(0x6366f1);
    const finalResponse = await interaction.editReply({
      embeds: [embed],
      components: [resultVisibilityRow("matchup_visibility")],
    });
    await handleResultVisibility(
      interaction,
      finalResponse,
      "matchup_visibility",
      { embeds: [embed] }
    );
  } catch {
    await interaction.editReply({
      embeds: [createErrorEmbed("Selection timed out. Run /matchup to try again.")],
      components: [],
    });
  }
}
