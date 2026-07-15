const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:tempbans`;

async function list(guildId) {
  return (await kvGet(key(guildId))) ?? [];
}

async function replaceAll(guildId, items) {
  await kvPut(key(guildId), items);
}

async function add(guildId, entry) {
  const items = await list(guildId);
  items.push(entry);
  await replaceAll(guildId, items);
}

async function remove(guildId, userId) {
  const items = await list(guildId);
  await replaceAll(guildId, items.filter((i) => i.userId !== userId));
}

module.exports = {
  list, replaceAll, add, remove,
};
