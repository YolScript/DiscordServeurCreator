const app = document.getElementById('app');
const railEl = document.getElementById('rail');
const sidebarEl = document.getElementById('sidebar');
const searchBox = document.getElementById('search-box');
const searchInput = document.getElementById('search-input');

const params = new URLSearchParams(location.search);
const guildId = params.get('guild');

let allGuilds = [];

// Bit Discord de chaque permission (cf. discord-api-types PermissionFlagsBits),
// duplique cote dashboard pour decoder role.permissions sans lib externe.
const PERMISSION_BITS = {
  CreateInstantInvite: 1n << 0n,
  KickMembers: 1n << 1n,
  BanMembers: 1n << 2n,
  Administrator: 1n << 3n,
  ManageChannels: 1n << 4n,
  ManageGuild: 1n << 5n,
  AddReactions: 1n << 6n,
  ViewAuditLog: 1n << 7n,
  ViewChannel: 1n << 10n,
  SendMessages: 1n << 11n,
  ManageMessages: 1n << 13n,
  EmbedLinks: 1n << 14n,
  AttachFiles: 1n << 15n,
  ReadMessageHistory: 1n << 16n,
  MentionEveryone: 1n << 17n,
  Connect: 1n << 20n,
  Speak: 1n << 21n,
  MuteMembers: 1n << 22n,
  DeafenMembers: 1n << 23n,
  MoveMembers: 1n << 24n,
  ChangeNickname: 1n << 26n,
  ManageNicknames: 1n << 27n,
  ManageRoles: 1n << 28n,
  ManageWebhooks: 1n << 29n,
  ModerateMembers: 1n << 40n,
};

const PERMISSION_LABELS = {
  CreateInstantInvite: 'Creer une invitation', KickMembers: 'Expulser des membres', BanMembers: 'Bannir des membres',
  Administrator: 'Administrateur (toutes permissions)', ManageChannels: 'Gerer les salons', ManageGuild: 'Gerer le serveur',
  AddReactions: 'Ajouter des reactions', ViewAuditLog: "Voir le registre d'audit", ViewChannel: 'Voir le salon',
  SendMessages: 'Envoyer des messages', ManageMessages: 'Gerer les messages', EmbedLinks: 'Integrer des liens',
  AttachFiles: 'Joindre des fichiers', ReadMessageHistory: "Voir l'historique", MentionEveryone: 'Mentionner @everyone',
  Connect: 'Se connecter (vocal)', Speak: 'Parler (vocal)', MuteMembers: 'Reduire au silence', DeafenMembers: 'Rendre sourd',
  MoveMembers: 'Deplacer des membres', ChangeNickname: 'Changer de pseudo', ManageNicknames: 'Gerer les pseudos',
  ManageRoles: 'Gerer les roles', ManageWebhooks: 'Gerer les webhooks', ModerateMembers: 'Moderer (timeout)',
};

function decodeRolePermissions(permStr) {
  const mask = BigInt(permStr || '0');
  if (mask & PERMISSION_BITS.Administrator) return ['Administrateur (toutes permissions)'];
  const names = Object.entries(PERMISSION_BITS)
    .filter(([, bit]) => mask & bit)
    .map(([name]) => PERMISSION_LABELS[name] || name);
  return names;
}

const PERMISSION_PRESETS = [
  {
    key: 'visible', label: '👁️ Rendre visible (lecture seule)', allow: ['ViewChannel', 'ReadMessageHistory'], deny: [],
  },
  {
    key: 'hidden', label: '🚫 Masquer completement', allow: [], deny: ['ViewChannel'],
  },
  {
    key: 'write', label: '✍️ Autoriser a ecrire', allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'], deny: [],
  },
  {
    key: 'noWrite', label: "🔒 Bloquer l'ecriture", allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages'],
  },
  {
    key: 'voice', label: '🔊 Autoriser le vocal', allow: ['ViewChannel', 'Connect', 'Speak'], deny: [],
  },
  {
    key: 'staff', label: '🛡️ Acces complet (staff)', allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'Connect', 'Speak', 'ManageMessages'], deny: [],
  },
  {
    key: 'neutral', label: '↩️ Retirer la regle (neutre)', allow: [], deny: [],
  },
];

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function guildIconUrl(g) {
  return g.icon ? `https://cdn.discordapp.com/icons/${g.guildId}/${g.icon}.png?size=64` : null;
}

function initials(name) {
  return (name || '?').trim().slice(0, 2).toUpperCase();
}

/* ---------- Collapsible sections ---------- */

function sectionHtml(title, bodyHtml, { hint = '', open = false } = {}) {
  return `
    <div class="section${open ? '' : ' collapsed'}">
      <button class="section-header" type="button">
        <span>${escapeHtml(title)}${hint ? `<span class="section-hint">${escapeHtml(hint)}</span>` : ''}</span>
        <span class="chevron">▾</span>
      </button>
      <div class="section-body">${bodyHtml}</div>
    </div>
  `;
}

function wireSections(container) {
  container.querySelectorAll('.section-header').forEach((header) => {
    header.addEventListener('click', () => header.closest('.section').classList.toggle('collapsed'));
  });
}

/* ---------- Rail (guild switcher) ---------- */

function renderRail() {
  const managed = allGuilds.filter((g) => g.botPresent && g.configured);
  railEl.innerHTML = `
    <a href="app.html" title="Tes serveurs">
      <img class="brand-icon" src="assets/logo-512.png" alt="Accueil" style="width:36px;height:36px;border-radius:11px;" />
    </a>
    <div class="rail-divider"></div>
    ${managed.map((g) => {
      const icon = guildIconUrl(g);
      const active = g.guildId === guildId;
      return `
        <button class="rail-guild${active ? ' active' : ''}" data-guild="${g.guildId}" title="${escapeHtml(g.name)}">
          ${icon ? `<img src="${icon}" alt="" />` : escapeHtml(initials(g.name))}
        </button>`;
    }).join('')}
  `;
  railEl.querySelectorAll('.rail-guild').forEach((btn) => {
    btn.addEventListener('click', () => { location.href = `app.html?guild=${btn.dataset.guild}`; });
  });
}

/* ---------- Sidebar ---------- */

function renderSidebarForList() {
  sidebarEl.style.display = '';
  sidebarEl.innerHTML = `
    <div class="sidebar-header">
      <img src="assets/logo-512.png" alt="" />
      <div class="sidebar-header-text">
        <div class="name">Tes serveurs</div>
        <div class="sub">${allGuilds.length} serveur(s)</div>
      </div>
    </div>
    <nav class="nav"></nav>
  `;
}

function renderSidebarForGuild() {
  sidebarEl.style.display = 'none';
  sidebarEl.innerHTML = '';
}

/* ---------- Pages: guild list ---------- */

async function renderGuildList() {
  searchBox.style.display = '';
  const rows = (list) => list.map((g) => {
    let badge = '<span class="badge not-invited">Bot absent</span>';
    let action = `<a class="btn secondary" href="${g.inviteUrl}" target="_blank" rel="noopener">Inviter le bot</a>`;
    if (g.botPresent) {
      badge = g.configured
        ? '<span class="badge configured">Configure</span>'
        : '<span class="badge not-configured">A configurer (/setup)</span>';
      action = g.configured
        ? `<a class="btn" href="app.html?guild=${g.guildId}">Gerer</a>`
        : '<span class="muted">Lance /setup dans Discord</span>';
    }
    return `
      <div class="guild-row">
        <div>
          <div class="name">${escapeHtml(g.name || g.guildId)}</div>
          ${badge}
        </div>
        ${action}
      </div>`;
  }).join('');

  function paint(filterText) {
    const filtered = filterText
      ? allGuilds.filter((g) => (g.name || '').toLowerCase().includes(filterText.toLowerCase()))
      : allGuilds;
    app.innerHTML = `
      <div class="inner">
        <div class="card">
          <h2>Tes serveurs</h2>
          <p class="muted">Serveurs Discord ou tu es administrateur.</p>
          <div class="guild-list">${rows(filtered) || '<p class="muted">Aucun serveur trouve.</p>'}</div>
        </div>
      </div>
    `;
  }

  paint('');
  searchInput.oninput = () => paint(searchInput.value);
}

/* ---------- Pages: apercu (preview interactif) ---------- */

function findOverwrite(channel, roleId) {
  return (channel.permission_overwrites || []).find((o) => o.id === roleId);
}

function isViewAllowed(channel, roleId) {
  const ow = findOverwrite(channel, roleId);
  if (!ow) return null;
  const VIEW_CHANNEL = 1024n;
  if (BigInt(ow.allow || '0') & VIEW_CHANNEL) return true;
  if (BigInt(ow.deny || '0') & VIEW_CHANNEL) return false;
  return null;
}

const SETTINGS_PANELS = [
  { key: 'permissions', label: 'Permissions' },
  { key: 'jeux', label: 'Roles de jeu' },
  { key: 'automatisations', label: 'Automatisations' },
  { key: 'securite', label: 'Securite' },
];

function customChannelFormHtml(catId) {
  return `
    <div class="dp-custom-form" data-form-for="${catId}" style="display:none;">
      <input type="text" class="dp-custom-name" placeholder="Nom du salon" maxlength="80" />
      <select class="dp-custom-type">
        <option value="text">Texte</option>
        <option value="voice">Vocal</option>
      </select>
      <button type="button" class="btn secondary dp-custom-create" data-cat="${catId}">Creer</button>
    </div>`;
}

function roleColorDot(role) {
  const hex = role.color ? `#${role.color.toString(16).padStart(6, '0')}` : '#99aab5';
  return `<span class="dp-role-dot" style="background:${hex}"></span>`;
}

function roleRowHtml(role, members) {
  const memberNames = role.name === '@everyone'
    ? members.map((m) => m.displayName)
    : members.filter((m) => (m.roles || []).includes(role.id)).map((m) => m.displayName);
  const perms = decodeRolePermissions(role.permissions);
  return `
    <div class="dp-role-row" data-role="${role.id}">
      <div class="dp-role-summary">
        ${roleColorDot(role)}
        <span class="dp-role-name">${escapeHtml(role.name)}</span>
        <span class="dp-role-count">${memberNames.length}</span>
      </div>
      <div class="dp-role-detail">
        <p class="dp-role-detail-title">Permissions</p>
        <p class="muted">${perms.length ? escapeHtml(perms.join(', ')) : 'Aucune permission particuliere'}</p>
        <p class="dp-role-detail-title">Membres (${memberNames.length})</p>
        <p class="muted">${memberNames.length ? escapeHtml(memberNames.join(', ')) : 'Aucun membre'}</p>
      </div>
    </div>`;
}

async function renderPreviewPage(id) {
  app.innerHTML = '<p class="muted">Chargement...</p>';
  const guild = allGuilds.find((g) => g.guildId === id);
  const [channels, config, roles, members] = await Promise.all([
    Api.channels(id),
    Api.config(id),
    Api.roles(id).catch(() => []),
    Api.members(id).catch(() => []),
  ]);
  const rolesSorted = [...roles].sort((a, b) => b.position - a.position);

  const categories = channels.filter((c) => c.type === 4).sort((a, b) => a.position - b.position);
  const uncategorized = channels.filter((c) => c.type !== 4 && !c.parent_id);
  const channelIcon = (c) => (c.type === 2 ? '🔊' : c.type === 4 ? '' : '#');

  const channelRow = (c) => `
    <div class="dp-channel" data-channel="${c.id}" data-name="${escapeHtml(c.name)}" data-type="${c.type}">
      <span class="hash">${channelIcon(c)}</span> ${escapeHtml(c.name)}
    </div>`;

  const categoryBlock = (cat) => {
    const children = channels.filter((c) => c.parent_id === cat.id).sort((a, b) => a.position - b.position);
    return `
      <div class="dp-category" data-cat="${cat.id}"><span class="chevron">▾</span> ${escapeHtml(cat.name)}</div>
      <div class="dp-channels">
        ${children.map(channelRow).join('')}
        <button type="button" class="dp-add-channel" data-add-cat="${cat.id}">+ Ajouter un salon</button>
        ${customChannelFormHtml(cat.id)}
      </div>
    `;
  };

  const guildIcon = guild ? guildIconUrl(guild) : null;

  app.innerHTML = `
    <div class="inner fill" style="max-width:none;">
      <div class="discord-preview" style="position:relative;">
        <button type="button" class="btn secondary dp-fullscreen-btn" id="dp-fullscreen-btn">⛶ Plein ecran</button>
        <div class="dp-sidebar">
          <div class="dp-server-header">
            <span class="name">${escapeHtml(guild?.name || 'Serveur')}</span>
            <span class="caret">▾</span>
          </div>
          <div class="dp-channel-list">
            <div class="dp-settings-group">
              <div class="dp-category" data-cat="__settings"><span class="chevron">▾</span> Parametres</div>
              <div class="dp-channels">
                ${SETTINGS_PANELS.map((p) => `<div class="dp-channel" data-settings="${p.key}"><span class="hash">⚙</span> ${escapeHtml(p.label)}</div>`).join('')}
              </div>
            </div>
            <button type="button" class="dp-add-category" id="dp-add-cat-btn">+ Nouvelle categorie</button>
            <div class="dp-custom-form" data-form-for="__category" style="display:none;">
              <input type="text" class="dp-custom-name" id="dp-new-cat-name" placeholder="Nom de la categorie" maxlength="80" />
              <button type="button" class="btn secondary" id="dp-create-cat-btn">Creer</button>
            </div>
            ${uncategorized.map(channelRow).join('')}
            <button type="button" class="dp-add-channel" data-add-cat="">+ Ajouter un salon</button>
            ${customChannelFormHtml('')}
            ${categories.map(categoryBlock).join('')}
          </div>
        </div>
        <div class="dp-main" id="dp-main">
          <div class="dp-welcome">
            <div class="dp-welcome-icon">${guildIcon ? `<img src="${guildIcon}" alt="" />` : escapeHtml(initials(guild?.name))}</div>
            <h3>${escapeHtml(guild?.name || 'Ton serveur')}</h3>
            <p>Selectionne un salon ou un parametre a gauche pour le configurer.</p>
          </div>
        </div>
        <div class="dp-roles-panel">
          <div class="dp-roles-header">Roles — ${rolesSorted.length}</div>
          <div class="dp-roles-list">${rolesSorted.map((r) => roleRowHtml(r, members)).join('')}</div>
        </div>
      </div>
    </div>
  `;

  const previewEl = app.querySelector('.discord-preview');
  const fsBtn = document.getElementById('dp-fullscreen-btn');
  fsBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      previewEl.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  });
  document.onfullscreenchange = () => {
    fsBtn.textContent = document.fullscreenElement === previewEl ? '⤢ Quitter le plein ecran' : '⛶ Plein ecran';
  };

  app.querySelectorAll('.dp-category').forEach((catEl) => {
    catEl.addEventListener('click', () => catEl.classList.toggle('collapsed'));
  });

  app.querySelectorAll('.dp-role-row').forEach((row) => {
    row.querySelector('.dp-role-summary').addEventListener('click', () => row.classList.toggle('expanded'));
  });

  app.querySelectorAll('.dp-channel[data-channel]').forEach((chEl) => {
    chEl.addEventListener('click', () => {
      app.querySelectorAll('.dp-channel').forEach((el) => el.classList.remove('selected'));
      chEl.classList.add('selected');
      renderChannelPanel(id, chEl.dataset.channel, chEl.dataset.name, Number(chEl.dataset.type), config, channels);
    });
  });

  app.querySelectorAll('.dp-channel[data-settings]').forEach((el) => {
    el.addEventListener('click', () => {
      app.querySelectorAll('.dp-channel').forEach((e) => e.classList.remove('selected'));
      el.classList.add('selected');
      renderSettingsPanel(id, el.dataset.settings);
    });
  });

  document.getElementById('dp-add-cat-btn').addEventListener('click', () => {
    const form = app.querySelector('.dp-custom-form[data-form-for="__category"]');
    form.style.display = form.style.display === 'none' ? 'flex' : 'none';
  });
  document.getElementById('dp-create-cat-btn').addEventListener('click', async () => {
    const name = document.getElementById('dp-new-cat-name').value.trim();
    if (!name) { showToast('Nom requis.', 'error'); return; }
    try {
      await Api.createCategory(id, name);
      showToast('Categorie creee.');
      await renderPreviewPage(id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  app.querySelectorAll('.dp-add-channel').forEach((btn) => {
    btn.addEventListener('click', () => {
      const form = app.querySelector(`.dp-custom-form[data-form-for="${btn.dataset.addCat}"]`);
      if (form) form.style.display = form.style.display === 'none' ? 'flex' : 'none';
    });
  });

  app.querySelectorAll('.dp-custom-create').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const form = btn.closest('.dp-custom-form');
      const name = form.querySelector('.dp-custom-name').value.trim();
      const type = form.querySelector('.dp-custom-type').value;
      if (!name) { showToast('Nom requis.', 'error'); return; }
      try {
        await Api.createChannel(id, name, type, btn.dataset.cat || undefined);
        showToast('Salon cree.');
        await renderPreviewPage(id);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

function renderSettingsPanel(guildId, key) {
  const main = document.getElementById('dp-main');
  const panel = SETTINGS_PANELS.find((p) => p.key === key);
  main.innerHTML = `
    <div class="dp-channel-header"><span class="hash">⚙</span> ${escapeHtml(panel?.label || key)}</div>
    <div class="dp-main-body" id="dp-settings-body"></div>
  `;
  const body = document.getElementById('dp-settings-body');
  const renderers = {
    permissions: () => renderPermissionsPage(guildId, body),
    jeux: () => renderGameRolesPage(guildId, body),
    automatisations: () => renderAutomationsPage(guildId, body),
    securite: () => renderSecurityPage(guildId, body),
  };
  renderers[key]?.();
}

function contextualChannelSettingsHtml(channelId, config) {
  if (config?.rulesChannelId && config.rulesChannelId === channelId) {
    return `
      <div class="dp-block">
        <p class="dp-block-title">📜 Reglement</p>
        <label>Texte du reglement</label>
        <textarea id="dp-ctx-reglement">${escapeHtml(config?.reglementText)}</textarea>
        <div class="dp-toggle-row" style="margin-top:8px;">
          <span>Verification anti-bot (captcha emoji) avant validation</span>
          <input type="checkbox" id="dp-ctx-captcha" ${config?.captchaEnabled === false ? '' : 'checked'} />
        </div>
        <div class="row" style="margin-top:12px;">
          <button class="btn secondary" id="dp-ctx-save-reglement">Enregistrer le reglement</button>
          <button class="btn secondary" id="dp-ctx-repost-reglement">🔁 Reposter l'embed</button>
        </div>
      </div>`;
  }
  if (config?.arrivalDepartureChannelId && config.arrivalDepartureChannelId === channelId) {
    return `
      <div class="dp-block">
        <p class="dp-block-title">👋 Messages bienvenue / depart</p>
        <label>Message de bienvenue</label>
        <textarea id="dp-ctx-welcome">${escapeHtml(config?.welcomeMessageTemplate)}</textarea>
        <label>Message de depart</label>
        <textarea id="dp-ctx-leave">${escapeHtml(config?.leaveMessageTemplate)}</textarea>
        <p class="muted">Variables disponibles : {user} {username} {server} {membercount}</p>
        <button class="btn secondary" id="dp-ctx-save-welcome" style="margin-top:12px;">Enregistrer les messages</button>
      </div>`;
  }
  return '';
}

function channelPanelsBlockHtml(type) {
  if (type !== 0) return '';
  return `
    <div class="dp-block">
      <p class="dp-block-title">📋 Panneaux</p>
      <p class="muted" style="margin:0 0 10px;">Poste un panneau interactif dans ce salon.</p>
      <div class="row">
        <button class="btn secondary" id="dp-post-ticket-panel">🎫 Panneau tickets</button>
        <button class="btn secondary" id="dp-post-poll-panel">🗳️ Panneau sondage</button>
      </div>
    </div>`;
}

function specialChannelToggleHtml(channelId, type, config) {
  if (type !== 0) return '';
  const isRules = config?.rulesChannelId === channelId;
  const isArrival = config?.arrivalDepartureChannelId === channelId;
  return `
    <div class="dp-block">
      <p class="dp-block-title">🔧 Role special de ce salon</p>
      <div class="dp-toggle-row">
        <span>Salon Reglement</span>
        <input type="checkbox" id="dp-set-rules" ${isRules ? 'checked' : ''} />
      </div>
      <div class="dp-toggle-row" style="margin-top:8px;">
        <span>Salon Bienvenue / Depart</span>
        <input type="checkbox" id="dp-set-arrival" ${isArrival ? 'checked' : ''} />
      </div>
    </div>`;
}

function renderChannelPanel(guildId, channelId, name, type, config, channels) {
  const main = document.getElementById('dp-main');
  const channel = channels.find((c) => c.id === channelId);
  const icon = type === 2 ? '🔊' : type === 4 ? '📁' : '#';
  const currentlyVisible = config?.reglementValidatedRoleId
    ? isViewAllowed(channel, config.reglementValidatedRoleId)
    : null;

  main.innerHTML = `
    <div class="dp-panel">
      <div class="dp-panel-title">${icon} ${escapeHtml(name)}</div>

      <div class="dp-block">
        <p class="dp-block-title">Nom du salon</p>
        <input type="text" id="dp-rename" value="${escapeHtml(name)}" />
        <button class="btn" id="dp-save-name" style="margin-top:10px;">Enregistrer le nom</button>

        ${config?.reglementValidatedRoleId && type !== 4 ? `
          <div class="dp-toggle-row">
            <span>Visible pour "Reglement valide"</span>
            <input type="checkbox" id="dp-visible-toggle" ${currentlyVisible !== false ? 'checked' : ''} />
          </div>
        ` : ''}
      </div>

      ${specialChannelToggleHtml(channelId, type, config)}
      ${contextualChannelSettingsHtml(channelId, config)}
      ${channelPanelsBlockHtml(type)}

      <div class="dp-block danger">
        <p class="dp-block-title">Zone de danger</p>
        <p class="muted" style="margin:0 0 12px;">Cette action est irreversible.</p>
        <button class="btn danger" id="dp-delete">Supprimer ce salon</button>
      </div>
    </div>
  `;

  const saveReglementBtn = document.getElementById('dp-ctx-save-reglement');
  if (saveReglementBtn) {
    saveReglementBtn.addEventListener('click', async () => {
      try {
        await Api.updateConfig(guildId, {
          reglementText: document.getElementById('dp-ctx-reglement').value,
          captchaEnabled: document.getElementById('dp-ctx-captcha').checked,
        });
        showToast('Reglement enregistre.');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  const repostReglementBtn = document.getElementById('dp-ctx-repost-reglement');
  if (repostReglementBtn) {
    repostReglementBtn.addEventListener('click', async () => {
      try {
        await Api.postPanel(guildId, 'reglement');
        showToast('Reposte demande, actif sous quelques secondes.');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  const postTicketPanelBtn = document.getElementById('dp-post-ticket-panel');
  if (postTicketPanelBtn) {
    postTicketPanelBtn.addEventListener('click', async () => {
      try {
        await Api.postPanel(guildId, 'ticket', channelId);
        showToast('Panneau tickets demande, actif sous quelques secondes.');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  const postPollPanelBtn = document.getElementById('dp-post-poll-panel');
  if (postPollPanelBtn) {
    postPollPanelBtn.addEventListener('click', async () => {
      try {
        await Api.postPanel(guildId, 'poll', channelId);
        showToast('Panneau sondage demande, actif sous quelques secondes.');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  const saveWelcomeBtn = document.getElementById('dp-ctx-save-welcome');
  if (saveWelcomeBtn) {
    saveWelcomeBtn.addEventListener('click', async () => {
      try {
        await Api.updateConfig(guildId, {
          welcomeMessageTemplate: document.getElementById('dp-ctx-welcome').value,
          leaveMessageTemplate: document.getElementById('dp-ctx-leave').value,
        });
        showToast('Messages enregistres.');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  const setRulesToggle = document.getElementById('dp-set-rules');
  if (setRulesToggle) {
    setRulesToggle.addEventListener('change', async () => {
      try {
        config.rulesChannelId = setRulesToggle.checked ? channelId : null;
        await Api.updateConfig(guildId, { rulesChannelId: config.rulesChannelId });
        showToast('Salon reglement mis a jour.');
        renderChannelPanel(guildId, channelId, name, type, config, channels);
      } catch (err) {
        showToast(err.message, 'error');
        setRulesToggle.checked = !setRulesToggle.checked;
      }
    });
  }

  const setArrivalToggle = document.getElementById('dp-set-arrival');
  if (setArrivalToggle) {
    setArrivalToggle.addEventListener('change', async () => {
      try {
        config.arrivalDepartureChannelId = setArrivalToggle.checked ? channelId : null;
        await Api.updateConfig(guildId, { arrivalDepartureChannelId: config.arrivalDepartureChannelId });
        showToast('Salon bienvenue/depart mis a jour.');
        renderChannelPanel(guildId, channelId, name, type, config, channels);
      } catch (err) {
        showToast(err.message, 'error');
        setArrivalToggle.checked = !setArrivalToggle.checked;
      }
    });
  }

  document.getElementById('dp-save-name').addEventListener('click', async () => {
    const value = document.getElementById('dp-rename').value.trim();
    if (!value) return;
    try {
      await Api.renameChannel(guildId, channelId, value);
      showToast('Salon renomme.');
      await renderPreviewPage(guildId);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  const toggle = document.getElementById('dp-visible-toggle');
  if (toggle) {
    toggle.addEventListener('change', async () => {
      try {
        await Api.bulkPermissions(guildId, {
          channelIds: [channelId],
          roleId: config.reglementValidatedRoleId,
          allow: toggle.checked ? ['ViewChannel'] : [],
          deny: toggle.checked ? [] : ['ViewChannel'],
        });
        showToast('Visibilite mise a jour.');
      } catch (err) {
        showToast(err.message, 'error');
        toggle.checked = !toggle.checked;
      }
    });
  }

  document.getElementById('dp-delete').addEventListener('click', async () => {
    if (!window.confirm(`Supprimer definitivement "${name}" ?`)) return;
    try {
      await Api.deleteChannel(guildId, channelId);
      showToast('Salon supprime.');
      await renderPreviewPage(guildId);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

/* ---------- Pages: permissions ---------- */

async function renderPermissionsPage(id, container = app) {
  container.innerHTML = '<p class="muted">Chargement...</p>';
  const [channels, roles] = await Promise.all([Api.channels(id), Api.roles(id)]);
  const editableChannels = channels.filter((c) => c.type === 0 || c.type === 2 || c.type === 4);
  const roleOptions = roles.filter((r) => r.name !== '@everyone').map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
  const channelCheckboxes = editableChannels.map((c) => `
    <label><input type="checkbox" value="${c.id}" class="perm-channel" /> ${c.type === 4 ? '📁' : c.type === 2 ? '🔊' : '#'} ${escapeHtml(c.name)}</label>
  `).join('');
  const presetOptions = PERMISSION_PRESETS.map((p) => `<option value="${p.key}">${escapeHtml(p.label)}</option>`).join('');
  const channelOptionsSimple = editableChannels.map((c) => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');

  container.innerHTML = `
    <div class="inner">
      ${sectionHtml('Edition en masse', `
        <p class="muted">Choisis les salons, le role, et une action rapide a appliquer partout en un clic.</p>
        <label>Salons</label>
        <div class="channel-picker">${channelCheckboxes}</div>
        <label>Role</label>
        <select id="perm-role">${roleOptions}</select>
        <label>Action</label>
        <select id="perm-preset">${presetOptions}</select>
        <button class="btn" id="apply-bulk" style="margin-top:12px;">Appliquer</button>
      `, { open: true })}

      ${sectionHtml('Export / Import (copier-coller)', `
        <label>Salon a exporter</label>
        <select id="export-channel">${channelOptionsSimple}</select>
        <button class="btn secondary" id="export-btn" style="margin-top:8px;">Exporter</button>
        <textarea id="export-output" placeholder="Le JSON exporte apparait ici, copie-le."></textarea>

        <label>Coller ici pour importer</label>
        <textarea id="import-input" placeholder="Colle ici le JSON exporte depuis un autre salon/serveur"></textarea>
        <label>Salon cible</label>
        <select id="import-channel">${channelOptionsSimple}</select>
        <button class="btn secondary" id="import-btn" style="margin-top:8px;">Importer</button>
      `)}

      ${sectionHtml('Permissions par defaut', `
        <p class="muted">Reinitialise les permissions du role au preset recommande (utile si elles ont ete modifiees par erreur).</p>
        <div class="row">
          <button class="btn secondary" id="reset-admin">Reinitialiser Administrateur</button>
          <button class="btn secondary" id="reset-mod">Reinitialiser Moderateur</button>
        </div>
      `)}
    </div>
  `;
  wireSections(container);

  document.getElementById('apply-bulk').addEventListener('click', async () => {
    const channelIds = [...container.querySelectorAll('.perm-channel:checked')].map((el) => el.value);
    const roleId = document.getElementById('perm-role').value;
    const preset = PERMISSION_PRESETS.find((p) => p.key === document.getElementById('perm-preset').value);
    if (channelIds.length === 0 || !roleId) {
      showToast('Choisis au moins un salon et un role.', 'error');
      return;
    }
    try {
      const results = await Api.bulkPermissions(id, { channelIds, roleId, allow: preset.allow, deny: preset.deny });
      const failed = results.filter((r) => !r.ok);
      showToast(failed.length ? `${failed.length} salon(s) en erreur.` : 'Permissions appliquees.', failed.length ? 'error' : 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('export-btn').addEventListener('click', async () => {
    try {
      const data = await Api.exportPermissions(id, document.getElementById('export-channel').value);
      document.getElementById('export-output').value = JSON.stringify(data.permissionOverwrites, null, 2);
      showToast('Export pret, copie le contenu.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('import-btn').addEventListener('click', async () => {
    try {
      const parsed = JSON.parse(document.getElementById('import-input').value);
      await Api.importPermissions(id, document.getElementById('import-channel').value, parsed);
      showToast('Import applique.');
    } catch (err) {
      showToast(err.message || 'JSON invalide.', 'error');
    }
  });

  document.getElementById('reset-admin').addEventListener('click', async () => {
    try {
      await Api.resetRoleDefault(id, 'administrateur');
      showToast('Role Administrateur reinitialise.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  document.getElementById('reset-mod').addEventListener('click', async () => {
    try {
      await Api.resetRoleDefault(id, 'moderateur');
      showToast('Role Moderateur reinitialise.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

/* ---------- Pages: roles de jeu ---------- */

async function renderGameRolesPage(id, container = app) {
  container.innerHTML = '<p class="muted">Chargement...</p>';
  const [roles, catalog] = await Promise.all([Api.gameRoles(id), Api.gameRoleCatalog()]);

  const rows = roles.map((r) => `
    <div class="game-role-row" data-role-id="${r.roleId}">
      <div class="row">
        <span class="swatch" style="background:${r.colorHex}"></span>
        <input type="text" value="${escapeHtml(r.displayName)}" class="rename-input" style="width:220px" />
      </div>
      <div class="row">
        <button class="btn secondary rename-btn">Renommer</button>
        <button class="btn danger delete-btn">Supprimer</button>
      </div>
    </div>
  `).join('');

  const existingKeys = new Set(roles.map((r) => r.gameKey));
  const available = catalog.filter((g) => !existingKeys.has(g.name.trim().toLowerCase()));
  const categories = [...new Set(available.map((g) => g.category))];
  const catalogHtml = categories.map((cat) => `
    <div class="muted" style="margin:10px 0 4px;font-weight:600;">${escapeHtml(cat)}</div>
    <div class="preset-grid">
      ${available.filter((g) => g.category === cat).map((g) => `<button class="preset-chip game-preset-chip" data-key="${g.key}"><span class="preset-chip-icon">${g.emoji || '🎮'}</span> ${escapeHtml(g.name)}</button>`).join('')}
    </div>
  `).join('') || '<p class="muted">Tous les jeux du catalogue sont deja ajoutes.</p>';

  container.innerHTML = `
    <div class="inner">
      ${sectionHtml('Catalogue de jeux pregeneres', `
        <p class="muted">Ajoute un role de jeu sans attendre qu'un membre soit detecte en train d'y jouer.</p>
        ${catalogHtml}
      `)}
      ${sectionHtml('Roles de jeu actifs', `
        <p class="muted">Generes automatiquement quand un membre est vu en train de jouer, ou ajoutes depuis le catalogue.</p>
        ${rows || '<p class="muted">Aucun role de jeu pour le moment.</p>'}
        <button class="btn secondary" id="force-roles-refresh" style="margin-top:12px;">🔁 Forcer la mise a jour du salon #roles</button>
      `, { open: true })}
    </div>
  `;
  wireSections(container);

  document.getElementById('force-roles-refresh').addEventListener('click', async () => {
    try {
      await Api.postPanel(id, 'roles');
      showToast('Mise a jour demandee, actif sous quelques secondes.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  container.querySelectorAll('.game-preset-chip').forEach((chip) => {
    chip.addEventListener('click', async () => {
      try {
        await Api.addPresetGameRole(id, chip.dataset.key);
        showToast('Role de jeu ajoute.');
        await renderGameRolesPage(id, container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  container.querySelectorAll('.rename-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.game-role-row');
      const roleId = row.dataset.roleId;
      const value = row.querySelector('.rename-input').value;
      try {
        await Api.renameGameRole(id, roleId, value);
        showToast('Role renomme.');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
  container.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.game-role-row');
      const roleId = row.dataset.roleId;
      if (!window.confirm('Supprimer ce role de jeu ?')) return;
      try {
        await Api.deleteGameRole(id, roleId);
        row.remove();
        showToast('Role supprime.');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

/* ---------- Pages: automatisations ---------- */

async function renderAutomationsPage(id, container = app) {
  container.innerHTML = '<p class="muted">Chargement...</p>';
  const [
    modConfig, roles, channels, levelRoles, referralRoles, referralCounts, streamers, scheduled, tickets, config,
  ] = await Promise.all([
    Api.modConfig(id), Api.roles(id), Api.channels(id), Api.levelRoles(id), Api.referralRoles(id),
    Api.referrals(id), Api.streamers(id), Api.scheduled(id), Api.tickets(id), Api.config(id),
  ]);

  const roleOptions = (selected) => roles.filter((r) => r.name !== '@everyone')
    .map((r) => `<option value="${r.id}" ${r.id === selected ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('');
  const textChannelOptions = channels.filter((c) => c.type === 0)
    .map((c) => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');
  const channelName = (cid) => {
    const c = channels.find((ch) => ch.id === cid);
    return c ? `#${c.name}` : cid;
  };
  const roleName = (rid) => roles.find((r) => r.id === rid)?.name || rid;

  const levelRoleRows = levelRoles.map((lr) => `
    <div class="row" data-level="${lr.level}" style="justify-content:space-between; margin-bottom:6px;">
      <span>Niveau ${lr.level} → ${escapeHtml(roleName(lr.roleId))}</span>
      <button class="btn danger delete-level-role" data-level="${lr.level}">Supprimer</button>
    </div>
  `).join('') || '<p class="muted">Aucun role de niveau configure.</p>';

  const referralRoleRows = referralRoles.map((rr) => `
    <div class="row" data-count="${rr.count}" style="justify-content:space-between; margin-bottom:6px;">
      <span>${rr.count} invitation(s) → ${escapeHtml(roleName(rr.roleId))}</span>
      <button class="btn danger delete-referral-role" data-count="${rr.count}">Supprimer</button>
    </div>
  `).join('') || '<p class="muted">Aucun role de parrainage configure.</p>';

  const leaderboard = Object.entries(referralCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const leaderboardRows = leaderboard.map(([userId, count]) => `
    <div class="row" style="justify-content:space-between; margin-bottom:4px;">
      <span class="muted">${escapeHtml(userId)}</span><span>${count}</span>
    </div>
  `).join('') || '<p class="muted">Aucune invitation suivie pour le moment.</p>';

  const streamerRows = streamers.map((s) => `
    <div class="row" data-user="${s.discordUserId}" data-platform="${s.platform}" style="justify-content:space-between; margin-bottom:6px;">
      <span>${escapeHtml(s.platform)} : ${escapeHtml(s.identifier)} <span class="muted">(${escapeHtml(s.discordUserId)})</span></span>
      <button class="btn danger delete-streamer" data-user="${s.discordUserId}" data-platform="${s.platform}">Supprimer</button>
    </div>
  `).join('') || '<p class="muted">Aucun streamer lie.</p>';

  const scheduledRows = scheduled.map((t) => `
    <div class="row" data-id="${t.id}" style="justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
      <span>${channelName(t.channelId)} — ${new Date(t.runAt).toLocaleString('fr-FR')}${t.repeatIntervalMs === 86400000 ? ' (tous les jours)' : t.repeatIntervalMs ? ' (recurrent)' : ''}<br /><span class="muted">${escapeHtml(t.message).slice(0, 80)}</span></span>
      <button class="btn danger delete-scheduled" data-id="${t.id}">Supprimer</button>
    </div>
  `).join('') || '<p class="muted">Aucune annonce programmee.</p>';

  const ticketRows = tickets.map((t) => `
    <div class="row" data-id="${t.id}" style="justify-content:space-between; margin-bottom:6px;">
      <span>${channelName(t.channelId)} <span class="muted">(${escapeHtml(t.userId)})</span> — <span class="badge ${t.status === 'open' ? 'configured' : 'not-configured'}">${t.status === 'open' ? 'Ouvert' : 'Ferme'}</span>${t.assignedToTag ? ` <span class="muted">— pris en charge par ${escapeHtml(t.assignedToTag)}</span>` : ''}</span>
      ${t.status === 'open' ? `<button class="btn danger close-ticket" data-id="${t.id}">Fermer</button>` : ''}
    </div>
  `).join('') || '<p class="muted">Aucun ticket pour le moment.</p>';

  container.innerHTML = `
    <div class="inner">
      ${sectionHtml('Bots complementaires', `
        <p class="muted">Ajoute des modules complementaires a ce serveur en invitant ces bots.</p>
        <div class="row">
          <a class="btn secondary" href="https://discord.com/oauth2/authorize?client_id=1526016642411135107&permissions=286262288&scope=bot" target="_blank" rel="noopener">➕ Ajouter FortniteParty</a>
          <a class="btn secondary" href="https://discord.com/oauth2/authorize?client_id=1449858112054886442&scope=bot%20applications.commands&permissions=268520448&guild_id=1526242972989915307" target="_blank" rel="noopener">➕ Ajouter BotStream</a>
        </div>
      `)}

      ${sectionHtml('Auto-moderation', `
        <div class="dp-toggle-row"><span>Auto-moderation active</span><input type="checkbox" id="am-enabled" ${modConfig.autoModEnabled ? 'checked' : ''} /></div>
        <div class="dp-toggle-row" style="margin-top:6px;"><span>Bloquer les liens d'invitation Discord</span><input type="checkbox" id="am-invites" ${modConfig.blockInvites ? 'checked' : ''} /></div>
        <div class="dp-toggle-row" style="margin-top:6px;"><span>Bloquer tous les liens</span><input type="checkbox" id="am-links" ${modConfig.blockLinks ? 'checked' : ''} /></div>
        <label>Seuil anti-spam (messages)</label>
        <input type="number" id="am-spam-threshold" value="${modConfig.spamMessageThreshold}" min="1" />
        <label>Mots bannis (separes par des virgules)</label>
        <textarea id="am-banned-words">${escapeHtml((modConfig.bannedWords || []).join(', '))}</textarea>
        <div class="dp-toggle-row" style="margin-top:6px;"><span>Anti-raid actif</span><input type="checkbox" id="am-antiraid" ${modConfig.antiRaidEnabled ? 'checked' : ''} /></div>
        <label>Seuil anti-raid (arrivees rapprochees)</label>
        <input type="number" id="am-antiraid-threshold" value="${modConfig.antiRaidJoinThreshold}" min="1" />
        <button class="btn" id="save-modconfig" style="margin-top:12px;">Enregistrer</button>
      `)}

      ${sectionHtml('Roles de niveau (XP)', `
        <div id="level-roles-list">${levelRoleRows}</div>
        <div class="row" style="margin-top:10px;">
          <input type="number" id="new-level" placeholder="Niveau" min="1" style="width:100px;" />
          <select id="new-level-role">${roleOptions()}</select>
          <button class="btn secondary" id="add-level-role">Ajouter</button>
        </div>
      `)}

      ${sectionHtml('Parrainage', `
        <div id="referral-roles-list">${referralRoleRows}</div>
        <div class="row" style="margin-top:10px;">
          <input type="number" id="new-referral-count" placeholder="Nb invitations" min="1" style="width:130px;" />
          <select id="new-referral-role">${roleOptions()}</select>
          <button class="btn secondary" id="add-referral-role">Ajouter</button>
        </div>
        <button class="btn secondary" id="generate-referral-role" style="margin-top:8px;">🎗️ Generer un role Parrain automatiquement</button>
        <h2 style="margin-top:18px; font-size:0.85rem;">Classement</h2>
        <div id="referral-leaderboard">${leaderboardRows}</div>
      `)}

      ${sectionHtml('Streamers lies', `
        <div id="streamers-list">${streamerRows}</div>
        <div class="row" style="margin-top:10px;">
          <input type="text" id="new-streamer-user" placeholder="ID Discord" style="width:160px;" />
          <select id="new-streamer-platform">
            <option value="twitch">Twitch</option>
            <option value="youtube">YouTube</option>
          </select>
          <input type="text" id="new-streamer-identifier" placeholder="Pseudo / chaine" style="width:160px;" />
          <button class="btn secondary" id="add-streamer">Ajouter</button>
        </div>
      `)}

      ${sectionHtml('Annonces programmees', `
        <div id="scheduled-list">${scheduledRows}</div>
        <div style="margin-top:10px;">
          <label>Salon</label>
          <select id="new-scheduled-channel">${textChannelOptions}</select>
          <label>Message</label>
          <textarea id="new-scheduled-message"></textarea>
          <label>Date et heure</label>
          <input type="datetime-local" id="new-scheduled-date" />
          <div class="dp-toggle-row" style="margin-top:10px;">
            <span>Repeter tous les jours a cette heure</span>
            <input type="checkbox" id="new-scheduled-daily" />
          </div>
          <button class="btn secondary" id="add-scheduled" style="margin-top:8px;">Programmer</button>
        </div>
      `)}

      ${sectionHtml('Service (Staff en service)', `
        <p class="muted">Le salon vocal SERVICE STAFF (categorie 🛡️ Staff) sert d'interrupteur : un membre du staff qui s'y connecte est immediatement deconnecte et bascule son statut "en service", qui revele la categorie Staff et les categories/salons choisis ci-dessous.</p>

        <label>Roles consideres comme "staff" (peuvent basculer leur statut de service)</label>
        <div class="channel-picker" style="max-height:160px">
          ${roles.filter((r) => r.name !== '@everyone').map((r) => `
            <label><input type="checkbox" class="service-role" value="${r.id}" ${(config?.staffRoleIds || [config?.moderateurRoleId, config?.adminRoleId].filter(Boolean)).includes(r.id) ? 'checked' : ''} /> ${escapeHtml(r.name)}</label>
          `).join('') || '<p class="muted">Aucun role.</p>'}
        </div>

        <label style="margin-top:10px;">Categories masquees sauf staff en service</label>
        <div class="channel-picker" style="max-height:160px">
          ${channels.filter((c) => c.type === 4).map((c) => `
            <label><input type="checkbox" class="service-category" value="${c.id}" ${(config?.onDutyHiddenCategoryIds || []).includes(c.id) ? 'checked' : ''} /> 📁 ${escapeHtml(c.name)}</label>
          `).join('') || '<p class="muted">Aucune categorie.</p>'}
        </div>

        <label style="margin-top:10px;">Salons individuels masques sauf staff en service</label>
        <div class="channel-picker" style="max-height:160px">
          ${channels.filter((c) => c.type !== 4).map((c) => `
            <label><input type="checkbox" class="service-channel" value="${c.id}" ${(config?.onDutyHiddenChannelIds || []).includes(c.id) ? 'checked' : ''} /> ${c.type === 2 ? '🔊' : '#'} ${escapeHtml(c.name)}</label>
          `).join('') || '<p class="muted">Aucun salon.</p>'}
        </div>

        <div class="dp-toggle-row" style="margin-top:10px;">
          <span>Tickets visibles uniquement par le staff actuellement en service</span>
          <input type="checkbox" id="tickets-on-duty-only" ${config?.ticketsStaffOnDutyOnly === false ? '' : 'checked'} />
        </div>
        <p class="muted" style="margin-top:8px;">Enregistrer applique immediatement les permissions choisies (SERVICE STAFF + categories/salons coches). La visibilite se met ensuite a jour automatiquement a chaque bascule de service.</p>
        <button class="btn" id="save-service-config" style="margin-top:8px;">Enregistrer et appliquer</button>
      `)}

      ${sectionHtml('Tickets', `
        <label>Roles autorises a voir/repondre aux tickets (si non limite au service)</label>
        <div class="channel-picker" style="max-height:160px">
          ${roles.filter((r) => r.name !== '@everyone').map((r) => `
            <label><input type="checkbox" class="ticket-role" value="${r.id}" ${(config?.ticketAllowedRoleIds || [config?.moderateurRoleId, config?.adminRoleId].filter(Boolean)).includes(r.id) ? 'checked' : ''} /> ${escapeHtml(r.name)}</label>
          `).join('') || '<p class="muted">Aucun role.</p>'}
        </div>
        <button class="btn secondary" id="save-ticket-roles" style="margin-top:8px;">Enregistrer les roles autorises</button>

        <h2 style="margin-top:18px; font-size:0.85rem;">Tickets</h2>
        <div id="tickets-list">${ticketRows}</div>
      `)}
    </div>
  `;
  wireSections(container);

  document.getElementById('save-service-config').addEventListener('click', async () => {
    const btn = document.getElementById('save-service-config');
    btn.disabled = true;
    try {
      const staffRoleIds = [...container.querySelectorAll('.service-role:checked')].map((el) => el.value);
      const onDutyHiddenCategoryIds = [...container.querySelectorAll('.service-category:checked')].map((el) => el.value);
      const onDutyHiddenChannelIds = [...container.querySelectorAll('.service-channel:checked')].map((el) => el.value);
      await Api.updateConfig(id, {
        ticketsStaffOnDutyOnly: document.getElementById('tickets-on-duty-only').checked,
        staffRoleIds,
        onDutyHiddenCategoryIds,
        onDutyHiddenChannelIds,
      });
      await Api.applyServiceVisibility(id);
      showToast('Configuration du service enregistree et appliquee.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('save-ticket-roles').addEventListener('click', async () => {
    try {
      const ticketAllowedRoleIds = [...container.querySelectorAll('.ticket-role:checked')].map((el) => el.value);
      await Api.updateConfig(id, { ticketAllowedRoleIds });
      showToast('Roles autorises pour les tickets enregistres.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('save-modconfig').addEventListener('click', async () => {
    try {
      await Api.updateModConfig(id, {
        autoModEnabled: document.getElementById('am-enabled').checked,
        blockInvites: document.getElementById('am-invites').checked,
        blockLinks: document.getElementById('am-links').checked,
        spamMessageThreshold: Number(document.getElementById('am-spam-threshold').value) || 5,
        bannedWords: document.getElementById('am-banned-words').value.split(',').map((w) => w.trim()).filter(Boolean),
        antiRaidEnabled: document.getElementById('am-antiraid').checked,
        antiRaidJoinThreshold: Number(document.getElementById('am-antiraid-threshold').value) || 8,
      });
      showToast('Auto-moderation enregistree.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('add-level-role').addEventListener('click', async () => {
    const level = Number(document.getElementById('new-level').value);
    const roleId = document.getElementById('new-level-role').value;
    if (!level || !roleId) { showToast('Niveau et role requis.', 'error'); return; }
    try {
      await Api.setLevelRole(id, level, roleId);
      showToast('Role de niveau ajoute.');
      await renderAutomationsPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  container.querySelectorAll('.delete-level-role').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await Api.deleteLevelRole(id, btn.dataset.level);
        showToast('Role de niveau supprime.');
        await renderAutomationsPage(id, container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  document.getElementById('add-referral-role').addEventListener('click', async () => {
    const count = Number(document.getElementById('new-referral-count').value);
    const roleId = document.getElementById('new-referral-role').value;
    if (!count || !roleId) { showToast('Nombre et role requis.', 'error'); return; }
    try {
      await Api.setReferralRole(id, count, roleId);
      showToast('Role de parrainage ajoute.');
      await renderAutomationsPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  document.getElementById('generate-referral-role').addEventListener('click', async () => {
    try {
      const role = await Api.createRole(id, '🎗️ Parrain', 0x2ec4b6);
      await Api.setReferralRole(id, 3, role.id);
      showToast('Role Parrain genere et assigne a 3 invitations.');
      await renderAutomationsPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  container.querySelectorAll('.delete-referral-role').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await Api.deleteReferralRole(id, btn.dataset.count);
        showToast('Role de parrainage supprime.');
        await renderAutomationsPage(id, container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  document.getElementById('add-streamer').addEventListener('click', async () => {
    const discordUserId = document.getElementById('new-streamer-user').value.trim();
    const platform = document.getElementById('new-streamer-platform').value;
    const identifier = document.getElementById('new-streamer-identifier').value.trim();
    if (!discordUserId || !identifier) { showToast('ID Discord et pseudo/chaine requis.', 'error'); return; }
    try {
      await Api.addStreamer(id, discordUserId, platform, identifier);
      showToast('Streamer lie.');
      await renderAutomationsPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  container.querySelectorAll('.delete-streamer').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await Api.deleteStreamer(id, btn.dataset.user, btn.dataset.platform);
        showToast('Streamer retire.');
        await renderAutomationsPage(id, container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  document.getElementById('add-scheduled').addEventListener('click', async () => {
    const channelId = document.getElementById('new-scheduled-channel').value;
    const message = document.getElementById('new-scheduled-message').value.trim();
    const dateVal = document.getElementById('new-scheduled-date').value;
    const daily = document.getElementById('new-scheduled-daily').checked;
    if (!channelId || !message || !dateVal) { showToast('Salon, message et date requis.', 'error'); return; }
    try {
      await Api.addScheduled(id, {
        channelId, message, runAt: new Date(dateVal).getTime(), repeatIntervalMs: daily ? 86400000 : undefined,
      });
      showToast('Annonce programmee.');
      await renderAutomationsPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  container.querySelectorAll('.delete-scheduled').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await Api.deleteScheduled(id, btn.dataset.id);
        showToast('Annonce supprimee.');
        await renderAutomationsPage(id, container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  container.querySelectorAll('.close-ticket').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Fermer ce ticket ? Le salon sera supprime.')) return;
      try {
        await Api.closeTicket(id, btn.dataset.id);
        showToast('Ticket ferme.');
        await renderAutomationsPage(id, container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

/* ---------- Pages: securite ---------- */

async function renderSecurityPage(id, container = app) {
  container.innerHTML = '<p class="muted">Chargement...</p>';
  const snapshots = await Api.securitySnapshots(id);

  const snapshotRows = snapshots.map((s, idx) => `
    <div class="row" data-idx="${idx}" style="justify-content:space-between; margin-bottom:6px;">
      <span>${new Date(s.exportedAt).toLocaleString('fr-FR')} — ${s.roles.length} role(s), ${s.categories.length} categorie(s), ${s.channels.length} salon(s)</span>
      <button class="btn secondary restore-snapshot" data-idx="${idx}">Restaurer</button>
    </div>
  `).join('') || '<p class="muted">Aucun snapshot pour le moment. Un snapshot automatique est pris chaque jour.</p>';

  container.innerHTML = `
    <div class="inner">
      ${sectionHtml('Export / Restauration manuelle', `
        <p class="muted">Exporte la structure (noms/couleurs des roles, categories, salons) en fichier JSON. La restauration est additive : elle recree uniquement ce qui manque, sans jamais toucher a l'existant.</p>
        <button class="btn secondary" id="export-structure">⬇️ Telecharger la structure (.json)</button>
        <label>Restaurer depuis un fichier</label>
        <input type="file" id="structure-file-input" accept="application/json" />
        <button class="btn secondary" id="restore-structure" style="margin-top:8px;">Restaurer depuis ce fichier</button>
      `)}

      ${sectionHtml('Snapshots automatiques', `
        <p class="muted">Un snapshot de la structure est pris automatiquement chaque jour (5 derniers conserves).</p>
        <button class="btn secondary" id="snapshot-now" style="margin-bottom:10px;">Creer un snapshot maintenant</button>
        <div id="snapshots-list">${snapshotRows}</div>
      `)}

      ${sectionHtml('Lockdown', `
        <p class="muted">Verrouille immediatement le serveur (verification maximale : email verifie + compte Discord de plus de 10 minutes requis pour interagir). Utile en cas de raid en cours.</p>
        <div class="row">
          <button class="btn danger" id="lockdown-btn">Verrouiller le serveur</button>
          <button class="btn secondary" id="unlock-btn">Deverrouiller</button>
        </div>
      `)}
    </div>
  `;
  wireSections(container);

  document.getElementById('export-structure').addEventListener('click', async () => {
    try {
      const snapshot = await Api.securityExport(id);
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `structure-${id}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Fichier telecharge.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('restore-structure').addEventListener('click', async () => {
    const file = document.getElementById('structure-file-input').files[0];
    if (!file) { showToast('Choisis un fichier.', 'error'); return; }
    try {
      const snapshot = JSON.parse(await file.text());
      const result = await Api.securityRestore(id, snapshot);
      showToast(`Restaure : ${result.roles} role(s), ${result.categories} categorie(s), ${result.channels} salon(s) crees.`);
    } catch (err) {
      showToast(err.message || 'Fichier JSON invalide.', 'error');
    }
  });

  document.getElementById('snapshot-now').addEventListener('click', async () => {
    try {
      await Api.securitySnapshotNow(id);
      showToast('Snapshot cree.');
      await renderSecurityPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  container.querySelectorAll('.restore-snapshot').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Restaurer ce snapshot ? Les elements manquants seront recrees (rien ne sera supprime).')) return;
      try {
        const snapshot = snapshots[Number(btn.dataset.idx)];
        const result = await Api.securityRestore(id, snapshot);
        showToast(`Restaure : ${result.roles} role(s), ${result.categories} categorie(s), ${result.channels} salon(s) crees.`);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  document.getElementById('lockdown-btn').addEventListener('click', async () => {
    if (!window.confirm('Verrouiller le serveur maintenant ?')) return;
    try {
      await Api.lockdown(id);
      showToast('Serveur verrouille.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  document.getElementById('unlock-btn').addEventListener('click', async () => {
    try {
      await Api.unlock(id);
      showToast('Serveur deverrouille.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

/* ---------- Boot ---------- */

async function renderGuildDetail(id) {
  const guild = allGuilds.find((g) => g.guildId === id);
  if (!guild) {
    app.innerHTML = '<div class="inner"><div class="card"><p class="muted">Serveur introuvable ou non gere.</p></div></div>';
    return;
  }
  searchBox.style.display = 'none';
  renderSidebarForGuild(guild);
  await renderPreviewPage(id);
}

async function init() {
  try {
    const me = await Api.me();
    document.getElementById('whoami').textContent = me.username;
    const avatarUrl = me.avatar
      ? `https://cdn.discordapp.com/avatars/${me.userId}/${me.avatar}.png?size=64`
      : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(me.userId) >> 22n) % 6n)}.png`;
    document.getElementById('user-avatar').src = avatarUrl;
  } catch {
    return; // Api.me() redirige deja vers index.html sur 401
  }

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await Api.logout();
    location.href = 'index.html';
  });

  allGuilds = await Api.guilds();
  renderRail();

  if (guildId) {
    await renderGuildDetail(guildId);
  } else {
    renderSidebarForList();
    await renderGuildList();
  }
}

init().catch((err) => {
  app.innerHTML = `<div class="inner"><div class="card"><p class="muted">Erreur : ${escapeHtml(err.message)}</p></div></div>`;
});
