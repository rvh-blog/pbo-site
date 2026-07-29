import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
  type ButtonInteraction,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { getGuildChannels } from "../services/discord-config";
import { logDiscordAudit } from "../services/discord-audit";
import {
  DISCORD_TIMEZONES,
  getDiscordTimezone,
  isSupportedTimezone,
  setDiscordTimezone,
  type SupportedTimezone,
} from "../services/discord-user-preferences";
import {
  getWeeksInDivision,
  getFixturesForWeek,
  updateMatchSchedule,
} from "../services/match-service";
import { createErrorEmbed } from "../utils/embeds";
import { selectCurrentDivision } from "../utils/division-selection";
import {
  addCalendarDays,
  formatCalendarDate,
  getTimeZoneOffsetLabel,
  getZonedDateTime,
  isValidCalendarDate,
  zonedDateTimeToUtc,
  type CalendarDateTime,
} from "../utils/timezone";

function getWeekLabel(week: number): string {
  if (week === 101) return "Quarterfinals";
  if (week === 102) return "Semifinals";
  if (week === 103) return "Finals";
  return `Week ${week}`;
}

function timezoneName(timezone: SupportedTimezone): string {
  return DISCORD_TIMEZONES.find((entry) => entry.value === timezone)?.name ?? timezone;
}

function timezoneDisplay(timezone: SupportedTimezone, date: Date): string {
  return `${timezoneName(timezone)} (${getTimeZoneOffsetLabel(date, timezone)})`;
}

const COMMON_TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Perth",
  "Australia/Adelaide",
  "Australia/Sydney",
] as const;

const TIMEZONE_REGIONS = [
  { value: "common", label: "Common Timezones", description: "Frequently used zones worldwide" },
  { value: "Africa", label: "Africa", description: "African timezones" },
  { value: "America", label: "Americas", description: "North, Central, and South America" },
  { value: "Antarctica", label: "Antarctica", description: "Antarctic research stations" },
  { value: "Arctic", label: "Arctic", description: "Arctic timezones" },
  { value: "Asia", label: "Asia", description: "Asian timezones" },
  { value: "Atlantic", label: "Atlantic", description: "Atlantic islands" },
  { value: "Australia", label: "Australia", description: "Australian timezones" },
  { value: "Europe", label: "Europe", description: "European timezones" },
  { value: "Indian", label: "Indian Ocean", description: "Indian Ocean islands" },
  { value: "Pacific", label: "Pacific", description: "Pacific islands and New Zealand" },
] as const;

function timezoneRegion(timezone: SupportedTimezone): string {
  return timezone === "UTC" ? "common" : timezone.split("/")[0];
}

function timezonesForRegion(region: string): typeof DISCORD_TIMEZONES {
  if (region === "common") {
    const commonOrder = new Map(COMMON_TIMEZONES.map((timezone, index) => [timezone, index]));
    return DISCORD_TIMEZONES
      .filter((timezone) => commonOrder.has(timezone.value as (typeof COMMON_TIMEZONES)[number]))
      .sort((a, b) =>
        (commonOrder.get(a.value as (typeof COMMON_TIMEZONES)[number]) ?? 0) -
        (commonOrder.get(b.value as (typeof COMMON_TIMEZONES)[number]) ?? 0)
      );
  }
  return DISCORD_TIMEZONES.filter((timezone) => timezone.value.startsWith(`${region}/`));
}

function parseDate(value: string): Pick<CalendarDateTime, "year" | "month" | "day"> | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return isValidCalendarDate(year, month, day) ? { year, month, day } : null;
}

export const data = new SlashCommandBuilder()
  .setName("schedule")
  .setDescription("Set or update a match scheduled time");

export async function execute(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    const division = await selectCurrentDivision(interaction, {
      customId: "schedule_division_select",
      title: "Schedule Match",
      description: "Select the division containing the match you want to schedule.",
    });
    if (!division) return;

    const guildChannels = interaction.guildId
      ? await getGuildChannels(interaction.guildId)
      : [];
    const isScheduleEnabled = guildChannels.some(
      (channel) =>
        channel.divisionId === division.id &&
        (channel.isScheduleEnabled ?? true)
    );
    if (!isScheduleEnabled) {
      await interaction.editReply({
        embeds: [createErrorEmbed(
          `Match scheduling is not enabled for ${division.name}. An admin can enable it in Discord configuration.`
        )],
        components: [],
      });
      return;
    }
    const config = {
      divisionId: division.id,
      division,
    };

    const weeks = await getWeeksInDivision(config.divisionId);
    if (weeks.length === 0) {
      await interaction.editReply({
        embeds: [createErrorEmbed("No fixtures found for this division.")],
      });
      return;
    }

    const weekRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("schedule_week_select")
        .setPlaceholder("Select a week")
        .addOptions(weeks.slice(0, 25).map((week) => ({
          label: getWeekLabel(week),
          value: week.toString(),
        })))
    );
    const response = await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setTitle(`Schedule Match - ${config.division.name}`)
        .setDescription("**Step 1/4:** Select the week")
        .setColor(0x6366f1)],
      components: [weekRow],
    });

    let weekInteraction: StringSelectMenuInteraction;
    try {
      weekInteraction = await response.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (component) => component.user.id === interaction.user.id,
        time: 120_000,
      });
    } catch {
      await interaction.editReply({
        embeds: [createErrorEmbed("Selection timed out. Please try again.")],
        components: [],
      });
      return;
    }
    await weekInteraction.deferUpdate();

    const selectedWeek = Number(weekInteraction.values[0]);
    const fixtures = (await getFixturesForWeek(config.divisionId, selectedWeek))
      .filter((fixture) => !fixture.hasResult);
    if (fixtures.length === 0) {
      await interaction.editReply({
        embeds: [createErrorEmbed("All matches in this week have already been played.")],
        components: [],
      });
      return;
    }

    const fixtureRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("schedule_fixture_select")
        .setPlaceholder("Select a match")
        .addOptions(fixtures.slice(0, 25).map((fixture) => ({
          label: `${fixture.team1Name} vs ${fixture.team2Name}`.slice(0, 100),
          description: fixture.scheduledAt
            ? `Currently scheduled: ${new Date(fixture.scheduledAt).toISOString().slice(0, 16).replace("T", " ")} UTC`
            : "Not scheduled",
          value: fixture.matchId.toString(),
        })))
    );
    const weekLabel = getWeekLabel(selectedWeek);
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setTitle(`Schedule Match - ${config.division.name}`)
        .setDescription(`**Step 2/4:** Select the match (${weekLabel})`)
        .setColor(0x6366f1)],
      components: [fixtureRow],
    });

    let fixtureInteraction: StringSelectMenuInteraction;
    try {
      fixtureInteraction = await response.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (component) => component.user.id === interaction.user.id,
        time: 120_000,
      });
    } catch {
      await interaction.editReply({
        embeds: [createErrorEmbed("Selection timed out. Please try again.")],
        components: [],
      });
      return;
    }

    const selectedMatchId = Number(fixtureInteraction.values[0]);
    const selectedFixture = fixtures.find((fixture) => fixture.matchId === selectedMatchId);
    if (!selectedFixture) {
      await fixtureInteraction.update({
        embeds: [createErrorEmbed("Match not found.")],
        components: [],
      });
      return;
    }
    await fixtureInteraction.deferUpdate();

    const savedTimezone = await getDiscordTimezone(interaction.user.id);
    const defaultTimezone: SupportedTimezone = savedTimezone ?? "America/New_York";
    const now = new Date();
    const defaultRegion = timezoneRegion(defaultTimezone);
    const regionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("schedule_timezone_region_select")
        .setPlaceholder("Select a timezone region")
        .addOptions(TIMEZONE_REGIONS.map((region) => ({
          label: region.label,
          description: region.description,
          value: region.value,
          default: region.value === defaultRegion,
        })))
    );
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setTitle(`Schedule Match - ${config.division.name}`)
        .setDescription(
          `**Step 3/4:** Select your timezone region\n\n` +
          `**${selectedFixture.team1Name}** vs **${selectedFixture.team2Name}**\n\n` +
          "All IANA timezones are available. The final time will use the correct offset for the match date."
        )
        .setColor(0x6366f1)],
      components: [regionRow],
    });

    let regionInteraction: StringSelectMenuInteraction;
    try {
      regionInteraction = await response.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (component) =>
          component.user.id === interaction.user.id &&
          component.customId === "schedule_timezone_region_select",
        time: 120_000,
      });
    } catch {
      await interaction.editReply({
        embeds: [createErrorEmbed("Selection timed out. Please try again.")],
        components: [],
      });
      return;
    }
    await regionInteraction.deferUpdate();

    const selectedRegion = regionInteraction.values[0];
    const regionTimezones = timezonesForRegion(selectedRegion);
    if (regionTimezones.length === 0) {
      await interaction.editReply({
        embeds: [createErrorEmbed("No supported timezones were found for that region.")],
        components: [],
      });
      return;
    }

    const timezonePageSize = 25;
    const timezonePageCount = Math.ceil(regionTimezones.length / timezonePageSize);
    let timezonePage = Math.max(
      0,
      Math.floor(
        Math.max(0, regionTimezones.findIndex((timezone) => timezone.value === defaultTimezone)) /
        timezonePageSize
      )
    );
    let selectedTimezone: SupportedTimezone | null = null;

    while (!selectedTimezone) {
      const pageTimezones = regionTimezones.slice(
        timezonePage * timezonePageSize,
        (timezonePage + 1) * timezonePageSize
      );
      const timezoneRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("schedule_timezone_select")
          .setPlaceholder("Select your timezone")
          .addOptions(pageTimezones.map((timezone) => ({
            label: timezoneDisplay(timezone.value, now).slice(0, 100),
            description: `${timezone.value} • DST-aware`.slice(0, 100),
            value: timezone.value,
            default: timezone.value === defaultTimezone,
          })))
      );
      const pageRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("schedule_timezone_previous")
          .setLabel("Previous")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(timezonePage === 0),
        new ButtonBuilder()
          .setCustomId("schedule_timezone_next")
          .setLabel("Next")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(timezonePage === timezonePageCount - 1)
      );
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setTitle(`Schedule Match - ${config.division.name}`)
          .setDescription(
            `**Step 3/4:** Select your timezone\n\n` +
            `Region: **${TIMEZONE_REGIONS.find((region) => region.value === selectedRegion)?.label ?? selectedRegion}**\n` +
            `Page ${timezonePage + 1} of ${timezonePageCount}\n\n` +
            "The displayed offset is current. The match date will use the correct DST offset."
          )
          .setColor(0x6366f1)],
        components: timezonePageCount > 1 ? [timezoneRow, pageRow] : [timezoneRow],
      });

      let timezoneComponent;
      try {
        timezoneComponent = await response.awaitMessageComponent({
          filter: (component) =>
            component.user.id === interaction.user.id &&
            component.customId.startsWith("schedule_timezone_"),
          time: 120_000,
        });
      } catch {
        await interaction.editReply({
          embeds: [createErrorEmbed("Selection timed out. Please try again.")],
          components: [],
        });
        return;
      }

      if (timezoneComponent.isButton()) {
        timezonePage += timezoneComponent.customId === "schedule_timezone_next" ? 1 : -1;
        timezonePage = Math.max(0, Math.min(timezonePage, timezonePageCount - 1));
        await timezoneComponent.deferUpdate();
        continue;
      }
      if (!timezoneComponent.isStringSelectMenu()) continue;

      const timezoneValue = timezoneComponent.values[0];
      if (!isSupportedTimezone(timezoneValue)) {
        await timezoneComponent.update({
          embeds: [createErrorEmbed("That timezone is not supported.")],
          components: [],
        });
        return;
      }
      selectedTimezone = timezoneValue;
      await timezoneComponent.deferUpdate();
    }

    await setDiscordTimezone(interaction.user.id, selectedTimezone);

    const today = getZonedDateTime(now, selectedTimezone);
    const dayOptions = Array.from({ length: 7 }, (_, index) => {
      const date = addCalendarDays(today, index);
      const isoDate = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
      return {
        label: formatCalendarDate(date, { weekday: "long" }),
        description: formatCalendarDate(date, { month: "short", day: "numeric", year: "numeric" }),
        value: `date_${isoDate}`,
      };
    });
    dayOptions.push({
      label: "Custom Date",
      description: "Enter a specific date",
      value: "custom",
    });

    const dayRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("schedule_day_select")
        .setPlaceholder("Select a day")
        .addOptions(dayOptions)
    );
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setTitle(`Schedule Match - ${config.division.name}`)
        .setDescription(
          `**Step 4/4:** Select the day\n\n` +
          `**${selectedFixture.team1Name}** vs **${selectedFixture.team2Name}**\n` +
          timezoneDisplay(selectedTimezone, now)
        )
        .setColor(0x6366f1)],
      components: [dayRow],
    });

    let dayInteraction: StringSelectMenuInteraction;
    try {
      dayInteraction = await response.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (component) => component.user.id === interaction.user.id,
        time: 120_000,
      });
    } catch {
      await interaction.editReply({
        embeds: [createErrorEmbed("Selection timed out. Please try again.")],
        components: [],
      });
      return;
    }

    const dayValue = dayInteraction.values[0];
    const isCustomDate = dayValue === "custom";
    const selectedDate = isCustomDate ? null : parseDate(dayValue.replace("date_", ""));
    if (!isCustomDate && !selectedDate) {
      await dayInteraction.update({
        embeds: [createErrorEmbed("The selected date is invalid.")],
        components: [],
      });
      return;
    }

    const existingLocal = selectedFixture.scheduledAt
      ? getZonedDateTime(new Date(selectedFixture.scheduledAt), selectedTimezone)
      : null;
    const modal = new ModalBuilder()
      .setCustomId("schedule_time_modal")
      .setTitle(selectedFixture.scheduledAt ? "Propose New Match Time" : "Set Match Time");

    if (isCustomDate) {
      const dateInput = new TextInputBuilder()
        .setCustomId("schedule_date")
        .setLabel("Date (YYYY-MM-DD)")
        .setPlaceholder("2026-08-15")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(10)
        .setMaxLength(10);
      if (existingLocal) {
        dateInput.setValue(
          `${existingLocal.year}-${String(existingLocal.month).padStart(2, "0")}-${String(existingLocal.day).padStart(2, "0")}`
        );
      }
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(dateInput));
    }

    const timeInput = new TextInputBuilder()
      .setCustomId("schedule_time")
      .setLabel(`Time in ${timezoneName(selectedTimezone)} (24-hour)`.slice(0, 45))
      .setPlaceholder("19:00")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(5)
      .setMaxLength(5);
    if (existingLocal) {
      timeInput.setValue(
        `${String(existingLocal.hour).padStart(2, "0")}:${String(existingLocal.minute).padStart(2, "0")}`
      );
    }
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(timeInput));
    await dayInteraction.showModal(modal);

    let modalInteraction: ModalSubmitInteraction;
    try {
      modalInteraction = await dayInteraction.awaitModalSubmit({
        filter: (component) =>
          component.customId === "schedule_time_modal" &&
          component.user.id === interaction.user.id,
        time: 300_000,
      });
    } catch {
      await interaction.editReply({
        embeds: [createErrorEmbed("Modal timed out. Please try again.")],
        components: [],
      });
      return;
    }
    await modalInteraction.deferUpdate();

    const timeMatch = modalInteraction.fields
      .getTextInputValue("schedule_time")
      .trim()
      .match(/^(\d{2}):(\d{2})$/);
    if (!timeMatch) {
      await interaction.editReply({
        embeds: [createErrorEmbed("Invalid time format. Use HH:MM, such as 19:00.")],
        components: [],
      });
      return;
    }

    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    if (hour > 23 || minute > 59) {
      await interaction.editReply({
        embeds: [createErrorEmbed("Invalid time values.")],
        components: [],
      });
      return;
    }

    const date = isCustomDate
      ? parseDate(modalInteraction.fields.getTextInputValue("schedule_date").trim())
      : selectedDate;
    if (!date) {
      await interaction.editReply({
        embeds: [createErrorEmbed("Invalid date. Use a real calendar date in YYYY-MM-DD format.")],
        components: [],
      });
      return;
    }

    const proposedDate = zonedDateTimeToUtc(
      { ...date, hour, minute },
      selectedTimezone
    );
    if (!proposedDate) {
      await interaction.editReply({
        embeds: [createErrorEmbed(
          `That local time does not exist in ${timezoneName(selectedTimezone)} because of a daylight-saving clock change. Choose another time.`
        )],
        components: [],
      });
      return;
    }

    const isReschedule = selectedFixture.scheduledAt !== null;
    const proposedUnix = Math.floor(proposedDate.getTime() / 1000);
    const currentUnix = selectedFixture.scheduledAt
      ? Math.floor(new Date(selectedFixture.scheduledAt).getTime() / 1000)
      : null;
    const dateOffset = getTimeZoneOffsetLabel(proposedDate, selectedTimezone);
    const confirmId = `schedule_confirm_${selectedMatchId}`;
    const keepId = `schedule_keep_${selectedMatchId}`;
    const confirmationEmbed = new EmbedBuilder()
      .setTitle(isReschedule ? "Confirm Match Reschedule" : "Confirm Match Schedule")
      .setDescription(
        `**${selectedFixture.team1Name}** vs **${selectedFixture.team2Name}**\n${weekLabel}`
      )
      .addFields(
        ...(currentUnix === null ? [] : [{
          name: "Current",
          value: `<t:${currentUnix}:F>`,
          inline: false,
        }]),
        {
          name: "Proposed",
          value: `<t:${proposedUnix}:F>\n(<t:${proposedUnix}:R>)`,
          inline: false,
        },
        {
          name: "Timezone used",
          value: `${timezoneName(selectedTimezone)} (${dateOffset})\n${selectedTimezone}`,
          inline: false,
        }
      )
      .setColor(isReschedule ? 0xf59e0b : 0x6366f1);
    const confirmationRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel(isReschedule ? "Confirm Reschedule" : "Confirm Schedule")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(keepId)
        .setLabel(isReschedule ? "Keep Existing" : "Cancel")
        .setStyle(ButtonStyle.Secondary)
    );
    await interaction.editReply({
      embeds: [confirmationEmbed],
      components: [confirmationRow],
    });

    let confirmationInteraction: ButtonInteraction;
    try {
      confirmationInteraction = await response.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (component) => component.user.id === interaction.user.id &&
          (component.customId === confirmId || component.customId === keepId),
        time: 120_000,
      });
    } catch {
      await interaction.editReply({
        embeds: [createErrorEmbed("Confirmation timed out. No schedule changes were saved.")],
        components: [],
      });
      return;
    }

    if (confirmationInteraction.customId === keepId) {
      await confirmationInteraction.update({
        content: isReschedule ? "Kept the existing match time." : "Scheduling cancelled.",
        embeds: [],
        components: [],
      });
      return;
    }
    await confirmationInteraction.deferUpdate();

    const operationId = randomUUID();
    const result = await updateMatchSchedule(
      selectedMatchId,
      proposedDate.toISOString(),
      selectedFixture.scheduledAt
    );
    if (!result.success) {
      await logDiscordAudit({
        interaction,
        operationId,
        command: "schedule",
        action: isReschedule ? "reschedule_match" : "schedule_match",
        entityType: "match",
        entityId: selectedMatchId,
        status: "failure",
        before: { scheduledAt: selectedFixture.scheduledAt },
        after: {
          scheduledAt: proposedDate.toISOString(),
          timezone: selectedTimezone,
          offset: dateOffset,
        },
        error: result.error || "Failed to update schedule.",
      });
      await interaction.editReply({
        embeds: [createErrorEmbed(
          `${result.error || "Failed to update schedule."}\n\nReference: \`${operationId}\``
        )],
        components: [],
      });
      return;
    }

    await logDiscordAudit({
      interaction,
      operationId,
      command: "schedule",
      action: isReschedule ? "reschedule_match" : "schedule_match",
      entityType: "match",
      entityId: selectedMatchId,
      status: "success",
      before: { scheduledAt: selectedFixture.scheduledAt },
      after: {
        scheduledAt: proposedDate.toISOString(),
        timezone: selectedTimezone,
        offset: dateOffset,
      },
    });

    const formatTz = (timezone: SupportedTimezone): string =>
      `${timezoneName(timezone)} (${getTimeZoneOffsetLabel(proposedDate, timezone)}): ` +
      proposedDate.toLocaleString("en-US", {
        timeZone: timezone,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    const commonTimezones = ([
      "America/Los_Angeles",
      "America/New_York",
      "Europe/London",
    ] as const).map(formatTz).join("\n");
    const action = isReschedule ? "Rescheduled" : "Scheduled";
    const successEmbed = new EmbedBuilder()
      .setTitle(`Match ${action}`)
      .setDescription(
        `**${selectedFixture.team1Name}** vs **${selectedFixture.team2Name}**\n` +
        `${weekLabel}\n\n<t:${proposedUnix}:F>\n(<t:${proposedUnix}:R>)`
      )
      .addFields({
        name: "Common Timezones",
        value: commonTimezones,
        inline: false,
      })
      .setColor(0x22c55e)
      .setFooter({ text: `${action} by ${interaction.user.username}` })
      .setTimestamp();

    console.log("[Bot] Match schedule saved:", {
      matchId: selectedMatchId,
      actorDiscordUserId: interaction.user.id,
      before: selectedFixture.scheduledAt,
      after: proposedDate.toISOString(),
      timezone: selectedTimezone,
      dateOffset,
    });

    await interaction.editReply({
      content: `Match ${action.toLowerCase()}! See confirmation below.`,
      embeds: [],
      components: [],
    });
    try {
      await interaction.followUp({ embeds: [successEmbed], ephemeral: false });
    } catch (channelError) {
      console.error("[Bot] Failed to post public schedule confirmation:", channelError);
      await interaction.editReply({
        content: "",
        embeds: [successEmbed],
        components: [],
      });
    }
  } catch (error) {
    console.error("[Bot] Error in /schedule command:", error);
    await interaction.editReply({
      embeds: [createErrorEmbed("An error occurred. Please try again.")],
      components: [],
    });
  }
}
