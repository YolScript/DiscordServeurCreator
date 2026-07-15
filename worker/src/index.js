import { json, preflightResponse, withCors } from './cors.js';
import {
  handleLogin, handleCallback, refreshTokenIfNeeded, getUserAdminGuildIds, getUserAdminGuilds,
} from './oauth.js';
import { getSession, destroySession, clearSessionCookie } from './session.js';
import { botFetch, botFetchJson } from './discordApi.js';
import {
  getGuildConfig, putGuildConfig, getGameRoles, putGameRoles,
  getModConfig, putModConfig,
  getLevelRoles, putLevelRoles,
  getReferralRoles, putReferralRoles, getReferralCounts,
  getStreamerLinks, putStreamerLinks,
  getScheduledTasks, putScheduledTasks,
  getTickets, putTickets,
  pushPendingPanelAction,
  getStats,
  getEmbedTemplates, putEmbedTemplates,
  getReactionRoleGroups, putReactionRoleGroups,
} from './kvStore.js';
import {
  bulkEditPermissions, exportChannelPermissions, importChannelPermissions, resetRoleToDefault,
} from './permissions.js';
import { createCustomChannel, createCustomCategory } from './customChannels.js';
import { GAME_ROLE_CATALOG, createGameRolePreset } from './gameRolePresets.js';
import {
  buildSnapshot, restoreSnapshot, lockdownGuild, unlockGuild, pushSnapshot, getSnapshots,
} from './security.js';
import { applyServiceVisibility } from './staffService.js';
import { logAudit, getAuditLog } from './auditLog.js';

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

    if (sub === 'roles' && parts.length === 4 && method === 'POST') {
      await requireGuildAccess(env, request, guildId);
      const { name, color, hoist } = await readJson(request);
      if (!name) throw new HttpError(400, 'name requis.');
      const role = await botFetchJson(env, `/guilds/${guildId}/roles`, {
        method: 'POST',
        body: JSON.stringify({
          name: name.slice(0, 100), color: color || 0, hoist: Boolean(hoist), mentionable: false,
        }),
      });
      return json(role, env);
    }

    if (sub === 'roles' && parts[4] === 'positions' && method === 'PATCH') {
      const session = await requireGuildAccess(env, request, guildId);
      const { positions } = await readJson(request);
      if (!Array.isArray(positions) || !positions.length) throw new HttpError(400, 'positions requis.');
      await botFetchJson(env, `/guilds/${guildId}/roles`, { method: 'PATCH', body: JSON.stringify(positions) });
      await logAudit(env, guildId, { title: 'Ordre des roles modifie', description: `${session.username} a reordonne les roles.` });
      return json({ ok: true }, env);
    }

    if (sub === 'roles' && parts.length === 5 && method === 'PATCH') {
      const session = await requireGuildAccess(env, request, guildId);
      const roleId = parts[4];
      const { color } = await readJson(request);
      const role = await botFetchJson(env, `/guilds/${guildId}/roles/${roleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ color }),
      });
      await logAudit(env, guildId, { title: 'Couleur de role modifiee', description: `${session.username} a change la couleur de <@&${roleId}>.` });
      return json(role, env);
    }

    if (sub === 'members' && parts.length === 4 && method === 'GET') {
      await requireGuildAccess(env, request, guildId);
      const members = await botFetchJson(env, `/guilds/${guildId}/members?limit=1000`);
      return json(members.map((m) => ({
        userId: m.user.id,
        displayName: m.nick || m.user.global_name || m.user.username,
        avatar: m.user.avatar,
        roles: m.roles,
      })), env);
    }

    if (sub === 'config' && parts.length === 4) {
      await requireGuildAccess(env, request, guildId);
      if (method === 'GET') {
        const config = await getGuildConfig(env, guildId);
        return json(config, env);
      }
      if (method === 'PATCH') {
        const session = await requireGuildAccess(env, request, guildId);
        const body = await readJson(request);
        const existing = (await getGuildConfig(env, guildId)) || {};
        const merged = { ...existing, ...body };
        await putGuildConfig(env, guildId, merged);
        await logAudit(env, guildId, {
          title: 'Configuration modifiee',
          description: `${session.username} a modifie : ${Object.keys(body).join(', ')}`,
        });
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
      const session = await requireGuildAccess(env, request, guildId);
      const { channelIds, roleId, allow, deny } = await readJson(request);
      if (!Array.isArray(channelIds) || !roleId) throw new HttpError(400, 'channelIds et roleId requis.');
      const results = await bulkEditPermissions(env, { channelIds, roleId, allow: allow || [], deny: deny || [] });
      await logAudit(env, guildId, {
        title: 'Permissions modifiees',
        description: `${session.username} a modifie les permissions du role <@&${roleId}> sur ${channelIds.length} salon(s).`,
      });
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

    if (sub === 'channels' && parts.length === 4 && method === 'POST') {
      const session = await requireGuildAccess(env, request, guildId);
      const { name, type, categoryId } = await readJson(request);
      const config = (await getGuildConfig(env, guildId)) || {};
      const channel = await createCustomChannel(env, guildId, config, { name, type, categoryId });
      await logAudit(env, guildId, { title: 'Salon cree', description: `${session.username} a cree #${name}.` });
      return json(channel, env);
    }

    if (sub === 'categories' && parts.length === 4 && method === 'POST') {
      const session = await requireGuildAccess(env, request, guildId);
      const { name } = await readJson(request);
      const config = (await getGuildConfig(env, guildId)) || {};
      const category = await createCustomCategory(env, guildId, config, { name });
      await logAudit(env, guildId, { title: 'Categorie creee', description: `${session.username} a cree la categorie ${name}.` });
      return json(category, env);
    }

    if (sub === 'channels' && parts.length === 5) {
      const session = await requireGuildAccess(env, request, guildId);
      const channelId = parts[4];

      if (method === 'PATCH') {
        const { name } = await readJson(request);
        if (!name) throw new HttpError(400, 'name requis.');
        const channel = await botFetchJson(env, `/channels/${channelId}`, { method: 'PATCH', body: JSON.stringify({ name }) });
        await logAudit(env, guildId, { title: 'Salon renomme', description: `${session.username} a renomme un salon en #${name}.` });
        return json(channel, env);
      }
      if (method === 'DELETE') {
        await botFetch(env, `/channels/${channelId}`, { method: 'DELETE' });
        await logAudit(env, guildId, { title: 'Salon supprime', description: `${session.username} a supprime un salon (${channelId}).` });
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

    // --- Automod ---
    if (sub === 'modconfig' && parts.length === 4) {
      await requireGuildAccess(env, request, guildId);
      if (method === 'GET') return json(await getModConfig(env, guildId), env);
      if (method === 'PATCH') {
        const patch = await readJson(request);
        const merged = { ...(await getModConfig(env, guildId)), ...patch };
        await putModConfig(env, guildId, merged);
        return json(merged, env);
      }
    }

    // --- Roles de niveau (XP) ---
    if (sub === 'levelroles' && parts.length === 4) {
      await requireGuildAccess(env, request, guildId);
      if (method === 'GET') return json(await getLevelRoles(env, guildId), env);
      if (method === 'POST') {
        const { level, roleId } = await readJson(request);
        if (!Number.isInteger(level) || !roleId) throw new HttpError(400, 'level et roleId requis.');
        const items = (await getLevelRoles(env, guildId)).filter((i) => i.level !== level);
        items.push({ level, roleId });
        items.sort((a, b) => a.level - b.level);
        await putLevelRoles(env, guildId, items);
        return json(items, env);
      }
    }
    if (sub === 'levelroles' && parts.length === 5 && method === 'DELETE') {
      await requireGuildAccess(env, request, guildId);
      const level = Number(parts[4]);
      const items = (await getLevelRoles(env, guildId)).filter((i) => i.level !== level);
      await putLevelRoles(env, guildId, items);
      return json({ ok: true }, env);
    }

    // --- Parrainage ---
    if (sub === 'referrals' && parts.length === 4 && method === 'GET') {
      await requireGuildAccess(env, request, guildId);
      return json(await getReferralCounts(env, guildId), env);
    }
    if (sub === 'referralroles' && parts.length === 4) {
      await requireGuildAccess(env, request, guildId);
      if (method === 'GET') return json(await getReferralRoles(env, guildId), env);
      if (method === 'POST') {
        const { count, roleId } = await readJson(request);
        if (!Number.isInteger(count) || !roleId) throw new HttpError(400, 'count et roleId requis.');
        const items = (await getReferralRoles(env, guildId)).filter((i) => i.count !== count);
        items.push({ count, roleId });
        items.sort((a, b) => a.count - b.count);
        await putReferralRoles(env, guildId, items);
        return json(items, env);
      }
    }
    if (sub === 'referralroles' && parts.length === 5 && method === 'DELETE') {
      await requireGuildAccess(env, request, guildId);
      const count = Number(parts[4]);
      const items = (await getReferralRoles(env, guildId)).filter((i) => i.count !== count);
      await putReferralRoles(env, guildId, items);
      return json({ ok: true }, env);
    }

    // --- Streamers lies ---
    if (sub === 'streamers' && parts.length === 4) {
      await requireGuildAccess(env, request, guildId);
      if (method === 'GET') return json(await getStreamerLinks(env, guildId), env);
      if (method === 'POST') {
        const { discordUserId, platform, identifier } = await readJson(request);
        if (!discordUserId || !platform || !identifier) throw new HttpError(400, 'discordUserId, platform et identifier requis.');
        const items = await getStreamerLinks(env, guildId);
        const existing = items.find((i) => i.discordUserId === discordUserId && i.platform === platform);
        if (existing) existing.identifier = identifier;
        else items.push({
          discordUserId, platform, identifier, isLive: false, liveRoleAssigned: false,
        });
        await putStreamerLinks(env, guildId, items);
        return json(items, env);
      }
    }
    if (sub === 'streamers' && parts.length === 6 && method === 'DELETE') {
      await requireGuildAccess(env, request, guildId);
      const [, discordUserId, platform] = parts.slice(4);
      const items = (await getStreamerLinks(env, guildId)).filter((i) => !(i.discordUserId === discordUserId && i.platform === platform));
      await putStreamerLinks(env, guildId, items);
      return json({ ok: true }, env);
    }

    // --- Annonces / evenements programmes ---
    if (sub === 'scheduled' && parts.length === 4) {
      await requireGuildAccess(env, request, guildId);
      if (method === 'GET') return json(await getScheduledTasks(env, guildId), env);
      if (method === 'POST') {
        const { channelId, message, runAt, repeatIntervalMs } = await readJson(request);
        if (!channelId || !message || !runAt) throw new HttpError(400, 'channelId, message et runAt requis.');
        const items = await getScheduledTasks(env, guildId);
        const entry = {
          id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          channelId,
          message,
          runAt: Number(runAt),
          ...(repeatIntervalMs ? { repeatIntervalMs: Number(repeatIntervalMs) } : {}),
        };
        items.push(entry);
        await putScheduledTasks(env, guildId, items);
        return json(entry, env);
      }
    }
    if (sub === 'scheduled' && parts.length === 5 && method === 'DELETE') {
      await requireGuildAccess(env, request, guildId);
      const items = (await getScheduledTasks(env, guildId)).filter((i) => i.id !== parts[4]);
      await putScheduledTasks(env, guildId, items);
      return json({ ok: true }, env);
    }

    // --- Tickets ---
    if (sub === 'tickets' && parts.length === 4 && method === 'GET') {
      await requireGuildAccess(env, request, guildId);
      return json(await getTickets(env, guildId), env);
    }
    if (sub === 'tickets' && parts[5] === 'close' && method === 'POST') {
      await requireGuildAccess(env, request, guildId);
      const ticketId = parts[4];
      const items = await getTickets(env, guildId);
      const ticket = items.find((t) => t.id === ticketId);
      if (!ticket) throw new HttpError(404, 'Ticket introuvable.');
      await botFetch(env, `/channels/${ticket.channelId}`, { method: 'DELETE' });
      ticket.status = 'closed';
      await putTickets(env, guildId, items);

      if (!items.some((t) => t.status === 'open')) {
        const config = (await getGuildConfig(env, guildId)) || {};
        if (config.ticketCategoryId) {
          await botFetch(env, `/channels/${config.ticketCategoryId}`, { method: 'DELETE' });
          await putGuildConfig(env, guildId, { ...config, ticketCategoryId: null });
        }
      }
      return json({ ok: true }, env);
    }

    // --- Securite ---
    if (sub === 'security' && parts[4] === 'export' && method === 'GET') {
      await requireGuildAccess(env, request, guildId);
      return json(await buildSnapshot(env, guildId), env);
    }
    if (sub === 'security' && parts[4] === 'restore' && method === 'POST') {
      const session = await requireGuildAccess(env, request, guildId);
      const snapshot = await readJson(request);
      const result = await restoreSnapshot(env, guildId, snapshot);
      await logAudit(env, guildId, {
        title: 'Restauration structure',
        description: `${session.username} a restaure : ${result.roles} role(s), ${result.categories} categorie(s), ${result.channels} salon(s).`,
      });
      return json(result, env);
    }
    if (sub === 'security' && parts[4] === 'snapshots' && method === 'GET') {
      await requireGuildAccess(env, request, guildId);
      return json(await getSnapshots(env, guildId), env);
    }
    if (sub === 'security' && parts[4] === 'snapshot' && method === 'POST') {
      await requireGuildAccess(env, request, guildId);
      const snapshot = await buildSnapshot(env, guildId);
      await pushSnapshot(env, guildId, snapshot);
      return json(snapshot, env);
    }
    if (sub === 'security' && parts[4] === 'lockdown' && method === 'POST') {
      const session = await requireGuildAccess(env, request, guildId);
      const previousLevel = await lockdownGuild(env, guildId);
      const config = (await getGuildConfig(env, guildId)) || {};
      await putGuildConfig(env, guildId, { ...config, lockdownPreviousLevel: previousLevel });
      await logAudit(env, guildId, { title: '🔒 Serveur verrouille', description: `${session.username} a verrouille le serveur.` });
      return json({ ok: true }, env);
    }
    if (sub === 'security' && parts[4] === 'unlock' && method === 'POST') {
      const session = await requireGuildAccess(env, request, guildId);
      const config = (await getGuildConfig(env, guildId)) || {};
      await unlockGuild(env, guildId, config.lockdownPreviousLevel);
      await logAudit(env, guildId, { title: '🔓 Serveur deverrouille', description: `${session.username} a deverrouille le serveur.` });
      return json({ ok: true }, env);
    }

    if (sub === 'auditlog' && parts.length === 4 && method === 'GET') {
      await requireGuildAccess(env, request, guildId);
      return json(await getAuditLog(env, guildId), env);
    }

    if (sub === 'stats' && parts.length === 4 && method === 'GET') {
      await requireGuildAccess(env, request, guildId);
      return json(await getStats(env, guildId), env);
    }

    // --- Panneaux (reglement/roles/poll/ticket/embed) : depose une action
    // que le bot (process separe) sonde et execute (cf panelActionsSync
    // cote bot).
    if (sub === 'panels' && parts.length === 5 && method === 'POST') {
      const session = await requireGuildAccess(env, request, guildId);
      const key = parts[4];
      if (!['reglement', 'roles', 'poll', 'ticket', 'embed'].includes(key)) throw new HttpError(400, 'Panneau inconnu.');
      const body = await readJson(request).catch(() => ({}));
      if (key === 'embed') {
        if (!body.channelId || !body.embed) throw new HttpError(400, 'channelId et embed requis.');
        await pushPendingPanelAction(env, guildId, { type: 'embed', channelId: body.channelId, embed: body.embed, content: body.content });
        await logAudit(env, guildId, { title: 'Embed poste', description: `${session.username} a poste un embed dans <#${body.channelId}>.` });
        return json({ ok: true }, env);
      }
      await pushPendingPanelAction(env, guildId, { type: key, channelId: body.channelId });
      return json({ ok: true }, env);
    }

    // --- Modeles d'embed sauvegardes ---
    if (sub === 'embedtemplates' && parts.length === 4) {
      await requireGuildAccess(env, request, guildId);
      if (method === 'GET') return json(await getEmbedTemplates(env, guildId), env);
      if (method === 'POST') {
        const { name, embed } = await readJson(request);
        if (!name || !embed) throw new HttpError(400, 'name et embed requis.');
        const items = await getEmbedTemplates(env, guildId);
        const entry = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, embed };
        items.push(entry);
        await putEmbedTemplates(env, guildId, items);
        return json(entry, env);
      }
    }
    if (sub === 'embedtemplates' && parts.length === 5 && method === 'DELETE') {
      await requireGuildAccess(env, request, guildId);
      const items = (await getEmbedTemplates(env, guildId)).filter((t) => t.id !== parts[4]);
      await putEmbedTemplates(env, guildId, items);
      return json({ ok: true }, env);
    }

    // --- Roles-reaction generiques (select menu, pas de restriction aux jeux) ---
    if (sub === 'reactionroles' && parts.length === 4) {
      const session = await requireGuildAccess(env, request, guildId);
      if (method === 'GET') return json(await getReactionRoleGroups(env, guildId), env);
      if (method === 'POST') {
        const { title, channelId, roles } = await readJson(request);
        if (!channelId || !Array.isArray(roles) || !roles.length) throw new HttpError(400, 'channelId et roles requis.');
        const items = await getReactionRoleGroups(env, guildId);
        const entry = {
          id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: title || 'Roles', channelId, roles, messageId: null,
        };
        items.push(entry);
        await putReactionRoleGroups(env, guildId, items);
        await pushPendingPanelAction(env, guildId, { type: 'reactionroles', groupId: entry.id });
        await logAudit(env, guildId, { title: 'Groupe de roles-reaction cree', description: `${session.username} a cree "${entry.title}" dans <#${channelId}>.` });
        return json(entry, env);
      }
    }
    if (sub === 'reactionroles' && parts.length === 5 && method === 'PATCH') {
      await requireGuildAccess(env, request, guildId);
      const { title, channelId, roles } = await readJson(request);
      const items = await getReactionRoleGroups(env, guildId);
      const group = items.find((g) => g.id === parts[4]);
      if (!group) throw new HttpError(404, 'Groupe introuvable.');
      if (title) group.title = title;
      if (channelId) group.channelId = channelId;
      if (roles) group.roles = roles;
      await putReactionRoleGroups(env, guildId, items);
      await pushPendingPanelAction(env, guildId, { type: 'reactionroles', groupId: group.id });
      return json(group, env);
    }
    if (sub === 'reactionroles' && parts.length === 5 && method === 'DELETE') {
      await requireGuildAccess(env, request, guildId);
      const items = (await getReactionRoleGroups(env, guildId)).filter((g) => g.id !== parts[4]);
      await putReactionRoleGroups(env, guildId, items);
      return json({ ok: true }, env);
    }

    // --- Service (staff en service) ---
    if (sub === 'service' && parts[4] === 'apply' && method === 'POST') {
      const session = await requireGuildAccess(env, request, guildId);
      const config = (await getGuildConfig(env, guildId)) || {};
      const result = await applyServiceVisibility(env, guildId, config);
      await logAudit(env, guildId, { title: 'Configuration du service appliquee', description: `${session.username} a applique la configuration du service.` });
      return json(result, env);
    }
  }

  throw new HttpError(404, 'Route inconnue.');
}

async function snapshotAllGuilds(env) {
  const guildIds = new Set();
  let cursor;
  do {
    // eslint-disable-next-line no-await-in-loop
    const page = await env.GUILD_KV.list({ prefix: 'guild:', cursor });
    for (const { name } of page.keys) {
      const match = name.match(/^guild:([^:]+):config$/);
      if (match) guildIds.add(match[1]);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  for (const gid of guildIds) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const snapshot = await buildSnapshot(env, gid);
      // eslint-disable-next-line no-await-in-loop
      await pushSnapshot(env, gid, snapshot);
    } catch (err) {
      console.error(`snapshot auto echoue pour ${gid}`, err);
    }
  }
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
  async scheduled(event, env) {
    await snapshotAllGuilds(env);
  },
};
