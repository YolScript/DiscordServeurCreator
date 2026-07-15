const { kvGet, kvPut, kvDelete } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:pendinggeneration`;

async function get(guildId) {
  return kvGet(key(guildId));
}

async function clear(guildId) {
  await kvDelete(key(guildId));
}

module.exports = { get, clear };
