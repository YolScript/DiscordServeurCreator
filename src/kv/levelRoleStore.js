const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:levelroles`;

async function list(guildId) {
  return (await kvGet(key(guildId))) ?? [];
}

async function set(guildId, level, roleId) {
  const items = (await list(guildId)).filter((lr) => lr.level !== level);
  items.push({ level, roleId });
  items.sort((a, b) => a.level - b.level);
  await kvPut(key(guildId), items);
}

async function remove(guildId, level) {
  const items = (await list(guildId)).filter((lr) => lr.level !== level);
  await kvPut(key(guildId), items);
}

module.exports = { list, set, remove };
