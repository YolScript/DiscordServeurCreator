const { MessageFlags } = require('discord.js');
const shopStore = require('../../../kv/shopStore');
const economyStore = require('../../../kv/economyStore');

async function handleShopBuyButton(interaction, itemId) {
  const items = await shopStore.list(interaction.guild.id);
  const item = items.find((i) => i.id === itemId);
  if (!item) {
    await interaction.reply({ content: 'Cet article n\'existe plus.', flags: MessageFlags.Ephemeral });
    return;
  }

  const account = await economyStore.getAccount(interaction.guild.id, interaction.user.id);
  if (account.balance < item.price) {
    await interaction.reply({ content: `Solde insuffisant (tu as ${account.balance} pieces, il en faut ${item.price}).`, flags: MessageFlags.Ephemeral });
    return;
  }

  await economyStore.addBalance(interaction.guild.id, interaction.user.id, -item.price);
  if (item.roleId) await interaction.member.roles.add(item.roleId).catch(() => {});

  await interaction.reply({
    content: `Achat confirme : **${item.name}**${item.roleId ? ` (role <@&${item.roleId}> ajoute)` : ''}.`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = handleShopBuyButton;
