const { Events } = require('discord.js');
const client = require('../client');
const { handleMessageCreate } = require('../moderation/autoMod');
const { awardMessageXp } = require('../engagement/xpManager');
const staffChatLogger = require('../roles/staffChatLogger');

client.on(Events.MessageCreate, async (message) => {
  await handleMessageCreate(message);
  await awardMessageXp(message);
  await staffChatLogger.handleMessageCreate(message);
});
