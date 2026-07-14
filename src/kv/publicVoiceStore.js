const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:publicvoice`;

async function get(guildId) {
  return (await kvGet(key(guildId))) ?? { spawnedChannelIds: [] };
}

async function set(guildId, state) {
  await kvPut(key(guildId), state);
}

module.exports = { get, set };
