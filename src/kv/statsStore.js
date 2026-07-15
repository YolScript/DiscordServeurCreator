const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:stats`;
const MAX_DAYS = 90;

async function list(guildId) {
  return (await kvGet(key(guildId))) ?? [];
}

// Upsert par date : le compteur de messages s'additionne (couvre le cas d'un
// redemarrage du bot en cours de journee), le nombre de membres est remplace
// par la derniere valeur connue.
async function add(guildId, { date, memberCount, messageCount }) {
  const items = await list(guildId);
  const existing = items.find((i) => i.date === date);
  if (existing) {
    existing.memberCount = memberCount;
    existing.messageCount = (existing.messageCount || 0) + messageCount;
  } else {
    items.push({ date, memberCount, messageCount });
  }
  await kvPut(key(guildId), items.slice(-MAX_DAYS));
}

module.exports = { list, add };
