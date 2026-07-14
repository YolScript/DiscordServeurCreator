const { Events } = require('discord.js');
const client = require('../client');
const { handleMessageCreate } = require('../moderation/autoMod');
const { awardMessageXp } = require('../engagement/xpManager');

client.on(Events.MessageCreate, async (message) => {
  await handleMessageCreate(message);
  await awardMessageXp(message);
});
