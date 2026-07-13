const { Events } = require('discord.js');
const client = require('../client');
const { routeInteraction } = require('../interactions/registry');

client.on(Events.InteractionCreate, routeInteraction);
