const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:suggestions`;

async function list(guildId) {
  return (await kvGet(key(guildId))) ?? [];
}

async function replaceAll(guildId, items) {
  await kvPut(key(guildId), items);
}

async function add(guildId, suggestion) {
  const items = await list(guildId);
  const entry = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...suggestion };
  items.push(entry);
  await replaceAll(guildId, items);
  return entry;
}

async function update(guildId, suggestionId, mutator) {
  const items = await list(guildId);
  const suggestion = items.find((s) => s.id === suggestionId);
  if (!suggestion) return null;
  mutator(suggestion);
  await replaceAll(guildId, items);
  return suggestion;
}

module.exports = {
  list, replaceAll, add, update,
};
