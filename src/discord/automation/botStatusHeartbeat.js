const client = require('../client');
const { kvPut } = require('../../kv/cloudflareKv');
const { version } = require('../../../package.json');
const logger = require('../../shared/logger');

const startedAt = Date.now();
const TICK_MS = 60_000;

async function tick() {
  try {
    await kvPut('bot:status', {
      startedAt,
      updatedAt: Date.now(),
      ping: client.ws.ping,
      guildCount: client.guilds.cache.size,
      version,
    });
  } catch (err) {
    logger.error('botStatusHeartbeat.tick', err);
  }
}

function start() {
  tick();
  setInterval(tick, TICK_MS);
  logger.info('Heartbeat de statut du bot demarre');
}

module.exports = { start, tick };
