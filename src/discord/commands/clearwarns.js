const { MessageFlags } = require('discord.js');
const warnStore = require('../../kv/warnStore');

async function handleClearwarnsCommand(interaction) {
  const target = interaction.options.getUser('membre', true);
  await warnStore.clear(interaction.guild.id, target.id);
  await interaction.reply({ content: `Avertissements de <@${target.id}> reinitialises.`, flags: MessageFlags.Ephemeral });
}

module.exports = handleClearwarnsCommand;
