const { MessageFlags } = require('discord.js');
const shopStore = require('../../../kv/shopStore');
const economyStore = require('../../../kv/economyStore');
const { kvGet, kvPut } = require('../../../kv/cloudflareKv');

// Inventaire (roadmap n°156) : chaque achat est trace par membre, consultable
// dans la fiche membre du dashboard. Cap 50 objets, plus recents gardes.
async function recordPurchase(guildId, userId, item) {
  const key = `guild:${guildId}:inventory:${userId}`;
  const inventory = (await kvGet(key)) || [];
  inventory.push({ itemId: item.id, name: item.name, price: item.price, boughtAt: Date.now() });
  await kvPut(key, inventory.slice(-50));
}

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
  await recordPurchase(interaction.guild.id, interaction.user.id, item).catch(() => {});

  await interaction.reply({
    content: `Achat confirme : **${item.name}**${item.roleId ? ` (role <@&${item.roleId}> ajoute)` : ''}.`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = handleShopBuyButton;
