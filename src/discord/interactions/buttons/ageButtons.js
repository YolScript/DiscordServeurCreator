const { MessageFlags } = require('discord.js');
const guildConfigStore = require('../../../kv/guildConfigStore');
const { AGE_PLUS16 } = require('../customIds');

async function handleAgeButton(interaction) {
  const config = await guildConfigStore.find(interaction.guild.id);
  if (!config?.plus16RoleId || !config?.minus16RoleId) {
    await interaction.reply({ content: 'Configuration introuvable pour ce serveur.', flags: MessageFlags.Ephemeral });
    return;
  }
  const isPlus16 = interaction.customId === AGE_PLUS16;
  const addRoleId = isPlus16 ? config.plus16RoleId : config.minus16RoleId;
  const removeRoleId = isPlus16 ? config.minus16RoleId : config.plus16RoleId;

  if (interaction.member.roles.cache.has(removeRoleId)) {
    await interaction.member.roles.remove(removeRoleId).catch(() => {});
  }
  await interaction.member.roles.add(addRoleId);
  await interaction.reply({
    content: `Tranche d'age enregistree : ${isPlus16 ? '+16' : '-16'}.`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = handleAgeButton;
