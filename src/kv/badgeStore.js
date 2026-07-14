const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId, userId) => `guild:${guildId}:badges:${userId}`;

async function list(guildId, userId) {
  return (await kvGet(key(guildId, userId))) ?? [];
}

async function unlock(guildId, userId, badgeKey) {
  const badges = await list(guildId, userId);
  if (badges.includes(badgeKey)) return false;
  badges.push(badgeKey);
  await kvPut(key(guildId, userId), badges);
  return true;
}

module.exports = { list, unlock };
