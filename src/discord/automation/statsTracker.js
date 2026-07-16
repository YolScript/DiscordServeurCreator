const client = require('../client');
const statsStore = require('../../kv/statsStore');
const logger = require('../../shared/logger');

const TICK_MS = 60 * 60 * 1000; // verifie le changement de jour toutes les heures

const messageCounts = new Map(); // guildId -> messages depuis le dernier flush
const hourCounts = new Map(); // guildId -> Array(24) (heures UTC) depuis le dernier flush
const joinCounts = new Map(); // guildId -> arrivees depuis le dernier flush (retention n°163)
const lastFlushDate = new Map(); // guildId -> 'YYYY-MM-DD'

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// Arrivees brutes par jour (roadmap n°163) : necessaires pour calculer une
// vraie retention (le delta de memberCount ne donne que le net).
function recordJoin(guildId) {
  joinCounts.set(guildId, (joinCounts.get(guildId) || 0) + 1);
}

function recordMessage(guildId) {
  messageCounts.set(guildId, (messageCounts.get(guildId) || 0) + 1);
  // Repartition horaire (heatmap du dashboard, roadmap n°030). Stockee en
  // UTC, convertie en heure locale a l'affichage.
  const hours = hourCounts.get(guildId) || Array(24).fill(0);
  hours[new Date().getUTCHours()] += 1;
  hourCounts.set(guildId, hours);
}

// Flush HORAIRE (et plus seulement au changement de jour) : statsStore.add
// cumule par date, donc un redemarrage du bot ne perd au pire qu'une heure
// de compteurs au lieu de la journee entiere.
async function tick() {
  const today = todayKey();
  for (const guild of client.guilds.cache.values()) {
    const messageCount = messageCounts.get(guild.id) || 0;
    const joins = joinCounts.get(guild.id) || 0;
    if (!messageCount && !joins && lastFlushDate.get(guild.id) === today) continue;
    try {
      await statsStore.add(guild.id, {
        date: today,
        memberCount: guild.memberCount,
        messageCount,
        joins,
        hours: hourCounts.get(guild.id),
      });
      messageCounts.set(guild.id, 0);
      joinCounts.set(guild.id, 0);
      hourCounts.delete(guild.id);
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

module.exports = { start, recordMessage, recordJoin };
