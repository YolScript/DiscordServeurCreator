// Corbeille (roadmap n°138) : les salons, categories et roles supprimes via
// le dashboard sont d'abord photographies ici, restaurables pendant 24h.
// La restauration recree l'objet (nouvel ID Discord — l'original n'est pas
// ressuscitable), avec ses reglages et permissions.

const TRASH_TTL_MS = 24 * 60 * 60 * 1000;
const trashKey = (guildId) => `guild:${guildId}:trash`;

export async function getTrash(env, guildId) {
  const items = (await env.GUILD_KV.get(trashKey(guildId), 'json')) || [];
  return items.filter((t) => Date.now() - t.deletedAt < TRASH_TTL_MS);
}

export async function pushTrash(env, guildId, entry) {
  const items = await getTrash(env, guildId);
  items.push({
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    deletedAt: Date.now(),
    ...entry,
  });
  await env.GUILD_KV.put(trashKey(guildId), JSON.stringify(items.slice(-30)));
}

export async function removeTrash(env, guildId, entryId) {
  const items = await getTrash(env, guildId);
  await env.GUILD_KV.put(trashKey(guildId), JSON.stringify(items.filter((t) => t.id !== entryId)));
}
