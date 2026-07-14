const { MessageFlags } = require('discord.js');
const referralStore = require('../../kv/referralStore');

async function handleReferralroleCommand(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'set') {
    const count = interaction.options.getInteger('invitations', true);
    const role = interaction.options.getRole('role', true);
    await referralStore.setRole(interaction.guild.id, count, role.id);
    await interaction.reply({ content: `Role <@&${role.id}> attribue des ${count} invitation(s).`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (sub === 'remove') {
    const count = interaction.options.getInteger('invitations', true);
    await referralStore.removeRole(interaction.guild.id, count);
    await interaction.reply({ content: `Palier ${count} invitation(s) retire.`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (sub === 'list') {
    const items = await referralStore.listRoles(interaction.guild.id);
    if (items.length === 0) {
      await interaction.reply({ content: 'Aucun palier configure.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({
      content: items.map((r) => `${r.count} invitation(s) -> <@&${r.roleId}>`).join('\n'),
      flags: MessageFlags.Ephemeral,
    });
  }
}

module.exports = handleReferralroleCommand;
