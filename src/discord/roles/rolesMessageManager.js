const { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const gameRoleStore = require('../../kv/gameRoleStore');
const guildConfigStore = require('../../kv/guildConfigStore');
const roleMessageStore = require('../../kv/roleMessageStore');
const { buildGameSelectId } = require('../interactions/customIds');
const { chunk } = require('../../shared/chunk');

const OPTIONS_PER_MENU = 25;
const MENUS_PER_MESSAGE = 5;

// Reconstruit les messages a select menus du salon #roles a partir de la
// liste courante des roles de jeu. Edite les messages existants quand c'est
// possible, n'en recree/supprime que si le nombre de pages a change.
async function refresh(guild) {
  const config = await guildConfigStore.find(guild.id);
  if (!config?.rolesChannelId) return;
  const channel = await guild.channels.fetch(config.rolesChannelId).catch(() => null);
  if (!channel) return;

  const gameRoles = await gameRoleStore.list(guild.id);
  const existingPages = await roleMessageStore.list(guild.id);

  if (gameRoles.length === 0) {
    for (const page of existingPages) {
      const msg = await channel.messages.fetch(page.messageId).catch(() => null);
      if (msg) await msg.delete().catch(() => {});
    }
    await roleMessageStore.replaceAll(guild.id, []);
    return;
  }

  const menuChunks = chunk(gameRoles, OPTIONS_PER_MENU);
  const messageChunks = chunk(menuChunks, MENUS_PER_MESSAGE);
  const newPages = [];

  for (let pageIndex = 0; pageIndex < messageChunks.length; pageIndex += 1) {
    const rows = messageChunks[pageIndex].map((menuGames, menuIdx) => {
      const globalMenuIndex = pageIndex * MENUS_PER_MESSAGE + menuIdx;
      const select = new StringSelectMenuBuilder()
        .setCustomId(buildGameSelectId(globalMenuIndex))
        .setPlaceholder('Choisis tes jeux')
        .setMinValues(0)
        .setMaxValues(menuGames.length)
        .addOptions(menuGames.map((g) => ({ label: g.displayName.slice(0, 100), value: g.roleId })));
      return new ActionRowBuilder().addComponents(select);
    });

    const embed = new EmbedBuilder()
      .setTitle('Roles de jeu')
      .setDescription('Selectionne un ou plusieurs jeux pour obtenir le role correspondant.')
      .setColor(0x219ebc);

    const existingPage = existingPages[pageIndex];
    if (existingPage) {
      const msg = await channel.messages.fetch(existingPage.messageId).catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [embed], components: rows });
        newPages.push({ channelId: channel.id, messageId: msg.id, pageIndex });
        continue;
      }
    }
    const sent = await channel.send({ embeds: [embed], components: rows });
    newPages.push({ channelId: channel.id, messageId: sent.id, pageIndex });
  }

  for (const oldPage of existingPages.slice(newPages.length)) {
    const msg = await channel.messages.fetch(oldPage.messageId).catch(() => null);
    if (msg) await msg.delete().catch(() => {});
  }

  await roleMessageStore.replaceAll(guild.id, newPages);
}

module.exports = { refresh };
