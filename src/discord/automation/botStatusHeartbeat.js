const client = require('../client');
const { kvPut } = require('../../kv/cloudflareKv');
const { version } = require('../../../package.json');
const logger = require('../../shared/logger');

const startedAt = Date.now();
// 10 min et pas 60 s : le KV Cloudflare gratuit est limite a 1000 put()/jour
// et un heartbeat par minute en consommait 1440 a lui seul, ce qui cassait
// TOUT le dashboard ("Erreur interne.") une fois le quota du jour epuise.
// Le dashboard considere le bot en ligne si updatedAt < 25 min.
const TICK_MS = 10 * 60_000;

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
