// Corbeille d'embeds (roadmap n°222) : les modeles supprimes sont
// photographies ici, restaurables pendant 7 jours — meme principe que la
// corbeille salons/roles (trash.js, roadmap n°138) mais duree plus longue
// car un modele d'embed n'a pas de contrainte de recreation Discord.

const EMBED_TRASH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const embedTrashKey = (guildId) => `guild:${guildId}:embedtrash`;

export async function getEmbedTrash(env, guildId) {
  const items = (await env.GUILD_KV.get(embedTrashKey(guildId), 'json')) || [];
  return items.filter((t) => Date.now() - t.deletedAt < EMBED_TRASH_TTL_MS);
}

export async function pushEmbedTrash(env, guildId, entry) {
  const items = await getEmbedTrash(env, guildId);
  items.push({
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    deletedAt: Date.now(),
    ...entry,
  });
  await env.GUILD_KV.put(embedTrashKey(guildId), JSON.stringify(items.slice(-30)));
}

export async function removeEmbedTrash(env, guildId, entryId) {
  const items = await getEmbedTrash(env, guildId);
  await env.GUILD_KV.put(embedTrashKey(guildId), JSON.stringify(items.filter((t) => t.id !== entryId)));
}
