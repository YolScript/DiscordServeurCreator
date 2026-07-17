const { MessageFlags } = require('discord.js');
const afkStore = require('../../kv/afkStore');

async function handleAfkCommand(interaction) {
  const reason = interaction.options.getString('raison') || 'AFK';
  await afkStore.set(interaction.guild.id, interaction.user.id, reason);
  await interaction.reply({ content: `😴 Tu es maintenant marque AFK : ${reason}`, flags: MessageFlags.Ephemeral });
}

module.exports = handleAfkCommand;
