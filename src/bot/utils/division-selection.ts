import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import {
  getChannelConfig,
  getCurrentDivisions,
  getPublicDivisions,
  type SelectableDivision,
} from "../services/discord-config";
import { createErrorEmbed } from "./embeds";

interface SelectDivisionOptions {
  customId: string;
  title: string;
  description?: string;
}

interface SeasonOption {
  id: number;
  name: string;
  number: number;
  isCurrent: boolean;
}

const BACK_SELECTION = "__back__";

async function awaitSelection(
  interaction: ChatInputCommandInteraction,
  customId: string,
  title: string,
  description: string,
  options: Array<{
    label: string;
    description?: string;
    value: string;
    default?: boolean;
  }>,
  defaultValue?: string
): Promise<string | null> {
  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(description)
      .addOptions(options.slice(0, 25))
  );
  const confirmId = `${customId}_confirm`;
  const backId = `${customId}_back`;
  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmId)
      .setLabel("Confirm Selection")
      .setStyle(ButtonStyle.Success)
      .setDisabled(defaultValue === undefined),
    new ButtonBuilder()
      .setCustomId(backId)
      .setLabel("Back")
      .setStyle(ButtonStyle.Danger)
  );
  const response = await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setTitle(title)
      .setDescription(
        `${description}\n\nUse **Confirm Selection** to accept the highlighted option.`
      )
      .setColor(0x6366f1)],
    components: [selectRow, buttonRow],
  });

  try {
    const selected = await response.awaitMessageComponent({
      filter: (component) =>
        component.user.id === interaction.user.id &&
        (
          component.customId === customId ||
          component.customId === confirmId ||
          component.customId === backId
        ),
      time: 120_000,
    });
    await selected.deferUpdate();
    if (selected.customId === backId) return BACK_SELECTION;
    if (selected.customId === confirmId) return defaultValue ?? null;
    return selected.isStringSelectMenu() ? selected.values[0] : null;
  } catch {
    await interaction.editReply({
      embeds: [createErrorEmbed("Selection timed out. Run the command again.")],
      components: [],
    });
    return null;
  }
}

async function selectDivisionFromList(
  interaction: ChatInputCommandInteraction,
  divisions: SelectableDivision[],
  options: SelectDivisionOptions,
  includeSeasonStep: boolean
): Promise<SelectableDivision | null> {
  if (divisions.length === 0) {
    await interaction.editReply({
      embeds: [createErrorEmbed("No public divisions are available.")],
      components: [],
    });
    return null;
  }

  const channelConfig = await getChannelConfig(interaction.channelId);
  let availableDivisions = divisions;
  let canReturnToSeason = false;
  if (includeSeasonStep) {
    const seasonMap = new Map<number, SeasonOption>();
    for (const division of divisions) {
      seasonMap.set(division.seasonId, {
        id: division.seasonId,
        name: division.seasonName,
        number: division.seasonNumber,
        isCurrent: division.isCurrent,
      });
    }
    const seasonOptions = [...seasonMap.values()].sort(
      (a, b) => b.number - a.number || a.name.localeCompare(b.name)
    );
    let selectedSeasonId: number;
    if (seasonOptions.length === 1) {
      selectedSeasonId = seasonOptions[0].id;
    } else {
      canReturnToSeason = true;
      const mappedSeasonId = divisions.find(
        (division) => division.id === channelConfig?.divisionId
      )?.seasonId;
      const defaultSeasonId =
        mappedSeasonId ??
        seasonOptions.find((season) => season.isCurrent)?.id;
      const selectedSeason = await awaitSelection(
        interaction,
        `${options.customId}_season`,
        options.title,
        "Select a season",
        seasonOptions.map((season) => ({
          label: `Season ${season.number}`.slice(0, 100),
          description: `${season.name}${season.isCurrent ? " • Current" : ""}`.slice(0, 100),
          value: String(season.id),
          default: season.id === defaultSeasonId,
        })),
        defaultSeasonId === undefined ? undefined : String(defaultSeasonId)
      );
      if (!selectedSeason) return null;
      if (selectedSeason === BACK_SELECTION) {
        await interaction.editReply({
          content: "Selection cancelled.",
          embeds: [],
          components: [],
        });
        return null;
      }
      selectedSeasonId = Number(selectedSeason);
    }
    availableDivisions = divisions.filter(
      (division) => division.seasonId === selectedSeasonId
    );
  }

  if (availableDivisions.length === 1) return availableDivisions[0];

  const defaultDivisionId = availableDivisions.some(
    (division) => division.id === channelConfig?.divisionId
  )
    ? channelConfig?.divisionId
    : undefined;
  const selectedDivision = await awaitSelection(
    interaction,
    `${options.customId}_division`,
    options.title,
    options.description ?? "Select a division",
    availableDivisions.map((division) => ({
      label: division.name.slice(0, 100),
      description: `Season ${division.seasonNumber} • ${division.seasonName}`.slice(0, 100),
      value: String(division.id),
      default: division.id === defaultDivisionId,
    })),
    defaultDivisionId === undefined ? undefined : String(defaultDivisionId)
  );
  if (!selectedDivision) return null;
  if (selectedDivision === BACK_SELECTION) {
    if (canReturnToSeason) {
      return selectDivisionFromList(
        interaction,
        divisions,
        options,
        includeSeasonStep
      );
    }
    await interaction.editReply({
      content: "Selection cancelled.",
      embeds: [],
      components: [],
    });
    return null;
  }
  return availableDivisions.find(
    (division) => division.id === Number(selectedDivision)
  ) ?? null;
}

export async function selectCurrentDivision(
  interaction: ChatInputCommandInteraction,
  options: SelectDivisionOptions
): Promise<SelectableDivision | null> {
  return selectDivisionFromList(
    interaction,
    await getCurrentDivisions(),
    options,
    false
  );
}

export async function selectPublicDivision(
  interaction: ChatInputCommandInteraction,
  options: SelectDivisionOptions
): Promise<SelectableDivision | null> {
  return selectDivisionFromList(
    interaction,
    await getPublicDivisions(),
    options,
    true
  );
}
