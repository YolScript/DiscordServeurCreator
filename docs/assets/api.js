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
    channelPresets: () => request('/api/channel-presets'),
    addPresetChannel: (guildId, presetKey, categoryId) => request(`/api/guilds/${guildId}/channels/preset`, { method: 'POST', body: JSON.stringify({ presetKey, categoryId }) }),
    categoryPresets: () => request('/api/category-presets'),
    addPresetCategory: (guildId, presetKey) => request(`/api/guilds/${guildId}/categories/preset`, { method: 'POST', body: JSON.stringify({ presetKey }) }),
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
  };
}());

window.showToast = function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
};
