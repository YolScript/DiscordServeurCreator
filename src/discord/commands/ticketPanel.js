const { MessageFlags } = require('discord.js');
const { postTicketPanel } = require('../support/ticketManager');
const guildConfigStore = require('../../kv/guildConfigStore');

async function handleTicketPanelCommand(interaction) {
  const channel = interaction.options.getChannel('salon') ?? interaction.channel;
  await postTicketPanel(channel);
  await guildConfigStore.upsert(interaction.guild.id, { ticketPanelChannelId: channel.id });
  await interaction.reply({ content: `Panneau de ticket poste dans <#${channel.id}>.`, flags: MessageFlags.Ephemeral });
}

module.exports = handleTicketPanelCommand;
