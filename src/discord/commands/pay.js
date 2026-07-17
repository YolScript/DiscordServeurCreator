const { MessageFlags } = require('discord.js');
const economyStore = require('../../kv/economyStore');
const guildConfigStore = require('../../kv/guildConfigStore');

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

  // Taxe sur les transferts (roadmap n°201) : pourcentage configurable au
  // dashboard, la part taxee est detruite (anti-inflation).
  const config = await guildConfigStore.find(interaction.guild.id).catch(() => null);
  const taxPercent = Math.min(25, Math.max(0, Number(config?.payTaxPercent) || 0));
  const tax = Math.floor((amount * taxPercent) / 100);
  const received = amount - tax;

  await economyStore.addBalance(interaction.guild.id, interaction.user.id, -amount);
  await economyStore.addBalance(interaction.guild.id, target.id, received);
  await interaction.reply(`🪙 <@${interaction.user.id}> a envoye **${received}** pieces a <@${target.id}>${tax ? ` (taxe de ${taxPercent}% : -${tax})` : ''}.`);
}

module.exports = handlePayCommand;
