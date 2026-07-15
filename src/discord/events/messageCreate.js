const { Events } = require('discord.js');
const client = require('../client');
const { handleMessageCreate } = require('../moderation/autoMod');
const { awardMessageXp } = require('../engagement/xpManager');
const staffChatLogger = require('../roles/staffChatLogger');
const statsTracker = require('../automation/statsTracker');

client.on(Events.MessageCreate, async (message) => {
  await handleMessageCreate(message);
  await awardMessageXp(message);
  await staffChatLogger.handleMessageCreate(message);
  if (message.guild && !message.author.bot) statsTracker.recordMessage(message.guild.id);
});
