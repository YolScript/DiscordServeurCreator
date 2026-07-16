const { Events } = require('discord.js');
const client = require('../client');
const { handleReactionAdd } = require('../engagement/starboardManager');

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  await handleReactionAdd(reaction, user);
});
