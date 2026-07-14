const { MessageFlags } = require('discord.js');
const { postTicketPanel } = require('../support/ticketManager');

async function handleTicketPanelCommand(interaction) {
  const channel = interaction.options.getChannel('salon') ?? interaction.channel;
  await postTicketPanel(channel);
  await interaction.reply({ content: `Panneau de ticket poste dans <#${channel.id}>.`, flags: MessageFlags.Ephemeral });
}

module.exports = handleTicketPanelCommand;
