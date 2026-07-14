const { kvGet, kvPut } = require('./cloudflareKv');

const countsKey = (guildId) => `guild:${guildId}:referrals`;
const rolesKey = (guildId) => `guild:${guildId}:referralroles`;

async function getCounts(guildId) {
  return (await kvGet(countsKey(guildId))) ?? {};
}

async function increment(guildId, inviterId) {
  const counts = await getCounts(guildId);
  counts[inviterId] = (counts[inviterId] ?? 0) + 1;
  await kvPut(countsKey(guildId), counts);
  return counts[inviterId];
}

async function listRoles(guildId) {
  return (await kvGet(rolesKey(guildId))) ?? [];
}

async function setRole(guildId, count, roleId) {
  const items = (await listRoles(guildId)).filter((r) => r.count !== count);
  items.push({ count, roleId });
  items.sort((a, b) => a.count - b.count);
  await kvPut(rolesKey(guildId), items);
}

async function removeRole(guildId, count) {
  const items = (await listRoles(guildId)).filter((r) => r.count !== count);
  await kvPut(rolesKey(guildId), items);
}

module.exports = {
  getCounts, increment, listRoles, setRole, removeRole,
};
