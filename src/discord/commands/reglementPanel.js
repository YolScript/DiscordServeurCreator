const { MessageFlags } = require('discord.js');
const { postReglementPanel } = require('../roles/reglementPanel');

async function handleReglementPanelCommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const message = await postReglementPanel(interaction.guild);
  await interaction.editReply(message
    ? `Reglement mis a jour dans <#${message.channelId}>.`
    : "Aucun salon reglement configure (lance /setup ou definis-le depuis le dashboard).");
}

module.exports = handleReglementPanelCommand;
