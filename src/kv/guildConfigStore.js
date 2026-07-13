const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:config`;

async function find(guildId) {
  return kvGet(key(guildId));
}

async function upsert(guildId, config) {
  const existing = await find(guildId);
  const now = Date.now();
  const merged = {
    ...existing,
    ...config,
    guildId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await kvPut(key(guildId), merged);
  return merged;
}

module.exports = { find, upsert };
