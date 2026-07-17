const client = require('../client');
const guildConfigStore = require('../../kv/guildConfigStore');
const logger = require('../../shared/logger');

// Nettoyage programme d'un salon (roadmap n°290) : purge automatique et
// recurrente d'un salon (ex : bot-commandes, spam-test), par defaut toutes
// les 24h. Discord ne permet le bulk-delete que sur les messages de moins de
// 14 jours — au-dela le salon est deja "propre" au sens de cette fonction.
const TICK_MS = 60 * 60_000;
const DEFAULT_INTERVAL_MS = 24 * 3600_000;
const MAX_BATCHES = 5;

async function cleanupChannel(channel) {
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!messages || messages.size === 0) break;
    // eslint-disable-next-line no-await-in-loop
    const deleted = await channel.bulkDelete(messages, true).catch(() => null);
    if (!deleted || deleted.size < 2) break;
  }
}

async function tick() {
  for (const guild of client.guilds.cache.values()) {
    // eslint-disable-next-line no-await-in-loop
    const config = await guildConfigStore.find(guild.id).catch(() => null);
    if (!config?.autoCleanupChannelId) continue;
    const intervalMs = (config.autoCleanupIntervalHours > 0 ? config.autoCleanupIntervalHours : 24) * 3600_000 || DEFAULT_INTERVAL_MS;
    const lastCleanup = config.lastAutoCleanupAt || 0;
    if (Date.now() - lastCleanup < intervalMs) continue;

    // eslint-disable-next-line no-await-in-loop
    const channel = await guild.channels.fetch(config.autoCleanupChannelId).catch(() => null);
    if (channel) {
      // eslint-disable-next-line no-await-in-loop
      await cleanupChannel(channel).catch((err) => logger.error('channelCleanup.cleanupChannel', err));
    }
    // eslint-disable-next-line no-await-in-loop
    await guildConfigStore.upsert(guild.id, { lastAutoCleanupAt: Date.now() }).catch((err) => logger.error('channelCleanup.markDone', err));
  }
}

function start() {
  setInterval(() => { tick().catch((err) => logger.error('channelCleanup.tick', err)); }, TICK_MS);
  logger.info('Nettoyage programme des salons demarre');
}

module.exports = { start };
