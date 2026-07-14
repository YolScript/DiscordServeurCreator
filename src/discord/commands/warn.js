const { MessageFlags } = require('discord.js');
const warnStore = require('../../kv/warnStore');
const { postModLog } = require('../moderation/modLog');

async function handleWarnCommand(interaction) {
  const target = interaction.options.getUser('membre', true);
  const reason = interaction.options.getString('raison', true);

  const warns = await warnStore.add(interaction.guild.id, target.id, {
    reason, moderatorId: interaction.user.id, source: 'manuel',
  });

  await postModLog(interaction.guild, {
    title: 'Avertissement',
    description: `<@${target.id}> averti par <@${interaction.user.id}>.`,
    color: 0xd3a13a,
    fields: [{ name: 'Raison', value: reason }, { name: 'Total avertissements', value: String(warns.length) }],
  });

  await target.send(`Tu as recu un avertissement sur **${interaction.guild.name}** : ${reason}`).catch(() => {});
  await interaction.reply({
    content: `<@${target.id}> averti (${warns.length} avertissement(s) au total).`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = handleWarnCommand;
