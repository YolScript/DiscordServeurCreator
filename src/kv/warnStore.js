const { kvGet, kvPut } = require('./cloudflareKv');
const guildConfigStore = require('./guildConfigStore');

const key = (guildId, userId) => `guild:${guildId}:warns:${userId}`;

async function list(guildId, userId) {
  return (await kvGet(key(guildId, userId))) ?? [];
}

// Warns encore "actifs" (roadmap n°280) : les entrees plus vieilles que
// config.warnExpiryDays sont exclues sans etre supprimees (0/non configure
// = jamais d'expiration, comportement historique inchange). L'historique
// KV reste complet : un changement de duree ne perd jamais de donnees, il
// change juste ce qui compte comme "actif" a la lecture.
async function listActive(guildId, userId) {
  const warns = await list(guildId, userId);
  const config = await guildConfigStore.find(guildId).catch(() => null);
  const expiryDays = config?.warnExpiryDays;
  if (!expiryDays || expiryDays <= 0) return warns;
  const cutoff = Date.now() - expiryDays * 86400000;
  return warns.filter((w) => w.createdAt > cutoff);
}

async function add(guildId, userId, { reason, moderatorId, source }) {
  const warns = await list(guildId, userId);
  const entry = { reason, moderatorId, source: source ?? 'manuel', createdAt: Date.now() };
  warns.push(entry);
  await kvPut(key(guildId, userId), warns);
  return warns;
}

async function clear(guildId, userId) {
  await kvPut(key(guildId, userId), []);
}

module.exports = {
  list, listActive, add, clear,
};
