const client = require('../client');
const statsStore = require('../../kv/statsStore');
const channelMessageStatsStore = require('../../kv/channelMessageStatsStore');
const logger = require('../../shared/logger');

const TICK_MS = 60 * 60 * 1000; // verifie le changement de jour toutes les heures
const CHANNEL_STATS_RETENTION_DAYS = 35;

const messageCounts = new Map(); // guildId -> messages depuis le dernier flush
const hourCounts = new Map(); // guildId -> Array(24) (heures UTC) depuis le dernier flush
const joinCounts = new Map(); // guildId -> arrivees depuis le dernier flush (retention n°163)
const lastFlushDate = new Map(); // guildId -> 'YYYY-MM-DD'
const channelMessageCounts = new Map(); // guildId -> Map(channelId -> count) depuis le dernier flush (n°324)

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// Arrivees brutes par jour (roadmap n°163) : necessaires pour calculer une
// vraie retention (le delta de memberCount ne donne que le net).
function recordJoin(guildId) {
  joinCounts.set(guildId, (joinCounts.get(guildId) || 0) + 1);
}

function recordMessage(guildId, channelId) {
  messageCounts.set(guildId, (messageCounts.get(guildId) || 0) + 1);
  // Repartition horaire (heatmap du dashboard, roadmap n°030). Stockee en
  // UTC, convertie en heure locale a l'affichage.
  const hours = hourCounts.get(guildId) || Array(24).fill(0);
  hours[new Date().getUTCHours()] += 1;
  hourCounts.set(guildId, hours);

  // Top salons par messages (roadmap n°324).
  if (channelId) {
    const perChannel = channelMessageCounts.get(guildId) || new Map();
    perChannel.set(channelId, (perChannel.get(channelId) || 0) + 1);
    channelMessageCounts.set(guildId, perChannel);
  }
}

async function flushChannelStats(guildId, today) {
  const perChannel = channelMessageCounts.get(guildId);
  if (!perChannel || !perChannel.size) return;
  channelMessageCounts.delete(guildId);
  const stats = await channelMessageStatsStore.get(guildId).catch(() => ({}));
  const cutoffDate = new Date(Date.now() - CHANNEL_STATS_RETENTION_DAYS * 86400000).toISOString().slice(0, 10);
  for (const [channelId, count] of perChannel) {
    const byDate = stats[channelId] || {};
    byDate[today] = (byDate[today] || 0) + count;
    for (const d of Object.keys(byDate)) if (d < cutoffDate) delete byDate[d];
    stats[channelId] = byDate;
  }
  await channelMessageStatsStore.put(guildId, stats);
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
        // Compteur de boosts (roadmap n°330) : reutilise le releve
        // journalier existant plutot qu'un nouveau store.
        boostCount: guild.premiumSubscriptionCount || 0,
      });
      messageCounts.set(guild.id, 0);
      joinCounts.set(guild.id, 0);
      hourCounts.delete(guild.id);
      lastFlushDate.set(guild.id, today);
    } catch (err) {
      logger.error('statsTracker.tick', err);
    }
    // eslint-disable-next-line no-await-in-loop
    await flushChannelStats(guild.id, today).catch((err) => logger.error('statsTracker.flushChannelStats', err));
  }
}

function start() {
  tick().catch((err) => logger.error('statsTracker.tick initial', err));
  setInterval(() => { tick().catch((err) => logger.error('statsTracker.tick', err)); }, TICK_MS);
  logger.info('Suivi des statistiques demarre');
}

module.exports = { start, recordMessage, recordJoin };
