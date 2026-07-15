const { kvGet } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:customcommands`;

async function list(guildId) {
  return (await kvGet(key(guildId))) ?? [];
}

async function findByName(guildId, name) {
  return (await list(guildId)).find((c) => c.name === name) || null;
}

module.exports = { list, findByName };
