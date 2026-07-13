const { Events } = require('discord.js');
const client = require('../client');
const staffVoiceManager = require('../roles/staffVoiceManager');
const logger = require('../../shared/logger');

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  staffVoiceManager.handleVoiceStateUpdate(oldState, newState).catch((err) => logger.error('handleVoiceStateUpdate', err));
});
