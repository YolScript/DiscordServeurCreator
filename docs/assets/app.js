const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const guildId = params.get('guild');

const PERMISSION_CHOICES = [
  'ViewChannel', 'SendMessages', 'ReadMessageHistory', 'Connect', 'Speak',
  'ManageMessages', 'ManageChannels', 'ManageRoles', 'MentionEveryone',
  'AttachFiles', 'EmbedLinks', 'AddReactions', 'KickMembers', 'BanMembers', 'ModerateMembers',
];

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function renderGuildList() {
  const guilds = await Api.guilds();
  const rows = guilds.map((g) => {
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

  app.innerHTML = `
    <div class="card">
      <h2>Tes serveurs</h2>
      <p class="muted">Serveurs Discord ou tu es administrateur.</p>
      <div class="guild-list">${rows || '<p class="muted">Aucun serveur trouve.</p>'}</div>
    </div>
  `;
}

async function renderTextsTab(id) {
  const content = document.getElementById('tab-content');
  content.innerHTML = '<p class="muted">Chargement...</p>';
  const [config, channels] = await Promise.all([Api.config(id), Api.channels(id)]);
  const textChannels = channels.filter((c) => c.type === 0);
  const channelOptions = textChannels.map((c) => `<option value="${c.id}" ${config?.arrivalDepartureChannelId === c.id ? 'selected' : ''}>#${escapeHtml(c.name)}</option>`).join('');

  content.innerHTML = `
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

async function renderPermissionsTab(id) {
  const content = document.getElementById('tab-content');
  content.innerHTML = '<p class="muted">Chargement...</p>';
  const [channels, roles] = await Promise.all([Api.channels(id), Api.roles(id)]);
  const editableChannels = channels.filter((c) => c.type === 0 || c.type === 2 || c.type === 4);
  const roleOptions = roles.filter((r) => r.name !== '@everyone').map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
  const channelCheckboxes = editableChannels.map((c) => `
    <label><input type="checkbox" value="${c.id}" class="perm-channel" /> ${c.type === 4 ? '📁' : c.type === 2 ? '🔊' : '#'} ${escapeHtml(c.name)}</label>
  `).join('');
  const allowChecks = PERMISSION_CHOICES.map((p) => `<label><input type="checkbox" class="allow-perm" value="${p}" /> ${p}</label>`).join('');
  const denyChecks = PERMISSION_CHOICES.map((p) => `<label><input type="checkbox" class="deny-perm" value="${p}" /> ${p}</label>`).join('');
  const channelOptionsSimple = editableChannels.map((c) => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');

  content.innerHTML = `
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
  `;

  document.getElementById('apply-bulk').addEventListener('click', async () => {
    const channelIds = [...content.querySelectorAll('.perm-channel:checked')].map((el) => el.value);
    const roleId = document.getElementById('perm-role').value;
    const allow = [...content.querySelectorAll('.allow-perm:checked')].map((el) => el.value);
    const deny = [...content.querySelectorAll('.deny-perm:checked')].map((el) => el.value);
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

async function renderGameRolesTab(id) {
  const content = document.getElementById('tab-content');
  content.innerHTML = '<p class="muted">Chargement...</p>';
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

  content.innerHTML = `
    <div class="card">
      <h2>Roles de jeu detectes</h2>
      <p class="muted">Generes automatiquement quand un membre est vu en train de jouer.</p>
      ${rows || '<p class="muted">Aucun role de jeu pour le moment.</p>'}
    </div>
  `;

  content.querySelectorAll('.rename-btn').forEach((btn) => {
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
  content.querySelectorAll('.delete-btn').forEach((btn) => {
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

async function renderPresetsTab(id) {
  const content = document.getElementById('tab-content');
  content.innerHTML = '<p class="muted">Chargement...</p>';
  const [presets, channels] = await Promise.all([Api.channelPresets(), Api.channels(id)]);
  const categories = channels.filter((c) => c.type === 4);
  const categoryOptions = '<option value="">Aucune categorie</option>'
    + categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  const chips = presets.map((p) => `<button class="preset-chip" data-key="${p.key}" title="${escapeHtml(p.description)}">+ ${escapeHtml(p.name)}</button>`).join('');

  content.innerHTML = `
    <div class="card">
      <h2>Salons pregeneres</h2>
      <label>Categorie de destination</label>
      <select id="preset-category">${categoryOptions}</select>
      <div class="preset-grid" style="margin-top:12px;">${chips}</div>
    </div>
  `;

  content.querySelectorAll('.preset-chip').forEach((chip) => {
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

async function renderGuildDetail(id) {
  app.innerHTML = `
    <p><a href="app.html">&larr; Retour a la liste</a></p>
    <div class="tabs">
      <button class="tab-btn active" data-tab="textes">Textes &amp; Bienvenue</button>
      <button class="tab-btn" data-tab="permissions">Permissions</button>
      <button class="tab-btn" data-tab="jeux">Roles de jeu</button>
      <button class="tab-btn" data-tab="salons">Salons pregeneres</button>
    </div>
    <div id="tab-content"></div>
  `;

  const renderers = {
    textes: () => renderTextsTab(id),
    permissions: () => renderPermissionsTab(id),
    jeux: () => renderGameRolesTab(id),
    salons: () => renderPresetsTab(id),
  };

  app.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      app.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderers[btn.dataset.tab]();
    });
  });

  await renderTextsTab(id);
}

async function init() {
  try {
    const me = await Api.me();
    document.getElementById('whoami').textContent = me.username;
  } catch {
    return; // Api.me() redirige deja vers index.html sur 401
  }

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await Api.logout();
    location.href = 'index.html';
  });

  if (guildId) {
    await renderGuildDetail(guildId);
  } else {
    await renderGuildList();
  }
}

init().catch((err) => {
  app.innerHTML = `<div class="card"><p class="muted">Erreur : ${escapeHtml(err.message)}</p></div>`;
});
