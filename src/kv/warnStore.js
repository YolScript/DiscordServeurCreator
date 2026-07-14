const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId, userId) => `guild:${guildId}:warns:${userId}`;

async function list(guildId, userId) {
  return (await kvGet(key(guildId, userId))) ?? [];
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

module.exports = { list, add, clear };
