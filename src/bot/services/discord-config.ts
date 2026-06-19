import { db } from "@/lib/db";
import { discordChannels, discordGuilds } from "@/lib/schema";
import { eq } from "drizzle-orm";

export interface ChannelConfig {
  id: number;
  channelId: string;
  channelName: string | null;
  divisionId: number;
  isDraftEnabled: boolean;
  isMatchReportEnabled: boolean;
  isScheduleEnabled: boolean;
  guild: {
    id: number;
    guildId: string;
    name: string;
  };
  division: {
    id: number;
    name: string;
    seasonId: number;
  };
}

/**
 * Get channel configuration by Discord channel ID
 */
export async function getChannelConfig(
  channelId: string
): Promise<ChannelConfig | null> {
  const result = await db.query.discordChannels.findFirst({
    where: eq(discordChannels.channelId, channelId),
    with: {
      guild: true,
      division: true,
    },
  });

  if (!result || !result.guild || !result.division) {
    return null;
  }

  return {
    id: result.id,
    channelId: result.channelId,
    channelName: result.channelName,
    divisionId: result.divisionId,
    isDraftEnabled: result.isDraftEnabled ?? false,
    isMatchReportEnabled: result.isMatchReportEnabled ?? true,
    isScheduleEnabled: result.isScheduleEnabled ?? true,
    guild: {
      id: result.guild.id,
      guildId: result.guild.guildId,
      name: result.guild.name,
    },
    division: {
      id: result.division.id,
      name: result.division.name,
      seasonId: result.division.seasonId,
    },
  };
}

/**
 * Get all channel configs for a guild
 */
export async function getGuildChannels(guildId: string) {
  const guild = await db.query.discordGuilds.findFirst({
    where: eq(discordGuilds.guildId, guildId),
    with: {
      channels: {
        with: {
          division: true,
        },
      },
    },
  });

  return guild?.channels || [];
}
