const guildConfigStore = require('../../kv/guildConfigStore');
const { postModLog } = require('../moderation/modLog');
const logger = require('../../shared/logger');

// Le salon #staff est temporaire (cf staffCategory.syncStaffChatChannel) et
// disparait des qu'il n'y a plus personne en service : sans ca, son
// historique de messages serait perdu a chaque suppression. On archive donc
// chaque message envoye dedans dans #mod-logs (permanent) au fil de l'eau.
async function handleMessageCreate(message) {
  if (!message.guild || message.author.bot) return;
  try {
    const config = await guildConfigStore.find(message.guild.id);
    if (!config?.staffChatChannelId || message.channelId !== config.staffChatChannelId) return;
    if (!message.content?.trim()) return;

    await postModLog(message.guild, {
      title: '💬 Message #staff',
      description: message.content.slice(0, 4000),
      color: 0x5865f2,
      fields: [{ name: 'Auteur', value: `${message.author.tag} (${message.author.id})` }],
    });
  } catch (err) {
    logger.error('staffChatLogger.handleMessageCreate', err);
  }
}

module.exports = { handleMessageCreate };
