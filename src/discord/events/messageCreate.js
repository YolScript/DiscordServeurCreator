const { Events, ChannelType } = require('discord.js');
const client = require('../client');
const { handleMessageCreate } = require('../moderation/autoMod');
const { awardMessageXp } = require('../engagement/xpManager');
const staffChatLogger = require('../roles/staffChatLogger');
const statsTracker = require('../automation/statsTracker');
const guildConfigStore = require('../../kv/guildConfigStore');
const logger = require('../../shared/logger');

client.on(Events.MessageCreate, async (message) => {
  await handleMessageCreate(message);
  await awardMessageXp(message);
  await staffChatLogger.handleMessageCreate(message);
  if (message.guild && !message.author.bot) statsTracker.recordMessage(message.guild.id);

  // Publication croisee automatique (roadmap n°101) : tout message poste
  // dans un salon d'annonces est publie vers les serveurs abonnes, si le
  // toggle est actif au dashboard.
  if (message.guild && message.channel.type === ChannelType.GuildAnnouncement) {
    try {
      const config = await guildConfigStore.find(message.guild.id);
      if (config?.autoCrosspost && message.crosspostable) await message.crosspost();
    } catch (err) {
      logger.error('autoCrosspost', err);
    }
  }
});
