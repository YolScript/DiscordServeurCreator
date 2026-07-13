const { MessageFlags } = require('discord.js');
const guildConfigStore = require('../../../kv/guildConfigStore');

async function handleReglementAccept(interaction) {
  const config = await guildConfigStore.find(interaction.guild.id);
  if (!config?.reglementValidatedRoleId) {
    await interaction.reply({ content: 'Configuration introuvable pour ce serveur.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.member.roles.cache.has(config.reglementValidatedRoleId)) {
    await interaction.reply({ content: 'Tu as deja valide le reglement.', flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.member.roles.add(config.reglementValidatedRoleId);
  await interaction.reply({ content: 'Reglement accepte, bienvenue !', flags: MessageFlags.Ephemeral });
}

module.exports = handleReglementAccept;
