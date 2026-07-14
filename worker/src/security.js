import { botFetch, botFetchJson } from './discordApi.js';

const MAX_SNAPSHOTS = 5;

// Snapshot structurel : noms/couleurs/permissions de base uniquement.
// Les permission_overwrites (qui referencent des IDs de role/membre) ne sont
// pas exportes ici : ils ne seraient plus valides sur un autre serveur ou
// apres re-creation des roles, et les reimporter donnerait un faux sentiment
// de securite. Utilise l'export/import de la page Permissions pour ca, salon
// par salon.
export async function buildSnapshot(env, guildId) {
  const [roles, channels] = await Promise.all([
    botFetchJson(env, `/guilds/${guildId}/roles`),
    botFetchJson(env, `/guilds/${guildId}/channels`),
  ]);

  const channelById = new Map(channels.map((c) => [c.id, c]));

  return {
    exportedAt: Date.now(),
    roles: roles
      .filter((r) => r.name !== '@everyone')
      .map((r) => ({
        name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: r.permissions,
      })),
    channels: channels
      .filter((c) => c.type !== 4)
      .map((c) => ({
        name: c.name, type: c.type, topic: c.topic ?? null,
        categoryName: c.parent_id ? (channelById.get(c.parent_id)?.name ?? null) : null,
      })),
    categories: channels.filter((c) => c.type === 4).map((c) => ({ name: c.name })),
  };
}

// Restauration additive uniquement : cree les roles/categories/salons du
// snapshot qui n'existent plus (par nom), ne touche jamais a l'existant.
export async function restoreSnapshot(env, guildId, snapshot) {
  const created = { roles: 0, categories: 0, channels: 0 };

  const existingRoles = await botFetchJson(env, `/guilds/${guildId}/roles`);
  const existingRoleNames = new Set(existingRoles.map((r) => r.name));
  for (const role of snapshot.roles || []) {
    if (existingRoleNames.has(role.name)) continue;
    // eslint-disable-next-line no-await-in-loop
    await botFetchJson(env, `/guilds/${guildId}/roles`, {
      method: 'POST',
      body: JSON.stringify({
        name: role.name, color: role.color, hoist: role.hoist, mentionable: role.mentionable, permissions: role.permissions,
      }),
    });
    created.roles += 1;
  }

  let channels = await botFetchJson(env, `/guilds/${guildId}/channels`);
  const categoryIdByName = new Map(channels.filter((c) => c.type === 4).map((c) => [c.name, c.id]));

  for (const cat of snapshot.categories || []) {
    if (categoryIdByName.has(cat.name)) continue;
    // eslint-disable-next-line no-await-in-loop
    const category = await botFetchJson(env, `/guilds/${guildId}/channels`, {
      method: 'POST',
      body: JSON.stringify({ name: cat.name, type: 4 }),
    });
    categoryIdByName.set(cat.name, category.id);
    created.categories += 1;
  }

  channels = await botFetchJson(env, `/guilds/${guildId}/channels`);
  const existingChannelKeys = new Set(channels.filter((c) => c.type !== 4).map((c) => `${c.parent_id || ''}:${c.name}`));

  for (const ch of snapshot.channels || []) {
    const parentId = ch.categoryName ? categoryIdByName.get(ch.categoryName) : undefined;
    const key = `${parentId || ''}:${ch.name}`;
    if (existingChannelKeys.has(key)) continue;
    // eslint-disable-next-line no-await-in-loop
    await botFetchJson(env, `/guilds/${guildId}/channels`, {
      method: 'POST',
      body: JSON.stringify({
        name: ch.name, type: ch.type, parent_id: parentId || undefined, topic: ch.topic || undefined,
      }),
    });
    created.channels += 1;
  }

  return created;
}

export async function lockdownGuild(env, guildId) {
  const guild = await botFetchJson(env, `/guilds/${guildId}`);
  await botFetch(env, `/guilds/${guildId}`, {
    method: 'PATCH',
    body: JSON.stringify({ verification_level: 4 }),
  });
  return guild.verification_level;
}

export async function unlockGuild(env, guildId, previousLevel) {
  await botFetch(env, `/guilds/${guildId}`, {
    method: 'PATCH',
    body: JSON.stringify({ verification_level: previousLevel ?? 1 }),
  });
}

export async function pushSnapshot(env, guildId, snapshot) {
  const key = `guild:${guildId}:snapshots`;
  const raw = await env.GUILD_KV.get(key);
  const list = raw ? JSON.parse(raw) : [];
  list.unshift(snapshot);
  await env.GUILD_KV.put(key, JSON.stringify(list.slice(0, MAX_SNAPSHOTS)));
}

export async function getSnapshots(env, guildId) {
  const raw = await env.GUILD_KV.get(`guild:${guildId}:snapshots`);
  return raw ? JSON.parse(raw) : [];
}
