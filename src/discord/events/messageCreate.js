const { Events, ChannelType } = require('discord.js');
const client = require('../client');
const { handleMessageCreate } = require('../moderation/autoMod');
const autoRules = require('../automation/autoRules');
const { awardMessageXp } = require('../engagement/xpManager');
const staffChatLogger = require('../roles/staffChatLogger');
const statsTracker = require('../automation/statsTracker');
const guildConfigStore = require('../../kv/guildConfigStore');
const logger = require('../../shared/logger');

client.on(Events.MessageCreate, async (message) => {
  await handleMessageCreate(message);
  autoRules.handleMessage(message).catch((err) => logger.error('autoRules', err));
  await awardMessageXp(message);
  await staffChatLogger.handleMessageCreate(message);
  if (message.guild && !message.author.bot) statsTracker.recordMessage(message.guild.id);

  if (message.guild && !message.author.bot) {
    try {
      const config = await guildConfigStore.find(message.guild.id);

      // Publication croisee automatique (roadmap n°101) : tout message poste
      // dans un salon d'annonces est publie vers les serveurs abonnes, si le
      // toggle est actif au dashboard.
      if (message.channel.type === ChannelType.GuildAnnouncement && config?.autoCrosspost && message.crosspostable) {
        await message.crosspost();
      }

      // Reaction automatique par salon (roadmap n°284) : ex. 📌 sur chaque
      // post d'un salon d'annonces, sans intervention du staff.
      const emoji = config?.autoReactChannels?.[message.channel.id];
      if (emoji) await message.react(emoji).catch(() => {});
    } catch (err) {
      logger.error('messageCreate.perGuildAutomation', err);
    }
  }
});
