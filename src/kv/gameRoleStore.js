const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:gameroles`;

function normalizeGameKey(gameName) {
  return gameName.trim().toLowerCase();
}

async function list(guildId) {
  return (await kvGet(key(guildId))) ?? [];
}

async function findByKey(guildId, gameKey) {
  const roles = await list(guildId);
  return roles.find((r) => r.gameKey === gameKey) ?? null;
}

async function findByRoleId(guildId, roleId) {
  const roles = await list(guildId);
  return roles.find((r) => r.roleId === roleId) ?? null;
}

async function add(guildId, { gameKey, displayName, roleId, colorHex, colorIndex }) {
  const roles = await list(guildId);
  roles.push({ gameKey, displayName, roleId, colorHex, colorIndex, createdAt: Date.now() });
  await kvPut(key(guildId), roles);
}

async function removeByRoleId(guildId, roleId) {
  const roles = await list(guildId);
  await kvPut(key(guildId), roles.filter((r) => r.roleId !== roleId));
}

async function rename(guildId, roleId, displayName) {
  const roles = await list(guildId);
  const role = roles.find((r) => r.roleId === roleId);
  if (role) role.displayName = displayName;
  await kvPut(key(guildId), roles);
}

module.exports = { normalizeGameKey, list, findByKey, findByRoleId, add, removeByRoleId, rename };
