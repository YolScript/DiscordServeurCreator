const { MessageFlags } = require('discord.js');

async function handleReactionRoleSelect(interaction) {
  const { member } = interaction;
  const allRoleIdsOnMenu = interaction.component.options.map((o) => o.value);
  const selectedRoleIds = new Set(interaction.values);

  const toAdd = allRoleIdsOnMenu.filter((id) => selectedRoleIds.has(id) && !member.roles.cache.has(id));
  const toRemove = allRoleIdsOnMenu.filter((id) => !selectedRoleIds.has(id) && member.roles.cache.has(id));

  for (const roleId of toRemove) await member.roles.remove(roleId).catch(() => {});
  for (const roleId of toAdd) await member.roles.add(roleId).catch(() => {});

  await interaction.reply({ content: 'Roles mis a jour.', flags: MessageFlags.Ephemeral });
}

module.exports = handleReactionRoleSelect;
