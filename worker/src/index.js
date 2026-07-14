import { json, preflightResponse, withCors } from './cors.js';
import {
  handleLogin, handleCallback, refreshTokenIfNeeded, getUserAdminGuildIds, getUserAdminGuilds,
} from './oauth.js';
import { getSession, destroySession, clearSessionCookie } from './session.js';
import { botFetch, botFetchJson } from './discordApi.js';
import { getGuildConfig, putGuildConfig, getGameRoles, putGameRoles } from './kvStore.js';
import {
  bulkEditPermissions, exportChannelPermissions, importChannelPermissions, resetRoleToDefault,
} from './permissions.js';
import {
  CHANNEL_PRESETS, CATEGORY_PRESETS, createPresetChannel, createPresetCategory,
} from './channelPresets.js';
import { GAME_ROLE_CATALOG, createGameRolePreset } from './gameRolePresets.js';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function requireSession(env, request) {
  const session = await getSession(env, request);
  if (!session) throw new HttpError(401, 'Non connecte.');
  return refreshTokenIfNeeded(env, session);
}

async function requireGuildAccess(env, request, guildId) {
  const session = await requireSession(env, request);
  const adminGuildIds = await getUserAdminGuildIds(env, session);
  if (!adminGuildIds.includes(guildId)) {
    throw new HttpError(403, "Tu n'es pas administrateur de ce serveur.");
  }
  const botGuildRes = await botFetch(env, `/guilds/${guildId}`);
  if (!botGuildRes.ok) throw new HttpError(404, "Le bot n'est pas present sur ce serveur.");
  return session;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Corps JSON invalide.');
  }
}

async function router(request, env) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const method = request.method;

  if (method === 'OPTIONS') return preflightResponse(env);

  // --- Auth ---
  if (method === 'GET' && url.pathname === '/auth/login') return handleLogin(request, env);
  if (method === 'GET' && url.pathname === '/auth/callback') return handleCallback(request, env);
  if (method === 'POST' && url.pathname === '/auth/logout') {
    const session = await getSession(env, request);
    if (session) await destroySession(env, session.sessionId);
    return withCors(new Response(null, { status: 204, headers: { 'Set-Cookie': clearSessionCookie() } }), env);
  }

  if (method === 'GET' && url.pathname === '/api/me') {
    const session = await requireSession(env, request);
    return json({ userId: session.userId, username: session.username, avatar: session.avatar }, env);
  }

  if (method === 'GET' && url.pathname === '/api/channel-presets') {
    return json(CHANNEL_PRESETS, env);
  }

  if (method === 'GET' && url.pathname === '/api/category-presets') {
    return json(CATEGORY_PRESETS, env);
  }

  if (method === 'GET' && url.pathname === '/api/game-role-catalog') {
    return json(GAME_ROLE_CATALOG, env);
  }

  // --- /api/guilds ---
  if (parts[0] === 'api' && parts[1] === 'guilds') {
    if (parts.length === 2 && method === 'GET') {
      const session = await requireSession(env, request);
      const adminGuilds = await getUserAdminGuilds(env, session);
      const results = [];
      for (const adminGuild of adminGuilds) {
        const botGuildRes = await botFetch(env, `/guilds/${adminGuild.id}`);
        if (!botGuildRes.ok) {
          const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${env.DISCORD_CLIENT_ID}`
            + `&permissions=8&scope=bot%20applications.commands&guild_id=${adminGuild.id}&disable_guild_select=true`;
          results.push({
            guildId: adminGuild.id, name: adminGuild.name, icon: adminGuild.icon, botPresent: false, inviteUrl,
          });
          continue;
        }
        const guild = await botGuildRes.json();
        const config = await getGuildConfig(env, adminGuild.id);
        results.push({
          guildId: adminGuild.id, botPresent: true, name: guild.name, icon: guild.icon,
          configured: Boolean(config), template: config?.template ?? null,
        });
      }
      return json(results, env);
    }

    const guildId = parts[2];
    if (!guildId) throw new HttpError(404, 'Route inconnue.');

    if (parts.length === 3) throw new HttpError(404, 'Route inconnue.');

    const sub = parts[3];

    if (sub === 'channels' && parts.length === 4 && method === 'GET') {
      await requireGuildAccess(env, request, guildId);
      const channels = await botFetchJson(env, `/guilds/${guildId}/channels`);
      return json(channels, env);
    }

    if (sub === 'roles' && parts.length === 4 && method === 'GET') {
      await requireGuildAccess(env, request, guildId);
      const roles = await botFetchJson(env, `/guilds/${guildId}/roles`);
      return json(roles, env);
    }

    if (sub === 'config' && parts.length === 4) {
      await requireGuildAccess(env, request, guildId);
      if (method === 'GET') {
        const config = await getGuildConfig(env, guildId);
        return json(config, env);
      }
      if (method === 'PATCH') {
        const body = await readJson(request);
        const existing = (await getGuildConfig(env, guildId)) || {};
        const merged = { ...existing, ...body };
        await putGuildConfig(env, guildId, merged);
        return json(merged, env);
      }
    }

    if (sub === 'gameroles' && method === 'GET' && parts.length === 4) {
      await requireGuildAccess(env, request, guildId);
      return json(await getGameRoles(env, guildId), env);
    }

    if (sub === 'gameroles' && parts[4] === 'preset' && method === 'POST') {
      await requireGuildAccess(env, request, guildId);
      const { gameKey } = await readJson(request);
      const config = await getGuildConfig(env, guildId);
      const roles = await getGameRoles(env, guildId);
      const newRole = await createGameRolePreset(env, guildId, config, gameKey, roles);
      roles.push(newRole);
      await putGameRoles(env, guildId, roles);
      return json(newRole, env);
    }

    if (sub === 'gameroles' && parts.length === 5 && parts[4] !== 'preset') {
      await requireGuildAccess(env, request, guildId);
      const roleId = parts[4];
      const roles = await getGameRoles(env, guildId);

      if (method === 'PATCH') {
        const { displayName } = await readJson(request);
        const role = roles.find((r) => r.roleId === roleId);
        if (!role) throw new HttpError(404, 'Role de jeu introuvable.');
        role.displayName = displayName;
        await putGameRoles(env, guildId, roles);
        return json(role, env);
      }
      if (method === 'DELETE') {
        await botFetch(env, `/guilds/${guildId}/roles/${roleId}`, { method: 'DELETE' });
        await putGameRoles(env, guildId, roles.filter((r) => r.roleId !== roleId));
        return json({ ok: true }, env);
      }
    }

    if (sub === 'permissions' && parts[4] === 'bulk' && method === 'POST') {
      await requireGuildAccess(env, request, guildId);
      const { channelIds, roleId, allow, deny } = await readJson(request);
      if (!Array.isArray(channelIds) || !roleId) throw new HttpError(400, 'channelIds et roleId requis.');
      const results = await bulkEditPermissions(env, { channelIds, roleId, allow: allow || [], deny: deny || [] });
      return json(results, env);
    }

    if (sub === 'permissions' && parts[4] === 'export' && method === 'GET') {
      await requireGuildAccess(env, request, guildId);
      const channelId = url.searchParams.get('channelId');
      if (!channelId) throw new HttpError(400, 'channelId requis.');
      return json(await exportChannelPermissions(env, channelId), env);
    }

    if (sub === 'permissions' && parts[4] === 'import' && method === 'POST') {
      await requireGuildAccess(env, request, guildId);
      const { channelId, permissionOverwrites } = await readJson(request);
      if (!channelId || !Array.isArray(permissionOverwrites)) {
        throw new HttpError(400, 'channelId et permissionOverwrites requis.');
      }
      await importChannelPermissions(env, channelId, permissionOverwrites);
      return json({ ok: true }, env);
    }

    if (sub === 'channels' && parts[4] === 'preset' && method === 'POST') {
      await requireGuildAccess(env, request, guildId);
      const { presetKey, categoryId } = await readJson(request);
      const config = (await getGuildConfig(env, guildId)) || {};
      const channel = await createPresetChannel(env, guildId, config, presetKey, categoryId);
      return json(channel, env);
    }

    if (sub === 'categories' && parts[4] === 'preset' && method === 'POST') {
      await requireGuildAccess(env, request, guildId);
      const { presetKey } = await readJson(request);
      const config = (await getGuildConfig(env, guildId)) || {};
      const result = await createPresetCategory(env, guildId, config, presetKey);
      return json(result, env);
    }

    if (sub === 'channels' && parts.length === 5 && parts[4] !== 'preset') {
      await requireGuildAccess(env, request, guildId);
      const channelId = parts[4];

      if (method === 'PATCH') {
        const { name } = await readJson(request);
        if (!name) throw new HttpError(400, 'name requis.');
        const channel = await botFetchJson(env, `/channels/${channelId}`, { method: 'PATCH', body: JSON.stringify({ name }) });
        return json(channel, env);
      }
      if (method === 'DELETE') {
        await botFetch(env, `/channels/${channelId}`, { method: 'DELETE' });
        return json({ ok: true }, env);
      }
    }

    if (sub === 'roles' && parts[5] === 'reset-default' && method === 'POST') {
      await requireGuildAccess(env, request, guildId);
      const roleKey = parts[4]; // 'administrateur' | 'moderateur'
      const config = await getGuildConfig(env, guildId);
      const roleId = roleKey === 'administrateur' ? config?.adminRoleId : config?.moderateurRoleId;
      if (!roleId) throw new HttpError(404, 'Role introuvable dans la config.');
      await resetRoleToDefault(env, guildId, roleId, roleKey);
      return json({ ok: true }, env);
    }
  }

  throw new HttpError(404, 'Route inconnue.');
}

export default {
  async fetch(request, env) {
    try {
      return await router(request, env);
    } catch (err) {
      if (err instanceof HttpError) {
        return json({ error: err.message }, env, { status: err.status });
      }
      console.error(err);
      return json({ error: 'Erreur interne.' }, env, { status: 500 });
    }
  },
};
