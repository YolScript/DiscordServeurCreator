const { MessageFlags } = require('discord.js');
const referralStore = require('../../kv/referralStore');

async function handleInvitesCommand(interaction) {
  const target = interaction.options.getUser('membre') || interaction.user;
  const counts = await referralStore.getCounts(interaction.guild.id);
  const count = counts[target.id] ?? 0;
  await interaction.reply({ content: `<@${target.id}> a invite **${count}** membre(s).`, flags: MessageFlags.Ephemeral });
}

module.exports = handleInvitesCommand;
