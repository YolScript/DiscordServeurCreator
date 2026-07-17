window.Api = (function api() {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const pendingConfigPatches = new Map(); // guildId -> patch fusionne (n°176)

  // Nouvelle tentative automatique (roadmap n°051) : les LECTURES qui
  // echouent (panne reseau, 5xx pendant un reveil du backend) sont retentees
  // deux fois avec un delai croissant. Jamais les mutations (POST/PATCH/
  // DELETE) : retenter une creation peut la dupliquer.
  async function request(path, options = {}, attempt = 0) {
    const method = (options.method || 'GET').toUpperCase();
    const canRetry = method === 'GET' && attempt < 2;
    const retry = async () => {
      await sleep(attempt === 0 ? 600 : 1500);
      return request(path, options, attempt + 1);
    };

    let res;
    try {
      res = await fetch(`${window.API_BASE_URL}${path}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options,
      });
    } catch (err) {
      if (canRetry) return retry();
      throw err;
    }

    if (res.status === 401) {
      const onIndex = /(^|\/)index\.html$/.test(window.location.pathname) || window.location.pathname.endsWith('/');
      if (!onIndex) window.location.href = 'index.html';
      throw new Error('Non connecte.');
    }

    let body = null;
    const text = await res.text();
    if (text) {
      try { body = JSON.parse(text); } catch { body = text; }
    }

    if (!res.ok) {
      if (res.status >= 500 && canRetry) return retry();
      const message = (body && body.error) || `Erreur ${res.status}`;
      throw new Error(message);
    }
    return body;
  }

  return {
    me: () => request('/api/me'),
    logout: () => request('/auth/logout', { method: 'POST' }),
    guilds: () => request('/api/guilds'),
    channels: (guildId) => request(`/api/guilds/${guildId}/channels`),
    roles: (guildId) => request(`/api/guilds/${guildId}/roles`),
    members: (guildId) => request(`/api/guilds/${guildId}/members`),
    timeoutMember: (guildId, userId, minutes) => request(`/api/guilds/${guildId}/members/${userId}/timeout`, { method: 'POST', body: JSON.stringify({ minutes }) }),
    memberWarns: (guildId, userId) => request(`/api/guilds/${guildId}/members/${userId}/warns`),
    memberNote: (guildId, userId) => request(`/api/guilds/${guildId}/members/${userId}/note`),
    memberInventory: (guildId, userId) => request(`/api/guilds/${guildId}/members/${userId}/inventory`),
    saveMemberNote: (guildId, userId, text) => request(`/api/guilds/${guildId}/members/${userId}/note`, { method: 'PUT', body: JSON.stringify({ text }) }),
    xp: (guildId) => request(`/api/guilds/${guildId}/xp`),
    suggestions: (guildId) => request(`/api/guilds/${guildId}/suggestions`),
    reports: (guildId) => request(`/api/guilds/${guildId}/reports`),
    resolveReport: (guildId, reportId) => request(`/api/guilds/${guildId}/reports/${reportId}/resolve`, { method: 'POST' }),
    dashboardLogins: (guildId) => request(`/api/guilds/${guildId}/logins`),
    duplicateCategory: (guildId, categoryId) => request(`/api/guilds/${guildId}/categories/${categoryId}/duplicate`, { method: 'POST' }),
    trash: (guildId) => request(`/api/guilds/${guildId}/trash`),
    ticketTranscript: (guildId, ticketId) => request(`/api/guilds/${guildId}/tickets/${ticketId}/transcript`),
    restoreTrash: (guildId, entryId) => request(`/api/guilds/${guildId}/trash/${entryId}/restore`, { method: 'POST' }),
    voiceOccupancy: (guildId) => request(`/api/guilds/${guildId}/voice-occupancy`),
    setPublicLeaderboard: (guildId, enabled) => request(`/api/guilds/${guildId}/public-leaderboard`, { method: 'POST', body: JSON.stringify({ enabled }) }),
    setCalendarFeed: (guildId, enabled) => request(`/api/guilds/${guildId}/calendar-feed`, { method: 'POST', body: JSON.stringify({ enabled }) }),
    createCountdownChannel: (guildId, label, targetAt) => request(`/api/guilds/${guildId}/countdown-channel`, { method: 'POST', body: JSON.stringify({ label, targetAt }) }),
    deleteCountdownChannel: (guildId) => request(`/api/guilds/${guildId}/countdown-channel`, { method: 'DELETE' }),
    twitchSubs: (guildId) => request(`/api/guilds/${guildId}/twitch-subs`),
    twitchSync: (guildId) => request(`/api/guilds/${guildId}/twitch-sync`, { method: 'POST' }),
    twitchDisconnect: (guildId) => request(`/api/guilds/${guildId}/twitch-link`, { method: 'DELETE' }),
    setInboundWebhook: (guildId, enabled, channelId) => request(`/api/guilds/${guildId}/inbound-webhook`, { method: 'POST', body: JSON.stringify({ enabled, channelId }) }),
    giveaways: (guildId) => request(`/api/guilds/${guildId}/giveaways`),
    createGiveaway: (guildId, payload) => request(`/api/guilds/${guildId}/giveaways`, { method: 'POST', body: JSON.stringify(payload) }),
    endGiveaway: (guildId, giveawayId) => request(`/api/guilds/${guildId}/giveaways/${giveawayId}/end`, { method: 'POST' }),
    rerollGiveaway: (guildId, giveawayId) => request(`/api/guilds/${guildId}/giveaways/${giveawayId}/reroll`, { method: 'POST' }),
    createFeatureChannel: (guildId, feature) => request(`/api/guilds/${guildId}/feature-channel`, { method: 'POST', body: JSON.stringify({ feature }) }),
    applyServerTemplate: (guildId, template) => request(`/api/guilds/${guildId}/apply-template`, { method: 'POST', body: JSON.stringify({ template }) }),
    addMemberRole: (guildId, userId, roleId) => request(`/api/guilds/${guildId}/members/${userId}/roles/${roleId}`, { method: 'PUT' }),
    removeMemberRole: (guildId, userId, roleId) => request(`/api/guilds/${guildId}/members/${userId}/roles/${roleId}`, { method: 'DELETE' }),
    createRole: (guildId, name, color, permissions) => request(`/api/guilds/${guildId}/roles`, { method: 'POST', body: JSON.stringify({ name, color, permissions }) }),
    config: (guildId) => request(`/api/guilds/${guildId}/config`),
    // Regroupement des PATCH config (roadmap n°176) : plusieurs enregistrements
    // rapproches (moins de 400 ms) fusionnent en UNE seule ecriture KV.
    updateConfig: (guildId, patch) => new Promise((resolve, reject) => {
      const entry = pendingConfigPatches.get(guildId) || { patch: {}, timer: null, waiters: [] };
      Object.assign(entry.patch, patch);
      entry.waiters.push({ resolve, reject });
      clearTimeout(entry.timer);
      entry.timer = setTimeout(async () => {
        pendingConfigPatches.delete(guildId);
        try {
          const result = await request(`/api/guilds/${guildId}/config`, { method: 'PATCH', body: JSON.stringify(entry.patch) });
          entry.waiters.forEach((w) => w.resolve(result));
        } catch (err) {
          entry.waiters.forEach((w) => w.reject(err));
        }
      }, 400);
      pendingConfigPatches.set(guildId, entry);
    }),
    gameRoles: (guildId) => request(`/api/guilds/${guildId}/gameroles`),
    gameRoleCatalog: () => request('/api/game-role-catalog'),
    addPresetGameRole: (guildId, gameKey) => request(`/api/guilds/${guildId}/gameroles/preset`, { method: 'POST', body: JSON.stringify({ gameKey }) }),
    renameGameRole: (guildId, roleId, displayName) => request(`/api/guilds/${guildId}/gameroles/${roleId}`, { method: 'PATCH', body: JSON.stringify({ displayName }) }),
    deleteGameRole: (guildId, roleId) => request(`/api/guilds/${guildId}/gameroles/${roleId}`, { method: 'DELETE' }),
    bulkPermissions: (guildId, payload) => request(`/api/guilds/${guildId}/permissions/bulk`, { method: 'POST', body: JSON.stringify(payload) }),
    setPermissionCell: (guildId, channelId, roleId, state) => request(`/api/guilds/${guildId}/permissions/cell`, { method: 'POST', body: JSON.stringify({ channelId, roleId, state }) }),
    exportPermissions: (guildId, channelId) => request(`/api/guilds/${guildId}/permissions/export?channelId=${channelId}`),
    importPermissions: (guildId, channelId, permissionOverwrites) => request(`/api/guilds/${guildId}/permissions/import`, { method: 'POST', body: JSON.stringify({ channelId, permissionOverwrites }) }),
    createChannel: (guildId, name, type, categoryId, isPrivate, importFromChannelId) => request(`/api/guilds/${guildId}/channels`, { method: 'POST', body: JSON.stringify({
      name, type, categoryId, isPrivate, importFromChannelId,
    }) }),
    createCategory: (guildId, name) => request(`/api/guilds/${guildId}/categories`, { method: 'POST', body: JSON.stringify({ name }) }),
    resetRoleDefault: (guildId, roleKey) => request(`/api/guilds/${guildId}/roles/${roleKey}/reset-default`, { method: 'POST' }),
    renameChannel: (guildId, channelId, name) => request(`/api/guilds/${guildId}/channels/${channelId}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    deleteChannel: (guildId, channelId) => request(`/api/guilds/${guildId}/channels/${channelId}`, { method: 'DELETE' }),
    moveChannel: (guildId, channelId, parentId) => request(`/api/guilds/${guildId}/channels/${channelId}`, { method: 'PATCH', body: JSON.stringify({ parentId }) }),

    modConfig: (guildId) => request(`/api/guilds/${guildId}/modconfig`),
    updateModConfig: (guildId, patch) => request(`/api/guilds/${guildId}/modconfig`, { method: 'PATCH', body: JSON.stringify(patch) }),

    levelRoles: (guildId) => request(`/api/guilds/${guildId}/levelroles`),
    setLevelRole: (guildId, level, roleId) => request(`/api/guilds/${guildId}/levelroles`, { method: 'POST', body: JSON.stringify({ level, roleId }) }),
    deleteLevelRole: (guildId, level) => request(`/api/guilds/${guildId}/levelroles/${level}`, { method: 'DELETE' }),

    referrals: (guildId) => request(`/api/guilds/${guildId}/referrals`),
    referralRoles: (guildId) => request(`/api/guilds/${guildId}/referralroles`),
    setReferralRole: (guildId, count, roleId) => request(`/api/guilds/${guildId}/referralroles`, { method: 'POST', body: JSON.stringify({ count, roleId }) }),
    deleteReferralRole: (guildId, count) => request(`/api/guilds/${guildId}/referralroles/${count}`, { method: 'DELETE' }),

    streamers: (guildId) => request(`/api/guilds/${guildId}/streamers`),
    addStreamer: (guildId, discordUserId, platform, identifier) => request(`/api/guilds/${guildId}/streamers`, { method: 'POST', body: JSON.stringify({ discordUserId, platform, identifier }) }),
    deleteStreamer: (guildId, discordUserId, platform) => request(`/api/guilds/${guildId}/streamers/${discordUserId}/${platform}`, { method: 'DELETE' }),

    scheduled: (guildId) => request(`/api/guilds/${guildId}/scheduled`),
    addScheduled: (guildId, payload) => request(`/api/guilds/${guildId}/scheduled`, { method: 'POST', body: JSON.stringify(payload) }),
    deleteScheduled: (guildId, taskId) => request(`/api/guilds/${guildId}/scheduled/${taskId}`, { method: 'DELETE' }),

    tickets: (guildId) => request(`/api/guilds/${guildId}/tickets`),
    closeTicket: (guildId, ticketId) => request(`/api/guilds/${guildId}/tickets/${ticketId}/close`, { method: 'POST' }),

    securityExport: (guildId) => request(`/api/guilds/${guildId}/security/export`),
    securityRestore: (guildId, snapshot) => request(`/api/guilds/${guildId}/security/restore`, { method: 'POST', body: JSON.stringify(snapshot) }),
    securitySnapshots: (guildId) => request(`/api/guilds/${guildId}/security/snapshots`),
    securitySnapshotNow: (guildId) => request(`/api/guilds/${guildId}/security/snapshot`, { method: 'POST' }),
    lockdown: (guildId) => request(`/api/guilds/${guildId}/security/lockdown`, { method: 'POST' }),
    unlock: (guildId) => request(`/api/guilds/${guildId}/security/unlock`, { method: 'POST' }),

    applyServiceVisibility: (guildId) => request(`/api/guilds/${guildId}/service/apply`, { method: 'POST' }),
    auditLog: (guildId) => request(`/api/guilds/${guildId}/auditlog`),
    stats: (guildId) => request(`/api/guilds/${guildId}/stats`),
    setRolePositions: (guildId, positions) => request(`/api/guilds/${guildId}/roles/positions`, { method: 'PATCH', body: JSON.stringify({ positions }) }),
    setChannelPositions: (guildId, positions) => request(`/api/guilds/${guildId}/channels/positions`, { method: 'PATCH', body: JSON.stringify({ positions }) }),
    setRoleColor: (guildId, roleId, color) => request(`/api/guilds/${guildId}/roles/${roleId}`, { method: 'PATCH', body: JSON.stringify({ color }) }),
    renameRole: (guildId, roleId, name) => request(`/api/guilds/${guildId}/roles/${roleId}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    setRolePermissions: (guildId, roleId, permissions) => request(`/api/guilds/${guildId}/roles/${roleId}`, { method: 'PATCH', body: JSON.stringify({ permissions }) }),
    deleteRole: (guildId, roleId) => request(`/api/guilds/${guildId}/roles/${roleId}`, { method: 'DELETE' }),
    aiConfig: (guildId) => request(`/api/guilds/${guildId}/aiconfig`),
    saveAiConfig: (guildId, provider, apiKey) => request(`/api/guilds/${guildId}/aiconfig`, { method: 'PUT', body: JSON.stringify({ provider, apiKey }) }),
    clearAiConfig: (guildId) => request(`/api/guilds/${guildId}/aiconfig`, { method: 'DELETE' }),
    aiChat: (guildId, messages, message) => request(`/api/guilds/${guildId}/aichat`, { method: 'POST', body: JSON.stringify({ messages, message }) }),
    aiHistory: (guildId) => request(`/api/guilds/${guildId}/aichat/history`),
    saveAiHistory: (guildId, messages) => request(`/api/guilds/${guildId}/aichat/history`, { method: 'PUT', body: JSON.stringify({ messages }) }),
    clearAiHistory: (guildId) => request(`/api/guilds/${guildId}/aichat/history`, { method: 'DELETE' }),
    // Variante streaming (roadmap n°066) : fetch dedie car request() attend
    // un corps JSON complet. Parse le flux SSE et relaie les events delta
    // (texte au fil de l'eau) et tool (outil en cours) aux handlers ;
    // retourne l'event done final { messages, pendingConfirmation }.
    aiChatStream: async (guildId, messages, message, handlers = {}) => {
      const res = await fetch(`${window.API_BASE_URL}/api/guilds/${guildId}/aichat/stream`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, message }),
      });
      if (!res.ok || !res.body) {
        let msg = `Erreur ${res.status}`;
        try { msg = (await res.json()).error || msg; } catch { /* corps non JSON */ }
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const raw = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const line = raw.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          let evt;
          try { evt = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (evt.type === 'delta') handlers.onDelta?.(evt.text);
          else if (evt.type === 'tool') handlers.onTool?.(evt.name);
          else if (evt.type === 'error') throw new Error(evt.error);
          else if (evt.type === 'done') finalResult = evt;
        }
      }
      if (!finalResult) throw new Error('Flux IA interrompu. Reessaie.');
      return finalResult;
    },
    aiChatConfirm: (guildId, messages, pendingConfirmation, confirmed) => request(`/api/guilds/${guildId}/aichat/confirm`, { method: 'POST', body: JSON.stringify({ messages, pendingConfirmation, confirmed }) }),
    postPanel: (guildId, key, channelId) => request(`/api/guilds/${guildId}/panels/${key}`, { method: 'POST', body: JSON.stringify({ channelId }) }),
    embedTemplates: (guildId) => request(`/api/guilds/${guildId}/embedtemplates`),
    saveEmbedTemplate: (guildId, name, embed) => request(`/api/guilds/${guildId}/embedtemplates`, { method: 'POST', body: JSON.stringify({ name, embed }) }),
    deleteEmbedTemplate: (guildId, templateId) => request(`/api/guilds/${guildId}/embedtemplates/${templateId}`, { method: 'DELETE' }),
    reactionRoleGroups: (guildId) => request(`/api/guilds/${guildId}/reactionroles`),
    createReactionRoleGroup: (guildId, payload) => request(`/api/guilds/${guildId}/reactionroles`, { method: 'POST', body: JSON.stringify(payload) }),
    deleteReactionRoleGroup: (guildId, groupId) => request(`/api/guilds/${guildId}/reactionroles/${groupId}`, { method: 'DELETE' }),
    postEmbed: (guildId, channelId, embeds, content, buttons) => request(`/api/guilds/${guildId}/panels/embed`, { method: 'POST', body: JSON.stringify({ channelId, embeds, content, buttons }) }),
    // Variante multipart (roadmap n°001) : images locales jointes au message.
    // fetch dedie : request() force Content-Type JSON, le multipart doit
    // laisser le navigateur poser le boundary.
    postEmbedWithFiles: async (guildId, channelId, embeds, content, buttons, files) => {
      const fd = new FormData();
      fd.append('payload', JSON.stringify({ channelId, embeds, content, buttons }));
      files.slice(0, 4).forEach((f, i) => fd.append(`file${i}`, f.file, f.filename));
      const res = await fetch(`${window.API_BASE_URL}/api/guilds/${guildId}/panels/embed`, {
        method: 'POST', credentials: 'include', body: fd,
      });
      let body = null;
      const text = await res.text();
      if (text) { try { body = JSON.parse(text); } catch { body = text; } }
      if (!res.ok) throw new Error((body && body.error) || `Erreur ${res.status}`);
      return body;
    },
    embedHistory: (guildId) => request(`/api/guilds/${guildId}/embed-history`),
    getMessage: (guildId, channelId, messageId) => request(`/api/guilds/${guildId}/messages/${channelId}/${messageId}`),
    editEmbedMessage: (guildId, channelId, messageId, embeds, content) => request(`/api/guilds/${guildId}/messages/${channelId}/${messageId}`, { method: 'PATCH', body: JSON.stringify({ embeds, content }) }),
    createMemberCountChannel: (guildId, nameTemplate) => request(`/api/guilds/${guildId}/membercount`, { method: 'POST', body: JSON.stringify({ nameTemplate }) }),
    botStatus: () => request('/api/botstatus'),
    shopItems: (guildId) => request(`/api/guilds/${guildId}/shop`),
    addShopItem: (guildId, payload) => request(`/api/guilds/${guildId}/shop`, { method: 'POST', body: JSON.stringify(payload) }),
    deleteShopItem: (guildId, itemId) => request(`/api/guilds/${guildId}/shop/${itemId}`, { method: 'DELETE' }),
    economyAccounts: (guildId) => request(`/api/guilds/${guildId}/economy`),
    templates: () => request('/api/templates'),
    saveTemplate: (name, sourceGuildId) => request('/api/templates', { method: 'POST', body: JSON.stringify({ name, sourceGuildId }) }),
    deleteTemplate: (templateId) => request(`/api/templates/${templateId}`, { method: 'DELETE' }),
    templatePreview: (key) => request(`/api/templates/${encodeURIComponent(key)}/preview`),
    generateServer: (guildId, templateKey, reglementText) => request(`/api/guilds/${guildId}/generate`, { method: 'POST', body: JSON.stringify({ templateKey, reglementText }) }),
    generationProgress: (guildId) => request(`/api/guilds/${guildId}/generation`),
    customCommands: (guildId) => request(`/api/guilds/${guildId}/customcommands`),
    addCustomCommand: (guildId, payload) => request(`/api/guilds/${guildId}/customcommands`, { method: 'POST', body: JSON.stringify(payload) }),
    deleteCustomCommand: (guildId, cmdId) => request(`/api/guilds/${guildId}/customcommands/${cmdId}`, { method: 'DELETE' }),
  };
}());

// action optionnelle (roadmap n°114) : { label, onClick } ajoute un bouton
// dans le toast (ex. « Voir » qui scrolle jusqu'a l'element cree).
window.showToast = function showToast(message, type = 'success', action = null) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'error' ? '⚠' : '✓';
  const safeMessage = window.escapeHtml ? window.escapeHtml(message) : String(message ?? '');
  toast.innerHTML = `<span class="toast-icon" aria-hidden="true">${icon}</span><span>${safeMessage}</span>`;
  if (action && action.label && typeof action.onClick === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-undo-btn';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      action.onClick();
      toast.classList.add('leaving');
      setTimeout(() => toast.remove(), 220);
    });
    toast.appendChild(btn);
  }
  toast.setAttribute('role', 'status');
  document.body.appendChild(toast);
  window.UISound?.[type === 'error' ? 'error' : 'success']?.();

  // Plusieurs toasts a la suite ne doivent pas se superposer a la meme
  // position fixe : on empile par-dessus les toasts encore visibles.
  const reflow = () => {
    let offset = 90;
    document.querySelectorAll('.toast:not(.leaving)').forEach((t) => {
      t.style.bottom = `${offset}px`;
      offset += t.offsetHeight + 10;
    });
  };
  reflow();

  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => { toast.remove(); reflow(); }, 220);
  }, 4000);
};

// Toast avec compte a rebours et bouton Annuler (roadmap n°011) : onExpire
// n'est appele qu'a la fin du delai, sauf clic sur Annuler (onUndo).
window.showUndoToast = function showUndoToast(message, { onUndo, onExpire, seconds = 8 } = {}) {
  const toast = document.createElement('div');
  toast.className = 'toast undo';
  const safeMessage = window.escapeHtml ? window.escapeHtml(message) : String(message ?? '');
  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">🗑</span>
    <span>${safeMessage} <strong class="toast-count">${seconds}s</strong></span>
    <button type="button" class="toast-undo-btn">Annuler</button>`;
  toast.setAttribute('role', 'status');
  document.body.appendChild(toast);

  const reflow = () => {
    let offset = 90;
    document.querySelectorAll('.toast:not(.leaving)').forEach((t) => {
      t.style.bottom = `${offset}px`;
      offset += t.offsetHeight + 10;
    });
  };
  reflow();

  let remaining = seconds;
  const countEl = toast.querySelector('.toast-count');
  const tick = setInterval(() => {
    remaining -= 1;
    if (remaining >= 0) countEl.textContent = `${remaining}s`;
  }, 1000);
  const close = () => {
    clearInterval(tick);
    clearTimeout(expireTimer);
    toast.classList.add('leaving');
    setTimeout(() => { toast.remove(); reflow(); }, 220);
  };
  const expireTimer = setTimeout(() => { close(); onExpire?.(); }, seconds * 1000);
  toast.querySelector('.toast-undo-btn').addEventListener('click', () => { close(); onUndo?.(); });
};
