import { encryptSecret, decryptSecret } from './aiCrypto.js';

const key = (guildId) => `guild:${guildId}:aiconfig`;

// Jamais renvoyee au frontend : uniquement provider + hasKey (booleen).
export async function getAiConfig(env, guildId) {
  const raw = await env.GUILD_KV.get(key(guildId));
  if (!raw) return null;
  const { provider, apiKeyEncrypted, updatedAt } = JSON.parse(raw);
  return { provider, hasKey: Boolean(apiKeyEncrypted), updatedAt };
}

// Usage interne uniquement (appel IA cote Worker) : jamais expose via une route.
export async function getAiConfigWithKey(env, guildId) {
  const raw = await env.GUILD_KV.get(key(guildId));
  if (!raw) return null;
  const { provider, apiKeyEncrypted } = JSON.parse(raw);
  if (!apiKeyEncrypted) return null;
  const apiKey = await decryptSecret(env, apiKeyEncrypted);
  return { provider, apiKey };
}

export async function setAiConfig(env, guildId, { provider, apiKey }) {
  const apiKeyEncrypted = await encryptSecret(env, apiKey);
  await env.GUILD_KV.put(key(guildId), JSON.stringify({ provider, apiKeyEncrypted, updatedAt: Date.now() }));
}

export async function clearAiConfig(env, guildId) {
  await env.GUILD_KV.delete(key(guildId));
}
