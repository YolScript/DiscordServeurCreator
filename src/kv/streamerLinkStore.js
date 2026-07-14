const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:streamers`;

async function list(guildId) {
  return (await kvGet(key(guildId))) ?? [];
}

async function replaceAll(guildId, items) {
  await kvPut(key(guildId), items);
}

async function add(guildId, { discordUserId, platform, identifier }) {
  const items = await list(guildId);
  const existing = items.find((i) => i.discordUserId === discordUserId && i.platform === platform);
  if (existing) {
    existing.identifier = identifier;
  } else {
    items.push({
      discordUserId, platform, identifier, isLive: false, liveRoleAssigned: false,
    });
  }
  await replaceAll(guildId, items);
}

async function remove(guildId, discordUserId, platform) {
  const items = await list(guildId);
  await replaceAll(guildId, items.filter((i) => !(i.discordUserId === discordUserId && i.platform === platform)));
}

module.exports = { list, replaceAll, add, remove };
