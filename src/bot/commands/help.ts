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
    "`/team` — choose a season, division, and coach",
    "`/player` — filter Pokémon performance by season, division, and coach",
    "`/items` — filter revealed-item usage by season, division, and coach",
    "`/matchup` — filter upcoming fixtures by season, division, and coach",
    "`/standings` — filter standings by season, division, and coach",
    "`/status` — bot, website, and database health",
    "`/help` — this command list",
  ];
  const writeCommands = config ? [
    `\`/draft\` — ${config.isDraftEnabled ? "available" : "disabled in this channel"}`,
    `\`/match\` — ${config.isMatchReportEnabled ? "available" : "disabled in this channel"}`,
    "`/schedule` — choose any Schedule Active division",
  ] : [
    "`/draft` and `/match` require a configured division channel.",
    "`/schedule` works here after selecting a Schedule Active division.",
  ];

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setTitle("PBO Bot Help")
      .setDescription(config
        ? `Channel division: **${config.division.name}**`
        : "This channel is not mapped, but information commands can still select their league scope.")
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
