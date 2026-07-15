const { kvGet, kvPut } = require('./cloudflareKv');

// Ne stocke jamais la date de naissance : uniquement le flag majeur/mineur
// derive, prive (jamais affiche publiquement, pas de role dedie).
const key = (guildId, userId) => `guild:${guildId}:member:${userId}:agestatus`;

async function setAdultStatus(guildId, userId, isAdult) {
  await kvPut(key(guildId, userId), { isAdult, updatedAt: Date.now() });
}

async function getAdultStatus(guildId, userId) {
  const entry = await kvGet(key(guildId, userId));
  return entry?.isAdult ?? null;
}

module.exports = { setAdultStatus, getAdultStatus };
