const configKey = (guildId) => `guild:${guildId}:config`;
const gameRolesKey = (guildId) => `guild:${guildId}:gameroles`;

export async function getGuildConfig(env, guildId) {
  const raw = await env.GUILD_KV.get(configKey(guildId));
  return raw ? JSON.parse(raw) : null;
}

export async function putGuildConfig(env, guildId, config) {
  await env.GUILD_KV.put(configKey(guildId), JSON.stringify({ ...config, updatedAt: Date.now() }));
}

export async function getGameRoles(env, guildId) {
  const raw = await env.GUILD_KV.get(gameRolesKey(guildId));
  return raw ? JSON.parse(raw) : [];
}

export async function putGameRoles(env, guildId, roles) {
  await env.GUILD_KV.put(gameRolesKey(guildId), JSON.stringify(roles));
}
