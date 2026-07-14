const { Events } = require('discord.js');
const client = require('../client');
const { handleMessageCreate } = require('../moderation/autoMod');

client.on(Events.MessageCreate, handleMessageCreate);
