const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const shopStore = require('../../kv/shopStore');
const { buildShopBuyId } = require('../interactions/customIds');

async function handleShopCommand(interaction) {
  const items = await shopStore.list(interaction.guild.id);
  if (!items.length) {
    await interaction.reply({ content: 'Aucun article en boutique (configurable depuis le dashboard).', flags: MessageFlags.Ephemeral });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('🛒 Boutique')
    .setDescription(items.map((i) => `**${i.name}** — 🪙 ${i.price}${i.roleId ? ` (donne <@&${i.roleId}>)` : ''}`).join('\n'))
    .setColor(0xf9c74f);

  const rows = [];
  for (let i = 0; i < items.length; i += 5) {
    const row = new ActionRowBuilder().addComponents(
      items.slice(i, i + 5).map((item) => new ButtonBuilder()
        .setCustomId(buildShopBuyId(item.id))
        .setLabel(`${item.name} (${item.price})`.slice(0, 80))
        .setStyle(ButtonStyle.Secondary)),
    );
    rows.push(row);
  }

  await interaction.reply({ embeds: [embed], components: rows.slice(0, 5) });
}

module.exports = handleShopCommand;
