import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type StringSelectMenuInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { getChannelConfig } from "../services/discord-config";
import {
  getTeamsInDivision,
  getAvailablePokemon,
  addDraftPick,
  getPokemonDetails,
  getTeamDetails,
  findPokemonOwner,
} from "../services/draft-service";
import { createErrorEmbed, createSuccessEmbed } from "../utils/embeds";

export const data = new SlashCommandBuilder()
  .setName("draft")
  .setDescription("Add a draft pick to a team roster");

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

    if (!config.isDraftEnabled) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            `Draft is not currently active for ${config.division.name}. An admin must enable it first.`
          ),
        ],
      });
      return;
    }

    // Get teams in division
    const teams = await getTeamsInDivision(config.divisionId);

    if (teams.length === 0) {
      await interaction.editReply({
        embeds: [createErrorEmbed("No active teams found in this division.")],
      });
      return;
    }

    // Build team select menu
    const teamSelect = new StringSelectMenuBuilder()
      .setCustomId("draft_team_select")
      .setPlaceholder("Select a team")
      .addOptions(
        teams.slice(0, 25).map((t) => ({
          label: t.teamName,
          description: `${t.coachName} | Budget: ${t.remainingBudget}`,
          value: t.id.toString(),
        }))
      );

    const teamRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(teamSelect);

    const embed = new EmbedBuilder()
      .setTitle(`Draft Pick - ${config.division.name}`)
      .setDescription("**Step 1/3:** Select the team making this pick")
      .setColor(0x6366f1);

    const response = await interaction.editReply({
      embeds: [embed],
      components: [teamRow],
    });

    // Wait for team selection
    let teamInteraction: StringSelectMenuInteraction;
    try {
      teamInteraction = await response.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (i) => i.user.id === interaction.user.id,
        time: 120_000, // 2 minutes
      });
    } catch {
      await interaction.editReply({
        embeds: [createErrorEmbed("Selection timed out. Please try again.")],
        components: [],
      });
      return;
    }

    await teamInteraction.deferUpdate();

    const selectedTeamId = parseInt(teamInteraction.values[0]);
    const selectedTeam = teams.find((t) => t.id === selectedTeamId);

    if (!selectedTeam) {
      await interaction.editReply({
        embeds: [createErrorEmbed("Team not found.")],
        components: [],
      });
      return;
    }

    // Step 2: Pokemon search via modal
    const searchButton = new ButtonBuilder()
      .setCustomId("draft_search_pokemon")
      .setLabel("Search Pokemon")
      .setStyle(ButtonStyle.Primary);

    const cancelEarlyButton = new ButtonBuilder()
      .setCustomId("draft_cancel_early")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary);

    const searchRow = new ActionRowBuilder<ButtonBuilder>().addComponents(searchButton, cancelEarlyButton);

    const pokemonEmbed = new EmbedBuilder()
      .setTitle(`Draft Pick - ${config.division.name}`)
      .setDescription(
        `**Step 2/3:** Search for a Pokemon\n\n` +
        `**Team:** ${selectedTeam.teamName}\n` +
        `**Budget:** ${selectedTeam.remainingBudget} pts\n\n` +
        `Click the button below to search for a Pokemon by name.`
      )
      .setColor(0x6366f1);

    await interaction.editReply({
      embeds: [pokemonEmbed],
      components: [searchRow],
    });

    // Wait for search button click
    let searchButtonInteraction: ButtonInteraction;
    try {
      searchButtonInteraction = await response.awaitMessageComponent({
        componentType: ComponentType.Button,
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

    if (searchButtonInteraction.customId === "draft_cancel_early") {
      await searchButtonInteraction.update({
        embeds: [createErrorEmbed("Draft pick cancelled.")],
        components: [],
      });
      return;
    }

    // Show Pokemon search modal
    const searchModal = new ModalBuilder()
      .setCustomId("draft_pokemon_search_modal")
      .setTitle("Search Pokemon");

    const pokemonInput = new TextInputBuilder()
      .setCustomId("pokemon_name")
      .setLabel("Pokemon Name")
      .setPlaceholder("e.g., Charizard, Garchomp, Pikachu...")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(2)
      .setMaxLength(50);

    const modalRow = new ActionRowBuilder<TextInputBuilder>().addComponents(pokemonInput);
    searchModal.addComponents(modalRow);

    await searchButtonInteraction.showModal(searchModal);

    // Wait for modal submission
    let modalInteraction: ModalSubmitInteraction;
    try {
      modalInteraction = await searchButtonInteraction.awaitModalSubmit({
        filter: (i) => i.customId === "draft_pokemon_search_modal" && i.user.id === interaction.user.id,
        time: 120_000,
      });
    } catch {
      await interaction.editReply({
        embeds: [createErrorEmbed("Search timed out. Please try again.")],
        components: [],
      });
      return;
    }

    await modalInteraction.deferUpdate();

    const searchQuery = modalInteraction.fields.getTextInputValue("pokemon_name").trim();

    // Search for matching Pokemon
    const availablePokemon = await getAvailablePokemon(config.divisionId, searchQuery);

    if (availablePokemon.length === 0) {
      // Check if the Pokemon is already drafted by someone
      const owner = await findPokemonOwner(config.divisionId, searchQuery);

      if (owner) {
        await interaction.editReply({
          embeds: [createErrorEmbed(
            `**${owner.pokemonName}** is already drafted by **${owner.teamName}** (${owner.coachName}).`
          )],
          components: [],
        });
      } else {
        await interaction.editReply({
          embeds: [createErrorEmbed(`No available Pokemon found matching "${searchQuery}". Please try again with /draft.`)],
          components: [],
        });
      }
      return;
    }

    // If multiple matches, show select menu (now limited to search results)
    let selectedPokemon = availablePokemon[0];

    if (availablePokemon.length > 1) {
      const pokemonSelect = new StringSelectMenuBuilder()
        .setCustomId("draft_pokemon_select")
        .setPlaceholder("Select from matching Pokemon")
        .addOptions(
          availablePokemon.slice(0, 25).map((p) => ({
            label: `${p.displayName || p.name} - ${p.price}pts`,
            description: p.teraCaptainCost !== null ? `TC Cost: +${p.teraCaptainCost}` : "No TC available",
            value: p.id.toString(),
          }))
        );

      const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(pokemonSelect);

      const matchEmbed = new EmbedBuilder()
        .setTitle(`Draft Pick - ${config.division.name}`)
        .setDescription(
          `Found ${availablePokemon.length} Pokemon matching "${searchQuery}".\n` +
          `Select one from the list below:`
        )
        .setColor(0x6366f1);

      await interaction.editReply({
        embeds: [matchEmbed],
        components: [selectRow],
      });

      let pokemonSelectInteraction: StringSelectMenuInteraction;
      try {
        pokemonSelectInteraction = await response.awaitMessageComponent({
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

      await pokemonSelectInteraction.deferUpdate();

      const selectedPokemonId = parseInt(pokemonSelectInteraction.values[0]);
      const found = availablePokemon.find((p) => p.id === selectedPokemonId);
      if (!found) {
        await interaction.editReply({
          embeds: [createErrorEmbed("Pokemon not found.")],
          components: [],
        });
        return;
      }
      selectedPokemon = found;
    }

    if (!selectedPokemon) {
      await interaction.editReply({
        embeds: [createErrorEmbed("Pokemon not found.")],
        components: [],
      });
      return;
    }

    // Step 3: Tera Captain toggle and confirm
    const canBeTeraCaptain = selectedPokemon.teraCaptainCost !== null;
    const baseCost = selectedPokemon.price;
    const tcCost = selectedPokemon.teraCaptainCost || 0;

    // Build confirmation buttons
    const confirmButton = new ButtonBuilder()
      .setCustomId("draft_confirm")
      .setLabel(`Confirm (${baseCost} pts)`)
      .setStyle(ButtonStyle.Success);

    const tcButton = new ButtonBuilder()
      .setCustomId("draft_confirm_tc")
      .setLabel(`Confirm as Tera Captain (${baseCost + tcCost} pts)`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!canBeTeraCaptain);

    const cancelButton = new ButtonBuilder()
      .setCustomId("draft_cancel")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary);

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      confirmButton,
      tcButton,
      cancelButton
    );

    const confirmEmbed = new EmbedBuilder()
      .setTitle(`Draft Pick - ${config.division.name}`)
      .setDescription(
        `**Step 3/3:** Confirm draft pick\n\n` +
        `**Team:** ${selectedTeam.teamName}\n` +
        `**Pokemon:** ${selectedPokemon.displayName || selectedPokemon.name}\n` +
        `**Base Cost:** ${baseCost} pts\n` +
        (canBeTeraCaptain ? `**Tera Captain Cost:** +${tcCost} pts\n` : "") +
        `\n**Budget:** ${selectedTeam.remainingBudget} pts`
      )
      .setColor(0x6366f1);

    // Only set thumbnail if it's a full URL (Discord requires http/https)
    if (selectedPokemon.spriteUrl?.startsWith("http")) {
      confirmEmbed.setThumbnail(selectedPokemon.spriteUrl);
    }

    await interaction.editReply({
      embeds: [confirmEmbed],
      components: [buttonRow],
    });

    // Wait for button click
    let buttonInteraction: ButtonInteraction;
    try {
      buttonInteraction = await response.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === interaction.user.id,
        time: 60_000,
      });
    } catch {
      await interaction.editReply({
        embeds: [createErrorEmbed("Confirmation timed out. Please try again.")],
        components: [],
      });
      return;
    }

    await buttonInteraction.deferUpdate();

    if (buttonInteraction.customId === "draft_cancel") {
      await interaction.editReply({
        embeds: [createErrorEmbed("Draft pick cancelled.")],
        components: [],
      });
      return;
    }

    const isTeraCaptain = buttonInteraction.customId === "draft_confirm_tc";
    const totalCost = baseCost + (isTeraCaptain ? tcCost : 0);

    // Execute the draft pick
    const result = await addDraftPick({
      seasonCoachId: selectedTeamId,
      pokemonId: selectedPokemon.id,
      price: baseCost,
      isTeraCaptain,
      teraCaptainCost: tcCost,
    });

    if (!result.success) {
      await interaction.editReply({
        embeds: [createErrorEmbed(result.error || "Failed to add draft pick.")],
        components: [],
      });
      return;
    }

    // Success!
    const successEmbed = createSuccessEmbed(
      "Draft Pick Confirmed!",
      `**${selectedTeam.teamName}** drafted **${selectedPokemon.displayName || selectedPokemon.name}**` +
      (isTeraCaptain ? " as **Tera Captain**" : "") +
      ` for **${totalCost}** pts.\n\n` +
      `Remaining budget: **${selectedTeam.remainingBudget - totalCost}** pts`
    );

    if (selectedPokemon.spriteUrl?.startsWith("http")) {
      successEmbed.setThumbnail(selectedPokemon.spriteUrl);
    }

    await interaction.editReply({
      embeds: [successEmbed],
      components: [],
    });

    // Also post public confirmation to the channel
    if (interaction.channel && "send" in interaction.channel) {
      await interaction.channel.send({ embeds: [successEmbed] });
    }
  } catch (error) {
    console.error("[Bot] Error in /draft command:", error);
    await interaction.editReply({
      embeds: [createErrorEmbed("An error occurred. Please try again.")],
      components: [],
    });
  }
}
