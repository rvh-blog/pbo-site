import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  type InteractionReplyOptions,
  type Message,
} from "discord.js";

export function resultVisibilityRow(
  customIdPrefix: string
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}_private`)
      .setLabel("Keep Private")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}_public`)
      .setLabel("Share Publicly")
      .setStyle(ButtonStyle.Success)
  );
}

export async function handleResultVisibility(
  interaction: ChatInputCommandInteraction,
  response: Message,
  customIdPrefix: string,
  publicPayload: InteractionReplyOptions
): Promise<void> {
  try {
    const selected = await response.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (component) =>
        component.user.id === interaction.user.id &&
        (
          component.customId === `${customIdPrefix}_private` ||
          component.customId === `${customIdPrefix}_public`
        ),
      time: 120_000,
    });
    await selected.deferUpdate();
    if (selected.customId === `${customIdPrefix}_public`) {
      await interaction.followUp({
        ...publicPayload,
        components: [],
        ephemeral: false,
      });
    }
    await interaction.editReply({ components: [] });
  } catch {
    await interaction.editReply({ components: [] }).catch(() => undefined);
  }
}
