const { MessageFlags } = require('discord.js');
const { postPollPanel } = require('../engagement/pollManager');

async function handlePollPanelCommand(interaction) {
  const channel = interaction.options.getChannel('salon') ?? interaction.channel;
  await postPollPanel(channel);
  await interaction.reply({ content: `Panneau de sondage poste dans <#${channel.id}>.`, flags: MessageFlags.Ephemeral });
}

module.exports = handlePollPanelCommand;
