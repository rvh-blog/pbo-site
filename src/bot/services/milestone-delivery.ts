import { EmbedBuilder, type Client } from "discord.js";
import { rawClient } from "@/lib/db";
import { ensureMilestoneTables, processMilestoneEvaluationQueue } from "@/lib/milestones";

interface PendingEvent extends Record<string, unknown> {
  event_id: number;
  guild_snowflake: string;
  channel_id: string;
  title: string;
  description: string;
  match_id: number;
}

let deliveryTimer: NodeJS.Timeout | null = null;
let deliveryPollRunning = false;

async function deliverMilestones(client: Client): Promise<void> {
  await ensureMilestoneTables();
  await processMilestoneEvaluationQueue();
  const result = await rawClient.execute(`
    SELECT me.id AS event_id, dg.guild_id AS guild_snowflake, MIN(dc.channel_id) AS channel_id,
      me.title, me.description, me.match_id
    FROM milestone_events me
    JOIN discord_channels dc ON (
        dc.division_id = me.division_id OR
        ((me.category = 'season' OR me.milestone_type = 'season_kill_leader')
          AND dc.division_id IN (SELECT id FROM divisions WHERE season_id = me.season_id))
      )
      AND COALESCE(dc.is_match_report_enabled, 1) = 1
    JOIN discord_guilds dg ON dg.id = dc.guild_id AND COALESCE(dg.is_active, 1) = 1
    LEFT JOIN milestone_deliveries md ON md.event_id = me.id AND md.guild_id = dg.guild_id
    WHERE md.id IS NULL OR (md.status = 'failed' AND md.attempts < 3)
    GROUP BY me.id, dg.guild_id, me.title, me.description, me.match_id
    ORDER BY me.id ASC LIMIT 20
  `);
  for (const event of result.rows as unknown as PendingEvent[]) {
    try {
      const channel = await client.channels.fetch(event.channel_id);
      if (!channel?.isSendable()) throw new Error("Configured channel cannot receive messages");
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://pbo-site.fly.dev";
      await channel.send({
        embeds: [new EmbedBuilder()
          .setTitle(event.title)
          .setDescription(event.description)
          .setColor(0xf59e0b)
          .setURL(`${siteUrl}/matches/${event.match_id}`)
          .setFooter({ text: "PBO Milestone" })
          .setTimestamp()],
      });
      await rawClient.execute({
        sql: `INSERT INTO milestone_deliveries
          (event_id, guild_id, channel_id, status, attempts, sent_at)
          VALUES (?, ?, ?, 'sent', 1, ?)
          ON CONFLICT(event_id, guild_id) DO UPDATE SET
            channel_id = excluded.channel_id, status = 'sent',
            attempts = milestone_deliveries.attempts + 1, last_error = NULL, sent_at = excluded.sent_at`,
        args: [event.event_id, event.guild_snowflake, event.channel_id, new Date().toISOString()],
      });
    } catch (error) {
      await rawClient.execute({
        sql: `INSERT INTO milestone_deliveries
          (event_id, guild_id, channel_id, status, attempts, last_error)
          VALUES (?, ?, ?, 'failed', 1, ?)
          ON CONFLICT(event_id, guild_id) DO UPDATE SET
            status = 'failed', attempts = milestone_deliveries.attempts + 1,
            last_error = excluded.last_error`,
        args: [event.event_id, event.guild_snowflake, event.channel_id,
          error instanceof Error ? error.message : String(error)],
      });
    }
  }
}

export function startMilestoneDelivery(client: Client): void {
  if (deliveryTimer) return;
  const run = async () => {
    if (deliveryPollRunning) return;
    deliveryPollRunning = true;
    try {
      await deliverMilestones(client);
    } catch (error) {
      console.error("[Milestones] Delivery poll failed:", error);
    } finally {
      deliveryPollRunning = false;
    }
  };
  run();
  deliveryTimer = setInterval(run, 30_000);
  deliveryTimer.unref();
}
