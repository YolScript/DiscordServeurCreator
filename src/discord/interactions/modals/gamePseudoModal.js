const { MessageFlags } = require('discord.js');
const memberProfileStore = require('../../../kv/memberProfileStore');
const { GAME_PSEUDO_MODAL_PREFIX } = require('../customIds');

async function handleGamePseudoModal(interaction) {
  const roleId = interaction.customId.slice(GAME_PSEUDO_MODAL_PREFIX.length);
  const pseudo = interaction.fields.getTextInputValue('pseudo').trim();

  await memberProfileStore.upsert(interaction.guild.id, interaction.user.id, {
    gameRoleId: roleId,
    ingamePseudo: pseudo,
  });

  await interaction.reply({ content: `Pseudo enregistre : ${pseudo}`, flags: MessageFlags.Ephemeral });
}

module.exports = handleGamePseudoModal;
