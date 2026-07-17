const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:voicechannelstats`;

async function get(guildId) {
  return (await kvGet(key(guildId))) ?? {};
}

async function put(guildId, data) {
  await kvPut(key(guildId), data);
}

module.exports = { get, put };
