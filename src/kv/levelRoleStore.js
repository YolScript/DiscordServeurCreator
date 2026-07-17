const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:levelroles`;

async function list(guildId) {
  return (await kvGet(key(guildId))) ?? [];
}

async function set(guildId, level, data) {
  const items = (await list(guildId)).filter((lr) => lr.level !== level);
  const { roleId, bonus, announce } = typeof data === 'string' ? { roleId: data } : (data || {});
  items.push({
    level,
    ...(roleId ? { roleId } : {}),
    ...(bonus ? { bonus } : {}),
    ...(announce ? { announce } : {}),
  });
  items.sort((a, b) => a.level - b.level);
  await kvPut(key(guildId), items);
}

async function remove(guildId, level) {
  const items = (await list(guildId)).filter((lr) => lr.level !== level);
  await kvPut(key(guildId), items);
}

module.exports = { list, set, remove };
