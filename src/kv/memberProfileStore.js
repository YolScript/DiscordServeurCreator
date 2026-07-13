const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId, userId) => `guild:${guildId}:member:${userId}:profiles`;

async function list(guildId, userId) {
  return (await kvGet(key(guildId, userId))) ?? [];
}

async function upsert(guildId, userId, { gameRoleId, ingamePseudo }) {
  const profiles = await list(guildId, userId);
  const existing = profiles.find((p) => p.gameRoleId === gameRoleId);
  if (existing) {
    existing.ingamePseudo = ingamePseudo;
    existing.updatedAt = Date.now();
  } else {
    profiles.push({ gameRoleId, ingamePseudo, updatedAt: Date.now() });
  }
  await kvPut(key(guildId, userId), profiles);
}

async function remove(guildId, userId, gameRoleId) {
  const profiles = await list(guildId, userId);
  await kvPut(key(guildId, userId), profiles.filter((p) => p.gameRoleId !== gameRoleId));
}

module.exports = { list, upsert, remove };
