const { MessageFlags } = require('discord.js');
const economyStore = require('../../kv/economyStore');

async function handlePayCommand(interaction) {
  const target = interaction.options.getUser('membre', true);
  const amount = interaction.options.getInteger('montant', true);

  if (target.id === interaction.user.id) {
    await interaction.reply({ content: 'Tu ne peux pas te payer toi-meme.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (target.bot) {
    await interaction.reply({ content: 'Tu ne peux pas payer un bot.', flags: MessageFlags.Ephemeral });
    return;
  }

  const account = await economyStore.getAccount(interaction.guild.id, interaction.user.id);
  if (account.balance < amount) {
    await interaction.reply({ content: `Solde insuffisant (tu as ${account.balance} pieces).`, flags: MessageFlags.Ephemeral });
    return;
  }

  await economyStore.addBalance(interaction.guild.id, interaction.user.id, -amount);
  await economyStore.addBalance(interaction.guild.id, target.id, amount);
  await interaction.reply(`🪙 <@${interaction.user.id}> a envoye **${amount}** pieces a <@${target.id}>.`);
}

module.exports = handlePayCommand;
