const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:birthdays`;

async function list(guildId) {
  return (await kvGet(key(guildId))) ?? [];
}

async function set(guildId, userId, month, day) {
  const items = await list(guildId);
  const existing = items.find((b) => b.userId === userId);
  if (existing) {
    existing.month = month;
    existing.day = day;
  } else {
    items.push({ userId, month, day });
  }
  await kvPut(key(guildId), items);
}

module.exports = { list, set };
