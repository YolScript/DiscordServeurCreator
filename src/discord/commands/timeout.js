const { MessageFlags } = require('discord.js');
const { postModLog } = require('../moderation/modLog');

async function handleTimeoutCommand(interaction) {
  const target = interaction.options.getMember('membre');
  const minutes = interaction.options.getInteger('minutes', true);
  const reason = interaction.options.getString('raison') || 'Non precisee';

  if (!target) {
    await interaction.reply({ content: 'Membre introuvable sur ce serveur.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!target.moderatable) {
    await interaction.reply({ content: 'Je ne peux pas timeout ce membre (hierarchie ou permissions).', flags: MessageFlags.Ephemeral });
    return;
  }

  await target.timeout(minutes * 60 * 1000, reason);

  await postModLog(interaction.guild, {
    title: 'Timeout',
    description: `<@${target.id}> mis en timeout par <@${interaction.user.id}> pour ${minutes} minute(s).`,
    color: 0xe5484d,
    fields: [{ name: 'Raison', value: reason }],
  });

  await interaction.reply({ content: `<@${target.id}> en timeout pour ${minutes} minute(s).`, flags: MessageFlags.Ephemeral });
}

module.exports = handleTimeoutCommand;
