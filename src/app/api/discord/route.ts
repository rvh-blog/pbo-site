import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { discordGuilds, discordChannels, divisions, seasons } from "@/lib/schema";
import { eq, desc } from "drizzle-orm";
import { compareDivisionNames } from "@/lib/division-order";

// GET - Fetch Discord configuration
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  try {
    if (type === "guilds") {
      // Get all guilds with their channels
      const guilds = await db.query.discordGuilds.findMany({
        with: {
          channels: {
            with: {
              division: {
                with: {
                  season: true,
                },
              },
            },
          },
        },
      });
      return NextResponse.json(guilds);
    }

    if (type === "divisions") {
      // Get all divisions for dropdown (active seasons only)
      const allDivisions = await db
        .select({
          id: divisions.id,
          name: divisions.name,
          seasonId: divisions.seasonId,
          seasonName: seasons.name,
          seasonNumber: seasons.seasonNumber,
        })
        .from(divisions)
        .innerJoin(seasons, eq(divisions.seasonId, seasons.id))
        .orderBy(desc(seasons.seasonNumber), divisions.displayOrder);

      allDivisions.sort(
        (a, b) =>
          b.seasonNumber - a.seasonNumber ||
          compareDivisionNames(a.name, b.name),
      );

      return NextResponse.json(allDivisions);
    }

    // Default: return all config
    const guilds = await db.query.discordGuilds.findMany({
      with: {
        channels: {
          with: {
            division: {
              with: {
                season: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ guilds });
  } catch (error) {
    console.error("Error fetching Discord config:", error);
    return NextResponse.json(
      { error: "Failed to fetch Discord configuration" },
      { status: 500 }
    );
  }
}

// POST - Create or update Discord configuration
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...data } = body;

    switch (action) {
      case "addGuild": {
        const { guildId, name } = data;
        if (!guildId || !name) {
          return NextResponse.json(
            { error: "Missing guildId or name" },
            { status: 400 }
          );
        }

        const [guild] = await db
          .insert(discordGuilds)
          .values({
            guildId,
            name,
            createdAt: new Date().toISOString(),
          })
          .returning();

        return NextResponse.json(guild);
      }

      case "updateGuild": {
        const { id, name, isActive } = data;
        if (!id) {
          return NextResponse.json(
            { error: "Missing guild id" },
            { status: 400 }
          );
        }

        const [updated] = await db
          .update(discordGuilds)
          .set({
            ...(name !== undefined && { name }),
            ...(isActive !== undefined && { isActive }),
          })
          .where(eq(discordGuilds.id, id))
          .returning();

        return NextResponse.json(updated);
      }

      case "deleteGuild": {
        const { id } = data;
        if (!id) {
          return NextResponse.json(
            { error: "Missing guild id" },
            { status: 400 }
          );
        }

        // Delete all channels first
        await db
          .delete(discordChannels)
          .where(eq(discordChannels.guildId, id));

        // Then delete guild
        await db
          .delete(discordGuilds)
          .where(eq(discordGuilds.id, id));

        return NextResponse.json({ success: true });
      }

      case "addChannel": {
        const { guildId, channelId, channelName, divisionId, isDraftEnabled, isMatchReportEnabled } = data;
        if (!guildId || !channelId || !divisionId) {
          return NextResponse.json(
            { error: "Missing required fields" },
            { status: 400 }
          );
        }

        const [channel] = await db
          .insert(discordChannels)
          .values({
            guildId,
            channelId,
            channelName,
            divisionId,
            isDraftEnabled: isDraftEnabled ?? false,
            isMatchReportEnabled: isMatchReportEnabled ?? true,
          })
          .returning();

        return NextResponse.json(channel);
      }

      case "updateChannel": {
        const { id, channelId, channelName, divisionId, isDraftEnabled, isMatchReportEnabled } = data;
        if (!id) {
          return NextResponse.json(
            { error: "Missing channel id" },
            { status: 400 }
          );
        }

        const { isScheduleEnabled } = data;
        const [updated] = await db
          .update(discordChannels)
          .set({
            ...(channelId !== undefined && { channelId }),
            ...(channelName !== undefined && { channelName }),
            ...(divisionId !== undefined && { divisionId }),
            ...(isDraftEnabled !== undefined && { isDraftEnabled }),
            ...(isMatchReportEnabled !== undefined && { isMatchReportEnabled }),
            ...(isScheduleEnabled !== undefined && { isScheduleEnabled }),
          })
          .where(eq(discordChannels.id, id))
          .returning();

        return NextResponse.json(updated);
      }

      case "deleteChannel": {
        const { id } = data;
        if (!id) {
          return NextResponse.json(
            { error: "Missing channel id" },
            { status: 400 }
          );
        }

        await db
          .delete(discordChannels)
          .where(eq(discordChannels.id, id));

        return NextResponse.json({ success: true });
      }

      case "toggleDraft": {
        const { id, enabled } = data;
        if (!id || enabled === undefined) {
          return NextResponse.json(
            { error: "Missing id or enabled value" },
            { status: 400 }
          );
        }

        const [updated] = await db
          .update(discordChannels)
          .set({ isDraftEnabled: enabled })
          .where(eq(discordChannels.id, id))
          .returning();

        return NextResponse.json(updated);
      }

      default:
        return NextResponse.json(
          { error: "Invalid action" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Error updating Discord config:", error);
    return NextResponse.json(
      { error: "Failed to update Discord configuration" },
      { status: 500 }
    );
  }
}
