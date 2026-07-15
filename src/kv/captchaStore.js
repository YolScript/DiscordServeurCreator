const { kvGet, kvPut, kvDelete } = require('./cloudflareKv');

const key = (guildId, userId) => `guild:${guildId}:member:${userId}:captcha`;
const TTL_MS = 5 * 60_000;

async function set(guildId, userId, code) {
  await kvPut(key(guildId, userId), { code, expiresAt: Date.now() + TTL_MS });
}

async function verify(guildId, userId, attempt) {
  const entry = await kvGet(key(guildId, userId));
  await kvDelete(key(guildId, userId));
  if (!entry || entry.expiresAt < Date.now()) return false;
  return entry.code.toLowerCase() === attempt.trim().toLowerCase();
}

module.exports = { set, verify };
