import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
  type ButtonInteraction,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { getChannelConfig } from "../services/discord-config";
import { logDiscordAudit } from "../services/discord-audit";

function getWeekLabel(week: number): string {
  if (week === 101) return "Quarterfinals";
  if (week === 102) return "Semifinals";
  if (week === 103) return "Finals";
  return `Week ${week}`;
}

function spoiler(text: string): string {
  return `||${text.replaceAll("||", "\\|\\|")}||`;
}

import {
  getWeeksInDivision,
  getFixturesForWeek,
  getMatchDetails,
  parseReplay,
  matchUsernamesToCoaches,
  recordMatchResult,
  buildPokemonDataFromReplay,
  validateReplayRosterMatches,
} from "../services/match-service";
import { createErrorEmbed } from "../utils/embeds";

export const data = new SlashCommandBuilder()
  .setName("match")
  .setDescription("Record a match result");

export async function execute(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  // Defer reply immediately for cold start compatibility
  await interaction.deferReply({ ephemeral: true });

  try {
    // Get channel config
    const config = await getChannelConfig(interaction.channelId);

    if (!config) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "This channel is not configured for a division. Ask an admin to set it up in the Discord config."
          ),
        ],
      });
      return;
    }

    if (!config.isMatchReportEnabled) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            `Match reporting is not enabled for ${config.division.name}.`
          ),
        ],
      });
      return;
    }

    // Get available weeks
    const weeks = await getWeeksInDivision(config.divisionId);

    if (weeks.length === 0) {
      await interaction.editReply({
        embeds: [createErrorEmbed("No fixtures found for this division.")],
      });
      return;
    }

    // Build week select menu
    const weekSelect = new StringSelectMenuBuilder()
      .setCustomId("match_week_select")
      .setPlaceholder("Select a week")
      .addOptions(
        weeks.slice(0, 25).map((w) => ({
          label: getWeekLabel(w),
          value: w.toString(),
        }))
      );

    const weekRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(weekSelect);

    const embed = new EmbedBuilder()
      .setTitle(`Match Report - ${config.division.name}`)
      .setDescription("**Step 1/2:** Select the week")
      .setColor(0x6366f1);

    const response = await interaction.editReply({
      embeds: [embed],
      components: [weekRow],
    });

    // Wait for week selection
    let weekInteraction: StringSelectMenuInteraction;
    try {
      weekInteraction = await response.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (i) => i.user.id === interaction.user.id,
        time: 120_000,
      });
    } catch {
      await interaction.editReply({
        embeds: [createErrorEmbed("Selection timed out. Please try again.")],
        components: [],
      });
      return;
    }

    await weekInteraction.deferUpdate();

    const selectedWeek = parseInt(weekInteraction.values[0]);

    // Get fixtures for selected week
    const fixtures = await getFixturesForWeek(config.divisionId, selectedWeek);

    if (fixtures.length === 0) {
      await interaction.editReply({
        embeds: [createErrorEmbed("No fixtures found for this week.")],
        components: [],
      });
      return;
    }

    // Filter to only show fixtures without results
    const unreportedFixtures = fixtures.filter((f) => !f.hasResult);

    if (unreportedFixtures.length === 0) {
      await interaction.editReply({
        embeds: [createErrorEmbed("All fixtures for this week have already been reported.")],
        components: [],
      });
      return;
    }

    // Build fixture select menu
    const fixtureSelect = new StringSelectMenuBuilder()
      .setCustomId("match_fixture_select")
      .setPlaceholder("Select a match")
      .addOptions(
        unreportedFixtures.slice(0, 25).map((f) => ({
          label: `${f.team1Name} vs ${f.team2Name}`,
          value: f.matchId.toString(),
        }))
      );

    const fixtureRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(fixtureSelect);

    const weekLabel = getWeekLabel(selectedWeek);
    const fixtureEmbed = new EmbedBuilder()
      .setTitle(`Match Report - ${config.division.name}`)
      .setDescription(`**Step 2/2:** Select the match (${weekLabel})`)
      .setColor(0x6366f1);

    await interaction.editReply({
      embeds: [fixtureEmbed],
      components: [fixtureRow],
    });

    // Wait for fixture selection
    let fixtureInteraction: StringSelectMenuInteraction;
    try {
      fixtureInteraction = await response.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (i) => i.user.id === interaction.user.id,
        time: 120_000,
      });
    } catch {
      await interaction.editReply({
        embeds: [createErrorEmbed("Selection timed out. Please try again.")],
        components: [],
      });
      return;
    }

    const selectedMatchId = parseInt(fixtureInteraction.values[0]);
    const matchDetails = await getMatchDetails(selectedMatchId);

    if (!matchDetails) {
      await fixtureInteraction.update({
        embeds: [createErrorEmbed("Match not found.")],
        components: [],
      });
      return;
    }

    // Check if match was already reported (race condition protection)
    if (matchDetails.winnerId) {
      await fixtureInteraction.update({
        embeds: [createErrorEmbed("This match has already been reported.")],
        components: [],
      });
      return;
    }

    // Show replay URL modal directly
    const modal = new ModalBuilder()
      .setCustomId("match_replay_modal")
      .setTitle("Enter Replay URL");

    const replayInput = new TextInputBuilder()
      .setCustomId("replay_url")
      .setLabel("Pokemon Showdown Replay URL")
      .setPlaceholder("https://replay.pokemonshowdown.com/...")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const modalRow = new ActionRowBuilder<TextInputBuilder>().addComponents(replayInput);
    modal.addComponents(modalRow);

    await fixtureInteraction.showModal(modal);

    // Wait for modal submission
    let modalInteraction: ModalSubmitInteraction;
    try {
      modalInteraction = await fixtureInteraction.awaitModalSubmit({
        filter: (i) => i.customId === "match_replay_modal" && i.user.id === interaction.user.id,
        time: 300_000, // 5 minutes for modal
      });
    } catch {
      await interaction.editReply({
        embeds: [createErrorEmbed("Modal timed out. Please try again.")],
        components: [],
      });
      return;
    }

    await modalInteraction.deferUpdate();

    const replayUrl = modalInteraction.fields.getTextInputValue("replay_url");

    // Parse the replay
    const processingEmbed = new EmbedBuilder()
      .setTitle("Processing Replay...")
      .setDescription("Parsing the replay data...")
      .setColor(0xfbbf24);

    await interaction.editReply({
      embeds: [processingEmbed],
      components: [],
    });

    const replayData = await parseReplay(replayUrl);

    if (!replayData) {
      await interaction.editReply({
        embeds: [createErrorEmbed("Could not parse the replay. Please check the URL and try again.")],
        components: [],
      });
      return;
    }

    if (!replayData.winner) {
      await interaction.editReply({
        embeds: [createErrorEmbed("Could not determine a winner from the replay.")],
        components: [],
      });
      return;
    }

    // Match usernames to coaches using roster-based matching (time-synced to match week)
    const mapping = await matchUsernamesToCoaches(
      matchDetails.coach1SeasonId,
      matchDetails.coach2SeasonId,
      replayData.p1Username,
      replayData.p2Username,
      replayData.p1Team,
      replayData.p2Team,
      selectedWeek
    );

    // Map replay data to our coach ordering
    const coach1Remaining = mapping.p1IsCoach1 ? replayData.p1Remaining : replayData.p2Remaining;
    const coach2Remaining = mapping.p1IsCoach1 ? replayData.p2Remaining : replayData.p1Remaining;
    const coach1Team = mapping.p1IsCoach1 ? replayData.p1Team : replayData.p2Team;
    const coach2Team = mapping.p1IsCoach1 ? replayData.p2Team : replayData.p1Team;

    // Determine winner
    let winnerId: number;
    if (replayData.winner === "p1") {
      winnerId = mapping.p1IsCoach1 ? matchDetails.coach1SeasonId : matchDetails.coach2SeasonId;
    } else {
      winnerId = mapping.p1IsCoach1 ? matchDetails.coach2SeasonId : matchDetails.coach1SeasonId;
    }

    // Calculate differentials: winner gets positive (their remaining), loser gets negative (of winner's remaining)
    const coach1Diff = winnerId === matchDetails.coach1SeasonId ? coach1Remaining : -coach2Remaining;
    const coach2Diff = winnerId === matchDetails.coach2SeasonId ? coach2Remaining : -coach1Remaining;

    const winnerName = winnerId === matchDetails.coach1SeasonId
      ? matchDetails.team1Name
      : matchDetails.team2Name;

    // Calculate score display (winner remaining - loser remaining)
    const winnerRemaining = winnerId === matchDetails.coach1SeasonId ? coach1Remaining : coach2Remaining;
    const loserRemaining = winnerId === matchDetails.coach1SeasonId ? coach2Remaining : coach1Remaining;

    // Build Pokemon data from replay (time-synced to match week)
    const pokemonData = await buildPokemonDataFromReplay(
      matchDetails.coach1SeasonId,
      matchDetails.coach2SeasonId,
      replayData,
      mapping.p1IsCoach1,
      selectedWeek
    );
    const rosterValidation = await validateReplayRosterMatches(
      matchDetails.coach1SeasonId,
      matchDetails.coach2SeasonId,
      replayData,
      mapping.p1IsCoach1,
      selectedWeek
    );

    // Double-check match hasn't been reported while we were processing (race condition)
    const freshMatchDetails = await getMatchDetails(selectedMatchId);
    if (freshMatchDetails?.winnerId) {
      await interaction.editReply({
        embeds: [createErrorEmbed("This match was already reported by another user.")],
        components: [],
      });
      return;
    }

    const validationWarnings: string[] = [];
    if (!mapping.matched) {
      validationWarnings.push(
        "Replay players could not be confidently mapped to the selected fixture."
      );
    }
    if (rosterValidation.coach1Unmatched.length > 0) {
      validationWarnings.push(
        `${matchDetails.team1Name} unmatched: ${rosterValidation.coach1Unmatched.join(", ")}`
      );
    }
    if (rosterValidation.coach2Unmatched.length > 0) {
      validationWarnings.push(
        `${matchDetails.team2Name} unmatched: ${rosterValidation.coach2Unmatched.join(", ")}`
      );
    }
    if (replayData.zoroarkInvolved) {
      validationWarnings.push(
        "Zoroark was detected; K/D attribution may require manual review."
      );
    }

    const replayChecks = [
      mapping.matched
        ? "✅ Replay players match the selected fixture"
        : "⚠️ Replay player mapping needs review",
      rosterValidation.coach1Unmatched.length === 0 &&
      rosterValidation.coach2Unmatched.length === 0
        ? `✅ All ${pokemonData.length} replay Pokémon matched the Week ${selectedWeek} rosters`
        : "⚠️ One or more replay Pokémon did not match the Week roster",
      "✅ This fixture has not already been recorded",
      replayData.zoroarkInvolved
        ? "⚠️ Zoroark detected; review K/D attribution"
        : "✅ No Illusion-related stat warning",
    ];
    const confirmId = `match_confirm_${selectedMatchId}`;
    const reviewId = `match_review_${selectedMatchId}`;
    const cancelId = `match_cancel_${selectedMatchId}`;
    const confirmationRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel(
          validationWarnings.length > 0 ? "Confirm with Warnings" : "Confirm Result"
        )
        .setStyle(
          validationWarnings.length > 0 ? ButtonStyle.Danger : ButtonStyle.Success
        ),
      new ButtonBuilder()
        .setCustomId(reviewId)
        .setLabel("Review Pokémon")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(cancelId)
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary)
    );
    const confirmationEmbed = new EmbedBuilder()
      .setTitle("🏆 Confirm Match Result")
      .setDescription(
        `**${winnerName}** defeated ${
          winnerId === matchDetails.coach1SeasonId
            ? matchDetails.team2Name
            : matchDetails.team1Name
        }\n${weekLabel} — ${config.division.name}`
      )
      .addFields(
        {
          name: "Score",
          value: `${winnerName}: ${winnerRemaining}\nLoser: ${loserRemaining}`,
          inline: true,
        },
        {
          name: "Differential",
          value:
            `${matchDetails.team1Name}: ${coach1Diff >= 0 ? "+" : ""}${coach1Diff}\n` +
            `${matchDetails.team2Name}: ${coach2Diff >= 0 ? "+" : ""}${coach2Diff}`,
          inline: true,
        },
        {
          name: "Replay checks",
          value: replayChecks.join("\n").slice(0, 1024),
          inline: false,
        }
      )
      .setColor(validationWarnings.length > 0 ? 0xeab308 : 0x22c55e);

    await interaction.editReply({
      embeds: [confirmationEmbed],
      components: [confirmationRow],
    });

    let confirmed = false;
    while (!confirmed) {
      let confirmationInteraction: ButtonInteraction;
      try {
        confirmationInteraction = await response.awaitMessageComponent({
          componentType: ComponentType.Button,
          filter: (component) =>
            component.user.id === interaction.user.id &&
            [confirmId, reviewId, cancelId].includes(component.customId),
          time: 120_000,
        });
      } catch {
        await interaction.editReply({
          embeds: [createErrorEmbed(
            "Confirmation timed out. The match result was not saved."
          )],
          components: [],
        });
        return;
      }

      if (confirmationInteraction.customId === cancelId) {
        await confirmationInteraction.update({
          content: "Match reporting cancelled. No result was saved.",
          embeds: [],
          components: [],
        });
        return;
      }
      if (confirmationInteraction.customId === reviewId) {
        const formatReviewTeam = (
          username: string,
          team: typeof replayData.p1Team,
          unmatched: string[]
        ) => {
          const unmatchedSet = new Set(unmatched);
          return [
            `Replay user: **${username}**`,
            ...team.map((pokemon) =>
              `${unmatchedSet.has(pokemon.name) ? "⚠️" : "✅"} ${pokemon.name} — ` +
              `${pokemon.kills}K/${pokemon.deaths}D`
            ),
          ].join("\n").slice(0, 1024);
        };
        const coach1Username = mapping.p1IsCoach1
          ? replayData.p1Username
          : replayData.p2Username;
        const coach2Username = mapping.p1IsCoach1
          ? replayData.p2Username
          : replayData.p1Username;
        await confirmationInteraction.update({
          embeds: [new EmbedBuilder()
            .setTitle("🔎 Replay Pokémon Review")
            .setDescription(
              validationWarnings.length > 0
                ? validationWarnings.map((warning) => `⚠️ ${warning}`).join("\n")
                : "Every replay Pokémon matched the selected fixture's Week roster."
            )
            .addFields(
              {
                name: matchDetails.team1Name,
                value: formatReviewTeam(
                  coach1Username,
                  coach1Team,
                  rosterValidation.coach1Unmatched
                ),
                inline: true,
              },
              {
                name: matchDetails.team2Name,
                value: formatReviewTeam(
                  coach2Username,
                  coach2Team,
                  rosterValidation.coach2Unmatched
                ),
                inline: true,
              },
              {
                name: "Replay",
                value: `[Open Pokémon Showdown replay](${replayUrl})`,
                inline: false,
              }
            )
            .setColor(validationWarnings.length > 0 ? 0xeab308 : 0x6366f1)],
          components: [confirmationRow],
        });
        continue;
      }

      await confirmationInteraction.deferUpdate();
      confirmed = true;
    }

    // Check again after confirmation in case another reporter saved it while
    // this user was reviewing the replay.
    const matchBeforeWrite = await getMatchDetails(selectedMatchId);
    if (matchBeforeWrite?.winnerId) {
      await interaction.editReply({
        embeds: [createErrorEmbed(
          "This match was already reported by another user. No duplicate result was saved."
        )],
        components: [],
      });
      return;
    }

    // Record the result with Pokemon stats, timing, and damage tracking data
    const operationId = randomUUID();
    const result = await recordMatchResult(
      selectedMatchId,
      winnerId,
      coach1Diff,
      coach2Diff,
      replayUrl,
      pokemonData,
      replayData.startedAt,
      replayData.endedAt,
      replayData.turnSnapshots,
      replayData.keyEvents,
      replayData.zoroarkInvolved
    );

    if (!result.success) {
      await logDiscordAudit({
        interaction,
        operationId,
        command: "match",
        action: "record_match_result",
        entityType: "match",
        entityId: selectedMatchId,
        status: "failure",
        before: {
          winnerId: matchDetails.winnerId,
          replayUrl: matchDetails.replayUrl,
        },
        after: {
          winnerId,
          coach1Differential: coach1Diff,
          coach2Differential: coach2Diff,
          replayUrl,
          pokemonRows: pokemonData.length,
        },
        error: result.error || "Failed to record match result.",
      });
      await interaction.editReply({
        embeds: [createErrorEmbed(
          `${result.error || "Failed to record match result."}\n\nReference: \`${operationId}\``
        )],
        components: [],
      });
      return;
    }

    await logDiscordAudit({
      interaction,
      operationId,
      command: "match",
      action: "record_match_result",
      entityType: "match",
      entityId: selectedMatchId,
      status: "success",
      before: {
        winnerId: matchDetails.winnerId,
        replayUrl: matchDetails.replayUrl,
      },
      after: {
        winnerId,
        winnerName,
        coach1Differential: coach1Diff,
        coach2Differential: coach2Diff,
        replayUrl,
        pokemonRows: pokemonData.length,
      },
    });

    // Build K/D summary for each team
    const formatKD = (team: { name: string; kills: number; deaths: number }[]) => {
      return team
        .map((p) => spoiler(`${p.name}: ${p.kills}K/${p.deaths}D`))
        .join("\n");
    };

    // Success message with full details
    const successEmbed = new EmbedBuilder()
      .setTitle("Match Result")
      .setDescription(
        `**${matchDetails.team1Name}** vs **${matchDetails.team2Name}**\n\n` +
        `**Winner:** ${spoiler(`${winnerName} (${winnerRemaining}-${loserRemaining})`)}`
      )
      .addFields(
        {
          name: "\u200b",
          value: [
            spoiler(`**${matchDetails.team1Name} (${coach1Diff > 0 ? "+" : ""}${coach1Diff})**`),
            formatKD(coach1Team) || spoiler("No data"),
          ].join("\n"),
          inline: true,
        },
        {
          name: "\u200b",
          value: [
            spoiler(`**${matchDetails.team2Name} (${coach2Diff > 0 ? "+" : ""}${coach2Diff})**`),
            formatKD(coach2Team) || spoiler("No data"),
          ].join("\n"),
          inline: true,
        }
      )
      .setColor(0x22c55e)
      .setFooter({ text: `Reported by ${interaction.user.username}` })
      .setTimestamp();

    if (!mapping.matched) {
      successEmbed.setDescription(
        successEmbed.data.description + "\n\n⚠️ *Could not auto-match players - please verify*"
      );
    }

    // Add Zoroark warning if involved (Illusion causes inaccurate K/D tracking)
    if (replayData.zoroarkInvolved) {
      successEmbed.setDescription(
        successEmbed.data.description + "\n\n⚠️ *Zoroark detected - K/D stats may be inaccurate due to Illusion. Please verify manually.*"
      );
      successEmbed.setColor(0xeab308); // Yellow warning color
    }

    // Add replay link as a field at the bottom
    successEmbed.addFields({
      name: "Replay",
      value: `[View on Pokemon Showdown](${replayUrl})`,
      inline: false,
    });

    await interaction.editReply({
      embeds: [successEmbed],
      components: [],
    });

    // Also post public confirmation to the channel
    if (interaction.channel && "send" in interaction.channel) {
      await interaction.channel.send({ embeds: [successEmbed] });
    }

  } catch (error) {
    console.error("[Bot] Error in /match command:", error);
    await interaction.editReply({
      embeds: [createErrorEmbed("An error occurred. Please try again.")],
      components: [],
    });
  }
}
