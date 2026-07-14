const { MessageFlags } = require('discord.js');
const scheduledTaskStore = require('../../kv/scheduledTaskStore');

async function handleScheduledCancelCommand(interaction) {
  const id = interaction.options.getString('id', true);
  const removed = await scheduledTaskStore.remove(interaction.guild.id, id);
  await interaction.reply({
    content: removed ? `Annulee : \`${id}\`.` : `Aucune entree avec l'ID \`${id}\`.`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = handleScheduledCancelCommand;
