import {
  json, preflightResponse, withCors, resolveCorsOrigin,
} from './cors.js';
import {
  handleLogin, handleCallback, refreshTokenIfNeeded, getUserAdminGuildIds, getUserAdminGuilds,
} from './oauth.js';
import { getSession, destroySession, clearSessionCookie } from './session.js';
import { botFetch, botFetchJson, notifyGuildOwner } from './discordApi.js';
import { HttpError } from './errors.js';
import { toSmallCaps } from './smallCaps.js';
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
    if (config?.dashboardAllowedUserIds?.includes(userId) || config?.dashboardViewerUserIds?.includes(userId)) delegated.push(gid);
  }
  return delegated;
}

// Niveaux d'acces dashboard (roadmap n°058) :
// - Admin Discord du serveur ou dashboardAllowedUserIds -> acces complet.
// - dashboardViewerUserIds -> LECTURE SEULE : toute methode de mutation
//   (POST/PATCH/PUT/DELETE) est refusee ici, en un seul point, quelle que
//   soit la route.
async function requireGuildAccess(env, request, guildId) {
  const session = await requireSession(env, request);
  const adminGuildIds = await getUserAdminGuildIds(env, session);
  let viewerOnly = false;
  if (!adminGuildIds.includes(guildId)) {
    const config = await getGuildConfig(env, guildId);
    if (config?.dashboardAllowedUserIds?.includes(session.userId)) {
      viewerOnly = false;
    } else if (config?.dashboardViewerUserIds?.includes(session.userId)) {
      viewerOnly = true;
    } else {
      throw new HttpError(403, "Tu n'es pas administrateur de ce serveur.");
    }
  }
  if (viewerOnly && request.method !== 'GET') {
    throw new HttpError(403, 'Acces en lecture seule : cette action est reservee aux editeurs.');
  }
  const botGuildRes = await botFetch(env, `/guilds/${guildId}`);
  if (!botGuildRes.ok) throw new HttpError(404, "Le bot n'est pas present sur ce serveur.");
  return { ...session, viewerOnly };
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

  // --- Webhook entrant universel (roadmap n°100) : POST public protege par
  // token, formate le contenu recu et le poste dans le salon configure.
  // Reconnait les pushes GitHub, sinon extrait content/message/text ou
  // affiche le JSON compact. ---
  if (method === 'POST' && parts[0] === 'public' && parts[1] === 'inbound' && parts.length === 4) {
    const gid = parts[2];
    const config = await getGuildConfig(env, gid);
    const hook = config?.inboundWebhook;
    if (!hook?.token || hook.token !== parts[3]) throw new HttpError(403, 'Webhook invalide ou desactive.');
    const raw = (await request.text()).slice(0, 20000);
    let payload = null;
    try { payload = JSON.parse(raw); } catch { /* texte brut accepte */ }
    let text = payload?.content || payload?.message || payload?.text;
    if (!text && payload?.commits && payload?.repository) {
      text = `🔧 **${payload.pusher?.name || 'Quelqu\'un'}** a pousse ${payload.commits.length} commit(s) sur ${payload.repository.full_name} :\n${payload.commits.slice(0, 5).map((c) => `• ${(c.message || '').split('\n')[0]}`).join('\n')}`;
    }
    if (!text) text = payload ? `📥 Webhook recu :\n\`\`\`json\n${JSON.stringify(payload).slice(0, 800)}\n\`\`\`` : `📥 ${raw.slice(0, 800) || 'Webhook recu (vide).'}`;
    await botFetchJson(env, `/channels/${hook.channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: String(text).slice(0, 1900) }),
    });
    return json({ ok: true }, env);
  }

  // --- Classement public en lecture seule (roadmap n°087) : aucune session,
  // protege par un token de partage stocke dans la config du serveur. Ne
  // renvoie que pseudo/niveau/XP, jamais d'identifiants Discord. ---
  if (method === 'GET' && url.pathname === '/public/leaderboard') {
    const gid = url.searchParams.get('guild');
    const token = url.searchParams.get('token');
    if (!gid || !token) throw new HttpError(400, 'Parametres manquants.');
    const config = await getGuildConfig(env, gid);
    if (!config?.publicLeaderboardToken || config.publicLeaderboardToken !== token) {
      throw new HttpError(403, 'Lien invalide ou desactive.');
    }
    const [xpData, guild, members] = await Promise.all([
      env.GUILD_KV.get(`guild:${gid}:xp`, 'json'),
      botFetchJson(env, `/guilds/${gid}`),
      botFetchJson(env, `/guilds/${gid}/members?limit=1000`).catch(() => []),
    ]);
    const nameById = new Map(members.map((m) => [m.user.id, m.nick || m.user.global_name || m.user.username]));
    const entries = Object.entries(xpData || {})
      .sort((a, b) => (b[1].xp || 0) - (a[1].xp || 0))
      .slice(0, 20)
      .map(([uid, d], i) => ({ rank: i + 1, name: nameById.get(uid) || 'Membre parti', level: d.level || 0, xp: d.xp || 0 }));
    return json({ serverName: guild.name, entries }, env);
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
      const { name, color, hoist, permissions } = await readJson(request);
      if (!name) throw new HttpError(400, 'name requis.');
      // permissions : bitmask decimal en chaine (createur de roles).
      const perms = typeof permissions === 'string' && /^\d{1,20}$/.test(permissions) ? permissions : undefined;
      const role = await botFetchJson(env, `/guilds/${guildId}/roles`, {
        method: 'POST',
        body: JSON.stringify({
          name: name.slice(0, 100), color: color || 0, hoist: Boolean(hoist), mentionable: false,
          ...(perms ? { permissions: perms } : {}),
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
        bot: Boolean(m.user.bot),
      })), env);
    }

    // --- Createur de salons fonctionnels : cree un salon pre-nomme avec les
    // bonnes permissions ET branche la fonctionnalite dessus (champ de
    // config lu par le bot : mod-log, bienvenue, tickets...). ---
    if (sub === 'feature-channel' && parts.length === 4 && method === 'POST') {
      const session = await requireGuildAccess(env, request, guildId);
      const { feature } = await readJson(request);
      // Noms en petites capitales (meme police custom que les salons crees
      // par /setup), sans emoji. Chaque salon recoit son embed d'accueil ;
      // support recoit le VRAI panneau de tickets (meme custom_id
      // 'ticket_open' que le bot, qui gere ensuite les clics).
      const FEATURE_CHANNELS = {
        giveaways: {
          name: 'giveaways', topic: 'Giveaways du serveur — participe avec le bouton !', readonly: true, configKey: 'giveawayChannelId',
          welcome: { embeds: [{ title: '🎉 Giveaways', description: 'Les giveaways du serveur sont annonces ici.\nClique sur le bouton **Participer** sous chaque giveaway pour tenter ta chance !', color: 0x30a46c }] },
        },
        annonces: {
          name: 'annonces', topic: 'Annonces officielles du serveur', readonly: true, configKey: 'announceChannelId',
          welcome: { embeds: [{ title: '📣 Annonces', description: 'Les annonces officielles du serveur sont publiees ici.', color: 0x5865f2 }] },
        },
        suggestions: {
          name: 'suggestions', topic: 'Propose tes idees et cree des sondages', readonly: false, configKey: 'suggestionChannelId', botPanel: 'poll',
          // Panneau sondages identique a celui du bot (pollManager) : le
          // bouton poll_create_open ouvre le modal de creation de sondage.
          welcome: {
            embeds: [{ title: '📊 Sondages', description: 'Clique sur le bouton ci-dessous pour creer ton propre sondage (question + jusqu\'a 5 options), sans limite de temps.', color: 0x5b8def }],
            components: [{ type: 1, components: [{ type: 2, style: 1, label: 'Creer un sondage', emoji: { name: '📊' }, custom_id: 'poll_create_open' }] }],
          },
        },
        modlog: {
          name: 'mod-log', topic: 'Journal de moderation automatique du bot', staffOnly: true, configKey: 'modLogChannelId',
          welcome: { embeds: [{ title: '📋 Journal de moderation', description: 'Le bot enregistre ici chaque action de moderation automatique (messages supprimes, timeouts, slowmode...).', color: 0xe5484d }] },
        },
        bienvenue: {
          name: 'bienvenue', topic: 'Arrivees et departs des membres', readonly: true, configKey: 'arrivalDepartureChannelId',
          welcome: { embeds: [{ title: '👋 Bienvenue', description: 'Les arrivees et departs des membres sont annonces ici automatiquement.', color: 0x57f287 }] },
        },
        starboard: {
          name: 'hall-of-fame', topic: 'Les meilleurs messages du serveur, elus a la reaction ⭐', readonly: true, configKey: 'starboardChannelId',
          welcome: { embeds: [{ title: '🌟 Hall of fame', description: 'Reagis avec ⭐ aux messages que tu adores : a partir de 4 etoiles, ils sont republies ici automatiquement.', color: 0xfee75c }] },
        },
        avis: {
          name: 'avis', topic: 'Avis des membres apres leurs tickets', readonly: true, configKey: 'reviewChannelId',
          welcome: { embeds: [{ title: '⭐ Avis', description: 'Les evaluations laissees apres chaque ticket s\'affichent ici automatiquement, avec le membre du staff qui l\'a pris en charge.', color: 0xd3a13a }] },
        },
        support: {
          name: 'support', topic: 'Ouvre un ticket avec le bouton ci-dessous', readonly: true, configKey: 'ticketPanelChannelId', botPanel: 'ticket',
          // Reproduction exacte du panneau poste par le bot (ticketManager).
          welcome: {
            embeds: [{ title: '🎫 Support', description: 'Besoin d\'aide ou d\'une question ? Clique sur le bouton ci-dessous pour ouvrir un ticket prive avec le staff.', color: 0x5b8def }],
            components: [{ type: 1, components: [{ type: 2, style: 1, label: 'Ouvrir un ticket', emoji: { name: '🎫' }, custom_id: 'ticket_open' }] }],
          },
        },
      };
      // Categorie Staff complete : construite par le BOT lui-meme (role
      // Staff Actif, categorie privee, SERVICE STAFF, createur de vocal,
      // mod-log) via sa file d'actions — la logique vit cote bot.
      if (feature === 'staff') {
        await pushPendingPanelAction(env, guildId, { type: 'staffcategory' });
        await logAudit(env, guildId, {
          title: 'Categorie Staff demandee',
          description: `${session.username} a demande la creation de la categorie Staff complete.`,
        });
        return json({ queued: true, name: 'Staff' }, env);
      }

      const def = FEATURE_CHANNELS[feature];
      if (!def) throw new HttpError(400, 'Fonctionnalite inconnue.');

      // VIEW_CHANNEL = 1024, SEND_MESSAGES = 2048 (bitfield Discord).
      const overwrites = [];
      if (def.staffOnly) overwrites.push({ id: guildId, type: 0, deny: '1024' });
      else if (def.readonly) overwrites.push({ id: guildId, type: 0, deny: '2048' });

      const channelName = toSmallCaps(def.name);
      const channel = await botFetchJson(env, `/guilds/${guildId}/channels`, {
        method: 'POST',
        body: JSON.stringify({
          name: channelName, type: 0, topic: def.topic,
          ...(overwrites.length ? { permission_overwrites: overwrites } : {}),
        }),
        headers: { 'X-Audit-Log-Reason': `Dashboard : ${session.username}` },
      });

      if (def.welcome) {
        try {
          await botFetchJson(env, `/channels/${channel.id}/messages`, {
            method: 'POST',
            body: JSON.stringify(def.welcome),
          });
        } catch (err) {
          // Secours automatique : si l'envoi direct echoue, le bot postera
          // le panneau equivalent sous ~8 s via sa file d'actions.
          console.error('welcome direct echoue, secours via la file du bot', err);
          const fallback = def.botPanel
            ? { type: def.botPanel, channelId: channel.id }
            : { type: 'embed', channelId: channel.id, embeds: def.welcome.embeds };
          await pushPendingPanelAction(env, guildId, fallback).catch(() => {});
        }
      }

      if (def.configKey) {
        const existing = (await getGuildConfig(env, guildId)) || {};
        await putGuildConfig(env, guildId, { ...existing, [def.configKey]: channel.id });
      }
      await logAudit(env, guildId, {
        title: 'Salon fonctionnel cree',
        description: `${session.username} a cree <#${channel.id}> (${feature}) et l'a configure automatiquement.`,
      });
      return json({ channelId: channel.id, name: channelName }, env);
    }

    // --- Giveaways (roadmap n°089) : le worker cree l'entree KV et poste le
    // message Discord avec le MEME custom_id que le bot (giveaway_enter:<id>).
    // Le bot prend ensuite le relais : participations, cloture (tick 30 s),
    // tirage et annonce des gagnants. "Terminer maintenant" = endsAt passe a
    // maintenant, le prochain tick du bot cloture proprement. ---
    if (sub === 'giveaways' && parts.length === 4) {
      const session = await requireGuildAccess(env, request, guildId);
      const kvKey = `guild:${guildId}:giveaways`;
      if (method === 'GET') {
        return json((await env.GUILD_KV.get(kvKey, 'json')) || [], env);
      }
      if (method === 'POST') {
        const { channelId, prize, winnersCount, durationMinutes, requiredRoleId } = await readJson(request);
        if (!channelId || !prize?.trim()) throw new HttpError(400, 'Salon et lot requis.');
        const winners = Math.min(20, Math.max(1, Number(winnersCount) || 1));
        const minutes = Math.min(60 * 24 * 30, Math.max(1, Number(durationMinutes) || 60));
        const giveaway = {
          id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          prize: prize.trim().slice(0, 200),
          winnersCount: winners,
          requiredRoleId: requiredRoleId || undefined,
          channelId,
          endsAt: Date.now() + minutes * 60000,
          entrants: [],
          winners: [],
          closed: false,
        };
        const embed = {
          title: `🎉 ${giveaway.prize}`,
          color: 0x30a46c,
          description: 'Clique sur le bouton pour participer !',
          fields: [
            { name: 'Participants', value: '0', inline: true },
            { name: 'Gagnants', value: String(winners), inline: true },
            ...(giveaway.requiredRoleId ? [{ name: 'Role requis', value: `<@&${giveaway.requiredRoleId}>`, inline: true }] : []),
          ],
          footer: { text: 'Participe avant la fin !' },
          timestamp: new Date(giveaway.endsAt).toISOString(),
        };
        const components = [{
          type: 1,
          components: [{ type: 2, style: 3, label: 'Participer', emoji: { name: '🎉' }, custom_id: `giveaway_enter:${giveaway.id}` }],
        }];
        const message = await botFetchJson(env, `/channels/${channelId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ embeds: [embed], components }),
        });
        giveaway.messageId = message.id;
        const items = (await env.GUILD_KV.get(kvKey, 'json')) || [];
        items.push(giveaway);
        await env.GUILD_KV.put(kvKey, JSON.stringify(items));
        await logAudit(env, guildId, {
          title: 'Giveaway cree',
          description: `${session.username} a lance "${giveaway.prize}" (${winners} gagnant(s)) dans <#${channelId}>.`,
        });
        return json(giveaway, env);
      }
    }
    if (sub === 'giveaways' && parts[5] === 'end' && parts.length === 6 && method === 'POST') {
      const session = await requireGuildAccess(env, request, guildId);
      const kvKey = `guild:${guildId}:giveaways`;
      const items = (await env.GUILD_KV.get(kvKey, 'json')) || [];
      const giveaway = items.find((g) => g.id === parts[4]);
      if (!giveaway) throw new HttpError(404, 'Giveaway introuvable.');
      if (giveaway.closed) throw new HttpError(400, 'Ce giveaway est deja termine.');
      giveaway.endsAt = Date.now();
      await env.GUILD_KV.put(kvKey, JSON.stringify(items));
      await logAudit(env, guildId, {
        title: 'Giveaway termine manuellement',
        description: `${session.username} a termine "${giveaway.prize}" (tirage sous 30 s).`,
      });
      return json({ ok: true }, env);
    }

    // Casier de sanctions (roadmap n°072) : lit les warns ecrits par le bot
    // (automod et manuels) dans le meme namespace KV.
    if (sub === 'members' && parts[5] === 'warns' && parts.length === 6 && method === 'GET') {
      await requireGuildAccess(env, request, guildId);
      const warns = (await env.GUILD_KV.get(`guild:${guildId}:warns:${parts[4]}`, 'json')) || [];
      return json(warns, env);
    }

    // Attribution/retrait d'un role a un membre depuis le dashboard
    // (createur de salons & roles) : PUT/DELETE natifs de l'API Discord.
    if (sub === 'members' && parts[5] === 'roles' && parts.length === 7 && (method === 'PUT' || method === 'DELETE')) {
      const session = await requireGuildAccess(env, request, guildId);
      const targetId = parts[4];
      const roleId = parts[6];
      const res = await botFetch(env, `/guilds/${guildId}/members/${targetId}/roles/${roleId}`, {
        method,
        headers: { 'X-Audit-Log-Reason': `Dashboard : ${session.username}` },
      });
      if (!res.ok) {
        throw new HttpError(res.status === 403 ? 403 : 500,
          res.status === 403 ? 'Le bot ne peut pas gerer ce role (hierarchie ?).' : 'Echec de la modification du role.');
      }
      await logAudit(env, guildId, {
        title: method === 'PUT' ? 'Role attribue' : 'Role retire',
        description: `${session.username} ${method === 'PUT' ? 'a donne' : 'a retire'} <@&${roleId}> ${method === 'PUT' ? 'a' : 'de'} <@${targetId}>.`,
      });
      return json({ ok: true }, env);
    }

    // Timeout d'un membre depuis le dashboard (roadmap n°075).
    // minutes = 0 leve le timeout en cours.
    if (sub === 'members' && parts[5] === 'timeout' && parts.length === 6 && method === 'POST') {
      const session = await requireGuildAccess(env, request, guildId);
      const targetId = parts[4];
      const { minutes } = await readJson(request);
      const mins = Number(minutes);
      if (!Number.isFinite(mins) || mins < 0 || mins > 40320) throw new HttpError(400, 'Duree invalide (0 a 40320 minutes).');
      const until = mins === 0 ? null : new Date(Date.now() + mins * 60000).toISOString();
      const res = await botFetch(env, `/guilds/${guildId}/members/${targetId}`, {
        method: 'PATCH',
        body: JSON.stringify({ communication_disabled_until: until }),
        headers: { 'X-Audit-Log-Reason': `Dashboard : ${session.username}` },
      });
      if (!res.ok) throw new HttpError(res.status === 403 ? 403 : 500, res.status === 403 ? 'Le bot ne peut pas timeout ce membre (role trop haut ?).' : 'Echec du timeout.');
      await logAudit(env, guildId, {
        title: mins === 0 ? 'Timeout leve' : 'Timeout applique',
        description: `${session.username} ${mins === 0 ? 'a leve le timeout de' : `a reduit au silence ${mins} min`} <@${targetId}>.`,
      });
      return json({ ok: true, until }, env);
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

    // Webhook entrant (roadmap n°100) : genere/revoque le token et fixe le
    // salon de destination.
    if (sub === 'inbound-webhook' && parts.length === 4 && method === 'POST') {
      const session = await requireGuildAccess(env, request, guildId);
      const { enabled, channelId } = await readJson(request);
      const existing = (await getGuildConfig(env, guildId)) || {};
      const inboundWebhook = enabled
        ? { token: existing.inboundWebhook?.token || crypto.randomUUID().replace(/-/g, ''), channelId: channelId || existing.inboundWebhook?.channelId }
        : null;
      if (enabled && !inboundWebhook.channelId) throw new HttpError(400, 'Salon requis.');
      await putGuildConfig(env, guildId, { ...existing, inboundWebhook });
      await logAudit(env, guildId, {
        title: 'Webhook entrant',
        description: `${session.username} a ${enabled ? 'active' : 'desactive'} le webhook entrant.`,
      });
      return json({ inboundWebhook }, env);
    }

    // Classement public (roadmap n°087) : genere ou revoque le token de
    // partage en lecture seule.
    if (sub === 'public-leaderboard' && parts.length === 4 && method === 'POST') {
      const session = await requireGuildAccess(env, request, guildId);
      const { enabled } = await readJson(request);
      const existing = (await getGuildConfig(env, guildId)) || {};
      const token = enabled ? (existing.publicLeaderboardToken || crypto.randomUUID().replace(/-/g, '')) : null;
      await putGuildConfig(env, guildId, { ...existing, publicLeaderboardToken: token });
      await logAudit(env, guildId, {
        title: 'Classement public',
        description: `${session.username} a ${enabled ? 'active' : 'desactive'} le lien public du classement.`,
      });
      return json({ token }, env);
    }

    // Suggestions (roadmap n°091) : lecture du store ecrit par le bot,
    // pour le suivi des statuts au dashboard.
    if (sub === 'suggestions' && parts.length === 4 && method === 'GET') {
      await requireGuildAccess(env, request, guildId);
      return json((await env.GUILD_KV.get(`guild:${guildId}:suggestions`, 'json')) || [], env);
    }

    // XP/activite par membre (top membres n°031 et stats vocales n°032) :
    // lit le document unique ecrit par le xpManager du bot.
    if (sub === 'xp' && parts.length === 4 && method === 'GET') {
      await requireGuildAccess(env, request, guildId);
      return json((await env.GUILD_KV.get(`guild:${guildId}:xp`, 'json')) || {}, env);
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
        // Envoi DIRECT via l'API Discord (immediat) : la file du bot ajoutait
        // jusqu'a 8 s de latence percue comme un bug. La file reste pour les
        // panneaux (reglement/roles/poll/ticket) qui exigent la logique bot.
        const prepared = embeds.map((e) => {
          const embed = { ...e };
          if (embed.timestamp) embed.timestamp = new Date().toISOString();
          else delete embed.timestamp;
          return embed;
        });
        // Boutons sous le message (roadmap n°003) : definitions validees ici,
        // jamais de components bruts venus du client. Les boutons "role"
        // utilisent custom_id selfrole:<id>, gere par le bot (toggle).
        let components;
        if (Array.isArray(body.buttons) && body.buttons.length) {
          if (body.buttons.length > 5) throw new HttpError(400, '5 boutons maximum.');
          const built = body.buttons.map((b) => {
            const label = String(b.label || '').trim().slice(0, 80);
            if (!label) throw new HttpError(400, 'Chaque bouton doit avoir un texte.');
            const emoji = b.emoji ? { name: String(b.emoji).slice(0, 32) } : undefined;
            if (b.kind === 'link') {
              if (!/^https?:\/\/\S+$/i.test(b.url || '')) throw new HttpError(400, `URL invalide pour le bouton "${label}".`);
              return { type: 2, style: 5, label, url: b.url, ...(emoji ? { emoji } : {}) };
            }
            if (b.kind === 'role') {
              if (!/^\d{5,25}$/.test(b.roleId || '')) throw new HttpError(400, `Role invalide pour le bouton "${label}".`);
              return { type: 2, style: 1, label, custom_id: `selfrole:${b.roleId}`, ...(emoji ? { emoji } : {}) };
            }
            throw new HttpError(400, 'Type de bouton inconnu.');
          });
          components = [{ type: 1, components: built }];
        }
        await botFetchJson(env, `/channels/${body.channelId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ content: body.content || undefined, embeds: prepared, ...(components ? { components } : {}) }),
        });
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
    // Sauvegarde hebdomadaire complete du KV (roadmap n°106).
    if (event.cron === '0 5 * * SUN') {
      await backupAllKv(env);
      return;
    }
    await snapshotAllGuilds(env);
  },
};

// Copie toutes les cles de donnees (guild:*, bot:*) dans backup:<date> et
// garde les 4 sauvegardes les plus recentes. Les cles techniques (sessions,
// caches, anciennes sauvegardes) sont exclues.
async function backupAllKv(env) {
  const backup = {};
  let cursor;
  do {
    // eslint-disable-next-line no-await-in-loop
    const page = await env.GUILD_KV.list({ cursor, limit: 1000 });
    for (const key of page.keys) {
      if (!key.name.startsWith('guild:') && !key.name.startsWith('bot:')) continue;
      // eslint-disable-next-line no-await-in-loop
      const value = await env.GUILD_KV.get(key.name);
      if (value !== null) backup[key.name] = value;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  const date = new Date().toISOString().slice(0, 10);
  await env.GUILD_KV.put(`backup:${date}`, JSON.stringify(backup));

  const existing = await env.GUILD_KV.list({ prefix: 'backup:' });
  const names = existing.keys.map((k) => k.name).sort();
  for (const name of names.slice(0, -4)) {
    // eslint-disable-next-line no-await-in-loop
    await env.GUILD_KV.delete(name);
  }
  console.log(`backup hebdo : ${Object.keys(backup).length} cles sauvegardees dans backup:${date}`);
}
