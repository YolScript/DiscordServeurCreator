const { kvGet, kvPut } = require('./cloudflareKv');

const key = (guildId) => `guild:${guildId}:channelmsgstats`;

// Forme : { [channelId]: { [dateISO]: count } } — bucket par jour (roadmap
// n°324, top salons sur 7/30 jours) plutot qu'un cumul brut, sans exploser
// le nombre de cles KV (une seule cle par serveur, comme voiceChannelStats).
async function get(guildId) {
  return (await kvGet(key(guildId))) ?? {};
}

async function put(guildId, data) {
  await kvPut(key(guildId), data);
}

module.exports = { get, put };
