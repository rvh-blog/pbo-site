import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import {
  getChannelConfig,
  getGuildChannels,
} from "../services/discord-config";
import { getDivisionStandings } from "../services/read-service";
import {
  getFixturesForWeek,
  getWeeksInDivision,
  type FixtureOption,
} from "../services/match-service";
import { createErrorEmbed } from "../utils/embeds";

export const data = new SlashCommandBuilder()
  .setName("standings")
  .setDescription("Browse division standings and schedules");

interface DivisionOption {
  id: number;
  name: string;
}

function getWeekLabel(week: number): string {
  if (week === 101) return "Quarterfinals";
  if (week === 102) return "Semifinals";
  if (week === 103) return "Finals";
  return `Week ${week}`;
}

function divisionRow(
  divisions: DivisionOption[],
  selectedDivisionId: number
): ActionRowBuilder<StringSelectMenuBuilder> | null {
  if (divisions.length <= 1) return null;
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("standings_division_select")
      .setPlaceholder("Select a division")
      .addOptions(divisions.slice(0, 25).map((division) => ({
        label: division.name.slice(0, 100),
        value: String(division.id),
        default: division.id === selectedDivisionId,
      })))
  );
}

function formatFixture(fixture: FixtureOption): string {
  const result = fixture.hasResult
    ? "✅ Completed"
    : fixture.scheduledAt
      ? `<t:${Math.floor(new Date(fixture.scheduledAt).getTime() / 1000)}:F> ` +
        `(<t:${Math.floor(new Date(fixture.scheduledAt).getTime() / 1000)}:R>)`
      : "⏳ Time not scheduled";
  return `**${fixture.team1Name}** vs **${fixture.team2Name}**\n${result}`;
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

  const guildChannels = interaction.guildId
    ? await getGuildChannels(interaction.guildId)
    : [];
  const divisionMap = new Map<number, DivisionOption>();
  divisionMap.set(config.division.id, {
    id: config.division.id,
    name: config.division.name,
  });
  for (const channel of guildChannels) {
    if (channel.division) {
      divisionMap.set(channel.division.id, {
        id: channel.division.id,
        name: channel.division.name,
      });
    }
  }
  const divisions = [...divisionMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  let selectedDivision = divisionMap.get(config.division.id)!;
  let view: "standings" | "schedule" = "standings";
  let weeks: number[] = [];
  let weekIndex = 0;

  const renderStandings = async () => {
    const standings = await getDivisionStandings(selectedDivision.id);
    const components = [];
    const selectRow = divisionRow(divisions, selectedDivision.id);
    if (selectRow) components.push(selectRow);
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("standings_view_schedule")
          .setLabel("View Schedule")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("standings_refresh")
          .setLabel("Refresh")
          .setStyle(ButtonStyle.Secondary)
      )
    );

    const lines = standings.slice(0, 25).map((team, index) =>
      `**${index + 1}. ${team.teamName}** — ${team.wins}-${team.losses} ` +
      `(${team.differential >= 0 ? "+" : ""}${team.differential})`
    );
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setTitle(`📊 ${selectedDivision.name} Standings`)
        .setDescription(
          lines.length > 0
            ? lines.join("\n").slice(0, 4096)
            : "No active teams were found in this division."
        )
        .setFooter({ text: "Ordered by wins, losses, differential, then team name." })
        .setColor(0x6366f1)
        .setTimestamp()],
      components,
    });
  };

  const renderSchedule = async () => {
    const week = weeks[weekIndex];
    const fixtures = week === undefined
      ? []
      : await getFixturesForWeek(selectedDivision.id, week);
    const components = [];
    const selectRow = divisionRow(divisions, selectedDivision.id);
    if (selectRow) components.push(selectRow);
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("standings_previous_week")
          .setLabel("Previous Week")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(weekIndex === 0),
        new ButtonBuilder()
          .setCustomId("standings_view_standings")
          .setLabel("Standings")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("standings_next_week")
          .setLabel("Next Week")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(weekIndex >= weeks.length - 1),
        new ButtonBuilder()
          .setCustomId("standings_refresh")
          .setLabel("Refresh")
          .setStyle(ButtonStyle.Secondary)
      )
    );

    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setTitle(
          `📅 ${selectedDivision.name} — ${
            week === undefined ? "Schedule" : getWeekLabel(week)
          }`
        )
        .setDescription(
          fixtures.length > 0
            ? fixtures.map(formatFixture).join("\n\n").slice(0, 4096)
            : "No fixtures were found."
        )
        .setFooter({
          text: weeks.length > 0
            ? `Week page ${weekIndex + 1} of ${weeks.length}`
            : "No schedule weeks available",
        })
        .setColor(0x6366f1)
        .setTimestamp()],
      components,
    });
  };

  const loadSchedule = async () => {
    weeks = await getWeeksInDivision(selectedDivision.id);
    weekIndex = 0;
    for (let index = 0; index < weeks.length; index += 1) {
      const fixtures = await getFixturesForWeek(selectedDivision.id, weeks[index]);
      if (fixtures.some((fixture) => !fixture.hasResult)) {
        weekIndex = index;
        break;
      }
    }
  };

  await renderStandings();
  const response = await interaction.fetchReply();

  while (true) {
    let component;
    try {
      component = await response.awaitMessageComponent({
        filter: (candidate) =>
          candidate.user.id === interaction.user.id &&
          candidate.customId.startsWith("standings_"),
        time: 120_000,
      });
    } catch {
      await interaction.editReply({ components: [] });
      return;
    }

    await component.deferUpdate();
    if (component.isStringSelectMenu()) {
      const division = divisionMap.get(Number(component.values[0]));
      if (division) {
        selectedDivision = division;
        view = "standings";
        weeks = [];
        weekIndex = 0;
      }
    } else if (component.customId === "standings_view_schedule") {
      view = "schedule";
      await loadSchedule();
    } else if (component.customId === "standings_view_standings") {
      view = "standings";
    } else if (component.customId === "standings_previous_week") {
      weekIndex = Math.max(0, weekIndex - 1);
    } else if (component.customId === "standings_next_week") {
      weekIndex = Math.min(weeks.length - 1, weekIndex + 1);
    }

    if (view === "schedule") {
      await renderSchedule();
    } else {
      await renderStandings();
    }
  }
}
