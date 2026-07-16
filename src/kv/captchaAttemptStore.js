const { kvGet, kvPut, kvDelete } = require('./cloudflareKv');

// Fenetre glissante d'echecs de captcha (emoji ou image) par membre+serveur :
// protege contre un bot qui reessaierait en boucle jusqu'a deviner juste.
const key = (guildId, userId) => `guild:${guildId}:member:${userId}:captchafails`;
const WINDOW_MS = 10 * 60_000;
const MAX_FAILS = 5;

async function recordFailure(guildId, userId) {
  const now = Date.now();
  const entry = (await kvGet(key(guildId, userId))) || { count: 0, windowStart: now };
  if (now - entry.windowStart > WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count += 1;
  await kvPut(key(guildId, userId), entry, { ttlSeconds: Math.ceil(WINDOW_MS / 1000) + 60 });
  return entry.count;
}

async function getLockStatus(guildId, userId) {
  const entry = await kvGet(key(guildId, userId));
  if (!entry) return { locked: false };
  const elapsed = Date.now() - entry.windowStart;
  if (elapsed > WINDOW_MS) return { locked: false };
  if (entry.count < MAX_FAILS) return { locked: false };
  return { locked: true, retryAfterSeconds: Math.ceil((WINDOW_MS - elapsed) / 1000) };
}

async function reset(guildId, userId) {
  await kvDelete(key(guildId, userId));
}

module.exports = {
  recordFailure, getLockStatus, reset, MAX_FAILS,
};
