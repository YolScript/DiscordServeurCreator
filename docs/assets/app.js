const app = document.getElementById('app');
const railEl = document.getElementById('rail');
const sidebarEl = document.getElementById('sidebar');
const searchBox = document.getElementById('search-box');
const searchInput = document.getElementById('search-input');

const params = new URLSearchParams(location.search);
const guildId = params.get('guild');

let allGuilds = [];
let currentSection = 'overview';

const PERMISSION_CHOICES = [
  'ViewChannel', 'SendMessages', 'ReadMessageHistory', 'Connect', 'Speak',
  'ManageMessages', 'ManageChannels', 'ManageRoles', 'MentionEveryone',
  'AttachFiles', 'EmbedLinks', 'AddReactions', 'KickMembers', 'BanMembers', 'ModerateMembers',
];

const NAV_GROUPS = [
  {
    label: 'Serveur',
    items: [
      { key: 'textes', label: 'Textes & Bienvenue' },
      { key: 'permissions', label: 'Permissions' },
      { key: 'salons', label: 'Salons pregeneres' },
      { key: 'jeux', label: 'Roles de jeu' },
    ],
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
  sidebarEl.innerHTML = `
    <div class="sidebar-header">
      <img src="assets/logo-512.png" alt="" />
      <div>
        <div class="name">Tes serveurs</div>
        <div class="sub">${allGuilds.length} serveur(s)</div>
      </div>
    </div>
    <nav class="nav"></nav>
  `;
}

function renderSidebarForGuild(guild) {
  const icon = guildIconUrl(guild);
  sidebarEl.innerHTML = `
    <div class="sidebar-header">
      ${icon ? `<img src="${icon}" alt="" />` : `<div class="brand-icon" style="width:30px;height:30px;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;color:#fff;">${escapeHtml(initials(guild.name))}</div>`}
      <div>
        <div class="name">${escapeHtml(guild.name)}</div>
        <div class="sub">Dashboard</div>
      </div>
    </div>
    <nav class="nav">
      <button class="nav-item" data-section="overview">Vue d'ensemble</button>
      <button class="nav-item" data-section="apercu">Aperçu du serveur</button>
      ${NAV_GROUPS.map((group) => `
        <div class="nav-group">
          <button class="nav-group-header" data-group="${escapeHtml(group.label)}">
            <span>${escapeHtml(group.label)}</span>
            <span class="nav-group-chevron">▾</span>
          </button>
          <div class="nav-group-items">
            ${group.items.map((item) => `
              <button class="nav-item" data-section="${item.key}">${escapeHtml(item.label)}</button>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </nav>
  `;

  sidebarEl.querySelectorAll('.nav-group-header').forEach((btn) => {
    btn.addEventListener('click', () => btn.closest('.nav-group').classList.toggle('collapsed'));
  });
  wireNavItems(guild.guildId);
  setActiveNavItem();
}

function wireNavItems(id) {
  const renderers = {
    overview: () => renderOverviewPage(id),
    apercu: () => renderPreviewPage(id),
    textes: () => renderTextsPage(id),
    permissions: () => renderPermissionsPage(id),
    jeux: () => renderGameRolesPage(id),
    salons: () => renderPresetsPage(id),
  };
  sidebarEl.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentSection = btn.dataset.section;
      setActiveNavItem();
      renderers[currentSection]();
    });
  });
}

function setActiveNavItem() {
  sidebarEl.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.section === currentSection);
  });
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

/* ---------- Pages: overview ---------- */

async function renderOverviewPage(id) {
  app.innerHTML = '<p class="muted">Chargement...</p>';
  const guild = allGuilds.find((g) => g.guildId === id);
  const config = await Api.config(id);

  app.innerHTML = `
    <div class="inner">
      <div class="card">
        <h2>Vue d'ensemble</h2>
        <p class="muted">${escapeHtml(guild?.name || id)}</p>
        <div class="row" style="margin-top:14px;">
          <div class="badge configured">Configure</div>
        </div>
      </div>
      <div class="card">
        <h2>Raccourcis</h2>
        <div class="row" style="margin-top:8px;">
          <button class="btn secondary" data-goto="textes">Textes &amp; Bienvenue</button>
          <button class="btn secondary" data-goto="permissions">Permissions</button>
          <button class="btn secondary" data-goto="jeux">Roles de jeu</button>
          <button class="btn secondary" data-goto="salons">Salons pregeneres</button>
        </div>
      </div>
    </div>
  `;
  app.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentSection = btn.dataset.goto;
      setActiveNavItem();
      sidebarEl.querySelector(`.nav-item[data-section="${currentSection}"]`)?.click();
    });
  });
  void config;
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

async function renderPreviewPage(id) {
  app.innerHTML = '<p class="muted">Chargement...</p>';
  const [channels, config] = await Promise.all([Api.channels(id), Api.config(id)]);

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
      <div class="dp-channels">${children.map(channelRow).join('')}</div>
    `;
  };

  app.innerHTML = `
    <div class="inner" style="max-width:1040px;">
      <div class="card">
        <h2>Aperçu du serveur</h2>
        <p class="muted">Clique sur un salon pour le renommer, changer sa visibilite ou le supprimer.</p>
      </div>
      <div class="discord-preview">
        <div class="dp-sidebar">
          ${uncategorized.map(channelRow).join('')}
          ${categories.map(categoryBlock).join('')}
        </div>
        <div class="dp-main" id="dp-main">
          <p class="dp-empty">Selectionne un salon a gauche pour le configurer.</p>
        </div>
      </div>
    </div>
  `;

  app.querySelectorAll('.dp-category').forEach((catEl) => {
    catEl.addEventListener('click', () => catEl.classList.toggle('collapsed'));
  });

  app.querySelectorAll('.dp-channel').forEach((chEl) => {
    chEl.addEventListener('click', () => {
      app.querySelectorAll('.dp-channel').forEach((el) => el.classList.remove('selected'));
      chEl.classList.add('selected');
      renderChannelPanel(id, chEl.dataset.channel, chEl.dataset.name, Number(chEl.dataset.type), config, channels);
    });
  });
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
      <label>Nom du salon</label>
      <input type="text" id="dp-rename" value="${escapeHtml(name)}" />
      <button class="btn" id="dp-save-name" style="margin-top:10px;">Enregistrer le nom</button>

      ${config?.reglementValidatedRoleId && type !== 4 ? `
        <div class="dp-toggle-row">
          <span>Visible pour "Reglement valide"</span>
          <input type="checkbox" id="dp-visible-toggle" ${currentlyVisible !== false ? 'checked' : ''} />
        </div>
      ` : ''}

      <button class="btn danger" id="dp-delete" style="margin-top:20px;">Supprimer ce salon</button>
    </div>
  `;

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

/* ---------- Pages: textes ---------- */

async function renderTextsPage(id) {
  app.innerHTML = '<p class="muted">Chargement...</p>';
  const [config, channels] = await Promise.all([Api.config(id), Api.channels(id)]);
  const textChannels = channels.filter((c) => c.type === 0);
  const channelOptions = textChannels.map((c) => `<option value="${c.id}" ${config?.arrivalDepartureChannelId === c.id ? 'selected' : ''}>#${escapeHtml(c.name)}</option>`).join('');

  app.innerHTML = `
    <div class="inner">
      <div class="card">
        <h2>Reglement</h2>
        <textarea id="reglementText">${escapeHtml(config?.reglementText)}</textarea>
      </div>
      <div class="card">
        <h2>Integration Bienvenue / Depart</h2>
        <label>Salon de destination</label>
        <select id="arrivalChannel">${channelOptions}</select>
        <label>Message de bienvenue</label>
        <textarea id="welcomeTemplate">${escapeHtml(config?.welcomeMessageTemplate)}</textarea>
        <label>Message de depart</label>
        <textarea id="leaveTemplate">${escapeHtml(config?.leaveMessageTemplate)}</textarea>
        <p class="muted">Variables disponibles : {user} {username} {server} {membercount}</p>
      </div>
      <button class="btn" id="save-texts">Enregistrer</button>
    </div>
  `;

  document.getElementById('save-texts').addEventListener('click', async () => {
    try {
      await Api.updateConfig(id, {
        reglementText: document.getElementById('reglementText').value,
        arrivalDepartureChannelId: document.getElementById('arrivalChannel').value,
        welcomeMessageTemplate: document.getElementById('welcomeTemplate').value,
        leaveMessageTemplate: document.getElementById('leaveTemplate').value,
      });
      showToast('Textes enregistres.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

/* ---------- Pages: permissions ---------- */

async function renderPermissionsPage(id) {
  app.innerHTML = '<p class="muted">Chargement...</p>';
  const [channels, roles] = await Promise.all([Api.channels(id), Api.roles(id)]);
  const editableChannels = channels.filter((c) => c.type === 0 || c.type === 2 || c.type === 4);
  const roleOptions = roles.filter((r) => r.name !== '@everyone').map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
  const channelCheckboxes = editableChannels.map((c) => `
    <label><input type="checkbox" value="${c.id}" class="perm-channel" /> ${c.type === 4 ? '📁' : c.type === 2 ? '🔊' : '#'} ${escapeHtml(c.name)}</label>
  `).join('');
  const allowChecks = PERMISSION_CHOICES.map((p) => `<label><input type="checkbox" class="allow-perm" value="${p}" /> ${p}</label>`).join('');
  const denyChecks = PERMISSION_CHOICES.map((p) => `<label><input type="checkbox" class="deny-perm" value="${p}" /> ${p}</label>`).join('');
  const channelOptionsSimple = editableChannels.map((c) => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');

  app.innerHTML = `
    <div class="inner">
      <div class="card">
        <h2>Edition en masse</h2>
        <p class="muted">Selectionne un ou plusieurs salons, un role, et les permissions a autoriser/refuser. Applique en un clic sur tous les salons choisis.</p>
        <label>Salons</label>
        <div class="channel-picker">${channelCheckboxes}</div>
        <label>Role</label>
        <select id="perm-role">${roleOptions}</select>
        <div class="row" style="align-items:flex-start; margin-top: 10px;">
          <div style="flex:1"><strong>Autoriser</strong><div class="channel-picker" style="max-height:180px">${allowChecks}</div></div>
          <div style="flex:1"><strong>Refuser</strong><div class="channel-picker" style="max-height:180px">${denyChecks}</div></div>
        </div>
        <button class="btn" id="apply-bulk" style="margin-top:12px;">Appliquer</button>
      </div>

      <div class="card">
        <h2>Export / Import (copier-coller)</h2>
        <label>Salon a exporter</label>
        <select id="export-channel">${channelOptionsSimple}</select>
        <button class="btn secondary" id="export-btn" style="margin-top:8px;">Exporter</button>
        <textarea id="export-output" placeholder="Le JSON exporte apparait ici, copie-le."></textarea>

        <label>Coller ici pour importer</label>
        <textarea id="import-input" placeholder="Colle ici le JSON exporte depuis un autre salon/serveur"></textarea>
        <label>Salon cible</label>
        <select id="import-channel">${channelOptionsSimple}</select>
        <button class="btn secondary" id="import-btn" style="margin-top:8px;">Importer</button>
      </div>

      <div class="card">
        <h2>Permissions par defaut</h2>
        <p class="muted">Reinitialise les permissions du role au preset recommande (utile si elles ont ete modifiees par erreur).</p>
        <div class="row">
          <button class="btn secondary" id="reset-admin">Reinitialiser Administrateur</button>
          <button class="btn secondary" id="reset-mod">Reinitialiser Moderateur</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('apply-bulk').addEventListener('click', async () => {
    const channelIds = [...app.querySelectorAll('.perm-channel:checked')].map((el) => el.value);
    const roleId = document.getElementById('perm-role').value;
    const allow = [...app.querySelectorAll('.allow-perm:checked')].map((el) => el.value);
    const deny = [...app.querySelectorAll('.deny-perm:checked')].map((el) => el.value);
    if (channelIds.length === 0 || !roleId) {
      showToast('Choisis au moins un salon et un role.', 'error');
      return;
    }
    try {
      const results = await Api.bulkPermissions(id, { channelIds, roleId, allow, deny });
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

async function renderGameRolesPage(id) {
  app.innerHTML = '<p class="muted">Chargement...</p>';
  const roles = await Api.gameRoles(id);

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

  app.innerHTML = `
    <div class="inner">
      <div class="card">
        <h2>Roles de jeu detectes</h2>
        <p class="muted">Generes automatiquement quand un membre est vu en train de jouer.</p>
        ${rows || '<p class="muted">Aucun role de jeu pour le moment.</p>'}
      </div>
    </div>
  `;

  app.querySelectorAll('.rename-btn').forEach((btn) => {
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
  app.querySelectorAll('.delete-btn').forEach((btn) => {
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

/* ---------- Pages: salons pregeneres ---------- */

async function renderPresetsPage(id) {
  app.innerHTML = '<p class="muted">Chargement...</p>';
  const [presets, channels] = await Promise.all([Api.channelPresets(), Api.channels(id)]);
  const categories = channels.filter((c) => c.type === 4);
  const categoryOptions = '<option value="">Aucune categorie</option>'
    + categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  const chips = presets.map((p) => `<button class="preset-chip" data-key="${p.key}" title="${escapeHtml(p.description)}">+ ${escapeHtml(p.name)}</button>`).join('');

  app.innerHTML = `
    <div class="inner">
      <div class="card">
        <h2>Salons pregeneres</h2>
        <label>Categorie de destination</label>
        <select id="preset-category">${categoryOptions}</select>
        <div class="preset-grid" style="margin-top:12px;">${chips}</div>
      </div>
    </div>
  `;

  app.querySelectorAll('.preset-chip').forEach((chip) => {
    chip.addEventListener('click', async () => {
      const categoryId = document.getElementById('preset-category').value;
      try {
        await Api.addPresetChannel(id, chip.dataset.key, categoryId || undefined);
        showToast('Salon ajoute.');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
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
  currentSection = 'overview';
  renderSidebarForGuild(guild);
  await renderOverviewPage(id);
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
