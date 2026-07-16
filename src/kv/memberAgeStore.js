const { kvGet, kvPut, kvDelete } = require('./cloudflareKv');

// Ne stocke jamais la date de naissance : uniquement le flag majeur/mineur
// derive, prive (jamais affiche publiquement, pas de role dedie).
// TTL long en filet de securite (au cas ou le nettoyage au depart echoue),
// le vrai nettoyage se fait via remove() sur guildMemberRemove.
const key = (guildId, userId) => `guild:${guildId}:member:${userId}:agestatus`;
const TTL_SECONDS = 400 * 24 * 60 * 60;

async function setAdultStatus(guildId, userId, isAdult) {
  await kvPut(key(guildId, userId), { isAdult, updatedAt: Date.now() }, { ttlSeconds: TTL_SECONDS });
}

async function getAdultStatus(guildId, userId) {
  const entry = await kvGet(key(guildId, userId));
  return entry?.isAdult ?? null;
}

async function remove(guildId, userId) {
  await kvDelete(key(guildId, userId));
}

module.exports = {
  setAdultStatus, getAdultStatus, remove,
};
