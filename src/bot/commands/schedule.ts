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
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { getChannelConfig } from "../services/discord-config";

function getWeekLabel(week: number): string {
  if (week === 101) return "Quarterfinals";
  if (week === 102) return "Semifinals";
  if (week === 103) return "Finals";
  return `Week ${week}`;
}
import {
  getWeeksInDivision,
  getFixturesForWeek,
  updateMatchSchedule,
} from "../services/match-service";
import { createErrorEmbed } from "../utils/embeds";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const data = new SlashCommandBuilder()
  .setName("schedule")
  .setDescription("Set or update a match scheduled time");

export async function execute(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  // Defer reply immediately for cold start compatibility
  await interaction.deferReply({ ephemeral: true });

  try {
    // Get channel config
    const config = await getChannelConfig(interaction.channelId);

    if (!config) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "This channel is not configured for a division. Ask an admin to set it up in the Discord config."
          ),
        ],
      });
      return;
    }

    if (!config.isScheduleEnabled) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            `Match scheduling is not enabled for ${config.division.name}.`
          ),
        ],
      });
      return;
    }

    // Get available weeks
    const weeks = await getWeeksInDivision(config.divisionId);

    if (weeks.length === 0) {
      await interaction.editReply({
        embeds: [createErrorEmbed("No fixtures found for this division.")],
      });
      return;
    }

    // Build week select menu
    const weekSelect = new StringSelectMenuBuilder()
      .setCustomId("schedule_week_select")
      .setPlaceholder("Select a week")
      .addOptions(
        weeks.slice(0, 25).map((w) => ({
          label: getWeekLabel(w),
          value: w.toString(),
        }))
      );

    const weekRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(weekSelect);

    const embed = new EmbedBuilder()
      .setTitle(`Schedule Match - ${config.division.name}`)
      .setDescription("**Step 1/3:** Select the week")
      .setColor(0x6366f1);

    const response = await interaction.editReply({
      embeds: [embed],
      components: [weekRow],
    });

    // Wait for week selection
    let weekInteraction: StringSelectMenuInteraction;
    try {
      weekInteraction = await response.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (i) => i.user.id === interaction.user.id,
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

    const selectedWeek = parseInt(weekInteraction.values[0]);

    // Get fixtures for selected week (only unplayed matches)
    const allFixtures = await getFixturesForWeek(config.divisionId, selectedWeek);
    const fixtures = allFixtures.filter((f) => !f.hasResult);

    if (fixtures.length === 0) {
      await interaction.editReply({
        embeds: [createErrorEmbed("All matches in this week have already been played.")],
        components: [],
      });
      return;
    }

    // Build fixture select menu - show current schedule status
    const fixtureSelect = new StringSelectMenuBuilder()
      .setCustomId("schedule_fixture_select")
      .setPlaceholder("Select a match")
      .addOptions(
        fixtures.slice(0, 25).map((f) => {
          let label = `${f.team1Name} vs ${f.team2Name}`;
          let description: string | undefined;
          if (f.scheduledAt) {
            const date = new Date(f.scheduledAt);
            description = `Currently: ${date.toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZoneName: "short",
            })}`;
          } else {
            description = "Not scheduled";
          }
          return {
            label,
            description,
            value: f.matchId.toString(),
          };
        })
      );

    const fixtureRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(fixtureSelect);

    const weekLabel = getWeekLabel(selectedWeek);
    const fixtureEmbed = new EmbedBuilder()
      .setTitle(`Schedule Match - ${config.division.name}`)
      .setDescription(`**Step 2/3:** Select the match (${weekLabel})`)
      .setColor(0x6366f1);

    await interaction.editReply({
      embeds: [fixtureEmbed],
      components: [fixtureRow],
    });

    // Wait for fixture selection
    let fixtureInteraction: StringSelectMenuInteraction;
    try {
      fixtureInteraction = await response.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (i) => i.user.id === interaction.user.id,
        time: 120_000,
      });
    } catch {
      await interaction.editReply({
        embeds: [createErrorEmbed("Selection timed out. Please try again.")],
        components: [],
      });
      return;
    }

    const selectedMatchId = parseInt(fixtureInteraction.values[0]);
    const selectedFixture = fixtures.find((f) => f.matchId === selectedMatchId);

    if (!selectedFixture) {
      await fixtureInteraction.update({
        embeds: [createErrorEmbed("Match not found.")],
        components: [],
      });
      return;
    }

    await fixtureInteraction.deferUpdate();

    // Build day select menu - next 7 days + custom
    const now = new Date();
    const dayOptions = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(now);
      date.setDate(now.getDate() + i);
      const dayName = DAY_NAMES[date.getDay()];
      const monthDay = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      dayOptions.push({
        label: dayName,
        description: monthDay,
        value: `day_${i}`, // days from now
      });
    }
    dayOptions.push({
      label: "Custom Date",
      description: "Enter a specific date",
      value: "custom",
    });

    const daySelect = new StringSelectMenuBuilder()
      .setCustomId("schedule_day_select")
      .setPlaceholder("Select a day")
      .addOptions(dayOptions);

    const dayRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(daySelect);

    const dayEmbed = new EmbedBuilder()
      .setTitle(`Schedule Match - ${config.division.name}`)
      .setDescription(
        `**Step 3/3:** Select the day\n\n` +
        `**${selectedFixture.team1Name}** vs **${selectedFixture.team2Name}**`
      )
      .setColor(0x6366f1);

    await interaction.editReply({
      embeds: [dayEmbed],
      components: [dayRow],
    });

    // Wait for day selection
    let dayInteraction: StringSelectMenuInteraction;
    try {
      dayInteraction = await response.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (i) => i.user.id === interaction.user.id,
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

    // Calculate selected date (if not custom)
    let selectedDate: Date | null = null;
    if (!isCustomDate) {
      const daysFromNow = parseInt(dayValue.replace("day_", ""));
      selectedDate = new Date(now);
      selectedDate.setDate(now.getDate() + daysFromNow);
    }

    // Show time modal (with or without date field)
    const modal = new ModalBuilder()
      .setCustomId("schedule_time_modal")
      .setTitle("Set Match Time");

    // Pre-fill with existing time if available
    let defaultDate = "";
    let defaultTime = "";
    if (selectedFixture.scheduledAt) {
      const d = new Date(selectedFixture.scheduledAt);
      defaultDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      defaultTime = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }

    if (isCustomDate) {
      const dateInput = new TextInputBuilder()
        .setCustomId("schedule_date")
        .setLabel("Date (YYYY-MM-DD)")
        .setPlaceholder("2025-01-15")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(10)
        .setMaxLength(10);
      if (defaultDate) dateInput.setValue(defaultDate);
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(dateInput));
    }

    const timeInput = new TextInputBuilder()
      .setCustomId("schedule_time")
      .setLabel("Time in your local time (24hr, e.g., 19:00)")
      .setPlaceholder("19:00")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(5)
      .setMaxLength(5);
    if (defaultTime) timeInput.setValue(defaultTime);

    const timezoneInput = new TextInputBuilder()
      .setCustomId("schedule_timezone")
      .setLabel("Your timezone offset (e.g., -5, +0, +2)")
      .setPlaceholder("-5")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(3)
      .setValue("-5"); // Default to EST

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(timeInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(timezoneInput)
    );

    await dayInteraction.showModal(modal);

    // Wait for modal submission
    let modalInteraction: ModalSubmitInteraction;
    try {
      modalInteraction = await dayInteraction.awaitModalSubmit({
        filter: (i) => i.customId === "schedule_time_modal" && i.user.id === interaction.user.id,
        time: 300_000, // 5 minutes
      });
    } catch {
      await interaction.editReply({
        embeds: [createErrorEmbed("Modal timed out. Please try again.")],
        components: [],
      });
      return;
    }

    await modalInteraction.deferUpdate();

    const timeStr = modalInteraction.fields.getTextInputValue("schedule_time").trim();
    const tzOffsetStr = modalInteraction.fields.getTextInputValue("schedule_timezone").trim();

    // Parse 24-hour time format (e.g., "19:00", "09:30")
    const timeMatch = timeStr.match(/^(\d{2}):(\d{2})$/);
    const tzMatch = tzOffsetStr.match(/^([+-]?)(\d{1,2})$/);

    if (!timeMatch) {
      await interaction.editReply({
        embeds: [createErrorEmbed("Invalid time format. Use HH:MM (e.g., 19:00).")],
        components: [],
      });
      return;
    }

    if (!tzMatch) {
      await interaction.editReply({
        embeds: [createErrorEmbed("Invalid timezone offset. Use format like -5, +0, +2.")],
        components: [],
      });
      return;
    }

    const hour = parseInt(timeMatch[1]);
    const minute = parseInt(timeMatch[2]);
    const tzSign = tzMatch[1] === "-" ? -1 : 1;
    const tzHours = parseInt(tzMatch[2]) * tzSign;

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      await interaction.editReply({
        embeds: [createErrorEmbed("Invalid time values.")],
        components: [],
      });
      return;
    }

    // Get date (from dropdown selection or custom input)
    let year: number, month: number, day: number;

    if (isCustomDate) {
      const dateStr = modalInteraction.fields.getTextInputValue("schedule_date");
      const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);

      if (!dateMatch) {
        await interaction.editReply({
          embeds: [createErrorEmbed("Invalid date format. Use YYYY-MM-DD.")],
          components: [],
        });
        return;
      }

      year = parseInt(dateMatch[1]);
      month = parseInt(dateMatch[2]) - 1; // 0-indexed
      day = parseInt(dateMatch[3]);

      if (month < 0 || month > 11 || day < 1 || day > 31) {
        await interaction.editReply({
          embeds: [createErrorEmbed("Invalid date values.")],
          components: [],
        });
        return;
      }
    } else {
      year = selectedDate!.getFullYear();
      month = selectedDate!.getMonth();
      day = selectedDate!.getDate();
    }

    // Create date in UTC, then adjust for user's timezone offset
    // User's local time = UTC + tzHours, so UTC = local time - tzHours
    // Use Date.UTC to avoid server timezone issues
    const utcTimestamp = Date.UTC(year, month, day, hour, minute, 0);
    const utcDate = new Date(utcTimestamp - tzHours * 60 * 60 * 1000);
    const isoString = utcDate.toISOString();

    // Update the schedule
    const result = await updateMatchSchedule(selectedMatchId, isoString);

    if (!result.success) {
      await interaction.editReply({
        embeds: [createErrorEmbed(result.error || "Failed to update schedule.")],
        components: [],
      });
      return;
    }

    // Build success embed with Discord timestamp and common timezones
    const unixTimestamp = Math.floor(utcDate.getTime() / 1000);

    // Format for common timezones
    const formatTz = (tz: string): string | null => {
      try {
        const label = utcDate.toLocaleString("en-US", {
          timeZone: tz,
          timeZoneName: "short",
        }).split(", ").pop()?.split(" ").pop() || tz;
        const formatted = utcDate.toLocaleString("en-US", {
          timeZone: tz,
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        return `${label}: ${formatted}`;
      } catch (e) {
        console.error(`[Bot] Error formatting timezone ${tz}:`, e);
        return null;
      }
    };

    let timezones = "Unable to calculate";
    try {
      const tzList = [
        formatTz("America/Los_Angeles"),
        formatTz("America/New_York"),
        formatTz("Europe/London"),
      ].filter((t): t is string => t !== null);
      if (tzList.length > 0) {
        timezones = tzList.join("\n");
      }
    } catch (e) {
      console.error("[Bot] Error building timezone list:", e);
    }

    // Log the computed values for debugging
    console.log("[Bot] Schedule saved:", {
      matchId: selectedMatchId,
      utcDate: utcDate.toISOString(),
      unixTimestamp,
      timezones,
    });

    // Build and send success message - with fallback if embed fails
    try {
      const successEmbed = new EmbedBuilder()
        .setTitle("Match Scheduled")
        .setDescription(
          `**${selectedFixture.team1Name}** vs **${selectedFixture.team2Name}**\n` +
          `${weekLabel}\n\n` +
          `<t:${unixTimestamp}:F>\n` +
          `(<t:${unixTimestamp}:R>)`
        )
        .addFields({
          name: "Common Timezones",
          value: timezones,
          inline: false,
        })
        .setColor(0x22c55e)
        .setFooter({ text: `Scheduled by ${interaction.user.username}` })
        .setTimestamp();

      // Clear the ephemeral interaction UI
      await interaction.editReply({
        content: "Match scheduled! See confirmation below.",
        embeds: [],
        components: [],
      });

      // Post public confirmation to channel using followUp
      try {
        await interaction.followUp({
          embeds: [successEmbed],
          ephemeral: false,
        });
      } catch (channelError) {
        console.error("[Bot] Failed to post public confirmation:", channelError);
        // Fallback: show in ephemeral reply
        await interaction.editReply({
          embeds: [successEmbed],
          components: [],
        });
      }
    } catch (embedError) {
      // Embed failed - try simple text response
      console.error("[Bot] Embed creation/send failed:", embedError);
      await interaction.editReply({
        content: `Match scheduled for <t:${unixTimestamp}:F> (<t:${unixTimestamp}:R>)`,
        embeds: [],
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
