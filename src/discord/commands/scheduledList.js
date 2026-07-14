const { MessageFlags, EmbedBuilder } = require('discord.js');
const scheduledTaskStore = require('../../kv/scheduledTaskStore');

async function handleScheduledListCommand(interaction) {
  const items = await scheduledTaskStore.list(interaction.guild.id);

  if (items.length === 0) {
    await interaction.reply({ content: 'Aucune annonce/evenement programme.', flags: MessageFlags.Ephemeral });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('Annonces et evenements programmes')
    .setColor(0x5b8def)
    .setDescription(items.map((i) => (
      `\`${i.id}\` <#${i.channelId}> <t:${Math.floor(i.runAt / 1000)}:R>`
      + `${i.repeatIntervalMs ? ' (recurrent)' : ''} — ${i.message.slice(0, 60)}`
    )).join('\n'));

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = handleScheduledListCommand;
