const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:stats`;
const MAX_DAYS = 90;

async function list(guildId) {
  return (await kvGet(key(guildId))) ?? [];
}

// Upsert par date : le compteur de messages et la repartition horaire
// s'additionnent (couvre le cas d'un redemarrage du bot en cours de
// journee), le nombre de membres est remplace par la derniere valeur connue.
async function add(guildId, { date, memberCount, messageCount, joins, hours }) {
  const items = await list(guildId);
  const existing = items.find((i) => i.date === date);
  if (existing) {
    existing.memberCount = memberCount;
    existing.messageCount = (existing.messageCount || 0) + messageCount;
    if (joins) existing.joins = (existing.joins || 0) + joins;
    if (hours) {
      const base = existing.hours || Array(24).fill(0);
      existing.hours = base.map((v, i) => v + (hours[i] || 0));
    }
  } else {
    items.push({ date, memberCount, messageCount, ...(joins ? { joins } : {}), ...(hours ? { hours } : {}) });
  }
  await kvPut(key(guildId), items.slice(-MAX_DAYS));
}

module.exports = { list, add };
