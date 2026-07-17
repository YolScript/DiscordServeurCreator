const { Events, ChannelType } = require('discord.js');
const client = require('../client');
const { handleMessageCreate } = require('../moderation/autoMod');
const autoRules = require('../automation/autoRules');
const { awardMessageXp } = require('../engagement/xpManager');
const staffChatLogger = require('../roles/staffChatLogger');
const statsTracker = require('../automation/statsTracker');
const afkHandler = require('../automation/afkHandler');
const guildConfigStore = require('../../kv/guildConfigStore');
const logger = require('../../shared/logger');

// Reactions d'evenement saisonnieres (roadmap n°319) : appliquees sur les
// MEMES salons que les reactions automatiques (n°284), pas sur tout le
// serveur — reagir a chaque message partout serait intrusif.
const SEASONAL_EMOJI_BY_MONTH = {
  1: '❄️', 2: '💘', 3: '🌸', 4: '🌷', 5: '🌻', 6: '☀️', 7: '🏖️', 8: '🍉', 9: '🍂', 10: '🎃', 11: '🍁', 12: '🎄',
};

client.on(Events.MessageCreate, async (message) => {
  await handleMessageCreate(message);
  autoRules.handleMessage(message).catch((err) => logger.error('autoRules', err));
  await awardMessageXp(message);
  await staffChatLogger.handleMessageCreate(message);
  afkHandler.handleMessage(message).catch((err) => logger.error('afkHandler', err));
  if (message.guild && !message.author.bot) statsTracker.recordMessage(message.guild.id, message.channel.id);

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

      // Reaction saisonniere (roadmap n°319), memes salons.
      if (config?.seasonalReactionsEnabled && config?.autoReactChannels?.[message.channel.id] !== undefined) {
        const seasonalEmoji = SEASONAL_EMOJI_BY_MONTH[new Date().getMonth() + 1];
        if (seasonalEmoji) await message.react(seasonalEmoji).catch(() => {});
      }
    } catch (err) {
      logger.error('messageCreate.perGuildAutomation', err);
    }
  }
});
