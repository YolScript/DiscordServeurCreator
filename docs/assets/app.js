const app = document.getElementById('app');
const railEl = document.getElementById('topbar-guilds');
const searchBox = document.getElementById('search-box');
const searchInput = document.getElementById('search-input');

// Compteur de caracteres generique pour les champs a limite Discord
// (data-charcount). L'app re-rend #app.innerHTML en continu (pas de
// framework), donc un seul MutationObserver + une seule delegation
// d'evenement suffisent pour tout le site au lieu de re-cabler a chaque
// re-rendu individuel.
(function initCharCounters() {
  function updateCounter(el) {
    const counter = el.nextElementSibling;
    if (!counter || !counter.classList.contains('char-counter')) return;
    const max = Number(el.getAttribute('maxlength'));
    const len = el.value.length;
    counter.textContent = `${len}/${max}`;
    counter.classList.toggle('char-counter-near', len >= max * 0.9);
  }
  function wire(el) {
    if (el.dataset.charcountWired) return;
    el.dataset.charcountWired = '1';
    const counter = document.createElement('span');
    counter.className = 'char-counter';
    el.insertAdjacentElement('afterend', counter);
    updateCounter(el);
  }
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.matches?.('[data-charcount]')) wire(node);
        node.querySelectorAll?.('[data-charcount]').forEach(wire);
      });
    }
  });
  observer.observe(app, { childList: true, subtree: true });
  app.addEventListener('input', (e) => {
    if (e.target.matches('[data-charcount]')) updateCounter(e.target);
  });
}());

// Copie d'ID (salon/role) en un clic, delegue sur #app comme les compteurs
// de caracteres ci-dessus : marche sur tout le site sans re-cablage par
// re-rendu. Phase de capture (3e argument true) : le bouton est imbrique
// dans .dp-channel qui a son propre click (ouvre le salon) attache
// directement dessus - seule la capture (avant la bulle) permet de
// stopPropagation() a temps pour empecher ce click parent de se declencher.
app.addEventListener('click', async (e) => {
  const btn = e.target.closest('.dp-copy-id-btn');
  if (!btn) return;
  e.stopPropagation();
  e.preventDefault();
  try {
    await navigator.clipboard.writeText(btn.dataset.copyId);
    const original = btn.textContent;
    btn.textContent = btn.classList.contains('dp-copy-id-inline') ? '✓ Copie !' : '✓';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, 1200);
  } catch {
    showToast('Copie impossible (permission navigateur).', 'error');
  }
}, true);

// Champs d'URL (lien ou image) : accepte le glisser-deposer d'un lien ou
// d'une image venant d'une page web, et le Ctrl+V d'une image copiee sur le
// web (le navigateur fournit alors le HTML <img src=...> d'origine, dont on
// extrait le lien). Delegue sur #app comme les compteurs de caracteres :
// marche partout (generateur d'embed, webhooks...) sans re-cablage par
// re-rendu. Capture + stopPropagation : les zones parentes (#dp-main) ont
// leurs propres handlers de depose (salons/categories) a ne pas reveiller.
(function initUrlFieldDropPaste() {
  const isUrlInput = (el) => el?.matches?.('input[type=text]') && /https?:\/\//.test(el.placeholder || '');
  // Zones de texte markdown (description d'embed, valeur de champ...) : un
  // lien depose y devient, au choix, un lien cliquable [texte](url).
  const isMdArea = (el) => el?.matches?.('textarea[data-md-link]');
  const isHttpUrl = (s) => /^https?:\/\/\S+$/i.test(s);

  const setValue = (input, url) => {
    input.value = url;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    showToast('Lien insere.');
  };

  const insertAtCursor = (area, text) => {
    const start = area.selectionStart ?? area.value.length;
    const end = area.selectionEnd ?? start;
    area.value = area.value.slice(0, start) + text + area.value.slice(end);
    const pos = start + text.length;
    area.setSelectionRange(pos, pos);
    area.focus();
    area.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const imgSrcFromHtml = (html) => {
    if (!html) return '';
    const src = new DOMParser().parseFromString(html, 'text/html').querySelector('img[src]')?.src || '';
    return isHttpUrl(src) ? src : '';
  };

  const extractUrl = (dt) => {
    const uri = (dt.getData('text/uri-list') || '').split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'));
    if (uri && isHttpUrl(uri)) return uri;
    const fromHtml = imgSrcFromHtml(dt.getData('text/html'));
    if (fromHtml) return fromHtml;
    const text = (dt.getData('text/plain') || '').trim();
    return isHttpUrl(text) ? text : '';
  };

  app.addEventListener('dragover', (e) => {
    if (!isUrlInput(e.target) && !isMdArea(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    e.target.classList.add('drag-over');
  }, true);
  app.addEventListener('dragleave', (e) => {
    if (isUrlInput(e.target) || isMdArea(e.target)) e.target.classList.remove('drag-over');
  }, true);
  app.addEventListener('drop', (e) => {
    const isInput = isUrlInput(e.target);
    const isArea = isMdArea(e.target);
    if (!isInput && !isArea) return;
    e.preventDefault();
    e.stopPropagation();
    e.target.classList.remove('drag-over');
    const url = extractUrl(e.dataTransfer);
    if (!url) {
      if (e.dataTransfer.files?.length) {
        showToast("Fichier local : Discord a besoin d'un lien public. Poste l'image dans un salon Discord, puis clic droit > Copier le lien.", 'error');
      }
      return;
    }
    if (isInput) { setValue(e.target, url); return; }
    const label = window.prompt('Texte affiche pour ce lien cliquable ? (laisser vide pour coller le lien brut)', '');
    if (label === null) return;
    insertAtCursor(e.target, label.trim() ? `[${label.trim()}](${url})` : url);
    showToast(label.trim() ? 'Lien cliquable insere.' : 'Lien insere.');
  }, true);

  app.addEventListener('paste', (e) => {
    // Zone markdown : coller une URL seule propose aussi le lien cliquable.
    if (isMdArea(e.target)) {
      const text = (e.clipboardData.getData('text/plain') || '').trim();
      if (!isHttpUrl(text)) return; // texte normal : collage natif
      e.preventDefault();
      const label = window.prompt('Texte affiche pour ce lien cliquable ? (laisser vide pour coller le lien brut)', '');
      insertAtCursor(e.target, label && label.trim() ? `[${label.trim()}](${text})` : text);
      if (label && label.trim()) showToast('Lien cliquable insere.');
      return;
    }
    if (!isUrlInput(e.target)) return;
    const dt = e.clipboardData;
    if ((dt.getData('text/plain') || '').trim()) return; // lien texte : collage natif
    const fromHtml = imgSrcFromHtml(dt.getData('text/html'));
    if (fromHtml) { e.preventDefault(); setValue(e.target, fromHtml); return; }
    if (dt.files?.length) {
      e.preventDefault();
      showToast("Image sans lien source : poste-la dans un salon Discord, puis clic droit > Copier le lien.", 'error');
    }
  }, true);
}());

// ---------- Recherche globale Ctrl+K (roadmap n°012) ----------
// Contexte alimente par renderPreviewPage : modules + salons + roles du
// serveur courant, ouverts/reveles depuis une seule palette clavier.
const paletteCtx = { guildId: null, channels: [], roles: [] };

async function revealInSidebar(selector, panelSel) {
  if (!app.querySelector('.dp-sidebar')) await renderPreviewPage(paletteCtx.guildId);
  const el = app.querySelector(selector);
  const panel = app.querySelector(panelSel);
  if (!el || !panel) return;
  if (!panel.classList.contains('pinned')) {
    panel.classList.add('palette-reveal');
    setTimeout(() => panel.classList.remove('palette-reveal'), 3000);
  }
  el.scrollIntoView({ block: 'center' });
  el.classList.add('flash-highlight');
  setTimeout(() => el.classList.remove('flash-highlight'), 2400);
}

function paletteItems() {
  const gid = paletteCtx.guildId;
  if (!gid) return [];
  const items = HOME_MODULES.map((m) => ({
    icon: m.icon,
    label: m.label,
    hint: HOME_CATEGORIES.find((c) => c.id === m.category)?.label || 'Module',
    run: () => withViewTransition(() => renderSettingsPanel(gid, m.parent, m.section)),
  }));
  paletteCtx.channels.filter((c) => c.type !== 4).forEach((c) => {
    items.push({
      icon: c.type === 2 ? '🔊' : '#',
      label: c.name,
      hint: 'Salon',
      run: () => revealInSidebar(`.dp-channel[data-channel="${c.id}"]`, '.dp-sidebar'),
    });
  });
  paletteCtx.roles.forEach((r) => {
    items.push({
      icon: '🏷️',
      label: r.name,
      hint: 'Role',
      run: () => revealInSidebar(`.dp-role-row[data-role="${r.id}"]`, '.dp-roles-panel'),
    });
  });
  return items;
}

function openCommandPalette() {
  if (document.getElementById('cmdk-overlay') || !paletteCtx.guildId) return;
  const overlay = document.createElement('div');
  overlay.id = 'cmdk-overlay';
  overlay.innerHTML = `
    <div class="cmdk-box" role="dialog" aria-modal="true" aria-label="Recherche globale">
      <input type="text" id="cmdk-input" placeholder="Module, salon ou role... (Echap pour fermer)" aria-label="Recherche globale" autocomplete="off" />
      <div class="cmdk-list" id="cmdk-list"></div>
    </div>`;
  document.body.appendChild(overlay);
  const input = overlay.querySelector('#cmdk-input');
  const list = overlay.querySelector('#cmdk-list');
  const items = paletteItems();
  let filtered = items;
  let sel = 0;
  const close = () => overlay.remove();
  const renderList = () => {
    const visible = filtered.slice(0, 12);
    list.innerHTML = visible.map((it, i) => `
      <button type="button" class="cmdk-item${i === sel ? ' selected' : ''}" data-i="${i}">
        <span class="cmdk-icon">${it.icon}</span>
        <span class="cmdk-label">${escapeHtml(it.label)}</span>
        <span class="cmdk-hint">${escapeHtml(it.hint)}</span>
      </button>`).join('') || '<p class="muted" style="padding:12px 16px; margin:0;">Aucun resultat.</p>';
    list.querySelectorAll('.cmdk-item').forEach((el) => {
      el.addEventListener('click', () => {
        const it = visible[Number(el.dataset.i)];
        close();
        it.run();
      });
    });
  };
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    filtered = !q ? items : items.filter((it) => it.label.toLowerCase().includes(q));
    sel = 0;
    renderList();
  });
  input.addEventListener('keydown', (e) => {
    const max = Math.min(filtered.length, 12) - 1;
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, max); renderList(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); renderList(); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = filtered[sel]; if (it) { close(); it.run(); } }
    else if (e.key === 'Escape') close();
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  renderList();
  input.focus();
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openCommandPalette();
  }
});

// Pile de navigation entre modules (roadmap n°028) : "Retour" ramene au
// module precedent (utile apres un saut via Ctrl+K), sinon a l'accueil.
let currentPanelRef = null;
const panelNavStack = [];

// Version deployee (roadmap n°110) : commit courant en infobulle sur le logo
// - "le fix est-il en ligne ?" se verifie d'un survol.
fetch('https://api.github.com/repos/YolScript/DiscordServeurCreator/commits/master')
  .then((r) => (r.ok ? r.json() : null))
  .then((c) => {
    if (!c?.sha) return;
    const brand = document.querySelector('.topbar-brand');
    const when = new Date(c.commit.committer.date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    if (brand) brand.title = `Discord Serveur Creator — version ${c.sha.slice(0, 7)} du ${when}`;
  })
  .catch(() => {});

const params = new URLSearchParams(location.search);
const guildId = params.get('guild');

let allGuilds = [];
let currentUser = null;
let currentUserAvatarUrl = '';
let prefillChannelId = null;

// Etat de la conversation avec l'assistant IA : persiste tant qu'on reste sur
// le meme serveur (reinitialise au changement de serveur), independant du
// re-rendu complet de renderPreviewPage (retour depuis un outil, etc).
let aiConversationGuildId = null;
let aiConversation = [];
let aiPendingConfirmation = null;
let aiBusy = false;

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

function highlightMatch(text, query) {
  const safe = escapeHtml(text);
  if (!query) return safe;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return safe;
  const before = escapeHtml(text.slice(0, idx));
  const match = escapeHtml(text.slice(idx, idx + query.length));
  const after = escapeHtml(text.slice(idx + query.length));
  return `${before}<mark>${match}</mark>${after}`;
}

// Markdown "lite" pour les reponses de l'assistant IA : l'echappement HTML
// passe TOUJOURS en premier (securite), les transformations markdown
// n'ajoutent que des balises autour du texte deja echappe - aucune
// injection possible meme si l'IA renvoie du HTML litteral dans son texte.
function renderMarkdownLite(text) {
  const blocks = String(text ?? '').split(/```([\s\S]*?)```/g);
  return blocks.map((block, i) => {
    if (i % 2 === 1) {
      // Bloc de code : contenu litteral, aucune autre transformation dedans.
      const firstLine = block.split('\n')[0].trim();
      const rest = /^[a-zA-Z0-9_+-]{1,20}$/.test(firstLine) ? block.slice(firstLine.length + 1) : block;
      return `<pre class="dp-md-code-block"><code>${escapeHtml(rest.replace(/\n$/, ''))}</code></pre>`;
    }
    let html = escapeHtml(block);
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(?<![*\w])\*([^*\n]+)\*(?!\w)/g, '<em>$1</em>');
    html = html.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // Listes : regroupe les lignes consecutives commencant par -/* ou 1.
    const lines = html.split('\n');
    const out = [];
    let listBuf = [];
    let listTag = null;
    const flushList = () => {
      if (listBuf.length) out.push(`<${listTag}>${listBuf.map((li) => `<li>${li}</li>`).join('')}</${listTag}>`);
      listBuf = []; listTag = null;
    };
    for (const line of lines) {
      const bullet = line.match(/^[-*]\s+(.*)/);
      const numbered = line.match(/^\d+\.\s+(.*)/);
      if (bullet) { listTag = 'ul'; listBuf.push(bullet[1]); continue; }
      if (numbered) { listTag = listTag || 'ol'; listBuf.push(numbered[1]); continue; }
      flushList();
      out.push(line);
    }
    flushList();
    return out.join('<br>').replace(/(<\/(?:ul|ol)>)<br>/g, '$1').replace(/<br>(<(?:ul|ol)>)/g, '$1');
  }).join('');
}

function skeletonHtml(lines = 3) {
  const widths = ['100%', '92%', '60%'];
  return `<div class="skeleton-block">${Array.from({ length: lines }, (_, i) => `<div class="skeleton-line" style="width:${widths[i % widths.length]}"></div>`).join('')}</div>`;
}

function guildIconUrl(g) {
  return g.icon ? `https://cdn.discordapp.com/icons/${g.guildId}/${g.icon}.png?size=64` : null;
}

function memberAvatarUrl(m) {
  return m.avatar
    ? `https://cdn.discordapp.com/avatars/${m.userId}/${m.avatar}.png?size=32`
    : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(m.userId) >> 22n) % 6n)}.png`;
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
  // renderFn peut etre async (pages qui fetchent l'API) : ne surtout pas
  // retourner sa promesse a startViewTransition, sinon le navigateur gele
  // l'affichage jusqu'a la fin des appels reseau (clic "Retour" qui semble
  // ne rien faire pendant un cold start du backend) et avale tout rejet.
  // On capture seulement le passage synchrone au skeleton, et on remonte
  // les erreurs en toast au lieu de laisser la page muette.
  const run = () => Promise.resolve(renderFn()).catch((err) => {
    showToast(err?.message || 'Erreur de chargement.', 'error');
  });
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || !document.startViewTransition) {
    run();
    return;
  }
  document.startViewTransition(() => { run(); });
}

/* ---------- Modules (un seul actif a la fois, choisi depuis la grille d'accueil) ---------- */

// title n'est plus affiche (plus de barre d'en-tete a chevron) : conserve en
// parametre pour que chaque appel documente clairement de quel module il
// s'agit. La navigation entre modules se fait depuis la grille d'accueil du
// bot (HOME_MODULES), pas depuis une grille interne a la page.
function sectionHtml(title, bodyHtml, { id = '', alwaysOpen = false } = {}) {
  return `<div class="section-panel${alwaysOpen ? ' active' : ''}"${id ? ` id="section-${id}"` : ''}>${bodyHtml}</div>`;
}

/* ---------- Rail (guild switcher) ---------- */

function renderRail() {
  const managed = allGuilds.filter((g) => g.botPresent && g.configured);
  railEl.innerHTML = managed.map((g) => {
    const icon = guildIconUrl(g);
    const active = g.guildId === guildId;
    return `
      <button class="rail-guild${active ? ' active' : ''}" data-guild="${g.guildId}" title="${escapeHtml(g.name)}" aria-label="${escapeHtml(g.name)}">
        ${icon ? `<img src="${icon}" alt="" />` : escapeHtml(initials(g.name))}
      </button>`;
  }).join('');
  railEl.querySelectorAll('.rail-guild').forEach((btn) => {
    btn.addEventListener('click', () => { location.href = `app.html?guild=${btn.dataset.guild}`; });
  });
}

/* ---------- Pages: guild list ---------- */

const GUILD_GROUPS = [
  { key: 'toConfigure', label: 'A configurer', test: (g) => g.botPresent && !g.configured },
  { key: 'notInvited', label: 'Bot absent', test: (g) => !g.botPresent },
  { key: 'configured', label: 'Configures', test: (g) => g.botPresent && g.configured },
];

async function renderGuildList() {
  app.classList.remove('preview-fullbleed');
  searchBox.style.display = '';

  function guildRowHtml(g, delay, isFirstUrgent) {
    let badge = '<span class="badge not-invited" title="Ce serveur n\'a pas encore le bot">Bot absent</span>';
    let action = `<a class="btn secondary" href="${g.inviteUrl}" target="_blank" rel="noopener">Inviter le bot</a>`;
    if (g.botPresent) {
      badge = g.configured
        ? '<span class="badge configured" title="Salons et roles deja generes">Configure</span>'
        : '<span class="badge not-configured" title="Clique sur Generer pour creer les salons et roles">A configurer (/setup)</span>';
      action = g.configured
        ? `<span class="btn" aria-hidden="true">Gerer</span>`
        : `<button class="btn generate-server-btn" data-guild="${g.guildId}" data-name="${escapeHtml(g.name || g.guildId)}">Generer le serveur</button>`;
    }
    const icon = guildIconUrl(g);
    const inner = `
        <div class="guild-row-icon">${icon ? `<img src="${icon}" alt="" />` : escapeHtml(initials(g.name || '?'))}</div>
        <div class="guild-row-info">
          <div class="name">${escapeHtml(g.name || g.guildId)}</div>
          ${badge}
        </div>
        ${action}`;
    const style = `style="animation-delay:${Math.min(delay, 400)}ms"`;
    const cls = `guild-row stagger-in${isFirstUrgent ? ' urgent' : ''}`;
    // Serveur deja configure : toute la ligne est un lien de navigation (pas
    // de bouton imbrique dans un lien, cf. la note d'accessibilite plus haut).
    return g.botPresent && g.configured
      ? `<a class="${cls}" href="app.html?guild=${g.guildId}" ${style}>${inner}</a>`
      : `<div class="${cls}" ${style}>${inner}</div>`;
  }

  function groupedRowsHtml(list) {
    let delay = 0;
    let firstUrgentUsed = false;
    const chunks = GUILD_GROUPS.map((group) => {
      const items = list.filter(group.test);
      if (!items.length) return '';
      const showLabel = GUILD_GROUPS.filter((gr) => list.some(gr.test)).length > 1;
      const html = items.map((g) => {
        const isUrgent = group.key === 'toConfigure' && !firstUrgentUsed;
        if (isUrgent) firstUrgentUsed = true;
        const row = guildRowHtml(g, delay, isUrgent);
        delay += 40;
        return row;
      }).join('');
      return `${showLabel ? `<div class="guild-group-label">${group.label} — ${items.length}</div>` : ''}${html}`;
    });
    return chunks.join('');
  }

  function syncLabel() {
    const at = Number(localStorage.getItem('guilds-cache-at') || 0);
    if (!at) return '';
    const mins = Math.floor((Date.now() - at) / 60000);
    const text = mins < 1 ? "a l'instant" : `il y a ${mins} min`;
    return `<span class="muted" style="font-size:0.76rem;" title="Derniere synchronisation avec Discord">Sync ${text}</span>`;
  }

  function summaryHtml() {
    const total = allGuilds.length;
    const configured = allGuilds.filter((g) => g.botPresent && g.configured).length;
    const toConfigure = allGuilds.filter((g) => g.botPresent && !g.configured).length;
    if (!total) return '';
    const pct = Math.round((configured / total) * 100);
    return `
      <div class="guild-summary">
        <span class="todo-count">${toConfigure > 0 ? `<b>${toConfigure}</b> serveur${toConfigure > 1 ? 's' : ''} a configurer` : 'Tout est configure'}</span>
        <span style="display:flex; align-items:center; gap:10px;">
          ${syncLabel()}
          <span class="progress-gauge" title="${configured}/${total} serveurs configures"><span class="progress-gauge-fill" style="width:${pct}%"></span></span>
        </span>
      </div>`;
  }

  function paint(filterText) {
    const filtered = filterText
      ? allGuilds.filter((g) => (g.name || '').toLowerCase().includes(filterText.toLowerCase()))
      : allGuilds;
    app.innerHTML = `
      <div class="inner">
        <div class="card">
          <h2>Tes serveurs</h2>
          <p class="muted">Serveurs Discord ou tu es administrateur.</p>
          ${summaryHtml()}
          <div class="guild-list">${groupedRowsHtml(filtered) || '<p class="muted">Aucun serveur trouve.</p>'}</div>
        </div>
        <a class="topgg-chip" id="topgg-chip" href="https://top.gg/bot/1526237674355036401" target="_blank" rel="noopener">
          <span class="icon">⭐</span> <span id="topgg-chip-label">Voter pour le bot sur top.gg</span>
        </a>
      </div>
    `;
    paintToppgVoted();
  }

  function paintToppgVoted() {
    const chip = document.getElementById('topgg-chip');
    const label = document.getElementById('topgg-chip-label');
    if (!chip || !label) return;
    const votedToday = localStorage.getItem('toppgg-voted-date') === new Date().toDateString();
    chip.classList.toggle('voted', votedToday);
    label.textContent = votedToday ? 'Merci d\'avoir vote aujourd\'hui !' : 'Voter pour le bot sur top.gg';
    if (!chip.dataset.wired) {
      chip.dataset.wired = '1';
      chip.addEventListener('click', () => localStorage.setItem('toppgg-voted-date', new Date().toDateString()));
    }
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
  { key: 'permissions', label: 'Permissions', icon: '🔐' },
  { key: 'jeux', label: 'Roles de jeu', icon: '🎮' },
  { key: 'automatisations', label: 'Automatisations', icon: '⚙️' },
  { key: 'securite', label: 'Securite', icon: '🛡️' },
  { key: 'stats', label: 'Statistiques', icon: '📊' },
  { key: 'auditlog', label: "Logs d'audit", icon: '📋' },
  { key: 'embedbuilder', label: 'Generateur embed', icon: '💬' },
  { key: 'botstatus', label: 'Statut du bot', icon: '🤖' },
  { key: 'templates', label: 'Templates', icon: '📁' },
  { key: 'customcommands', label: 'Commandes personnalisees', icon: '💻' },
  { key: 'assistant-ia', label: 'Assistant IA', icon: '✨' },
  { key: 'memberlookup', label: 'Recherche de membres', icon: '🔎' },
  { key: 'giveaways', label: 'Giveaways', icon: '🎉' },
  { key: 'creator', label: 'Createur salons & roles', icon: '🏗️' },
];

// Accueil en 2 temps : une grille de categories thematiques, puis (au clic)
// la grille des modules de cette categorie uniquement. Chaque module reste
// directement accessible en un clic depuis sa categorie, sans page hub a lui
// tout seul a traverser (le clic sur un module ouvre directement le bon
// panneau, deja preselectionne).
// Categories reequilibrees : "Creation" concentrait a elle seule 16 des 29
// modules (tout ce qui n'etait ni jeu/fun ni stats y atterrissait par
// defaut), pendant que les 4 autres categories n'en avaient que 3-4 chacune.
// Securite et Integrations extraites en categories a part entiere plutot
// que noyees dans Creation/Administration.
const HOME_CATEGORIES = [
  { id: 'administration', icon: '🛠️', label: 'Administration' },
  { id: 'securite', icon: '🔒', label: 'Securite' },
  { id: 'moderation', icon: '🛡️', label: 'Moderation' },
  { id: 'integrations', icon: '🔌', label: 'Integrations' },
  { id: 'creation', icon: '🎨', label: 'Creation' },
  { id: 'fun', icon: '🎉', label: 'Fun' },
  { id: 'statistiques', icon: '📊', label: 'Statistiques' },
];

const HOME_MODULES = [
  // Administration : reglages de portee serveur, controle d'acces.
  { parent: 'permissions', section: 'perm-bulk', icon: '⚡', label: 'Edition en masse', category: 'administration' },
  { parent: 'permissions', section: 'perm-io', icon: '📋', label: 'Export / Import', category: 'administration' },
  { parent: 'permissions', section: 'perm-default', icon: '♻️', label: 'Permissions par defaut', category: 'administration' },
  { parent: 'permissions', section: 'perm-dashboard', icon: '🔑', label: 'Acces au dashboard', category: 'administration' },
  { parent: 'automatisations', section: 'arrivee', icon: '👋', label: 'Arrivee & statut du bot', category: 'administration' },
  { parent: 'automatisations', section: 'streamers', icon: '📺', label: 'Streamers lies', category: 'administration' },
  { parent: 'automatisations', section: 'service', icon: '🚨', label: 'Service (staff)', category: 'administration' },
  // Securite : sauvegarde, restauration, verrouillage d'urgence.
  { parent: 'securite', section: 'sec-export', icon: '💾', label: 'Export / Restauration', category: 'securite' },
  { parent: 'securite', section: 'sec-snapshots', icon: '📸', label: 'Snapshots automatiques', category: 'securite' },
  { parent: 'securite', section: 'sec-lockdown', icon: '🔒', label: 'Lockdown', category: 'securite' },
  // Moderation : surveillance et gestion du comportement des membres.
  { parent: 'automatisations', section: 'automod', icon: '🚫', label: 'Auto-moderation', category: 'moderation' },
  { parent: 'automatisations', section: 'tickets', icon: '🎫', label: 'Tickets', category: 'moderation' },
  { parent: 'auditlog', icon: '📋', label: "Logs d'audit", category: 'moderation' },
  // Integrations : connecter des services/bots externes.
  { parent: 'automatisations', section: 'bots', icon: '🧩', label: 'Bots complementaires', category: 'integrations' },
  { parent: 'automatisations', section: 'webhooks', icon: '🔗', label: 'Webhooks sortants', category: 'integrations' },
  // Creation : construire du contenu (salons, textes, structure).
  { parent: 'creator', icon: '🏗️', label: 'Createur salons & roles', category: 'creation' },
  { parent: 'jeux', section: 'game-catalog', icon: '📚', label: 'Catalogue de jeux', category: 'creation' },
  { parent: 'jeux', section: 'game-reaction', icon: '🎭', label: 'Roles-reaction', category: 'creation' },
  { parent: 'automatisations', section: 'annonces', icon: '📅', label: 'Annonces programmees', category: 'creation' },
  { parent: 'embedbuilder', icon: '💬', label: 'Generateur embed', category: 'creation' },
  { parent: 'templates', icon: '📁', label: 'Templates', category: 'creation' },
  { parent: 'customcommands', icon: '💻', label: 'Commandes personnalisees', category: 'creation' },
  { parent: 'assistant-ia', icon: '✨', label: 'Assistant IA', category: 'creation' },
  // Fun : engagement communautaire.
  { parent: 'giveaways', icon: '🎉', label: 'Giveaways', category: 'fun' },
  { parent: 'jeux', section: 'game-active', icon: '🎮', label: 'Roles de jeu actifs', category: 'fun' },
  { parent: 'automatisations', section: 'economie', icon: '🪙', label: 'Economie / boutique', category: 'fun' },
  { parent: 'automatisations', section: 'niveaux', icon: '⭐', label: 'Roles de niveau (XP)', category: 'fun' },
  { parent: 'automatisations', section: 'parrainage', icon: '🎗️', label: 'Parrainage', category: 'fun' },
  // Statistiques : lecture seule, vue d'ensemble du serveur.
  { parent: 'stats', section: 'stats-members', icon: '👥', label: 'Membres', category: 'statistiques' },
  { parent: 'stats', section: 'stats-activity', icon: '💬', label: 'Activite', category: 'statistiques' },
  { parent: 'botstatus', icon: '🤖', label: 'Statut du bot', category: 'statistiques' },
  { parent: 'memberlookup', icon: '🔎', label: 'Recherche de membres', category: 'statistiques' },
];

function customChannelFormHtml(catId) {
  return `
    <div class="dp-custom-form" data-form-for="${catId}" style="display:none;">
      <input type="text" class="dp-custom-name" placeholder="Nom (virgules = plusieurs salons)" aria-label="Nom du salon (separer par des virgules pour en creer plusieurs)" maxlength="200" />
      <select class="dp-custom-type" aria-label="Type de salon">
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
  const roleMembers = role.name === '@everyone'
    ? members
    : members.filter((m) => (m.roles || []).includes(role.id));
  const perms = decodeRolePermissions(role.permissions);
  const isEveryone = role.name === '@everyone';
  const hex = role.color ? `#${role.color.toString(16).padStart(6, '0')}` : '#99aab5';
  return `
    <div class="dp-role-row" data-role="${role.id}" data-role-name="${escapeHtml(role.name)}" data-position="${role.position}" ${isEveryone ? '' : 'draggable="true"'}>
      <div class="dp-role-summary" tabindex="0" role="button" aria-expanded="false" aria-label="Details du role ${escapeHtml(role.name)}">
        ${!isEveryone ? `<button type="button" class="dp-role-handle" data-role-handle="${role.id}" aria-label="Reordonner ${escapeHtml(role.name)} (fleches haut/bas)">⠿</button>` : ''}
        ${roleColorDot(role)}
        <span class="dp-role-name">${escapeHtml(role.name)}</span>
        <span class="dp-role-count">${roleMembers.length}</span>
        ${!isEveryone ? `<button type="button" class="dp-role-settings" data-role-settings="${role.id}" title="Configurer" aria-label="Configurer le role ${escapeHtml(role.name)}">⚙</button>` : ''}
      </div>
      <div class="dp-role-detail">
        <button type="button" class="dp-copy-id-btn dp-copy-id-inline" data-copy-id="${role.id}" title="Copier l'ID du role" aria-label="Copier l'ID du role ${escapeHtml(role.name)}">📋 Copier l'ID</button>
        ${!isEveryone ? `
          <p class="dp-role-detail-title">Couleur</p>
          <div class="dp-role-color-row">
            <input type="color" class="dp-role-color-input" value="${hex}" data-role="${role.id}" />
            <div class="dp-color-swatches">
              ${DISCORD_ROLE_COLORS.map((c) => `<button type="button" class="dp-color-swatch-btn" data-color="${c}" data-role="${role.id}" style="--sw:${c}" title="${c}" aria-label="Couleur ${c}"></button>`).join('')}
            </div>
          </div>
        ` : ''}
        <p class="dp-role-detail-title">Permissions</p>
        ${perms.length
    ? `<ul class="dp-perm-list">${perms.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`
    : '<p class="muted">Aucune permission particuliere</p>'}
        <p class="dp-role-detail-title">Membres (${roleMembers.length})</p>
        ${roleMembers.length ? `
          <div class="dp-member-list">
            ${roleMembers.map((m) => `
              <div class="dp-member-row">
                <img class="dp-member-avatar" src="${memberAvatarUrl(m)}" alt="" />
                <span>${escapeHtml(m.displayName)}</span>
              </div>
            `).join('')}
          </div>` : '<p class="muted">Aucun membre</p>'}
      </div>
    </div>`;
}

function resolveAiActionLabel(pc, channels, roles) {
  if (pc.name === 'delete_channel') {
    const ch = channels.find((c) => c.id === pc.args.channelId);
    return `Supprimer le salon ${ch ? `#${ch.name}` : pc.args.channelId}`;
  }
  if (pc.name === 'delete_category') {
    const cat = channels.find((c) => c.id === pc.args.categoryId);
    return `Supprimer la categorie ${cat ? cat.name : pc.args.categoryId}`;
  }
  if (pc.name === 'delete_role') {
    const role = roles.find((r) => r.id === pc.args.roleId);
    return `Supprimer le role ${role ? role.name : pc.args.roleId}`;
  }
  return `Executer ${pc.name}`;
}

function botAvatarHtml() {
  return '<img src="assets/logo-512.webp" alt="" width="36" height="36" />';
}

function userAvatarHtml() {
  if (currentUserAvatarUrl) return `<img src="${currentUserAvatarUrl}" alt="" width="36" height="36" />`;
  return escapeHtml(currentUser?.username ? initials(currentUser.username) : '🙂');
}

function aiConversationHtml() {
  let html = '';
  aiConversation.forEach((m, idx) => {
    if (m.role === 'user') {
      html += `
        <div class="dp-chat-msg ai-user">
          <div class="dp-chat-avatar">${userAvatarHtml()}</div>
          <div class="dp-chat-bubble"><div class="dp-chat-text">${escapeHtml(m.content)}</div></div>
        </div>`;
    } else if (m.role === 'assistant' && m.content) {
      html += `
        <div class="dp-chat-msg bot">
          <div class="dp-chat-avatar">${botAvatarHtml()}</div>
          <div class="dp-chat-bubble">
            <div class="dp-chat-author">ServeurCreator Bot</div>
            <div class="dp-chat-text">${renderMarkdownLite(m.content)}</div>
            <button type="button" class="dp-chat-copy" data-msg-index="${idx}" title="Copier" aria-label="Copier ce message">📋</button>
          </div>
        </div>`;
    } else if (m.role === 'assistant' && m.toolCalls?.length) {
      html += `<div class="dp-ai-tool-note">🔧 ${escapeHtml(m.toolCalls[0].name)}...</div>`;
    } else if (m.role === 'tool' && m.result?.error) {
      html += `<div class="dp-ai-tool-note">⚠️ ${escapeHtml(m.result.error)}</div>`;
    }
  });
  if (aiBusy) {
    html += `
      <div class="dp-chat-msg bot">
        <div class="dp-chat-avatar">${botAvatarHtml()}</div>
        <div class="dp-chat-bubble"><div class="dp-chat-typing"><span></span><span></span><span></span></div></div>
      </div>`;
  }
  if (aiPendingConfirmation) {
    html += `
      <div class="dp-chat-msg bot">
        <div class="dp-chat-avatar">${botAvatarHtml()}</div>
        <div class="dp-chat-bubble" style="max-width:420px;">
          <div class="dp-ai-confirm">
            <span>⚠️ ${escapeHtml(aiPendingConfirmation.label)} — action irreversible. Confirmer ?</span>
            <div class="dp-ai-confirm-row">
              <button type="button" class="btn danger" id="dp-ai-confirm-yes">Confirmer</button>
              <button type="button" class="btn secondary" id="dp-ai-confirm-no">Annuler</button>
            </div>
          </div>
        </div>
      </div>`;
  }
  return html;
}

// Modules favoris (roadmap n°021) : etoile sur chaque carte, epingles en
// tete de l'accueil, memorises par navigateur.
function getFavModuleKeys() {
  try { return JSON.parse(localStorage.getItem('dsc-fav-modules') || '[]'); } catch { return []; }
}
function favModuleKey(m) { return `${m.parent}|${m.section || ''}`; }

function homeModuleCardHtml(m) {
  const key = favModuleKey(m);
  const isFav = getFavModuleKeys().includes(key);
  return `
    <button type="button" class="dp-action-card" data-goto-settings="${m.parent}"${m.section ? ` data-goto-settings-section="${m.section}"` : ''}>
      <span class="dp-fav-star${isFav ? ' active' : ''}" role="button" tabindex="0" data-fav-key="${key}" title="${isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}" aria-label="${isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'} : ${escapeHtml(m.label)}">${isFav ? '★' : '☆'}</span>
      <span class="icon">${m.icon}</span>
      <span class="label">${escapeHtml(m.label)}</span>
    </button>`;
}

// Bascule d'un favori, deleguee en phase de capture : l'etoile vit DANS le
// <button> de module, il faut bloquer la navigation du parent.
app.addEventListener('click', (e) => {
  const star = e.target.closest('.dp-fav-star');
  if (!star) return;
  e.stopPropagation();
  e.preventDefault();
  const key = star.dataset.favKey;
  const favs = getFavModuleKeys();
  const idx = favs.indexOf(key);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(key);
  try { localStorage.setItem('dsc-fav-modules', JSON.stringify(favs)); } catch { /* stockage plein */ }
  const active = idx < 0;
  document.querySelectorAll(`.dp-fav-star[data-fav-key="${CSS.escape(key)}"]`).forEach((s) => {
    s.classList.toggle('active', active);
    s.textContent = active ? '★' : '☆';
    s.title = active ? 'Retirer des favoris' : 'Ajouter aux favoris';
  });
  showToast(active ? 'Ajoute aux favoris (visible sur l\'accueil).' : 'Retire des favoris.');
}, true);
app.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('dp-fav-star')) {
    e.preventDefault();
    e.stopPropagation();
    e.target.click();
  }
}, true);

// Navigation clavier des grilles de cartes (roadmap n°037) : fleches pour
// circuler, la disposition en colonnes est deduite de la largeur reelle.
app.addEventListener('keydown', (e) => {
  if (!e.target.classList?.contains('dp-action-card')) return;
  if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
  const cards = [...e.target.parentElement.querySelectorAll('.dp-action-card')];
  const idx = cards.indexOf(e.target);
  const cols = Math.max(1, Math.round(e.target.parentElement.offsetWidth / (e.target.offsetWidth + 10)));
  let next = idx;
  if (e.key === 'ArrowRight') next = idx + 1;
  else if (e.key === 'ArrowLeft') next = idx - 1;
  else if (e.key === 'ArrowDown') next = idx + cols;
  else next = idx - cols;
  if (next >= 0 && next < cards.length && next !== idx) {
    e.preventDefault();
    cards[next].focus();
  }
});

function aiHomeHtml(guild) {
  return `
    <div class="dp-chat" id="dp-ai-chat">
      <div class="dp-chat-msg bot">
        <div class="dp-chat-avatar">${botAvatarHtml()}</div>
        <div class="dp-chat-bubble">
          <div class="dp-chat-author">ServeurCreator Bot</div>
          <div class="dp-chat-text">Salut, je suis le bot de configuration de ${escapeHtml(guild?.name || 'ton serveur')} ! Glisse un salon, une categorie ou un role ici pour le configurer, ou choisis une categorie d'outils ci-dessous.</div>
          ${(() => {
    const favs = getFavModuleKeys()
      .map((key) => HOME_MODULES.find((m) => favModuleKey(m) === key))
      .filter(Boolean);
    return favs.length
      ? `<p class="dp-block-title" style="margin:12px 0 6px;">⭐ Favoris</p><div class="dp-action-grid">${favs.map(homeModuleCardHtml).join('')}</div><p class="dp-block-title" style="margin:12px 0 6px;">Categories</p>`
      : '';
  })()}
          <div class="dp-action-grid">
            ${HOME_CATEGORIES.map((c) => `
              <button type="button" class="dp-action-card" data-home-category="${c.id}">
                <span class="icon">${c.icon}</span>
                <span class="label">${escapeHtml(c.label)}</span>
              </button>
            `).join('')}
          </div>
          <div class="dp-action-grid" id="dp-home-modules" style="display:none;"></div>
          <div id="dp-home-create-area"></div>
        </div>
      </div>
      <div id="dp-ai-tail">${aiConversationHtml()}</div>
    </div>
    <form class="dp-chat-input-bar" id="dp-ai-form">
      ${aiConversation.length ? '<button type="button" class="btn secondary" id="dp-ai-reset" title="Nouvelle conversation" aria-label="Nouvelle conversation">🔄</button>' : ''}
      <input type="text" id="dp-ai-input" placeholder="Ecris a l'assistant..." maxlength="1000" autocomplete="off" />
      <button type="submit" class="btn" id="dp-ai-send">Envoyer</button>
    </form>
  `;
}

function wireAiHome(guildId, channels, rolesSorted) {
  const form = document.getElementById('dp-ai-form');
  const input = document.getElementById('dp-ai-input');
  const sendBtn = document.getElementById('dp-ai-send');
  const chatEl = document.getElementById('dp-ai-chat');

  document.getElementById('dp-ai-reset')?.addEventListener('click', () => {
    if (!window.confirm('Demarrer une nouvelle conversation avec l\'assistant ? L\'historique actuel sera perdu.')) return;
    aiConversation = [];
    aiPendingConfirmation = null;
    withViewTransition(() => renderPreviewPage(guildId));
  });

  function refreshTail() {
    document.getElementById('dp-ai-tail').innerHTML = aiConversationHtml();
    input.disabled = aiBusy;
    sendBtn.disabled = aiBusy;
    const yesBtn = document.getElementById('dp-ai-confirm-yes');
    const noBtn = document.getElementById('dp-ai-confirm-no');
    if (yesBtn) yesBtn.addEventListener('click', () => handleConfirm(true));
    if (noBtn) noBtn.addEventListener('click', () => handleConfirm(false));
    document.querySelectorAll('.dp-chat-copy').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const msg = aiConversation[Number(btn.dataset.msgIndex)];
        if (!msg) return;
        try {
          await navigator.clipboard.writeText(msg.content);
          btn.textContent = '✓';
          btn.classList.add('copied');
          setTimeout(() => { btn.textContent = '📋'; btn.classList.remove('copied'); }, 1500);
        } catch {
          showToast('Copie impossible (permission navigateur).', 'error');
        }
      });
    });
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  async function handleConfirm(confirmed) {
    const pending = aiPendingConfirmation;
    aiPendingConfirmation = null;
    aiBusy = true;
    refreshTail();
    try {
      const result = await Api.aiChatConfirm(guildId, aiConversation, pending, confirmed);
      aiConversation = result.messages;
      aiPendingConfirmation = result.pendingConfirmation
        ? { ...result.pendingConfirmation, label: resolveAiActionLabel(result.pendingConfirmation, channels, rolesSorted) }
        : null;
      aiBusy = false;
      await renderPreviewPage(guildId);
    } catch (err) {
      showToast(err.message, 'error');
      aiBusy = false;
      refreshTail();
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || aiBusy) return;
    input.value = '';
    aiConversation.push({ role: 'user', content: text });
    aiBusy = true;
    refreshTail();
    try {
      const result = await Api.aiChat(guildId, aiConversation.slice(0, -1), text);
      aiConversation = result.messages;
      aiPendingConfirmation = result.pendingConfirmation
        ? { ...result.pendingConfirmation, label: resolveAiActionLabel(result.pendingConfirmation, channels, rolesSorted) }
        : null;
      aiBusy = false;
      await renderPreviewPage(guildId);
    } catch (err) {
      aiConversation.pop();
      aiBusy = false;
      showToast(err.message, 'error');
      refreshTail();
    }
  });

  refreshTail();
}

async function renderPreviewPage(id) {
  app.classList.add('preview-fullbleed');
  // Cache local (roadmap n°050, stale-while-revalidate) : la derniere
  // structure connue s'affiche immediatement, les donnees fraiches
  // remplacent le rendu des qu'elles arrivent.
  const cacheKey = `previewCache:${id}`;
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch { cached = null; }
  if (cached?.channels) renderPreviewContent(id, cached);
  else app.innerHTML = skeletonHtml();

  // Sans ce catch, un echec reseau (backend qui se reveille, coupure) laissait
  // la page bloquee sur le skeleton sans message ni moyen de reessayer.
  let channels, config, roles, members;
  try {
    [channels, config, roles, members] = await Promise.all([
      Api.channels(id),
      Api.config(id),
      Api.roles(id).catch(() => []),
      Api.members(id).catch(() => []),
    ]);
  } catch (err) {
    if (cached?.channels) {
      showToast('Rafraichissement impossible : dernieres donnees connues affichees.', 'error');
      return;
    }
    app.innerHTML = `
      <div class="inner">
        <div class="inline-banner error" style="margin-bottom:12px;">
          Impossible de charger le serveur (${escapeHtml(err?.message || 'erreur reseau')}).
          Le bot met parfois quelques secondes a se reveiller.
        </div>
        <button class="btn" id="preview-retry-btn">🔄 Reessayer</button>
      </div>`;
    document.getElementById('preview-retry-btn').addEventListener('click', () => renderPreviewPage(id));
    return;
  }
  const fresh = { channels, config, roles, members };
  try { localStorage.setItem(cacheKey, JSON.stringify(fresh)); } catch { /* stockage plein : cache saute */ }
  renderPreviewContent(id, fresh);
}

function renderPreviewContent(id, { channels, config, roles, members }) {
  const guild = allGuilds.find((g) => g.guildId === id);
  const rolesSorted = [...roles].sort((a, b) => b.position - a.position);

  // Contexte de la palette Ctrl+K (n°012) + reset de la pile de modules (n°028).
  paletteCtx.guildId = id;
  paletteCtx.channels = channels;
  paletteCtx.roles = rolesSorted;
  currentPanelRef = null;
  panelNavStack.length = 0;

  if (aiConversationGuildId !== id) {
    aiConversationGuildId = id;
    aiConversation = [];
    aiPendingConfirmation = null;
  }

  const categories = channels.filter((c) => c.type === 4).sort((a, b) => a.position - b.position);
  const uncategorized = channels.filter((c) => c.type !== 4 && !c.parent_id);
  const channelIcon = (c) => (c.type === 2 ? '🔊' : c.type === 4 ? '' : '#');

  const channelRow = (c) => `
    <div class="dp-channel" draggable="true" tabindex="0" role="button" aria-label="Salon ${escapeHtml(c.name)} (Alt+fleches pour reordonner)" data-channel="${c.id}" data-name="${escapeHtml(c.name)}" data-type="${c.type}">
      <span class="hash">${channelIcon(c)}</span> <span class="dp-channel-name">${escapeHtml(c.name)}</span>
      <button type="button" class="dp-copy-id-btn" data-copy-id="${c.id}" title="Copier l'ID du salon" aria-label="Copier l'ID du salon ${escapeHtml(c.name)}">📋</button>
    </div>`;

  const categoryBlock = (cat) => {
    const children = channels.filter((c) => c.parent_id === cat.id).sort((a, b) => a.position - b.position);
    return `
      <div class="dp-category" data-cat="${cat.id}" draggable="true" tabindex="0" role="button" aria-expanded="true" aria-label="Categorie ${escapeHtml(cat.name)}" data-drag-type="category" data-drag-name="${escapeHtml(cat.name)}">
        <span class="chevron">▾</span>
        <span class="dp-category-name">${escapeHtml(cat.name)}</span>
        <button type="button" class="dp-category-sort" data-cat-sort="${cat.id}" title="Trier les salons de A a Z" aria-label="Trier les salons de ${escapeHtml(cat.name)} de A a Z">A→Z</button>
        <button type="button" class="dp-category-settings" data-cat-settings="${cat.id}" data-cat-name="${escapeHtml(cat.name)}" title="Configurer" aria-label="Configurer la categorie ${escapeHtml(cat.name)}">⚙</button>
      </div>
      <div class="dp-channels">
        ${children.map(channelRow).join('')}
        <button type="button" class="dp-add-channel" data-add-cat="${cat.id}">+ Ajouter un salon</button>
        ${customChannelFormHtml(cat.id)}
      </div>
    `;
  };

  app.innerHTML = `
    <div class="inner fill" style="max-width:none;">
      <div class="discord-preview" style="position:relative;">
        <div class="dp-sidebar">
          <div class="dp-server-header">
            <span class="name">${escapeHtml(guild?.name || 'Serveur')}</span>
            <button type="button" class="dp-pin-btn" id="dp-pin-left" title="Epingler le panneau (toujours visible)" aria-pressed="false">📌</button>
          </div>
          <div class="dp-sidebar-search">
            <input type="text" id="dp-channel-search" placeholder="🔎 Filtrer les salons..." aria-label="Filtrer les salons" autocomplete="off" />
          </div>
          <div class="dp-channel-list">
            ${uncategorized.map(channelRow).join('')}
            ${categories.map(categoryBlock).join('')}
          </div>
        </div>
        <div class="dp-main" id="dp-main">
          ${aiHomeHtml(guild)}
        </div>
        <div class="dp-roles-panel">
          <div class="dp-roles-header${rolesSorted.length >= 230 ? ' near-limit' : ''}" title="${rolesSorted.length >= 230 ? 'Limite Discord : 250 roles par serveur' : ''}">
            <span style="flex:1;">Roles — ${rolesSorted.length}</span>
            <button type="button" class="dp-pin-btn" id="dp-pin-right" title="Epingler le panneau (toujours visible)" aria-pressed="false">📌</button>
          </div>
          <div class="dp-sidebar-search">
            <input type="text" id="dp-role-search" placeholder="🔎 Filtrer les roles..." aria-label="Filtrer les roles" autocomplete="off" />
          </div>
          <div class="dp-roles-list">${rolesSorted.map((r) => roleRowHtml(r, members)).join('')}</div>
        </div>
        <button type="button" class="dp-drawer-btn left" id="dp-drawer-left" aria-label="Ouvrir le panneau des salons">☰</button>
        <button type="button" class="dp-drawer-btn right" id="dp-drawer-right" aria-label="Ouvrir le panneau des roles">🏷️</button>
      </div>
    </div>
  `;

  wireAiHome(id, channels, rolesSorted);
  // Les cartes favoris de l'accueil (n°021) vivent hors de la grille de
  // modules : cablage direct.
  wireHomeModuleCards(document.getElementById('dp-ai-chat'));

  // Debounce (roadmap n°054) : le surlignage re-rend chaque ligne, inutile
  // de le faire a chaque frappe.
  const debounce = (fn, ms = 140) => {
    let timer = null;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  };

  document.getElementById('dp-channel-search').addEventListener('input', debounce((e) => {
    const q = e.target.value.trim().toLowerCase();
    app.querySelectorAll('.dp-channel[data-channel]').forEach((chEl) => {
      chEl.classList.toggle('dp-filtered-out', Boolean(q) && !(chEl.dataset.name || '').toLowerCase().includes(q));
      const nameEl = chEl.querySelector('.dp-channel-name');
      if (nameEl) nameEl.innerHTML = highlightMatch(chEl.dataset.name || '', q);
    });
    app.querySelectorAll('.dp-category').forEach((catEl) => {
      const list = catEl.nextElementSibling;
      if (!list || !list.classList.contains('dp-channels')) return;
      const anyVisible = [...list.querySelectorAll('.dp-channel[data-channel]')].some((c) => !c.classList.contains('dp-filtered-out'));
      catEl.classList.toggle('dp-filtered-out', Boolean(q) && !anyVisible);
      if (q) catEl.classList.toggle('collapsed', !anyVisible);
    });
  }));

  document.getElementById('dp-role-search').addEventListener('input', debounce((e) => {
    const q = e.target.value.trim().toLowerCase();
    app.querySelectorAll('.dp-role-row[data-role]').forEach((row) => {
      row.classList.toggle('dp-filtered-out', Boolean(q) && !(row.dataset.roleName || '').toLowerCase().includes(q));
      const nameEl = row.querySelector('.dp-role-name');
      if (nameEl) nameEl.innerHTML = highlightMatch(row.dataset.roleName || '', q);
    });
  }));

  app.querySelectorAll('.dp-category').forEach((catEl) => {
    const toggle = () => {
      catEl.classList.toggle('collapsed');
      catEl.setAttribute('aria-expanded', String(!catEl.classList.contains('collapsed')));
    };
    catEl.addEventListener('click', toggle);
    catEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      toggle();
    });
  });

  app.querySelectorAll('.dp-category-settings').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      app.querySelectorAll('.dp-category').forEach((el) => el.classList.remove('settings-active'));
      btn.closest('.dp-category').classList.add('settings-active');
      window.UISound?.select();
      renderCategoryPanel(id, btn.dataset.catSettings, btn.dataset.catName, config, channels, rolesSorted);
    });
  });

  app.querySelectorAll('.dp-category[draggable="true"]').forEach((catEl) => {
    catEl.addEventListener('dragstart', (e) => {
      catEl.classList.add('dragging');
      e.dataTransfer.setData('text/plain', catEl.dataset.cat);
      e.dataTransfer.effectAllowed = 'move';
      e.stopPropagation();
    });
    catEl.addEventListener('dragend', () => catEl.classList.remove('dragging'));
  });

  // Drag&drop d'un salon ou d'une categorie depuis la barre laterale
  // directement dans la zone centrale ("chatbot" d'actions) : le clic sur
  // ces memes elements ouvre aussi le panel, le glisser-deposer est une
  // methode alternative plus visuelle.
  const dpMain = document.getElementById('dp-main');
  dpMain.addEventListener('dragover', (e) => {
    if (!document.querySelector('.dp-channel.dragging, .dp-category.dragging, .dp-role-row.dragging')) return;
    e.preventDefault();
    dpMain.classList.add('drag-over');
  });
  dpMain.addEventListener('dragleave', (e) => {
    if (e.target === dpMain) dpMain.classList.remove('drag-over');
  });
  dpMain.addEventListener('drop', (e) => {
    e.preventDefault();
    dpMain.classList.remove('drag-over');
    const draggedChannel = document.querySelector('.dp-channel.dragging');
    const draggedCategory = document.querySelector('.dp-category.dragging');
    const draggedRole = document.querySelector('.dp-role-row.dragging');
    window.UISound?.select();
    if (draggedChannel) {
      app.querySelectorAll('.dp-channel').forEach((el) => el.classList.remove('selected'));
      draggedChannel.classList.add('selected');
      renderChannelPanel(id, draggedChannel.dataset.channel, draggedChannel.dataset.name, Number(draggedChannel.dataset.type), config, channels, rolesSorted);
    } else if (draggedCategory) {
      app.querySelectorAll('.dp-category').forEach((el) => el.classList.remove('settings-active'));
      draggedCategory.classList.add('settings-active');
      renderCategoryPanel(id, draggedCategory.dataset.cat, draggedCategory.dataset.dragName, config, channels, rolesSorted);
    } else if (draggedRole) {
      app.querySelectorAll('.dp-role-row').forEach((el) => el.classList.remove('settings-active'));
      draggedRole.classList.add('settings-active');
      renderRolePanel(id, draggedRole.dataset.role, draggedRole.dataset.roleName, config, rolesSorted, members);
    }
  });

  app.querySelectorAll('.dp-role-row').forEach((row) => {
    const summary = row.querySelector('.dp-role-summary');
    const toggle = () => {
      row.classList.toggle('expanded');
      summary.setAttribute('aria-expanded', String(row.classList.contains('expanded')));
    };
    summary.addEventListener('click', toggle);
    summary.addEventListener('keydown', (e) => {
      if (e.target !== summary || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      toggle();
    });
  });

  app.querySelectorAll('.dp-role-settings').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      app.querySelectorAll('.dp-role-row').forEach((el) => el.classList.remove('settings-active'));
      const row = btn.closest('.dp-role-row');
      row.classList.add('settings-active');
      window.UISound?.select();
      renderRolePanel(id, btn.dataset.roleSettings, row.dataset.roleName, config, rolesSorted, members);
    });
  });

  async function persistRoleOrder(list) {
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
  }

  app.querySelectorAll('.dp-role-row[draggable="true"]').forEach((row) => {
    row.addEventListener('dragstart', (e) => {
      row.classList.add('dragging');
      e.dataTransfer.setData('text/plain', row.dataset.role);
      e.dataTransfer.effectAllowed = 'move';
    });
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
      await persistRoleOrder(row.parentElement);
    });
  });

  // Alternative clavier au drag&drop souris (accessibilite) : la poignee
  // devient un vrai bouton focusable, fleches haut/bas pour reordonner.
  app.querySelectorAll('.dp-role-handle[data-role-handle]').forEach((handle) => {
    handle.addEventListener('click', (e) => e.stopPropagation());
    handle.addEventListener('keydown', async (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      e.stopPropagation();
      const row = handle.closest('.dp-role-row');
      const list = row.parentElement;
      const sibling = e.key === 'ArrowUp' ? row.previousElementSibling : row.nextElementSibling;
      if (!sibling || !sibling.matches('.dp-role-row[draggable="true"]')) return;
      animateReorder(list, '.dp-role-row', () => {
        if (e.key === 'ArrowUp') list.insertBefore(row, sibling);
        else list.insertBefore(sibling, row);
      });
      handle.focus();
      window.UISound?.select();
      await persistRoleOrder(list);
    });
  });

  // Drag&drop des salons : reordonnancement au sein de la meme liste (meme
  // categorie ou racine), avec ecart anime des voisins. La position envoyee
  // est l'index dans la liste reordonnee ; Discord regroupe ensuite par type
  // (texte/vocal) comme dans son propre client.
  app.querySelectorAll('.dp-channel[data-channel]').forEach((chEl) => {
    chEl.addEventListener('dragstart', (e) => {
      chEl.classList.add('dragging');
      e.dataTransfer.setData('text/plain', chEl.dataset.channel);
      e.dataTransfer.effectAllowed = 'move';
    });
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
      await persistChannelOrder(chEl.parentElement);
    });
  });

  async function persistChannelOrder(list) {
    const orderedIds = [...list.querySelectorAll('.dp-channel[data-channel]')].map((el) => el.dataset.channel);
    const positions = orderedIds.map((cid, idx) => ({ id: cid, position: idx }));
    try {
      await Api.setChannelPositions(id, positions);
      showToast('Ordre des salons mis a jour.');
    } catch (err) {
      showToast(err.message, 'error');
      await renderPreviewPage(id);
    }
  }

  // Tri alphabetique d'une categorie (roadmap n°017).
  app.querySelectorAll('.dp-category-sort').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const list = btn.closest('.dp-category').nextElementSibling;
      if (!list?.classList.contains('dp-channels')) return;
      const rows = [...list.querySelectorAll('.dp-channel[data-channel]')];
      const sorted = [...rows].sort((a, b) => (a.dataset.name || '').localeCompare(b.dataset.name || '', 'fr'));
      if (rows.length < 2 || rows.every((r, i) => r === sorted[i])) { showToast('Deja trie de A a Z.'); return; }
      if (!window.confirm('Trier les salons de cette categorie de A a Z ?')) return;
      const anchor = list.querySelector('.dp-add-channel');
      animateReorder(list, '.dp-channel', () => {
        sorted.forEach((row) => list.insertBefore(row, anchor));
      });
      await persistChannelOrder(list);
    });
  });

  // Epinglage des panneaux lateraux (roadmap n°015) : desactive le repli
  // au survol, memorise par navigateur.
  const pinInit = (btnId, panelSel, storeKey) => {
    const btn = document.getElementById(btnId);
    const panel = app.querySelector(panelSel);
    if (!btn || !panel) return;
    const apply = (pinned) => {
      panel.classList.toggle('pinned', pinned);
      btn.setAttribute('aria-pressed', String(pinned));
    };
    apply(localStorage.getItem(storeKey) === '1');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pinned = !panel.classList.contains('pinned');
      localStorage.setItem(storeKey, pinned ? '1' : '0');
      apply(pinned);
    });
  };
  pinInit('dp-pin-left', '.dp-sidebar', 'dsc-pin-left');
  pinInit('dp-pin-right', '.dp-roles-panel', 'dsc-pin-right');

  // Tiroirs tactiles (roadmap n°044) : sur mobile le survol n'existe pas,
  // deux boutons flottants ouvrent/ferment les panneaux lateraux.
  const wireDrawer = (btnId, panelSel) => {
    const btn = document.getElementById(btnId);
    const panel = app.querySelector(panelSel);
    if (!btn || !panel) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !panel.classList.contains('touch-open');
      app.querySelectorAll('.dp-sidebar, .dp-roles-panel').forEach((p) => p.classList.remove('touch-open'));
      if (open) panel.classList.add('touch-open');
    });
  };
  wireDrawer('dp-drawer-left', '.dp-sidebar');
  wireDrawer('dp-drawer-right', '.dp-roles-panel');
  document.getElementById('dp-main')?.addEventListener('click', () => {
    app.querySelectorAll('.touch-open').forEach((p) => p.classList.remove('touch-open'));
  });

  async function applyRoleColor(roleId, colorHex, scope) {
    try {
      await Api.setRoleColor(id, roleId, parseInt(colorHex.slice(1), 16));
      showToast('Couleur mise a jour.');
      const row = scope.closest('.dp-role-row');
      const dot = row?.querySelector('.dp-role-dot');
      if (dot) dot.style.background = colorHex;
      const nativeInput = row?.querySelector('.dp-role-color-input');
      if (nativeInput) nativeInput.value = colorHex;
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  app.querySelectorAll('.dp-color-swatch-btn').forEach((btn) => {
    btn.addEventListener('click', () => applyRoleColor(btn.dataset.role, btn.dataset.color, btn));
  });

  app.querySelectorAll('.dp-role-color-input').forEach((input) => {
    input.addEventListener('change', () => applyRoleColor(input.dataset.role, input.value, input));
  });

  function openChannel(chEl) {
    app.querySelectorAll('.dp-channel').forEach((el) => el.classList.remove('selected'));
    chEl.classList.add('selected');
    window.UISound?.select();
    withViewTransition(() => {
      renderChannelPanel(id, chEl.dataset.channel, chEl.dataset.name, Number(chEl.dataset.type), config, channels, rolesSorted);
    });
  }

  app.querySelectorAll('.dp-channel[data-channel]').forEach((chEl) => {
    chEl.addEventListener('click', () => openChannel(chEl));
    chEl.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openChannel(chEl);
        return;
      }
      if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      e.preventDefault();
      const list = chEl.parentElement;
      const sibling = e.key === 'ArrowUp' ? chEl.previousElementSibling : chEl.nextElementSibling;
      if (!sibling || !sibling.matches('.dp-channel[data-channel]')) return;
      animateReorder(list, '.dp-channel[data-channel]', () => {
        if (e.key === 'ArrowUp') list.insertBefore(chEl, sibling);
        else list.insertBefore(sibling, chEl);
      });
      chEl.focus();
      window.UISound?.select();
      await persistChannelOrder(list);
    });
  });

  function wireHomeModuleCards(scope) {
    scope.querySelectorAll('[data-goto-settings]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.UISound?.select();
        withViewTransition(() => { renderSettingsPanel(id, btn.dataset.gotoSettings, btn.dataset.gotoSettingsSection); });
      });
    });
    scope.querySelectorAll('[data-home-create]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.UISound?.select();
        const area = document.getElementById('dp-home-create-area');
        if (btn.dataset.homeCreate === 'category') {
          area.innerHTML = `
            <div class="dp-block">
              <p class="dp-block-title">➕ Nouvelle categorie</p>
              <input type="text" id="dp-home-new-cat-name" placeholder="Nom de la categorie" maxlength="80" data-charcount />
              <div class="row" style="flex-wrap:wrap; gap:4px; margin-top:6px;">
                ${CHANNEL_EMOJI_PICKS.slice(0, 12).map((e) => `<button type="button" class="btn secondary dp-home-new-cat-emoji-pick" data-emoji="${e}" aria-label="Emoji ${e}" style="font-size:0.95rem; padding:4px 8px;">${e}</button>`).join('')}
              </div>
              <button class="btn" id="dp-home-create-cat-btn" style="margin-top:10px;">Creer</button>
            </div>`;
          area.querySelectorAll('.dp-home-new-cat-emoji-pick').forEach((btn) => {
            btn.addEventListener('click', () => {
              const input = area.querySelector('#dp-home-new-cat-name');
              if (!input.value.startsWith(btn.dataset.emoji)) input.value = `${btn.dataset.emoji} ${input.value}`.trim();
            });
          });
          area.querySelector('#dp-home-create-cat-btn').addEventListener('click', async () => {
            const name = area.querySelector('#dp-home-new-cat-name').value.trim();
            if (!name) { showToast('Nom requis.', 'error'); return; }
            try {
              await Api.createCategory(id, name);
              showToast('Categorie creee.');
              await renderPreviewPage(id);
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        } else if (btn.dataset.homeCreate === 'channel') {
          const otherChannels = channels.filter((c) => c.type !== 4);
          area.innerHTML = `
            <div class="dp-block dp-form-grid">
              <p class="dp-block-title">➕ Nouveau salon (hors categorie)</p>
              <div>
                <label for="dp-home-new-channel-name">Nom du salon</label>
                <input type="text" id="dp-home-new-channel-name" placeholder="Nom du salon" maxlength="80" data-charcount />
                <div class="row" style="flex-wrap:wrap; gap:4px; margin-top:6px;">
                  ${CHANNEL_EMOJI_PICKS.slice(0, 12).map((e) => `<button type="button" class="btn secondary dp-home-new-channel-emoji-pick" data-emoji="${e}" aria-label="Emoji ${e}" style="font-size:0.95rem; padding:4px 8px;">${e}</button>`).join('')}
                </div>
              </div>
              <div>
                <label for="dp-home-new-channel-type">Type</label>
                <select id="dp-home-new-channel-type">
                  <option value="text">💬 Texte</option>
                  <option value="voice">🔊 Vocal</option>
                  <option value="voice-temp">🔊 Vocal temporaire (cree un salon perso par membre)</option>
                  <option value="forum">🗂️ Forum</option>
                </select>
              </div>
              <div>
                <label for="dp-home-new-channel-visibility">Visibilite</label>
                <select id="dp-home-new-channel-visibility">
                  <option value="private">🔒 Prive (reserve aux membres ayant valide le reglement)</option>
                  <option value="public">🌐 Public</option>
                </select>
              </div>
              <div>
                <label for="dp-home-new-channel-import">Importer les permissions d'un salon existant (optionnel)</label>
                <select id="dp-home-new-channel-import">
                  <option value="">Aucune (permissions par defaut)</option>
                  ${otherChannels.map((c) => `<option value="${c.id}">${c.type === 2 ? '🔊' : '#'}${escapeHtml(c.name)}</option>`).join('')}
                </select>
              </div>
              <button class="btn dp-form-full" id="dp-home-create-channel-btn" style="margin-top:12px;">Creer le salon</button>
            </div>`;
          area.querySelectorAll('.dp-home-new-channel-emoji-pick').forEach((btn) => {
            btn.addEventListener('click', () => {
              const input = area.querySelector('#dp-home-new-channel-name');
              if (!input.value.startsWith(btn.dataset.emoji)) input.value = `${btn.dataset.emoji} ${input.value}`.trim();
            });
          });
          area.querySelector('#dp-home-create-channel-btn').addEventListener('click', async () => {
            const chName = area.querySelector('#dp-home-new-channel-name').value.trim();
            if (!chName) { showToast('Nom du salon requis.', 'error'); return; }
            const type = area.querySelector('#dp-home-new-channel-type').value;
            const isPrivate = area.querySelector('#dp-home-new-channel-visibility').value === 'private';
            const importFromChannelId = area.querySelector('#dp-home-new-channel-import').value || undefined;
            try {
              await Api.createChannel(id, chName, type, '', isPrivate, importFromChannelId);
              showToast('Salon cree.');
              await renderPreviewPage(id);
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        }
        area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });
  }

  app.querySelectorAll('[data-home-category]').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.UISound?.select();
      app.querySelectorAll('[data-home-category]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('dp-home-create-area').innerHTML = '';
      const catId = btn.dataset.homeCategory;
      const modulesGrid = document.getElementById('dp-home-modules');
      const items = HOME_MODULES.filter((m) => m.category === catId);
      const extraCards = catId === 'creation'
        ? '<button type="button" class="dp-action-card" data-home-create="category"><span class="icon">➕</span><span class="label">Nouvelle categorie</span></button>'
          + '<button type="button" class="dp-action-card" data-home-create="channel"><span class="icon">➕</span><span class="label">Nouveau salon</span></button>'
        : '';
      modulesGrid.innerHTML = extraCards + items.map(homeModuleCardHtml).join('');
      modulesGrid.style.display = 'grid';
      wireHomeModuleCards(modulesGrid);
      modulesGrid.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
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
      // Creation multiple (roadmap n°013) : des virgules = plusieurs salons.
      const names = form.querySelector('.dp-custom-name').value.split(',').map((s) => s.trim()).filter(Boolean);
      const type = form.querySelector('.dp-custom-type').value;
      if (!names.length) { showToast('Nom requis.', 'error'); return; }
      try {
        for (const name of names) {
          // eslint-disable-next-line no-await-in-loop
          await Api.createChannel(id, name, type, btn.dataset.cat || undefined);
        }
        showToast(names.length > 1 ? `${names.length} salons crees.` : 'Salon cree.');
        await renderPreviewPage(id);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

const SETTINGS_PANEL_INTROS = {
  permissions: 'Voici les permissions par salon et par role. Choisis une edition en masse ou exporte/importe une config.',
  jeux: 'Voici les roles de jeu detectes automatiquement. Ajoute, renomme ou supprime-les ici.',
  automatisations: "Voici les automatisations du serveur (niveaux, parrainage, service staff...).",
  securite: 'Voici les reglages de securite et de moderation automatique.',
  stats: "Un apercu des statistiques d'activite du serveur.",
  auditlog: 'Le journal des dernieres actions effectuees depuis le dashboard.',
  embedbuilder: 'Cree un embed personnalise et poste-le dans le salon de ton choix.',
  botstatus: 'Configure le statut et l\'activite affiches par le bot.',
  templates: 'Gere les templates de structure de serveur.',
  customcommands: 'Cree tes propres commandes personnalisees.',
  'assistant-ia': "Configure ta cle API pour discuter avec l'assistant et lui laisser creer/modifier des salons, categories et roles a ta place.",
  memberlookup: 'Recherche un membre par pseudo ou par ID et vois ses roles en un coup d\'oeil.',
  giveaways: 'Lance un giveaway avec bouton de participation, tirage et annonce automatiques.',
  creator: 'Cree en un clic des salons relies aux fonctionnalites du bot (auto-configures) et des roles detectes ou prets a l\'emploi.',
};

async function renderSettingsPanel(guildId, key, preselectSectionId, { fromBack = false } = {}) {
  const main = document.getElementById('dp-main');
  const panel = SETTINGS_PANELS.find((p) => p.key === key);
  const intro = SETTINGS_PANEL_INTROS[key] || `Voici ${panel?.label || key}.`;
  // Pile de navigation (n°028) : on empile le module quitte, sauf en retour.
  if (!fromBack && currentPanelRef && currentPanelRef.key !== key) panelNavStack.push(currentPanelRef);
  currentPanelRef = { key, section: preselectSectionId };
  const prevPanel = panelNavStack.length ? SETTINGS_PANELS.find((p) => p.key === panelNavStack[panelNavStack.length - 1].key) : null;
  main.innerHTML = `
    <div class="dp-panel-topbar">
      <div class="dp-panel-heading">
        <span class="dp-panel-heading-icon">${panel?.icon || '⚙️'}</span>
        <div>
          <div class="dp-breadcrumb">
            <button type="button" id="dp-crumb-home">Accueil</button>
            <span aria-hidden="true">›</span>
            <span>${escapeHtml(panel?.label || key)}</span>
          </div>
          <div class="dp-panel-heading-title">${escapeHtml(panel?.label || key)}</div>
          <div class="dp-panel-heading-sub">${escapeHtml(intro)}</div>
        </div>
      </div>
      <button type="button" class="dp-panel-back-btn" id="dp-settings-back" title="${prevPanel ? `Revenir a ${escapeHtml(prevPanel.label)}` : "Revenir a l'accueil"}">← ${prevPanel ? escapeHtml(prevPanel.label) : 'Retour'}</button>
    </div>
    <div class="dp-settings-body-wrap" id="dp-settings-body"></div>
  `;
  document.getElementById('dp-settings-back').addEventListener('click', () => {
    window.UISound?.select();
    const prev = panelNavStack.pop();
    if (prev) {
      withViewTransition(() => renderSettingsPanel(guildId, prev.key, prev.section, { fromBack: true }));
    } else {
      currentPanelRef = null;
      withViewTransition(() => renderPreviewPage(guildId));
    }
  });
  document.getElementById('dp-crumb-home').addEventListener('click', () => {
    window.UISound?.select();
    currentPanelRef = null;
    panelNavStack.length = 0;
    withViewTransition(() => renderPreviewPage(guildId));
  });
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
    'assistant-ia': () => renderAiConfigPage(guildId, body),
    memberlookup: () => renderMemberLookupPage(guildId, body),
    giveaways: () => renderGiveawaysPage(guildId, body),
    creator: () => renderCreatorPage(guildId, body),
  };
  await renderers[key]?.();
  // Les pages a plusieurs modules (sectionHtml avec id) n'ont plus de grille
  // de navigation interne : le module vise (choisi depuis la grille
  // d'accueil) est active directement, ou a defaut le premier module de la
  // page pour ne jamais laisser un panneau vide.
  const target = preselectSectionId
    ? body.querySelector(`#section-${preselectSectionId}`)
    : body.querySelector('.section-panel');
  target?.classList.add('active');
}

function contextualChannelSettingsHtml(channelId, config) {
  if (config?.rulesChannelId && config.rulesChannelId === channelId) {
    return `
      <div class="dp-block">
        <p class="dp-block-title">📜 Reglement</p>
        <label for="dp-ctx-reglement">Texte du reglement</label>
        <textarea id="dp-ctx-reglement">${escapeHtml(config?.reglementText)}</textarea>
        <label class="dp-toggle-row" style="margin-top:8px;">
          <span>Verification anti-bot avant validation</span>
          <input type="checkbox" id="dp-ctx-captcha" ${config?.captchaEnabled === false ? '' : 'checked'} />
        </label>
        <label style="margin-top:10px;" for="dp-ctx-captcha-type">Type de captcha</label>
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
        <label for="dp-ctx-welcome">Message de bienvenue</label>
        <textarea id="dp-ctx-welcome">${escapeHtml(config?.welcomeMessageTemplate)}</textarea>
        <label for="dp-ctx-leave">Message de depart</label>
        <textarea id="dp-ctx-leave">${escapeHtml(config?.leaveMessageTemplate)}</textarea>
        <p class="muted">Variables disponibles : {user} {username} {server} {membercount}</p>
        <button class="btn secondary" id="dp-ctx-save-welcome" style="margin-top:12px;">Enregistrer les messages</button>
      </div>`;
  }
  return '';
}

function specialChannelToggleHtml(channelId, type, config) {
  if (type !== 0) return '';
  const isRules = config?.rulesChannelId === channelId;
  const isArrival = config?.arrivalDepartureChannelId === channelId;
  return `
    <div class="dp-block">
      <p class="dp-block-title">🔧 Role special de ce salon</p>
      <label class="dp-toggle-row">
        <span>Salon Reglement</span>
        <input type="checkbox" id="dp-set-rules" ${isRules ? 'checked' : ''} />
      </label>
      <label class="dp-toggle-row" style="margin-top:8px;">
        <span>Salon Bienvenue / Depart</span>
        <input type="checkbox" id="dp-set-arrival" ${isArrival ? 'checked' : ''} />
      </label>
    </div>`;
}

// Palette de couleurs de roles standard du client Discord (color picker natif).
const DISCORD_ROLE_COLORS = [
  '#1abc9c', '#2ecc71', '#3498db', '#9b59b6', '#e91e63',
  '#f1c40f', '#e67e22', '#e74c3c', '#95a5a6', '#607d8b',
];

const CHANNEL_EMOJI_PICKS = [
  '📢', '💬', '🎮', '🎫', '📜', '👋', '🔊', '⭐', '🔥', '🎉', '📁', '🛡️',
  '🎨', '🎵', '🎬', '📸', '🏆', '💡', '🤖', '🌐', '📌', '❓', '✅', '⚠️',
  '💰', '🎁', '📊', '🗓️', '🔒', '🎭', '🧩', '🚀', '💎', '🌟', '📝', '🔧',
];

function channelActionsFor(channelId, type, config) {
  const isTextChannel = type === 0;
  const isServiceHidden = (config?.onDutyHiddenChannelIds || []).includes(channelId);
  return [
    { key: 'rename', icon: '✏️', label: 'Renommer' },
    { key: 'emoji', icon: '😀', label: 'Emoji' },
    ...(isTextChannel ? [
      { key: 'reglement', icon: '📜', label: 'Reglement', on: config?.rulesChannelId === channelId },
      { key: 'arrival', icon: '👋', label: 'Bienvenue', on: config?.arrivalDepartureChannelId === channelId },
      { key: 'embed', icon: '💬', label: 'Embed' },
      { key: 'reactionroles', icon: '🎭', label: 'Roles' },
      { key: 'ticketpanel', icon: '🎫', label: 'Panneau tickets' },
      { key: 'pollpanel', icon: '🗳️', label: 'Panneau sondage' },
      { key: 'reglementpanel', icon: '📜', label: 'Poster le reglement' },
      { key: 'agerolepanel', icon: '🔞', label: 'Panneau age' },
    ] : []),
    ...(config?.reglementValidatedRoleId && type !== 4 ? [{ key: 'visibility', icon: '👁️', label: 'Visibilite' }] : []),
    { key: 'service', icon: '🛡️', label: 'Service staff', on: isServiceHidden },
    { key: 'permissions', icon: '🔐', label: 'Permissions' },
    { key: 'delete', icon: '🗑️', label: 'Supprimer', danger: true },
  ];
}

function channelActionDetailHtml(key, ctx) {
  const {
    guildId, channelId, name, type, config, channels, channel, roles,
  } = ctx;
  if (key === 'rename') {
    return `
      <div class="dp-block">
        <p class="dp-block-title">Nom du salon</p>
        <input type="text" id="dp-rename" value="${escapeHtml(name)}" />
        <button class="btn" id="dp-save-name" style="margin-top:10px;">Enregistrer</button>
      </div>`;
  }
  if (key === 'emoji') {
    return `
      <div class="dp-block">
        <p class="dp-block-title">Prefixer le nom avec un emoji</p>
        <div class="row" style="flex-wrap:wrap; gap:6px; margin-bottom:10px;">
          ${CHANNEL_EMOJI_PICKS.map((e) => `<button type="button" class="btn secondary dp-emoji-pick" data-emoji="${e}" aria-label="Emoji ${e}" style="font-size:1.05rem; padding:6px 10px;">${e}</button>`).join('')}
        </div>
        <input type="text" id="dp-emoji-name" value="${escapeHtml(name)}" />
        <button class="btn" id="dp-save-emoji" style="margin-top:10px;">Enregistrer</button>
      </div>`;
  }
  if (key === 'reglement') {
    return `
      <div class="dp-block">
        <p class="dp-block-title">📜 Salon Reglement</p>
        <label class="dp-toggle-row">
          <span>Ce salon sert de salon Reglement</span>
          <input type="checkbox" id="dp-set-rules" ${config?.rulesChannelId === channelId ? 'checked' : ''} />
        </label>
      </div>
      ${contextualChannelSettingsHtml(channelId, config)}`;
  }
  if (key === 'arrival') {
    return `
      <div class="dp-block">
        <p class="dp-block-title">👋 Salon Bienvenue / Depart</p>
        <label class="dp-toggle-row">
          <span>Ce salon recoit les messages de bienvenue/depart</span>
          <input type="checkbox" id="dp-set-arrival" ${config?.arrivalDepartureChannelId === channelId ? 'checked' : ''} />
        </label>
      </div>
      ${contextualChannelSettingsHtml(channelId, config)}`;
  }
  if (key === 'ticketpanel') {
    return `
      <div class="dp-block">
        <p class="dp-block-title">🎫 Panneau tickets</p>
        <p class="muted" style="margin:0 0 12px;">Poste un bouton "Ouvrir un ticket" dans #${escapeHtml(name)}.</p>
        <button class="btn" id="dp-post-ticket-panel">Poster le panneau</button>
      </div>`;
  }
  if (key === 'pollpanel') {
    return `
      <div class="dp-block">
        <p class="dp-block-title">🗳️ Panneau sondage</p>
        <p class="muted" style="margin:0 0 12px;">Poste un bouton "Creer un sondage" dans #${escapeHtml(name)}.</p>
        <button class="btn" id="dp-post-poll-panel">Poster le panneau</button>
      </div>`;
  }
  if (key === 'reglementpanel') {
    return `
      <div class="dp-block">
        <p class="dp-block-title">📜 Poster le reglement</p>
        <p class="muted" style="margin:0 0 12px;">Reposte l'embed reglement dans le salon configure comme salon Reglement (pas forcement #${escapeHtml(name)}).</p>
        <button class="btn" id="dp-post-reglement-panel">Poster le panneau</button>
      </div>`;
  }
  if (key === 'agerolepanel') {
    return `
      <div class="dp-block">
        <p class="dp-block-title">🔞 Panneau age (+16/-16)</p>
        <p class="muted" style="margin:0 0 12px;">Reposte le message de selection de tranche d'age dans le salon configure pour les roles.</p>
        <button class="btn" id="dp-post-roles-panel">Poster le panneau</button>
      </div>`;
  }
  if (key === 'visibility') {
    const currentlyVisible = config?.reglementValidatedRoleId
      ? isViewAllowed(channel, config.reglementValidatedRoleId)
      : null;
    return `
      <div class="dp-block">
        <p class="dp-block-title">👁️ Visibilite</p>
        <label class="dp-toggle-row">
          <span>Visible pour "Reglement valide"</span>
          <input type="checkbox" id="dp-visible-toggle" ${currentlyVisible !== false ? 'checked' : ''} />
        </label>
      </div>`;
  }
  if (key === 'embed') {
    return `
      <div class="dp-block">
        <p class="dp-block-title">💬 Embed</p>
        <p class="muted" style="margin:0 0 12px;">Cree un embed (texte riche, image, boutons) et poste-le directement dans #${escapeHtml(name)}.</p>
        <button class="btn" id="dp-goto-embed">Ouvrir le generateur d'embed</button>
      </div>`;
  }
  if (key === 'reactionroles') {
    return `
      <div class="dp-block">
        <p class="dp-block-title">🎭 Roles-reaction</p>
        <p class="muted" style="margin:0 0 12px;">Cree un groupe de roles-reaction (menu deroulant, choix multiple) poste dans #${escapeHtml(name)}.</p>
        <button class="btn" id="dp-goto-roles">Ouvrir la gestion des roles</button>
      </div>`;
  }
  if (key === 'service') {
    const isServiceHidden = (config?.onDutyHiddenChannelIds || []).includes(channelId);
    return `
      <div class="dp-block">
        <p class="dp-block-title">🛡️ Service staff</p>
        <label class="dp-toggle-row">
          <span>Cache sauf staff actuellement en service</span>
          <input type="checkbox" id="dp-service-toggle" ${isServiceHidden ? 'checked' : ''} />
        </label>
        <p class="muted" style="margin-top:10px;">Un membre du staff rejoint le vocal SERVICE STAFF pour activer son statut "en service". Gere la liste des roles consideres comme staff depuis Automatisations &gt; Service.</p>
      </div>`;
  }
  if (key === 'permissions') {
    const otherChannels = channels.filter((c) => c.id !== channelId && c.type !== 4);
    const roleOptions = (roles || []).map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
    return `
      <div class="dp-block">
        <p class="dp-block-title">🔐 Modifier pour un role</p>
        <label for="dp-perm-role">Role</label>
        <select id="dp-perm-role">${roleOptions}</select>
        <label for="dp-perm-preset">Action</label>
        <select id="dp-perm-preset">
          ${PERMISSION_PRESETS.map((p) => `<option value="${p.key}">${escapeHtml(p.label)}</option>`).join('')}
        </select>
        <button class="btn" id="dp-perm-apply" style="margin-top:10px;">Appliquer</button>
      </div>
      <div class="dp-block">
        <p class="dp-block-title">📥 Importer d'un autre salon</p>
        <select id="dp-import-from" aria-label="Importer les permissions d'un autre salon">
          <option value="">Choisir un salon...</option>
          ${otherChannels.map((c) => `<option value="${c.id}">${c.type === 2 ? '🔊' : '#'}${escapeHtml(c.name)}</option>`).join('')}
        </select>
        <button class="btn secondary" id="dp-import-perms" style="margin-top:8px;">Importer</button>
        <p class="muted" style="margin-top:12px;">Pour voir le detail complet des permissions, utilise la page Permissions.</p>
      </div>`;
  }
  if (key === 'delete') {
    return `
      <div class="dp-block danger">
        <p class="dp-block-title">Zone de danger</p>
        <p class="muted" style="margin:0 0 12px;">Cette action est irreversible.</p>
        <button class="btn danger" id="dp-delete">Supprimer ce salon</button>
      </div>`;
  }
  return '';
}

// Fil de conversation generique (bot d'actions) : un message d'accueil avec
// une grille d'actions visuelle reste affiche en haut, et chaque clic sur une
// action remplace la reponse precedente du bot (une seule reponse visible a
// la fois, toujours en bas) — pas d'echo du choix de l'utilisateur, pas
// d'empilement d'historique.
function renderActionChat(main, {
  guildId, greeting, actions, getDetailHtml, wireDetail,
}) {
  const chatId = `dp-chat-${Date.now().toString(36)}`;
  main.innerHTML = `
    <div class="dp-panel-topbar">
      <div></div>
      <button type="button" class="dp-panel-back-btn" id="dp-actionchat-back">← Retour</button>
    </div>
    <div class="dp-chat" id="${chatId}"></div>
  `;
  document.getElementById('dp-actionchat-back').addEventListener('click', () => {
    window.UISound?.select();
    withViewTransition(() => renderPreviewPage(guildId));
  });
  const chat = document.getElementById(chatId);

  function scrollToBottom() {
    chat.scrollTop = chat.scrollHeight;
  }

  function appendBotMessage(bodyHtml) {
    const msg = document.createElement('div');
    msg.className = 'dp-chat-msg bot';
    msg.innerHTML = `
      <div class="dp-chat-avatar">${botAvatarHtml()}</div>
      <div class="dp-chat-bubble">
        <div class="dp-chat-author">ServeurCreator Bot</div>
        ${bodyHtml}
      </div>`;
    chat.appendChild(msg);
    return msg;
  }

  function actionGridHtml() {
    return `
      <div class="dp-action-grid">
        ${actions.map((a) => `
          <button type="button" class="dp-action-card${a.danger ? ' danger' : ''}" data-action="${a.key}">
            <span class="icon">${a.icon}</span>
            <span class="label">${escapeHtml(a.label)}</span>
            ${a.on ? '<span class="state-dot"></span>' : ''}
          </button>
        `).join('')}
      </div>`;
  }

  function wireActionGrid(scope) {
    scope.querySelectorAll('.dp-action-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.UISound?.select();
        const action = actions.find((a) => a.key === btn.dataset.action);
        const existingResponse = chat.querySelector('.dp-chat-msg.bot[data-response]');
        if (existingResponse) existingResponse.remove();
        const botMsg = appendBotMessage(getDetailHtml(action.key));
        botMsg.dataset.response = 'true';
        botMsg.dataset.detailKey = action.key;
        wireDetail(botMsg, action.key);
        scrollToBottom();
      });
    });
  }

  const first = appendBotMessage(`<div class="dp-chat-text">${escapeHtml(greeting)}</div>${actionGridHtml()}`);
  wireActionGrid(first);
  scrollToBottom();
}

function categoryActionDetailHtml(key, ctx) {
  const {
    guildId, categoryId, name, config, channels, roles,
  } = ctx;
  if (key === 'create-channel') {
    const otherChannels = channels.filter((c) => c.type !== 4);
    return `
      <div class="dp-block dp-form-grid">
        <p class="dp-block-title">➕ Creer un salon dans "${escapeHtml(name)}"</p>
        <div>
          <label for="dp-cat-new-channel-name">Nom du salon</label>
          <input type="text" id="dp-cat-new-channel-name" placeholder="Nom du salon" maxlength="80" data-charcount />
          <div class="row" style="flex-wrap:wrap; gap:4px; margin-top:6px;">
            ${CHANNEL_EMOJI_PICKS.slice(0, 12).map((e) => `<button type="button" class="btn secondary dp-cat-new-channel-emoji-pick" data-emoji="${e}" aria-label="Emoji ${e}" style="font-size:0.95rem; padding:4px 8px;">${e}</button>`).join('')}
          </div>
        </div>
        <div>
          <label for="dp-cat-new-channel-type">Type</label>
          <select id="dp-cat-new-channel-type">
            <option value="text">💬 Texte</option>
            <option value="voice">🔊 Vocal</option>
            <option value="voice-temp">🔊 Vocal temporaire (cree un salon perso par membre)</option>
            <option value="forum">🗂️ Forum</option>
          </select>
        </div>
        <div>
          <label for="dp-cat-new-channel-visibility">Visibilite</label>
          <select id="dp-cat-new-channel-visibility">
            <option value="private">🔒 Prive (reserve aux membres ayant valide le reglement)</option>
            <option value="public">🌐 Public (herite de la categorie)</option>
          </select>
        </div>
        <div>
          <label for="dp-cat-new-channel-import">Importer les permissions d'un salon existant (optionnel)</label>
          <select id="dp-cat-new-channel-import">
            <option value="">Aucune (permissions par defaut)</option>
            ${otherChannels.map((c) => `<option value="${c.id}">${c.type === 2 ? '🔊' : '#'}${escapeHtml(c.name)}</option>`).join('')}
          </select>
        </div>
        <button class="btn dp-form-full" id="dp-cat-create-channel" style="margin-top:12px;">Creer le salon</button>
      </div>`;
  }
  if (key === 'rename') {
    return `
      <div class="dp-block">
        <p class="dp-block-title">Nom de la categorie</p>
        <input type="text" id="dp-cat-rename" value="${escapeHtml(name)}" />
        <button class="btn" id="dp-cat-save-name" style="margin-top:10px;">Enregistrer</button>
      </div>`;
  }
  if (key === 'emoji') {
    return `
      <div class="dp-block">
        <p class="dp-block-title">Prefixer le nom avec un emoji</p>
        <div class="row" style="flex-wrap:wrap; gap:6px; margin-bottom:10px;">
          ${CHANNEL_EMOJI_PICKS.map((e) => `<button type="button" class="btn secondary dp-cat-emoji-pick" data-emoji="${e}" aria-label="Emoji ${e}" style="font-size:1.05rem; padding:6px 10px;">${e}</button>`).join('')}
        </div>
        <input type="text" id="dp-cat-emoji-name" value="${escapeHtml(name)}" />
        <button class="btn" id="dp-cat-save-emoji" style="margin-top:10px;">Enregistrer</button>
      </div>`;
  }
  if (key === 'service') {
    const isServiceHidden = (config?.onDutyHiddenCategoryIds || []).includes(categoryId);
    return `
      <div class="dp-block">
        <p class="dp-block-title">🛡️ Service staff</p>
        <label class="dp-toggle-row">
          <span>Cachee sauf staff actuellement en service</span>
          <input type="checkbox" id="dp-cat-service-toggle" ${isServiceHidden ? 'checked' : ''} />
        </label>
        <p class="muted" style="margin-top:10px;">S'applique a toute la categorie (tous les salons qu'elle contient).</p>
      </div>`;
  }
  if (key === 'permissions') {
    const otherCategories = channels.filter((c) => c.type === 4 && c.id !== categoryId);
    const roleOptions = (roles || []).map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
    return `
      <div class="dp-block">
        <p class="dp-block-title">🔐 Modifier pour un role</p>
        <label for="dp-cat-perm-role">Role</label>
        <select id="dp-cat-perm-role">${roleOptions}</select>
        <label for="dp-cat-perm-preset">Action</label>
        <select id="dp-cat-perm-preset">
          ${PERMISSION_PRESETS.map((p) => `<option value="${p.key}">${escapeHtml(p.label)}</option>`).join('')}
        </select>
        <button class="btn" id="dp-cat-perm-apply" style="margin-top:10px;">Appliquer</button>
        <p class="muted" style="margin-top:12px;">S'applique a la categorie elle-meme, pas aux salons qu'elle contient.</p>
      </div>
      <div class="dp-block">
        <p class="dp-block-title">📥 Importer d'une autre categorie</p>
        <select id="dp-cat-import-from" aria-label="Importer les permissions d'une autre categorie">
          <option value="">Choisir une categorie...</option>
          ${otherCategories.map((c) => `<option value="${c.id}">📁 ${escapeHtml(c.name)}</option>`).join('')}
        </select>
        <button class="btn secondary" id="dp-cat-import-perms" style="margin-top:8px;">Importer</button>
      </div>`;
  }
  if (key === 'delete') {
    return `
      <div class="dp-block danger">
        <p class="dp-block-title">Zone de danger</p>
        <p class="muted" style="margin:0 0 12px;">Supprime la categorie. Les salons qu'elle contient ne sont pas supprimes, juste detaches.</p>
        <button class="btn danger" id="dp-cat-delete">Supprimer cette categorie</button>
      </div>`;
  }
  return '';
}

function renderCategoryPanel(guildId, categoryId, name, config, channels, roles) {
  const main = document.getElementById('dp-main');
  const actions = [
    { key: 'create-channel', icon: '➕', label: 'Creer un salon' },
    { key: 'rename', icon: '✏️', label: 'Renommer' },
    { key: 'emoji', icon: '😀', label: 'Emoji' },
    { key: 'service', icon: '🛡️', label: 'Service staff', on: (config?.onDutyHiddenCategoryIds || []).includes(categoryId) },
    { key: 'permissions', icon: '🔐', label: 'Permissions' },
    { key: 'delete', icon: '🗑️', label: 'Supprimer', danger: true },
  ];
  const ctx = {
    guildId, categoryId, name, config, channels, roles,
  };

  function wireDetail(scope, key) {
    if (key === 'create-channel') {
      scope.querySelectorAll('.dp-cat-new-channel-emoji-pick').forEach((btn) => {
        btn.addEventListener('click', () => {
          const input = scope.querySelector('#dp-cat-new-channel-name');
          if (!input.value.startsWith(btn.dataset.emoji)) input.value = `${btn.dataset.emoji} ${input.value}`.trim();
        });
      });
      scope.querySelector('#dp-cat-create-channel').addEventListener('click', async () => {
        const chName = scope.querySelector('#dp-cat-new-channel-name').value.trim();
        if (!chName) { showToast('Nom du salon requis.', 'error'); return; }
        const type = scope.querySelector('#dp-cat-new-channel-type').value;
        const isPrivate = scope.querySelector('#dp-cat-new-channel-visibility').value === 'private';
        const importFromChannelId = scope.querySelector('#dp-cat-new-channel-import').value || undefined;
        try {
          await Api.createChannel(guildId, chName, type, categoryId, isPrivate, importFromChannelId);
          showToast('Salon cree.');
          await renderPreviewPage(guildId);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }
    if (key === 'rename' || key === 'emoji') {
      scope.querySelectorAll('.dp-cat-emoji-pick').forEach((btn) => {
        btn.addEventListener('click', () => {
          const input = scope.querySelector('#dp-cat-emoji-name');
          if (!input.value.startsWith(btn.dataset.emoji)) input.value = `${btn.dataset.emoji} ${input.value}`.trim();
        });
      });
      const saveBtn = scope.querySelector(key === 'rename' ? '#dp-cat-save-name' : '#dp-cat-save-emoji');
      const input = scope.querySelector(key === 'rename' ? '#dp-cat-rename' : '#dp-cat-emoji-name');
      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          const value = input.value.trim();
          if (!value) return;
          try {
            await Api.renameChannel(guildId, categoryId, value);
            showToast('Categorie renommee.');
            await renderPreviewPage(guildId);
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      }
    }
    if (key === 'service') {
      const serviceToggle = scope.querySelector('#dp-cat-service-toggle');
      serviceToggle.addEventListener('change', async () => {
        try {
          const current = new Set(config.onDutyHiddenCategoryIds || []);
          if (serviceToggle.checked) current.add(categoryId); else current.delete(categoryId);
          config.onDutyHiddenCategoryIds = [...current];
          await Api.updateConfig(guildId, { onDutyHiddenCategoryIds: config.onDutyHiddenCategoryIds });
          await Api.applyServiceVisibility(guildId);
          showToast('Service staff mis a jour.');
        } catch (err) {
          showToast(err.message, 'error');
          serviceToggle.checked = !serviceToggle.checked;
        }
      });
    }
    if (key === 'permissions') {
      scope.querySelector('#dp-cat-perm-apply').addEventListener('click', async () => {
        const roleId = scope.querySelector('#dp-cat-perm-role').value;
        const preset = PERMISSION_PRESETS.find((p) => p.key === scope.querySelector('#dp-cat-perm-preset').value);
        if (!roleId) { showToast('Choisis un role.', 'error'); return; }
        try {
          const results = await Api.bulkPermissions(guildId, {
            channelIds: [categoryId], roleId, allow: preset.allow, deny: preset.deny,
          });
          const failed = results.filter((r) => !r.ok);
          showToast(failed.length ? `Erreur : ${failed[0].error}` : 'Permissions mises a jour.', failed.length ? 'error' : 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
      scope.querySelector('#dp-cat-import-perms').addEventListener('click', async () => {
        const sourceId = scope.querySelector('#dp-cat-import-from').value;
        if (!sourceId) { showToast('Choisis une categorie source.', 'error'); return; }
        try {
          const data = await Api.exportPermissions(guildId, sourceId);
          await Api.importPermissions(guildId, categoryId, data.permissionOverwrites);
          showToast('Permissions importees.');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }
    if (key === 'delete') {
      scope.querySelector('#dp-cat-delete').addEventListener('click', () => {
        withViewTransition(() => renderPreviewPage(guildId));
        showUndoToast(`Categorie "${name}" supprimee dans`, {
          onUndo: () => showToast('Suppression annulee.'),
          onExpire: async () => {
            try {
              await Api.deleteChannel(guildId, categoryId);
              showToast('Categorie supprimee.');
              await renderPreviewPage(guildId);
            } catch (err) {
              showToast(err.message, 'error');
            }
          },
        });
      });
    }
  }

  renderActionChat(main, {
    guildId,
    greeting: `Tu as glisse la categorie "${name}" ici. Que veux-tu faire ?`,
    actions,
    getDetailHtml: (key) => categoryActionDetailHtml(key, ctx),
    wireDetail,
  });
}

function roleActionDetailHtml(key, ctx) {
  const {
    roleId, name, role, memberNames,
  } = ctx;
  const hex = role?.color ? `#${role.color.toString(16).padStart(6, '0')}` : '#99aab5';
  if (key === 'rename') {
    return `
      <div class="dp-block">
        <p class="dp-block-title">Nom du role</p>
        <input type="text" id="dp-role-rename" value="${escapeHtml(name)}" />
        <button class="btn" id="dp-role-save-name" style="margin-top:10px;">Enregistrer</button>
      </div>`;
  }
  if (key === 'color') {
    return `
      <div class="dp-block">
        <p class="dp-block-title">Couleur du role</p>
        <input type="color" id="dp-role-color" value="${hex}" data-role="${roleId}" />
      </div>`;
  }
  if (key === 'permissions') {
    const mask = BigInt(role?.permissions || '0');
    return `
      <div class="dp-block">
        <p class="dp-block-title">🔐 Permissions</p>
        <p class="muted" style="margin:0 0 10px;">Coche ou decoche pour ajouter/retirer une permission a ce role.</p>
        <div class="dp-perm-checklist">
          ${Object.entries(PERMISSION_BITS).map(([permName, bit]) => `
            <label class="dp-toggle-row" style="margin-top:6px;">
              <span>${escapeHtml(PERMISSION_LABELS[permName] || permName)}</span>
              <input type="checkbox" class="dp-role-perm-check" data-perm="${permName}" ${(mask & bit) ? 'checked' : ''} />
            </label>
          `).join('')}
        </div>
        <button class="btn" id="dp-role-save-perms" style="margin-top:12px;">Enregistrer les permissions</button>
      </div>`;
  }
  if (key === 'members') {
    return `
      <div class="dp-block">
        <p class="dp-block-title">Membres (${memberNames.length})</p>
        <p class="muted">${memberNames.length ? escapeHtml(memberNames.join(', ')) : 'Aucun membre'}</p>
      </div>`;
  }
  if (key === 'delete') {
    return `
      <div class="dp-block danger">
        <p class="dp-block-title">Zone de danger</p>
        <p class="muted" style="margin:0 0 12px;">Cette action est irreversible.</p>
        <button class="btn danger" id="dp-role-delete">Supprimer ce role</button>
      </div>`;
  }
  return '';
}

function renderRolePanel(guildId, roleId, name, config, roles, members) {
  const main = document.getElementById('dp-main');
  const role = roles.find((r) => r.id === roleId);
  const memberNames = members.filter((m) => (m.roles || []).includes(roleId)).map((m) => m.displayName);
  const actions = [
    { key: 'rename', icon: '✏️', label: 'Renommer' },
    { key: 'color', icon: '🎨', label: 'Couleur' },
    { key: 'permissions', icon: '🔐', label: 'Permissions' },
    { key: 'members', icon: '👥', label: 'Membres' },
    { key: 'delete', icon: '🗑️', label: 'Supprimer', danger: true },
  ];
  const ctx = {
    guildId, roleId, name, role, memberNames,
  };

  function wireDetail(scope, key) {
    if (key === 'rename') {
      scope.querySelector('#dp-role-save-name').addEventListener('click', async () => {
        const value = scope.querySelector('#dp-role-rename').value.trim();
        if (!value) return;
        try {
          await Api.renameRole(guildId, roleId, value);
          showToast('Role renomme.');
          await renderPreviewPage(guildId);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }
    if (key === 'color') {
      scope.querySelector('#dp-role-color').addEventListener('change', async (e) => {
        try {
          await Api.setRoleColor(guildId, roleId, parseInt(e.target.value.slice(1), 16));
          showToast('Couleur mise a jour.');
          const dot = document.querySelector(`.dp-role-row[data-role="${roleId}"] .dp-role-dot`);
          if (dot) dot.style.background = e.target.value;
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }
    if (key === 'permissions') {
      scope.querySelector('#dp-role-save-perms').addEventListener('click', async () => {
        let mask = 0n;
        scope.querySelectorAll('.dp-role-perm-check').forEach((input) => {
          if (input.checked) mask |= PERMISSION_BITS[input.dataset.perm];
        });
        try {
          await Api.setRolePermissions(guildId, roleId, mask.toString());
          showToast('Permissions mises a jour.');
          await renderPreviewPage(guildId);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }
    if (key === 'delete') {
      scope.querySelector('#dp-role-delete').addEventListener('click', () => {
        withViewTransition(() => renderPreviewPage(guildId));
        showUndoToast(`Role "${name}" supprime dans`, {
          onUndo: () => showToast('Suppression annulee.'),
          onExpire: async () => {
            try {
              await Api.deleteRole(guildId, roleId);
              showToast('Role supprime.');
              await renderPreviewPage(guildId);
            } catch (err) {
              showToast(err.message, 'error');
            }
          },
        });
      });
    }
  }

  renderActionChat(main, {
    guildId,
    greeting: `Tu as glisse le role "${name}" ici. Que veux-tu faire ?`,
    actions,
    getDetailHtml: (key) => roleActionDetailHtml(key, ctx),
    wireDetail,
  });
}

function renderChannelPanel(guildId, channelId, name, type, config, channels, roles) {
  const main = document.getElementById('dp-main');
  const channel = channels.find((c) => c.id === channelId);
  const icon = type === 2 ? '🔊' : type === 4 ? '📁' : '#';
  const actions = channelActionsFor(channelId, type, config);
  const ctx = {
    guildId, channelId, name, type, config, channels, channel, roles,
  };

  function wireDetail(scope, key) {
    const saveNameBtn = scope.querySelector('#dp-save-name');
    if (saveNameBtn) {
      saveNameBtn.addEventListener('click', async () => {
        const value = scope.querySelector('#dp-rename').value.trim();
        if (!value) return;
        try {
          await Api.renameChannel(guildId, channelId, value);
          showToast('Salon renomme.');
          await renderPreviewPage(guildId);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    scope.querySelectorAll('.dp-emoji-pick').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = scope.querySelector('#dp-emoji-name');
        if (!input.value.startsWith(btn.dataset.emoji)) input.value = `${btn.dataset.emoji} ${input.value}`.trim();
      });
    });
    const saveEmojiBtn = scope.querySelector('#dp-save-emoji');
    if (saveEmojiBtn) {
      saveEmojiBtn.addEventListener('click', async () => {
        const value = scope.querySelector('#dp-emoji-name').value.trim();
        if (!value) return;
        try {
          await Api.renameChannel(guildId, channelId, value);
          showToast('Salon renomme.');
          await renderPreviewPage(guildId);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    const saveReglementBtn = scope.querySelector('#dp-ctx-save-reglement');
    if (saveReglementBtn) {
      saveReglementBtn.addEventListener('click', async () => {
        try {
          await Api.updateConfig(guildId, {
            reglementText: scope.querySelector('#dp-ctx-reglement').value,
            captchaEnabled: scope.querySelector('#dp-ctx-captcha').checked,
            captchaType: scope.querySelector('#dp-ctx-captcha-type').value,
          });
          showToast('Reglement enregistre.');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    const repostReglementBtn = scope.querySelector('#dp-ctx-repost-reglement');
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

    const postTicketPanelBtn = scope.querySelector('#dp-post-ticket-panel');
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

    const postPollPanelBtn = scope.querySelector('#dp-post-poll-panel');
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

    const postReglementPanelBtn = scope.querySelector('#dp-post-reglement-panel');
    if (postReglementPanelBtn) {
      postReglementPanelBtn.addEventListener('click', async () => {
        try {
          await Api.postPanel(guildId, 'reglement');
          showToast('Panneau reglement reposte, actif sous quelques secondes.');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    const postRolesPanelBtn = scope.querySelector('#dp-post-roles-panel');
    if (postRolesPanelBtn) {
      postRolesPanelBtn.addEventListener('click', async () => {
        try {
          await Api.postPanel(guildId, 'roles');
          showToast('Panneau roles reposte, actif sous quelques secondes.');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    const saveWelcomeBtn = scope.querySelector('#dp-ctx-save-welcome');
    if (saveWelcomeBtn) {
      saveWelcomeBtn.addEventListener('click', async () => {
        try {
          await Api.updateConfig(guildId, {
            welcomeMessageTemplate: scope.querySelector('#dp-ctx-welcome').value,
            leaveMessageTemplate: scope.querySelector('#dp-ctx-leave').value,
          });
          showToast('Messages enregistres.');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    const setRulesToggle = scope.querySelector('#dp-set-rules');
    if (setRulesToggle) {
      setRulesToggle.addEventListener('change', async () => {
        try {
          config.rulesChannelId = setRulesToggle.checked ? channelId : null;
          await Api.updateConfig(guildId, { rulesChannelId: config.rulesChannelId });
          showToast('Salon reglement mis a jour.');
        } catch (err) {
          showToast(err.message, 'error');
          setRulesToggle.checked = !setRulesToggle.checked;
        }
      });
    }

    const setArrivalToggle = scope.querySelector('#dp-set-arrival');
    if (setArrivalToggle) {
      setArrivalToggle.addEventListener('change', async () => {
        try {
          config.arrivalDepartureChannelId = setArrivalToggle.checked ? channelId : null;
          await Api.updateConfig(guildId, { arrivalDepartureChannelId: config.arrivalDepartureChannelId });
          showToast('Salon bienvenue/depart mis a jour.');
        } catch (err) {
          showToast(err.message, 'error');
          setArrivalToggle.checked = !setArrivalToggle.checked;
        }
      });
    }

    const visibilityToggle = scope.querySelector('#dp-visible-toggle');
    if (visibilityToggle) {
      visibilityToggle.addEventListener('change', async () => {
        try {
          await Api.bulkPermissions(guildId, {
            channelIds: [channelId],
            roleId: config.reglementValidatedRoleId,
            allow: visibilityToggle.checked ? ['ViewChannel'] : [],
            deny: visibilityToggle.checked ? [] : ['ViewChannel'],
          });
          showToast('Visibilite mise a jour.');
        } catch (err) {
          showToast(err.message, 'error');
          visibilityToggle.checked = !visibilityToggle.checked;
        }
      });
    }

    const gotoEmbedBtn = scope.querySelector('#dp-goto-embed');
    if (gotoEmbedBtn) {
      gotoEmbedBtn.addEventListener('click', () => {
        prefillChannelId = channelId;
        withViewTransition(() => renderSettingsPanel(guildId, 'embedbuilder'));
      });
    }

    const gotoRolesBtn = scope.querySelector('#dp-goto-roles');
    if (gotoRolesBtn) {
      gotoRolesBtn.addEventListener('click', () => {
        withViewTransition(() => renderSettingsPanel(guildId, 'jeux'));
      });
    }

    const serviceToggle = scope.querySelector('#dp-service-toggle');
    if (serviceToggle) {
      serviceToggle.addEventListener('change', async () => {
        try {
          const current = new Set(config.onDutyHiddenChannelIds || []);
          if (serviceToggle.checked) current.add(channelId); else current.delete(channelId);
          config.onDutyHiddenChannelIds = [...current];
          await Api.updateConfig(guildId, { onDutyHiddenChannelIds: config.onDutyHiddenChannelIds });
          await Api.applyServiceVisibility(guildId);
          showToast('Service staff mis a jour.');
        } catch (err) {
          showToast(err.message, 'error');
          serviceToggle.checked = !serviceToggle.checked;
        }
      });
    }

    const applyPermBtn = scope.querySelector('#dp-perm-apply');
    if (applyPermBtn) {
      applyPermBtn.addEventListener('click', async () => {
        const roleId = scope.querySelector('#dp-perm-role').value;
        const preset = PERMISSION_PRESETS.find((p) => p.key === scope.querySelector('#dp-perm-preset').value);
        if (!roleId) { showToast('Choisis un role.', 'error'); return; }
        try {
          const results = await Api.bulkPermissions(guildId, {
            channelIds: [channelId], roleId, allow: preset.allow, deny: preset.deny,
          });
          const failed = results.filter((r) => !r.ok);
          showToast(failed.length ? `Erreur : ${failed[0].error}` : 'Permissions mises a jour.', failed.length ? 'error' : 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    const importPermsBtn = scope.querySelector('#dp-import-perms');
    if (importPermsBtn) {
      importPermsBtn.addEventListener('click', async () => {
        const sourceId = scope.querySelector('#dp-import-from').value;
        if (!sourceId) { showToast('Choisis un salon source.', 'error'); return; }
        try {
          const data = await Api.exportPermissions(guildId, sourceId);
          await Api.importPermissions(guildId, channelId, data.permissionOverwrites);
          showToast('Permissions importees.');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    const deleteBtn = scope.querySelector('#dp-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        withViewTransition(() => renderPreviewPage(guildId));
        showUndoToast(`Salon "${name}" supprime dans`, {
          onUndo: () => showToast('Suppression annulee.'),
          onExpire: async () => {
            try {
              await Api.deleteChannel(guildId, channelId);
              showToast('Salon supprime.');
              await renderPreviewPage(guildId);
            } catch (err) {
              showToast(err.message, 'error');
            }
          },
        });
      });
    }
  }

  renderActionChat(main, {
    guildId,
    greeting: `Tu as glisse ${icon === '#' ? '#' : icon}${name} ici. Que veux-tu faire ?`,
    actions,
    getDetailHtml: (key) => channelActionDetailHtml(key, ctx),
    wireDetail,
  });
}

/* ---------- Pages: permissions ---------- */

function dashboardAccessRows(userIds, deleteClass = 'delete-dashboard-access') {
  return userIds.map((uid) => `
    <div class="row" data-uid="${uid}" style="justify-content:space-between; margin-bottom:6px;">
      <span class="muted">${escapeHtml(uid)}</span>
      <button class="btn danger ${deleteClass}" data-uid="${uid}">Retirer</button>
    </div>
  `).join('') || '<p class="muted">Aucun acces delegue.</p>';
}

async function renderPermissionsPage(id, container = app) {
  container.innerHTML = skeletonHtml();
  const [channels, roles, config] = await Promise.all([Api.channels(id), Api.roles(id), Api.config(id)]);
  const editableChannels = channels.filter((c) => c.type === 0 || c.type === 2 || c.type === 4);
  const roleOptions = roles.filter((r) => r.name !== '@everyone').map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
  const channelCheckboxes = editableChannels.map((c) => `
    <label><input type="checkbox" value="${c.id}" class="perm-channel" /> ${c.type === 4 ? '📁' : c.type === 2 ? '🔊' : '#'} ${escapeHtml(c.name)}</label>
  `).join('');
  const presetOptions = PERMISSION_PRESETS.map((p) => `<option value="${p.key}">${escapeHtml(p.label)}</option>`).join('');
  const channelOptionsSimple = editableChannels.map((c) => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');
  let dashboardAllowedUserIds = config?.dashboardAllowedUserIds || [];
  let dashboardViewerUserIds = config?.dashboardViewerUserIds || [];

  container.innerHTML = `
    <div class="inner">
      ${sectionHtml('Edition en masse', `
        <p class="muted">Choisis les salons, le role, et une action rapide a appliquer partout en un clic.</p>
        <label>Salons</label>
        <div class="channel-picker">${channelCheckboxes}</div>
        <label for="perm-role">Role</label>
        <select id="perm-role">${roleOptions}</select>
        <label for="perm-preset">Action</label>
        <select id="perm-preset">${presetOptions}</select>
        <button class="btn" id="apply-bulk" style="margin-top:12px;">Appliquer</button>
      `, { id: 'perm-bulk' })}

      ${sectionHtml('Export / Import (copier-coller)', `
        <label for="export-channel">Salon a exporter</label>
        <select id="export-channel">${channelOptionsSimple}</select>
        <button class="btn secondary" id="export-btn" style="margin-top:8px;">Exporter</button>
        <textarea id="export-output" placeholder="Le JSON exporte apparait ici, copie-le."></textarea>

        <label for="import-input">Coller ici pour importer</label>
        <textarea id="import-input" placeholder="Colle ici le JSON exporte depuis un autre salon/serveur"></textarea>
        <label for="import-channel">Salon cible</label>
        <select id="import-channel">${channelOptionsSimple}</select>
        <button class="btn secondary" id="import-btn" style="margin-top:8px;">Importer</button>
      `, { id: 'perm-io' })}

      ${sectionHtml('Permissions par defaut', `
        <p class="muted">Reinitialise les permissions du role au preset recommande (utile si elles ont ete modifiees par erreur).</p>
        <div class="row">
          <button class="btn secondary" id="reset-admin">Reinitialiser Administrateur</button>
          <button class="btn secondary" id="reset-mod">Reinitialiser Moderateur</button>
        </div>
      `, { id: 'perm-default' })}

      ${sectionHtml('Acces au dashboard (au-dela d\'Administrator Discord)', `
        <p class="muted">Donne acces a ce dashboard a des membres specifiques (par ID Discord) meme s'ils n'ont pas la permission Administrator sur le serveur. Ils pourront tout configurer ici, comme un administrateur du dashboard.</p>
        <div id="dashboard-access-list">${dashboardAccessRows(dashboardAllowedUserIds)}</div>
        <div class="row" style="margin-top:10px;">
          <input type="text" id="new-dashboard-access-id" placeholder="ID Discord du membre" aria-label="ID Discord du membre (acces complet)" style="flex:1;" />
          <button class="btn secondary" id="add-dashboard-access">Ajouter</button>
        </div>
        <h2 style="margin-top:20px; font-size:0.85rem;">👁️ Acces en lecture seule</h2>
        <p class="muted">Ces membres voient tout le dashboard (stats, logs, structure) mais aucune action de modification ne leur est permise.</p>
        <div id="dashboard-viewer-list">${dashboardAccessRows(dashboardViewerUserIds, 'delete-dashboard-viewer')}</div>
        <div class="row" style="margin-top:10px;">
          <input type="text" id="new-dashboard-viewer-id" placeholder="ID Discord du membre" aria-label="ID Discord du membre (lecture seule)" style="flex:1;" />
          <button class="btn secondary" id="add-dashboard-viewer">Ajouter</button>
        </div>
      `, { id: 'perm-dashboard' })}
    </div>
  `;

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
    if (!window.confirm('Reinitialiser le role Administrateur aux permissions par defaut ? Les modifications actuelles seront perdues.')) return;
    try {
      await Api.resetRoleDefault(id, 'administrateur');
      showToast('Role Administrateur reinitialise.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  document.getElementById('reset-mod').addEventListener('click', async () => {
    if (!window.confirm('Reinitialiser le role Moderateur aux permissions par defaut ? Les modifications actuelles seront perdues.')) return;
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
        if (!window.confirm('Retirer l\'acces au dashboard pour cet utilisateur ?')) return;
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

  // Acces en lecture seule (roadmap n°058) : liste separee, le worker
  // bloque toute mutation pour ces utilisateurs en un point central.
  const refreshViewerRows = () => {
    document.getElementById('dashboard-viewer-list').innerHTML = dashboardAccessRows(dashboardViewerUserIds, 'delete-dashboard-viewer');
    wireViewerDeleteButtons();
  };
  function wireViewerDeleteButtons() {
    document.querySelectorAll('.delete-dashboard-viewer').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!window.confirm('Retirer l\'acces en lecture seule pour cet utilisateur ?')) return;
        try {
          dashboardViewerUserIds = dashboardViewerUserIds.filter((uid) => uid !== btn.dataset.uid);
          await Api.updateConfig(id, { dashboardViewerUserIds });
          refreshViewerRows();
          showToast('Acces retire.');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  }
  document.getElementById('add-dashboard-viewer').addEventListener('click', async () => {
    const uid = document.getElementById('new-dashboard-viewer-id').value.trim();
    if (!/^\d{5,25}$/.test(uid)) { showToast('ID Discord invalide.', 'error'); return; }
    if (dashboardViewerUserIds.includes(uid) || dashboardAllowedUserIds.includes(uid)) { showToast('Deja dans une liste d\'acces.', 'error'); return; }
    try {
      dashboardViewerUserIds = [...dashboardViewerUserIds, uid];
      await Api.updateConfig(id, { dashboardViewerUserIds });
      refreshViewerRows();
      document.getElementById('new-dashboard-viewer-id').value = '';
      showToast('Acces en lecture seule accorde.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  wireViewerDeleteButtons();
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
      <input type="text" class="rr-role-id" placeholder="ID du role" aria-label="ID du role" maxlength="32" value="${escapeHtml(row.roleId || '')}" />
      <input type="text" class="rr-label" placeholder="Libelle affiche" aria-label="Libelle affiche" maxlength="100" value="${escapeHtml(row.label || '')}" />
      <input type="text" class="rr-emoji" placeholder="Emoji" aria-label="Emoji" maxlength="8" value="${escapeHtml(row.emoji || '')}" />
      <button type="button" class="btn danger rr-remove" title="Supprimer" aria-label="Supprimer cette ligne">✕</button>
    </div>`;
}

async function renderGameRolesPage(id, container = app) {
  container.innerHTML = skeletonHtml();
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
      `, { id: 'game-catalog' })}
      ${sectionHtml('Roles de jeu actifs', `
        <p class="muted">Generes automatiquement quand un membre est vu en train de jouer, ou ajoutes depuis le catalogue.</p>
        ${rows || '<p class="muted">Aucun role de jeu pour le moment.</p>'}
        <button class="btn secondary" id="force-roles-refresh" style="margin-top:12px;">🔁 Forcer la mise a jour du salon #roles</button>
      `, { id: 'game-active' })}

      ${sectionHtml('Roles-reaction personnalises', `
        <p class="muted">Groupes de roles au choix (pas limites aux jeux), poses en salon via un menu de selection. Clic droit sur un role dans Discord (mode developpeur) &gt; Copier l'ID.</p>
        <div id="reaction-groups-list">${reactionGroupRows}</div>
        <label style="margin-top:14px;" for="rr-title">Titre du groupe</label>
        <input type="text" id="rr-title" placeholder="Ex: Notifications" maxlength="100" data-charcount />
        <label for="rr-channel">Salon de destination</label>
        <select id="rr-channel">${textChannelOptions}</select>
        <label>Roles proposes</label>
        <div id="reaction-role-rows"></div>
        <button type="button" class="btn secondary" id="rr-add-role" style="margin-top:8px;">+ Ajouter un role</button>
        <button type="button" class="btn" id="rr-create" style="margin-top:12px;">Creer et poster</button>
      `, { id: 'game-reaction' })}
    </div>
  `;

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
  container.innerHTML = skeletonHtml();
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
      `, { id: 'bots' })}

      ${sectionHtml('Arrivee & statut du bot', `
        <label for="auto-role-select">Role attribue automatiquement a l'arrivee (en plus du reglement)</label>
        <select id="auto-role-select">
          <option value="">Aucun</option>
          ${roleOptions(config?.autoRoleId)}
        </select>
        <button class="btn secondary" id="save-auto-role" style="margin-top:8px;">Enregistrer</button>

        <label style="margin-top:18px;" for="bot-statuses">Statuts du bot (un par ligne, tournent automatiquement)</label>
        <textarea id="bot-statuses" placeholder="Regarde ServeurCreator&#10;/setup pour demarrer&#10;{membercount} membres">${escapeHtml((config?.botStatuses || []).join('\n'))}</textarea>
        <p class="muted">Variable disponible : {membercount}</p>
        <button class="btn secondary" id="save-bot-statuses" style="margin-top:8px;">Enregistrer</button>

        <label style="margin-top:18px;" for="birthday-channel-select">Salon des annonces d'anniversaire (/birthday)</label>
        <select id="birthday-channel-select">
          <option value="">Meme salon que bienvenue/depart</option>
          ${textChannelOptions}
        </select>
        <button class="btn secondary" id="save-birthday-channel" style="margin-top:8px;">Enregistrer</button>

        <label style="margin-top:18px;" for="suggestions-channel-select">Salon des suggestions (/suggest)</label>
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
      `, { id: 'arrivee' })}

      ${sectionHtml('Webhooks sortants', `
        <p class="muted">Envoie une requete POST JSON vers une URL externe a chaque evenement choisi (arrivee, depart, action de moderation).</p>
        <div id="webhooks-list">${webhookRows(config?.outgoingWebhooks || [])}</div>
        <div class="row" style="margin-top:10px;">
          <select id="new-webhook-event" aria-label="Evenement declencheur">
            <option value="member_join">Arrivee d'un membre</option>
            <option value="member_leave">Depart d'un membre</option>
            <option value="mod_action">Action de moderation</option>
          </select>
          <input type="text" id="new-webhook-url" placeholder="https://..." aria-label="URL du webhook" style="flex:1; min-width:220px;" />
          <button class="btn secondary" id="add-webhook">Ajouter</button>
        </div>
      `, { id: 'webhooks' })}

      ${sectionHtml('Economie : boutique (/shop, /daily, /pay, /balance)', `
        <p class="muted">Les membres gagnent des pieces via /daily, peuvent en envoyer via /pay, et les depenser ici. Un article peut donner un role automatiquement.</p>
        <div id="shop-items-list">${shopItemRows}</div>
        <div class="row" style="margin-top:10px;">
          <input type="text" id="new-shop-name" placeholder="Nom de l'article" aria-label="Nom de l'article" style="flex:1; min-width:160px;" />
          <input type="number" id="new-shop-price" placeholder="Prix" aria-label="Prix" min="1" style="width:100px;" />
          <select id="new-shop-role" aria-label="Role attribue par l'article">
            <option value="">Aucun role</option>
            ${roleOptions()}
          </select>
          <button class="btn secondary" id="add-shop-item">Ajouter</button>
        </div>
        <h2 style="margin-top:18px; font-size:0.85rem;">Classement richesse</h2>
        <div id="economy-leaderboard">${economyLeaderboardRows}</div>
      `, { id: 'economie' })}

      ${sectionHtml('Auto-moderation', `
        <label class="dp-toggle-row"><span>Auto-moderation active</span><input type="checkbox" id="am-enabled" ${modConfig.autoModEnabled ? 'checked' : ''} /></label>
        <label class="dp-toggle-row" style="margin-top:6px;"><span>Bloquer les liens d'invitation Discord</span><input type="checkbox" id="am-invites" ${modConfig.blockInvites ? 'checked' : ''} /></label>
        <label class="dp-toggle-row" style="margin-top:6px;"><span>Bloquer tous les liens</span><input type="checkbox" id="am-links" ${modConfig.blockLinks ? 'checked' : ''} /></label>
        <label for="am-spam-threshold">Seuil anti-spam (messages)</label>
        <input type="number" id="am-spam-threshold" value="${modConfig.spamMessageThreshold}" min="1" />
        <label for="am-banned-words">Mots bannis (separes par des virgules, prefixe "re:" pour une regex)</label>
        <textarea id="am-banned-words">${escapeHtml((modConfig.bannedWords || []).join(', '))}</textarea>
        <label for="am-link-whitelist">Domaines autorises meme si "Bloquer tous les liens" est actif (separes par des virgules)</label>
        <textarea id="am-link-whitelist" placeholder="youtube.com, twitch.tv">${escapeHtml((modConfig.linkWhitelist || []).join(', '))}</textarea>
        <label class="dp-toggle-row" style="margin-top:6px;"><span>Anti-raid actif</span><input type="checkbox" id="am-antiraid" ${modConfig.antiRaidEnabled ? 'checked' : ''} /></label>
        <label for="am-antiraid-threshold">Seuil anti-raid (arrivees rapprochees)</label>
        <input type="number" id="am-antiraid-threshold" value="${modConfig.antiRaidJoinThreshold}" min="1" />
        <label for="am-auto-timeout">Timeout automatique apres N infractions en 1 h (0 = jamais)</label>
        <input type="number" id="am-auto-timeout" value="${modConfig.autoTimeoutAfterWarns ?? 3}" min="0" />
        <label for="am-auto-timeout-min">Duree du timeout automatique (minutes)</label>
        <input type="number" id="am-auto-timeout-min" value="${modConfig.autoTimeoutMinutes ?? 10}" min="1" />
        <label class="dp-toggle-row" style="margin-top:6px;"><span>Slowmode automatique en cas de pic de messages</span><input type="checkbox" id="am-auto-slowmode" ${modConfig.autoSlowmodeEnabled ? 'checked' : ''} /></label>
        <label for="am-slowmode-threshold">Seuil du slowmode (messages par 10 s dans un salon)</label>
        <input type="number" id="am-slowmode-threshold" value="${modConfig.autoSlowmodeMsgPer10s ?? 20}" min="5" />
        <button class="btn" id="save-modconfig" style="margin-top:12px;">Enregistrer</button>
      `, { id: 'automod' })}

      ${sectionHtml('Roles de niveau (XP)', `
        <div id="level-roles-list">${levelRoleRows}</div>
        <div class="row" style="margin-top:10px;">
          <input type="number" id="new-level" placeholder="Niveau" aria-label="Niveau" min="1" style="width:100px;" />
          <select id="new-level-role" aria-label="Role attribue a ce niveau">${roleOptions()}</select>
          <button class="btn secondary" id="add-level-role">Ajouter</button>
        </div>
      `, { id: 'niveaux' })}

      ${sectionHtml('Parrainage', `
        <div id="referral-roles-list">${referralRoleRows}</div>
        <div class="row" style="margin-top:10px;">
          <input type="number" id="new-referral-count" placeholder="Nb invitations" aria-label="Nombre d'invitations" min="1" style="width:130px;" />
          <select id="new-referral-role" aria-label="Role de parrainage">${roleOptions()}</select>
          <button class="btn secondary" id="add-referral-role">Ajouter</button>
        </div>
        <button class="btn secondary" id="generate-referral-role" style="margin-top:8px;">🎗️ Generer un role Parrain automatiquement</button>
        <h2 style="margin-top:18px; font-size:0.85rem;">Classement</h2>
        <div id="referral-leaderboard">${leaderboardRows}</div>
      `, { id: 'parrainage' })}

      ${sectionHtml('Streamers lies', `
        <div id="streamers-list">${streamerRows}</div>
        <div class="row" style="margin-top:10px;">
          <input type="text" id="new-streamer-user" placeholder="ID Discord" aria-label="ID Discord" style="width:160px;" />
          <select id="new-streamer-platform" aria-label="Plateforme">
            <option value="twitch">Twitch</option>
            <option value="youtube">YouTube</option>
          </select>
          <input type="text" id="new-streamer-identifier" placeholder="Pseudo / chaine" aria-label="Pseudo ou chaine" style="width:160px;" />
          <button class="btn secondary" id="add-streamer">Ajouter</button>
        </div>
      `, { id: 'streamers' })}

      ${sectionHtml('Annonces programmees', `
        <div id="scheduled-list">${scheduledRows}</div>
        <div style="margin-top:10px;">
          <label for="new-scheduled-channel">Salon</label>
          <select id="new-scheduled-channel">${textChannelOptions}</select>
          <label for="new-scheduled-message">Message</label>
          <textarea id="new-scheduled-message"></textarea>
          <label for="new-scheduled-date">Date et heure</label>
          <input type="datetime-local" id="new-scheduled-date" />
          <label class="dp-toggle-row" style="margin-top:10px;">
            <span>Repeter tous les jours a cette heure</span>
            <input type="checkbox" id="new-scheduled-daily" />
          </label>
          <button class="btn secondary" id="add-scheduled" style="margin-top:8px;">Programmer</button>
        </div>
      `, { id: 'annonces' })}

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

        <label class="dp-toggle-row" style="margin-top:10px;">
          <span>Tickets visibles uniquement par le staff actuellement en service</span>
          <input type="checkbox" id="tickets-on-duty-only" ${config?.ticketsStaffOnDutyOnly === false ? '' : 'checked'} />
        </label>
        <p class="muted" style="margin-top:8px;">Enregistrer applique immediatement les permissions choisies (SERVICE STAFF + categories/salons coches). La visibilite se met ensuite a jour automatiquement a chaque bascule de service.</p>
        <button class="btn" id="save-service-config" style="margin-top:8px;">Enregistrer et appliquer</button>
      `, { id: 'service' })}

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
      `, { id: 'tickets' })}
    </div>
  `;

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
        if (!window.confirm('Supprimer ce webhook ?')) return;
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
      if (!window.confirm('Supprimer cet article de la boutique ?')) return;
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
        autoTimeoutAfterWarns: Math.max(0, Number(document.getElementById('am-auto-timeout').value) || 0),
        autoTimeoutMinutes: Math.max(1, Number(document.getElementById('am-auto-timeout-min').value) || 10),
        autoSlowmodeEnabled: document.getElementById('am-auto-slowmode').checked,
        autoSlowmodeMsgPer10s: Math.max(5, Number(document.getElementById('am-slowmode-threshold').value) || 20),
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
      if (!window.confirm('Supprimer ce role de niveau ?')) return;
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
      if (!window.confirm('Supprimer ce role de parrainage ?')) return;
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
      if (!window.confirm('Retirer ce streamer ?')) return;
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
      if (!window.confirm('Supprimer cette annonce programmee ?')) return;
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
  container.innerHTML = skeletonHtml();
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
        <label for="structure-file-input" style="margin-top:14px;">Restaurer depuis un fichier</label>
        <div class="dp-dropzone" id="structure-dropzone" tabindex="0">
          <span class="dp-dropzone-icon">📄</span>
          <span class="dp-dropzone-text" id="structure-dropzone-text">Glisse un fichier .json ici, ou clique pour parcourir</span>
          <input type="file" id="structure-file-input" accept="application/json" class="dp-dropzone-input" />
        </div>
        <button class="btn secondary" id="restore-structure" style="margin-top:10px;" disabled>Restaurer depuis ce fichier</button>
      `, { id: 'sec-export' })}

      ${sectionHtml('Snapshots automatiques', `
        <p class="muted">Un snapshot de la structure est pris automatiquement chaque jour (5 derniers conserves).</p>
        <button class="btn secondary" id="snapshot-now" style="margin-bottom:10px;">Creer un snapshot maintenant</button>
        <div id="snapshots-list">${snapshotRows}</div>
      `, { id: 'sec-snapshots' })}

      ${sectionHtml('Lockdown', `
        <p class="muted">Verrouille immediatement le serveur (verification maximale : email verifie + compte Discord de plus de 10 minutes requis pour interagir). Utile en cas de raid en cours.</p>
        <div class="row">
          <button class="btn danger" id="lockdown-btn">Verrouiller le serveur</button>
          <button class="btn secondary" id="unlock-btn">Deverrouiller</button>
        </div>
      `, { id: 'sec-lockdown' })}
    </div>
  `;

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

  const structureDropzone = document.getElementById('structure-dropzone');
  const structureFileInput = document.getElementById('structure-file-input');
  const structureDropzoneText = document.getElementById('structure-dropzone-text');
  const restoreBtn = document.getElementById('restore-structure');

  function setStructureFile(file) {
    if (!file) return;
    if (!file.name.endsWith('.json')) { showToast('Choisis un fichier .json.', 'error'); return; }
    const dt = new DataTransfer();
    dt.items.add(file);
    structureFileInput.files = dt.files;
    structureDropzoneText.textContent = `📄 ${file.name}`;
    structureDropzone.classList.add('has-file');
    restoreBtn.disabled = false;
  }

  structureDropzone.addEventListener('click', () => structureFileInput.click());
  structureDropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); structureFileInput.click(); }
  });
  structureFileInput.addEventListener('change', () => setStructureFile(structureFileInput.files[0]));
  structureDropzone.addEventListener('dragover', (e) => { e.preventDefault(); structureDropzone.classList.add('drag-over'); });
  structureDropzone.addEventListener('dragleave', () => structureDropzone.classList.remove('drag-over'));
  structureDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    structureDropzone.classList.remove('drag-over');
    setStructureFile(e.dataTransfer.files[0]);
  });

  restoreBtn.addEventListener('click', async () => {
    const file = structureFileInput.files[0];
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
    // Confirmation par saisie du nom (roadmap n°061) : action massive qui
    // affecte tout le serveur, un simple OK ne suffit pas.
    const guildName = allGuilds.find((g) => g.guildId === id)?.name || '';
    const typed = window.prompt(`Verrouiller tout le serveur ?\nTape le nom exact du serveur pour confirmer :\n${guildName}`);
    if (typed === null) return;
    if (typed.trim() !== guildName) { showToast('Nom incorrect, verrouillage annule.', 'error'); return; }
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
  container.innerHTML = skeletonHtml();
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

  // Filtres combinables (roadmap n°029) : texte + type d'action + periode.
  const actionTitles = [...new Set(logs.map((l) => l.title))].sort((a, b) => a.localeCompare(b, 'fr'));
  container.innerHTML = `
    <div class="inner">
      ${sectionHtml("Logs d'audit", `
        <p class="muted">Historique des actions de moderation et de configuration (200 dernieres).</p>
        <div class="row" style="gap:8px; flex-wrap:wrap; margin-bottom:10px;">
          <input type="text" id="audit-search" placeholder="Rechercher (titre, auteur, action...)" aria-label="Rechercher dans les logs d'audit" style="flex:2; min-width:180px; margin:0;" />
          <select id="audit-action" aria-label="Filtrer par type d'action" style="flex:1; min-width:150px;">
            <option value="">Toutes les actions</option>
            ${actionTitles.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
          </select>
          <select id="audit-period" aria-label="Filtrer par periode" style="flex:none; width:150px;">
            <option value="0">Toute la periode</option>
            <option value="86400000">Dernieres 24 h</option>
            <option value="604800000">7 derniers jours</option>
            <option value="2592000000">30 derniers jours</option>
          </select>
        </div>
        <div class="audit-log-list" id="audit-log-list">${logs.map(rowHtml).join('') || '<p class="muted">Aucune action enregistree pour le moment.</p>'}</div>
      `, { alwaysOpen: true })}
    </div>
  `;

  const applyAuditFilters = () => {
    const q = document.getElementById('audit-search').value.trim().toLowerCase();
    const action = document.getElementById('audit-action').value;
    const periodMs = Number(document.getElementById('audit-period').value);
    const cutoff = periodMs ? Date.now() - periodMs : 0;
    const filtered = logs.filter((l) => (!q || `${l.title} ${l.description}`.toLowerCase().includes(q))
      && (!action || l.title === action)
      && (!cutoff || l.timestamp >= cutoff));
    document.getElementById('audit-log-list').innerHTML = filtered.map(rowHtml).join('') || '<p class="muted">Aucun resultat.</p>';
  };
  document.getElementById('audit-search').addEventListener('input', applyAuditFilters);
  document.getElementById('audit-action').addEventListener('change', applyAuditFilters);
  document.getElementById('audit-period').addEventListener('change', applyAuditFilters);
}

/* ---------- Page: recherche de membres ---------- */
// 100% frontend : reutilise Api.members()/Api.roles() deja exposes, ne
// necessite aucun nouvel endpoint backend. Recherche/tri cote client
// uniquement (jusqu'a quelques milliers de membres, largement suffisant
// pour un salon Discord classique).

async function renderMemberLookupPage(id, container = app) {
  container.innerHTML = skeletonHtml();
  const [members, roles] = await Promise.all([
    Api.members(id).catch(() => []), Api.roles(id).catch(() => []),
  ]);
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const sorted = [...members].sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
  // Bots masques par defaut (demande utilisateur) : flag bot renvoye par le
  // worker, avec repli sur le role nomme "Bot" pour les donnees en cache.
  const isBot = (m) => m.bot || (m.roles || []).some((rid) => roleById.get(rid)?.name === 'Bot');
  const botCount = sorted.filter(isBot).length;
  let showBots = false;

  const rowHtml = (m, q) => {
    const roleChips = (m.roles || [])
      .map((rid) => roleById.get(rid))
      .filter((r) => r && r.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map((r) => `<span class="member-lookup-chip" style="--rc:${r.color ? `#${r.color.toString(16).padStart(6, '0')}` : 'var(--text-faint)'}">${escapeHtml(r.name)}</span>`)
      .join('') || '<span class="muted">Aucun role</span>';
    return `
      <div class="member-lookup-row">
        <img class="member-lookup-avatar" src="${memberAvatarUrl(m)}" alt="" width="36" height="36" />
        <div class="member-lookup-info">
          <div class="member-lookup-name">${highlightMatch(m.displayName || m.userId, q)}</div>
          <div class="member-lookup-id">
            ${highlightMatch(m.userId, q)}
            <button type="button" class="dp-copy-id-btn" data-copy-id="${m.userId}" title="Copier l'ID" aria-label="Copier l'ID de ${escapeHtml(m.displayName || m.userId)}">📋</button>
          </div>
        </div>
        <div class="member-lookup-roles">${roleChips}</div>
        <div class="member-lookup-actions">
          <button type="button" class="member-warns-btn" data-warns-user="${m.userId}" title="Voir le casier de sanctions" aria-label="Casier de ${escapeHtml(m.displayName || m.userId)}">📖</button>
          <button type="button" class="member-timeout-btn" data-timeout-user="${m.userId}" data-timeout-name="${escapeHtml(m.displayName || m.userId)}" title="Reduire au silence temporairement" aria-label="Timeout de ${escapeHtml(m.displayName || m.userId)}">🔇</button>
        </div>
      </div>`;
  };

  container.innerHTML = `
    <div class="inner">
      ${sectionHtml('Recherche de membres', `
        <p class="muted">${members.length - botCount} membre(s)${botCount ? ` + ${botCount} bot(s) masques` : ''}. Recherche par pseudo ou par ID.</p>
        <div class="row" style="gap:8px; flex-wrap:wrap; margin-bottom:10px; align-items:center;">
          <input type="text" id="member-search" placeholder="Rechercher un membre..." aria-label="Rechercher un membre" style="flex:1; min-width:180px; margin:0;" />
          ${botCount ? `<label class="dp-toggle-row" style="margin:0; padding:8px 12px; flex:none;"><span style="font-size:0.82rem;">Afficher les bots (${botCount})</span><input type="checkbox" id="member-show-bots" /></label>` : ''}
        </div>
        <div class="member-lookup-list" id="member-lookup-list"></div>
      `, { alwaysOpen: true })}
    </div>
  `;

  const repaintMembers = () => {
    const q = document.getElementById('member-search').value.trim();
    const ql = q.toLowerCase();
    const base = showBots ? sorted : sorted.filter((m) => !isBot(m));
    const filtered = ql
      ? base.filter((m) => (m.displayName || '').toLowerCase().includes(ql) || m.userId.includes(ql))
      : base;
    document.getElementById('member-lookup-list').innerHTML = filtered.map((m) => rowHtml(m, q)).join('')
      || '<p class="muted">Aucun resultat.</p>';
  };
  repaintMembers();
  document.getElementById('member-search').addEventListener('input', repaintMembers);
  document.getElementById('member-show-bots')?.addEventListener('change', (e) => {
    showBots = e.target.checked;
    repaintMembers();
  });

  // Timeout depuis le dashboard (roadmap n°075) : delegation sur la liste
  // (les lignes sont re-rendues a chaque frappe de recherche).
  container.querySelector('#member-lookup-list').closest('.section-panel, .inner')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.member-timeout-btn');
    if (btn) {
      const answer = window.prompt(
        `Timeout de ${btn.dataset.timeoutName} — duree en minutes ?\n(10 = 10 min, 60 = 1 h, 1440 = 24 h, 0 = lever le timeout)`,
        '10',
      );
      if (answer === null) return;
      const minutes = Number(answer);
      if (!Number.isFinite(minutes) || minutes < 0) { showToast('Duree invalide.', 'error'); return; }
      try {
        await Api.timeoutMember(id, btn.dataset.timeoutUser, minutes);
        showToast(minutes === 0 ? 'Timeout leve.' : `${btn.dataset.timeoutName} reduit au silence ${minutes} min.`);
      } catch (err) {
        showToast(err.message, 'error');
      }
      return;
    }

    // Casier de sanctions (roadmap n°072) : liste des warns automod/manuels.
    const warnsBtn = e.target.closest('.member-warns-btn');
    if (!warnsBtn) return;
    const row = warnsBtn.closest('.member-lookup-row');
    const existing = row.nextElementSibling;
    if (existing?.classList.contains('member-warns-detail')) { existing.remove(); return; }
    container.querySelectorAll('.member-warns-detail').forEach((el) => el.remove());
    const warns = await Api.memberWarns(id, warnsBtn.dataset.warnsUser).catch(() => []);
    const rows = warns.slice().reverse().map((w) => `
      <div class="member-warn-row">
        <span>${escapeHtml(w.reason || 'Sans raison')}</span>
        <span class="muted">${w.source === 'automod' ? '🤖 automod' : '👮 manuel'} — ${new Date(w.createdAt).toLocaleString('fr-FR')}</span>
      </div>`).join('');
    row.insertAdjacentHTML('afterend', `<div class="member-warns-detail">${rows || '<p class="muted" style="margin:0;">Aucune sanction enregistree.</p>'}</div>`);
  });
}

/* ---------- Page: createur de salons & roles (demande utilisateur) ---------- */
// Salons relies aux fonctionnalites du bot : crees avec les bonnes
// permissions ET auto-configures (le champ de config correspondant pointe
// dessus). Roles : creation rapide + attribution aux membres auto-listes
// via un petit bouton +.

const FEATURE_CHANNEL_CARDS = [
  { key: 'giveaways', icon: '🎉', label: 'Giveaways', desc: 'Salon en lecture seule, propose par defaut au lancement des giveaways.', configKey: 'giveawayChannelId' },
  { key: 'annonces', icon: '📣', label: 'Annonces', desc: 'Salon en lecture seule pour les annonces officielles.', configKey: 'announceChannelId' },
  { key: 'suggestions', icon: '💡', label: 'Suggestions', desc: 'Les membres proposent leurs idees, votes du bot dessus.', configKey: 'suggestionChannelId' },
  { key: 'modlog', icon: '📋', label: 'Journal de moderation', desc: 'Visible du staff uniquement, le bot y ecrit chaque action automod.', configKey: 'modLogChannelId' },
  { key: 'bienvenue', icon: '👋', label: 'Bienvenue', desc: 'Arrivees et departs annonces par le bot, lecture seule.', configKey: 'arrivalDepartureChannelId' },
  { key: 'support', icon: '🎫', label: 'Support / tickets', desc: 'Salon du panneau de tickets, lecture seule.', configKey: 'ticketPanelChannelId' },
];

async function renderCreatorPage(id, container = app) {
  container.innerHTML = skeletonHtml();
  const [config, channels, roles, members] = await Promise.all([
    Api.config(id).catch(() => ({})),
    Api.channels(id).catch(() => []),
    Api.roles(id).catch(() => []),
    Api.members(id).catch(() => []),
  ]);
  const channelById = new Map(channels.map((c) => [c.id, c]));
  const assignableRoles = roles
    .filter((r) => r.name !== '@everyone')
    .sort((a, b) => b.position - a.position);

  const featureCardHtml = (f) => {
    const configured = config?.[f.configKey] && channelById.has(config[f.configKey]);
    return `
      <div class="creator-card">
        <div class="creator-card-head"><span class="icon">${f.icon}</span><strong>${f.label}</strong></div>
        <p class="muted creator-card-desc">${f.desc}</p>
        ${configured
    ? `<p class="creator-card-state">✓ Configure sur <strong>#${escapeHtml(channelById.get(config[f.configKey]).name)}</strong></p>
           <button type="button" class="btn secondary creator-channel-btn" data-feature="${f.key}">Recreer quand meme</button>`
    : `<button type="button" class="btn creator-channel-btn" data-feature="${f.key}">➕ Creer et configurer</button>`}
      </div>`;
  };

  container.innerHTML = `
    <div class="inner">
      ${sectionHtml('Salons fonctionnels', `
        <p class="muted">Chaque salon est cree avec les bonnes permissions et branche automatiquement sur la fonctionnalite du bot.</p>
        <div class="creator-grid">${FEATURE_CHANNEL_CARDS.map(featureCardHtml).join('')}</div>
      `, { alwaysOpen: true })}

      ${sectionHtml('Roles', `
        <p class="muted">Cree un role rapidement, puis attribue-le : choisis le role, les membres sont detectes automatiquement, un petit + suffit.</p>
        <div class="row" style="gap:8px; flex-wrap:wrap; margin-bottom:14px;">
          <input type="text" id="creator-role-name" placeholder="Nom du nouveau role" aria-label="Nom du nouveau role" maxlength="100" style="flex:2; min-width:160px; margin:0;" />
          <input type="color" id="creator-role-color" value="#5865f2" aria-label="Couleur du role" style="flex:none;" class="dp-role-color-input" />
          <button type="button" class="btn secondary" id="creator-role-create">➕ Creer le role</button>
        </div>
        <label for="creator-assign-role">Role a attribuer</label>
        <select id="creator-assign-role">${assignableRoles.map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}</select>
        <input type="text" id="creator-member-search" placeholder="Filtrer les membres..." aria-label="Filtrer les membres" style="margin-top:10px;" />
        <div class="creator-member-list" id="creator-member-list"></div>
      `, { alwaysOpen: true })}
    </div>
  `;

  container.querySelectorAll('.creator-channel-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const { name } = await Api.createFeatureChannel(id, btn.dataset.feature);
        showToast(`Salon ${name} cree et configure.`);
        await renderCreatorPage(id, container);
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    });
  });

  container.querySelector('#creator-role-create').addEventListener('click', async () => {
    const name = container.querySelector('#creator-role-name').value.trim();
    if (!name) { showToast('Nom du role requis.', 'error'); return; }
    try {
      await Api.createRole(id, name, container.querySelector('#creator-role-color').value);
      showToast(`Role "${name}" cree.`);
      await renderCreatorPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Attribution : membres auto-detectes, + / − selon qu'ils ont deja le role.
  const humans = members
    .filter((m) => !m.bot)
    .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
  const memberRoleSets = new Map(humans.map((m) => [m.userId, new Set(m.roles || [])]));

  const repaintAssignList = () => {
    const roleId = container.querySelector('#creator-assign-role').value;
    const q = container.querySelector('#creator-member-search').value.trim().toLowerCase();
    const filtered = q ? humans.filter((m) => (m.displayName || '').toLowerCase().includes(q)) : humans;
    container.querySelector('#creator-member-list').innerHTML = filtered.slice(0, 100).map((m) => {
      const has = memberRoleSets.get(m.userId)?.has(roleId);
      return `
        <div class="creator-member-row">
          <img class="member-lookup-avatar" src="${memberAvatarUrl(m)}" alt="" width="28" height="28" />
          <span class="creator-member-name">${escapeHtml(m.displayName || m.userId)}</span>
          <button type="button" class="creator-assign-btn${has ? ' has-role' : ''}" data-user="${m.userId}"
            title="${has ? 'Retirer le role' : 'Attribuer le role'}"
            aria-label="${has ? 'Retirer le role a' : 'Attribuer le role a'} ${escapeHtml(m.displayName || m.userId)}">${has ? '✓' : '+'}</button>
        </div>`;
    }).join('') || '<p class="muted">Aucun membre trouve.</p>';

    container.querySelectorAll('.creator-assign-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const userId = btn.dataset.user;
        const set = memberRoleSets.get(userId);
        const hasRole = set.has(roleId);
        btn.disabled = true;
        try {
          if (hasRole) {
            await Api.removeMemberRole(id, userId, roleId);
            set.delete(roleId);
          } else {
            await Api.addMemberRole(id, userId, roleId);
            set.add(roleId);
          }
          repaintAssignList();
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
        }
      });
    });
  };
  repaintAssignList();
  container.querySelector('#creator-assign-role').addEventListener('change', repaintAssignList);
  container.querySelector('#creator-member-search').addEventListener('input', repaintAssignList);
}

/* ---------- Page: giveaways (roadmap n°089) ---------- */
// Le worker cree l'entree KV + poste le message avec le bouton Participer ;
// le bot gere ensuite participations, cloture, tirage et annonce.

async function renderGiveawaysPage(id, container = app) {
  container.innerHTML = skeletonHtml();
  const [giveaways, channels, roles, gwConfig] = await Promise.all([
    Api.giveaways(id).catch(() => []),
    Api.channels(id).catch(() => []),
    Api.roles(id).catch(() => []),
    Api.config(id).catch(() => ({})),
  ]);
  const textChannels = channels.filter((c) => c.type === 0);
  const roleName = (rid) => roles.find((r) => r.id === rid)?.name || rid;

  const rowHtml = (g) => {
    const status = g.closed
      ? (g.winners?.length ? `🏆 ${g.winners.length} gagnant(s)` : '⚪ Termine sans participant')
      : `🟢 En cours — fin ${new Date(g.endsAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
    return `
      <div class="giveaway-row${g.closed ? ' closed' : ''}">
        <div class="giveaway-info">
          <div class="giveaway-prize">🎉 ${escapeHtml(g.prize)}</div>
          <div class="muted" style="font-size:0.78rem;">
            ${status} · ${g.entrants?.length || 0} participant(s) · ${g.winnersCount} gagnant(s) prevus
            ${g.requiredRoleId ? ` · role requis : ${escapeHtml(roleName(g.requiredRoleId))}` : ''}
          </div>
        </div>
        ${!g.closed ? `<button type="button" class="btn danger giveaway-end-btn" data-giveaway-id="${g.id}" data-giveaway-prize="${escapeHtml(g.prize)}">Terminer</button>` : ''}
      </div>`;
  };

  const sorted = [...giveaways].sort((a, b) => Number(a.closed) - Number(b.closed) || b.endsAt - a.endsAt);
  container.innerHTML = `
    <div class="inner">
      ${sectionHtml('Nouveau giveaway', `
        <div class="dp-form-grid">
          <div>
            <label for="gw-prize">Lot a gagner</label>
            <input type="text" id="gw-prize" maxlength="200" placeholder="Ex : 1 mois de Nitro" data-charcount />
          </div>
          <div>
            <label for="gw-channel">Salon</label>
            <select id="gw-channel">${textChannels.map((c) => `<option value="${c.id}"${c.id === gwConfig?.giveawayChannelId ? ' selected' : ''}>#${escapeHtml(c.name)}</option>`).join('')}</select>
          </div>
          <div>
            <label for="gw-winners">Nombre de gagnants</label>
            <input type="number" id="gw-winners" value="1" min="1" max="20" />
          </div>
          <div>
            <label for="gw-duration">Duree</label>
            <select id="gw-duration">
              <option value="60">1 heure</option>
              <option value="360">6 heures</option>
              <option value="720">12 heures</option>
              <option value="1440" selected>24 heures</option>
              <option value="4320">3 jours</option>
              <option value="10080">7 jours</option>
            </select>
          </div>
          <div class="dp-form-full">
            <label for="gw-role">Role requis pour participer (optionnel)</label>
            <select id="gw-role">
              <option value="">Aucun — ouvert a tous</option>
              ${roles.filter((r) => r.name !== '@everyone').sort((a, b) => b.position - a.position).map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}
            </select>
          </div>
          <button class="btn dp-form-full" id="gw-create-btn" style="margin-top:10px;">🎉 Lancer le giveaway</button>
        </div>
      `, { alwaysOpen: true })}

      ${sectionHtml('Giveaways', `
        <div id="giveaways-list">${sorted.map(rowHtml).join('') || '<p class="muted">Aucun giveaway pour le moment.</p>'}</div>
      `, { alwaysOpen: true })}
    </div>
  `;

  container.querySelector('#gw-create-btn').addEventListener('click', async () => {
    const prize = container.querySelector('#gw-prize').value.trim();
    if (!prize) { showToast('Indique le lot a gagner.', 'error'); return; }
    const btn = container.querySelector('#gw-create-btn');
    btn.disabled = true;
    try {
      await Api.createGiveaway(id, {
        prize,
        channelId: container.querySelector('#gw-channel').value,
        winnersCount: Number(container.querySelector('#gw-winners').value) || 1,
        durationMinutes: Number(container.querySelector('#gw-duration').value) || 1440,
        requiredRoleId: container.querySelector('#gw-role').value || undefined,
      });
      showToast('Giveaway lance dans Discord !');
      await renderGiveawaysPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
    }
  });

  container.querySelectorAll('.giveaway-end-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm(`Terminer "${btn.dataset.giveawayPrize}" maintenant ? Le tirage aura lieu sous 30 secondes.`)) return;
      try {
        await Api.endGiveaway(id, btn.dataset.giveawayId);
        showToast('Giveaway termine : tirage imminent.');
        await renderGiveawaysPage(id, container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

/* ---------- Pages: statistiques ---------- */

function lineChartSvg(points, { width = 560, height = 140, color = 'var(--accent)', gradId = `lc${Math.random().toString(36).slice(2, 8)}` } = {}) {
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
  const [lastX, lastY] = coords[coords.length - 1];
  const areaPath = `${path} L${lastX.toFixed(1)},${height} L${coords[0][0].toFixed(1)},${height} Z`;
  const dots = coords.slice(0, -1).map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="${color}" opacity="0.5" />`).join('');
  return `
    <svg viewBox="0 0 ${width} ${height}" class="stats-chart" preserveAspectRatio="none">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.28" />
          <stop offset="100%" stop-color="${color}" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#${gradId})" stroke="none" />
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      ${dots}
      <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="4" fill="${color}" stroke="var(--bg-elevated)" stroke-width="2" />
    </svg>`;
}

async function renderStatsPage(id, container = app) {
  container.innerHTML = skeletonHtml();
  const stats = await Api.stats(id);

  const memberPoints = stats.map((s) => s.memberCount);
  const messagePoints = stats.map((s) => s.messageCount);
  const lastDate = stats.length ? stats[stats.length - 1].date : null;
  const firstDate = stats.length ? stats[0].date : null;

  container.innerHTML = `
    <div class="inner">
      ${sectionHtml('Membres', `
        <p class="muted">Evolution du nombre de membres (${stats.length} jour(s) enregistre(s)${firstDate ? `, depuis le ${firstDate}` : ''}).</p>
        ${lineChartSvg(memberPoints, { color: 'var(--accent)' })}
        ${lastDate ? `<p class="muted" style="margin-top:8px;">Dernier releve : ${lastDate} — ${memberPoints[memberPoints.length - 1]} membre(s)</p>` : ''}
      `, { id: 'stats-members' })}
      ${sectionHtml('Activite (messages/jour)', `
        <p class="muted">Nombre de messages envoyes par jour (hors bots).</p>
        ${lineChartSvg(messagePoints, { color: 'var(--success)' })}
      `, { id: 'stats-activity' })}
    </div>
  `;
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
    <div class="embed-field-row" draggable="true">
      <button type="button" class="embed-field-handle" aria-label="Reordonner ce champ (fleches haut/bas)">⠿</button>
      <input type="text" class="embed-field-name" placeholder="Nom du champ" aria-label="Nom du champ" maxlength="256" value="${escapeHtml(field.name || '')}" />
      <textarea class="embed-field-value" placeholder="Valeur du champ" aria-label="Valeur du champ" maxlength="1024" data-md-link>${escapeHtml(field.value || '')}</textarea>
      <label class="embed-field-inline"><input type="checkbox" class="embed-field-inline-input" ${field.inline ? 'checked' : ''} /> Cote a cote</label>
      <button type="button" class="btn danger embed-field-remove" title="Supprimer ce champ" aria-label="Supprimer ce champ">✕</button>
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
      ${embed.author.icon_url ? `<img src="${escapeHtml(embed.author.icon_url)}" alt="" onerror="this.remove()" />` : ''}
      <span>${embed.author.url ? `<a href="${escapeHtml(embed.author.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(embed.author.name)}</a>` : escapeHtml(embed.author.name)}</span>
    </div>` : '';
  const titleHtml = embed.title ? `
    <div class="embed-preview-title">${embed.url ? `<a href="${escapeHtml(embed.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(embed.title)}</a>` : escapeHtml(embed.title)}</div>` : '';
  const descHtml = embed.description ? `<div class="embed-preview-desc">${renderMarkdownLite(embed.description)}</div>` : '';
  const fieldsHtml = (embed.fields || []).length ? `
    <div class="embed-preview-fields">
      ${embed.fields.map((f) => `
        <div class="embed-preview-field${f.inline ? ' inline' : ''}">
          <div class="embed-preview-field-name">${escapeHtml(f.name)}</div>
          <div class="embed-preview-field-value">${renderMarkdownLite(f.value)}</div>
        </div>`).join('')}
    </div>` : '';
  const imageHtml = embed.image?.url ? `<div class="embed-preview-image"><img src="${escapeHtml(embed.image.url)}" alt="" onerror="this.parentElement.remove()" /></div>` : '';
  const thumbHtml = embed.thumbnail?.url ? `<div class="embed-preview-thumb"><img src="${escapeHtml(embed.thumbnail.url)}" alt="" onerror="this.parentElement.remove()" /></div>` : '';
  const footerBits = [];
  if (embed.footer?.text) footerBits.push(escapeHtml(embed.footer.text));
  if (embed.timestamp) footerBits.push(new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
  const footerHtml = footerBits.length ? `
    <div class="embed-preview-footer">
      ${embed.footer?.icon_url ? `<img src="${escapeHtml(embed.footer.icon_url)}" alt="" onerror="this.remove()" />` : ''}
      <span>${footerBits.join(' • ')}</span>
    </div>` : '';

  const isEmpty = !authorHtml && !titleHtml && !descHtml && !fieldsHtml && !imageHtml && !thumbHtml && !footerHtml;
  if (isEmpty) return '';

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
      </div>
    </div>`;
}

// Habillage "vrai message Discord" autour du/des embed(s) : avatar + nom du
// bot + badge BOT + heure, puis le texte simple, puis les embeds - au lieu
// de montrer les cartes d'embed nues sans contexte.
function messagePreviewHtml(content, embeds) {
  const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const embedsHtml = embeds.map(embedPreviewHtml).join('');
  const contentHtml = content ? `<div class="embed-preview-content">${renderMarkdownLite(content)}</div>` : '';
  if (!contentHtml && !embedsHtml) {
    return `
      <div class="embed-preview-msg">
        <div class="embed-preview-avatar">${botAvatarHtml()}</div>
        <div class="embed-preview-body">
          <div class="embed-preview-msg-header"><strong>ServeurCreator Bot</strong><span class="embed-preview-bot-tag">BOT</span><span class="embed-preview-time">${now}</span></div>
          <p class="muted" style="margin:0;">Remplis le formulaire pour voir l'apercu.</p>
        </div>
      </div>`;
  }
  return `
    <div class="embed-preview-msg">
      <div class="embed-preview-avatar">${botAvatarHtml()}</div>
      <div class="embed-preview-body">
        <div class="embed-preview-msg-header"><strong>ServeurCreator Bot</strong><span class="embed-preview-bot-tag">BOT</span><span class="embed-preview-time">${now}</span></div>
        ${contentHtml}
        ${embedsHtml}
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

// Total de caracteres comptes par Discord dans la limite globale de 6000
// par message : titre, description, nom d'auteur, texte de pied de page et
// nom/valeur de chaque champ, cumules sur tous les embeds.
function embedCharCount(e) {
  let n = (e.title || '').length + (e.description || '').length;
  n += (e.author?.name || '').length + (e.footer?.text || '').length;
  (e.fields || []).forEach((f) => { n += (f.name || '').length + (f.value || '').length; });
  return n;
}

// Modeles d'embed prets a l'emploi (n°002) : bases de depart courantes,
// pre-remplies avec les variables dynamiques quand c'est pertinent.
const EMBED_PRESETS = [
  { key: 'annonce', label: '📣 Annonce', embed: { title: '📣 Annonce', description: '**Quoi :** ...\n**Quand :** {date}\n**Ou :** ...', color: 0x5865f2, footer: { text: '{server}' } } },
  { key: 'reglement', label: '📜 Reglement', embed: { title: '📜 Reglement du serveur', description: '**1.** Respect entre membres, zero harcelement.\n**2.** Pas de spam ni de publicite.\n**3.** Contenu choquant interdit.\n**4.** Les decisions du staff s\'appliquent.', color: 0xef5c5c, footer: { text: 'En restant sur {server}, tu acceptes ces regles.' } } },
  { key: 'bienvenue', label: '👋 Bienvenue', embed: { title: '👋 Bienvenue sur {server} !', description: 'Nous sommes deja **{memberCount} membres**.\n- Lis le reglement\n- Recupere tes roles\n- Presente-toi quand tu veux !', color: 0x57f287 } },
  { key: 'giveaway', label: '🎉 Giveaway', embed: { title: '🎉 GIVEAWAY', description: '**Lot :** ...\n**Fin :** ...\n**Pour participer :** reagis avec 🎉', color: 0xfee75c, footer: { text: 'Bonne chance a tous !' } } },
  { key: 'patchnote', label: '🛠️ Patch note', embed: { title: '🛠️ Mise a jour du {date}', description: '**Nouveau**\n- ...\n\n**Corrige**\n- ...', color: 0x5865f2 } },
];

// Variables dynamiques (n°004) : resolues dans l'apercu ET au moment de
// poster/programmer (cote client, avec les valeurs du serveur courant).
let embedVarContext = null;
function resolveEmbedVars(text) {
  if (typeof text !== 'string' || !text) return text;
  let out = text.replaceAll('{date}', new Date().toLocaleDateString('fr-FR'));
  if (embedVarContext?.server) out = out.replaceAll('{server}', embedVarContext.server);
  if (embedVarContext?.memberCount != null) out = out.replaceAll('{memberCount}', String(embedVarContext.memberCount));
  return out;
}

function substituteEmbedVars(embed) {
  const out = { ...embed };
  out.title = resolveEmbedVars(embed.title);
  out.description = resolveEmbedVars(embed.description);
  if (embed.author) out.author = { ...embed.author, name: resolveEmbedVars(embed.author.name) };
  if (embed.footer) out.footer = { ...embed.footer, text: resolveEmbedVars(embed.footer.text) };
  if (embed.fields) out.fields = embed.fields.map((f) => ({ ...f, name: resolveEmbedVars(f.name), value: resolveEmbedVars(f.value) }));
  return out;
}

function updateEmbedPreview(root) {
  const { embed, content } = buildEmbedFromForm(root);
  const state = root.__mb;
  if (state) state.embeds[state.active] = embed;
  const embeds = state ? state.embeds : [embed];
  root.querySelector('#embed-preview-slot').innerHTML = messagePreviewHtml(resolveEmbedVars(content), embeds.map(substituteEmbedVars));

  // Brouillon auto (n°007) : sauvegarde debouncee du travail en cours.
  if (root.__draftKey) {
    clearTimeout(root.__draftTimer);
    root.__draftTimer = setTimeout(() => {
      const hasContent = content || embeds.some((e) => embedCharCount(e) > 0 || e.image || e.thumbnail);
      if (!hasContent) return;
      try {
        localStorage.setItem(root.__draftKey, JSON.stringify({ embeds, content, at: Date.now() }));
      } catch { /* stockage plein : tant pis pour le brouillon */ }
    }, 800);
  }

  const total = embeds.reduce((n, e) => n + embedCharCount(e), 0);
  const counter = root.querySelector('#embed-char-total');
  if (counter) {
    counter.textContent = total > 6000
      ? `${total} / 6000 caracteres — limite Discord depassee`
      : `${total} / 6000 caracteres`;
    counter.classList.toggle('over', total > 6000);
  }
  const postBtn = root.querySelector('#embed-post-btn');
  if (postBtn) {
    const empty = !content && total === 0 && embeds.every((e) => !e.image && !e.thumbnail);
    postBtn.disabled = empty || total > 6000;
    postBtn.title = total > 6000 ? 'Limite de 6000 caracteres depassee' : (empty ? 'Rien a poster : le message est vide' : '');
  }
}

function renderEmbedTabs(root) {
  const state = root.__mb;
  const tabsHtml = state.embeds.map((_, i) => `
    <span class="embed-tab-group">
      <button type="button" class="btn ${i === state.active ? '' : 'secondary'} embed-tab-btn" data-index="${i}" style="padding:6px 12px;">Embed ${i + 1}</button>
      ${state.embeds.length > 1 ? `<button type="button" class="btn secondary embed-tab-remove" data-index="${i}" aria-label="Supprimer Embed ${i + 1}" title="Supprimer cet embed" style="padding:6px 8px;">✕</button>` : ''}
    </span>
  `).join('');
  const addBtn = state.embeds.length < 10 ? '<button type="button" class="btn secondary" id="embed-tab-add" style="padding:6px 12px;">+ Embed</button>' : '';
  const dupBtn = state.embeds.length < 10 ? '<button type="button" class="btn secondary" id="embed-tab-duplicate" style="padding:6px 10px;" title="Dupliquer l\'embed affiche" aria-label="Dupliquer l\'embed affiche">⧉ Dupliquer</button>' : '';
  root.querySelector('#embed-tabs').innerHTML = tabsHtml + addBtn + dupBtn;

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
  const dupTabBtn = root.querySelector('#embed-tab-duplicate');
  if (dupTabBtn) dupTabBtn.addEventListener('click', () => duplicateEmbedTab(root));
}

// Duplique l'embed actif (n°008) et bascule dessus.
function duplicateEmbedTab(root) {
  const state = root.__mb;
  if (state.embeds.length >= 10) return;
  state.embeds[state.active] = buildEmbedFromForm(root).embed;
  state.embeds.splice(state.active + 1, 0, JSON.parse(JSON.stringify(state.embeds[state.active])));
  state.active += 1;
  populateEmbedForm(root, state.embeds[state.active], root.querySelector('#embed-content').value);
  renderEmbedTabs(root);
  showToast('Embed duplique.');
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
  // Reordonnancement des champs (l'ordre du DOM fait foi, buildEmbedFromForm
  // lit .embed-field-row dans l'ordre d'affichage) : drag&drop souris + une
  // alternative clavier sur la poignee, meme logique que les roles/salons.
  root.querySelectorAll('.embed-field-row').forEach((row) => {
    row.ondragstart = (e) => {
      row.classList.add('dragging');
      e.dataTransfer.setData('text/plain', '');
      e.dataTransfer.effectAllowed = 'move';
    };
    row.ondragover = (e) => {
      e.preventDefault();
      const list = row.parentElement;
      const dragging = list.querySelector('.embed-field-row.dragging');
      if (!dragging || dragging === row) return;
      const rect = row.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      const target = before ? row : row.nextSibling;
      if (dragging.nextSibling === target) return;
      animateReorder(list, '.embed-field-row', () => list.insertBefore(dragging, target));
    };
    row.ondragend = () => { row.classList.remove('dragging'); updateEmbedPreview(root); };
  });
  root.querySelectorAll('.embed-field-handle').forEach((handle) => {
    handle.onclick = (e) => e.stopPropagation();
    handle.onkeydown = (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const row = handle.closest('.embed-field-row');
      const list = row.parentElement;
      const sibling = e.key === 'ArrowUp' ? row.previousElementSibling : row.nextElementSibling;
      if (!sibling || !sibling.matches('.embed-field-row')) return;
      animateReorder(list, '.embed-field-row', () => {
        if (e.key === 'ArrowUp') list.insertBefore(row, sibling);
        else list.insertBefore(sibling, row);
      });
      handle.focus();
      updateEmbedPreview(root);
    };
  });
}

async function renderEmbedBuilderPage(id, container = app) {
  container.innerHTML = skeletonHtml();
  const [channels, templates, members] = await Promise.all([
    Api.channels(id),
    Api.embedTemplates(id).catch(() => []),
    Api.members(id).catch(() => null),
  ]);
  const textChannels = channels.filter((c) => c.type === 0);
  const channelOptions = textChannels.map((c) => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');
  embedVarContext = {
    server: allGuilds.find((g) => g.guildId === id)?.name || null,
    memberCount: Array.isArray(members) ? members.length : null,
  };

  const templateRows = () => templates.map((t) => `
    <div class="embed-template-row" data-id="${t.id}">
      <span class="embed-template-name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</span>
      <button class="btn secondary embed-load-template" data-id="${t.id}">Charger</button>
      <button class="btn danger embed-delete-template" data-id="${t.id}" title="Supprimer le modele" aria-label="Supprimer le modele ${escapeHtml(t.name)}">✕</button>
    </div>
  `).join('') || '<p class="muted">Aucun modele enregistre.</p>';

  container.innerHTML = `
    <div class="inner" style="max-width:none;">
      <div class="embed-builder-layout">
        <div class="embed-builder-form">
          <div class="dp-block">
            <div class="row" style="justify-content:space-between; align-items:center;">
              <p class="dp-block-title" style="margin:0;">📨 Message</p>
              <span class="row" style="gap:12px;">
                <button type="button" class="embed-json-jump" id="embed-clear-btn">🧹 Vider l'embed</button>
                <a href="#embed-json" class="embed-json-jump">🧾 Importer/exporter en JSON</a>
              </span>
            </div>
            <label for="embed-content">Texte au-dessus des embeds (optionnel)</label>
            <textarea id="embed-content" placeholder="Texte simple, en plus des embeds" data-md-link></textarea>

            <div class="row" id="embed-tabs" style="flex-wrap:wrap; gap:6px; margin:14px 0 4px;"></div>

            <div class="dp-subsection-divider"></div>
            <p class="dp-block-title">📝 Contenu principal</p>
            <div class="embed-form-row">
              <div>
                <label for="embed-title">Titre</label>
                <input type="text" id="embed-title" maxlength="256" placeholder="Titre de l'embed" data-charcount />
              </div>
              <div>
                <label for="embed-url">Lien du titre</label>
                <input type="text" id="embed-url" placeholder="Lien du titre : https://..." />
              </div>
            </div>
            <label for="embed-description">Description</label>
            <textarea id="embed-description" maxlength="4096" placeholder="Texte principal (markdown Discord supporte)" data-charcount data-md-link></textarea>
            <div class="embed-vars-row" role="group" aria-label="Variables dynamiques">
              <span>Variables :</span>
              <button type="button" class="embed-var-chip" data-var="{server}" title="Nom du serveur">{server}</button>
              <button type="button" class="embed-var-chip" data-var="{memberCount}" title="Nombre de membres">{memberCount}</button>
              <button type="button" class="embed-var-chip" data-var="{date}" title="Date du jour">{date}</button>
            </div>
            <label for="embed-color">Couleur</label>
            <div class="dp-role-color-row">
              <input type="color" id="embed-color" value="#5865f2" />
              <div class="dp-color-swatches">
                ${DISCORD_ROLE_COLORS.map((c) => `<button type="button" class="dp-color-swatch-btn embed-color-swatch-btn" data-color="${c}" style="--sw:${c}" title="${c}" aria-label="Couleur ${c}"></button>`).join('')}
              </div>
            </div>

            <div class="dp-subsection-divider"></div>
            <p class="dp-block-title">👤 Auteur</p>
            <div class="embed-form-row three">
              <div>
                <label for="embed-author-name">Nom</label>
                <input type="text" id="embed-author-name" maxlength="256" placeholder="Nom affiche en haut" data-charcount />
              </div>
              <div>
                <label for="embed-author-url">Lien</label>
                <input type="text" id="embed-author-url" placeholder="Lien : https://..." />
              </div>
              <div>
                <label for="embed-author-icon">Icone (URL)</label>
                <input type="text" id="embed-author-icon" placeholder="Icone : https://..." />
              </div>
            </div>

            <div class="dp-subsection-divider"></div>
            <p class="dp-block-title">🖼️ Images</p>
            <div class="embed-form-row">
              <div>
                <label for="embed-thumbnail">Miniature (petite image, en haut a droite)</label>
                <input type="text" id="embed-thumbnail" placeholder="Miniature (haut droite) : https://..." />
              </div>
              <div>
                <label for="embed-image">Image (grande image, en bas)</label>
                <input type="text" id="embed-image" placeholder="Grande image (bas) : https://..." />
              </div>
            </div>

            <div class="dp-subsection-divider"></div>
            <p class="dp-block-title">📋 Champs</p>
            <div id="embed-fields-list"></div>
            <button type="button" class="btn secondary" id="embed-add-field" style="margin-top:8px;">+ Ajouter un champ</button>

            <div class="dp-subsection-divider"></div>
            <p class="dp-block-title">🔻 Pied de page</p>
            <div class="embed-form-row">
              <div>
                <label for="embed-footer-text">Texte</label>
                <input type="text" id="embed-footer-text" maxlength="2048" placeholder="Texte du pied de page" data-charcount />
              </div>
              <div>
                <label for="embed-footer-icon">Icone (URL)</label>
                <input type="text" id="embed-footer-icon" placeholder="Icone : https://..." />
              </div>
            </div>
            <label class="dp-toggle-row" style="margin-top:8px;">
              <span>Inclure la date/heure actuelles</span>
              <input type="checkbox" id="embed-timestamp" />
            </label>

            <div class="dp-subsection-divider"></div>
            <p class="dp-block-title">💾 Modeles</p>
            <div class="embed-presets-row" role="group" aria-label="Modeles prets a l'emploi">
              ${EMBED_PRESETS.map((p) => `<button type="button" class="embed-preset-btn" data-preset="${p.key}">${p.label}</button>`).join('')}
            </div>
            <div id="embed-draft-row"></div>
            <div id="embed-templates-list">${templateRows()}</div>

            <div class="dp-subsection-divider"></div>
            <p class="dp-block-title">🧾 JSON avance (import/export)</p>
            <p class="muted">Colle un JSON d'embed, glisse un fichier .json ici, ou copie celui genere par le formulaire.</p>
            <textarea id="embed-json" style="min-height:120px;" placeholder='{"title": "...", "description": "...", "color": 5793266} — ou glisse un fichier .json ici'></textarea>
            <div class="row" style="margin-top:8px;">
              <button type="button" class="btn secondary" id="embed-json-apply">Appliquer ce JSON</button>
              <button type="button" class="btn secondary" id="embed-json-copy">Copier le JSON actuel</button>
            </div>
          </div>
        </div>

        <div class="embed-builder-preview-wrap">
          <div class="row" style="justify-content:space-between; align-items:center;">
            <p class="muted" style="margin:0;">Apercu en direct</p>
            <button type="button" class="embed-json-jump" id="embed-preview-width-btn" aria-pressed="false" title="Simuler la largeur d'un telephone">📱 Apercu mobile</button>
          </div>
          <div id="embed-preview-slot"></div>
          <p class="embed-char-total" id="embed-char-total" aria-live="polite"></p>
          <label style="margin-top:14px;" for="embed-target-channel">Salon de destination</label>
          <select id="embed-target-channel">${channelOptions}</select>
          <label style="margin-top:10px;" for="embed-target-message-id">ID du message a editer (optionnel — laisse vide pour poster un nouveau message)</label>
          <input type="text" id="embed-target-message-id" placeholder="Clic droit sur le message > Copier l'ID" />
          <button class="btn secondary" id="embed-load-message-btn" style="margin-top:8px; width:100%;">📥 Charger le contenu de ce message</button>
          <button class="btn" id="embed-post-btn" style="margin-top:10px; width:100%;">🚀 Poster dans Discord</button>
          <button class="btn secondary" id="embed-save-template-btn" style="margin-top:8px; width:100%;">💾 Enregistrer comme modele</button>

          <label class="dp-toggle-row" style="margin-top:14px;">
            <span>Programmer l'envoi</span>
            <input type="checkbox" id="embed-schedule-toggle" />
          </label>
          <div id="embed-schedule-fields" style="display:none; margin-top:8px;">
            <label for="embed-schedule-date">Date et heure</label>
            <input type="datetime-local" id="embed-schedule-date" />
            <label class="dp-toggle-row" style="margin-top:8px;">
              <span>Repeter tous les jours a cette heure</span>
              <input type="checkbox" id="embed-schedule-daily" />
            </label>
            <button class="btn" id="embed-schedule-btn" style="margin-top:8px; width:100%;">🗓️ Programmer</button>
          </div>
        </div>
      </div>
    </div>
  `;

  container.__mb = { embeds: [{}], active: 0 };
  renderEmbedTabs(container);

  if (prefillChannelId) {
    const targetSel = container.querySelector('#embed-target-channel');
    if (targetSel) targetSel.value = prefillChannelId;
    prefillChannelId = null;
  }

  container.querySelectorAll('input, textarea').forEach((el) => {
    el.addEventListener('input', () => updateEmbedPreview(container));
  });
  container.querySelectorAll('.embed-color-swatch-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelector('#embed-color').value = btn.dataset.color;
      updateEmbedPreview(container);
    });
  });

  container.querySelector('#embed-clear-btn').addEventListener('click', () => {
    if (!window.confirm("Vider l'embed affiche ? Le texte du message et les autres embeds sont conserves.")) return;
    populateEmbedForm(container, {}, container.querySelector('#embed-content').value);
  });

  // Brouillon auto (n°007) : propose de restaurer le travail en cours.
  container.__draftKey = `embedDraft:${id}`;
  const draftRow = container.querySelector('#embed-draft-row');
  const renderDraftRow = () => {
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem(container.__draftKey) || 'null'); } catch { draft = null; }
    if (!draft?.embeds) { draftRow.innerHTML = ''; return; }
    const age = Math.max(1, Math.round((Date.now() - draft.at) / 60000));
    draftRow.innerHTML = `
      <div class="embed-template-row">
        <span class="embed-template-name">📝 Brouillon auto (il y a ${age >= 60 ? `${Math.round(age / 60)} h` : `${age} min`})</span>
        <button type="button" class="btn secondary" id="embed-draft-restore">Restaurer</button>
        <button type="button" class="btn danger" id="embed-draft-delete" title="Supprimer le brouillon" aria-label="Supprimer le brouillon">✕</button>
      </div>`;
    draftRow.querySelector('#embed-draft-restore').addEventListener('click', () => {
      container.__mb = { embeds: draft.embeds, active: 0 };
      populateEmbedForm(container, draft.embeds[0] || {}, draft.content || '');
      renderEmbedTabs(container);
      showToast('Brouillon restaure.');
    });
    draftRow.querySelector('#embed-draft-delete').addEventListener('click', () => {
      localStorage.removeItem(container.__draftKey);
      draftRow.innerHTML = '';
      showToast('Brouillon supprime.');
    });
  };
  renderDraftRow();

  // Modeles prets a l'emploi (n°002).
  container.querySelectorAll('.embed-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = EMBED_PRESETS.find((p) => p.key === btn.dataset.preset);
      if (!preset) return;
      populateEmbedForm(container, JSON.parse(JSON.stringify(preset.embed)), container.querySelector('#embed-content').value);
      showToast(`Modele "${preset.label.replace(/^\S+\s/, '')}" charge : adapte-le puis poste.`);
    });
  });

  // Variables dynamiques (n°004) : insertion dans la derniere zone de texte
  // markdown utilisee (description par defaut).
  container.__lastMdArea = container.querySelector('#embed-description');
  container.addEventListener('focusin', (e) => {
    if (e.target.matches?.('textarea[data-md-link], .embed-field-name, #embed-title, #embed-footer-text')) {
      container.__lastMdArea = e.target;
    }
  });
  container.querySelectorAll('.embed-var-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const area = container.__lastMdArea || container.querySelector('#embed-description');
      const start = area.selectionStart ?? area.value.length;
      const end = area.selectionEnd ?? start;
      area.value = area.value.slice(0, start) + chip.dataset.var + area.value.slice(end);
      const pos = start + chip.dataset.var.length;
      area.setSelectionRange(pos, pos);
      area.focus();
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  // Apercu mobile (n°009) : simule la largeur d'un telephone.
  container.querySelector('#embed-preview-width-btn').addEventListener('click', (e) => {
    const wrap = container.querySelector('.embed-builder-preview-wrap');
    const mobile = wrap.classList.toggle('mobile-preview');
    e.currentTarget.setAttribute('aria-pressed', String(mobile));
    e.currentTarget.textContent = mobile ? '🖥️ Apercu bureau' : '📱 Apercu mobile';
  });

  // Validation en direct des URL d'images (n°010) : chargement reel teste.
  const imgUrlIds = ['embed-author-icon', 'embed-thumbnail', 'embed-image', 'embed-footer-icon'];
  imgUrlIds.forEach((fieldId) => {
    const input = container.querySelector(`#${fieldId}`);
    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      input.classList.remove('url-ok', 'url-bad');
      const v = input.value.trim();
      if (!v) return;
      timer = setTimeout(() => {
        if (!/^https?:\/\/\S+$/i.test(v)) { input.classList.add('url-bad'); return; }
        const probe = new Image();
        probe.onload = () => { if (input.value.trim() === v) input.classList.add('url-ok'); };
        probe.onerror = () => { if (input.value.trim() === v) input.classList.add('url-bad'); };
        probe.src = v;
      }, 600);
    });
  });

  container.querySelector('#embed-target-message-id').addEventListener('input', (e) => {
    // Lien de message colle (n°006) : detecte salon + message automatiquement.
    const linkMatch = e.target.value.match(/discord(?:app)?\.com\/channels\/\d+\/(\d+)\/(\d+)/);
    if (linkMatch) {
      const [, channelId, messageId] = linkMatch;
      const sel = container.querySelector('#embed-target-channel');
      if ([...sel.options].some((o) => o.value === channelId)) sel.value = channelId;
      e.target.value = messageId;
      showToast('Lien decode : salon et message selectionnes.');
    }
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
    const embeds = state.embeds.map(substituteEmbedVars);
    const content = resolveEmbedVars(container.querySelector('#embed-content').value.trim());
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
      localStorage.removeItem(container.__draftKey);
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
    const embeds = state.embeds.map(substituteEmbedVars);
    const content = resolveEmbedVars(container.querySelector('#embed-content').value.trim());
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

  container.querySelector('a.embed-json-jump').addEventListener('click', () => {
    setTimeout(() => container.querySelector('#embed-json').focus(), 300);
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

  // Glisser-deposer un fichier .json directement sur la zone JSON : le
  // contenu est colle ET applique au formulaire. stopPropagation pour ne pas
  // reveiller le handler de depose salon/categorie attache a #dp-main.
  const jsonArea = container.querySelector('#embed-json');
  jsonArea.addEventListener('dragover', (e) => {
    if (![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    jsonArea.classList.add('drag-over');
  });
  jsonArea.addEventListener('dragleave', () => jsonArea.classList.remove('drag-over'));
  jsonArea.addEventListener('drop', async (e) => {
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    e.preventDefault();
    e.stopPropagation();
    jsonArea.classList.remove('drag-over');
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      showToast('Choisis un fichier .json.', 'error');
      return;
    }
    try {
      const text = await file.text();
      jsonArea.value = text;
      populateEmbedForm(container, JSON.parse(text), '');
      showToast(`${file.name} charge et applique.`);
    } catch {
      showToast('Fichier JSON invalide.', 'error');
    }
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

const AI_PROVIDERS = [
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'openai', label: 'OpenAI (GPT)' },
  { value: 'gemini', label: 'Google (Gemini)' },
];

async function renderAiConfigPage(guildId, container = app) {
  container.innerHTML = skeletonHtml();
  const config = await Api.aiConfig(guildId).catch(() => null);

  container.innerHTML = `
    <div class="inner">
      ${sectionHtml('Cle API', `
        <p class="dp-block-title">🔑 Cle API</p>
        <p class="muted" style="margin:0 0 12px;">
          ${config?.hasKey
            ? `Cle configuree (${AI_PROVIDERS.find((p) => p.value === config.provider)?.label || config.provider}). La cle n'est jamais raffichee apres enregistrement.`
            : "Aucune cle configuree pour l'instant. Sans cle, l'assistant ne peut pas repondre."}
        </p>
        <label for="ai-provider">Fournisseur</label>
        <select id="ai-provider">
          ${AI_PROVIDERS.map((p) => `<option value="${p.value}" ${config?.provider === p.value ? 'selected' : ''}>${escapeHtml(p.label)}</option>`).join('')}
        </select>
        <label for="ai-apikey">Cle API</label>
        <input type="password" id="ai-apikey" placeholder="${config?.hasKey ? 'Laisser vide pour ne pas changer' : 'sk-...'}" autocomplete="off" />
        <div class="row" style="margin-top:12px;">
          <button class="btn" id="ai-save">Enregistrer</button>
          ${config?.hasKey ? '<button class="btn danger secondary" id="ai-clear">Retirer la cle</button>' : ''}
        </div>
      `, { alwaysOpen: true })}
      ${sectionHtml('A propos', `
        <p class="dp-block-title">ℹ️ A propos</p>
        <p class="muted">
          Chaque serveur utilise sa propre cle API, fournie par toi. Elle est chiffree avant stockage et n'est
          jamais renvoyee en clair. Les actions non destructives (creer, renommer, changer une couleur...) sont
          executees directement depuis la conversation. Les suppressions demandent toujours une confirmation
          explicite avant d'etre executees.
        </p>
      `, { alwaysOpen: true })}
    </div>
  `;

  container.querySelector('#ai-save').addEventListener('click', async () => {
    const provider = container.querySelector('#ai-provider').value;
    const apiKey = container.querySelector('#ai-apikey').value.trim();
    if (!apiKey) { showToast('Entre une cle API.', 'error'); return; }
    try {
      await Api.saveAiConfig(guildId, provider, apiKey);
      showToast('Cle API enregistree.');
      await renderAiConfigPage(guildId, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  const clearBtn = container.querySelector('#ai-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      if (!window.confirm("Retirer la cle API de l'assistant IA ?")) return;
      try {
        await Api.clearAiConfig(guildId);
        showToast('Cle API retiree.');
        await renderAiConfigPage(guildId, container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
}

async function renderBotStatusPage(container = app) {
  container.innerHTML = skeletonHtml();
  const status = await Api.botStatus().catch(() => null);

  if (!status) {
    container.innerHTML = `
      <div class="inner">
        ${sectionHtml('Statut du bot', '<p class="muted">Aucune donnee de statut disponible pour le moment.</p>', { alwaysOpen: true })}
      </div>`;
    return;
  }

  // Le heartbeat ecrit toutes les 10 min (economie du quota KV) : on tolere
  // deux ticks manques avant de declarer le bot hors ligne.
  const isOnline = Date.now() - status.updatedAt < 25 * 60_000;
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
      `, { alwaysOpen: true })}
    </div>
  `;
}

async function renderTemplatesPage(guildId, container = app) {
  container.innerHTML = skeletonHtml();
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
      `, { alwaysOpen: true })}
    </div>
  `;

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
  container.innerHTML = skeletonHtml();
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
        <label style="margin-top:14px;" for="new-cmd-name">Nom (minuscules, sans espace)</label>
        <input type="text" id="new-cmd-name" placeholder="regles" maxlength="32" data-charcount />
        <label for="new-cmd-description">Description</label>
        <input type="text" id="new-cmd-description" placeholder="Affiche les regles du serveur" maxlength="100" data-charcount />
        <label for="new-cmd-response">Reponse</label>
        <textarea id="new-cmd-response" placeholder="Bienvenue {user} ! Consulte les regles dans #reglement."></textarea>
        <label for="new-cmd-role">Role requis (optionnel)</label>
        <select id="new-cmd-role">
          <option value="">Aucun</option>
          ${roleOptions}
        </select>
        <button class="btn" id="add-custom-command" style="margin-top:10px;">Creer la commande</button>
      `, { alwaysOpen: true })}
    </div>
  `;

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
  app.innerHTML = skeletonHtml();
  const savedTemplates = await Api.templates().catch(() => []);
  const templateOptions = [
    { key: 'live', label: 'ServeurCreator (a jour)' },
    ...savedTemplates.map((t) => ({ key: `live:${t.id}`, label: t.name })),
  ];

  app.innerHTML = `
    <div class="inner wide fill">
      ${sectionHtml(`Generer "${escapeHtml(guildName)}"`, `
        <p class="dp-panel-title">🪄 Generer "${escapeHtml(guildName)}"</p>
        <p class="muted">Choisis un template : sa structure (roles, salons, permissions, textes) sera recreee en direct sur ce serveur.</p>
        <div class="gen-layout">
          <div class="gen-layout-form">
            <label for="gen-template">Template</label>
            <select id="gen-template">
              ${templateOptions.map((t) => `<option value="${t.key}">${escapeHtml(t.label)}</option>`).join('')}
            </select>
            <label for="gen-reglement">Texte du reglement (optionnel, sinon celui du template)</label>
            <textarea id="gen-reglement" placeholder="Laisse vide pour utiliser le reglement du template"></textarea>
            <div class="row" style="margin-top:16px;">
              <button class="btn secondary" id="gen-cancel">Annuler</button>
              <button class="btn" id="gen-launch">🪄 Lancer la generation</button>
            </div>
          </div>
          <div class="gen-preview-mock" id="gen-template-preview">
            <div class="gen-preview-mock-placeholder"><p class="muted">Chargement de l'apercu...</p></div>
          </div>
        </div>
      `, { alwaysOpen: true })}
    </div>
  `;

  const templateSelect = document.getElementById('gen-template');
  const previewEl = document.getElementById('gen-template-preview');

  async function loadPreview() {
    const key = templateSelect.value;
    previewEl.innerHTML = '<div class="gen-preview-mock-placeholder"><p class="muted">Chargement de l\'apercu...</p></div>';
    try {
      const preview = await Api.templatePreview(key);
      previewEl.innerHTML = templatePreviewHtml(preview);
      wireTemplatePreview(previewEl, preview);
    } catch (err) {
      previewEl.innerHTML = `<div class="gen-preview-mock-placeholder"><p class="muted">🪄 Apercu indisponible<br>(${escapeHtml(err.message)})</p></div>`;
    }
  }
  templateSelect.addEventListener('change', loadPreview);
  loadPreview();

  document.getElementById('gen-cancel').addEventListener('click', () => {
    withViewTransition(() => renderGuildList());
  });
  document.getElementById('gen-launch').addEventListener('click', async () => {
    const templateKey = document.getElementById('gen-template').value;
    const reglementText = document.getElementById('gen-reglement').value.trim();
    const btn = document.getElementById('gen-launch');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Generation...';
    try {
      await Api.generateServer(guildId, templateKey, reglementText || undefined);
      withViewTransition(() => renderGenerationScreen(guildId, guildName));
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  });
}

function templatePreviewChannelKind(ch, preview) {
  if (!ch.id || !preview.specialChannelIds) return null;
  if (ch.id === preview.specialChannelIds.reglement) return 'reglement';
  if (ch.id === preview.specialChannelIds.arrivalDeparture) return 'arrivalDeparture';
  if (ch.id === preview.specialChannelIds.roles) return 'roles';
  if (ch.id === preview.specialChannelIds.support) return 'support';
  return null;
}

function templatePreviewChanHtml(ch, preview) {
  const kind = templatePreviewChannelKind(ch, preview);
  const clickable = kind ? ' clickable' : '';
  const attrs = kind ? ` data-chan-kind="${kind}"` : '';
  return `
    <div class="tplprev-chan-wrap">
      <div class="tplprev-chan${clickable}"${attrs}>
        <span class="tplprev-chan-icon">${ch.type === 'voice' ? '🔊' : '#'}</span>${escapeHtml(ch.name)}
        ${ch.auto ? '<span class="tplprev-auto-badge">auto</span>' : ''}
      </div>
    </div>
  `;
}

function templatePreviewCategoryHtml(c, preview) {
  return `
    <div class="tplprev-cat${c.auto ? ' auto' : ''}">${escapeHtml(c.name)}${c.auto ? '<span class="tplprev-auto-badge">auto</span>' : ''}</div>
    ${c.channels.map((ch) => templatePreviewChanHtml(ch, preview)).join('')}
  `;
}

function templatePreviewHtml(preview) {
  if (!preview) return '<p class="muted">Apercu indisponible.</p>';
  const roles = preview.roles || [];
  const gameRoles = preview.gameRoles || [];
  const categories = preview.categories || [];
  const autoCategories = preview.autoCategories || [];
  const totalChannels = [...categories, ...autoCategories].reduce((n, c) => n + c.channels.length, 0);
  return `
    <div class="tplprev-head">
      ${preview.guildIconUrl ? `<img class="tplprev-icon" src="${preview.guildIconUrl}" alt="" />` : '<span class="tplprev-icon tplprev-icon-fallback">🪄</span>'}
      <strong>${escapeHtml(preview.label || 'Template')}</strong>
    </div>
    <div class="tplprev-body">
      <div class="tplprev-roles-block">
        <p class="tplprev-subtitle">Roles (${roles.length})</p>
        <div class="tplprev-roles">
          ${roles.length ? roles.map((r) => `<span class="tplprev-role-chip" style="--rc:${escapeHtml(r.color)}">${escapeHtml(r.name)}</span>`).join('') : '<span class="muted">Aucun</span>'}
        </div>
        ${gameRoles.length ? `
          <p class="tplprev-subtitle" style="margin-top:14px;">Roles de jeu (${gameRoles.length})</p>
          <div class="tplprev-roles">
            ${gameRoles.map((r) => `<span class="tplprev-role-chip" style="--rc:${escapeHtml(r.color)}">${escapeHtml(r.name)}</span>`).join('')}
          </div>
        ` : ''}
      </div>
      <div class="tplprev-channels-block">
        <p class="tplprev-subtitle">Salons (${totalChannels})</p>
        <div class="tplprev-channels">
          ${categories.length ? categories.map((c) => templatePreviewCategoryHtml(c, preview)).join('') : '<span class="muted">Aucun</span>'}
          ${autoCategories.map((c) => templatePreviewCategoryHtml(c, preview)).join('')}
        </div>
        ${autoCategories.length ? '<p class="tplprev-auto-note">auto = cree automatiquement a la generation (staff, roles de jeu, createur vocal), pas copie tel quel</p>' : ''}
      </div>
    </div>
  `;
}

function templatePreviewEmbedHtml(kind, preview) {
  const content = preview.content || {};
  const label = escapeHtml(preview.label || 'ce serveur');
  if (kind === 'reglement') {
    const desc = content.reglementText
      ? escapeHtml(content.reglementText)
      : '<em>(texte par defaut du bot : regles de respect, anti-spam, moderation...)</em>';
    return `
      <div class="tplprev-embed" style="--ec:#e63946">
        <div class="tplprev-embed-title">Reglement du serveur</div>
        <div class="tplprev-embed-desc">${desc}</div>
      </div>
      <p class="tplprev-embed-hint">+ boutons "J'accepte le reglement" et "Autres langues"</p>
    `;
  }
  if (kind === 'arrivalDeparture') {
    const welcomeRaw = content.welcomeMessageTemplate || 'Bienvenue {user} sur {server} !';
    const welcome = escapeHtml(welcomeRaw.replace(/\{user\}/g, '@NouveauMembre').replace(/\{server\}/g, preview.label || 'ce serveur'));
    return `
      <div class="tplprev-embed" style="--ec:#30a46c">
        <div class="tplprev-embed-author">NouveauMembre</div>
        <div class="tplprev-embed-title">👋 Nouveau membre</div>
        <div class="tplprev-embed-desc">${welcome}</div>
        <div class="tplprev-embed-fields">
          <div><div class="tplprev-embed-field-name">Membre</div><div class="tplprev-embed-field-value">@NouveauMembre</div></div>
          <div><div class="tplprev-embed-field-name">Total</div><div class="tplprev-embed-field-value">123 membres</div></div>
        </div>
      </div>
      <p class="tplprev-embed-hint">meme salon, embed rouge "👋 Depart" au depart d'un membre</p>
    `;
  }
  if (kind === 'roles') {
    return `<p class="tplprev-embed-note">Menu de selection des roles de jeu, genere et mis a jour automatiquement selon les jeux configures sur ${label}.</p>`;
  }
  if (kind === 'support') {
    return `
      <div class="tplprev-embed" style="--ec:#5b8def">
        <div class="tplprev-embed-title">🎫 Support</div>
        <div class="tplprev-embed-desc">Besoin d'aide ou d'une question ? Clique sur le bouton ci-dessous pour ouvrir un ticket prive avec le staff.</div>
      </div>
      <p class="tplprev-embed-hint">+ bouton "Ouvrir un ticket" (cree un salon prive dedie a la demande)</p>
    `;
  }
  return '<p class="tplprev-embed-note">Aucun contenu automatique pour ce salon.</p>';
}

function wireTemplatePreview(previewEl, preview) {
  previewEl.querySelectorAll('.tplprev-chan.clickable').forEach((el) => {
    el.addEventListener('click', () => {
      const wrap = el.closest('.tplprev-chan-wrap');
      const already = wrap.querySelector('.tplprev-embed-panel');
      previewEl.querySelectorAll('.tplprev-embed-panel').forEach((p) => p.remove());
      previewEl.querySelectorAll('.tplprev-chan.active').forEach((c) => c.classList.remove('active'));
      if (already) return;
      el.classList.add('active');
      const panel = document.createElement('div');
      panel.className = 'tplprev-embed-panel';
      panel.innerHTML = templatePreviewEmbedHtml(el.dataset.chanKind, preview);
      wrap.appendChild(panel);
    });
  });
}

function renderGenerationScreen(guildId, guildName) {
  app.innerHTML = `
    <div class="inner">
      ${sectionHtml(`Generation de "${escapeHtml(guildName)}"`, `
        <p class="dp-panel-title">🪄 Generation de "${escapeHtml(guildName)}"</p>
        <div class="gen-status running" id="gen-status">
          <span class="gen-status-dot"></span>
          <span id="gen-status-text">En file d'attente...</span>
        </div>
        <div class="gen-timeline" id="gen-timeline"></div>
        <div class="gen-final-actions" id="gen-final-actions" style="display:none;"></div>
      `, { alwaysOpen: true })}
    </div>
  `;

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
  try {
    await renderPreviewPage(id);
  } catch (err) {
    app.innerHTML = `
      <div class="inner"><div class="card">
        <div class="inline-banner error">
          <span class="icon">⚠</span>
          <span class="msg">Impossible de charger "${escapeHtml(guild.name || id)}" (${escapeHtml(err.message)}).</span>
          <button class="retry-btn" id="guild-detail-retry">Reessayer</button>
        </div>
      </div></div>`;
    document.getElementById('guild-detail-retry')?.addEventListener('click', () => {
      withViewTransition(() => renderGuildDetail(id));
    });
  }
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

  // Echap = retour, ou qu'on soit (panneau salon/categorie/role ou module
  // de reglages) : un seul listener global plutot qu'un par re-rendu.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const backBtn = document.getElementById('dp-settings-back') || document.getElementById('dp-actionchat-back');
    backBtn?.click();
  });

  // Raccourci "/" pour focus direct sur la recherche (pattern Discord/Linear/
  // GitHub), sauf si on est deja en train de taper ailleurs.
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.target.matches('input, textarea, [contenteditable]')) return;
    if (searchBox.style.display === 'none') return;
    e.preventDefault();
    if (window.matchMedia('(max-width: 480px)').matches) searchBox.classList.add('search-open');
    searchInput.focus();
  });

  const videoToggleBtn = document.getElementById('video-toggle-btn');
  if (videoToggleBtn) {
    const applyVideoState = () => {
      const off = localStorage.getItem('bgVideoOff') === '1';
      document.body.classList.toggle('bg-video-off', off);
      videoToggleBtn.classList.toggle('is-off', off);
      videoToggleBtn.title = off ? 'Reactiver la video de fond' : 'Couper la video de fond';
    };
    applyVideoState();
    videoToggleBtn.addEventListener('click', () => {
      localStorage.setItem('bgVideoOff', localStorage.getItem('bgVideoOff') === '1' ? '0' : '1');
      applyVideoState();
      window.UISound?.click();
    });
  }

  const searchToggleBtn = document.getElementById('search-box-toggle');
  if (searchToggleBtn) {
    searchToggleBtn.addEventListener('click', () => {
      searchBox.classList.add('search-open');
      searchInput.focus();
    });
    searchInput.addEventListener('blur', () => {
      if (!searchInput.value) searchBox.classList.remove('search-open');
    });
  }

  const topbarEl = document.getElementById('content-topbar');
  const contentBodyEl = document.querySelector('.content-body');
  if (topbarEl && contentBodyEl) {
    contentBodyEl.addEventListener('scroll', () => {
      topbarEl.classList.toggle('is-scrolled', contentBodyEl.scrollTop > 4);
    }, { passive: true });
  }

  // Cache local de la derniere liste connue : affichage instantane pendant
  // que la vraie requete part en arriere-plan (stale-while-revalidate).
  if (!guildId) {
    try {
      const cached = JSON.parse(localStorage.getItem('guilds-cache') || 'null');
      if (Array.isArray(cached)) {
        allGuilds = cached;
        renderRail();
        await renderGuildList();
      }
    } catch { /* cache corrompu, on ignore */ }
  }

  try {
    allGuilds = await Api.guilds();
  } catch (err) {
    app.innerHTML = `
      <div class="inner"><div class="card">
        <div class="inline-banner error">
          <span class="icon">⚠</span>
          <span class="msg">Impossible de charger tes serveurs (${escapeHtml(err.message)}).</span>
          <button class="retry-btn" id="guilds-retry">Reessayer</button>
        </div>
      </div></div>`;
    document.getElementById('guilds-retry')?.addEventListener('click', () => { location.reload(); });
    return;
  }
  try {
    // Une liste vide n'ecrase jamais un cache utile : au pire c'est un
    // incident cote Discord, au mieux l'ecran vide legitime s'affiche
    // quand meme (allGuilds fait foi pour le rendu).
    if (allGuilds.length) {
      localStorage.setItem('guilds-cache', JSON.stringify(allGuilds));
      localStorage.setItem('guilds-cache-at', String(Date.now()));
    }
  } catch { /* quota localStorage depasse, tant pis pour le cache */ }
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
