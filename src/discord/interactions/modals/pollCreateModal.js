const { MessageFlags } = require('discord.js');
const pollStore = require('../../../kv/pollStore');
const { buildPollEmbed, buildPollComponents } = require('../../engagement/pollManager');

async function handlePollCreateModal(interaction) {
  const question = interaction.fields.getTextInputValue('question').trim();
  const optionsRaw = interaction.fields.getTextInputValue('options');
  const labels = optionsRaw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5);

  if (labels.length < 2) {
    await interaction.reply({ content: 'Il faut au moins 2 options (separees par des virgules, 5 max).', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const poll = await pollStore.add(interaction.guild.id, {
    channelId: interaction.channel.id,
    messageId: null,
    authorId: interaction.user.id,
    question,
    options: labels.map((label) => ({ label, votes: [] })),
    endsAt: null,
    closed: false,
  });

  const message = await interaction.channel.send({ embeds: [buildPollEmbed(poll)], components: buildPollComponents(poll) });
  await pollStore.update(interaction.guild.id, poll.id, (p) => { p.messageId = message.id; });

  await interaction.editReply(`Sondage cree : ${message.url}`);
}

module.exports = handlePollCreateModal;
