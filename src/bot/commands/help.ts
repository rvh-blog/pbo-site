import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { getChannelConfig } from "../services/discord-config";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Show PBO bot commands available in this channel");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const config = await getChannelConfig(interaction.channelId);
  const readCommands = [
    "`/team` — roster, budget, record, and next match",
    "`/player` — Pokémon performance and revealed items",
    "`/items` — division-wide revealed-item usage",
    "`/matchup` — compare an upcoming fixture",
    "`/standings` — current division standings",
    "`/status` — bot, website, and database health",
    "`/help` — this command list",
  ];
  const writeCommands = config ? [
    `\`/draft\` — ${config.isDraftEnabled ? "available" : "disabled in this channel"}`,
    `\`/match\` — ${config.isMatchReportEnabled ? "available" : "disabled in this channel"}`,
    `\`/schedule\` — ${config.isScheduleEnabled ? "available" : "disabled in this channel"}`,
  ] : [
    "`/draft`, `/match`, and `/schedule` require a configured division channel.",
  ];

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setTitle("PBO Bot Help")
      .setDescription(config
        ? `Channel division: **${config.division.name}**`
        : "This channel is not mapped to a PBO division.")
      .addFields(
        {
          name: "League Information",
          value: readCommands.join("\n"),
        },
        {
          name: "League Changes",
          value: writeCommands.join("\n"),
        }
      )
      .setFooter({ text: "Information commands are read-only." })
      .setColor(0x6366f1)],
  });
}
