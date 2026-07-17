const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:sanctioncontests`;

// Contestation de sanction par formulaire (roadmap n°279) : le membre
// sanctionne remplit un motif via un bouton + modal dans son DM, le staff
// retrouve la liste en attente dans le dashboard (page automod).
async function list(guildId) {
  return (await kvGet(key(guildId))) ?? [];
}

async function add(guildId, { sanctionType, targetId, targetTag, sanctionReason, message }) {
  const contests = await list(guildId);
  const entry = {
    id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    sanctionType, targetId, targetTag, sanctionReason, message,
    status: 'pending',
    createdAt: Date.now(),
  };
  contests.unshift(entry);
  await kvPut(key(guildId), contests.slice(0, 200));
  return entry;
}

async function resolve(guildId, contestId) {
  const contests = await list(guildId);
  const updated = contests.map((c) => (c.id === contestId ? { ...c, status: 'resolved' } : c));
  await kvPut(key(guildId), updated);
  return updated;
}

module.exports = { list, add, resolve };
