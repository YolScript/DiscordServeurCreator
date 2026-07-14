const { MessageFlags } = require('discord.js');
const scheduledTaskStore = require('../../kv/scheduledTaskStore');

async function handleScheduleEventCommand(interaction) {
  const channel = interaction.options.getChannel('salon', true);
  const name = interaction.options.getString('nom', true);
  const delayMinutes = interaction.options.getInteger('delai_minutes', true);
  const reminderMinutes = interaction.options.getInteger('rappel_minutes');

  const startAt = Date.now() + delayMinutes * 60 * 1000;
  const created = [];

  if (reminderMinutes && reminderMinutes < delayMinutes) {
    const entry = await scheduledTaskStore.add(interaction.guild.id, {
      type: 'event-reminder',
      channelId: channel.id,
      message: `Rappel : **${name}** commence dans ${reminderMinutes} minutes !`,
      runAt: startAt - reminderMinutes * 60 * 1000,
      repeatIntervalMs: null,
    });
    created.push(entry);
  }

  const startEntry = await scheduledTaskStore.add(interaction.guild.id, {
    type: 'event-start',
    channelId: channel.id,
    message: `**${name}** commence maintenant !`,
    runAt: startAt,
    repeatIntervalMs: null,
  });
  created.push(startEntry);

  await interaction.reply({
    content: `Evenement "${name}" programme dans <#${channel.id}> dans ${delayMinutes} min`
      + `${reminderMinutes ? ` (rappel ${reminderMinutes} min avant)` : ''}. ID(s) : ${created.map((e) => `\`${e.id}\``).join(', ')}.`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = handleScheduleEventCommand;
