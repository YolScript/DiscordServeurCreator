const { EmbedBuilder } = require('discord.js');
const economyStore = require('../../kv/economyStore');

async function handleEconomyLeaderboardCommand(interaction) {
  const accounts = await economyStore.all(interaction.guild.id);
  const top = Object.entries(accounts)
    .sort((a, b) => b[1].balance - a[1].balance)
    .slice(0, 10);

  const embed = new EmbedBuilder()
    .setTitle('🪙 Classement économie')
    .setColor(0xf9c74f)
    .setDescription(top.length
      ? top.map(([userId, account], i) => `**${i + 1}.** <@${userId}> — ${account.balance} pieces`).join('\n')
      : 'Aucune donnee pour le moment.');

  await interaction.reply({ embeds: [embed] });
}

module.exports = handleEconomyLeaderboardCommand;
