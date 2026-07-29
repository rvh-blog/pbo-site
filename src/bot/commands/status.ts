import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import {
  getBotDiagnostics,
  getBotStatus,
  type ServiceCheck,
} from "../services/status-service";
import { createErrorEmbed } from "../utils/embeds";

export const data = new SlashCommandBuilder()
  .setName("status")
  .setDescription("Check PBO bot and website health")
  .addBooleanOption((option) =>
    option
      .setName("details")
      .setDescription("Show moderator diagnostics")
      .setRequired(false)
  );

function formatDuration(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  return [
    days > 0 ? `${days}d` : null,
    hours > 0 ? `${hours}h` : null,
    `${minutes}m`,
  ].filter(Boolean).join(" ");
}

function serviceLine(name: string, check: ServiceCheck): string {
  return `${check.ok ? "🟢" : "🔴"} ${name}: ${check.ok ? "Healthy" : "Unavailable"}` +
    (check.latencyMs > 0 ? ` — ${check.latencyMs} ms` : "");
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const wantsDetails = interaction.options.getBoolean("details") ?? false;
  const canViewDetails = interaction.memberPermissions?.has(
    PermissionFlagsBits.ManageGuild
  ) ?? false;

  if (wantsDetails && !canViewDetails) {
    await interaction.editReply({
      embeds: [createErrorEmbed(
        "Detailed diagnostics require the Manage Server permission."
      )],
    });
    return;
  }

  const status = await getBotStatus(interaction.client);
  const healthy = status.database.ok && status.website.ok;
  const embed = new EmbedBuilder()
    .setTitle(`${healthy ? "🟢" : "🟡"} PBO Bot Status`)
    .setDescription([
      "🟢 Bot: Online",
      serviceLine("Website", status.website),
      serviceLine("Database", status.database),
      `🟢 Discord latency: ${status.discordLatencyMs} ms`,
    ].join("\n"))
    .addFields(
      {
        name: "Uptime",
        value: formatDuration(status.uptimeSeconds),
        inline: true,
      },
      {
        name: "Commands loaded",
        value: String(status.loadedCommands),
        inline: true,
      }
    )
    .setColor(healthy ? 0x22c55e : 0xeab308)
    .setTimestamp();

  if (wantsDetails) {
    const diagnostics = await getBotDiagnostics(
      interaction.client,
      interaction.guild
    );
    const registered = diagnostics.globalCommandCount === null
      ? "Unavailable"
      : `${diagnostics.globalCommandCount} global / ` +
        `${diagnostics.guildCommandCount ?? "?"} server`;
    embed
      .setTitle("🛠️ PBO Bot Diagnostics")
      .addFields(
        {
          name: "Process",
          value:
            `Memory: ${Math.round(status.memoryBytes / 1024 / 1024)} MB\n` +
            `Registered: ${registered}\n` +
            `Duplicate commands: ${
              diagnostics.duplicateCommandNames.length > 0
                ? diagnostics.duplicateCommandNames.join(", ")
                : "None"
            }`,
          inline: false,
        },
        {
          name: "Recent audited changes",
          value:
            `Last hour: ${diagnostics.commandsLastHour}\n` +
            `Failures: ${diagnostics.failuresLastHour}\n` +
            `Latest failure: ${
              diagnostics.lastFailureOperationId
                ? `/${diagnostics.lastFailureCommand} — \`${diagnostics.lastFailureOperationId}\``
                : "None"
            }`,
          inline: false,
        }
      );
  }

  await interaction.editReply({ embeds: [embed] });
}
