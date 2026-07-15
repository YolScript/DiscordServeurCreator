const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:reactionroles`;

async function list(guildId) {
  return (await kvGet(key(guildId))) ?? [];
}

async function replaceAll(guildId, items) {
  await kvPut(key(guildId), items);
}

async function add(guildId, group) {
  const items = await list(guildId);
  const entry = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...group };
  items.push(entry);
  await replaceAll(guildId, items);
  return entry;
}

async function update(guildId, groupId, mutator) {
  const items = await list(guildId);
  const group = items.find((g) => g.id === groupId);
  if (!group) return null;
  mutator(group);
  await replaceAll(guildId, items);
  return group;
}

async function remove(guildId, groupId) {
  const items = await list(guildId);
  await replaceAll(guildId, items.filter((g) => g.id !== groupId));
}

module.exports = {
  list, replaceAll, add, update, remove,
};
