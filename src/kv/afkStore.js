const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:afk`;

// Cache memoire (roadmap n°373) : le statut AFK est consulte a CHAQUE
// message (detection de mention + auto-clear), un KV read par message
// exploserait vite le quota gratuit (1000 put/get... en pratique get() est
// illimite mais autant eviter la latence reseau sur un hot path). Mis a
// jour directement par set()/clear(), pas seulement par expiration.
const cache = new Map(); // guildId -> entries

async function all(guildId) {
  if (cache.has(guildId)) return cache.get(guildId);
  const entries = (await kvGet(key(guildId))) ?? {};
  cache.set(guildId, entries);
  return entries;
}

async function set(guildId, userId, reason) {
  const entries = await all(guildId);
  entries[userId] = { reason: reason || 'AFK', since: Date.now() };
  cache.set(guildId, entries);
  await kvPut(key(guildId), entries);
}

async function clear(guildId, userId) {
  const entries = await all(guildId);
  if (!(userId in entries)) return null;
  const entry = entries[userId];
  delete entries[userId];
  cache.set(guildId, entries);
  await kvPut(key(guildId), entries);
  return entry;
}

module.exports = { all, set, clear };
