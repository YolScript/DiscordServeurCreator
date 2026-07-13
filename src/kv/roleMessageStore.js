const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:rolemessages`;

async function list(guildId) {
  return (await kvGet(key(guildId))) ?? [];
}

async function replaceAll(guildId, pages) {
  await kvPut(key(guildId), pages);
}

module.exports = { list, replaceAll };
