const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const gameRoleStore = require('../../../kv/gameRoleStore');
const memberProfileStore = require('../../../kv/memberProfileStore');
const { buildGamePseudoButtonId } = require('../customIds');
const { chunk } = require('../../../shared/chunk');

async function handleGameRoleSelect(interaction) {
  const member = interaction.member;
  const guild = interaction.guild;

  // Toutes les options proposees par CE select menu (pas seulement celles cochees) :
  // necessaire pour savoir lesquelles retirer si l'utilisateur les avait avant.
  const allRoleIdsOnMenu = interaction.component.options.map((o) => o.value);
  const selectedRoleIds = new Set(interaction.values);

  const toAdd = allRoleIdsOnMenu.filter((id) => selectedRoleIds.has(id) && !member.roles.cache.has(id));
  const toRemove = allRoleIdsOnMenu.filter((id) => !selectedRoleIds.has(id) && member.roles.cache.has(id));

  for (const roleId of toRemove) {
    await member.roles.remove(roleId).catch(() => {});
    await memberProfileStore.remove(guild.id, member.id, roleId);
  }
  for (const roleId of toAdd) {
    await member.roles.add(roleId).catch(() => {});
  }

  if (toAdd.length === 0) {
    await interaction.reply({ content: 'Roles de jeu mis a jour.', flags: MessageFlags.Ephemeral });
    return;
  }

  const gameRoles = await gameRoleStore.list(guild.id);
  const buttons = toAdd.map((roleId) => {
    const gameRole = gameRoles.find((g) => g.roleId === roleId);
    return new ButtonBuilder()
      .setCustomId(buildGamePseudoButtonId(roleId))
      .setLabel(`Pseudo: ${gameRole?.displayName ?? 'jeu'}`.slice(0, 80))
      .setStyle(ButtonStyle.Secondary);
  });

  const rows = chunk(buttons, 5).slice(0, 5).map((group) => new ActionRowBuilder().addComponents(group));

  await interaction.reply({
    content: 'Roles ajoutes ! Renseigne ton pseudo pour chaque jeu (optionnel) :',
    components: rows,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = handleGameRoleSelect;
