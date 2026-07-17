// Mode demo (roadmap n°171) : explorer tout le dashboard avec des donnees
// fictives, sans avoir de serveur Discord ni le bot invite nulle part.
// Active via app.html?demo=1 (pose un flag sessionStorage) ou en arrivant
// deja avec le flag pose. Quand actif, Api.request() (voir api.js) delegue
// entierement a window.__demoRequest ci-dessous : AUCUN appel reseau reel
// n'est fait, rien n'est jamais persiste au dela de l'onglet.
(function demoMode() {
  function wantsDemo() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === '1') { sessionStorage.setItem('dsc-demo', '1'); return true; }
    return sessionStorage.getItem('dsc-demo') === '1';
  }

  window.DEMO_MODE = wantsDemo();
  if (!window.DEMO_MODE) return;

  const DEMO_GUILD_ID = 'demo-9000000000000001';
  const DEMO_USER_ID = '900000000000000001';
  window.DEMO_GUILD_ID = DEMO_GUILD_ID;

  window.exitDemoMode = function exitDemoMode() {
    sessionStorage.removeItem('dsc-demo');
    window.location.href = 'index.html';
  };

  const now = Date.now();
  const day = 86400000;

  const ROLES = [
    { id: DEMO_GUILD_ID, name: '@everyone', color: 0, position: 0, permissions: '104324673' },
    { id: 'r-admin', name: 'Admin', color: 0xE74C3C, position: 5, permissions: '8' },
    { id: 'r-mod', name: 'Moderateur', color: 0x3498DB, position: 4, permissions: '8' },
    { id: 'r-vip', name: 'VIP', color: 0xF1C40F, position: 3, permissions: '0' },
    { id: 'r-membre', name: 'Membre', color: 0x2ECC71, position: 2, permissions: '0' },
    { id: 'r-bot', name: 'Discord Serveur Creator', color: 0x5865F2, position: 6, permissions: '8' },
  ];

  const CHANNELS = [
    { id: 'cat-info', name: 'INFORMATIONS', type: 4, position: 0 },
    { id: 'c-bienvenue', name: 'bienvenue', type: 0, position: 0, parent_id: 'cat-info' },
    { id: 'c-annonces', name: 'annonces', type: 0, position: 1, parent_id: 'cat-info' },
    { id: 'c-reglement', name: 'reglement', type: 0, position: 2, parent_id: 'cat-info' },
    { id: 'cat-general', name: 'GENERAL', type: 4, position: 1 },
    { id: 'c-general', name: 'general', type: 0, position: 0, parent_id: 'cat-general' },
    { id: 'c-memes', name: 'memes', type: 0, position: 1, parent_id: 'cat-general' },
    { id: 'c-bot-commandes', name: 'bot-commandes', type: 0, position: 2, parent_id: 'cat-general' },
    { id: 'cat-vocal', name: 'VOCAL', type: 4, position: 2 },
    { id: 'c-vocal1', name: 'General', type: 2, position: 0, parent_id: 'cat-vocal' },
    { id: 'c-vocal2', name: 'Detente', type: 2, position: 1, parent_id: 'cat-vocal' },
    { id: 'cat-staff', name: 'STAFF', type: 4, position: 3 },
    { id: 'c-staff-chat', name: 'staff-chat', type: 0, position: 0, parent_id: 'cat-staff' },
  ];

  const MEMBER_NAMES = ['Nova', 'Lumen', 'Kaz', 'Astra', 'Wisp', 'Cyra', 'Rhen', 'Talis', 'Ombre', 'Zephyr'];
  const MEMBERS = MEMBER_NAMES.map((n, i) => ({
    userId: `90000000000000${(1000 + i)}`,
    id: `90000000000000${(1000 + i)}`,
    username: n,
    tag: `${n}#${1000 + i}`,
    avatar: null,
    roles: i === 0 ? ['r-admin'] : i === 1 ? ['r-mod'] : i === 2 ? ['r-vip'] : ['r-membre'],
    joinedAt: now - (30 - i) * day,
  }));

  // Store mutable en memoire : les ajouts/suppressions faits pendant la demo
  // sont visibles immediatement (re-render = relecture du store), jamais
  // ecrits nulle part, perdus a la fermeture de l'onglet.
  const store = new Map();
  store.set('/channels', CHANNELS);
  store.set('/roles', ROLES);
  store.set('/members', MEMBERS);
  store.set('/config', {
    xpRate: 1, xpChannelBoosts: { 'c-general': 1.5 }, publicLeaderboardToken: null, commandCooldowns: {},
  });
  store.set('/modconfig', {
    antiRaidEnabled: true, antiRaidJoinThreshold: 8, autoTimeoutAfterWarns: 3, autoTimeoutMinutes: 10,
    autoSlowmodeEnabled: false, autoSlowmodeMsgPer10s: 20,
  });
  store.set('/levelroles', [
    { level: 5, roleId: 'r-membre' },
    { level: 15, roleId: 'r-vip', bonus: 500, announce: '🎉 {user} devient VIP au niveau {level} !' },
  ]);
  store.set('/referralroles', []);
  store.set('/referrals', {});
  store.set('/streamers', []);
  store.set('/scheduled', []);
  store.set('/tickets', [
    { id: 't-1', userId: MEMBERS[2].userId, subject: 'Probleme de role', status: 'open', createdAt: now - 3600_000 },
    { id: 't-2', userId: MEMBERS[4].userId, subject: 'Question sur le reglement', status: 'closed', createdAt: now - 2 * day },
  ]);
  store.set('/suggestions', [
    { id: 's-1', text: 'Ajouter un salon musique', authorTag: MEMBERS[2].tag, status: 'pending', upvotes: [MEMBERS[0].userId, MEMBERS[3].userId], downvotes: [] },
    { id: 's-2', text: 'Evenement Halloween', authorTag: MEMBERS[5].tag, status: 'approved', upvotes: [MEMBERS[0].userId], downvotes: [] },
  ]);
  store.set('/shop', [
    { id: 'sh-1', name: 'Role couleur VIP', price: 500, roleId: 'r-vip' },
    { id: 'sh-2', name: 'Ping special', price: 100 },
  ]);
  store.set('/economy', Object.fromEntries(MEMBERS.map((m, i) => [m.userId, { balance: 1000 - i * 60, lastDaily: 0 }])));
  store.set('/xp', Object.fromEntries(MEMBERS.map((m, i) => [m.userId, {
    xp: (10 - i) * 800, level: 10 - i, messageCount: (10 - i) * 40, voiceMinutes: (10 - i) * 120,
  }])));
  store.set('/gameroles', []);
  store.set('/customcommands', []);
  store.set('/embedtemplates', []);
  store.set('/reactionroles', []);
  store.set('/giveaways', []);
  store.set('/trash', []);
  store.set('/auditlog', [
    { id: 'a-1', action: 'member_join', actorTag: 'Systeme', at: now - 1000_000, details: `${MEMBERS[0].tag} a rejoint le serveur` },
    { id: 'a-2', action: 'role_add', actorTag: MEMBERS[0].tag, at: now - 500_000, details: `Role VIP donne a ${MEMBERS[2].tag}` },
  ]);
  // Forme reelle de /stats (voir worker getStats) : un releve par jour, pas
  // un objet de series — sinon renderStatsPage (qui fait stats.map(...)) casse.
  store.set('/stats', Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now - (13 - i) * day);
    const hours = Array.from({ length: 24 }, (_, h) => (h >= 14 && h <= 23 ? Math.round(Math.random() * 8) : Math.round(Math.random() * 2)));
    return {
      date: d.toISOString().slice(0, 10),
      memberCount: MEMBERS.length - (13 - i) + Math.floor(i / 3),
      messageCount: 15 + Math.round(Math.random() * 30),
      joins: i % 3 === 0 ? 1 : 0,
      hours,
    };
  }));
  store.set('/voicechannelstats', { 'c-vocal1': 640, 'c-vocal2': 210 });

  function nextId(prefix) { return `${prefix}-${Math.random().toString(36).slice(2, 8)}`; }

  function json(body) { return Promise.resolve(JSON.parse(JSON.stringify(body))); }

  function guildScoped(path) {
    const clean = path.split('?')[0];
    const m = clean.match(/^\/api\/guilds\/[^/]+(\/.*)?$/);
    return m ? (m[1] || '') : null;
  }

  // Endpoints hors serveur (globaux).
  function handleGlobal(path, method) {
    if (path === '/api/me') return json({ userId: DEMO_USER_ID, username: 'Toi (demo)', avatar: null });
    if (path === '/api/guilds') {
      return json([{
        guildId: DEMO_GUILD_ID, name: 'Communaute Demo', icon: null, botPresent: true, configured: true, inviteUrl: '#',
      }]);
    }
    if (path === '/api/botstatus') return json({ status: 'ok', uptimeMin: 1337, wsPingMs: 42, guilds: 1, memoryMb: 64, version: 'demo' });
    if (path === '/api/push-vapid-key') return json({ publicKey: null });
    if (path === '/api/templates') return json([]);
    if (path === '/api/game-role-catalog') return json([]);
    if (method !== 'GET') return json({ ok: true });
    return json([]);
  }

  async function demoRequest(fullPath, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const body = options.body ? (() => { try { return JSON.parse(options.body); } catch { return {}; } })() : {};
    const sub = guildScoped(fullPath);

    if (sub === null) return handleGlobal(fullPath.split('?')[0], method);

    // --- Collections a CRUD reel (backees par le store mutable) ---
    const collections = {
      '/levelroles': { key: 'level', addField: (lvl) => ({ level: lvl, ...body }) },
      '/referralroles': { key: 'count', addField: (n) => ({ count: n, roleId: body.roleId }) },
      '/scheduled': { key: 'id', addField: () => ({ id: nextId('sch'), ...body }) },
      '/shop': { key: 'id', addField: () => ({ id: nextId('sh'), ...body }) },
      '/customcommands': { key: 'id', addField: () => ({ id: nextId('cc'), ...body }) },
      '/embedtemplates': { key: 'id', addField: () => ({ id: nextId('et'), ...body }) },
      '/reactionroles': { key: 'id', addField: () => ({ id: nextId('rr'), ...body }) },
      '/giveaways': { key: 'id', addField: () => ({ id: nextId('gw'), ...body, endsAt: now + (body.duree_minutes || 60) * 60000 }) },
    };

    for (const [base, cfg] of Object.entries(collections)) {
      if (sub === base && method === 'GET') return json(store.get(base) || []);
      if (sub === base && method === 'POST') {
        const list = store.get(base) || [];
        if (base === '/levelroles') {
          const level = Number(body.level);
          const filtered = list.filter((it) => it.level !== level);
          filtered.push({ level, ...(body.roleId ? { roleId: body.roleId } : {}), ...(body.bonus ? { bonus: body.bonus } : {}), ...(body.announce ? { announce: body.announce } : {}) });
          filtered.sort((a, b) => a.level - b.level);
          store.set(base, filtered);
          return json(filtered);
        }
        if (base === '/referralroles') {
          const count = Number(body.count);
          const filtered = list.filter((it) => it.count !== count);
          filtered.push({ count, roleId: body.roleId });
          filtered.sort((a, b) => a.count - b.count);
          store.set(base, filtered);
          return json(filtered);
        }
        const item = cfg.addField ? cfg.addField() : body;
        list.push(item);
        store.set(base, list);
        return json(item);
      }
      if (sub.startsWith(`${base}/`) && method === 'DELETE') {
        const idPart = sub.slice(base.length + 1);
        const list = store.get(base) || [];
        let filtered;
        if (base === '/levelroles') filtered = list.filter((it) => String(it.level) !== idPart);
        else if (base === '/referralroles') filtered = list.filter((it) => String(it.count) !== idPart);
        else filtered = list.filter((it) => String(it.id) !== idPart);
        store.set(base, filtered);
        return json({ ok: true });
      }
    }

    // --- Streamers : cle composite userId/platform ---
    if (sub === '/streamers' && method === 'GET') return json(store.get('/streamers') || []);
    if (sub === '/streamers' && method === 'POST') {
      const list = store.get('/streamers') || [];
      list.push({ discordUserId: body.discordUserId, platform: body.platform, identifier: body.identifier, live: false });
      store.set('/streamers', list);
      return json(list);
    }
    if (sub.match(/^\/streamers\/[^/]+\/[^/]+$/) && method === 'DELETE') {
      const [, uid, platform] = sub.split('/').slice(1);
      store.set('/streamers', (store.get('/streamers') || []).filter((s) => !(s.discordUserId === uid && s.platform === platform)));
      return json({ ok: true });
    }

    // --- Lecture simple ---
    if (sub === '/channels' && method === 'GET') return json(store.get('/channels'));
    if (sub === '/roles' && method === 'GET') return json(store.get('/roles'));
    if (sub === '/members' && method === 'GET') return json(store.get('/members'));
    if (sub === '/economy' && method === 'GET') return json(store.get('/economy'));
    if (sub === '/xp' && method === 'GET') return json(store.get('/xp'));
    if (sub === '/stats' && method === 'GET') return json(store.get('/stats'));
    if (sub === '/voicechannelstats' && method === 'GET') return json(store.get('/voicechannelstats'));
    if (sub === '/auditlog' && method === 'GET') return json(store.get('/auditlog'));
    if (sub === '/tickets' && method === 'GET') return json(store.get('/tickets'));
    if (sub === '/suggestions' && method === 'GET') return json(store.get('/suggestions'));
    if (sub === '/referrals' && method === 'GET') return json(store.get('/referrals'));

    // --- Config / modconfig : lecture + fusion PATCH (persiste dans l'onglet) ---
    if (sub === '/config') {
      if (method === 'GET') return json(store.get('/config'));
      if (method === 'PATCH') {
        const merged = { ...store.get('/config'), ...body };
        store.set('/config', merged);
        return json(merged);
      }
    }
    if (sub === '/modconfig') {
      if (method === 'GET') return json(store.get('/modconfig'));
      if (method === 'PATCH') {
        const merged = { ...store.get('/modconfig'), ...body };
        store.set('/modconfig', merged);
        return json(merged);
      }
    }

    // --- Tickets : fermer/rouvrir ---
    const ticketMatch = sub.match(/^\/tickets\/([^/]+)\/(close|reopen)$/);
    if (ticketMatch) {
      const [, ticketId, action] = ticketMatch;
      const list = store.get('/tickets') || [];
      const t = list.find((x) => x.id === ticketId);
      if (t) t.status = action === 'close' ? 'closed' : 'open';
      return json({ ok: true });
    }

    // --- Export/import de la configuration complete (roadmap n°210) ---
    if (sub === '/config-export' && method === 'GET') {
      return json({
        version: 1,
        exportedAt: now,
        config: store.get('/config'),
        modConfig: store.get('/modconfig'),
        levelRoles: store.get('/levelroles'),
        referralRoles: store.get('/referralroles'),
        shopItems: store.get('/shop'),
        customCommands: store.get('/customcommands'),
        embedTemplates: store.get('/embedtemplates'),
        reactionRoleGroups: store.get('/reactionroles'),
        gameRoles: store.get('/gameroles'),
      });
    }
    if (sub === '/config-import' && method === 'POST') {
      let sections = 0;
      if (body.config) { store.set('/config', { ...store.get('/config'), ...body.config }); sections += 1; }
      if (body.modConfig) { store.set('/modconfig', body.modConfig); sections += 1; }
      if (Array.isArray(body.levelRoles)) { store.set('/levelroles', body.levelRoles); sections += 1; }
      if (Array.isArray(body.referralRoles)) { store.set('/referralroles', body.referralRoles); sections += 1; }
      if (Array.isArray(body.shopItems)) { store.set('/shop', body.shopItems); sections += 1; }
      if (Array.isArray(body.customCommands)) { store.set('/customcommands', body.customCommands); sections += 1; }
      if (Array.isArray(body.embedTemplates)) { store.set('/embedtemplates', body.embedTemplates); sections += 1; }
      if (Array.isArray(body.reactionRoleGroups)) { store.set('/reactionroles', body.reactionRoleGroups); sections += 1; }
      if (Array.isArray(body.gameRoles)) { store.set('/gameroles', body.gameRoles); sections += 1; }
      return json({ ok: true, sectionsImported: sections });
    }

    // --- Fallback generique : ne jamais faire echouer une page en demo ---
    const objectLikeEndings = ['/aiconfig', '/generation', '/voice-occupancy', '/embed-history'];
    if (method === 'GET') {
      if (objectLikeEndings.some((e) => sub.endsWith(e))) return json({});
      return json([]);
    }
    return json({ ok: true, ...body });
  }

  window.__demoRequest = demoRequest;
}());
