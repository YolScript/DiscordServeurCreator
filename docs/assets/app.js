const app = document.getElementById('app');
const railEl = document.getElementById('topbar-guilds');
const searchBox = document.getElementById('search-box');
const searchInput = document.getElementById('search-input');

const params = new URLSearchParams(location.search);
const guildId = params.get('guild');

let allGuilds = [];
let currentUser = null;
let currentUserAvatarUrl = '';

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

// Reorganisation animee (FLIP) : mesure la position des elements freres,
// applique la mutation DOM (insertBefore du drag), puis anime chaque voisin
// depuis son ancienne position avec une courbe a leger rebond — l'effet
// "les voisins s'ecartent avec une physique" du drag&drop, sans bibliotheque.
function animateReorder(list, itemSelector, mutate) {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || !list.animate) { mutate(); return; }

  const items = [...list.querySelectorAll(itemSelector)];
  const before = new Map(items.map((el) => [el, el.getBoundingClientRect().top]));
  mutate();
  for (const el of items) {
    const delta = before.get(el) - el.getBoundingClientRect().top;
    if (!delta || el.classList.contains('dragging')) continue;
    el.animate(
      [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }],
      { duration: 320, easing: 'cubic-bezier(.22,1.4,.36,1)' },
    );
  }
}

// Transition douce (crossfade natif) entre deux etats du panel principal du
// Server Builder, via l'API View Transitions du navigateur. Se degrade en
// appel direct si l'API est absente ou si l'utilisateur demande moins de
// mouvement : la navigation reste fonctionnelle dans tous les cas.
function withViewTransition(renderFn) {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || !document.startViewTransition) {
    renderFn();
    return;
  }
  document.startViewTransition(() => renderFn());
}

/* ---------- Collapsible sections ---------- */

function sectionHtml(title, bodyHtml, { hint = '', open = false } = {}) {
  return `
    <div class="section${open ? '' : ' collapsed'}">
      <button class="section-header" type="button">
        <span>${escapeHtml(title)}${hint ? `<span class="section-hint">${escapeHtml(hint)}</span>` : ''}</span>
        <span class="chevron">▾</span>
      </button>
      <div class="section-body"><div class="section-body-inner">${bodyHtml}</div></div>
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
  railEl.innerHTML = managed.map((g) => {
    const icon = guildIconUrl(g);
    const active = g.guildId === guildId;
    return `
      <button class="rail-guild${active ? ' active' : ''}" data-guild="${g.guildId}" title="${escapeHtml(g.name)}">
        ${icon ? `<img src="${icon}" alt="" />` : escapeHtml(initials(g.name))}
      </button>`;
  }).join('');
  railEl.querySelectorAll('.rail-guild').forEach((btn) => {
    btn.addEventListener('click', () => { location.href = `app.html?guild=${btn.dataset.guild}`; });
  });
}

/* ---------- Pages: guild list ---------- */

async function renderGuildList() {
  app.classList.remove('preview-fullbleed');
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
        : `<button class="btn generate-server-btn" data-guild="${g.guildId}" data-name="${escapeHtml(g.name || g.guildId)}">🪄 Generer le serveur</button>`;
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
        <div class="topgg-badges">
          <a href="https://top.gg/bot/1526237674355036401" target="_blank" rel="noopener"><img src="https://top.gg/api/widget/servers/1526237674355036401.svg?noavatar=true" alt="Serveurs top.gg" /></a>
          <a href="https://top.gg/bot/1526237674355036401" target="_blank" rel="noopener"><img src="https://top.gg/api/widget/upvotes/1526237674355036401.svg?noavatar=true" alt="Votes top.gg" /></a>
          <a href="https://top.gg/bot/1526237674355036401" target="_blank" rel="noopener"><img src="https://top.gg/api/widget/owner/1526237674355036401.svg?noavatar=true" alt="Proprietaire top.gg" /></a>
        </div>
      </div>
    `;
  }

  function wireGenerateButtons() {
    app.querySelectorAll('.generate-server-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        withViewTransition(() => renderGenerateChoice(btn.dataset.guild, btn.dataset.name));
      });
    });
  }

  paint('');
  wireGenerateButtons();
  searchInput.oninput = () => { paint(searchInput.value); wireGenerateButtons(); };
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
  { key: 'stats', label: 'Statistiques' },
  { key: 'auditlog', label: "Logs d'audit" },
  { key: 'embedbuilder', label: 'Generateur embed' },
  { key: 'botstatus', label: 'Statut du bot' },
  { key: 'templates', label: 'Templates' },
  { key: 'customcommands', label: 'Commandes personnalisees' },
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
  const isEveryone = role.name === '@everyone';
  const hex = role.color ? `#${role.color.toString(16).padStart(6, '0')}` : '#99aab5';
  return `
    <div class="dp-role-row" data-role="${role.id}" data-position="${role.position}" ${isEveryone ? '' : 'draggable="true"'}>
      <div class="dp-role-summary">
        ${!isEveryone ? '<span class="dp-role-handle">⠿</span>' : ''}
        ${roleColorDot(role)}
        <span class="dp-role-name">${escapeHtml(role.name)}</span>
        <span class="dp-role-count">${memberNames.length}</span>
      </div>
      <div class="dp-role-detail">
        ${!isEveryone ? `
          <p class="dp-role-detail-title">Couleur</p>
          <input type="color" class="dp-role-color-input" value="${hex}" data-role="${role.id}" />
        ` : ''}
        <p class="dp-role-detail-title">Permissions</p>
        <p class="muted">${perms.length ? escapeHtml(perms.join(', ')) : 'Aucune permission particuliere'}</p>
        <p class="dp-role-detail-title">Membres (${memberNames.length})</p>
        <p class="muted">${memberNames.length ? escapeHtml(memberNames.join(', ')) : 'Aucun membre'}</p>
      </div>
    </div>`;
}

async function renderPreviewPage(id) {
  app.classList.add('preview-fullbleed');
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
    <div class="dp-channel" draggable="true" data-channel="${c.id}" data-name="${escapeHtml(c.name)}" data-type="${c.type}">
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
        <div class="dp-sidebar">
          <div class="dp-server-header">
            <span class="name">${escapeHtml(guild?.name || 'Serveur')}</span>
            <span class="caret">▾</span>
          </div>
          <div class="dp-channel-list">
            <div class="dp-settings-group">
              <div class="dp-category collapsed" data-cat="__settings"><span class="chevron">▾</span> Parametres</div>
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

  app.querySelectorAll('.dp-category').forEach((catEl) => {
    catEl.addEventListener('click', () => catEl.classList.toggle('collapsed'));
  });

  app.querySelectorAll('.dp-role-row').forEach((row) => {
    row.querySelector('.dp-role-summary').addEventListener('click', () => row.classList.toggle('expanded'));
  });

  app.querySelectorAll('.dp-role-row[draggable="true"]').forEach((row) => {
    row.addEventListener('dragstart', () => row.classList.add('dragging'));
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      const list = row.parentElement;
      const dragging = list.querySelector('.dragging');
      if (!dragging || dragging === row) return;
      const rect = row.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      const target = before ? row : row.nextSibling;
      if (dragging.nextSibling === target) return;
      animateReorder(list, '.dp-role-row', () => list.insertBefore(dragging, target));
    });
    row.addEventListener('dragend', async () => {
      row.classList.remove('dragging');
      const list = row.parentElement;
      const orderedIds = [...list.querySelectorAll('.dp-role-row[draggable="true"]')].map((r) => r.dataset.role);
      const maxPos = Math.max(...rolesSorted.filter((r) => r.name !== '@everyone').map((r) => r.position));
      const positions = orderedIds.map((rid, idx) => ({ id: rid, position: maxPos - idx }));
      try {
        await Api.setRolePositions(id, positions);
        showToast('Ordre des roles mis a jour.');
      } catch (err) {
        showToast(err.message, 'error');
        await renderPreviewPage(id);
      }
    });
  });

  // Drag&drop des salons : reordonnancement au sein de la meme liste (meme
  // categorie ou racine), avec ecart anime des voisins. La position envoyee
  // est l'index dans la liste reordonnee ; Discord regroupe ensuite par type
  // (texte/vocal) comme dans son propre client.
  app.querySelectorAll('.dp-channel[data-channel]').forEach((chEl) => {
    chEl.addEventListener('dragstart', () => chEl.classList.add('dragging'));
    chEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      const list = chEl.parentElement;
      const dragging = list.querySelector('.dp-channel.dragging');
      if (!dragging || dragging === chEl || dragging.parentElement !== list) return;
      const rect = chEl.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      const target = before ? chEl : chEl.nextSibling;
      if (dragging.nextSibling === target) return;
      animateReorder(list, '.dp-channel[data-channel]', () => list.insertBefore(dragging, target));
    });
    chEl.addEventListener('dragend', async () => {
      chEl.classList.remove('dragging');
      const list = chEl.parentElement;
      const orderedIds = [...list.querySelectorAll('.dp-channel[data-channel]')].map((el) => el.dataset.channel);
      const positions = orderedIds.map((cid, idx) => ({ id: cid, position: idx }));
      try {
        await Api.setChannelPositions(id, positions);
        showToast('Ordre des salons mis a jour.');
      } catch (err) {
        showToast(err.message, 'error');
        await renderPreviewPage(id);
      }
    });
  });

  app.querySelectorAll('.dp-role-color-input').forEach((input) => {
    input.addEventListener('change', async () => {
      try {
        await Api.setRoleColor(id, input.dataset.role, parseInt(input.value.slice(1), 16));
        showToast('Couleur mise a jour.');
        const dot = input.closest('.dp-role-row').querySelector('.dp-role-dot');
        if (dot) dot.style.background = input.value;
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  app.querySelectorAll('.dp-channel[data-channel]').forEach((chEl) => {
    chEl.addEventListener('click', () => {
      app.querySelectorAll('.dp-channel').forEach((el) => el.classList.remove('selected'));
      chEl.classList.add('selected');
      window.UISound?.select();
      withViewTransition(() => {
        renderChannelPanel(id, chEl.dataset.channel, chEl.dataset.name, Number(chEl.dataset.type), config, channels);
      });
    });
  });

  app.querySelectorAll('.dp-channel[data-settings]').forEach((el) => {
    el.addEventListener('click', () => {
      app.querySelectorAll('.dp-channel').forEach((e) => e.classList.remove('selected'));
      el.classList.add('selected');
      window.UISound?.select();
      withViewTransition(() => { renderSettingsPanel(id, el.dataset.settings); });
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
    stats: () => renderStatsPage(guildId, body),
    auditlog: () => renderAuditLogPage(guildId, body),
    embedbuilder: () => renderEmbedBuilderPage(guildId, body),
    botstatus: () => renderBotStatusPage(body),
    templates: () => renderTemplatesPage(guildId, body),
    customcommands: () => renderCustomCommandsPage(guildId, body),
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
          <span>Verification anti-bot avant validation</span>
          <input type="checkbox" id="dp-ctx-captcha" ${config?.captchaEnabled === false ? '' : 'checked'} />
        </div>
        <label style="margin-top:10px;">Type de captcha</label>
        <select id="dp-ctx-captcha-type">
          <option value="emoji" ${config?.captchaType === 'image' ? '' : 'selected'}>Emoji (clique sur le bon symbole)</option>
          <option value="image" ${config?.captchaType === 'image' ? 'selected' : ''}>Image (recopier un code)</option>
        </select>
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
          captchaType: document.getElementById('dp-ctx-captcha-type').value,
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

function dashboardAccessRows(userIds) {
  return userIds.map((uid) => `
    <div class="row" data-uid="${uid}" style="justify-content:space-between; margin-bottom:6px;">
      <span class="muted">${escapeHtml(uid)}</span>
      <button class="btn danger delete-dashboard-access" data-uid="${uid}">Retirer</button>
    </div>
  `).join('') || '<p class="muted">Aucun acces delegue.</p>';
}

async function renderPermissionsPage(id, container = app) {
  container.innerHTML = '<p class="muted">Chargement...</p>';
  const [channels, roles, config] = await Promise.all([Api.channels(id), Api.roles(id), Api.config(id)]);
  const editableChannels = channels.filter((c) => c.type === 0 || c.type === 2 || c.type === 4);
  const roleOptions = roles.filter((r) => r.name !== '@everyone').map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
  const channelCheckboxes = editableChannels.map((c) => `
    <label><input type="checkbox" value="${c.id}" class="perm-channel" /> ${c.type === 4 ? '📁' : c.type === 2 ? '🔊' : '#'} ${escapeHtml(c.name)}</label>
  `).join('');
  const presetOptions = PERMISSION_PRESETS.map((p) => `<option value="${p.key}">${escapeHtml(p.label)}</option>`).join('');
  const channelOptionsSimple = editableChannels.map((c) => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');
  let dashboardAllowedUserIds = config?.dashboardAllowedUserIds || [];

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

      ${sectionHtml('Acces au dashboard (au-dela d\'Administrator Discord)', `
        <p class="muted">Donne acces a ce dashboard a des membres specifiques (par ID Discord) meme s'ils n'ont pas la permission Administrator sur le serveur. Ils pourront tout configurer ici, comme un administrateur du dashboard.</p>
        <div id="dashboard-access-list">${dashboardAccessRows(dashboardAllowedUserIds)}</div>
        <div class="row" style="margin-top:10px;">
          <input type="text" id="new-dashboard-access-id" placeholder="ID Discord du membre" style="flex:1;" />
          <button class="btn secondary" id="add-dashboard-access">Ajouter</button>
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

  const refreshDashboardAccessRows = () => {
    document.getElementById('dashboard-access-list').innerHTML = dashboardAccessRows(dashboardAllowedUserIds);
    wireDashboardAccessDeleteButtons();
  };
  function wireDashboardAccessDeleteButtons() {
    document.querySelectorAll('.delete-dashboard-access').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          dashboardAllowedUserIds = dashboardAllowedUserIds.filter((uid) => uid !== btn.dataset.uid);
          await Api.updateConfig(id, { dashboardAllowedUserIds });
          refreshDashboardAccessRows();
          showToast('Acces retire.');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  }
  document.getElementById('add-dashboard-access').addEventListener('click', async () => {
    const uid = document.getElementById('new-dashboard-access-id').value.trim();
    if (!/^\d{5,25}$/.test(uid)) { showToast('ID Discord invalide.', 'error'); return; }
    if (dashboardAllowedUserIds.includes(uid)) { showToast('Deja dans la liste.', 'error'); return; }
    try {
      dashboardAllowedUserIds = [...dashboardAllowedUserIds, uid];
      await Api.updateConfig(id, { dashboardAllowedUserIds });
      refreshDashboardAccessRows();
      document.getElementById('new-dashboard-access-id').value = '';
      showToast('Acces accorde.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  wireDashboardAccessDeleteButtons();
}

const WEBHOOK_EVENT_LABELS = {
  member_join: "Arrivee d'un membre",
  member_leave: "Depart d'un membre",
  mod_action: 'Action de moderation',
};

function webhookRows(webhooks) {
  return webhooks.map((w, i) => `
    <div class="row" data-index="${i}" style="justify-content:space-between; margin-bottom:6px;">
      <span>${escapeHtml(WEBHOOK_EVENT_LABELS[w.event] || w.event)} → <span class="muted">${escapeHtml(w.url)}</span></span>
      <button class="btn danger delete-webhook" data-index="${i}">Supprimer</button>
    </div>
  `).join('') || '<p class="muted">Aucun webhook configure.</p>';
}

/* ---------- Pages: roles de jeu ---------- */

function wireReactionRoleRows(root) {
  root.querySelectorAll('.rr-remove').forEach((btn) => {
    btn.onclick = () => btn.closest('.reaction-role-row').remove();
  });
}

function reactionRoleRowHtml(row = {}) {
  return `
    <div class="reaction-role-row">
      <input type="text" class="rr-role-id" placeholder="ID du role" maxlength="32" value="${escapeHtml(row.roleId || '')}" />
      <input type="text" class="rr-label" placeholder="Libelle affiche" maxlength="100" value="${escapeHtml(row.label || '')}" />
      <input type="text" class="rr-emoji" placeholder="Emoji" maxlength="8" value="${escapeHtml(row.emoji || '')}" />
      <button type="button" class="btn danger rr-remove" title="Supprimer">✕</button>
    </div>`;
}

async function renderGameRolesPage(id, container = app) {
  container.innerHTML = '<p class="muted">Chargement...</p>';
  const [roles, catalog, allRoles, channels, reactionGroups] = await Promise.all([
    Api.gameRoles(id), Api.gameRoleCatalog(), Api.roles(id).catch(() => []),
    Api.channels(id).catch(() => []), Api.reactionRoleGroups(id).catch(() => []),
  ]);
  const roleName = (rid) => allRoles.find((r) => r.id === rid)?.name || rid;
  const textChannelOptions = channels.filter((c) => c.type === 0)
    .map((c) => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');
  const reactionGroupRows = reactionGroups.map((g) => `
    <div class="row" data-id="${g.id}" style="justify-content:space-between; margin-bottom:6px; align-items:flex-start;">
      <span>${escapeHtml(g.title)} — ${g.roles.map((r) => escapeHtml(roleName(r.roleId))).join(', ')}</span>
      <button class="btn danger delete-reaction-group" data-id="${g.id}">Supprimer</button>
    </div>
  `).join('') || '<p class="muted">Aucun groupe de roles-reaction pour le moment.</p>';

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

      ${sectionHtml('Roles-reaction personnalises', `
        <p class="muted">Groupes de roles au choix (pas limites aux jeux), poses en salon via un menu de selection. Clic droit sur un role dans Discord (mode developpeur) &gt; Copier l'ID.</p>
        <div id="reaction-groups-list">${reactionGroupRows}</div>
        <label style="margin-top:14px;">Titre du groupe</label>
        <input type="text" id="rr-title" placeholder="Ex: Notifications" maxlength="100" />
        <label>Salon de destination</label>
        <select id="rr-channel">${textChannelOptions}</select>
        <label>Roles proposes</label>
        <div id="reaction-role-rows"></div>
        <button type="button" class="btn secondary" id="rr-add-role" style="margin-top:8px;">+ Ajouter un role</button>
        <button type="button" class="btn" id="rr-create" style="margin-top:12px;">Creer et poster</button>
      `)}
    </div>
  `;
  wireSections(container);

  document.getElementById('rr-add-role').addEventListener('click', () => {
    document.getElementById('reaction-role-rows').insertAdjacentHTML('beforeend', reactionRoleRowHtml());
    wireReactionRoleRows(container);
  });
  document.getElementById('reaction-role-rows').insertAdjacentHTML('beforeend', reactionRoleRowHtml());
  wireReactionRoleRows(container);

  document.getElementById('rr-create').addEventListener('click', async () => {
    const title = document.getElementById('rr-title').value.trim();
    const channelId = document.getElementById('rr-channel').value;
    const rows = [...document.querySelectorAll('.reaction-role-row')].map((row) => ({
      roleId: row.querySelector('.rr-role-id').value.trim(),
      label: row.querySelector('.rr-label').value.trim(),
      emoji: row.querySelector('.rr-emoji').value.trim(),
    })).filter((r) => r.roleId && r.label);
    if (!channelId || !rows.length) { showToast('Salon et au moins un role (ID + libelle) requis.', 'error'); return; }
    try {
      await Api.createReactionRoleGroup(id, { title, channelId, roles: rows });
      showToast('Groupe cree, poste sous quelques secondes.');
      await renderGameRolesPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  container.querySelectorAll('.delete-reaction-group').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Supprimer ce groupe ? Le message existant restera mais ne sera plus gere.')) return;
      try {
        await Api.deleteReactionRoleGroup(id, btn.dataset.id);
        showToast('Groupe supprime.');
        await renderGameRolesPage(id, container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

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
    shopItems, economyAccounts,
  ] = await Promise.all([
    Api.modConfig(id), Api.roles(id), Api.channels(id), Api.levelRoles(id), Api.referralRoles(id),
    Api.referrals(id), Api.streamers(id), Api.scheduled(id), Api.tickets(id), Api.config(id),
    Api.shopItems(id).catch(() => []), Api.economyAccounts(id).catch(() => ({})),
  ]);

  const roleOptions = (selected) => roles.filter((r) => r.name !== '@everyone')
    .map((r) => `<option value="${r.id}" ${r.id === selected ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('');
  const textChannelOptions = channels.filter((c) => c.type === 0)
    .map((c) => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');
  const channelName = (cid) => {
    const c = channels.find((ch) => ch.id === cid);
    return c ? `${c.type === 2 ? '🔊' : '#'}${c.name}` : cid;
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

  const shopItemRows = shopItems.map((it) => `
    <div class="row" data-id="${it.id}" style="justify-content:space-between; margin-bottom:6px;">
      <span>${escapeHtml(it.name)} — 🪙 ${it.price}${it.roleId ? ` → ${escapeHtml(roleName(it.roleId))}` : ''}</span>
      <button class="btn danger delete-shop-item" data-id="${it.id}">Supprimer</button>
    </div>
  `).join('') || '<p class="muted">Aucun article en boutique.</p>';

  const economyLeaderboard = Object.entries(economyAccounts)
    .sort((a, b) => b[1].balance - a[1].balance).slice(0, 10);
  const economyLeaderboardRows = economyLeaderboard.map(([userId, acc], i) => `
    <div class="row" style="justify-content:space-between; margin-bottom:4px;">
      <span class="muted">${i + 1}. ${escapeHtml(userId)}</span><span>🪙 ${acc.balance}</span>
    </div>
  `).join('') || '<p class="muted">Aucune donnee pour le moment.</p>';

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
      <span>${channelName(t.channelId)} — ${new Date(t.runAt).toLocaleString('fr-FR')}${t.repeatIntervalMs === 86400000 ? ' (tous les jours)' : t.repeatIntervalMs ? ' (recurrent)' : ''}<br /><span class="muted">${t.embeds?.length ? `${t.embeds.length} embed(s)${t.message ? ' + texte' : ''}` : escapeHtml(t.message || '').slice(0, 80)}</span></span>
      <button class="btn danger delete-scheduled" data-id="${t.id}">Supprimer</button>
    </div>
  `).join('') || '<p class="muted">Aucune annonce programmee.</p>';

  const ticketRows = tickets.map((t) => `
    <div class="row" data-id="${t.id}" style="justify-content:space-between; margin-bottom:6px;">
      <span>${channelName(t.channelId)} <span class="muted">(${escapeHtml(t.userId)})</span> — <span class="badge ${t.status === 'open' ? 'configured' : 'not-configured'}">${t.status === 'open' ? 'Ouvert' : 'Ferme'}</span>${t.assignedToTag ? ` <span class="muted">— pris en charge par ${escapeHtml(t.assignedToTag)}</span>` : ''}${t.rating ? ` <span class="muted">— ${'⭐'.repeat(t.rating)}</span>` : ''}</span>
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

      ${sectionHtml('Arrivee & statut du bot', `
        <label>Role attribue automatiquement a l'arrivee (en plus du reglement)</label>
        <select id="auto-role-select">
          <option value="">Aucun</option>
          ${roleOptions(config?.autoRoleId)}
        </select>
        <button class="btn secondary" id="save-auto-role" style="margin-top:8px;">Enregistrer</button>

        <label style="margin-top:18px;">Statuts du bot (un par ligne, tournent automatiquement)</label>
        <textarea id="bot-statuses" placeholder="Regarde ServeurCreator&#10;/setup pour demarrer&#10;{membercount} membres">${escapeHtml((config?.botStatuses || []).join('\n'))}</textarea>
        <p class="muted">Variable disponible : {membercount}</p>
        <button class="btn secondary" id="save-bot-statuses" style="margin-top:8px;">Enregistrer</button>

        <label style="margin-top:18px;">Salon des annonces d'anniversaire (/birthday)</label>
        <select id="birthday-channel-select">
          <option value="">Meme salon que bienvenue/depart</option>
          ${textChannelOptions}
        </select>
        <button class="btn secondary" id="save-birthday-channel" style="margin-top:8px;">Enregistrer</button>

        <label style="margin-top:18px;">Salon des suggestions (/suggest)</label>
        <select id="suggestions-channel-select">
          <option value="">Aucun</option>
          ${textChannelOptions}
        </select>
        <button class="btn secondary" id="save-suggestions-channel" style="margin-top:8px;">Enregistrer</button>

        <label style="margin-top:18px;">Salon vocal "compteur de membres" (verrouille, nom auto)</label>
        ${config?.memberCountChannelId ? `<p class="muted">Salon actif : ${channelName(config.memberCountChannelId)} (mise a jour toutes les ~10 minutes).</p>` : `
          <input type="text" id="membercount-template" placeholder="Modele de nom" value="👥 Membres : {count}" />
          <p class="muted">Variable disponible : {count}</p>
          <button class="btn secondary" id="create-membercount-channel" style="margin-top:8px;">Creer le salon compteur</button>
        `}
      `)}

      ${sectionHtml('Webhooks sortants', `
        <p class="muted">Envoie une requete POST JSON vers une URL externe a chaque evenement choisi (arrivee, depart, action de moderation).</p>
        <div id="webhooks-list">${webhookRows(config?.outgoingWebhooks || [])}</div>
        <div class="row" style="margin-top:10px;">
          <select id="new-webhook-event">
            <option value="member_join">Arrivee d'un membre</option>
            <option value="member_leave">Depart d'un membre</option>
            <option value="mod_action">Action de moderation</option>
          </select>
          <input type="text" id="new-webhook-url" placeholder="https://..." style="flex:1; min-width:220px;" />
          <button class="btn secondary" id="add-webhook">Ajouter</button>
        </div>
      `)}

      ${sectionHtml('Economie : boutique (/shop, /daily, /pay, /balance)', `
        <p class="muted">Les membres gagnent des pieces via /daily, peuvent en envoyer via /pay, et les depenser ici. Un article peut donner un role automatiquement.</p>
        <div id="shop-items-list">${shopItemRows}</div>
        <div class="row" style="margin-top:10px;">
          <input type="text" id="new-shop-name" placeholder="Nom de l'article" style="flex:1; min-width:160px;" />
          <input type="number" id="new-shop-price" placeholder="Prix" min="1" style="width:100px;" />
          <select id="new-shop-role">
            <option value="">Aucun role</option>
            ${roleOptions()}
          </select>
          <button class="btn secondary" id="add-shop-item">Ajouter</button>
        </div>
        <h2 style="margin-top:18px; font-size:0.85rem;">Classement richesse</h2>
        <div id="economy-leaderboard">${economyLeaderboardRows}</div>
      `)}

      ${sectionHtml('Auto-moderation', `
        <div class="dp-toggle-row"><span>Auto-moderation active</span><input type="checkbox" id="am-enabled" ${modConfig.autoModEnabled ? 'checked' : ''} /></div>
        <div class="dp-toggle-row" style="margin-top:6px;"><span>Bloquer les liens d'invitation Discord</span><input type="checkbox" id="am-invites" ${modConfig.blockInvites ? 'checked' : ''} /></div>
        <div class="dp-toggle-row" style="margin-top:6px;"><span>Bloquer tous les liens</span><input type="checkbox" id="am-links" ${modConfig.blockLinks ? 'checked' : ''} /></div>
        <label>Seuil anti-spam (messages)</label>
        <input type="number" id="am-spam-threshold" value="${modConfig.spamMessageThreshold}" min="1" />
        <label>Mots bannis (separes par des virgules, prefixe "re:" pour une regex)</label>
        <textarea id="am-banned-words">${escapeHtml((modConfig.bannedWords || []).join(', '))}</textarea>
        <label>Domaines autorises meme si "Bloquer tous les liens" est actif (separes par des virgules)</label>
        <textarea id="am-link-whitelist" placeholder="youtube.com, twitch.tv">${escapeHtml((modConfig.linkWhitelist || []).join(', '))}</textarea>
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

  document.getElementById('save-auto-role').addEventListener('click', async () => {
    try {
      await Api.updateConfig(id, { autoRoleId: document.getElementById('auto-role-select').value || null });
      showToast('Auto-role enregistre.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('save-bot-statuses').addEventListener('click', async () => {
    try {
      const botStatuses = document.getElementById('bot-statuses').value.split('\n').map((s) => s.trim()).filter(Boolean);
      await Api.updateConfig(id, { botStatuses });
      showToast('Statuts enregistres.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('save-birthday-channel').addEventListener('click', async () => {
    try {
      await Api.updateConfig(id, { birthdayChannelId: document.getElementById('birthday-channel-select').value || null });
      showToast('Salon d\'anniversaire enregistre.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('save-suggestions-channel').addEventListener('click', async () => {
    try {
      await Api.updateConfig(id, { suggestionsChannelId: document.getElementById('suggestions-channel-select').value || null });
      showToast('Salon de suggestions enregistre.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  let currentWebhooks = config?.outgoingWebhooks || [];
  const refreshWebhookRows = () => {
    document.getElementById('webhooks-list').innerHTML = webhookRows(currentWebhooks);
    wireWebhookDeleteButtons();
  };
  function wireWebhookDeleteButtons() {
    document.querySelectorAll('.delete-webhook').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          currentWebhooks = currentWebhooks.filter((_, i) => i !== Number(btn.dataset.index));
          await Api.updateConfig(id, { outgoingWebhooks: currentWebhooks });
          refreshWebhookRows();
          showToast('Webhook supprime.');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  }
  document.getElementById('add-webhook').addEventListener('click', async () => {
    const url = document.getElementById('new-webhook-url').value.trim();
    if (!url) { showToast('URL requise.', 'error'); return; }
    try {
      const event = document.getElementById('new-webhook-event').value;
      currentWebhooks = [...currentWebhooks, { event, url }];
      await Api.updateConfig(id, { outgoingWebhooks: currentWebhooks });
      refreshWebhookRows();
      document.getElementById('new-webhook-url').value = '';
      showToast('Webhook ajoute.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  wireWebhookDeleteButtons();

  document.getElementById('add-shop-item').addEventListener('click', async () => {
    const name = document.getElementById('new-shop-name').value.trim();
    const price = Number(document.getElementById('new-shop-price').value);
    const roleId = document.getElementById('new-shop-role').value || null;
    if (!name || !price || price < 1) { showToast('Nom et prix valides requis.', 'error'); return; }
    try {
      await Api.addShopItem(id, { name, price, roleId });
      showToast('Article ajoute.');
      await renderAutomationsPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  container.querySelectorAll('.delete-shop-item').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await Api.deleteShopItem(id, btn.dataset.id);
        showToast('Article supprime.');
        await renderAutomationsPage(id, container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  document.getElementById('create-membercount-channel')?.addEventListener('click', async () => {
    try {
      const template = document.getElementById('membercount-template').value.trim() || '👥 Membres : {count}';
      await Api.createMemberCountChannel(id, template);
      showToast('Salon compteur cree.');
      await renderAutomationsPage(id, container);
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
        linkWhitelist: document.getElementById('am-link-whitelist').value.split(',').map((w) => w.trim()).filter(Boolean),
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

/* ---------- Pages: logs d'audit ---------- */

function resolveMentions(text, members, roles) {
  const resolved = String(text || '')
    .replace(/<@&(\d+)>/g, (_, roleId) => `@${(roles.find((r) => r.id === roleId) || {}).name || 'role'}`)
    .replace(/<@(\d+)>/g, (_, userId) => `@${(members.find((m) => m.userId === userId) || {}).displayName || userId}`);
  return escapeHtml(resolved);
}

async function renderAuditLogPage(id, container = app) {
  container.innerHTML = '<p class="muted">Chargement...</p>';
  const [logs, members, roles] = await Promise.all([
    Api.auditLog(id), Api.members(id).catch(() => []), Api.roles(id).catch(() => []),
  ]);

  const rowHtml = (entry) => `
    <div class="audit-row">
      <div class="audit-row-header">
        <strong>${escapeHtml(entry.title)}</strong>
        <span class="muted">${new Date(entry.timestamp).toLocaleString('fr-FR')}</span>
      </div>
      <p class="muted" style="margin:4px 0 0;">${resolveMentions(entry.description, members, roles)}</p>
    </div>
  `;

  container.innerHTML = `
    <div class="inner">
      ${sectionHtml("Logs d'audit", `
        <p class="muted">Historique des actions de moderation et de configuration (200 dernieres).</p>
        <input type="text" id="audit-search" placeholder="Rechercher (titre, auteur, action...)" style="margin-bottom:10px;" />
        <div class="audit-log-list" id="audit-log-list">${logs.map(rowHtml).join('') || '<p class="muted">Aucune action enregistree pour le moment.</p>'}</div>
      `, { open: true })}
    </div>
  `;
  wireSections(container);

  document.getElementById('audit-search').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    const filtered = q
      ? logs.filter((l) => `${l.title} ${l.description}`.toLowerCase().includes(q))
      : logs;
    document.getElementById('audit-log-list').innerHTML = filtered.map(rowHtml).join('') || '<p class="muted">Aucun resultat.</p>';
  });
}

/* ---------- Pages: statistiques ---------- */

function lineChartSvg(points, { width = 560, height = 140, color = '#5865f2' } = {}) {
  if (!points.length) return '<p class="muted">Pas encore de donnees.</p>';
  const max = Math.max(1, ...points);
  const min = Math.min(0, ...points);
  const range = max - min || 1;
  const stepX = points.length > 1 ? width / (points.length - 1) : 0;
  const coords = points.map((v, i) => {
    const x = points.length > 1 ? i * stepX : width / 2;
    const y = height - ((v - min) / range) * (height - 16) - 8;
    return [x, y];
  });
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const dots = coords.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="${color}" />`).join('');
  return `
    <svg viewBox="0 0 ${width} ${height}" class="stats-chart" preserveAspectRatio="none">
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2" />
      ${dots}
    </svg>`;
}

async function renderStatsPage(id, container = app) {
  container.innerHTML = '<p class="muted">Chargement...</p>';
  const stats = await Api.stats(id);

  const memberPoints = stats.map((s) => s.memberCount);
  const messagePoints = stats.map((s) => s.messageCount);
  const lastDate = stats.length ? stats[stats.length - 1].date : null;
  const firstDate = stats.length ? stats[0].date : null;

  container.innerHTML = `
    <div class="inner">
      ${sectionHtml('Membres', `
        <p class="muted">Evolution du nombre de membres (${stats.length} jour(s) enregistre(s)${firstDate ? `, depuis le ${firstDate}` : ''}).</p>
        ${lineChartSvg(memberPoints, { color: '#5865f2' })}
        ${lastDate ? `<p class="muted" style="margin-top:8px;">Dernier releve : ${lastDate} — ${memberPoints[memberPoints.length - 1]} membre(s)</p>` : ''}
      `, { open: true })}
      ${sectionHtml('Activite (messages/jour)', `
        <p class="muted">Nombre de messages envoyes par jour (hors bots).</p>
        ${lineChartSvg(messagePoints, { color: '#43aa8b' })}
      `, { open: true })}
    </div>
  `;
  wireSections(container);
}

/* ---------- Pages: generateur d'embed ---------- */

function hexToInt(hex) {
  return parseInt((hex || '#5865f2').replace('#', ''), 16) || 0;
}
function intToHex(color) {
  return `#${(color || 0x5865f2).toString(16).padStart(6, '0')}`;
}

function embedFieldRowHtml(field = {}) {
  return `
    <div class="embed-field-row">
      <input type="text" class="embed-field-name" placeholder="Nom du champ" maxlength="256" value="${escapeHtml(field.name || '')}" />
      <textarea class="embed-field-value" placeholder="Valeur du champ" maxlength="1024">${escapeHtml(field.value || '')}</textarea>
      <label class="embed-field-inline"><input type="checkbox" class="embed-field-inline-input" ${field.inline ? 'checked' : ''} /> Cote a cote</label>
      <button type="button" class="btn danger embed-field-remove" title="Supprimer ce champ">✕</button>
    </div>`;
}

function buildEmbedFromForm(root) {
  const val = (sel) => root.querySelector(sel)?.value?.trim() || '';
  const embed = {};
  const title = val('#embed-title');
  const description = val('#embed-description');
  const url = val('#embed-url');
  const authorName = val('#embed-author-name');
  const authorUrl = val('#embed-author-url');
  const authorIcon = val('#embed-author-icon');
  const footerText = val('#embed-footer-text');
  const footerIcon = val('#embed-footer-icon');
  const thumbnail = val('#embed-thumbnail');
  const image = val('#embed-image');
  const colorHex = root.querySelector('#embed-color')?.value;

  if (title) embed.title = title;
  if (description) embed.description = description;
  if (url) embed.url = url;
  embed.color = hexToInt(colorHex);
  if (authorName) embed.author = { name: authorName, url: authorUrl || undefined, icon_url: authorIcon || undefined };
  if (footerText) embed.footer = { text: footerText, icon_url: footerIcon || undefined };
  if (thumbnail) embed.thumbnail = { url: thumbnail };
  if (image) embed.image = { url: image };
  if (root.querySelector('#embed-timestamp')?.checked) embed.timestamp = true;

  const fields = [...root.querySelectorAll('.embed-field-row')].map((row) => ({
    name: row.querySelector('.embed-field-name').value.trim(),
    value: row.querySelector('.embed-field-value').value.trim(),
    inline: row.querySelector('.embed-field-inline-input').checked,
  })).filter((f) => f.name && f.value);
  if (fields.length) embed.fields = fields;

  return { embed, content: val('#embed-content') };
}

function embedPreviewHtml(embed) {
  const hex = intToHex(embed.color);
  const authorHtml = embed.author?.name ? `
    <div class="embed-preview-author">
      ${embed.author.icon_url ? `<img src="${escapeHtml(embed.author.icon_url)}" alt="" />` : ''}
      <span>${escapeHtml(embed.author.name)}</span>
    </div>` : '';
  const titleHtml = embed.title ? `<div class="embed-preview-title">${escapeHtml(embed.title)}</div>` : '';
  const descHtml = embed.description ? `<div class="embed-preview-desc">${escapeHtml(embed.description)}</div>` : '';
  const fieldsHtml = (embed.fields || []).length ? `
    <div class="embed-preview-fields">
      ${embed.fields.map((f) => `
        <div class="embed-preview-field${f.inline ? ' inline' : ''}">
          <div class="embed-preview-field-name">${escapeHtml(f.name)}</div>
          <div class="embed-preview-field-value">${escapeHtml(f.value)}</div>
        </div>`).join('')}
    </div>` : '';
  const imageHtml = embed.image?.url ? `<div class="embed-preview-image"><img src="${escapeHtml(embed.image.url)}" alt="" /></div>` : '';
  const thumbHtml = embed.thumbnail?.url ? `<div class="embed-preview-thumb"><img src="${escapeHtml(embed.thumbnail.url)}" alt="" /></div>` : '';
  const footerBits = [];
  if (embed.footer?.text) footerBits.push(escapeHtml(embed.footer.text));
  if (embed.timestamp) footerBits.push(new Date().toLocaleString('fr-FR'));
  const footerHtml = footerBits.length ? `
    <div class="embed-preview-footer">
      ${embed.footer?.icon_url ? `<img src="${escapeHtml(embed.footer.icon_url)}" alt="" />` : ''}
      <span>${footerBits.join(' • ')}</span>
    </div>` : '';

  const isEmpty = !authorHtml && !titleHtml && !descHtml && !fieldsHtml && !imageHtml && !thumbHtml && !footerHtml;

  return `
    <div class="embed-preview" style="border-left-color:${hex};">
      <div class="embed-preview-inner">
        ${thumbHtml}
        ${authorHtml}
        ${titleHtml}
        ${descHtml}
        ${fieldsHtml}
        ${imageHtml}
        ${footerHtml}
        ${isEmpty ? '<p class="muted" style="margin:0;">Remplis le formulaire pour voir l\'apercu.</p>' : ''}
      </div>
    </div>`;
}

function populateEmbedForm(root, embed = {}, content = '') {
  root.querySelector('#embed-content').value = content || '';
  root.querySelector('#embed-title').value = embed.title || '';
  root.querySelector('#embed-url').value = embed.url || '';
  root.querySelector('#embed-description').value = embed.description || '';
  root.querySelector('#embed-color').value = intToHex(embed.color);
  root.querySelector('#embed-author-name').value = embed.author?.name || '';
  root.querySelector('#embed-author-url').value = embed.author?.url || '';
  root.querySelector('#embed-author-icon').value = embed.author?.icon_url || '';
  root.querySelector('#embed-footer-text').value = embed.footer?.text || '';
  root.querySelector('#embed-footer-icon').value = embed.footer?.icon_url || '';
  root.querySelector('#embed-thumbnail').value = embed.thumbnail?.url || '';
  root.querySelector('#embed-image').value = embed.image?.url || '';
  root.querySelector('#embed-timestamp').checked = Boolean(embed.timestamp);
  root.querySelector('#embed-fields-list').innerHTML = (embed.fields || []).map(embedFieldRowHtml).join('');
  wireEmbedFieldRows(root);
  updateEmbedPreview(root);
}

function updateEmbedPreview(root) {
  const { embed } = buildEmbedFromForm(root);
  const state = root.__mb;
  if (state) {
    state.embeds[state.active] = embed;
    root.querySelector('#embed-preview-slot').innerHTML = state.embeds.map(embedPreviewHtml).join('');
  } else {
    root.querySelector('#embed-preview-slot').innerHTML = embedPreviewHtml(embed);
  }
}

function renderEmbedTabs(root) {
  const state = root.__mb;
  const tabsHtml = state.embeds.map((_, i) => `
    <button type="button" class="btn ${i === state.active ? '' : 'secondary'} embed-tab-btn" data-index="${i}" style="padding:6px 12px;">Embed ${i + 1}${state.embeds.length > 1 ? ` <span class="embed-tab-remove" data-index="${i}" title="Supprimer cet embed">✕</span>` : ''}</button>
  `).join('');
  const addBtn = state.embeds.length < 10 ? '<button type="button" class="btn secondary" id="embed-tab-add" style="padding:6px 12px;">+ Embed</button>' : '';
  root.querySelector('#embed-tabs').innerHTML = tabsHtml + addBtn;

  root.querySelectorAll('.embed-tab-remove').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      removeEmbedTab(root, Number(el.dataset.index));
    });
  });
  root.querySelectorAll('.embed-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchEmbedTab(root, Number(btn.dataset.index)));
  });
  const addTabBtn = root.querySelector('#embed-tab-add');
  if (addTabBtn) addTabBtn.addEventListener('click', () => addEmbedTab(root));
}

function switchEmbedTab(root, index) {
  const state = root.__mb;
  if (index === state.active) return;
  state.embeds[state.active] = buildEmbedFromForm(root).embed;
  state.active = index;
  populateEmbedForm(root, state.embeds[index] || {}, root.querySelector('#embed-content').value);
  renderEmbedTabs(root);
}

function addEmbedTab(root) {
  const state = root.__mb;
  if (state.embeds.length >= 10) return;
  state.embeds[state.active] = buildEmbedFromForm(root).embed;
  state.embeds.push({});
  state.active = state.embeds.length - 1;
  populateEmbedForm(root, {}, root.querySelector('#embed-content').value);
  renderEmbedTabs(root);
}

function removeEmbedTab(root, index) {
  const state = root.__mb;
  if (state.embeds.length <= 1) return;
  state.embeds.splice(index, 1);
  if (state.active >= state.embeds.length) state.active = state.embeds.length - 1;
  else if (state.active > index) state.active -= 1;
  populateEmbedForm(root, state.embeds[state.active] || {}, root.querySelector('#embed-content').value);
  renderEmbedTabs(root);
}

function wireEmbedFieldRows(root) {
  root.querySelectorAll('.embed-field-remove').forEach((btn) => {
    btn.onclick = () => { btn.closest('.embed-field-row').remove(); updateEmbedPreview(root); };
  });
}

async function renderEmbedBuilderPage(id, container = app) {
  container.innerHTML = '<p class="muted">Chargement...</p>';
  const [channels, templates] = await Promise.all([Api.channels(id), Api.embedTemplates(id).catch(() => [])]);
  const textChannels = channels.filter((c) => c.type === 0);
  const channelOptions = textChannels.map((c) => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');

  const templateRows = () => templates.map((t) => `
    <div class="row" data-id="${t.id}" style="justify-content:space-between; margin-bottom:6px;">
      <span>${escapeHtml(t.name)}</span>
      <span class="row">
        <button class="btn secondary embed-load-template" data-id="${t.id}">Charger</button>
        <button class="btn danger embed-delete-template" data-id="${t.id}">Supprimer</button>
      </span>
    </div>
  `).join('') || '<p class="muted">Aucun modele enregistre.</p>';

  container.innerHTML = `
    <div class="inner" style="max-width:none;">
      <div class="embed-builder-layout">
        <div class="embed-builder-form">
          <div class="dp-block">
            <p class="dp-block-title">📨 Message</p>
            <label>Texte au-dessus des embeds (optionnel)</label>
            <textarea id="embed-content" placeholder="Texte simple, en plus des embeds"></textarea>
          </div>

          <div class="row" id="embed-tabs" style="flex-wrap:wrap; gap:6px; margin-bottom:10px;"></div>

          <div class="dp-block">
            <p class="dp-block-title">📝 Contenu principal</p>
            <label>Titre</label>
            <input type="text" id="embed-title" maxlength="256" placeholder="Titre de l'embed" />
            <label>Lien du titre</label>
            <input type="text" id="embed-url" placeholder="https://..." />
            <label>Description</label>
            <textarea id="embed-description" maxlength="4096" placeholder="Texte principal (markdown Discord supporte)"></textarea>
            <label>Couleur</label>
            <input type="color" id="embed-color" value="#5865f2" />
          </div>

          <div class="dp-block">
            <p class="dp-block-title">👤 Auteur</p>
            <label>Nom</label>
            <input type="text" id="embed-author-name" maxlength="256" placeholder="Nom affiche en haut" />
            <label>Lien</label>
            <input type="text" id="embed-author-url" placeholder="https://..." />
            <label>Icone (URL)</label>
            <input type="text" id="embed-author-icon" placeholder="https://..." />
          </div>

          <div class="dp-block">
            <p class="dp-block-title">🖼️ Images</p>
            <label>Miniature (petite image, en haut a droite)</label>
            <input type="text" id="embed-thumbnail" placeholder="https://..." />
            <label>Image (grande image, en bas)</label>
            <input type="text" id="embed-image" placeholder="https://..." />
          </div>

          <div class="dp-block">
            <p class="dp-block-title">📋 Champs</p>
            <div id="embed-fields-list"></div>
            <button type="button" class="btn secondary" id="embed-add-field" style="margin-top:8px;">+ Ajouter un champ</button>
          </div>

          <div class="dp-block">
            <p class="dp-block-title">🔻 Pied de page</p>
            <label>Texte</label>
            <input type="text" id="embed-footer-text" maxlength="2048" placeholder="Texte du pied de page" />
            <label>Icone (URL)</label>
            <input type="text" id="embed-footer-icon" placeholder="https://..." />
            <div class="dp-toggle-row" style="margin-top:10px;">
              <span>Inclure la date/heure actuelles</span>
              <input type="checkbox" id="embed-timestamp" />
            </div>
          </div>

          ${sectionHtml('Modeles enregistres', `
            <div id="embed-templates-list">${templateRows()}</div>
          `)}

          ${sectionHtml('JSON avance (import/export)', `
            <p class="muted">Colle un JSON d'embed pour le charger, ou copie celui genere par le formulaire.</p>
            <textarea id="embed-json" style="min-height:160px;" placeholder='{"title": "...", "description": "...", "color": 5793266}'></textarea>
            <div class="row" style="margin-top:8px;">
              <button type="button" class="btn secondary" id="embed-json-apply">Appliquer ce JSON</button>
              <button type="button" class="btn secondary" id="embed-json-copy">Copier le JSON actuel</button>
            </div>
          `)}
        </div>

        <div class="embed-builder-preview-wrap">
          <p class="muted" style="margin-top:0;">Apercu en direct</p>
          <div id="embed-preview-slot"></div>
          <label style="margin-top:14px;">Salon de destination</label>
          <select id="embed-target-channel">${channelOptions}</select>
          <label style="margin-top:10px;">ID du message a editer (optionnel — laisse vide pour poster un nouveau message)</label>
          <input type="text" id="embed-target-message-id" placeholder="Clic droit sur le message > Copier l'ID" />
          <button class="btn secondary" id="embed-load-message-btn" style="margin-top:8px; width:100%;">📥 Charger le contenu de ce message</button>
          <button class="btn" id="embed-post-btn" style="margin-top:10px; width:100%;">🚀 Poster dans Discord</button>
          <button class="btn secondary" id="embed-save-template-btn" style="margin-top:8px; width:100%;">💾 Enregistrer comme modele</button>

          <div class="dp-toggle-row" style="margin-top:14px;">
            <span>Programmer l'envoi</span>
            <input type="checkbox" id="embed-schedule-toggle" />
          </div>
          <div id="embed-schedule-fields" style="display:none; margin-top:8px;">
            <label>Date et heure</label>
            <input type="datetime-local" id="embed-schedule-date" />
            <div class="dp-toggle-row" style="margin-top:8px;">
              <span>Repeter tous les jours a cette heure</span>
              <input type="checkbox" id="embed-schedule-daily" />
            </div>
            <button class="btn" id="embed-schedule-btn" style="margin-top:8px; width:100%;">🗓️ Programmer</button>
          </div>
        </div>
      </div>
    </div>
  `;
  wireSections(container);

  container.__mb = { embeds: [{}], active: 0 };
  renderEmbedTabs(container);

  container.querySelectorAll('input, textarea').forEach((el) => {
    el.addEventListener('input', () => updateEmbedPreview(container));
  });
  container.querySelector('#embed-target-message-id').addEventListener('input', (e) => {
    container.querySelector('#embed-post-btn').textContent = e.target.value.trim()
      ? '✏️ Mettre a jour le message'
      : '🚀 Poster dans Discord';
  });

  container.querySelector('#embed-add-field').addEventListener('click', () => {
    if (container.querySelectorAll('.embed-field-row').length >= 25) {
      showToast('Maximum 25 champs (limite Discord).', 'error');
      return;
    }
    container.querySelector('#embed-fields-list').insertAdjacentHTML('beforeend', embedFieldRowHtml());
    wireEmbedFieldRows(container);
    updateEmbedPreview(container);
  });

  container.querySelector('#embed-load-message-btn').addEventListener('click', async () => {
    const channelId = container.querySelector('#embed-target-channel').value;
    const messageId = container.querySelector('#embed-target-message-id').value.trim();
    if (!channelId || !messageId) { showToast('Choisis un salon et renseigne un ID de message.', 'error'); return; }
    try {
      const { embeds, content } = await Api.getMessage(id, channelId, messageId);
      if (!embeds?.length) { showToast('Ce message ne contient pas d\'embed.', 'error'); return; }
      container.__mb = { embeds, active: 0 };
      populateEmbedForm(container, embeds[0], content || '');
      renderEmbedTabs(container);
      showToast('Message charge, modifie-le puis clique sur Mettre a jour.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  container.querySelector('#embed-post-btn').addEventListener('click', async () => {
    const channelId = container.querySelector('#embed-target-channel').value;
    const messageId = container.querySelector('#embed-target-message-id').value.trim();
    const state = container.__mb;
    state.embeds[state.active] = buildEmbedFromForm(container).embed;
    const embeds = state.embeds;
    const content = container.querySelector('#embed-content').value.trim();
    if (!channelId) { showToast('Choisis un salon.', 'error'); return; }
    if (!embeds.some((e) => e.title || e.description || (e.fields || []).length)) {
      showToast('Ajoute au moins un titre, une description ou un champ.', 'error');
      return;
    }
    try {
      if (messageId) {
        await Api.editEmbedMessage(id, channelId, messageId, embeds, content);
        showToast('Message mis a jour.');
      } else {
        await Api.postEmbed(id, channelId, embeds, content);
        showToast(`Embed${embeds.length > 1 ? 's' : ''} en cours d'envoi, actif sous quelques secondes.`);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  container.querySelector('#embed-schedule-toggle').addEventListener('change', (e) => {
    container.querySelector('#embed-schedule-fields').style.display = e.target.checked ? 'block' : 'none';
  });

  container.querySelector('#embed-schedule-btn').addEventListener('click', async () => {
    const channelId = container.querySelector('#embed-target-channel').value;
    const dateVal = container.querySelector('#embed-schedule-date').value;
    if (!channelId) { showToast('Choisis un salon.', 'error'); return; }
    if (!dateVal) { showToast('Choisis une date et une heure.', 'error'); return; }
    const state = container.__mb;
    state.embeds[state.active] = buildEmbedFromForm(container).embed;
    const embeds = state.embeds;
    const content = container.querySelector('#embed-content').value.trim();
    if (!embeds.some((e) => e.title || e.description || (e.fields || []).length)) {
      showToast('Ajoute au moins un titre, une description ou un champ.', 'error');
      return;
    }
    const runAt = new Date(dateVal).getTime();
    const daily = container.querySelector('#embed-schedule-daily').checked;
    try {
      await Api.addScheduled(id, {
        channelId, embeds, message: content, runAt, ...(daily ? { repeatIntervalMs: 86400000 } : {}),
      });
      showToast('Embed programme.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  container.querySelector('#embed-save-template-btn').addEventListener('click', async () => {
    const name = window.prompt('Nom du modele ?');
    if (!name) return;
    const { embed } = buildEmbedFromForm(container);
    try {
      await Api.saveEmbedTemplate(id, name, embed);
      showToast('Modele enregistre.');
      await renderEmbedBuilderPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  container.querySelectorAll('.embed-load-template').forEach((btn) => {
    btn.addEventListener('click', () => {
      const template = templates.find((t) => t.id === btn.dataset.id);
      if (template) {
        populateEmbedForm(container, template.embed, '');
        showToast('Modele charge.');
      }
    });
  });
  container.querySelectorAll('.embed-delete-template').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Supprimer ce modele ?')) return;
      try {
        await Api.deleteEmbedTemplate(id, btn.dataset.id);
        showToast('Modele supprime.');
        await renderEmbedBuilderPage(id, container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  container.querySelector('#embed-json-apply').addEventListener('click', () => {
    try {
      const parsed = JSON.parse(container.querySelector('#embed-json').value);
      populateEmbedForm(container, parsed, '');
      showToast('JSON applique.');
    } catch {
      showToast('JSON invalide.', 'error');
    }
  });
  container.querySelector('#embed-json-copy').addEventListener('click', () => {
    const { embed } = buildEmbedFromForm(container);
    container.querySelector('#embed-json').value = JSON.stringify(embed, null, 2);
    showToast('JSON mis a jour ci-dessous.');
  });

  wireEmbedFieldRows(container);
  updateEmbedPreview(container);
}

function formatUptime(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days) parts.push(`${days}j`);
  if (hours || days) parts.push(`${hours}h`);
  parts.push(`${minutes}min`);
  return parts.join(' ');
}

async function renderBotStatusPage(container = app) {
  container.innerHTML = '<p class="muted">Chargement...</p>';
  const status = await Api.botStatus().catch(() => null);

  if (!status) {
    container.innerHTML = `
      <div class="inner">
        ${sectionHtml('Statut du bot', '<p class="muted">Aucune donnee de statut disponible pour le moment.</p>')}
      </div>`;
    return;
  }

  const isOnline = Date.now() - status.updatedAt < 3 * 60_000;
  const ping = typeof status.ping === 'number' && status.ping >= 0 ? `${status.ping} ms` : 'N/A';

  container.innerHTML = `
    <div class="inner">
      ${sectionHtml('Statut du bot', `
        <div class="row" style="justify-content:space-between; margin-bottom:6px;">
          <span>Etat</span>
          <span class="badge ${isOnline ? 'configured' : 'not-configured'}">${isOnline ? '🟢 En ligne' : '🔴 Hors ligne'}</span>
        </div>
        <div class="row" style="justify-content:space-between; margin-bottom:6px;">
          <span>Uptime</span>
          <span>${formatUptime(Date.now() - status.startedAt)}</span>
        </div>
        <div class="row" style="justify-content:space-between; margin-bottom:6px;">
          <span>Ping Discord</span>
          <span>${ping}</span>
        </div>
        <div class="row" style="justify-content:space-between; margin-bottom:6px;">
          <span>Serveurs geres</span>
          <span>${status.guildCount ?? 'N/A'}</span>
        </div>
        <div class="row" style="justify-content:space-between; margin-bottom:6px;">
          <span>Version</span>
          <span>${escapeHtml(status.version || 'N/A')}</span>
        </div>
        <div class="row" style="justify-content:space-between;">
          <span>Derniere mise a jour</span>
          <span class="muted">${new Date(status.updatedAt).toLocaleString('fr-FR')}</span>
        </div>
      `)}
    </div>
  `;
  wireSections(container);
}

async function renderTemplatesPage(guildId, container = app) {
  container.innerHTML = '<p class="muted">Chargement...</p>';
  const templates = await Api.templates().catch(() => []);

  const rows = templates.map((t) => `
    <div class="row" data-id="${t.id}" style="justify-content:space-between; margin-bottom:6px;">
      <span>${escapeHtml(t.name)} <span class="muted">(source : ${escapeHtml(t.sourceGuildId)})</span></span>
      <button class="btn danger delete-template" data-id="${t.id}">Supprimer</button>
    </div>
  `).join('') || '<p class="muted">Aucun template enregistre.</p>';

  container.innerHTML = `
    <div class="inner">
      ${sectionHtml('Templates reutilisables', `
        <p class="muted">Un template est une copie vivante de la structure d'un serveur (roles, salons, permissions, textes) : elle reste a jour automatiquement et peut etre appliquee a n'importe quel nouveau serveur via la commande /setup (menu deroulant avec recherche).</p>
        <div id="templates-list">${rows}</div>
        <div class="row" style="margin-top:10px;">
          <input type="text" id="new-template-name" placeholder="Nom du template" style="flex:1;" />
          <button class="btn secondary" id="save-current-as-template">Enregistrer CE serveur comme template</button>
        </div>
      `, { open: true })}
    </div>
  `;
  wireSections(container);

  document.getElementById('save-current-as-template').addEventListener('click', async () => {
    const name = document.getElementById('new-template-name').value.trim();
    if (!name) { showToast('Nom requis.', 'error'); return; }
    try {
      await Api.saveTemplate(name, guildId);
      showToast('Template enregistre.');
      await renderTemplatesPage(guildId, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  container.querySelectorAll('.delete-template').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Supprimer ce template ?')) return;
      try {
        await Api.deleteTemplate(btn.dataset.id);
        showToast('Template supprime.');
        await renderTemplatesPage(guildId, container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

async function renderCustomCommandsPage(guildId, container = app) {
  container.innerHTML = '<p class="muted">Chargement...</p>';
  const [commands, roles] = await Promise.all([
    Api.customCommands(guildId).catch(() => []), Api.roles(guildId).catch(() => []),
  ]);
  const roleName = (rid) => roles.find((r) => r.id === rid)?.name || rid;
  const roleOptions = roles.filter((r) => r.name !== '@everyone')
    .map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');

  const rows = commands.map((c) => `
    <div class="row" data-id="${c.id}" style="justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
      <span>/${escapeHtml(c.name)} — <span class="muted">${escapeHtml(c.description)}</span>${c.requiredRoleId ? ` <span class="muted">(role requis : ${escapeHtml(roleName(c.requiredRoleId))})</span>` : ''}<br /><span class="muted">${escapeHtml(c.response).slice(0, 100)}</span></span>
      <button class="btn danger delete-custom-command" data-id="${c.id}">Supprimer</button>
    </div>
  `).join('') || '<p class="muted">Aucune commande personnalisee.</p>';

  container.innerHTML = `
    <div class="inner">
      ${sectionHtml('Commandes slash personnalisees (no-code)', `
        <p class="muted">Cree une commande /nom qui repond avec un texte fixe. Variables disponibles dans la reponse : {user}, {username}, {server}, {membercount}. Disponible en quelques minutes apres creation (Discord met a jour son cache de commandes).</p>
        <div id="custom-commands-list">${rows}</div>
        <label style="margin-top:14px;">Nom (minuscules, sans espace)</label>
        <input type="text" id="new-cmd-name" placeholder="regles" maxlength="32" />
        <label>Description</label>
        <input type="text" id="new-cmd-description" placeholder="Affiche les regles du serveur" maxlength="100" />
        <label>Reponse</label>
        <textarea id="new-cmd-response" placeholder="Bienvenue {user} ! Consulte les regles dans #reglement."></textarea>
        <label>Role requis (optionnel)</label>
        <select id="new-cmd-role">
          <option value="">Aucun</option>
          ${roleOptions}
        </select>
        <button class="btn" id="add-custom-command" style="margin-top:10px;">Creer la commande</button>
      `, { open: true })}
    </div>
  `;
  wireSections(container);

  document.getElementById('add-custom-command').addEventListener('click', async () => {
    const name = document.getElementById('new-cmd-name').value.trim().toLowerCase();
    const description = document.getElementById('new-cmd-description').value.trim();
    const response = document.getElementById('new-cmd-response').value.trim();
    const requiredRoleId = document.getElementById('new-cmd-role').value || null;
    if (!/^[a-z0-9_-]{1,32}$/.test(name)) { showToast('Nom invalide (minuscules, chiffres, - ou _ uniquement).', 'error'); return; }
    if (!description || !response) { showToast('Description et reponse requises.', 'error'); return; }
    try {
      await Api.addCustomCommand(guildId, {
        name, description, response, requiredRoleId,
      });
      showToast('Commande creee.');
      await renderCustomCommandsPage(guildId, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  container.querySelectorAll('.delete-custom-command').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Supprimer cette commande ?')) return;
      try {
        await Api.deleteCustomCommand(guildId, btn.dataset.id);
        showToast('Commande supprimee.');
        await renderCustomCommandsPage(guildId, container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

const GEN_STEP_ICONS = {
  template: '📋', role: '🎭', hierarchy: '📶', category: '📁', channel: '#',
  reglement: '📜', config: '⚙️', gameroles: '🎮', structures: '🏗️', done: '✅', error: '❌',
};

async function renderGenerateChoice(guildId, guildName) {
  app.innerHTML = '<p class="muted">Chargement...</p>';
  const savedTemplates = await Api.templates().catch(() => []);
  const templateOptions = [
    { key: 'live', label: 'Copie de ServeurCreator (a jour)' },
    ...savedTemplates.map((t) => ({ key: `live:${t.id}`, label: t.name })),
  ];

  app.innerHTML = `
    <div class="inner">
      ${sectionHtml(`Generer "${escapeHtml(guildName)}"`, `
        <p class="muted">Choisis un template : sa structure (roles, salons, permissions, textes) sera recreee en direct sur ce serveur.</p>
        <label>Template</label>
        <select id="gen-template">
          ${templateOptions.map((t) => `<option value="${t.key}">${escapeHtml(t.label)}</option>`).join('')}
        </select>
        <label>Texte du reglement (optionnel, sinon celui du template)</label>
        <textarea id="gen-reglement" placeholder="Laisse vide pour utiliser le reglement du template"></textarea>
        <div class="row" style="margin-top:16px;">
          <button class="btn secondary" id="gen-cancel">Annuler</button>
          <button class="btn" id="gen-launch">🪄 Lancer la generation</button>
        </div>
      `, { open: true })}
    </div>
  `;
  wireSections(app);

  document.getElementById('gen-cancel').addEventListener('click', () => {
    withViewTransition(() => renderGuildList());
  });
  document.getElementById('gen-launch').addEventListener('click', async () => {
    const templateKey = document.getElementById('gen-template').value;
    const reglementText = document.getElementById('gen-reglement').value.trim();
    const btn = document.getElementById('gen-launch');
    btn.disabled = true;
    try {
      await Api.generateServer(guildId, templateKey, reglementText || undefined);
      withViewTransition(() => renderGenerationScreen(guildId, guildName));
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
    }
  });
}

function renderGenerationScreen(guildId, guildName) {
  app.innerHTML = `
    <div class="inner">
      ${sectionHtml(`Generation de "${escapeHtml(guildName)}"`, `
        <div class="gen-status running" id="gen-status">
          <span class="gen-status-dot"></span>
          <span id="gen-status-text">En file d'attente...</span>
        </div>
        <div class="gen-timeline" id="gen-timeline"></div>
        <div class="gen-final-actions" id="gen-final-actions" style="display:none;"></div>
      `, { open: true })}
    </div>
  `;
  wireSections(app);

  const timelineEl = document.getElementById('gen-timeline');
  const statusEl = document.getElementById('gen-status');
  const statusTextEl = document.getElementById('gen-status-text');
  const finalActionsEl = document.getElementById('gen-final-actions');
  let renderedCount = 0;
  let stopped = false;

  function renderNewSteps(steps) {
    for (let i = renderedCount; i < steps.length; i += 1) {
      const step = steps[i];
      const row = document.createElement('div');
      row.className = `gen-step kind-${step.kind}`;
      row.innerHTML = `
        <span class="gen-step-icon">${GEN_STEP_ICONS[step.kind] || '•'}</span>
        <span class="gen-step-label">${escapeHtml(step.label)}</span>
        <span class="gen-step-time">${new Date(step.at).toLocaleTimeString('fr-FR')}</span>
      `;
      timelineEl.appendChild(row);
    }
    renderedCount = steps.length;
  }

  async function poll() {
    // Ce SPA remplace app.innerHTML sans hook de demontage : si l'utilisateur
    // a navigue ailleurs pendant qu'on attendait, timelineEl n'est plus dans
    // le document. Sans cette verification, le polling recursif continuerait
    // indefiniment en arriere-plan (requetes reseau orphelines).
    if (stopped || !document.body.contains(timelineEl)) return;
    try {
      const progress = await Api.generationProgress(guildId);
      if (progress?.steps) renderNewSteps(progress.steps);

      if (progress?.status === 'done') {
        stopped = true;
        statusEl.className = 'gen-status done';
        statusTextEl.textContent = 'Serveur genere avec succes !';
        finalActionsEl.style.display = 'flex';
        finalActionsEl.innerHTML = `<a class="btn" href="app.html?guild=${guildId}">Ouvrir le dashboard du serveur</a>`;
        window.UISound?.success?.();
        return;
      }
      if (progress?.status === 'error') {
        stopped = true;
        statusEl.className = 'gen-status error';
        statusTextEl.textContent = 'Erreur pendant la generation.';
        finalActionsEl.style.display = 'flex';
        finalActionsEl.innerHTML = '<button class="btn secondary" id="gen-retry">Reessayer</button>';
        document.getElementById('gen-retry').addEventListener('click', () => {
          withViewTransition(() => renderGenerateChoice(guildId, guildName));
        });
        window.UISound?.error?.();
        return;
      }
      if (progress?.status === 'running') statusTextEl.textContent = 'Generation en cours...';
    } catch (err) {
      // Erreur reseau transitoire : on reessaie au prochain tick plutot que
      // d'interrompre l'affichage sur un simple hoquet.
      console.error('generation poll', err);
    }
    setTimeout(poll, 1500);
  }

  poll();
}

/* ---------- Boot ---------- */

async function renderGuildDetail(id) {
  const guild = allGuilds.find((g) => g.guildId === id);
  if (!guild) {
    app.innerHTML = '<div class="inner"><div class="card"><p class="muted">Serveur introuvable ou non gere.</p></div></div>';
    return;
  }
  searchBox.style.display = 'none';
  await renderPreviewPage(id);
}

async function init() {
  try {
    const me = await Api.me();
    currentUser = me;
    document.getElementById('whoami').textContent = me.username;
    currentUserAvatarUrl = me.avatar
      ? `https://cdn.discordapp.com/avatars/${me.userId}/${me.avatar}.png?size=64`
      : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(me.userId) >> 22n) % 6n)}.png`;
    document.getElementById('user-avatar').src = currentUserAvatarUrl;
  } catch {
    return; // Api.me() redirige deja vers index.html sur 401
  }

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await Api.logout();
    location.href = 'index.html';
  });

  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  if (themeToggleBtn) {
    const systemPrefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
    const paintTheme = () => {
      const current = document.documentElement.getAttribute('data-theme') || (systemPrefersLight ? 'light' : 'dark');
      themeToggleBtn.textContent = current === 'light' ? '☀️' : '🌙';
    };
    paintTheme();
    themeToggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || (systemPrefersLight ? 'light' : 'dark');
      const next = current === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      paintTheme();
      window.UISound?.click();
    });
  }

  allGuilds = await Api.guilds();
  renderRail();

  if (guildId) {
    await renderGuildDetail(guildId);
  } else {
    await renderGuildList();
  }
}

init().catch((err) => {
  app.innerHTML = `<div class="inner"><div class="card"><p class="muted">Erreur : ${escapeHtml(err.message)}</p></div></div>`;
});
