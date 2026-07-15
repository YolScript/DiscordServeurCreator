const client = require('../client');
const scheduledTaskStore = require('../../kv/scheduledTaskStore');
const logger = require('../../shared/logger');

const TICK_MS = 30_000;

async function tick() {
  for (const guild of client.guilds.cache.values()) {
    let items;
    try {
      items = await scheduledTaskStore.list(guild.id);
    } catch (err) {
      logger.error('scheduler.list', err);
      continue;
    }
    if (items.length === 0) continue;

    const now = Date.now();
    let changed = false;

    for (const item of items) {
      if (item.done || item.runAt > now) continue;
      changed = true;

      const channel = await guild.channels.fetch(item.channelId).catch(() => null);
      if (channel) {
        const payload = item.embeds?.length
          ? { content: item.message || undefined, embeds: item.embeds }
          : item.message;
        await channel.send(payload).catch((err) => logger.error('scheduler.send', err));
      }

      if (item.repeatIntervalMs) {
        item.runAt = now + item.repeatIntervalMs;
      } else {
        item.done = true;
      }
    }

    if (changed) {
      await scheduledTaskStore.replaceAll(guild.id, items.filter((i) => !i.done)).catch((err) => logger.error('scheduler.save', err));
    }
  }
}

function start() {
  setInterval(() => { tick().catch((err) => logger.error('scheduler.tick', err)); }, TICK_MS);
  logger.info('Planificateur d\'annonces/evenements demarre');
}

module.exports = { start, tick };
