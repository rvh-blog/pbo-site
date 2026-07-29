import { db } from "@/lib/db";
import {
  discordChannels,
  discordGuilds,
  divisions,
  seasons,
} from "@/lib/schema";
import { asc, desc, eq } from "drizzle-orm";

export interface ChannelConfig {
  id: number;
  channelId: string;
  channelName: string | null;
  divisionId: number;
  isDraftEnabled: boolean;
  isMatchReportEnabled: boolean;
  isScheduleEnabled: boolean;
  isMilestoneEnabled: boolean;
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

export interface SelectableDivision {
  id: number;
  name: string;
  seasonId: number;
  seasonName: string;
  seasonNumber: number;
  isCurrent: boolean;
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
    isMilestoneEnabled: result.isMilestoneEnabled ?? false,
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

/**
 * Get every public division in the current season(s). Commands that make live
 * changes use this list so historical divisions cannot be selected.
 */
export async function getCurrentDivisions(): Promise<SelectableDivision[]> {
  const publicDivisions = await getPublicDivisions();
  return publicDivisions.filter((division) => division.isCurrent);
}

/**
 * Get every division in a public season for historical information commands.
 */
export async function getPublicDivisions(): Promise<SelectableDivision[]> {
  return db
    .select({
      id: divisions.id,
      name: divisions.name,
      seasonId: divisions.seasonId,
      seasonName: seasons.name,
      seasonNumber: seasons.seasonNumber,
      isCurrent: seasons.isCurrent,
    })
    .from(divisions)
    .innerJoin(seasons, eq(divisions.seasonId, seasons.id))
    .where(eq(seasons.isPublic, true))
    .orderBy(
      desc(seasons.seasonNumber),
      asc(divisions.displayOrder),
      asc(divisions.name)
    )
    .then((rows) => rows.map((row) => ({
      ...row,
      isCurrent: row.isCurrent ?? false,
    })));
}
