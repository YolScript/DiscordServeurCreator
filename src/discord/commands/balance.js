const economyStore = require('../../kv/economyStore');
const { getCurrencyLabel } = require('../../shared/currency');

async function handleBalanceCommand(interaction) {
  const target = interaction.options.getUser('membre') || interaction.user;
  const [account, currency] = await Promise.all([
    economyStore.getAccount(interaction.guild.id, target.id),
    getCurrencyLabel(interaction.guild.id),
  ]);
  await interaction.reply(`${currency.emoji} ${target.id === interaction.user.id ? 'Tu as' : `<@${target.id}> a`} **${account.balance}** ${currency.name}.`);
}

module.exports = handleBalanceCommand;
