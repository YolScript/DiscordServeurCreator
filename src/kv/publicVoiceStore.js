const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:publicvoice`;

async function get(guildId) {
  const state = (await kvGet(key(guildId))) ?? { spawnedChannelIds: [] };
  if (!state.owners) state.owners = {}; // channelId -> userId (roadmap n°187)
  return state;
}

async function set(guildId, state) {
  await kvPut(key(guildId), state);
}

module.exports = { get, set };
