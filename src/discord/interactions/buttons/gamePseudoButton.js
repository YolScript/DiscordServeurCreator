const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const gameRoleStore = require('../../../kv/gameRoleStore');
const { buildGamePseudoModalId, GAME_PSEUDO_BUTTON_PREFIX } = require('../customIds');

async function handleGamePseudoButton(interaction) {
  const roleId = interaction.customId.slice(GAME_PSEUDO_BUTTON_PREFIX.length);
  const gameRole = await gameRoleStore.findByRoleId(interaction.guild.id, roleId);

  const modal = new ModalBuilder()
    .setCustomId(buildGamePseudoModalId(roleId))
    .setTitle(`Pseudo - ${(gameRole?.displayName ?? 'Jeu').slice(0, 35)}`);

  const input = new TextInputBuilder()
    .setCustomId('pseudo')
    .setLabel('Ton pseudo dans ce jeu')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

module.exports = handleGamePseudoButton;
