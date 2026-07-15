const key = (guildId) => `guild:${guildId}:auditlog`;
const MAX_ENTRIES = 200;

// Meme cle KV que src/kv/auditLogStore.js cote bot : un seul log, alimente
// par les deux runtimes (actions dashboard ici, actions bot/commandes la-bas).
export async function logAudit(env, guildId, { title, description }) {
  const raw = await env.GUILD_KV.get(key(guildId));
  const items = raw ? JSON.parse(raw) : [];
  items.unshift({
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    title,
    description,
  });
  await env.GUILD_KV.put(key(guildId), JSON.stringify(items.slice(0, MAX_ENTRIES)));
}

export async function getAuditLog(env, guildId) {
  const raw = await env.GUILD_KV.get(key(guildId));
  return raw ? JSON.parse(raw) : [];
}
