const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:pendingpanelactions`;

async function list(guildId) {
  return (await kvGet(key(guildId))) ?? [];
}

async function clear(guildId) {
  await kvPut(key(guildId), []);
}

module.exports = { list, clear };
