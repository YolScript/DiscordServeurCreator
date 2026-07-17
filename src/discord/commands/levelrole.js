const { MessageFlags } = require('discord.js');
const levelRoleStore = require('../../kv/levelRoleStore');

async function handleLevelroleCommand(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'set') {
    const level = interaction.options.getInteger('niveau', true);
    const role = interaction.options.getRole('role');
    const bonus = interaction.options.getInteger('bonus');
    const announce = interaction.options.getString('annonce');
    if (!role && !bonus && !announce) {
      await interaction.reply({ content: 'Renseigne au moins un role, un bonus ou une annonce.', flags: MessageFlags.Ephemeral });
      return;
    }
    await levelRoleStore.set(interaction.guild.id, level, { roleId: role?.id, bonus, announce });
    const parts = [];
    if (role) parts.push(`role <@&${role.id}>`);
    if (bonus) parts.push(`bonus 🪙${bonus}`);
    if (announce) parts.push('annonce personnalisee');
    await interaction.reply({ content: `Palier niveau ${level} configure : ${parts.join(', ')}.`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (sub === 'remove') {
    const level = interaction.options.getInteger('niveau', true);
    await levelRoleStore.remove(interaction.guild.id, level);
    await interaction.reply({ content: `Palier niveau ${level} retire.`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (sub === 'list') {
    const items = await levelRoleStore.list(interaction.guild.id);
    if (items.length === 0) {
      await interaction.reply({ content: 'Aucun palier configure.', flags: MessageFlags.Ephemeral });
      return;
    }
    const lines = items.map((lr) => `Niveau ${lr.level} -> <@&${lr.roleId}>`);
    await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
  }
}

module.exports = handleLevelroleCommand;
