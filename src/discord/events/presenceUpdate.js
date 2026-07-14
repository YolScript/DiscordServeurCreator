const { Events, ActivityType } = require('discord.js');
const client = require('../client');
const { ensureRoleForGame } = require('../roles/gameRoleManager');
const logger = require('../../shared/logger');

client.on(Events.PresenceUpdate, (oldPresence, newPresence) => {
  if (!newPresence?.guild) return;

  const playing = (newPresence.activities ?? []).filter((activity) => activity.type === ActivityType.Playing);
  for (const activity of playing) {
    ensureRoleForGame(newPresence.guild, activity.name).catch((err) => logger.error('ensureRoleForGame', err));
  }
});
