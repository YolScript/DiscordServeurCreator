const { Events } = require('discord.js');
const client = require('../client');
const snipeStore = require('../automation/snipeStore');

client.on(Events.MessageDelete, (message) => {
  snipeStore.record(message);
});
