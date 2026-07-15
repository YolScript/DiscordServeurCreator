const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:auditlog`;
const MAX_ENTRIES = 200;

async function list(guildId) {
  return (await kvGet(key(guildId))) ?? [];
}

async function add(guildId, { title, description }) {
  const items = await list(guildId);
  items.unshift({
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    title,
    description,
  });
  await kvPut(key(guildId), items.slice(0, MAX_ENTRIES));
}

module.exports = { list, add };
