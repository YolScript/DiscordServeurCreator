const { MessageFlags } = require('discord.js');
const customCommandStore = require('../../kv/customCommandStore');
const { applyPlaceholders } = require('../../shared/placeholders');

async function handleCustomCommand(interaction) {
  const entry = await customCommandStore.findByName(interaction.guild.id, interaction.commandName);
  if (!entry) {
    await interaction.reply({ content: 'Commande inconnue.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (entry.requiredRoleId && !interaction.member.roles.cache.has(entry.requiredRoleId)) {
    await interaction.reply({ content: 'Tu n\'as pas le role requis pour utiliser cette commande.', flags: MessageFlags.Ephemeral });
    return;
  }

  const text = applyPlaceholders(entry.response, { user: interaction.user, guild: interaction.guild });
  await interaction.reply(text);
}

module.exports = handleCustomCommand;
