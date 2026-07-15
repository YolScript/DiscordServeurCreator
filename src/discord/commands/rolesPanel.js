const { MessageFlags } = require('discord.js');
const rolesMessageManager = require('../roles/rolesMessageManager');

async function handleRolesPanelCommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await rolesMessageManager.refresh(interaction.guild);
  await interaction.editReply('Salon #roles mis a jour.');
}

module.exports = handleRolesPanelCommand;
