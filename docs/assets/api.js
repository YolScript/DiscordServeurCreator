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
    renameGameRole: (guildId, roleId, displayName) => request(`/api/guilds/${guildId}/gameroles/${roleId}`, { method: 'PATCH', body: JSON.stringify({ displayName }) }),
    deleteGameRole: (guildId, roleId) => request(`/api/guilds/${guildId}/gameroles/${roleId}`, { method: 'DELETE' }),
    bulkPermissions: (guildId, payload) => request(`/api/guilds/${guildId}/permissions/bulk`, { method: 'POST', body: JSON.stringify(payload) }),
    exportPermissions: (guildId, channelId) => request(`/api/guilds/${guildId}/permissions/export?channelId=${channelId}`),
    importPermissions: (guildId, channelId, permissionOverwrites) => request(`/api/guilds/${guildId}/permissions/import`, { method: 'POST', body: JSON.stringify({ channelId, permissionOverwrites }) }),
    channelPresets: () => request('/api/channel-presets'),
    addPresetChannel: (guildId, presetKey, categoryId) => request(`/api/guilds/${guildId}/channels/preset`, { method: 'POST', body: JSON.stringify({ presetKey, categoryId }) }),
    resetRoleDefault: (guildId, roleKey) => request(`/api/guilds/${guildId}/roles/${roleKey}/reset-default`, { method: 'POST' }),
  };
}());

window.showToast = function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
};
