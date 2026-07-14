const { MessageFlags } = require('discord.js');
const scheduledTaskStore = require('../../kv/scheduledTaskStore');

async function handleScheduleAnnouncementCommand(interaction) {
  const channel = interaction.options.getChannel('salon', true);
  const message = interaction.options.getString('message', true);
  const delayMinutes = interaction.options.getInteger('delai_minutes', true);
  const repeatMinutes = interaction.options.getInteger('repeter_minutes');

  const entry = await scheduledTaskStore.add(interaction.guild.id, {
    type: 'announcement',
    channelId: channel.id,
    message,
    runAt: Date.now() + delayMinutes * 60 * 1000,
    repeatIntervalMs: repeatMinutes ? repeatMinutes * 60 * 1000 : null,
  });

  await interaction.reply({
    content: `Annonce programmee dans <#${channel.id}> dans ${delayMinutes} min`
      + `${repeatMinutes ? ` (repetition toutes les ${repeatMinutes} min)` : ''}. ID : \`${entry.id}\`.`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = handleScheduleAnnouncementCommand;
