const { MessageFlags } = require('discord.js');
const antiRaid = require('../moderation/antiRaid');

async function handleUnlockCommand(interaction) {
  await antiRaid.liftLockdown(interaction.guild);
  await interaction.reply({ content: 'Verrouillage anti-raid leve, niveau de verification restaure.', flags: MessageFlags.Ephemeral });
}

module.exports = handleUnlockCommand;
