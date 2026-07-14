const { MessageFlags } = require('discord.js');
const pollStore = require('../../kv/pollStore');
const { buildPollEmbed, buildPollComponents } = require('../engagement/pollManager');

async function handlePollCommand(interaction) {
  const question = interaction.options.getString('question', true);
  const optionsRaw = interaction.options.getString('options', true);
  const durationMinutes = interaction.options.getInteger('duree_minutes', true);

  const labels = optionsRaw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5);
  if (labels.length < 2) {
    await interaction.reply({ content: 'Il faut au moins 2 options (separees par des virgules, 5 max).', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply();

  const poll = await pollStore.add(interaction.guild.id, {
    channelId: interaction.channel.id,
    messageId: null,
    question,
    options: labels.map((label) => ({ label, votes: [] })),
    endsAt: Date.now() + durationMinutes * 60 * 1000,
    closed: false,
  });

  const message = await interaction.editReply({ embeds: [buildPollEmbed(poll)], components: buildPollComponents(poll) });

  await pollStore.update(interaction.guild.id, poll.id, (p) => { p.messageId = message.id; });
}

module.exports = handlePollCommand;
