const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId, userId) => `guild:${guildId}:member:${userId}:platforms`;

async function get(guildId, userId) {
  return (await kvGet(key(guildId, userId))) ?? {};
}

async function set(guildId, userId, platform, pseudo) {
  const links = await get(guildId, userId);
  links[platform] = pseudo;
  await kvPut(key(guildId, userId), links);
  return links;
}

module.exports = { get, set };
