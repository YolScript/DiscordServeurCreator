window.Api = (function api() {
  async function request(path, options = {}) {
    const res = await fetch(`${window.API_BASE_URL}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });

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
    createRole: (guildId, name, color) => request(`/api/guilds/${guildId}/roles`, { method: 'POST', body: JSON.stringify({ name, color }) }),
    config: (guildId) => request(`/api/guilds/${guildId}/config`),
    updateConfig: (guildId, patch) => request(`/api/guilds/${guildId}/config`, { method: 'PATCH', body: JSON.stringify(patch) }),
    gameRoles: (guildId) => request(`/api/guilds/${guildId}/gameroles`),
    gameRoleCatalog: () => request('/api/game-role-catalog'),
    addPresetGameRole: (guildId, gameKey) => request(`/api/guilds/${guildId}/gameroles/preset`, { method: 'POST', body: JSON.stringify({ gameKey }) }),
    renameGameRole: (guildId, roleId, displayName) => request(`/api/guilds/${guildId}/gameroles/${roleId}`, { method: 'PATCH', body: JSON.stringify({ displayName }) }),
    deleteGameRole: (guildId, roleId) => request(`/api/guilds/${guildId}/gameroles/${roleId}`, { method: 'DELETE' }),
    bulkPermissions: (guildId, payload) => request(`/api/guilds/${guildId}/permissions/bulk`, { method: 'POST', body: JSON.stringify(payload) }),
    exportPermissions: (guildId, channelId) => request(`/api/guilds/${guildId}/permissions/export?channelId=${channelId}`),
    importPermissions: (guildId, channelId, permissionOverwrites) => request(`/api/guilds/${guildId}/permissions/import`, { method: 'POST', body: JSON.stringify({ channelId, permissionOverwrites }) }),
    createChannel: (guildId, name, type, categoryId) => request(`/api/guilds/${guildId}/channels`, { method: 'POST', body: JSON.stringify({ name, type, categoryId }) }),
    createCategory: (guildId, name) => request(`/api/guilds/${guildId}/categories`, { method: 'POST', body: JSON.stringify({ name }) }),
    resetRoleDefault: (guildId, roleKey) => request(`/api/guilds/${guildId}/roles/${roleKey}/reset-default`, { method: 'POST' }),
    renameChannel: (guildId, channelId, name) => request(`/api/guilds/${guildId}/channels/${channelId}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    deleteChannel: (guildId, channelId) => request(`/api/guilds/${guildId}/channels/${channelId}`, { method: 'DELETE' }),

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
    setRoleColor: (guildId, roleId, color) => request(`/api/guilds/${guildId}/roles/${roleId}`, { method: 'PATCH', body: JSON.stringify({ color }) }),
    postPanel: (guildId, key, channelId) => request(`/api/guilds/${guildId}/panels/${key}`, { method: 'POST', body: JSON.stringify({ channelId }) }),
    embedTemplates: (guildId) => request(`/api/guilds/${guildId}/embedtemplates`),
    saveEmbedTemplate: (guildId, name, embed) => request(`/api/guilds/${guildId}/embedtemplates`, { method: 'POST', body: JSON.stringify({ name, embed }) }),
    deleteEmbedTemplate: (guildId, templateId) => request(`/api/guilds/${guildId}/embedtemplates/${templateId}`, { method: 'DELETE' }),
    reactionRoleGroups: (guildId) => request(`/api/guilds/${guildId}/reactionroles`),
    createReactionRoleGroup: (guildId, payload) => request(`/api/guilds/${guildId}/reactionroles`, { method: 'POST', body: JSON.stringify(payload) }),
    deleteReactionRoleGroup: (guildId, groupId) => request(`/api/guilds/${guildId}/reactionroles/${groupId}`, { method: 'DELETE' }),
    postEmbed: (guildId, channelId, embeds, content) => request(`/api/guilds/${guildId}/panels/embed`, { method: 'POST', body: JSON.stringify({ channelId, embeds, content }) }),
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
    customCommands: (guildId) => request(`/api/guilds/${guildId}/customcommands`),
    addCustomCommand: (guildId, payload) => request(`/api/guilds/${guildId}/customcommands`, { method: 'POST', body: JSON.stringify(payload) }),
    deleteCustomCommand: (guildId, cmdId) => request(`/api/guilds/${guildId}/customcommands/${cmdId}`, { method: 'DELETE' }),
  };
}());

window.showToast = function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  window.UISound?.[type === 'error' ? 'error' : 'success']?.();
  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 220);
  }, 4000);
};
