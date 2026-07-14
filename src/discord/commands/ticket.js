const { MessageFlags } = require('discord.js');
const { createTicket } = require('../support/ticketManager');

async function handleTicketCommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { channel, alreadyOpen } = await createTicket(interaction.guild, interaction.member);
  await interaction.editReply(alreadyOpen
    ? `Tu as deja un ticket ouvert : <#${channel.id}>`
    : `Ticket cree : <#${channel.id}>`);
}

module.exports = handleTicketCommand;
