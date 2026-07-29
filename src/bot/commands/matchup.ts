import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  ComponentType,
  EmbedBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { getChannelConfig } from "../services/discord-config";
import { getTeamProfile, getUpcomingDivisionMatches } from "../services/read-service";
import { createErrorEmbed } from "../utils/embeds";

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
  const config = await getChannelConfig(interaction.channelId);
  if (!config) {
    await interaction.editReply({
      embeds: [createErrorEmbed("This channel is not configured for a division.")],
    });
    return;
  }

  const fixtures = await getUpcomingDivisionMatches(config.divisionId);
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
      .setTitle(`Upcoming Matchups — ${config.division.name}`)
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
      getTeamProfile(config.divisionId, fixture.team1Id),
      getTeamProfile(config.divisionId, fixture.team2Id),
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
    await interaction.editReply({
      embeds: [new EmbedBuilder()
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
        .setColor(0x6366f1)],
      components: [],
    });
  } catch {
    await interaction.editReply({
      embeds: [createErrorEmbed("Selection timed out. Run /matchup to try again.")],
      components: [],
    });
  }
}
