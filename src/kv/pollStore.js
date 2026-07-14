const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:polls`;

async function list(guildId) {
  return (await kvGet(key(guildId))) ?? [];
}

async function replaceAll(guildId, items) {
  await kvPut(key(guildId), items);
}

async function add(guildId, poll) {
  const items = await list(guildId);
  const entry = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...poll };
  items.push(entry);
  await replaceAll(guildId, items);
  return entry;
}

async function find(guildId, pollId) {
  const items = await list(guildId);
  return items.find((p) => p.id === pollId) ?? null;
}

async function update(guildId, pollId, mutator) {
  const items = await list(guildId);
  const poll = items.find((p) => p.id === pollId);
  if (!poll) return null;
  mutator(poll);
  await replaceAll(guildId, items);
  return poll;
}

module.exports = {
  list, replaceAll, add, find, update,
};
