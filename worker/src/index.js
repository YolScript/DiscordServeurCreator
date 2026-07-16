import {
  json, preflightResponse, withCors, resolveCorsOrigin,
} from './cors.js';
import {
  handleLogin, handleCallback, refreshTokenIfNeeded, getUserAdminGuildIds, getUserAdminGuilds,
} from './oauth.js';
import { getSession, destroySession, clearSessionCookie } from './session.js';
import { botFetch, botFetchJson, notifyGuildOwner } from './discordApi.js';
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
  getBotStatus,
  getShopItems, putShopItems, getEconomyAccounts,
  getTemplateRegistry, putTemplateRegistry,
  getCustomCommands, putCustomCommands,
  getGenerationProgress, putGenerationProgress,
  getPendingGeneration, putPendingGeneration,
} from './kvStore.js';
import {
  bulkEditPermissions, exportChannelPermissions, importChannelPermissions, resetRoleToDefault, bitmaskFromNames,
} from './permissions.js';
import { createCustomChannel, createCustomCategory } from './customChannels.js';
import { GAME_ROLE_CATALOG, createGameRolePreset } from './gameRolePresets.js';
import {
  buildSnapshot, restoreSnapshot, lockdownGuild, unlockGuild, pushSnapshot, getSnapshots,
} from './security.js';
import { applyServiceVisibility } from './staffService.js';
import { logAudit, getAuditLog } from './auditLog.js';
import {
  getAiConfig, setAiConfig, clearAiConfig, getAiConfigWithKey,
} from './aiConfigStore.js';
import { checkAiRateLimit } from './aiRateLimit.js';
import { runAiTurn, resumeAfterConfirmation } from './aiOrchestrator.js';

// Serveur de reference dont la structure est lue en direct pour le template
// "live" (miroir de SOURCE_GUILD_ID dans src/discord/guildSetup/templates/liveTemplate.js).
const LIVE_TEMPLATE_SOURCE_GUILD_ID = '1526242972989915307';

// Salons/categories crees par d'autres bots invites sur le serveur de
// reference (ex: FortniteParty) : n'ont aucun champ dans guildConfig, donc
// invisibles via les exclusions par ID ci-dessous. Filtres par nom (miroir
// de isThirdPartyName dans liveTemplate.js) pour ne jamais les montrer dans
// l'apercu de template.
const THIRD_PARTY_NAMES = new Set(['vocaux party', 'creer une party']);
function normalizeChannelName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[àâ]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[îï]/g, 'i')
    .replace(/[ôö]/g, 'o').replace(/[ùûü]/g, 'u').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
function isThirdPartyName(name) {
  return THIRD_PARTY_NAMES.has(normalizeChannelName(name));
}

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

// Liste tous les guildId ayant une config KV (meme scan que
// snapshotAllGuilds) puis filtre ceux ou userId a ete ajoute a
// dashboardAllowedUserIds (acces dashboard delegue, independant du bit
// Administrator Discord).
async function getDelegatedGuildIds(env, userId) {
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

  const delegated = [];
  for (const gid of guildIds) {
    // eslint-disable-next-line no-await-in-loop
    const config = await getGuildConfig(env, gid);
    if (config?.dashboardAllowedUserIds?.includes(userId)) delegated.push(gid);
  }
  return delegated;
}

async function requireGuildAccess(env, request, guildId) {
  const session = await requireSession(env, request);
  const adminGuildIds = await getUserAdminGuildIds(env, session);
  if (!adminGuildIds.includes(guildId)) {
    const config = await getGuildConfig(env, guildId);
    if (!config?.dashboardAllowedUserIds?.includes(session.userId)) {
      throw new HttpError(403, "Tu n'es pas administrateur de ce serveur.");
    }
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

  // --- Supervision (pour un monitoring externe type UptimeRobot) ---
  if (method === 'GET' && url.pathname === '/health') {
    return json({ ok: true, time: new Date().toISOString() }, env);
  }

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

  if (method === 'GET' && url.pathname === '/api/botstatus') {
    await requireSession(env, request);
    return json(await getBotStatus(env), env);
  }

  // --- Registre global de templates reutilisables (n'importe quel serveur
  // configure par le bot peut servir de source pour /setup sur un autre) ---
  if (parts[0] === 'api' && parts[1] === 'templates') {
    if (parts.length === 2 && method === 'GET') {
      await requireSession(env, request);
      return json(await getTemplateRegistry(env), env);
    }
    if (parts.length === 2 && method === 'POST') {
      const session = await requireSession(env, request);
      const { name, sourceGuildId } = await readJson(request);
      if (!name || !sourceGuildId) throw new HttpError(400, 'name et sourceGuildId requis.');
      await requireGuildAccess(env, request, sourceGuildId);
      const items = await getTemplateRegistry(env);
      const entry = {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, sourceGuildId, createdAt: Date.now(),
      };
      items.push(entry);
      await putTemplateRegistry(env, items);
      await logAudit(env, sourceGuildId, { title: 'Template enregistre', description: `${session.username} a enregistre ce serveur comme template ("${name}").` });
      return json(entry, env);
    }
    if (parts.length === 3 && method === 'DELETE') {
      const items = await getTemplateRegistry(env);
      const entry = items.find((t) => t.id === parts[2]);
      if (!entry) throw new HttpError(404, 'Template introuvable.');
      await requireGuildAccess(env, request, entry.sourceGuildId);
      await putTemplateRegistry(env, items.filter((t) => t.id !== parts[2]));
      return json({ ok: true }, env);
    }
    // Apercu (mock) de la structure d'un template pour l'assistant de
    // generation : lecture seule sur le serveur source, accessible a tout
    // utilisateur connecte (pas besoin d'etre admin du serveur source, qui
    // est souvent le serveur de reference du bot lui-meme).
    if (parts.length === 4 && parts[3] === 'preview' && method === 'GET') {
      await requireSession(env, request);
      const templateKey = decodeURIComponent(parts[2]);
      let sourceGuildId = null;
      let label = null;
      if (templateKey === 'live') {
        sourceGuildId = LIVE_TEMPLATE_SOURCE_GUILD_ID;
      } else if (templateKey.startsWith('live:')) {
        const items = await getTemplateRegistry(env);
        const entry = items.find((t) => t.id === templateKey.slice('live:'.length));
        if (!entry) throw new HttpError(404, 'Template introuvable.');
        sourceGuildId = entry.sourceGuildId;
        label = entry.name;
      } else {
        throw new HttpError(400, 'Template inconnu.');
      }

      const sourceConfig = await getGuildConfig(env, sourceGuildId);
      if (!sourceConfig) throw new HttpError(404, 'Serveur source introuvable ou non configure.');

      const [sourceGuild, allRoles, allChannels, gameRolesCatalog] = await Promise.all([
        botFetchJson(env, `/guilds/${sourceGuildId}`).catch(() => null),
        botFetchJson(env, `/guilds/${sourceGuildId}/roles`).catch(() => []),
        botFetchJson(env, `/guilds/${sourceGuildId}/channels`).catch(() => []),
        getGameRoles(env, sourceGuildId).catch(() => []),
      ]);

      const baseRoleFields = [
        'adminRoleId', 'moderateurRoleId', 'streameurRoleId', 'contributeurRoleId',
        'followRoleId', 'verifieRoleId', 'reglementValidatedRoleId', 'plus16RoleId', 'minus16RoleId',
      ];
      const baseRoleIds = new Set(baseRoleFields.map((f) => sourceConfig[f]).filter(Boolean));
      const previewRoles = allRoles
        .filter((r) => baseRoleIds.has(r.id))
        .sort((a, b) => b.position - a.position)
        .map((r) => ({ name: r.name, color: `#${(r.color || 0).toString(16).padStart(6, '0')}` }));

      const excludedCategoryIds = new Set([
        sourceConfig.staffCategoryId, sourceConfig.gamesCategoryId, sourceConfig.ticketCategoryId,
      ].filter(Boolean));
      const excludedChannelIds = new Set([
        sourceConfig.publicVoiceCreatorChannelId, sourceConfig.staffChatChannelId,
        sourceConfig.gameVoiceCreatorChannelId, sourceConfig.serviceStaffChannelId,
        sourceConfig.staffVoiceCreatorChannelId,
      ].filter(Boolean));

      const categories = allChannels
        .filter((c) => c.type === 4 && !excludedCategoryIds.has(c.id) && !isThirdPartyName(c.name))
        .sort((a, b) => a.position - b.position)
        .map((cat) => ({
          id: cat.id,
          name: cat.name,
          channels: allChannels
            .filter((c) => c.parent_id === cat.id && !excludedChannelIds.has(c.id) && !isThirdPartyName(c.name)
              && (c.type === 0 || c.type === 2))
            .sort((a, b) => a.position - b.position)
            .map((ch) => ({ id: ch.id, name: ch.name, type: ch.type === 2 ? 'voice' : 'text' })),
        }));

      // La categorie Vocaux recoit un salon declencheur "Creer un vocal"
      // apres coup (ensurePublicVoiceCreator), jamais copie tel quel car
      // exclu ci-dessus : on le rejoute ici pour un apercu fidele.
      const vocauxCategory = categories.find((c) => c.id === sourceConfig.vocauxCategoryId);
      if (vocauxCategory) {
        vocauxCategory.channels.push({ name: 'Creer un vocal', type: 'voice', auto: true });
      }

      // Sections regenerees a chaque setup par leurs propres modules
      // (staffCategory.js, gameChannels.js) plutot que copiees depuis la
      // source : absentes de `categories` par construction (exclusion par
      // ID plus haut) mais bien presentes sur le serveur final genere.
      const autoCategories = [];
      if (gameRolesCatalog.length) {
        autoCategories.push({
          name: '🎮 Jeux',
          auto: true,
          channels: [
            { name: 'Creer un vocal', type: 'voice', auto: true },
            ...gameRolesCatalog.map((r) => ({ name: r.displayName, type: 'text', auto: true })),
          ],
        });
      }
      autoCategories.push({
        name: '🛡️ Staff',
        auto: true,
        channels: [{ name: 'SERVICE STAFF', type: 'voice', auto: true }],
      });

      return json({
        label: label || `${sourceGuild?.name || 'ServeurCreator'} (a jour)`,
        guildIconUrl: sourceGuild?.icon ? `https://cdn.discordapp.com/icons/${sourceGuildId}/${sourceGuild.icon}.png?size=64` : null,
        roles: previewRoles,
        gameRoles: gameRolesCatalog.map((r) => ({ name: r.displayName, color: r.colorHex || '#5865f2' })),
        categories,
        autoCategories,
        specialChannelIds: {
          reglement: sourceConfig.rulesChannelId || null,
          arrivalDeparture: sourceConfig.arrivalDepartureChannelId || null,
          roles: sourceConfig.rolesChannelId || null,
          support: sourceConfig.ticketPanelChannelId || null,
        },
        content: {
          reglementText: sourceConfig.reglementText || null,
          welcomeMessageTemplate: sourceConfig.welcomeMessageTemplate || null,
          leaveMessageTemplate: sourceConfig.leaveMessageTemplate || null,
        },
      }, env);
    }
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

      // Serveurs ou l'utilisateur n'est pas Administrator Discord mais a ete
      // ajoute a dashboardAllowedUserIds (acces dashboard delegue).
      const knownIds = new Set(results.map((r) => r.guildId));
      const delegatedGuildIds = await getDelegatedGuildIds(env, session.userId);
      for (const gid of delegatedGuildIds) {
        if (knownIds.has(gid)) continue;
        const botGuildRes = await botFetch(env, `/guilds/${gid}`);
        if (!botGuildRes.ok) continue;
        const guild = await botGuildRes.json();
        const config = await getGuildConfig(env, gid);
        results.push({
          guildId: gid, botPresent: true, name: guild.name, icon: guild.icon,
          configured: Boolean(config), template: config?.template ?? null, delegated: true,
        });
      }

      return json(results, env);
    }

    const guildId = parts[2];
    if (!guildId) throw new HttpError(404, 'Route inconnue.');

    if (parts.length === 3) throw new HttpError(404, 'Route inconnue.');

    const sub = parts[3];

    // --- Generation du serveur depuis le dashboard (equivalent web de
    // /setup) : depose une demande dans une file dediee, sondee par le bot
    // (generationSync.js), qui ecrit sa progression pas a pas en KV pour
    // que le dashboard l'anime en temps reel. ---
    if (sub === 'generate' && parts.length === 4 && method === 'POST') {
      const session = await requireGuildAccess(env, request, guildId);
      const existingConfig = await getGuildConfig(env, guildId);
      if (existingConfig) throw new HttpError(409, 'Ce serveur a deja ete configure.');
      const alreadyPending = await getPendingGeneration(env, guildId);
      if (alreadyPending) throw new HttpError(409, 'Une generation est deja en cours pour ce serveur.');
      // Couvre la fenetre entre le moment ou le bot retire la demande de la
      // file (debut de traitement) et celui ou setupGuild() ecrit la config
      // finale (15-40s plus tard) : sans ca, la file etant deja vide et la
      // config pas encore ecrite, un second clic pendant cette fenetre
      // passerait les deux verifications precedentes et lancerait une
      // generation en double sur le meme serveur.
      const existingProgress = await getGenerationProgress(env, guildId);
      if (existingProgress?.status === 'running' || existingProgress?.status === 'queued') {
        throw new HttpError(409, 'Une generation est deja en cours pour ce serveur.');
      }

      const { templateKey, reglementText } = await readJson(request);
      if (!templateKey) throw new HttpError(400, 'templateKey requis.');

      await putPendingGeneration(env, guildId, {
        templateKey, reglementText: reglementText || null, requestedByUserId: session.userId,
      });
      await putGenerationProgress(env, guildId, { status: 'queued', steps: [], startedAt: Date.now() });
      await logAudit(env, guildId, { title: 'Generation demandee', description: `${session.username} a lance la generation du serveur (template ${templateKey}).` });
      return json({ ok: true }, env);
    }

    if (sub === 'generation' && parts.length === 4 && method === 'GET') {
      await requireGuildAccess(env, request, guildId);
      return json(await getGenerationProgress(env, guildId), env);
    }

    // --- Assistant IA (dashboard uniquement, jamais expose publiquement) :
    // chaque serveur fournit sa propre cle API (Claude/GPT/Gemini), chiffree
    // au repos. Les actions destructives proposees par le modele ne sont
    // jamais executees directement : elles reviennent au frontend comme
    // pendingConfirmation, executees seulement apres clic explicite via
    // /ai-chat/confirm.
    if (sub === 'aiconfig' && parts.length === 4 && method === 'GET') {
      await requireGuildAccess(env, request, guildId);
      return json(await getAiConfig(env, guildId), env);
    }

    if (sub === 'aiconfig' && parts.length === 4 && method === 'PUT') {
      const session = await requireGuildAccess(env, request, guildId);
      const { provider, apiKey } = await readJson(request);
      if (!['anthropic', 'openai', 'gemini'].includes(provider)) throw new HttpError(400, 'provider invalide.');
      if (!apiKey || apiKey.length < 8) throw new HttpError(400, 'apiKey invalide.');
      await setAiConfig(env, guildId, { provider, apiKey });
      await logAudit(env, guildId, { title: 'Cle IA mise a jour', description: `${session.username} a configure l'assistant IA (${provider}).` });
      return json({ ok: true }, env);
    }

    if (sub === 'aiconfig' && parts.length === 4 && method === 'DELETE') {
      const session = await requireGuildAccess(env, request, guildId);
      await clearAiConfig(env, guildId);
      await logAudit(env, guildId, { title: 'Cle IA retiree', description: `${session.username} a retire la configuration de l'assistant IA.` });
      return json({ ok: true }, env);
    }

    if (sub === 'aichat' && parts.length === 4 && method === 'POST') {
      const session = await requireGuildAccess(env, request, guildId);
      const rate = await checkAiRateLimit(env, guildId, session.userId);
      if (!rate.allowed) throw new HttpError(429, `Trop de messages envoyes a l'assistant IA. Reessaie dans ${rate.retryAfterSeconds}s.`);

      const { messages, message } = await readJson(request);
      if (!Array.isArray(messages)) throw new HttpError(400, 'messages requis.');
      if (typeof message !== 'string' || !message.trim()) throw new HttpError(400, 'message requis.');
      if (message.length > 1000) throw new HttpError(400, 'Message trop long (1000 caracteres max).');

      const aiConfig = await getAiConfigWithKey(env, guildId);
      if (!aiConfig) throw new HttpError(400, "Aucune cle API IA configuree pour ce serveur. Configure-la d'abord dans l'outil IA.");

      const working = [...messages, { role: 'user', content: message.trim() }];
      let result;
      try {
        result = await runAiTurn(env, guildId, session, aiConfig.provider, aiConfig.apiKey, working);
      } catch (err) {
        throw new HttpError(502, `Assistant IA indisponible : ${err.message}`);
      }
      return json(result, env);
    }

    if (sub === 'aichat' && parts[4] === 'confirm' && method === 'POST') {
      const session = await requireGuildAccess(env, request, guildId);
      const rate = await checkAiRateLimit(env, guildId, session.userId);
      if (!rate.allowed) throw new HttpError(429, `Trop de messages envoyes a l'assistant IA. Reessaie dans ${rate.retryAfterSeconds}s.`);

      const { messages, pendingConfirmation, confirmed } = await readJson(request);
      if (!Array.isArray(messages) || !pendingConfirmation) throw new HttpError(400, 'messages et pendingConfirmation requis.');

      const aiConfig = await getAiConfigWithKey(env, guildId);
      if (!aiConfig) throw new HttpError(400, 'Aucune cle API IA configuree pour ce serveur.');

      let result;
      try {
        result = await resumeAfterConfirmation(
          env, guildId, session, aiConfig.provider, aiConfig.apiKey, messages, pendingConfirmation, Boolean(confirmed),
        );
      } catch (err) {
        throw new HttpError(502, `Assistant IA indisponible : ${err.message}`);
      }
      return json(result, env);
    }

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

    if (sub === 'channels' && parts[4] === 'positions' && method === 'PATCH') {
      const session = await requireGuildAccess(env, request, guildId);
      const { positions } = await readJson(request);
      if (!Array.isArray(positions) || !positions.length) throw new HttpError(400, 'positions requis.');
      const res = await botFetch(env, `/guilds/${guildId}/channels`, { method: 'PATCH', body: JSON.stringify(positions) });
      if (!res.ok) throw new HttpError(502, `Discord a refuse le reordonnancement : ${await res.text()}`);
      await logAudit(env, guildId, { title: 'Ordre des salons modifie', description: `${session.username} a reordonne les salons.` });
      return json({ ok: true }, env);
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
      const { color, name, permissions } = await readJson(request);
      const body = {};
      if (color !== undefined) body.color = color;
      if (name !== undefined) body.name = name;
      if (permissions !== undefined) body.permissions = permissions;
      const role = await botFetchJson(env, `/guilds/${guildId}/roles/${roleId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      await logAudit(env, guildId, { title: 'Role modifie', description: `${session.username} a modifie <@&${roleId}> (${Object.keys(body).join(', ')}).` });
      return json(role, env);
    }

    if (sub === 'roles' && parts.length === 5 && method === 'DELETE') {
      const session = await requireGuildAccess(env, request, guildId);
      const roleId = parts[4];
      const res = await botFetch(env, `/guilds/${guildId}/roles/${roleId}`, { method: 'DELETE' });
      if (!res.ok) throw new HttpError(res.status === 404 ? 404 : 502, "Impossible de supprimer ce role.");
      await logAudit(env, guildId, { title: 'Role supprime', description: `${session.username} a supprime un role (${roleId}).` });
      return json({ ok: true }, env);
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
        // Alerte au proprietaire (roadmap n°063) : nouvel acces dashboard
        // delegue accorde -> MP Discord immediat au owner du serveur.
        if (Array.isArray(body.dashboardAllowedUserIds)) {
          const before = existing.dashboardAllowedUserIds || [];
          const added = body.dashboardAllowedUserIds.filter((uid) => !before.includes(uid));
          if (added.length) {
            notifyGuildOwner(
              env, guildId,
              `🔑 **Acces dashboard accorde** — ${session.username} vient de donner l'acces au dashboard de votre serveur a : ${added.map((uid) => `<@${uid}>`).join(', ')}. Si ce n'est pas voulu, retirez cet acces depuis Permissions > Acces au dashboard.`,
            ).catch((err) => console.error('alerte owner echouee', err));
          }
        }
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
      const {
        name, type, categoryId, isPrivate, importFromChannelId,
      } = await readJson(request);
      const config = (await getGuildConfig(env, guildId)) || {};
      const channel = await createCustomChannel(env, guildId, config, {
        name, type, categoryId, isPrivate,
      });

      if (importFromChannelId) {
        const source = await exportChannelPermissions(env, importFromChannelId).catch(() => null);
        if (source?.permissionOverwrites?.length) {
          await importChannelPermissions(env, channel.id, source.permissionOverwrites).catch(() => {});
        }
      }

      if (type === 'voice-temp') {
        const hubs = new Set(config.extraVoiceHubChannelIds || []);
        hubs.add(channel.id);
        await putGuildConfig(env, guildId, { ...config, extraVoiceHubChannelIds: [...hubs] });
      }

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

    // --- Salon vocal "compteur de membres" : cree directement (pas besoin
    // du bot pour la creation), verrouille (Connect refuse a @everyone),
    // ensuite renomme periodiquement par memberCountChannel.js cote bot.
    if (sub === 'membercount' && parts.length === 4 && method === 'POST') {
      const session = await requireGuildAccess(env, request, guildId);
      const config = (await getGuildConfig(env, guildId)) || {};
      const template = (await readJson(request).catch(() => ({}))).nameTemplate || config.memberCountChannelNameTemplate || '👥 Membres : {count}';

      if (config.memberCountChannelId) {
        const existing = await botFetch(env, `/channels/${config.memberCountChannelId}`);
        if (existing.ok) throw new HttpError(409, 'Le salon compteur existe deja.');
      }

      const botGuildRes = await botFetch(env, `/guilds/${guildId}`);
      const botGuild = await botGuildRes.json();
      const name = template.replaceAll('{count}', String(botGuild.approximate_member_count || 0)).slice(0, 100);

      const channel = await botFetchJson(env, `/guilds/${guildId}/channels`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          type: 2,
          parent_id: config.vocauxCategoryId || undefined,
          permission_overwrites: [{ id: guildId, type: 0, deny: bitmaskFromNames(['Connect']), allow: '0' }],
        }),
      });

      await putGuildConfig(env, guildId, { ...config, memberCountChannelId: channel.id, memberCountChannelNameTemplate: template });
      await logAudit(env, guildId, { title: 'Salon compteur cree', description: `${session.username} a cree le salon compteur de membres.` });
      return json(channel, env);
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
        const {
          channelId, message, runAt, repeatIntervalMs, embeds,
        } = await readJson(request);
        if (!channelId || !runAt || (!message && !embeds?.length)) {
          throw new HttpError(400, 'channelId, runAt et (message ou embeds) requis.');
        }
        if (embeds?.length > 10) throw new HttpError(400, '10 embeds maximum par message.');
        const items = await getScheduledTasks(env, guildId);
        const entry = {
          id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          channelId,
          message: message || '',
          runAt: Number(runAt),
          ...(repeatIntervalMs ? { repeatIntervalMs: Number(repeatIntervalMs) } : {}),
          ...(embeds?.length ? { embeds } : {}),
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
        const embeds = body.embeds || (body.embed ? [body.embed] : null);
        if (!body.channelId || !embeds?.length) throw new HttpError(400, 'channelId et embeds requis.');
        if (embeds.length > 10) throw new HttpError(400, '10 embeds maximum par message.');
        await pushPendingPanelAction(env, guildId, { type: 'embed', channelId: body.channelId, embeds, content: body.content });
        await logAudit(env, guildId, { title: 'Embed poste', description: `${session.username} a poste un embed dans <#${body.channelId}>.` });
        return json({ ok: true }, env);
      }
      await pushPendingPanelAction(env, guildId, { type: key, channelId: body.channelId });
      return json({ ok: true }, env);
    }

    // --- Lecture/edition directe d'un message existant (pour "editer un
    // embed deja poste") : appel direct a l'API Discord, pas besoin de
    // passer par la file d'attente du bot puisque c'est une simple requete
    // REST ponctuelle.
    if (sub === 'messages' && parts.length === 6) {
      await requireGuildAccess(env, request, guildId);
      const channelId = parts[4];
      const messageId = parts[5];
      if (method === 'GET') {
        const res = await botFetch(env, `/channels/${channelId}/messages/${messageId}`);
        if (!res.ok) throw new HttpError(res.status === 404 ? 404 : 502, 'Message introuvable.');
        const message = await res.json();
        return json({ content: message.content, embeds: message.embeds || [] }, env);
      }
      if (method === 'PATCH') {
        const session = await requireGuildAccess(env, request, guildId);
        const body = await readJson(request);
        const embeds = body.embeds || (body.embed ? [body.embed] : null);
        if (!embeds?.length) throw new HttpError(400, 'embeds requis.');
        if (embeds.length > 10) throw new HttpError(400, '10 embeds maximum par message.');
        const res = await botFetch(env, `/channels/${channelId}/messages/${messageId}`, {
          method: 'PATCH',
          body: JSON.stringify({ content: body.content || null, embeds }),
        });
        if (!res.ok) throw new HttpError(res.status === 404 ? 404 : 502, "Impossible d'editer ce message.");
        await logAudit(env, guildId, { title: 'Embed edite', description: `${session.username} a edite un message dans <#${channelId}>.` });
        return json({ ok: true }, env);
      }
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

    // --- Boutique economie ---
    if (sub === 'shop' && parts.length === 4) {
      await requireGuildAccess(env, request, guildId);
      if (method === 'GET') return json(await getShopItems(env, guildId), env);
      if (method === 'POST') {
        const { name, price, roleId } = await readJson(request);
        if (!name || !price) throw new HttpError(400, 'name et price requis.');
        const items = await getShopItems(env, guildId);
        const entry = {
          id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, price: Number(price), roleId: roleId || null,
        };
        items.push(entry);
        await putShopItems(env, guildId, items);
        return json(entry, env);
      }
    }
    if (sub === 'shop' && parts.length === 5 && method === 'DELETE') {
      await requireGuildAccess(env, request, guildId);
      const items = (await getShopItems(env, guildId)).filter((i) => i.id !== parts[4]);
      await putShopItems(env, guildId, items);
      return json({ ok: true }, env);
    }

    // --- Economie : lecture seule (classement) ---
    if (sub === 'economy' && parts.length === 4 && method === 'GET') {
      await requireGuildAccess(env, request, guildId);
      return json(await getEconomyAccounts(env, guildId), env);
    }

    // --- Commandes slash personnalisees (no-code) : creees directement via
    // l'API Discord (POST individuel = upsert par nom, ne touche pas aux
    // autres commandes de la guilde), reponse geree par le bot via
    // customCommandStore (cf handleCustomCommand cote bot). ---
    if (sub === 'customcommands' && parts.length === 4) {
      const session = await requireGuildAccess(env, request, guildId);
      if (method === 'GET') return json(await getCustomCommands(env, guildId), env);
      if (method === 'POST') {
        const {
          name, description, response, requiredRoleId,
        } = await readJson(request);
        if (!name || !description || !response) throw new HttpError(400, 'name, description et response requis.');

        const items = await getCustomCommands(env, guildId);
        if (items.some((c) => c.name === name)) throw new HttpError(409, 'Une commande avec ce nom existe deja.');

        const res = await botFetch(env, `/applications/${env.DISCORD_CLIENT_ID}/guilds/${guildId}/commands`, {
          method: 'POST',
          body: JSON.stringify({ name, description, type: 1 }),
        });
        if (!res.ok) throw new HttpError(400, `Discord a refuse cette commande : ${await res.text()}`);
        const discordCommand = await res.json();

        const entry = {
          id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          discordCommandId: discordCommand.id,
          name,
          description,
          response,
          requiredRoleId: requiredRoleId || null,
        };
        items.push(entry);
        await putCustomCommands(env, guildId, items);
        await logAudit(env, guildId, { title: 'Commande personnalisee creee', description: `${session.username} a cree /${name}.` });
        return json(entry, env);
      }
    }
    if (sub === 'customcommands' && parts.length === 5 && method === 'DELETE') {
      await requireGuildAccess(env, request, guildId);
      const items = await getCustomCommands(env, guildId);
      const entry = items.find((c) => c.id === parts[4]);
      if (!entry) throw new HttpError(404, 'Commande introuvable.');
      await botFetch(env, `/applications/${env.DISCORD_CLIENT_ID}/guilds/${guildId}/commands/${entry.discordCommandId}`, { method: 'DELETE' });
      await putCustomCommands(env, guildId, items.filter((c) => c.id !== parts[4]));
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
  async fetch(request, rawEnv) {
    const env = { ...rawEnv, RESOLVED_CORS_ORIGIN: resolveCorsOrigin(request, rawEnv) };
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
    // Cron rapproche : simple ping pour garder le bot Render eveille
    // (free tier suspendu apres 15 min sans trafic entrant).
    if (event.cron === '*/10 * * * *') {
      if (!env.BOT_KEEPALIVE_URL) return;
      try {
        await fetch(env.BOT_KEEPALIVE_URL, { signal: AbortSignal.timeout(30000) });
      } catch (err) {
        console.error('keepalive bot echoue', err);
      }
      return;
    }
    await snapshotAllGuilds(env);
  },
};
