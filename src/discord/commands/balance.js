const economyStore = require('../../kv/economyStore');

async function handleBalanceCommand(interaction) {
  const target = interaction.options.getUser('membre') || interaction.user;
  const account = await economyStore.getAccount(interaction.guild.id, target.id);
  await interaction.reply(`🪙 ${target.id === interaction.user.id ? 'Tu as' : `<@${target.id}> a`} **${account.balance}** pieces.`);
}

module.exports = handleBalanceCommand;
