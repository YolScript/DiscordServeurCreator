const { Events } = require('discord.js');
const client = require('../client');
const staffVoiceManager = require('../roles/staffVoiceManager');
const publicVoiceManager = require('../roles/publicVoiceManager');
const staffVoiceCreator = require('../roles/staffVoiceCreator');
const gameVoiceCreator = require('../roles/gameVoiceCreator');
const voiceOccupancy = require('../automation/voiceOccupancy');
const logger = require('../../shared/logger');

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  staffVoiceManager.handleVoiceStateUpdate(oldState, newState).catch((err) => logger.error('handleVoiceStateUpdate', err));
  publicVoiceManager.handleVoiceStateUpdate(oldState, newState).catch((err) => logger.error('publicVoiceManager', err));
  staffVoiceCreator.handleVoiceStateUpdate(oldState, newState).catch((err) => logger.error('staffVoiceCreator', err));
  gameVoiceCreator.handleVoiceStateUpdate(oldState, newState).catch((err) => logger.error('gameVoiceCreator', err));
  voiceOccupancy.handleVoiceStateUpdate(oldState, newState);
});
