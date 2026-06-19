import { EmbedBuilder } from "discord.js";
import type { EloEntry, StandingsEntry, KillsEntry } from "../services/stats-service";

// PBO brand color (match the website's primary color)
const PRIMARY_COLOR = 0x6366f1; // Indigo

/**
 * Create an ELO leaderboard embed
 */
export function createEloEmbed(
  title: string,
  entries: EloEntry[]
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(PRIMARY_COLOR)
    .setTimestamp();

  if (entries.length === 0) {
    embed.setDescription("No data available.");
    return embed;
  }

  const description = entries
    .map((e) => `\`${e.rank.toString().padStart(2, " ")}.\` **${e.name}** — ${e.elo}`)
    .join("\n");

  embed.setDescription(description);
  return embed;
}

/**
 * Create a single coach ELO embed
 */
export function createCoachEloEmbed(
  name: string,
  elo: number,
  rank: number
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`${name}'s ELO`)
    .setColor(PRIMARY_COLOR)
    .addFields(
      { name: "Rating", value: elo.toString(), inline: true },
      { name: "Rank", value: `#${rank}`, inline: true }
    )
    .setTimestamp();
}

/**
 * Create a standings embed
 */
export function createStandingsEmbed(
  seasonName: string,
  divisionName: string,
  teams: StandingsEntry[]
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`${seasonName} ${divisionName} Standings`)
    .setColor(PRIMARY_COLOR)
    .setTimestamp();

  if (teams.length === 0) {
    embed.setDescription("No standings data available.");
    return embed;
  }

  const description = teams
    .map((t) => {
      const diff = t.differential > 0 ? `+${t.differential}` : t.differential.toString();
      return `\`${t.rank.toString().padStart(2, " ")}.\` **${t.teamName}** ${t.wins}-${t.losses} (${diff})`;
    })
    .join("\n");

  embed.setDescription(description);
  return embed;
}

/**
 * Create a kills leaderboard embed
 */
export function createKillsEmbed(
  title: string,
  entries: KillsEntry[]
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(PRIMARY_COLOR)
    .setTimestamp();

  if (entries.length === 0) {
    embed.setDescription("No kill data available.");
    return embed;
  }

  const description = entries
    .map((e) => {
      return `\`${e.rank.toString().padStart(2, " ")}.\` **${e.pokemonName}** — ${e.kills} kills (${e.kd} K/D)`;
    })
    .join("\n");

  embed.setDescription(description);
  return embed;
}

/**
 * Create an error embed
 */
export function createErrorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("Error")
    .setDescription(message)
    .setColor(0xef4444); // Red
}

/**
 * Create a success embed
 */
export function createSuccessEmbed(
  title: string,
  description: string
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(0x22c55e); // Green
}
