const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:shop`;

async function list(guildId) {
  return (await kvGet(key(guildId))) ?? [];
}

async function replaceAll(guildId, items) {
  await kvPut(key(guildId), items);
}

async function add(guildId, item) {
  const items = await list(guildId);
  const entry = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...item };
  items.push(entry);
  await replaceAll(guildId, items);
  return entry;
}

async function remove(guildId, itemId) {
  const items = await list(guildId);
  await replaceAll(guildId, items.filter((i) => i.id !== itemId));
}

module.exports = {
  list, replaceAll, add, remove,
};
