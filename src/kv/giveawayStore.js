const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:giveaways`;

async function list(guildId) {
  return (await kvGet(key(guildId))) ?? [];
}

async function replaceAll(guildId, items) {
  await kvPut(key(guildId), items);
}

async function add(guildId, giveaway) {
  const items = await list(guildId);
  const entry = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...giveaway };
  items.push(entry);
  await replaceAll(guildId, items);
  return entry;
}

async function update(guildId, giveawayId, mutator) {
  const items = await list(guildId);
  const giveaway = items.find((g) => g.id === giveawayId);
  if (!giveaway) return null;
  mutator(giveaway);
  await replaceAll(guildId, items);
  return giveaway;
}

module.exports = {
  list, replaceAll, add, update,
};
