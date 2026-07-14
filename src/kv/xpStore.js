const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:xp`;

async function getAll(guildId) {
  return (await kvGet(key(guildId))) ?? {};
}

async function getMember(guildId, userId) {
  const all = await getAll(guildId);
  return all[userId] ?? {
    xp: 0, level: 0, messageCount: 0, voiceMinutes: 0,
  };
}

async function setMember(guildId, userId, data) {
  const all = await getAll(guildId);
  all[userId] = data;
  await kvPut(key(guildId), all);
}

module.exports = { getAll, getMember, setMember };
