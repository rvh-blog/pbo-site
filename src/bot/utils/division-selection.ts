import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  ComponentType,
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
  }>
): Promise<string | null> {
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(description)
      .addOptions(options.slice(0, 25))
  );
  const response = await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(0x6366f1)],
    components: [row],
  });

  try {
    const selected = await response.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      filter: (component) =>
        component.user.id === interaction.user.id &&
        component.customId === customId,
      time: 120_000,
    });
    await selected.deferUpdate();
    return selected.values[0];
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
        }))
      );
      if (!selectedSeason) return null;
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
    }))
  );
  if (!selectedDivision) return null;
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
