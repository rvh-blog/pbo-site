import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  ComponentType,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import {
  getDivisionTeams,
  type TeamSummary,
} from "../services/read-service";
import { createErrorEmbed } from "./embeds";

export interface CoachScope {
  team: TeamSummary | null;
}

interface SelectCoachOptions {
  customId: string;
  divisionId: number;
  divisionName: string;
  title: string;
  allowAll?: boolean;
}

export async function selectCoachScope(
  interaction: ChatInputCommandInteraction,
  options: SelectCoachOptions
): Promise<CoachScope | null> {
  const teams = await getDivisionTeams(options.divisionId);
  if (teams.length === 0) {
    await interaction.editReply({
      embeds: [createErrorEmbed("No active coaches were found in this division.")],
      components: [],
    });
    return null;
  }

  if (teams.length === 1 && !options.allowAll) {
    return { team: teams[0] };
  }

  const menuOptions = [
    ...(options.allowAll ? [{
      label: "All Coaches",
      description: `Show division-wide results for ${options.divisionName}`.slice(0, 100),
      value: "all",
      default: true,
    }] : []),
    ...teams.slice(0, options.allowAll ? 24 : 25).map((team) => ({
      label: team.coachName.slice(0, 100),
      description: team.teamName.slice(0, 100),
      value: String(team.id),
      default: false,
    })),
  ];
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(options.customId)
      .setPlaceholder("Select a coach or use All Coaches")
      .addOptions(menuOptions)
  );
  const response = await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setTitle(options.title)
      .setDescription(
        options.allowAll
          ? "Choose **All Coaches** for division-wide results, or select one coach to narrow the results."
          : "Select the coach whose team you want to view."
      )
      .setColor(0x6366f1)],
    components: [row],
  });

  try {
    const selected = await response.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      filter: (component) =>
        component.user.id === interaction.user.id &&
        component.customId === options.customId,
      time: 120_000,
    });
    await selected.deferUpdate();
    if (selected.values[0] === "all") return { team: null };
    const team = teams.find((entry) => entry.id === Number(selected.values[0]));
    return team ? { team } : null;
  } catch {
    await interaction.editReply({
      embeds: [createErrorEmbed("Coach selection timed out. Run the command again.")],
      components: [],
    });
    return null;
  }
}
