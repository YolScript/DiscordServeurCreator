const { MessageFlags } = require('discord.js');
const tempBanStore = require('../../kv/tempBanStore');
const { postModLog } = require('../moderation/modLog');

async function handleTempbanCommand(interaction) {
  const target = interaction.options.getUser('membre', true);
  const durationHours = interaction.options.getInteger('duree_heures', true);
  const reason = interaction.options.getString('raison') || 'Non precisee';

  await interaction.guild.members.ban(target, { reason });

  const expiresAt = Date.now() + durationHours * 60 * 60 * 1000;
  await tempBanStore.add(interaction.guild.id, {
    userId: target.id, expiresAt, moderatorId: interaction.user.id, reason,
  });

  await postModLog(interaction.guild, {
    title: 'Ban temporaire',
    description: `<@${target.id}> banni par <@${interaction.user.id}> pour ${durationHours}h.`,
    color: 0xe5484d,
    fields: [{ name: 'Raison', value: reason }],
  });

  await interaction.reply({ content: `<@${target.id}> banni pour ${durationHours}h (deban automatique).`, flags: MessageFlags.Ephemeral });
}

module.exports = handleTempbanCommand;
