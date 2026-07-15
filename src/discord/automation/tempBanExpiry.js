const client = require('../client');
const tempBanStore = require('../../kv/tempBanStore');
const logger = require('../../shared/logger');

const TICK_MS = 5 * 60_000;

async function tick() {
  for (const guild of client.guilds.cache.values()) {
    const bans = await tempBanStore.list(guild.id).catch(() => []);
    const now = Date.now();
    for (const ban of bans) {
      if (ban.expiresAt > now) continue;
      // eslint-disable-next-line no-await-in-loop
      await guild.members.unban(ban.userId, 'Ban temporaire expire').catch((err) => logger.error('tempBanExpiry.unban', err));
      // eslint-disable-next-line no-await-in-loop
      await tempBanStore.remove(guild.id, ban.userId).catch((err) => logger.error('tempBanExpiry.remove', err));
    }
  }
}

function start() {
  setInterval(() => { tick().catch((err) => logger.error('tempBanExpiry.tick', err)); }, TICK_MS);
  logger.info('Expiration des bans temporaires demarree');
}

module.exports = { start };
