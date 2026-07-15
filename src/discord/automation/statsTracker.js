const client = require('../client');
const statsStore = require('../../kv/statsStore');
const logger = require('../../shared/logger');

const TICK_MS = 60 * 60 * 1000; // verifie le changement de jour toutes les heures

const messageCounts = new Map(); // guildId -> messages depuis le dernier flush
const lastFlushDate = new Map(); // guildId -> 'YYYY-MM-DD'

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function recordMessage(guildId) {
  messageCounts.set(guildId, (messageCounts.get(guildId) || 0) + 1);
}

async function tick() {
  const today = todayKey();
  for (const guild of client.guilds.cache.values()) {
    if (lastFlushDate.get(guild.id) === today) continue;
    try {
      const messageCount = messageCounts.get(guild.id) || 0;
      await statsStore.add(guild.id, { date: today, memberCount: guild.memberCount, messageCount });
      messageCounts.set(guild.id, 0);
      lastFlushDate.set(guild.id, today);
    } catch (err) {
      logger.error('statsTracker.tick', err);
    }
  }
}

function start() {
  tick().catch((err) => logger.error('statsTracker.tick initial', err));
  setInterval(() => { tick().catch((err) => logger.error('statsTracker.tick', err)); }, TICK_MS);
  logger.info('Suivi des statistiques demarre');
}

module.exports = { start, recordMessage };
