const app = document.getElementById('app');
const railEl = document.getElementById('topbar-guilds');
const searchBox = document.getElementById('search-box');
const searchInput = document.getElementById('search-input');

// Bouton "remonter en haut" (roadmap n°233) : coin bas-droit, jamais bas-
// centre (lecon retenue plus haut sur les FAB qui masquent le chat IA).
// Ecoute en phase de capture sur window : les VRAIS conteneurs de scroll de
// l'app (#app pour la liste de serveurs, #dp-settings-body pour les pages de
// reglages) sont recrees a chaque navigation, capturer au niveau window evite
// de re-cabler l'ecouteur a chaque re-rendu. Filtre explicite sur ces deux
// ids pour ignorer les petites listes internes qui scrollent (ex. liste de
// membres) sans que ce soit "la page" qui defile.
(function initScrollTopButton() {
  const btn = document.getElementById('scrolltop-btn');
  if (!btn) return;
  btn.hidden = false; // la visibilite reelle passe uniquement par .visible (opacite)
  const SCROLL_THRESHOLD = 400;
  let activeContainer = null;

  window.addEventListener('scroll', (e) => {
    const target = e.target;
    if (!target || (target.id !== 'app' && target.id !== 'dp-settings-body')) return;
    if (target.scrollTop > SCROLL_THRESHOLD) {
      activeContainer = target;
      btn.classList.add('visible');
    } else if (target === activeContainer) {
      btn.classList.remove('visible');
    }
  }, true);

  btn.addEventListener('click', () => {
    activeContainer?.scrollTo({ top: 0, behavior: 'smooth' });
    btn.classList.remove('visible');
  });
}());

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

// Salon favori (roadmap n°581) : meme delegation en phase de capture que
// les boutons voisins (copie-ID, icone).
app.addEventListener('click', (e) => {
  const btn = e.target.closest('.dp-channel-pin-btn');
  if (!btn) return;
  e.stopPropagation();
  e.preventDefault();
  const gid = paletteCtx.guildId;
  const storageKey = `dsc-pinned-channels-${gid}`;
  const pinned = new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'));
  const channelId = btn.dataset.channelPin;
  if (pinned.has(channelId)) pinned.delete(channelId); else pinned.add(channelId);
  localStorage.setItem(storageKey, JSON.stringify([...pinned]));
  const row = btn.closest('.dp-channel');
  row.classList.toggle('pinned', pinned.has(channelId));
  btn.textContent = pinned.has(channelId) ? '★' : '☆';
  const label = pinned.has(channelId) ? 'Retirer des favoris' : 'Ajouter aux favoris';
  btn.title = label;
  btn.setAttribute('aria-label', `${label} : ${row.dataset.name}`);
}, true);

// Verrouillage de position (roadmap n°257) : reglage serveur, meme
// delegation en phase de capture que les boutons voisins.
app.addEventListener('click', async (e) => {
  const btn = e.target.closest('.dp-channel-lock-btn');
  if (!btn) return;
  e.stopPropagation();
  e.preventDefault();
  const guildId = paletteCtx.guildId;
  const channelId = btn.dataset.channelLock;
  try {
    const config = await Api.config(guildId);
    const locked = new Set(config?.channelPositionLocked || []);
    if (locked.has(channelId)) locked.delete(channelId); else locked.add(channelId);
    await Api.updateConfig(guildId, { channelPositionLocked: [...locked] });
    const row = btn.closest('.dp-channel');
    const nowLocked = locked.has(channelId);
    row.draggable = !nowLocked;
    btn.classList.toggle('locked', nowLocked);
    btn.textContent = nowLocked ? '🔒' : '🔓';
    const label = nowLocked ? 'Deverrouiller la position' : 'Verrouiller la position (empeche le glisser-depose)';
    btn.title = label;
    btn.setAttribute('aria-label', `${nowLocked ? 'Deverrouiller' : 'Verrouiller'} la position de ${row.dataset.name}`);
    showToast(nowLocked ? 'Position verrouillee.' : 'Position deverrouillee.');
  } catch (err) {
    showToast(err.message, 'error');
  }
}, true);

// Icone personnalisee par salon (roadmap n°254) : meme delegation en phase
// de capture que le bouton copier-ID ci-dessus, pour la meme raison (le
// bouton est imbrique dans .dp-channel qui a son propre click).
app.addEventListener('click', async (e) => {
  const btn = e.target.closest('.dp-channel-emoji-btn');
  if (!btn) return;
  e.stopPropagation();
  e.preventDefault();
  const channelId = btn.dataset.channelEmoji;
  const current = paletteCtx.channels?.find((c) => c.id === channelId);
  const answer = window.prompt(`Icone personnalisee pour #${current?.name || channelId} (un seul emoji, vide pour retirer) :`, '');
  if (answer === null) return;
  try {
    const guildId = paletteCtx.guildId;
    const config = await Api.config(guildId);
    const channelEmojis = { ...(config?.channelEmojis || {}) };
    if (answer.trim()) channelEmojis[channelId] = answer.trim().slice(0, 8);
    else delete channelEmojis[channelId];
    await Api.updateConfig(guildId, { channelEmojis });
    showToast('Icone mise a jour.');
    await renderPreviewPage(guildId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}, true);

// Apercu du salon au survol prolonge (roadmap n°256) : topic, slowmode,
// permissions resumees. Delegue sur #app (globalement, pas par re-render) via
// mouseover/mouseout qui bouillonnent contrairement a mouseenter/mouseleave ;
// paletteCtx.channels/guildId sont deja tenus a jour par renderPreviewContent.
(function () {
  let timer = null;
  let bubble = null;
  const ensureBubble = () => {
    if (bubble) return bubble;
    bubble = document.createElement('div');
    bubble.className = 'dp-channel-preview-bubble';
    bubble.hidden = true;
    document.body.appendChild(bubble);
    return bubble;
  };
  const hide = () => {
    clearTimeout(timer);
    if (bubble) bubble.hidden = true;
  };
  app.addEventListener('mouseover', (e) => {
    const row = e.target.closest('.dp-channel');
    if (!row || row.contains(e.relatedTarget)) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const c = paletteCtx.channels?.find((ch) => ch.id === row.dataset.channel);
      if (!c) return;
      const everyone = (c.permission_overwrites || []).find((o) => o.id === paletteCtx.guildId);
      const hidden = everyone && (BigInt(everyone.deny || 0) & 1024n) === 1024n;
      const overwriteCount = (c.permission_overwrites || []).length;
      const b = ensureBubble();
      b.innerHTML = `
        <strong>#${escapeHtml(c.name)}</strong>
        ${c.topic ? `<p>${escapeHtml(c.topic).slice(0, 180)}</p>` : '<p class="muted">Pas de sujet.</p>'}
        <p class="muted">${c.rate_limit_per_user ? `🐌 Slowmode ${c.rate_limit_per_user}s` : 'Pas de slowmode'} · ${overwriteCount} permission(s) personnalisee(s)${hidden ? ' · 🔒 prive' : ''}</p>
      `;
      const rect = row.getBoundingClientRect();
      b.style.left = `${Math.min(window.innerWidth - 280, rect.right + 8)}px`;
      b.style.top = `${Math.max(8, rect.top)}px`;
      b.hidden = false;
    }, 600);
  });
  app.addEventListener('mouseout', (e) => {
    const row = e.target.closest('.dp-channel');
    if (!row || row.contains(e.relatedTarget)) return;
    hide();
  });
}());

// Champs d'URL (lien ou image) : accepte le glisser-deposer d'un lien ou
// d'une image venant d'une page web, et le Ctrl+V d'une image copiee sur le
// web (le navigateur fournit alors le HTML <img src=...> d'origine, dont on
// extrait le lien). Delegue sur #app comme les compteurs de caracteres :
// marche partout (generateur d'embed, webhooks...) sans re-cablage par
// re-rendu. Capture + stopPropagation : les zones parentes (#dp-main) ont
// leurs propres handlers de depose (salons/categories) a ne pas reveiller.
// Fichiers image locaux du generateur d'embed (roadmap n°001) : gardes en
// memoire jusqu'au post, puis envoyes en pieces jointes AVEC le message
// (attachment://nom) — Discord les reheberge durablement, contrairement a
// un simple lien CDN signe qui expire.
window.__embedLocalFiles = new Map(); // inputId -> { file, objectUrl, filename }

function attachLocalImage(input, file) {
  if (!file.type?.startsWith('image/')) { showToast('Choisis un fichier image.', 'error'); return; }
  if (file.size > 8 * 1024 * 1024) { showToast('Image trop lourde (8 Mo maximum).', 'error'); return; }
  const previous = window.__embedLocalFiles.get(input.id);
  if (previous) URL.revokeObjectURL(previous.objectUrl);
  const ext = (file.name.match(/\.(png|jpe?g|gif|webp)$/i)?.[1] || 'png').toLowerCase();
  const filename = `${input.id}.${ext}`;
  window.__embedLocalFiles.set(input.id, { file, objectUrl: URL.createObjectURL(file), filename });
  input.value = `attachment://${filename}`;
  input.classList.remove('url-bad');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  showToast(`${file.name} sera envoye avec le message.`);
}

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
      if (e.dataTransfer.files?.length) handleLocalFile(e, e.dataTransfer.files[0]);
      return;
    }
    if (isInput) { setValue(e.target, url); return; }
    const label = window.prompt('Texte affiche pour ce lien cliquable ? (laisser vide pour coller le lien brut)', '');
    if (label === null) return;
    insertAtCursor(e.target, label.trim() ? `[${label.trim()}](${url})` : url);
    showToast(label.trim() ? 'Lien cliquable insere.' : 'Lien insere.');
  }, true);

  // Depose d'un FICHIER image : dans le generateur d'embed, il devient une
  // piece jointe du message (n°001) ; ailleurs, message explicatif.
  const handleLocalFile = (e, file) => {
    if (e.target.closest('.embed-builder-form') && file.type?.startsWith('image/')) {
      attachLocalImage(e.target, file);
      return true;
    }
    showToast("Fichier local : Discord a besoin d'un lien public ici. Poste l'image dans un salon Discord, puis clic droit > Copier le lien.", 'error');
    return true;
  };

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
      handleLocalFile(e, dt.files[0]);
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

// ---------- Raccourcis clavier (roadmap n°026) ----------
// Sequences "g puis lettre" (comme Gmail/GitHub) + "?" pour l'aide-memoire.
// Inactifs pendant la saisie dans un champ.
let shortcutPending = false;
let shortcutTimer = null;

function showShortcutHelp() {
  if (document.getElementById('shortcut-help-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'shortcut-help-overlay';
  overlay.innerHTML = `
    <div class="cmdk-box" role="dialog" aria-modal="true" aria-label="Raccourcis clavier" style="padding:18px 20px;">
      <h2 style="margin:0 0 12px; font-size:1rem;">⌨️ Raccourcis clavier</h2>
      <div class="shortcut-help-rows">
        <div><kbd>Ctrl</kbd>+<kbd>K</kbd> ou <kbd>/</kbd><span>Recherche globale (modules, salons, roles)</span></div>
        <div><kbd>g</kbd> puis <kbd>h</kbd><span>Accueil du serveur</span></div>
        <div><kbd>g</kbd> puis <kbd>s</kbd><span>Reveler le panneau des salons</span></div>
        <div><kbd>g</kbd> puis <kbd>r</kbd><span>Reveler le panneau des roles</span></div>
        <div><kbd>g</kbd> puis <kbd>e</kbd><span>Generateur d'embed</span></div>
        <div><kbd>g</kbd> puis <kbd>a</kbd><span>Logs d'audit</span></div>
        <div><kbd>?</kbd><span>Cette aide</span></div>
        <div><kbd>Echap</kbd><span>Fermer</span></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', close);
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
}

document.addEventListener('keydown', (e) => {
  if (e.target.matches?.('input, textarea, select, [contenteditable]')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (shortcutPending) {
    shortcutPending = false;
    clearTimeout(shortcutTimer);
    const gid = paletteCtx.guildId;
    if (!gid) return;
    const actions = {
      h: () => { currentPanelRef = null; panelNavStack.length = 0; withViewTransition(() => renderPreviewPage(gid)); },
      s: () => revealInSidebar('.dp-channel[data-channel]', '.dp-sidebar'),
      r: () => revealInSidebar('.dp-role-row[data-role]', '.dp-roles-panel'),
      e: () => withViewTransition(() => renderSettingsPanel(gid, 'embedbuilder')),
      a: () => withViewTransition(() => renderSettingsPanel(gid, 'auditlog')),
    };
    if (actions[e.key]) { e.preventDefault(); actions[e.key](); }
    return;
  }
  if (e.key === 'g') {
    shortcutPending = true;
    shortcutTimer = setTimeout(() => { shortcutPending = false; }, 1200);
    return;
  }
  if (e.key === '?') { e.preventDefault(); showShortcutHelp(); }
  // Raccourci "/" comme Discord (roadmap n°225) : dans une guilde -> recherche
  // globale (Ctrl+K), sur la liste des serveurs -> barre de recherche topbar.
  if (e.key === '/') {
    e.preventDefault();
    if (paletteCtx.guildId) openCommandPalette();
    else document.getElementById('search-box-toggle')?.click();
  }
});

// Pile de navigation entre modules (roadmap n°028) : "Retour" ramene au
// module precedent (utile apres un saut via Ctrl+K), sinon a l'accueil.
let currentPanelRef = null;
const panelNavStack = [];
// Position de scroll par panneau (roadmap n°217), restauree uniquement au
// retour (fromBack) : une navigation "en avant" doit toujours partir du haut.
const scrollPositions = new Map();

// ---------- Visite guidee au premier lancement (roadmap n°027) ----------
function showOnboarding() {
  if (document.getElementById('onboarding-overlay')) return;
  const steps = [
    { icon: '🗂️', title: "Tout part de l'accueil", text: 'Choisis une categorie puis un module : chaque outil du bot se configure en 2 clics. Etoile ☆ tes modules preferes pour les epingler en haut.' },
    { icon: '↔️', title: 'Salons et roles sur les bords', text: 'Survole le bord gauche pour les salons, le bord droit pour les roles. La punaise 📌 les garde ouverts. Glisse un salon ou un role au centre pour le configurer.' },
    { icon: '⌨️', title: 'Va plus vite', text: 'Ctrl+K ouvre la recherche globale (modules, salons, roles). Tape ? pour voir tous les raccourcis clavier.' },
  ];
  let step = 0;
  const overlay = document.createElement('div');
  overlay.id = 'onboarding-overlay';
  const finish = () => {
    try { localStorage.setItem('dsc-onboarded', '1'); } catch { /* stockage indisponible */ }
    overlay.remove();
  };
  const render = () => {
    const s = steps[step];
    overlay.innerHTML = `
      <div class="cmdk-box onboarding-box" role="dialog" aria-modal="true" aria-label="Visite guidee">
        <div class="onboarding-icon">${s.icon}</div>
        <h2>${s.title}</h2>
        <p class="muted">${s.text}</p>
        <div class="onboarding-dots" aria-hidden="true">${steps.map((_, i) => `<span class="${i === step ? 'active' : ''}"></span>`).join('')}</div>
        <div class="row" style="justify-content:space-between; margin-top:14px;">
          <button type="button" class="btn secondary" id="onboarding-skip">Passer</button>
          <button type="button" class="btn" id="onboarding-next">${step === steps.length - 1 ? "C'est parti !" : 'Suivant'}</button>
        </div>
      </div>`;
    overlay.querySelector('#onboarding-skip').addEventListener('click', finish);
    overlay.querySelector('#onboarding-next').addEventListener('click', () => {
      if (step === steps.length - 1) finish();
      else { step += 1; render(); }
    });
  };
  render();
  document.body.appendChild(overlay);
}

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
// Pre-remplissage de l'edition en masse apres un drop role->salon (n°016).
let permPrefill = null;

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

// Explications en francais de chaque permission au survol (roadmap n°269) :
// le libelle seul (PERMISSION_LABELS) ne dit pas toujours ce que la
// permission autorise concretement, surtout pour un admin peu technique.
const PERMISSION_DESCRIPTIONS = {
  CreateInstantInvite: 'Genere des liens d\'invitation pour faire rejoindre de nouveaux membres.',
  KickMembers: 'Retire un membre du serveur (il peut revenir avec une nouvelle invitation).',
  BanMembers: "Retire un membre et l'empeche de revenir tant qu'il n'est pas debanni.",
  Administrator: 'Contourne TOUTES les restrictions de permissions, y compris celles des salons. A reserver au staff de confiance absolu.',
  ManageChannels: 'Creer, modifier, supprimer des salons et categories, changer leurs permissions.',
  ManageGuild: "Modifier le nom, la region, les parametres generaux et l'apparence du serveur.",
  AddReactions: 'Ajouter de nouvelles reactions emoji sur les messages.',
  ViewAuditLog: "Consulter l'historique des actions de moderation et de configuration.",
  ViewChannel: 'Voir le salon dans la liste et lire son contenu.',
  SendMessages: 'Envoyer des messages texte dans le salon.',
  ManageMessages: "Supprimer ou epingler les messages des AUTRES membres.",
  EmbedLinks: 'Les liens colles se transforment automatiquement en aperçu enrichi.',
  AttachFiles: 'Envoyer des images, videos et autres fichiers.',
  ReadMessageHistory: "Voir les messages envoyes avant d'avoir rejoint ou d'etre connecte.",
  MentionEveryone: 'Utiliser @everyone, @here et mentionner tous les roles, meme non-mentionnables.',
  Connect: 'Rejoindre les salons vocaux.',
  Speak: 'Parler une fois connecte a un salon vocal (sans ca, coupe automatiquement).',
  MuteMembers: 'Couper le micro des autres membres en vocal, a distance.',
  DeafenMembers: "Couper l'audio des autres membres en vocal, a distance.",
  MoveMembers: "Deplacer un membre d'un salon vocal a un autre.",
  ChangeNickname: 'Modifier son propre pseudo sur le serveur.',
  ManageNicknames: 'Modifier le pseudo des AUTRES membres.',
  ManageRoles: "Creer des roles et gerer les permissions des roles positionnes EN DESSOUS du sien.",
  ManageWebhooks: 'Creer, modifier et supprimer les webhooks (integrations externes).',
  ModerateMembers: 'Reduire un membre au silence temporairement (timeout), sans le bannir.',
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
    // Mentions de role/salon avec leur vraie couleur (roadmap n°235) : le
    // texte est deja passe par escapeHtml juste au-dessus, <@&id> est donc
    // devenu &lt;@&amp;id&gt; a ce stade.
    html = html.replace(/&lt;@&amp;(\d+)&gt;/g, (_, roleId) => {
      const role = paletteCtx?.roles?.find((r) => r.id === roleId);
      if (!role) return '<span class="embed-mention-pill">@role</span>';
      return `<span class="embed-mention-pill" style="--mc:${intToHex(role.color)};">@${escapeHtml(role.name)}</span>`;
    });
    html = html.replace(/&lt;#(\d+)&gt;/g, (_, channelId) => {
      const ch = paletteCtx?.channels?.find((c) => c.id === channelId);
      return `<span class="embed-mention-pill embed-mention-channel">#${escapeHtml(ch?.name || 'salon')}</span>`;
    });
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

// Squelettes de chargement (roadmap n°055) : la forme suit le contenu
// attendu — 'list' pour des rangees, 'grid' pour des cartes, 'chart' pour
// un graphique, sinon des lignes de texte.
function skeletonHtml(variant = 3) {
  if (variant === 'list') {
    return `<div class="skeleton-block">${Array.from({ length: 6 }, () => '<div class="skeleton-line" style="height:34px; width:100%;"></div>').join('')}</div>`;
  }
  if (variant === 'grid') {
    return `<div class="skeleton-block skeleton-grid">${Array.from({ length: 6 }, () => '<div class="skeleton-line" style="height:78px;"></div>').join('')}</div>`;
  }
  if (variant === 'chart') {
    return '<div class="skeleton-block"><div class="skeleton-line" style="width:40%"></div><div class="skeleton-line" style="height:140px; width:100%;"></div><div class="skeleton-line" style="width:30%"></div></div>';
  }
  const lines = typeof variant === 'number' ? variant : 3;
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

// Onglets internes reels : .section-panel n'est visible que via la classe
// .active (voir style.css, un seul module affiche a la fois par design).
// `entries` = [[sectionId, label, icon?], ...] dans l'ordre d'apparition.
function quickJumpBarHtml(entries, pageKey = 'default') {
  return `
    <div class="dp-quickjump" role="tablist" aria-label="Sections" data-page-key="${pageKey}">
      ${entries.map(([sid, label, icon]) => `<button type="button" class="dp-quickjump-btn" role="tab" data-jump-to="${sid}">${icon ? `${icon} ` : ''}${escapeHtml(label)}</button>`).join('')}
    </div>`;
}
function activateSection(container, sid) {
  const target = document.getElementById(`section-${sid}`);
  if (!target) return null;
  container.querySelectorAll('.section-panel.active').forEach((p) => p.classList.remove('active'));
  target.classList.add('active');
  container.querySelectorAll('.dp-quickjump-btn.active').forEach((b) => b.classList.remove('active'));
  container.querySelector(`.dp-quickjump-btn[data-jump-to="${sid}"]`)?.classList.add('active');
  return target;
}
function wireQuickJump(container) {
  container.querySelectorAll('.dp-quickjump-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!activateSection(container, btn.dataset.jumpTo)) return;
      window.UISound?.select();
    });
  });
}

// Undo global (roadmap n°112) : la ligne disparait tout de suite, la
// suppression reelle ne part qu'apres le compte a rebours du toast (Annuler
// la restaure sans rien avoir supprime).
function undoableDelete(btn, label, doDelete) {
  const row = btn.closest('.row') || btn.parentElement;
  row.style.display = 'none';
  window.showUndoToast(label, {
    onUndo: () => { row.style.display = ''; },
    onExpire: async () => {
      try {
        await doDelete();
      } catch (err) {
        showToast(err.message, 'error');
        row.style.display = '';
      }
    },
  });
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

// Page "Nouveautes" (roadmap n°341) : changelog produit maintenu a la main,
// pas de contenu par serveur. Le plus recent en premier ; `id` sert a savoir
// si l'utilisateur a deja vu la derniere entree (badge topbar).
const CHANGELOG = [
  { id: '2026-07-17', date: '17 juillet 2026', title: 'Moderation et salons', items: ['Contestation de sanction par formulaire (DM avec bouton)', 'Garde-fou comptes recents (<7j) avec action automatique', 'Groupes de salons pliables dans la sidebar', 'Edition en masse des topics avec variables'] },
  { id: '2026-07-16', date: '16 juillet 2026', title: 'Economie et engagement', items: ['Loterie hebdomadaire automatique', 'Personnalisation du nom et de l\'emoji de la monnaie', 'Bonus de bienvenue configurable', 'Comparaison de deux membres (/compare)'] },
  { id: '2026-07-15', date: '15 juillet 2026', title: 'Tickets et statistiques', items: ['Historique des transactions economie', 'Priorite, tags et satisfaction sur les tickets', '8ball, pile-ou-face, /roll, /afk, /snipe', 'Top salons par messages, repartition des roles'] },
];

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
// Commandes eligibles a un cooldown (roadmap n°184) — miroir manuel de
// commandCooldowns.js EXEMPT_COMMANDS cote bot (les commandes staff/config
// y sont exclues, un cooldown dessus genant plus qu'autre chose).
const COOLDOWN_COMMANDS = [
  'reponse', 'poll', 'giveaway', 'giveaway-reroll', 'suggest', 'remind',
  'pay', 'ticket', 'rank', 'leaderboard', 'invites', 'shop',
];

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
  { parent: 'automatisations', section: 'autoreact', icon: '📌', label: 'Reactions automatiques', category: 'administration' },
  // Securite : sauvegarde, restauration, verrouillage d'urgence.
  { parent: 'securite', section: 'sec-export', icon: '💾', label: 'Export / Restauration', category: 'securite' },
  { parent: 'securite', section: 'sec-snapshots', icon: '📸', label: 'Snapshots automatiques', category: 'securite' },
  { parent: 'securite', section: 'sec-lockdown', icon: '🔒', label: 'Lockdown', category: 'securite' },
  { parent: 'securite', section: 'sec-copy-config', icon: '📋', label: 'Copier ma config', category: 'securite' },
  { parent: 'securite', section: 'sec-config-export', icon: '🧾', label: 'Configuration complete', category: 'securite' },
  { parent: 'securite', section: 'sec-webhook-scan', icon: '🔎', label: 'Scan des webhooks', category: 'securite' },
  { parent: 'securite', section: 'sec-trash', icon: '🗑️', label: 'Corbeille', category: 'securite' },
  { parent: 'securite', section: 'sec-purge', icon: '🧹', label: 'Purge de messages', category: 'securite' },
  { parent: 'securite', section: 'sec-autocleanup', icon: '🧽', label: 'Nettoyage programme', category: 'securite' },
  { parent: 'securite', section: 'sec-protected-ids', icon: '🛂', label: 'Liste blanche', category: 'securite' },
  { parent: 'securite', section: 'sec-maintenance', icon: '🚧', label: 'Mode maintenance', category: 'securite' },
  // Moderation : surveillance et gestion du comportement des membres.
  { parent: 'automatisations', section: 'cooldowns', icon: '⏳', label: 'Cooldowns commandes', category: 'moderation', since: '2026-07-17' },
  { parent: 'automatisations', section: 'automod', icon: '🚫', label: 'Auto-moderation', category: 'moderation' },
  { parent: 'automatisations', section: 'tickets', icon: '🎫', label: 'Tickets', category: 'moderation' },
  { parent: 'auditlog', icon: '📋', label: "Logs d'audit", category: 'moderation' },
  { parent: 'automatisations', section: 'suggestions', icon: '💡', label: 'Suggestions', category: 'moderation' },
  { parent: 'automatisations', section: 'signalements', icon: '🚩', label: 'Signalements', category: 'moderation' },
  { parent: 'automatisations', section: 'contestations', icon: '⚖️', label: 'Contestations de sanction', category: 'moderation' },
  // Integrations : connecter des services/bots externes.
  { parent: 'automatisations', section: 'bots', icon: '🧩', label: 'Bots complementaires', category: 'integrations' },
  { parent: 'automatisations', section: 'webhooks', icon: '🔗', label: 'Webhooks sortants', category: 'integrations' },
  { parent: 'automatisations', section: 'notifications', icon: '🔔', label: 'Notifications push', category: 'integrations', since: '2026-07-17' },
  { parent: 'automatisations', section: 'rss', icon: '📰', label: 'Flux RSS', category: 'integrations' },
  // Creation : construire du contenu (salons, textes, structure).
  { parent: 'creator', icon: '🏗️', label: 'Createur salons & roles', category: 'creation' },
  { parent: 'jeux', section: 'game-catalog', icon: '📚', label: 'Catalogue de jeux', category: 'creation' },
  { parent: 'jeux', section: 'game-reaction', icon: '🎭', label: 'Roles-reaction', category: 'creation' },
  { parent: 'automatisations', section: 'annonces', icon: '📅', label: 'Annonces programmees', category: 'creation' },
  { parent: 'automatisations', section: 'regles', icon: '⚡', label: 'Regles si → alors', category: 'administration' },
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
  { parent: 'stats', section: 'stats-voice-channels', icon: '🔊', label: 'Vocal par salon', category: 'statistiques' },
  { parent: 'stats', section: 'stats-top-channels', icon: '🔤', label: 'Top salons', category: 'statistiques' },
  { parent: 'stats', section: 'stats-role-distribution', icon: '🥧', label: 'Repartition roles', category: 'statistiques' },
  { parent: 'stats', section: 'stats-boosts', icon: '🚀', label: 'Boosts', category: 'statistiques' },
  { parent: 'stats', section: 'stats-participation', icon: '🗳️', label: 'Participation', category: 'statistiques' },
  { parent: 'stats', section: 'stats-misc', icon: 'ℹ️', label: 'Autres indicateurs', category: 'statistiques' },
  { parent: 'botstatus', icon: '🤖', label: 'Statut du bot', category: 'statistiques' },
  { parent: 'memberlookup', section: 'inactive-members', icon: '💤', label: 'Membres inactifs', category: 'statistiques' },
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

// Libelles francais des outils IA (affiches pendant le streaming n°066 et
// dans l'historique de conversation).
const AI_TOOL_LABELS = {
  list_channels: 'Lecture des salons',
  list_roles: 'Lecture des roles',
  create_channel: 'Creation du salon',
  rename_channel: 'Renommage du salon',
  delete_channel: 'Suppression du salon',
  create_category: 'Creation de la categorie',
  delete_category: 'Suppression de la categorie',
  create_role: 'Creation du role',
  rename_role: 'Renommage du role',
  set_role_color: 'Changement de couleur du role',
  delete_role: 'Suppression du role',
  get_module_config: 'Lecture de la configuration',
  set_module_config: 'Modification de la configuration',
  generate_embed: 'Generation de l\'embed',
};

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
      html += `<div class="dp-ai-tool-note">🔧 ${escapeHtml(AI_TOOL_LABELS[m.toolCalls[0].name] || m.toolCalls[0].name)}...</div>`;
    } else if (m.role === 'tool' && m.result?.error) {
      html += `<div class="dp-ai-tool-note">⚠️ ${escapeHtml(m.result.error)}</div>`;
    } else if (m.role === 'tool' && m.name === 'generate_embed' && m.result?.embed) {
      html += `<div class="dp-ai-tool-note">✅ Embed genere — <button type="button" class="dp-chat-copy" data-load-ai-embed="${idx}">📨 Charger dans le generateur</button></div>`;
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

// Groupes de favoris nommes (roadmap n°220) : en plus de l'etoile "Favoris"
// existante (inchangee), l'utilisateur peut creer ses propres groupes
// nommes (« Quotidien », « Evenements »...) avec une selection de modules.
function getFavGroups() {
  try { return JSON.parse(localStorage.getItem('dsc-fav-groups') || '[]'); } catch { return []; }
}
function saveFavGroups(groups) {
  try { localStorage.setItem('dsc-fav-groups', JSON.stringify(groups)); } catch { /* stockage plein */ }
}

// Badge "Nouveau" (roadmap n°221) : un module reste marque recent 21 jours
// apres son ajout (champ `since`, format YYYY-MM-DD), puis redevient un
// module normal sans intervention manuelle.
const NEW_MODULE_DAYS = 21;
function isRecentModule(m) {
  if (!m.since) return false;
  return (Date.now() - new Date(`${m.since}T00:00:00Z`).getTime()) < NEW_MODULE_DAYS * 86400000;
}

function homeModuleCardHtml(m) {
  const key = favModuleKey(m);
  const isFav = getFavModuleKeys().includes(key);
  return `
    <button type="button" class="dp-action-card" data-goto-settings="${m.parent}"${m.section ? ` data-goto-settings-section="${m.section}"` : ''}>
      <span class="dp-fav-star${isFav ? ' active' : ''}" role="button" tabindex="0" data-fav-key="${key}" title="${isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}" aria-label="${isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'} : ${escapeHtml(m.label)}">${isFav ? '★' : '☆'}</span>
      ${isRecentModule(m) ? '<span class="dp-new-badge" title="Ajoute recemment">Nouveau</span>' : ''}
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

// Checklist de configuration (roadmap n°169) : 8 verifications basees sur
// la config deja chargee, avec lien direct vers le module concerne.
const CONFIG_CHECKLIST = [
  { label: 'Salon de bienvenue', done: (c) => Boolean(c?.arrivalDepartureChannelId), goto: ['creator', ''] },
  { label: 'Journal de moderation', done: (c) => Boolean(c?.modLogChannelId), goto: ['creator', ''] },
  { label: 'Salon annonces', done: (c) => Boolean(c?.announceChannelId), goto: ['creator', ''] },
  { label: 'Salon suggestions', done: (c) => Boolean(c?.suggestionChannelId), goto: ['creator', ''] },
  { label: 'Salon avis (tickets)', done: (c) => Boolean(c?.reviewChannelId), goto: ['creator', ''] },
  { label: 'Role automatique a l\'arrivee', done: (c) => Boolean(c?.autoRoleId), goto: ['automatisations', ''] },
  { label: 'Une regle si → alors', done: (c) => (c?.autoRules || []).length > 0, goto: ['automatisations', 'regles'] },
  { label: 'Twitch ou calendrier lie', done: (c) => Boolean(c?.twitchBroadcasterLogin || c?.calendarToken), goto: ['automatisations', 'streamers'] },
];

function configChecklistHtml(config) {
  if (localStorage.getItem('dsc-checklist-hidden') === '1') return '';
  const doneCount = CONFIG_CHECKLIST.filter((item) => item.done(config)).length;
  if (doneCount === CONFIG_CHECKLIST.length) return '';
  const todo = CONFIG_CHECKLIST.filter((item) => !item.done(config)).slice(0, 4);
  return `
    <div class="dp-checklist">
      <div class="dp-checklist-head">
        <span>🚀 Configuration du serveur — ${doneCount}/${CONFIG_CHECKLIST.length}</span>
        <button type="button" class="dp-checklist-hide" id="dp-checklist-hide" title="Masquer definitivement" aria-label="Masquer la checklist">✕</button>
      </div>
      <div class="bar" style="height:6px; background:var(--bg-input); border-radius:999px; overflow:hidden; margin:6px 0 8px;"><i style="display:block; height:100%; width:${Math.round((doneCount / CONFIG_CHECKLIST.length) * 100)}%; background:var(--success); border-radius:999px;"></i></div>
      ${todo.map((item) => `<button type="button" class="dp-checklist-item" data-goto-settings="${item.goto[0]}" ${item.goto[1] ? `data-goto-settings-section="${item.goto[1]}"` : ''}>○ ${escapeHtml(item.label)} →</button>`).join('')}
    </div>`;
}

// Suggestions de prompts contextuelles (roadmap n°134) : puces cliquables
// sous l'input, visibles seulement avant le premier message pour ne pas
// alourdir une conversation deja en cours. Melange de prompts generiques et
// de suggestions liees a ce qui manque dans la config du serveur.
function aiPromptSuggestions(config) {
  const suggestions = [];
  if (!config?.autoRoleId) suggestions.push('Configure un role automatique pour les nouveaux membres');
  if (!config?.arrivalDepartureChannelId) suggestions.push('Cree un salon et un message de bienvenue');
  if (!config?.modLogChannelId) suggestions.push('Mets en place un salon de logs de moderation');
  suggestions.push('Resume la configuration actuelle de mon serveur');
  suggestions.push('Quels salons me manquent pour un serveur gaming ?');
  return suggestions.slice(0, 4);
}

function aiHomeHtml(guild, config) {
  return `
    <div class="dp-chat" id="dp-ai-chat">
      <div class="dp-chat-msg bot">
        <div class="dp-chat-avatar">${botAvatarHtml()}</div>
        <div class="dp-chat-bubble">
          <div class="dp-chat-author">ServeurCreator Bot</div>
          <div class="dp-chat-text">Salut, je suis le bot de configuration de ${escapeHtml(guild?.name || 'ton serveur')} ! Glisse un salon, une categorie ou un role ici pour le configurer, ou choisis une categorie d'outils ci-dessous.</div>
          ${configChecklistHtml(config)}
          <div id="dp-activity-feed"></div>
          ${(() => {
    const favs = getFavModuleKeys()
      .map((key) => HOME_MODULES.find((m) => favModuleKey(m) === key))
      .filter(Boolean);
    return favs.length
      ? `<p class="dp-block-title" style="margin:12px 0 6px;">⭐ Favoris</p><div class="dp-action-grid">${favs.map(homeModuleCardHtml).join('')}</div>`
      : '';
  })()}
          ${getFavGroups().map((g) => {
    const mods = (g.keys || []).map((key) => HOME_MODULES.find((m) => favModuleKey(m) === key)).filter(Boolean);
    return `
            <div class="dp-fav-group" data-group-id="${g.id}">
              <p class="dp-block-title" style="margin:12px 0 6px;">
                <span>📌 ${escapeHtml(g.name)}</span>
                <button type="button" class="dp-fav-group-delete" data-group-id="${g.id}" title="Supprimer ce groupe" aria-label="Supprimer le groupe ${escapeHtml(g.name)}">🗑️</button>
              </p>
              ${mods.length ? `<div class="dp-action-grid">${mods.map(homeModuleCardHtml).join('')}</div>` : '<p class="muted" style="font-size:0.8rem;">Groupe vide.</p>'}
            </div>`;
  }).join('')}
          <button type="button" class="btn secondary" id="dp-new-fav-group" style="margin:8px 0;">➕ Nouveau groupe de favoris</button>
          <p class="dp-block-title" style="margin:12px 0 6px;">Categories</p>
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
          <button type="button" class="btn secondary" id="dp-ai-analyze-btn" style="margin-top:10px;">🔍 Analyser mon serveur</button>
        </div>
      </div>
      <div id="dp-ai-tail">${aiConversationHtml()}</div>
    </div>
    ${aiConversation.length ? '' : `
    <details class="dp-ai-suggestions" id="dp-ai-suggestions">
      <summary>💡 Suggestions de prompts</summary>
      <div class="dp-ai-suggestions-list">
        ${aiPromptSuggestions(config).map((s) => `<button type="button" class="dp-ai-suggestion-chip" data-prompt="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('')}
      </div>
    </details>`}
    <form class="dp-chat-input-bar" id="dp-ai-form">
      ${aiConversation.length ? '<button type="button" class="btn secondary" id="dp-ai-reset" title="Nouvelle conversation" aria-label="Nouvelle conversation">🔄</button>' : ''}
      <input type="text" id="dp-ai-input" placeholder="Ecris a l'assistant..." maxlength="1000" autocomplete="off" />
      <button type="submit" class="btn" id="dp-ai-send">Envoyer</button>
    </form>
    <p class="muted" id="dp-ai-cost" style="font-size:0.68rem; margin:2px 16px 0; text-align:right;"></p>
  `;
}

function wireAiHome(guildId, channels, rolesSorted, members) {
  const form = document.getElementById('dp-ai-form');
  const input = document.getElementById('dp-ai-input');
  const sendBtn = document.getElementById('dp-ai-send');
  const chatEl = document.getElementById('dp-ai-chat');

  // Fil d'activite du serveur (roadmap n°223) : 5 derniers evenements de
  // l'audit log, charges a part pour ne pas ralentir l'affichage initial de
  // l'accueil (comme la banniere bot hors-ligne un peu plus bas).
  const feedEl = document.getElementById('dp-activity-feed');
  if (feedEl) {
    Api.auditLog(guildId).then((logs) => {
      const recent = (logs || []).slice(0, 5);
      if (!recent.length) return;
      feedEl.innerHTML = `
        <details class="dp-activity-details">
          <summary class="dp-block-title">🕓 Activite recente</summary>
          <div class="dp-activity-list">
            ${recent.map((entry) => `
              <div class="dp-activity-row">
                <span class="dp-activity-text"><strong>${escapeHtml(entry.title)}</strong> — ${resolveMentions(entry.description, members, rolesSorted)}</span>
                <span class="dp-activity-time muted">${new Date(entry.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              </div>`).join('')}
          </div>
        </details>`;
    }).catch(() => {});
  }

  document.getElementById('dp-ai-reset')?.addEventListener('click', () => {
    if (!window.confirm('Demarrer une nouvelle conversation avec l\'assistant ? L\'historique actuel sera perdu.')) return;
    aiConversation = [];
    aiPendingConfirmation = null;
    Api.clearAiHistory(guildId).catch(() => {});
    withViewTransition(() => renderPreviewPage(guildId));
  });

  // Analyse du serveur par l'IA (roadmap n°251) : prompt fixe reutilisant les
  // outils list_channels/list_roles/get_module_config deja disponibles.
  document.getElementById('dp-ai-analyze-btn')?.addEventListener('click', () => {
    input.value = 'Analyse la structure, les permissions et la configuration de mon serveur, puis donne-moi un rapport concis des points a ameliorer.';
    form.requestSubmit();
  });

  document.querySelectorAll('.dp-ai-suggestion-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      input.value = chip.dataset.prompt;
      form.requestSubmit();
    });
  });

  // Groupes de favoris nommes (roadmap n°220).
  document.querySelectorAll('.dp-fav-group-delete').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const groups = getFavGroups().filter((g) => g.id !== btn.dataset.groupId);
      saveFavGroups(groups);
      withViewTransition(() => renderPreviewPage(guildId));
    });
  });
  document.getElementById('dp-new-fav-group')?.addEventListener('click', () => {
    const existing = document.getElementById('dp-new-fav-group-pop');
    if (existing) { existing.remove(); return; }
    const pop = document.createElement('div');
    pop.id = 'dp-new-fav-group-pop';
    pop.className = 'dp-modal-pop';
    pop.innerHTML = `
      <div class="dp-modal-pop-inner">
        <p class="dp-block-title" style="margin:0 0 8px;">➕ Nouveau groupe de favoris</p>
        <label for="new-fav-group-name">Nom du groupe</label>
        <input type="text" id="new-fav-group-name" placeholder="Ex : Quotidien, Evenements..." maxlength="40" />
        <label style="margin-top:10px;">Modules a inclure</label>
        <div style="max-height:240px; overflow-y:auto; margin-top:6px;">
          ${HOME_MODULES.map((m) => `
            <label class="dp-toggle-row" style="padding:6px 10px; margin-top:4px;">
              <span>${m.icon} ${escapeHtml(m.label)}</span>
              <input type="checkbox" class="new-fav-group-module" value="${favModuleKey(m)}" />
            </label>`).join('')}
        </div>
        <div class="row" style="justify-content:flex-end; gap:8px; margin-top:12px;">
          <button type="button" class="btn secondary" id="new-fav-group-cancel">Annuler</button>
          <button type="button" class="btn" id="new-fav-group-confirm">Creer</button>
        </div>
      </div>`;
    document.body.appendChild(pop);
    pop.querySelector('#new-fav-group-cancel').addEventListener('click', () => pop.remove());
    pop.addEventListener('click', (e) => { if (e.target === pop) pop.remove(); });
    pop.querySelector('#new-fav-group-confirm').addEventListener('click', () => {
      const name = pop.querySelector('#new-fav-group-name').value.trim();
      if (!name) { showToast('Nom du groupe requis.', 'error'); return; }
      const keys = [...pop.querySelectorAll('.new-fav-group-module:checked')].map((el) => el.value);
      const groups = getFavGroups();
      groups.push({ id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`, name, keys });
      saveFavGroups(groups);
      pop.remove();
      withViewTransition(() => renderPreviewPage(guildId));
    });
  });

  function refreshTail() {
    document.getElementById('dp-ai-tail').innerHTML = aiConversationHtml();
    input.disabled = aiBusy;
    sendBtn.disabled = aiBusy;
    // Cout estime de la conversation (roadmap n°196) : ~4 caracteres par
    // token — ordre de grandeur pour la cle API du serveur, pas une facture.
    const costEl = document.getElementById('dp-ai-cost');
    if (costEl) {
      const totalChars = aiConversation.reduce((sum, m) => sum + (m.content || '').length, 0);
      const tokens = Math.round(totalChars / 4);
      costEl.textContent = tokens > 0 ? `Contexte : ~${tokens.toLocaleString('fr-FR')} tokens envoyes a chaque tour` : '';
    }
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
    // Embed genere par l'IA (roadmap n°249) : charge dans le generateur via
    // une variable globale consommee au chargement de renderEmbedBuilderPage.
    document.querySelectorAll('[data-load-ai-embed]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const msg = aiConversation[Number(btn.dataset.loadAiEmbed)];
        if (!msg?.result?.embed) return;
        window.__aiGeneratedEmbed = msg.result.embed;
        renderSettingsPanel(guildId, 'embedbuilder');
        showToast('Embed charge dans le generateur.');
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
      Api.saveAiHistory(guildId, aiConversation).catch(() => {});
      await renderPreviewPage(guildId);
    } catch (err) {
      showToast(err.message, 'error');
      aiBusy = false;
      refreshTail();
    }
  }

  // Affichage streaming (roadmap n°066) : la bulle "..." devient une bulle
  // de texte vivante remplie delta par delta ; les outils en cours
  // s'affichent en note. L'etat final (event done) re-rend tout proprement.
  function liveStreamEl() {
    const existing = document.getElementById('dp-ai-stream');
    if (existing) return existing;
    const typing = document.getElementById('dp-ai-tail')?.querySelector('.dp-chat-typing');
    const bubble = typing?.closest('.dp-chat-bubble');
    if (!bubble) return null;
    bubble.innerHTML = '<div class="dp-chat-author">ServeurCreator Bot</div><div id="dp-ai-stream"></div>';
    return document.getElementById('dp-ai-stream');
  }

  function appendAiDelta(text) {
    const el = liveStreamEl();
    if (!el) return;
    let block = el.lastElementChild;
    if (!block || !block.classList.contains('dp-chat-text')) {
      block = document.createElement('div');
      block.className = 'dp-chat-text';
      el.appendChild(block);
    }
    block.textContent += text;
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  // Progression des actions groupees (roadmap n°133) : chaque outil execute
  // dans le tour courant est numerote, le compteur se voit en direct.
  let aiToolCount = 0;
  function appendAiTool(name) {
    const el = liveStreamEl();
    if (!el) return;
    aiToolCount += 1;
    const note = document.createElement('div');
    note.className = 'dp-ai-tool-note';
    note.textContent = `🔧 Action ${aiToolCount} — ${AI_TOOL_LABELS[name] || name}...`;
    el.appendChild(note);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || aiBusy) return;
    input.value = '';
    aiConversation.push({ role: 'user', content: text });
    aiBusy = true;
    aiToolCount = 0;
    document.getElementById('dp-ai-suggestions')?.remove();
    refreshTail();
    try {
      const result = await Api.aiChatStream(guildId, aiConversation.slice(0, -1), text, {
        onDelta: appendAiDelta,
        onTool: appendAiTool,
      });
      aiConversation = result.messages;
      aiPendingConfirmation = result.pendingConfirmation
        ? { ...result.pendingConfirmation, label: resolveAiActionLabel(result.pendingConfirmation, channels, rolesSorted) }
        : null;
      aiBusy = false;
      Api.saveAiHistory(guildId, aiConversation).catch(() => {});
      await renderPreviewPage(guildId);
    } catch (err) {
      aiConversation.pop();
      aiBusy = false;
      showToast(err.message, 'error');
      refreshTail();
      // Reessayer en un clic (roadmap n°136) : rejoue le message echoue.
      const tail = document.getElementById('dp-ai-tail');
      if (tail) {
        const note = document.createElement('div');
        note.className = 'dp-ai-tool-note';
        note.innerHTML = '⚠️ Message non envoye. <button type="button" class="btn secondary" id="dp-ai-retry">Reessayer</button>';
        tail.appendChild(note);
        document.getElementById('dp-ai-retry').addEventListener('click', () => {
          note.remove();
          input.value = text;
          form.requestSubmit();
        });
      }
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
    // Conversation persistee (roadmap n°137) : recharge le fil sauvegarde
    // cote KV pour ce serveur, puis re-rend la queue du chat si toujours vide.
    Api.aiHistory(id).then((h) => {
      if (h?.messages?.length && !aiConversation.length && aiConversationGuildId === id) {
        aiConversation = h.messages;
        const tail = document.getElementById('dp-ai-tail');
        if (tail) tail.innerHTML = aiConversationHtml();
      }
    }).catch(() => { /* hors-ligne ou viewer : tant pis */ });
  }

  const categories = channels.filter((c) => c.type === 4).sort((a, b) => a.position - b.position);
  const uncategorized = channels.filter((c) => c.type !== 4 && !c.parent_id);
  // Icone personnalisee par salon (roadmap n°254), remplace l'icone
  // generique (#, 🔊) quand elle est configuree.
  const channelEmojis = config?.channelEmojis || {};
  const channelIcon = (c) => channelEmojis[c.id] || (c.type === 2 ? '🔊' : c.type === 4 ? '' : '#');

  // Badges d'etat (roadmap n°141) : NSFW, slowmode et prive (deny
  // VIEW_CHANNEL sur @everyone = guildId) visibles directement en sidebar.
  const channelBadges = (c) => {
    const badges = [];
    if (c.nsfw) badges.push('<span class="dp-ch-badge nsfw" title="Salon NSFW">18+</span>');
    if (c.rate_limit_per_user > 0) badges.push(`<span class="dp-ch-badge" title="Slowmode : ${c.rate_limit_per_user}s entre chaque message">🐌</span>`);
    const everyone = (c.permission_overwrites || []).find((o) => o.id === id);
    if (everyone && (BigInt(everyone.deny || 0) & 1024n) === 1024n) badges.push('<span class="dp-ch-badge" title="Salon prive (invisible pour @everyone)">🔒</span>');
    // Overwrites cibles sur un MEMBRE precis (type 1, vs 0 = role) sont
    // souvent des exceptions ponctuelles oubliees (roadmap n°267) : plus
    // difficiles a auditer qu'une permission par role, d'ou le signalement.
    const memberOverwrites = (c.permission_overwrites || []).filter((o) => o.type === 1).length;
    if (memberOverwrites > 0) badges.push(`<span class="dp-ch-badge" title="${memberOverwrites} permission(s) ciblant un membre precis (pas un role) — a verifier">👤${memberOverwrites}</span>`);
    // Salon mort (roadmap n°263) : 0 message depuis 30j, deduit du snowflake
    // du dernier message (ou de la creation du salon si jamais utilise) —
    // aucun appel reseau supplementaire necessaire.
    if (c.type === 0) {
      const lastActivityId = c.last_message_id || c.id;
      const lastActivityAt = Number((BigInt(lastActivityId) >> 22n) + 1420070400000n);
      const daysSince = Math.floor((Date.now() - lastActivityAt) / 86400000);
      if (daysSince >= 30) badges.push(`<span class="dp-ch-badge dead" title="Aucun message depuis ${daysSince} jours — envisager l'archivage">💀 ${daysSince}j</span>`);
    }
    return badges.join('');
  };

  // Salon favori personnel (roadmap n°581) : mise en avant visuelle locale
  // (localStorage, par navigateur), n'affecte jamais l'ordre reel Discord —
  // plus sur que de l'integrer au drag&drop des categories existant.
  const pinnedChannels = new Set(JSON.parse(localStorage.getItem(`dsc-pinned-channels-${id}`) || '[]'));
  // Verrouillage de position (roadmap n°257) : reglage serveur (pas
  // localStorage comme les favoris) — empeche le drag&drop de ce salon,
  // visible et modifiable par tout le staff.
  const lockedChannels = new Set(config?.channelPositionLocked || []);
  // Groupes de salons pliables (roadmap n°253) : etat replie/deplie
  // persiste par navigateur (localStorage, comme les favoris), pour ne
  // pas perdre l'affichage souhaite a chaque rechargement du dashboard.
  const collapsedCategories = new Set(JSON.parse(localStorage.getItem(`dsc-collapsed-categories-${id}`) || '[]'));
  const channelRow = (c) => `
    <div class="dp-channel${pinnedChannels.has(c.id) ? ' pinned' : ''}" draggable="${lockedChannels.has(c.id) ? 'false' : 'true'}" tabindex="0" role="button" aria-label="Salon ${escapeHtml(c.name)} (Alt+fleches pour reordonner)" data-channel="${c.id}" data-name="${escapeHtml(c.name)}" data-type="${c.type}">
      <span class="hash">${channelIcon(c)}</span> <span class="dp-channel-name">${escapeHtml(c.name)}</span>${channelBadges(c)}
      <button type="button" class="dp-channel-pin-btn" data-channel-pin="${c.id}" title="${pinnedChannels.has(c.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}" aria-label="${pinnedChannels.has(c.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'} : ${escapeHtml(c.name)}">${pinnedChannels.has(c.id) ? '★' : '☆'}</button>
      <button type="button" class="dp-channel-lock-btn${lockedChannels.has(c.id) ? ' locked' : ''}" data-channel-lock="${c.id}" title="${lockedChannels.has(c.id) ? 'Deverrouiller la position' : 'Verrouiller la position (empeche le glisser-deposer)'}" aria-label="${lockedChannels.has(c.id) ? 'Deverrouiller' : 'Verrouiller'} la position de ${escapeHtml(c.name)}">${lockedChannels.has(c.id) ? '🔒' : '🔓'}</button>
      <button type="button" class="dp-channel-emoji-btn" data-channel-emoji="${c.id}" title="Definir une icone personnalisee" aria-label="Definir une icone personnalisee pour ${escapeHtml(c.name)}">🏷️</button>
      <button type="button" class="dp-copy-id-btn" data-copy-id="${c.id}" title="Copier l'ID du salon" aria-label="Copier l'ID du salon ${escapeHtml(c.name)}">📋</button>
    </div>`;

  const categoryBlock = (cat) => {
    const children = channels.filter((c) => c.parent_id === cat.id).sort((a, b) => a.position - b.position);
    const isCollapsed = collapsedCategories.has(cat.id);
    return `
      <div class="dp-category${isCollapsed ? ' collapsed' : ''}" data-cat="${cat.id}" draggable="true" tabindex="0" role="button" aria-expanded="${!isCollapsed}" aria-label="Categorie ${escapeHtml(cat.name)}" data-drag-type="category" data-drag-name="${escapeHtml(cat.name)}">
        <span class="chevron">▾</span>
        <span class="dp-category-name">${escapeHtml(cat.name)}</span>
        <span class="dp-category-count" title="${children.length} salon(s)">${children.length}</span>
        <button type="button" class="dp-category-sort dp-category-duplicate" data-cat-duplicate="${cat.id}" data-cat-name="${escapeHtml(cat.name)}" title="Dupliquer la categorie et ses salons" aria-label="Dupliquer la categorie ${escapeHtml(cat.name)}">⧉</button>
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
            <button type="button" class="dp-server-switch" id="dp-server-switch" title="Changer de serveur" aria-haspopup="menu" aria-expanded="false">
              <span class="name">${escapeHtml(guild?.name || 'Serveur')}</span>
              <span class="caret">▾</span>
            </button>
            <button type="button" class="dp-pin-btn" id="dp-pin-left" title="Epingler le panneau (toujours visible)" aria-pressed="false">📌</button>
            <div class="dp-server-menu" id="dp-server-menu" role="menu" hidden></div>
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
          ${aiHomeHtml(guild, config)}
        </div>
        <div class="dp-roles-panel">
          <div class="dp-roles-header${rolesSorted.length >= 230 ? ' near-limit' : ''}" title="${rolesSorted.length >= 230 ? 'Limite Discord : 250 roles par serveur' : ''}">
            <span style="flex:1;">Roles — ${rolesSorted.length}</span>
            <button type="button" class="dp-pin-btn" id="dp-roles-sort-members" data-sort-mode="default" title="Trier par nombre de membres" style="opacity:1;">🔢</button>
            <button type="button" class="dp-pin-btn" id="dp-pin-right" title="Epingler le panneau (toujours visible)" aria-pressed="false">📌</button>
          </div>
          <div class="dp-sidebar-search">
            <input type="text" id="dp-role-search" placeholder="🔎 Filtrer les roles..." aria-label="Filtrer les roles" autocomplete="off" />
          </div>
          <div class="dp-roles-list">${rolesSorted.map((r) => roleRowHtml(r, members)).join('')}</div>
        </div>
        <button type="button" class="dp-drawer-btn left" id="dp-drawer-left" aria-label="Ouvrir le panneau des salons">☰</button>
        <button type="button" class="dp-drawer-btn right" id="dp-drawer-right" aria-label="Ouvrir le panneau des roles">🏷️</button>
        <button type="button" class="dp-quickcreate-fab" id="dp-quickcreate-fab" aria-haspopup="true" aria-expanded="false" aria-label="Creation rapide">➕</button>
        <div class="dp-quickcreate-menu" id="dp-quickcreate-menu" hidden>
          <p class="dp-quickcreate-title">Creation rapide</p>
          <div class="dp-quickcreate-row">
            <input type="text" id="dp-quickcreate-channel-name" placeholder="Nom du salon" maxlength="80" aria-label="Nom du nouveau salon" />
            <button type="button" id="dp-quickcreate-channel-btn" aria-label="Creer le salon">➕</button>
          </div>
          <div class="dp-quickcreate-row">
            <input type="text" id="dp-quickcreate-category-name" placeholder="Nom de la categorie" maxlength="80" aria-label="Nom de la nouvelle categorie" />
            <button type="button" id="dp-quickcreate-category-btn" aria-label="Creer la categorie">➕</button>
          </div>
        </div>
      </div>
    </div>
  `;

  wireAiHome(id, channels, rolesSorted, members);
  // Les cartes favoris de l'accueil (n°021) vivent hors de la grille de
  // modules : cablage direct.
  wireHomeModuleCards(document.getElementById('dp-ai-chat'));

  // Checklist de configuration (roadmap n°169) : masquage definitif.
  document.getElementById('dp-checklist-hide')?.addEventListener('click', (e) => {
    e.stopPropagation();
    localStorage.setItem('dsc-checklist-hidden', '1');
    e.currentTarget.closest('.dp-checklist')?.remove();
  });

  // Debounce (roadmap n°054) : le surlignage re-rend chaque ligne, inutile
  // de le faire a chaque frappe.
  const debounce = (fn, ms = 140) => {
    let timer = null;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  };

  // Recherche tolerante (roadmap n°139) : correspondance exacte OU sous-
  // sequence (les lettres tapees apparaissent dans l'ordre), ce qui tolere
  // les omissions ("anonces" trouve "annonces").
  const fuzzyMatch = (name, q) => {
    if (name.includes(q)) return true;
    let i = 0;
    for (const ch of name) {
      if (ch === q[i]) i += 1;
      if (i === q.length) return true;
    }
    return false;
  };

  document.getElementById('dp-channel-search').addEventListener('input', debounce((e) => {
    const q = e.target.value.trim().toLowerCase();
    app.querySelectorAll('.dp-channel[data-channel]').forEach((chEl) => {
      chEl.classList.toggle('dp-filtered-out', Boolean(q) && !fuzzyMatch((chEl.dataset.name || '').toLowerCase(), q));
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
      row.classList.toggle('dp-filtered-out', Boolean(q) && !fuzzyMatch((row.dataset.roleName || '').toLowerCase(), q));
      const nameEl = row.querySelector('.dp-role-name');
      if (nameEl) nameEl.innerHTML = highlightMatch(row.dataset.roleName || '', q);
    });
  }));

  app.querySelectorAll('.dp-category').forEach((catEl) => {
    const toggle = () => {
      catEl.classList.toggle('collapsed');
      catEl.setAttribute('aria-expanded', String(!catEl.classList.contains('collapsed')));
      const storageKey = `dsc-collapsed-categories-${id}`;
      const collapsed = new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'));
      const catId = catEl.dataset.cat;
      if (catEl.classList.contains('collapsed')) collapsed.add(catId); else collapsed.delete(catId);
      localStorage.setItem(storageKey, JSON.stringify([...collapsed]));
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

  // Reorganisation des categories par glisser-deposer (roadmap n°140) : une
  // categorie deplacee entraine avec elle son bloc de salons (.dp-channels,
  // toujours le frere DOM juste apres son en-tete .dp-category).
  async function persistCategoryOrder(list) {
    const orderedIds = [...list.querySelectorAll('.dp-category[data-cat]')].map((el) => el.dataset.cat);
    const positions = orderedIds.map((cid, idx) => ({ id: cid, position: idx }));
    try {
      await Api.setChannelPositions(id, positions);
      showToast('Ordre des categories mis a jour.');
    } catch (err) {
      showToast(err.message, 'error');
      await renderPreviewPage(id);
    }
  }

  app.querySelectorAll('.dp-category[draggable="true"]').forEach((catEl) => {
    catEl.addEventListener('dragstart', (e) => {
      catEl.classList.add('dragging');
      e.dataTransfer.setData('text/plain', catEl.dataset.cat);
      e.dataTransfer.effectAllowed = 'move';
      e.stopPropagation();
    });
    catEl.addEventListener('dragover', (e) => {
      const draggingCat = app.querySelector('.dp-category.dragging');
      if (!draggingCat || draggingCat === catEl) return;
      const list = catEl.parentElement;
      if (draggingCat.parentElement !== list) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = catEl.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      const insertBeforeNode = before ? catEl : catEl.nextElementSibling?.nextElementSibling || null;
      if (insertBeforeNode === draggingCat || insertBeforeNode === draggingCat.nextElementSibling) return;
      animateReorder(list, '.dp-category[data-cat]', () => {
        const draggingChannels = draggingCat.nextElementSibling;
        list.insertBefore(draggingCat, insertBeforeNode);
        list.insertBefore(draggingChannels, draggingCat.nextSibling);
      });
    });
    catEl.addEventListener('dragend', async () => {
      catEl.classList.remove('dragging');
      await persistCategoryOrder(catEl.parentElement);
    });
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

  // Tri des roles : ordre Discord -> nombre de membres (n°197) -> vue palette
  // par teinte de couleur (n°262) -> retour a l'ordre Discord. Reordonnancement
  // DOM uniquement, rien n'est persiste.
  const roleHue = (colorInt) => {
    if (!colorInt) return 361; // pas de couleur -> relegue en fin de palette
    const r = ((colorInt >> 16) & 255) / 255;
    const g = ((colorInt >> 8) & 255) / 255;
    const b = (colorInt & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === min) return 0;
    const d = max - min;
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return h * 60;
  };
  const SORT_MODES = ['default', 'members', 'color'];
  const SORT_LABELS = { default: 'Trier par nombre de membres', members: 'Trier par couleur (vue palette)', color: "Revenir a l'ordre Discord" };
  document.getElementById('dp-roles-sort-members')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const btn = e.currentTarget;
    const mode = SORT_MODES[(SORT_MODES.indexOf(btn.dataset.sortMode) + 1) % SORT_MODES.length];
    btn.dataset.sortMode = mode;
    btn.title = SORT_LABELS[mode];
    btn.textContent = mode === 'color' ? '🎨' : '🔢';
    const list = app.querySelector('.dp-roles-list');
    if (!list) return;
    const rows = [...list.querySelectorAll('.dp-role-row[data-role]')];
    const countFor = (roleId) => (members || []).filter((m) => (m.roles || []).includes(roleId)).length;
    const colorFor = (roleId) => rolesSorted.find((r) => r.id === roleId)?.color || 0;
    const sortedRows = mode === 'members'
      ? rows.slice().sort((a, b) => countFor(b.dataset.role) - countFor(a.dataset.role))
      : mode === 'color'
        ? rows.slice().sort((a, b) => roleHue(colorFor(a.dataset.role)) - roleHue(colorFor(b.dataset.role)))
        : rows.slice().sort((a, b) => {
          const ra = rolesSorted.findIndex((r) => r.id === a.dataset.role);
          const rb = rolesSorted.findIndex((r) => r.id === b.dataset.role);
          return ra - rb;
        });
    sortedRows.forEach((row) => list.appendChild(row));
    showToast(mode === 'members' ? 'Roles tries par nombre de membres.' : mode === 'color' ? 'Vue palette : roles tries par couleur.' : 'Ordre Discord retabli.');
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
    // Renommage inline (roadmap n°118), meme geste que sur les salons.
    if (row.dataset.role) {
      summary.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        inlineRename(row, '.dp-role-name', row.dataset.roleName, (newName) => Api.renameRole(id, row.dataset.role, newName));
      });
    }
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
      // Un ROLE en cours de glissement (roadmap n°016) : le salon devient
      // une cible de depose pour editer les permissions du couple.
      if (app.querySelector('.dp-role-row.dragging')) {
        chEl.classList.add('role-drop-target');
        return;
      }
      const list = chEl.parentElement;
      const dragging = list.querySelector('.dp-channel.dragging');
      if (!dragging || dragging === chEl || dragging.parentElement !== list) return;
      const rect = chEl.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      const target = before ? chEl : chEl.nextSibling;
      if (dragging.nextSibling === target) return;
      animateReorder(list, '.dp-channel[data-channel]', () => list.insertBefore(dragging, target));
    });
    chEl.addEventListener('dragleave', () => chEl.classList.remove('role-drop-target'));
    chEl.addEventListener('drop', (e) => {
      chEl.classList.remove('role-drop-target');
      const roleRow = app.querySelector('.dp-role-row.dragging');
      if (!roleRow) return;
      e.preventDefault();
      e.stopPropagation();
      permPrefill = { channelId: chEl.dataset.channel, roleId: roleRow.dataset.role };
      withViewTransition(() => renderSettingsPanel(id, 'permissions', 'perm-bulk'));
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

  // Duplication d'une categorie avec ses salons et permissions (n°014).
  app.querySelectorAll('.dp-category-duplicate').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!window.confirm(`Dupliquer la categorie "${btn.dataset.catName}" avec ses salons et leurs permissions ?`)) return;
      btn.disabled = true;
      try {
        const res = await Api.duplicateCategory(id, btn.dataset.catDuplicate);
        showToast(`Categorie dupliquee (${res.channels} salon(s)).`);
        await renderPreviewPage(id);
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
      }
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

  // Bascule de serveur rapide (roadmap n°023) : menu sur le nom du serveur,
  // sans repasser par l'accueil. L'URL est mise a jour pour que F5 reste
  // sur le bon serveur.
  const switchBtn = document.getElementById('dp-server-switch');
  const switchMenu = document.getElementById('dp-server-menu');
  if (switchBtn && switchMenu) {
    switchBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = switchMenu.hidden;
      if (open) {
        const others = allGuilds.filter((g) => g.botPresent && g.guildId !== id);
        switchMenu.innerHTML = others.length
          ? others.map((g) => `<button type="button" role="menuitem" class="dp-server-menu-item" data-goto-guild="${g.guildId}">${escapeHtml(g.name)}</button>`).join('')
          : '<p class="muted" style="margin:6px 10px; font-size:0.8rem;">Aucun autre serveur.</p>';
        switchMenu.querySelectorAll('[data-goto-guild]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const gid = btn.dataset.gotoGuild;
            history.replaceState(null, '', `app.html?guild=${gid}`);
            withViewTransition(() => renderPreviewPage(gid));
          });
        });
      }
      switchMenu.hidden = !open;
      switchBtn.setAttribute('aria-expanded', String(open));
    });
    // Fermeture au clic exterieur : listener global unique (renderPreview
    // re-rend souvent, un addEventListener par rendu fuiterait).
    if (!window.__dpServerMenuCloser) {
      window.__dpServerMenuCloser = true;
      document.addEventListener('click', () => {
        const menu = document.getElementById('dp-server-menu');
        if (menu && !menu.hidden) {
          menu.hidden = true;
          document.getElementById('dp-server-switch')?.setAttribute('aria-expanded', 'false');
        }
      });
    }
  }

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

  // Bouton flottant de creation rapide (roadmap n°122), pouce mobile : empile
  // au-dessus des tiroirs tactiles existants (jamais centre, voir la lecon
  // sur le FAB centre qui entrait en conflit avec le chat IA plein ecran).
  const quickFab = document.getElementById('dp-quickcreate-fab');
  const quickMenu = document.getElementById('dp-quickcreate-menu');
  if (quickFab && quickMenu) {
    quickFab.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = quickMenu.hidden;
      quickMenu.hidden = !open;
      quickFab.setAttribute('aria-expanded', String(open));
    });
    quickMenu.addEventListener('click', (e) => e.stopPropagation());
    document.getElementById('dp-quickcreate-channel-btn').addEventListener('click', async () => {
      const input = document.getElementById('dp-quickcreate-channel-name');
      const name = input.value.trim();
      if (!name) { showToast('Nom du salon requis.', 'error'); return; }
      try {
        await Api.createChannel(id, name, 'text', '', false, undefined);
        showToast('Salon cree.');
        await renderPreviewPage(id);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    document.getElementById('dp-quickcreate-category-btn').addEventListener('click', async () => {
      const input = document.getElementById('dp-quickcreate-category-name');
      const name = input.value.trim();
      if (!name) { showToast('Nom de la categorie requis.', 'error'); return; }
      try {
        await Api.createCategory(id, name);
        showToast('Categorie creee.');
        await renderPreviewPage(id);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    if (!window.__dpQuickCreateCloser) {
      window.__dpQuickCreateCloser = true;
      document.addEventListener('click', () => {
        const m = document.getElementById('dp-quickcreate-menu');
        const f = document.getElementById('dp-quickcreate-fab');
        if (m && !m.hidden) { m.hidden = true; f?.setAttribute('aria-expanded', 'false'); }
      });
    }
  }
  document.getElementById('dp-main')?.addEventListener('click', () => {
    app.querySelectorAll('.touch-open').forEach((p) => p.classList.remove('touch-open'));
  });

  // Gestes swipe (roadmap n°121) : glisser depuis le bord gauche ouvre le
  // tiroir salons, depuis le bord droit le tiroir roles ; glisser vers le
  // bord ferme le tiroir ouvert. Seuil 60px, tolerance verticale 50px.
  const previewEl = app.querySelector('.discord-preview');
  if (previewEl) {
    let touchStart = null;
    previewEl.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) { touchStart = null; return; }
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });
    previewEl.addEventListener('touchend', (e) => {
      if (!touchStart) return;
      const dx = e.changedTouches[0].clientX - touchStart.x;
      const dy = Math.abs(e.changedTouches[0].clientY - touchStart.y);
      const startX = touchStart.x;
      touchStart = null;
      if (dy > 50 || Math.abs(dx) < 60) return;
      const width = window.innerWidth;
      const leftPanel = app.querySelector('.dp-sidebar');
      const rightPanel = app.querySelector('.dp-roles-panel');
      if (dx > 0) {
        if (rightPanel?.classList.contains('touch-open')) rightPanel.classList.remove('touch-open');
        else if (startX < 60) { rightPanel?.classList.remove('touch-open'); leftPanel?.classList.add('touch-open'); }
      } else {
        if (leftPanel?.classList.contains('touch-open')) leftPanel.classList.remove('touch-open');
        else if (startX > width - 60) { leftPanel?.classList.remove('touch-open'); rightPanel?.classList.add('touch-open'); }
      }
    }, { passive: true });
  }

  // Visite guidee au tout premier lancement (roadmap n°027).
  if (!localStorage.getItem('dsc-onboarded')) showOnboarding();

  // Occupation des vocaux (roadmap n°019) : badges "N" ajoutes apres coup
  // (donnees ecrites par le bot, absentes du cache local sans gravite).
  Api.voiceOccupancy(id).then((occupancy) => {
    Object.entries(occupancy).forEach(([cid, count]) => {
      const nameEl = app.querySelector(`.dp-channel[data-channel="${cid}"] .dp-channel-name`);
      if (nameEl && !nameEl.parentElement.querySelector('.dp-voice-count')) {
        nameEl.insertAdjacentHTML('afterend', `<span class="dp-voice-count" title="${count} membre(s) en vocal">${count}</span>`);
      }
    });
  }).catch(() => {});

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

  // Renommage inline au double-clic (roadmap n°118) : le nom devient un
  // input, Entree valide, Echap/blur annule.
  function inlineRename(el, nameSel, currentName, save) {
    if (el.querySelector('.dp-inline-rename')) return;
    const nameEl = el.querySelector(nameSel);
    if (!nameEl) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'dp-inline-rename';
    input.value = currentName;
    input.maxLength = 100;
    input.setAttribute('aria-label', `Nouveau nom pour ${currentName}`);
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    let settled = false;
    const finish = async (commit) => {
      if (settled) return;
      settled = true;
      const newName = input.value.trim();
      if (commit && newName && newName !== currentName) {
        try {
          await save(newName);
          showToast('Renomme.');
          await renderPreviewPage(id);
          return;
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
      input.replaceWith(nameEl);
    };
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') finish(true);
      else if (ev.key === 'Escape') finish(false);
    });
    input.addEventListener('click', (ev) => ev.stopPropagation());
    input.addEventListener('blur', () => finish(false));
  }

  // Multi-selection Ctrl+clic (roadmap n°119) : barre d'actions groupees
  // (deplacer vers une categorie, supprimer) sur les salons selectionnes.
  const multiSel = new Set();
  function refreshMultiBar() {
    let bar = document.getElementById('dp-multibar');
    if (!multiSel.size) { bar?.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'dp-multibar';
      app.querySelector('.discord-preview').appendChild(bar);
    }
    const catOptions = channels.filter((c) => c.type === 4).sort((a, b) => a.position - b.position)
      .map((c) => `<option value="${c.id}">📁 ${escapeHtml(c.name)}</option>`).join('');
    bar.innerHTML = `
      <span>${multiSel.size} salon(s) selectionne(s)</span>
      <select id="dp-multibar-cat" aria-label="Categorie cible"><option value="">— Deplacer vers —</option>${catOptions}<option value="__none__">Hors categorie</option></select>
      <button type="button" class="btn secondary" id="dp-multibar-move">Deplacer</button>
      <button type="button" class="btn danger" id="dp-multibar-delete">Supprimer</button>
      <button type="button" class="btn secondary" id="dp-multibar-cancel" aria-label="Annuler la selection">✕</button>`;
    document.getElementById('dp-multibar-cancel').addEventListener('click', () => {
      multiSel.clear();
      app.querySelectorAll('.dp-channel.multi-selected').forEach((el) => el.classList.remove('multi-selected'));
      refreshMultiBar();
    });
    document.getElementById('dp-multibar-move').addEventListener('click', async () => {
      const target = document.getElementById('dp-multibar-cat').value;
      if (!target) { showToast('Choisis une categorie cible.', 'error'); return; }
      try {
        for (const chId of multiSel) {
          // eslint-disable-next-line no-await-in-loop
          await Api.moveChannel(id, chId, target === '__none__' ? '' : target);
        }
        showToast(`${multiSel.size} salon(s) deplace(s).`);
        multiSel.clear();
        await renderPreviewPage(id);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    document.getElementById('dp-multibar-delete').addEventListener('click', async () => {
      if (!window.confirm(`Supprimer ${multiSel.size} salon(s) ? Ils resteront restaurables 24h dans la corbeille.`)) return;
      try {
        for (const chId of multiSel) {
          // eslint-disable-next-line no-await-in-loop
          await Api.deleteChannel(id, chId);
        }
        showToast(`${multiSel.size} salon(s) supprime(s) (corbeille 24h).`);
        multiSel.clear();
        await renderPreviewPage(id);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  app.querySelectorAll('.dp-channel[data-channel]').forEach((chEl) => {
    chEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      inlineRename(chEl, '.dp-channel-name', chEl.dataset.name, (newName) => Api.renameChannel(id, chEl.dataset.channel, newName));
    });
    chEl.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        const chId = chEl.dataset.channel;
        if (multiSel.has(chId)) { multiSel.delete(chId); chEl.classList.remove('multi-selected'); } else { multiSel.add(chId); chEl.classList.add('multi-selected'); }
        refreshMultiBar();
        return;
      }
      openChannel(chEl);
    });
    chEl.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openChannel(chEl);
        return;
      }
      if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      e.preventDefault();
      if (lockedChannels.has(chEl.dataset.channel)) { showToast('Position verrouillee (deverrouille via 🔒).', 'error'); return; }
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
      // Prechargement au survol (roadmap n°206) : la quasi-totalite des
      // modules de reglages dependent de config/channels/roles — les
      // demarrer des le survol (avant le clic) chauffe la connexion et
      // souvent termine la requete avant que le rendu en ait besoin. Fire-
      // and-forget, une seule fois par module grace a __warmedModules.
      btn.addEventListener('mouseenter', () => {
        window.__warmedModules = window.__warmedModules || new Set();
        const key = `${id}:${btn.dataset.gotoSettings}`;
        if (window.__warmedModules.has(key)) return;
        window.__warmedModules.add(key);
        Api.config(id).catch(() => {});
        Api.channels(id).catch(() => {});
      }, { once: true });
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
        const createdIds = [];
        for (const name of names) {
          // eslint-disable-next-line no-await-in-loop
          const created = await Api.createChannel(id, name, type, btn.dataset.cat || undefined);
          if (created?.id) createdIds.push(created.id);
        }
        await renderPreviewPage(id);
        // Toast cliquable (roadmap n°114) : « Voir » scrolle jusqu'au salon.
        showToast(
          names.length > 1 ? `${names.length} salons crees.` : 'Salon cree.',
          'success',
          createdIds.length ? { label: 'Voir', onClick: () => revealInSidebar(`.dp-channel[data-channel="${createdIds[0]}"]`, '.dp-sidebar') } : null,
        );
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
  const prevBody = document.getElementById('dp-settings-body');
  if (prevBody && currentPanelRef) scrollPositions.set(currentPanelRef.key, prevBody.scrollTop);
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
  // add() simple (pas activateSection, qui efface les autres .active) : des
  // pages comme memberlookup melangent une section alwaysOpen (deja active
  // au rendu) avec une section normale, l'effacer ici la masquerait a tort.
  target?.classList.add('active');
  if (target?.id) body.querySelector(`.dp-quickjump-btn[data-jump-to="${target.id.replace(/^section-/, '')}"]`)?.classList.add('active');

  if (fromBack && scrollPositions.has(key)) {
    const savedTop = scrollPositions.get(key);
    requestAnimationFrame(() => { body.scrollTop = savedTop; });
  }
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
        <label for="dp-ctx-welcome">Message(s) de bienvenue — une phrase par ligne, tiree au sort (n°152)</label>
        <textarea id="dp-ctx-welcome">${escapeHtml((config?.welcomeMessageTemplates || [config?.welcomeMessageTemplate].filter(Boolean)).join('\n'))}</textarea>
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
    { key: 'duplicate', icon: '⧉', label: 'Dupliquer' },
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
  if (key === 'duplicate') {
    return `
      <div class="dp-block">
        <p class="dp-block-title">⧉ Dupliquer ce salon</p>
        <p class="muted" style="margin:0 0 12px;">Cree une copie (« ${escapeHtml(name)}-copie ») avec les memes permissions, le meme sujet et le meme slowmode, dans la meme categorie.</p>
        <button class="btn secondary" id="dp-duplicate">Dupliquer</button>
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
  if (key === 'archive') {
    const childCount = channels.filter((c) => c.parent_id === categoryId).length;
    return `
      <div class="dp-block">
        <p class="dp-block-title">📦 Archiver la categorie</p>
        <p class="muted" style="margin:0 0 12px;">Masque la categorie et ses ${childCount} salon(s) pour @everyone (ViewChannel) et retire le droit d'ecrire (SendMessages), en un clic. Reversible via Permissions.</p>
        <button class="btn" id="dp-cat-archive">Archiver maintenant</button>
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
    { key: 'archive', icon: '📦', label: 'Archiver' },
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
    if (key === 'archive') {
      scope.querySelector('#dp-cat-archive').addEventListener('click', async () => {
        if (!window.confirm(`Archiver "${name}" ? La categorie et ses salons deviendront invisibles et en lecture seule pour @everyone.`)) return;
        try {
          const childIds = channels.filter((c) => c.parent_id === categoryId).map((c) => c.id);
          await Api.bulkPermissions(guildId, {
            channelIds: [categoryId, ...childIds], roleId: guildId, allow: [], deny: ['ViewChannel', 'SendMessages'],
          });
          showToast('Categorie archivee.');
          await renderPreviewPage(guildId);
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
            <label class="dp-toggle-row" style="margin-top:6px;" title="${escapeHtml(PERMISSION_DESCRIPTIONS[permName] || '')}">
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
  if (key === 'merge') {
    const others = (ctx.roles || []).filter((r) => r.id !== roleId && r.name !== '@everyone');
    return `
      <div class="dp-block">
        <p class="dp-block-title">🔀 Fusionner avec un autre role</p>
        <p class="muted" style="margin:0 0 10px;">Le role choisi ci-dessous sera <strong>supprime</strong> : ses membres recoivent "${escapeHtml(name)}", ses permissions s'ajoutent (jamais retirees) a "${escapeHtml(name)}".</p>
        <label for="dp-role-merge-target">Role a fusionner dans "${escapeHtml(name)}" (sera supprime)</label>
        <select id="dp-role-merge-target">${others.map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}</select>
        <button class="btn" id="dp-role-merge-btn" style="margin-top:10px;">Fusionner</button>
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
    { key: 'merge', icon: '🔀', label: 'Fusionner' },
    { key: 'delete', icon: '🗑️', label: 'Supprimer', danger: true },
  ];
  const ctx = {
    guildId, roleId, name, role, memberNames, roles,
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
    if (key === 'merge') {
      scope.querySelector('#dp-role-merge-btn').addEventListener('click', async () => {
        const fromRoleId = scope.querySelector('#dp-role-merge-target').value;
        if (!fromRoleId) return;
        const fromName = ctx.roles.find((r) => r.id === fromRoleId)?.name || fromRoleId;
        if (!window.confirm(`Fusionner "${fromName}" dans "${name}" ? "${fromName}" sera supprime definitivement.`)) return;
        try {
          const report = await Api.mergeRoles(guildId, roleId, fromRoleId);
          showToast(`Fusion terminee : ${report.membersMoved} membre(s) deplace(s)${report.permissionsUnioned ? ', permissions unionnees' : ''}.`);
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
          // Messages varies (n°152) : chaque ligne devient un template ; la
          // premiere reste dans welcomeMessageTemplate (compatibilite).
          const welcomeLines = scope.querySelector('#dp-ctx-welcome').value
            .split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 15);
          await Api.updateConfig(guildId, {
            welcomeMessageTemplate: welcomeLines[0] || '',
            welcomeMessageTemplates: welcomeLines.length > 1 ? welcomeLines : null,
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

    const duplicateBtn = scope.querySelector('#dp-duplicate');
    if (duplicateBtn) {
      duplicateBtn.addEventListener('click', async () => {
        duplicateBtn.disabled = true;
        try {
          await Api.duplicateChannel(guildId, channelId);
          showToast('Salon duplique.');
          await renderPreviewPage(guildId);
        } catch (err) {
          showToast(err.message, 'error');
          duplicateBtn.disabled = false;
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
  const [channels, roles, config, permHistory] = await Promise.all([
    Api.channels(id), Api.roles(id), Api.config(id), Api.permissionHistory(id).catch(() => []),
  ]);
  const editableChannels = channels.filter((c) => c.type === 0 || c.type === 2 || c.type === 4);
  const roleOptions = roles.filter((r) => r.name !== '@everyone').map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
  const channelCheckboxes = editableChannels.map((c) => `
    <label><input type="checkbox" value="${c.id}" class="perm-channel" /> ${c.type === 4 ? '📁' : c.type === 2 ? '🔊' : '#'} ${escapeHtml(c.name)}</label>
  `).join('');
  // Edition en masse des topics (roadmap n°255) : salons textuels
  // uniquement, un sujet ne s'appliquant qu'a eux.
  const textChannelsForTopics = channels.filter((c) => c.type === 0);
  const topicChannelCheckboxes = textChannelsForTopics.map((c) => `
    <label><input type="checkbox" value="${c.id}" class="topic-channel" /> # ${escapeHtml(c.name)}</label>
  `).join('');
  // Presets personnalises nommes (roadmap n°264), en plus des presets fixes
  // ci-dessus : l'admin compose sa propre combinaison de permissions et la
  // reutilise ensuite comme n'importe quel preset integre.
  const customPresets = config?.customPermissionPresets || [];
  const presetOptions = PERMISSION_PRESETS.map((p) => `<option value="${p.key}">${escapeHtml(p.label)}</option>`).join('')
    + (customPresets.length ? `<optgroup label="Mes presets">${customPresets.map((p, i) => `<option value="custom:${i}">📌 ${escapeHtml(p.name)}</option>`).join('')}</optgroup>` : '');
  const channelOptionsSimple = editableChannels.map((c) => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');
  let dashboardAllowedUserIds = config?.dashboardAllowedUserIds || [];
  let dashboardViewerUserIds = config?.dashboardViewerUserIds || [];

  // Detecteur d'incoherences (roadmap n°145) : ecrire-sans-voir et
  // overwrites orphelins (role supprime depuis).
  const permIssues = [];
  {
    const VIEW_B = 1024n;
    const SEND_B = 2048n;
    const roleById = new Map(roles.map((r) => [r.id, r]));
    for (const c of channels.filter((ch) => ch.type === 0 || ch.type === 2)) {
      for (const ov of c.permission_overwrites || []) {
        if (ov.type === 0 && !roleById.has(ov.id)) {
          permIssues.push(`#${escapeHtml(c.name)} : permission orpheline (role supprime).`);
          continue;
        }
        const allow = BigInt(ov.allow || 0);
        const deny = BigInt(ov.deny || 0);
        if ((allow & SEND_B) && (deny & VIEW_B)) {
          const label = ov.type === 0 ? escapeHtml(roleById.get(ov.id)?.name || ov.id) : 'un membre';
          permIssues.push(`#${escapeHtml(c.name)} : ${label} peut ecrire mais ne voit pas le salon.`);
        }
      }
    }
  }

  container.innerHTML = `
    <div class="inner">
      ${quickJumpBarHtml([
    ['perm-bulk', 'Edition en masse'], ['perm-topics', 'Topics en masse'],
    ...(permIssues.length ? [['perm-issues', 'Incoherences']] : []),
    ['perm-matrix', 'Matrice'], ['perm-viewas', 'Voir comme'], ['perm-whocansee', 'Qui voit ce salon'],
    ['perm-io', 'Export/Import'], ['perm-history', 'Historique'],
    ['perm-default', 'Par defaut'], ['perm-dashboard', 'Acces dashboard'],
  ], 'permissions')}
      ${sectionHtml('Edition en masse', `
        <p class="muted">Choisis les salons, le role, et une action rapide a appliquer partout en un clic.</p>
        <label>Salons</label>
        <div class="channel-picker">${channelCheckboxes}</div>
        <label for="perm-role">Role</label>
        <select id="perm-role">${roleOptions}</select>
        <label for="perm-preset">Action</label>
        <select id="perm-preset">${presetOptions}</select>
        <button class="btn" id="apply-bulk" style="margin-top:12px;">Appliquer</button>

        <div class="dp-subsection-divider"></div>
        <p class="dp-block-title">📌 Creer un preset personnalise (roadmap n°264)</p>
        <p class="muted" style="font-size:0.78rem;">Compose une combinaison de permissions autorisees, nomme-la, reutilise-la ensuite comme un preset integre.</p>
        <div class="creator-perm-chips" role="group" aria-label="Permissions du preset" id="custom-preset-chips">
          ${['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'Connect', 'Speak', 'ManageMessages', 'AttachFiles', 'EmbedLinks', 'AddReactions', 'MentionEveryone']
    .map((k) => `<button type="button" class="creator-perm-chip" data-perm="${k}" aria-pressed="false" title="${escapeHtml(PERMISSION_DESCRIPTIONS[k] || '')}">${PERMISSION_LABELS[k]}</button>`).join('')}
        </div>
        <div class="row" style="gap:8px; margin-top:8px;">
          <input type="text" id="custom-preset-name" placeholder="Nom du preset (ex: Salon staff)" maxlength="60" style="flex:1; margin:0;" />
          <button class="btn secondary" id="custom-preset-save">Enregistrer</button>
        </div>
        ${customPresets.length ? `<div id="custom-preset-list" style="margin-top:10px;">${customPresets.map((p, i) => `
          <div class="row" style="justify-content:space-between; margin-bottom:4px;">
            <span class="muted" style="font-size:0.82rem;">📌 ${escapeHtml(p.name)} (${p.allow.length} permission(s))</span>
            <button type="button" class="btn danger delete-custom-preset" data-index="${i}">Supprimer</button>
          </div>`).join('')}</div>` : ''}
      `, { id: 'perm-bulk' })}

      ${sectionHtml('Edition en masse des topics', `
        <p class="muted">Applique un meme sujet a plusieurs salons textuels d'un coup. Variables disponibles : {server}, {membercount}, {category}, {channel}.</p>
        <label>Salons</label>
        <div class="channel-picker">${topicChannelCheckboxes || '<p class="muted">Aucun salon textuel.</p>'}</div>
        <label for="topic-bulk-template">Sujet</label>
        <textarea id="topic-bulk-template" placeholder="Discussion #{channel} — {membercount} membres sur {server}" maxlength="1024"></textarea>
        <button class="btn" id="apply-bulk-topics" style="margin-top:12px;">Appliquer</button>
        <div id="topic-bulk-result" class="muted" style="margin-top:8px; font-size:0.82rem;"></div>
      `, { id: 'perm-topics' })}

      ${permIssues.length ? sectionHtml('Incoherences detectees', `
        <p class="muted">${permIssues.length} probleme(s) de permissions repere(s) automatiquement :</p>
        ${permIssues.slice(0, 20).map((i) => `<div style="padding:3px 0; font-size:0.84rem;">⚠️ ${i}</div>`).join('')}
        <p class="muted" style="margin-top:8px;">Les incoherences "peut ecrire mais ne voit pas" se corrigent via l'edition en masse ci-dessus ou l'editeur de salons.</p>
        ${permIssues.some((i) => i.includes('orpheline')) ? '<button type="button" class="btn danger secondary" id="clean-orphan-perms" style="margin-top:8px;">🧹 Nettoyer les overwrites orphelins (role supprime)</button>' : ''}
      `, { id: 'perm-issues' }) : ''}

      ${sectionHtml('Matrice salons × roles', `
        <p class="muted">Visibilite (ViewChannel) croisee : clique une case pour basculer ✅ autorise → ❌ refuse → ─ herite. Applique immediatement.</p>
        <label>Roles a afficher (6 max)</label>
        <div class="channel-picker" style="max-height:120px;">
          ${roles.filter((r) => r.name !== '@everyone').map((r) => `<label><input type="checkbox" class="matrix-role" value="${r.id}" /> ${escapeHtml(r.name)}</label>`).join('')}
        </div>
        <button class="btn secondary" id="matrix-build" style="margin-top:8px;">Afficher la matrice</button>
        <div id="matrix-out" style="margin-top:10px; overflow-x:auto;"></div>
      `, { id: 'perm-matrix' })}

      ${sectionHtml('Voir comme un role', `
        <p class="muted">Affiche le serveur tel que ce role le voit : les salons barres lui sont invisibles.</p>
        <label for="viewas-role">Role</label>
        <select id="viewas-role"><option value="">— Choisir un role —</option>${roleOptions}</select>
        <div id="viewas-result" style="margin-top:10px; font-size:0.85rem;"></div>
      `, { id: 'perm-viewas' })}

      ${sectionHtml('Qui peut voir ce salon', `
        <p class="muted">Choisis un salon : la liste des roles qui le voient (roadmap n°266), resolue avec @everyone et les overwrites.</p>
        <label for="whocansee-channel">Salon</label>
        <select id="whocansee-channel"><option value="">— Choisir un salon —</option>${channelOptionsSimple}</select>
        <div id="whocansee-result" style="margin-top:10px; font-size:0.85rem;"></div>
      `, { id: 'perm-whocansee' })}

      ${sectionHtml('Export / Import (copier-coller)', `
        <p class="dp-block-title" style="margin-top:0;">📋 Copier vers un autre salon (roadmap n°265)</p>
        <div class="row" style="gap:8px; flex-wrap:wrap; align-items:center;">
          <select id="copyperm-source" aria-label="Salon source">${channelOptionsSimple}</select>
          <span aria-hidden="true">→</span>
          <select id="copyperm-target" aria-label="Salon cible">${channelOptionsSimple}</select>
          <button class="btn secondary" id="copyperm-btn">Copier les permissions</button>
        </div>
        <div class="dp-subsection-divider"></div>
        <p class="dp-block-title">🧾 Export / Import JSON (avance, entre serveurs)</p>
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

      ${sectionHtml('Historique des permissions', `
        <p class="muted">${permHistory.length ? `Les ${permHistory.length} derniers changements (edition en masse). "Restaurer" reapplique l'etat exact d'avant.` : 'Aucun changement enregistre pour le moment.'}</p>
        <div id="perm-history-list">
          ${permHistory.map((h, i) => `
            <div class="embed-template-row">
              <span class="embed-template-name" title="${new Date(h.at).toLocaleString('fr-FR')}">#${escapeHtml(h.channelName || h.channelId)} — ${escapeHtml(h.roleName || h.roleId)} <span class="muted">(${h.changedBy}, ${new Date(h.at).toLocaleDateString('fr-FR')})</span></span>
              <button type="button" class="btn secondary perm-history-restore" data-history-index="${i}">↩️ Restaurer</button>
            </div>
          `).join('') || ''}
        </div>
      `, { id: 'perm-history' })}

      ${sectionHtml('Permissions par defaut', `
        <p class="muted">Reinitialise les permissions du role au preset recommande (utile si elles ont ete modifiees par erreur).</p>
        <div class="row">
          <button class="btn secondary" id="reset-admin">Reinitialiser Administrateur</button>
          <button class="btn secondary" id="reset-mod">Reinitialiser Moderateur</button>
        </div>
      `, { id: 'perm-default' })}

      ${sectionHtml('Acces au dashboard (au-dela d\'Administrator Discord)', `
        <p class="muted">Donne acces a ce dashboard a des membres specifiques (par ID Discord) meme s'ils n'ont pas la permission Administrator sur le serveur. Ils pourront tout configurer ici, comme un administrateur du dashboard.</p>
        <p class="muted" style="font-size:0.78rem;">💡 Ceci gere qui peut ouvrir ce dashboard — pas les roles Discord eux-memes (couleur, fusion, permissions) : clique un role dans la colonne de droite pour ca. Pour retrouver un membre precis, voir <button type="button" class="btn secondary" id="perm-dashboard-goto-memberlookup" style="display:inline; padding:2px 8px; font-size:0.78rem;">🔎 Recherche de membres</button>.</p>
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
  wireQuickJump(container);

  document.getElementById('perm-dashboard-goto-memberlookup')?.addEventListener('click', () => {
    window.UISound?.select();
    withViewTransition(() => renderSettingsPanel(id, 'memberlookup'));
  });

  // Pre-remplissage apres un drop role -> salon (roadmap n°016).
  if (permPrefill) {
    const chBox = container.querySelector(`.perm-channel[value="${permPrefill.channelId}"]`);
    if (chBox) chBox.checked = true;
    const roleSel = document.getElementById('perm-role');
    if (roleSel && [...roleSel.options].some((o) => o.value === permPrefill.roleId)) roleSel.value = permPrefill.roleId;
    permPrefill = null;
    showToast('Salon et role pre-selectionnes : choisis l\'action a appliquer.');
  }

  // Simulateur « voir comme » (roadmap n°146) : visibilite de chaque salon
  // pour un role — base @everyone|role, puis overwrites @everyone puis role
  // (l'heritage de categorie est deja copie par Discord dans les overwrites
  // du salon lui-meme).
  const VIEW_BIT = 1024n;
  const ADMIN_BIT = 8n;
  const roleCanSee = (channel, role, everyoneRole) => {
    const base = BigInt(everyoneRole?.permissions || 0) | BigInt(role.permissions || 0);
    if (base & ADMIN_BIT) return true;
    let can = Boolean(base & VIEW_BIT);
    const overwrites = channel.permission_overwrites || [];
    for (const targetId of [everyoneRole?.id, role.id]) {
      const ov = overwrites.find((o) => o.id === targetId);
      if (!ov) continue;
      if (BigInt(ov.deny || 0) & VIEW_BIT) can = false;
      if (BigInt(ov.allow || 0) & VIEW_BIT) can = true;
    }
    return can;
  };

  // Matrice salons × roles (roadmap n°144) : etat du bit ViewChannel par
  // cellule, cycle allow → deny → neutral au clic, mise a jour optimiste.
  const cellState = (channel, roleId) => {
    const ov = (channel.permission_overwrites || []).find((o) => o.id === roleId);
    if (!ov) return 'neutral';
    if (BigInt(ov.deny || 0) & 1024n) return 'deny';
    if (BigInt(ov.allow || 0) & 1024n) return 'allow';
    return 'neutral';
  };
  const CELL_ICONS = { allow: '✅', deny: '❌', neutral: '─' };
  const NEXT_STATE = { neutral: 'allow', allow: 'deny', deny: 'neutral' };

  document.getElementById('matrix-build').addEventListener('click', () => {
    const selected = [...container.querySelectorAll('.matrix-role:checked')].map((el) => el.value).slice(0, 6);
    const out = document.getElementById('matrix-out');
    if (!selected.length) { out.innerHTML = '<p class="muted">Choisis au moins un role.</p>'; return; }
    const selRoles = selected.map((rid) => roles.find((r) => r.id === rid)).filter(Boolean);
    const realChannels = channels.filter((c) => c.type === 0 || c.type === 2);
    const rowHtml = (c) => `
      <tr>
        <td style="white-space:nowrap;">${c.type === 2 ? '🔊' : '#'} ${escapeHtml(c.name)}</td>
        ${selRoles.map((r) => {
    const state = cellState(c, r.id);
    return `<td style="text-align:center;"><button type="button" class="matrix-cell" data-channel="${c.id}" data-role="${r.id}" data-state="${state}" title="${escapeHtml(r.name)} / ${escapeHtml(c.name)}" aria-label="Basculer la visibilite de ${escapeHtml(c.name)} pour ${escapeHtml(r.name)}">${CELL_ICONS[state]}</button></td>`;
  }).join('')}
      </tr>`;
    const groups = [];
    const uncat = realChannels.filter((c) => !c.parent_id).sort((a, b) => a.position - b.position);
    if (uncat.length) groups.push({ name: null, chans: uncat });
    for (const cat of channels.filter((c) => c.type === 4).sort((a, b) => a.position - b.position)) {
      const chans = realChannels.filter((c) => c.parent_id === cat.id).sort((a, b) => a.position - b.position);
      if (chans.length) groups.push({ name: cat.name, chans });
    }
    out.innerHTML = `
      <table class="perm-matrix-table">
        <thead><tr><th>Salon</th>${selRoles.map((r) => `<th>${escapeHtml(r.name)}</th>`).join('')}</tr></thead>
        <tbody>
          ${groups.map((g) => `
            ${g.name ? `<tr><td colspan="${selRoles.length + 1}" style="font-weight:700; font-size:0.72rem; text-transform:uppercase; padding-top:10px;">📁 ${escapeHtml(g.name)}</td></tr>` : ''}
            ${g.chans.map(rowHtml).join('')}
          `).join('')}
        </tbody>
      </table>`;

    out.querySelectorAll('.matrix-cell').forEach((cell) => {
      cell.addEventListener('click', async () => {
        const next = NEXT_STATE[cell.dataset.state];
        const prev = cell.dataset.state;
        cell.dataset.state = next;
        cell.textContent = CELL_ICONS[next];
        cell.disabled = true;
        try {
          await Api.setPermissionCell(id, cell.dataset.channel, cell.dataset.role, next);
          // Garde la copie locale coherente pour cellState/voir-comme.
          const ch = channels.find((c) => c.id === cell.dataset.channel);
          if (ch) {
            ch.permission_overwrites = ch.permission_overwrites || [];
            let ov = ch.permission_overwrites.find((o) => o.id === cell.dataset.role);
            if (!ov) { ov = { id: cell.dataset.role, type: 0, allow: '0', deny: '0' }; ch.permission_overwrites.push(ov); }
            let allow = BigInt(ov.allow || 0) & ~1024n;
            let deny = BigInt(ov.deny || 0) & ~1024n;
            if (next === 'allow') allow |= 1024n;
            if (next === 'deny') deny |= 1024n;
            ov.allow = allow.toString();
            ov.deny = deny.toString();
          }
        } catch (err) {
          cell.dataset.state = prev;
          cell.textContent = CELL_ICONS[prev];
          showToast(err.message, 'error');
        }
        cell.disabled = false;
      });
    });
  });

  document.getElementById('viewas-role').addEventListener('change', (e) => {
    const out = document.getElementById('viewas-result');
    const role = roles.find((r) => r.id === e.target.value);
    if (!role) { out.innerHTML = ''; return; }
    const everyoneRole = roles.find((r) => r.id === id);
    const realChannels = channels.filter((c) => c.type === 0 || c.type === 2);
    let visibleCount = 0;
    const chanRow = (c) => {
      const visible = roleCanSee(c, role, everyoneRole);
      if (visible) visibleCount += 1;
      return `<div style="padding:2px 0 2px 16px;${visible ? '' : ' opacity:0.45; text-decoration:line-through;'}">${c.type === 2 ? '🔊' : '#'} ${escapeHtml(c.name)}${visible ? '' : ' 🚫'}</div>`;
    };
    const rows = [];
    rows.push(...realChannels.filter((c) => !c.parent_id).sort((a, b) => a.position - b.position).map(chanRow));
    for (const cat of channels.filter((c) => c.type === 4).sort((a, b) => a.position - b.position)) {
      const catVisible = roleCanSee(cat, role, everyoneRole);
      rows.push(`<div style="margin-top:8px; font-weight:700; font-size:0.76rem; text-transform:uppercase;${catVisible ? '' : ' opacity:0.45; text-decoration:line-through;'}">📁 ${escapeHtml(cat.name)}${catVisible ? '' : ' 🚫'}</div>`);
      rows.push(...realChannels.filter((c) => c.parent_id === cat.id).sort((a, b) => a.position - b.position).map(chanRow));
    }
    out.innerHTML = `<p class="muted">${escapeHtml(role.name)} voit ${visibleCount} salon(s) sur ${realChannels.length}.</p>${rows.join('')}`;
  });

  document.getElementById('whocansee-channel').addEventListener('change', (e) => {
    const out = document.getElementById('whocansee-result');
    const channel = channels.find((c) => c.id === e.target.value);
    if (!channel) { out.innerHTML = ''; return; }
    const everyoneRole = roles.find((r) => r.id === id);
    const seers = roles.filter((r) => r.name !== '@everyone' && roleCanSee(channel, r, everyoneRole));
    const everyoneCanSee = roleCanSee(channel, everyoneRole, everyoneRole);
    out.innerHTML = `
      <p class="muted">${everyoneCanSee ? '🌍 @everyone voit ce salon (visible par defaut pour tout le monde).' : '🔒 @everyone NE voit PAS ce salon (prive par defaut).'}</p>
      ${seers.length ? `<p class="muted" style="margin-top:6px;">Roles avec acces explicite ou herite :</p>${seers.map((r) => `<div style="padding:2px 0;"><span style="color:${r.color ? `#${r.color.toString(16).padStart(6, '0')}` : 'var(--text)'};">●</span> ${escapeHtml(r.name)}</div>`).join('')}` : ''}
    `;
  });

  document.getElementById('apply-bulk').addEventListener('click', async () => {
    const channelIds = [...container.querySelectorAll('.perm-channel:checked')].map((el) => el.value);
    const roleId = document.getElementById('perm-role').value;
    const presetKey = document.getElementById('perm-preset').value;
    const preset = presetKey.startsWith('custom:')
      ? customPresets[Number(presetKey.slice(7))]
      : PERMISSION_PRESETS.find((p) => p.key === presetKey);
    if (channelIds.length === 0 || !roleId || !preset) {
      showToast('Choisis au moins un salon et un role.', 'error');
      return;
    }
    try {
      const results = await Api.bulkPermissions(id, { channelIds, roleId, allow: preset.allow, deny: preset.deny || [] });
      const failed = results.filter((r) => !r.ok);
      showToast(failed.length ? `${failed.length} salon(s) en erreur.` : 'Permissions appliquees.', failed.length ? 'error' : 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('apply-bulk-topics')?.addEventListener('click', async () => {
    const channelIds = [...container.querySelectorAll('.topic-channel:checked')].map((el) => el.value);
    const template = document.getElementById('topic-bulk-template').value.trim();
    if (channelIds.length === 0 || !template) {
      showToast('Choisis au moins un salon et un sujet.', 'error');
      return;
    }
    const guildInfo = allGuilds.find((g) => g.guildId === id);
    const resultEl = document.getElementById('topic-bulk-result');
    resultEl.textContent = 'Application en cours...';
    let ok = 0;
    let failed = 0;
    for (const channelId of channelIds) {
      const channel = channels.find((c) => c.id === channelId);
      const category = channels.find((c) => c.id === channel?.parent_id);
      const topic = template
        .replaceAll('{server}', guildInfo?.name || '')
        .replaceAll('{membercount}', String(guildInfo?.memberCount ?? ''))
        .replaceAll('{category}', category?.name || '')
        .replaceAll('{channel}', channel?.name || '')
        .slice(0, 1024);
      try {
        await Api.setChannelTopic(id, channelId, topic);
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    resultEl.textContent = `${ok} salon(s) mis a jour.${failed ? ` ${failed} en erreur.` : ''}`;
    showToast(failed ? `${failed} salon(s) en erreur.` : 'Topics appliques.', failed ? 'error' : 'success');
  });

  document.getElementById('clean-orphan-perms')?.addEventListener('click', async () => {
    if (!window.confirm('Supprimer definitivement toutes les permissions ciblant un role supprime ? Action irreversible.')) return;
    try {
      const result = await Api.cleanOrphanPermissions(id);
      showToast(result.cleaned ? `${result.cleaned} permission(s) orpheline(s) supprimee(s).` : 'Rien a nettoyer.');
      await renderPermissionsPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  container.querySelectorAll('#custom-preset-chips .creator-perm-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const active = chip.getAttribute('aria-pressed') !== 'true';
      chip.setAttribute('aria-pressed', String(active));
      chip.classList.toggle('active', active);
    });
  });
  document.getElementById('custom-preset-save').addEventListener('click', async () => {
    const name = document.getElementById('custom-preset-name').value.trim();
    const allow = [...container.querySelectorAll('#custom-preset-chips .creator-perm-chip.active')].map((c) => c.dataset.perm);
    if (!name) { showToast('Nom du preset requis.', 'error'); return; }
    if (!allow.length) { showToast('Choisis au moins une permission.', 'error'); return; }
    try {
      const updated = [...customPresets, { name, allow, deny: [] }];
      await Api.updateConfig(id, { customPermissionPresets: updated });
      showToast('Preset enregistre.');
      await renderPermissionsPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  container.querySelectorAll('.delete-custom-preset').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const updated = customPresets.filter((_, i) => i !== Number(btn.dataset.index));
        await Api.updateConfig(id, { customPermissionPresets: updated });
        showToast('Preset supprime.');
        await renderPermissionsPage(id, container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  document.getElementById('copyperm-btn').addEventListener('click', async () => {
    const sourceId = document.getElementById('copyperm-source').value;
    const targetId = document.getElementById('copyperm-target').value;
    if (!sourceId || !targetId) { showToast('Choisis un salon source et un salon cible.', 'error'); return; }
    if (sourceId === targetId) { showToast('Choisis deux salons differents.', 'error'); return; }
    try {
      const data = await Api.exportPermissions(id, sourceId);
      await Api.importPermissions(id, targetId, data.permissionOverwrites);
      showToast('Permissions copiees.');
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

  // Historique des permissions + restauration (roadmap n°268).
  document.querySelectorAll('.perm-history-restore').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Restaurer les permissions de ce salon a leur etat precedent ?')) return;
      try {
        await Api.restorePermissionHistory(id, btn.dataset.historyIndex);
        showToast('Permissions restaurees.');
        btn.closest('.embed-template-row').remove();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
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
      ${quickJumpBarHtml([
    ['game-catalog', 'Catalogue de jeux'], ['game-active', 'Roles de jeu actifs'], ['game-reaction', 'Roles-reaction'],
  ], 'jeux')}
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
  wireQuickJump(container);

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

// Base64 URL-safe -> Uint8Array (roadmap n°178) : format standard dans
// lequel le worker sert la cle publique VAPID, format attendu par
// pushManager.subscribe({ applicationServerKey }).
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Active/desactive les notifications push pour ce serveur, sur CET appareil
// (roadmap n°178) : nouveau ticket, giveaway termine, bot hors ligne.
async function wirePushToggle(id, container) {
  const btn = container.querySelector('#push-toggle-btn');
  const status = container.querySelector('#push-status');
  if (!btn) return;

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    btn.textContent = 'Non supporte par ce navigateur';
    status.textContent = "Les notifications push necessitent un navigateur compatible (Chrome, Firefox, Edge...).";
    return;
  }

  let vapidPublicKey = null;
  try {
    ({ publicKey: vapidPublicKey } = await Api.pushVapidKey());
  } catch { /* worker inaccessible, on retente au clic */ }
  if (!vapidPublicKey) {
    btn.textContent = 'Indisponible pour le moment';
    status.textContent = window.DEMO_MODE
      ? 'Non disponible en mode demo.'
      : "Le serveur n'a pas encore de cle de notification configuree.";
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  const paintState = async () => {
    const sub = await registration.pushManager.getSubscription();
    btn.disabled = false;
    if (sub) {
      btn.textContent = '🔕 Desactiver les notifications';
      status.textContent = 'Notifications activees sur cet appareil.';
    } else {
      btn.textContent = '🔔 Activer les notifications';
      status.textContent = '';
    }
    return sub;
  };
  await paintState();

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await Api.pushUnsubscribe(id, existing.endpoint).catch(() => {});
        await existing.unsubscribe();
        showToast('Notifications desactivees.');
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          showToast('Permission refusee par le navigateur.', 'error');
          return;
        }
        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
        await Api.pushSubscribe(id, sub.toJSON());
        showToast('Notifications activees.');
      }
    } catch (err) {
      showToast(err.message || 'Impossible de modifier les notifications.', 'error');
    } finally {
      await paintState();
    }
  });
}

async function renderAutomationsPage(id, container = app) {
  container.innerHTML = skeletonHtml();
  const [
    modConfig, roles, channels, levelRoles, referralRoles, referralCounts, streamers, scheduled, tickets, config,
    shopItems, economyAccounts, sanctionContests,
  ] = await Promise.all([
    Api.modConfig(id), Api.roles(id), Api.channels(id), Api.levelRoles(id), Api.referralRoles(id),
    Api.referrals(id), Api.streamers(id), Api.scheduled(id), Api.tickets(id), Api.config(id),
    Api.shopItems(id).catch(() => []), Api.economyAccounts(id).catch(() => ({})),
    Api.sanctionContests(id).catch(() => []),
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

  const levelRoleRows = levelRoles.map((lr) => {
    const bits = [];
    if (lr.roleId) bits.push(escapeHtml(roleName(lr.roleId)));
    if (lr.bonus) bits.push(`🪙 ${lr.bonus}`);
    if (lr.announce) bits.push(`💬 "${escapeHtml(lr.announce)}"`);
    return `
    <div class="row" data-level="${lr.level}" style="justify-content:space-between; margin-bottom:6px;">
      <span>Niveau ${lr.level} → ${bits.join(' · ') || '—'}</span>
      <button class="btn danger delete-level-role" data-level="${lr.level}">Supprimer</button>
    </div>
  `;
  }).join('') || '<p class="muted">Aucun role de niveau configure.</p>';

  const referralRoleRows = referralRoles.map((rr) => `
    <div class="row" data-count="${rr.count}" style="justify-content:space-between; margin-bottom:6px;">
      <span>${rr.count} invitation(s) → ${escapeHtml(roleName(rr.roleId))}</span>
      <button class="btn danger delete-referral-role" data-count="${rr.count}">Supprimer</button>
    </div>
  `).join('') || '<p class="muted">Aucun role de parrainage configure.</p>';

  const shopItemRows = shopItems.map((it) => `
    <div class="row" data-id="${it.id}" style="justify-content:space-between; margin-bottom:6px;">
      <span>${escapeHtml(it.name)} — 🪙 ${it.price}${it.roleId ? ` → ${escapeHtml(roleName(it.roleId))}` : ''}${it.stock != null ? ` <span class="muted">(${it.stock > 0 ? `${it.stock} en stock` : 'rupture de stock'})</span>` : ''}</span>
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

  // Priorite/tags (roadmap n°307,n°309) : tri haute -> normale -> basse,
  // priorite affichee en badge colore + select pour la reassigner, tags en
  // champ texte libre separes par des virgules.
  const PRIORITY_ORDER = { haute: 0, normale: 1, basse: 2 };
  const PRIORITY_COLORS = { haute: 'var(--danger)', normale: 'var(--text-muted)', basse: 'var(--text-faint)' };
  const ticketsSorted = [...tickets].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1));
  const ticketRows = ticketsSorted.map((t) => `
    <div class="row" data-id="${t.id}" style="justify-content:space-between; margin-bottom:6px; flex-wrap:wrap;">
      <span>
        <span style="color:${PRIORITY_COLORS[t.priority] || PRIORITY_COLORS.normale}; font-weight:700; font-size:0.76rem; text-transform:uppercase;">${escapeHtml(t.priority || 'normale')}</span>
        ${channelName(t.channelId)} <span class="muted">(${escapeHtml(t.userId)})</span><button type="button" class="dp-copy-id-btn" data-copy-id="${t.userId}" title="Copier l'ID" aria-label="Copier l'ID de l'auteur du ticket">📋</button> — <span class="badge ${t.status === 'open' ? 'configured' : 'not-configured'}">${t.status === 'open' ? 'Ouvert' : 'Ferme'}</span>${t.assignedToTag ? ` <span class="muted">— pris en charge par ${escapeHtml(t.assignedToTag)}</span>` : ''}${t.rating ? ` <span class="muted">— ${'⭐'.repeat(t.rating)}</span>` : ''}${t.tags?.length ? ` <span class="muted">— 🏷️ ${t.tags.map((tag) => escapeHtml(tag)).join(', ')}</span>` : ''}
      </span>
      <span style="display:flex; gap:6px; align-items:center;">
        <select class="ticket-priority-select" data-id="${t.id}" aria-label="Priorite" style="margin:0; font-size:0.78rem;">
          ${['haute', 'normale', 'basse'].map((p) => `<option value="${p}" ${((t.priority || 'normale') === p) ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
        <button type="button" class="btn secondary ticket-edit-tags" data-id="${t.id}" data-tags="${escapeHtml((t.tags || []).join(', '))}" title="Modifier les tags" aria-label="Modifier les tags">🏷️</button>
        ${t.status === 'open'
    ? `<button class="btn danger close-ticket" data-id="${t.id}">Fermer</button>`
    : `<span style="display:flex; gap:6px;">
         <button class="btn secondary ticket-transcript" data-id="${t.id}" title="Telecharger la transcription (HTML)" aria-label="Telecharger la transcription du ticket">📄</button>
         <button class="btn secondary ticket-reopen" data-id="${t.id}" title="Rouvrir ce ticket (nouveau salon prive)" aria-label="Rouvrir le ticket">🔓</button>
       </span>`}
      </span>
    </div>
  `).join('') || '<p class="muted">Aucun ticket pour le moment.</p>';

  // Satisfaction moyenne par membre du staff (roadmap n°311), PRIVEE
  // (dashboard uniquement, jamais publiee) : agregee depuis les tickets
  // notes + assignes, aucune nouvelle donnee necessaire.
  const staffRatings = new Map();
  tickets.filter((t) => t.rating && t.assignedToTag).forEach((t) => {
    const arr = staffRatings.get(t.assignedToTag) || [];
    arr.push(t.rating);
    staffRatings.set(t.assignedToTag, arr);
  });
  const staffRatingRows = [...staffRatings.entries()]
    .map(([tag, arr]) => ({ tag, avg: arr.reduce((a, b) => a + b, 0) / arr.length, count: arr.length }))
    .sort((a, b) => b.avg - a.avg)
    .map((s) => `<div class="stats-top-row"><span class="stats-top-name">${escapeHtml(s.tag)}</span><span class="stats-top-value">${s.avg.toFixed(1)} ⭐ (${s.count} avis)</span></div>`)
    .join('') || '<p class="muted">Aucun ticket note pour le moment.</p>';

  container.innerHTML = `
    <div class="inner">
      ${quickJumpBarHtml([
    ['streamers', 'Streamers'], ['annonces', 'Annonces'], ['regles', 'Regles'], ['cooldowns', 'Cooldowns'],
    ['automod', 'Auto-mod'], ['contestations', 'Contestations'], ['service', 'Service staff'], ['tickets', 'Tickets'], ['suggestions', 'Suggestions'],
    ['signalements', 'Signalements'], ['economie', 'Economie'], ['niveaux', 'Niveaux'], ['parrainage', 'Parrainage'],
    ['bots', 'Bots'], ['webhooks', 'Webhooks'], ['rss', 'RSS'], ['arrivee', 'Bot & role auto'],
    ['autoreact', 'Reactions auto'], ['notifications', 'Notifications push'],
  ], 'automatisations')}
      ${sectionHtml('Bots complementaires', `
        <p class="muted">Ajoute des modules complementaires a ce serveur en invitant ces bots. Pour etendre ServeurCreator lui-meme sans bot tiers, voir <button type="button" class="btn secondary" id="bots-goto-customcommands" style="display:inline; padding:2px 8px; font-size:0.78rem;">💻 Commandes personnalisees</button>.</p>
        <div class="row">
          <a class="btn secondary" href="https://discord.com/oauth2/authorize?client_id=1526016642411135107&permissions=286262288&scope=bot" target="_blank" rel="noopener">➕ Ajouter FortniteParty</a>
          <button class="btn secondary" id="copy-bot-invite" title="Copier le lien pour inviter ServeurCreator sur un autre serveur">🔗 Copier le lien d'invitation de ServeurCreator</button>
          <a class="btn secondary" href="https://discord.com/oauth2/authorize?client_id=1449858112054886442&scope=bot%20applications.commands&permissions=268520448&guild_id=1526242972989915307" target="_blank" rel="noopener">➕ Ajouter BotStream</a>
        </div>
      `, { id: 'bots' })}

      ${sectionHtml('Arrivee & statut du bot', `
        <p class="muted" style="font-size:0.78rem;">Ceci configure le comportement du bot sur CE serveur. Pour verifier s'il est en ligne (uptime, ping, commun a tous les serveurs), voir <button type="button" class="btn secondary" id="arrivee-goto-botstatus" style="display:inline; padding:2px 8px; font-size:0.78rem;">🤖 Statut du bot</button>.</p>
        <label for="auto-role-select">Role attribue automatiquement a l'arrivee (en plus du reglement)</label>
        <select id="auto-role-select">
          <option value="">Aucun</option>
          ${roleOptions(config?.autoRoleId)}
        </select>
        <button class="btn secondary" id="save-auto-role" style="margin-top:8px;">Enregistrer</button>

        <label style="margin-top:18px;" for="tenure-role-select">Role d'anciennete (roadmap n°283, optionnel)</label>
        <select id="tenure-role-select"><option value="">Aucun</option>${roleOptions(config?.tenureRoleId)}</select>
        <label for="tenure-days">Attribue automatiquement apres N jours de presence</label>
        <input type="number" id="tenure-days" value="${config?.tenureDays ?? 30}" min="1" />
        <button class="btn secondary" id="save-tenure-role" style="margin-top:8px;">Enregistrer</button>

        <label style="margin-top:18px;" for="bot-statuses">Statuts du bot (un par ligne, tournent automatiquement)</label>
        <textarea id="bot-statuses" placeholder="Regarde ServeurCreator&#10;/setup pour demarrer&#10;{membercount} membres">${escapeHtml((config?.botStatuses || []).join('\n'))}</textarea>
        <p class="muted">Variable disponible : {membercount}</p>
        <button class="btn secondary" id="save-bot-statuses" style="margin-top:8px;">Enregistrer</button>

        <label style="margin-top:18px;" for="birthday-channel-select">Salon des annonces d'anniversaire (/birthday)</label>
        <select id="birthday-channel-select">
          <option value="">Meme salon que bienvenue/depart</option>
          ${textChannelOptions}
        </select>
        <label for="birthday-role-select">Role anniversaire (roadmap n°314, optionnel — attribue le jour J, retire le lendemain)</label>
        <select id="birthday-role-select"><option value="">Aucun</option>${roleOptions(config?.birthdayRoleId)}</select>
        <button class="btn secondary" id="save-birthday-channel" style="margin-top:8px;">Enregistrer</button>

        <label style="margin-top:18px;" for="suggestions-channel-select">Salon des suggestions (/suggest)</label>
        <select id="suggestions-channel-select">
          <option value="">Aucun</option>
          ${textChannelOptions}
        </select>
        <button class="btn secondary" id="save-suggestions-channel" style="margin-top:8px;">Enregistrer</button>

        <label style="margin-top:18px;">Salon vocal "compteur de membres" (verrouille, nom auto)</label>
        ${config?.memberCountChannelId ? `
          <p class="muted">Salon actif : ${channelName(config.memberCountChannelId)} (mise a jour toutes les ~10 minutes).</p>
          <input type="text" id="membercount-template" placeholder="Modele de nom" value="${escapeHtml(config?.memberCountChannelNameTemplate || '👥 Membres : {count}')}" />
          <p class="muted">Variables (roadmap n°287) : {count}, {boosts}, {goal}, {remaining}, {progress}</p>
          <label for="membercount-goal">Objectif de membres (optionnel, pour {goal}/{remaining}/{progress})</label>
          <input type="number" id="membercount-goal" value="${config?.memberCountGoal || ''}" min="1" placeholder="Ex : 1000" />
          <button class="btn secondary" id="save-membercount-template" style="margin-top:8px;">Enregistrer</button>
        ` : `
          <input type="text" id="membercount-template" placeholder="Modele de nom" value="👥 Membres : {count}" />
          <p class="muted">Variables disponibles : {count}, {boosts}, {goal}, {remaining}, {progress}</p>
          <button class="btn secondary" id="create-membercount-channel" style="margin-top:8px;">Creer le salon compteur</button>
        `}
      `, { id: 'arrivee' })}

      ${sectionHtml('Reactions automatiques par salon', `
        <p class="muted">Le bot ajoute automatiquement une reaction a chaque message poste dans le salon choisi (roadmap n°284, ex. 📌 sur les annonces).</p>
        <div id="autoreact-list">${Object.entries(config?.autoReactChannels || {}).map(([cid, emoji]) => `
          <div class="row" style="justify-content:space-between; margin-bottom:6px;">
            <span>${emoji} → ${escapeHtml(channelName(cid))}</span>
            <button type="button" class="btn danger delete-autoreact" data-channel="${cid}">Supprimer</button>
          </div>`).join('') || '<p class="muted">Aucune reaction automatique configuree.</p>'}</div>
        <div class="row" style="margin-top:10px; gap:8px;">
          <select id="new-autoreact-channel" aria-label="Salon">${textChannelOptions}</select>
          <input type="text" id="new-autoreact-emoji" placeholder="📌" maxlength="8" style="width:80px; margin:0;" aria-label="Emoji" />
          <button class="btn secondary" id="add-autoreact">Ajouter</button>
        </div>
        <div class="dp-subsection-divider"></div>
        <p class="dp-block-title">🧵 Fermeture automatique des threads (roadmap n°286)</p>
        <label for="thread-autoclose-days">Archiver un thread apres N jours d'inactivite (0 = desactive)</label>
        <input type="number" id="thread-autoclose-days" value="${config?.threadAutoCloseDays ?? 0}" min="0" />
        <button class="btn secondary" id="save-thread-autoclose" style="margin-top:8px;">Enregistrer</button>
      `, { id: 'autoreact' })}

      ${sectionHtml('Notifications push', `
        <p class="muted">Recois une notification directement sur cet appareil (navigateur) pour : nouveau ticket, giveaway termine, bot hors ligne. Rien n'est envoye si tu ne l'actives pas. Pour poster un message a une date precise, voir <button type="button" class="dp-quickjump-btn" data-jump-to="annonces" style="display:inline; vertical-align:baseline;">📅 Annonces programmees</button>.</p>
        <button class="btn secondary" id="push-toggle-btn" disabled>Verification du support du navigateur...</button>
        <p class="muted" id="push-status" style="font-size:0.78rem; margin-top:8px;"></p>
      `, { id: 'notifications' })}

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
        <h2 style="margin-top:18px; font-size:0.85rem;">📥 Webhook entrant</h2>
        <p class="muted">URL unique a coller dans GitHub, un moniteur d'uptime, une boutique... : chaque POST recu est formate et poste dans le salon choisi.</p>
        ${config?.inboundWebhook?.token
    ? `<div class="row" style="gap:8px; flex-wrap:wrap;">
             <input type="text" readonly id="inbound-webhook-url" aria-label="URL du webhook entrant" value="https://discord-serveur-creator-worker.energiecraft-online.workers.dev/public/inbound/${id}/${escapeHtml(config.inboundWebhook.token)}" style="flex:1; min-width:220px; margin:0;" />
             <button class="btn secondary" id="copy-inbound-webhook">📋 Copier</button>
             <button class="btn danger" id="toggle-inbound-webhook" data-enable="false">Desactiver</button>
           </div>
           <p class="muted" style="font-size:0.76rem; margin-top:4px;">Destination : ${escapeHtml(channelName(config.inboundWebhook.channelId))}</p>`
    : `<div class="row" style="gap:8px; flex-wrap:wrap;">
             <select id="inbound-webhook-channel" aria-label="Salon de destination" style="flex:1; min-width:160px;">${textChannelOptions}</select>
             <button class="btn secondary" id="toggle-inbound-webhook" data-enable="true">Activer le webhook entrant</button>
           </div>`}
      `, { id: 'webhooks' })}

      ${sectionHtml('Flux RSS', `
        <p class="muted">Chaque nouvel article d'un flux RSS/Atom est poste dans le salon choisi (verification toutes les 10 minutes). Pour suivre un compte Twitch/YouTube precis, voir <button type="button" class="dp-quickjump-btn" data-jump-to="streamers" style="display:inline; vertical-align:baseline;">📺 Streamers lies</button>.</p>
        <div id="rss-feeds-list">${(config?.rssFeeds || []).map((f, i) => `
          <div class="row" data-index="${i}" style="justify-content:space-between; margin-bottom:6px;">
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(f.url)} → <span class="muted">${escapeHtml(channelName(f.channelId))}</span></span>
            <button class="btn danger delete-rss-feed" data-index="${i}">Supprimer</button>
          </div>`).join('') || '<p class="muted">Aucun flux suivi.</p>'}</div>
        <div class="row" style="margin-top:10px;">
          <input type="text" id="new-rss-url" placeholder="https://exemple.com/feed.xml" aria-label="URL du flux RSS" style="flex:2; min-width:200px;" />
          <select id="new-rss-channel" aria-label="Salon de destination" style="flex:1; min-width:140px;">${textChannelOptions}</select>
          <button class="btn secondary" id="add-rss-feed">Suivre</button>
        </div>
      `, { id: 'rss' })}

      ${sectionHtml('Economie : boutique (/shop, /daily, /pay, /balance)', `
        <p class="muted">Les membres gagnent des pieces via /daily, peuvent en envoyer via /pay, et les depenser ici. Un article peut donner un role automatiquement.</p>
        <div id="shop-items-list">${shopItemRows}</div>
        <div class="row" style="margin-top:10px;">
          <input type="text" id="new-shop-name" placeholder="Nom de l'article" aria-label="Nom de l'article" style="flex:1; min-width:160px;" />
          <input type="number" id="new-shop-price" placeholder="Prix" aria-label="Prix" min="1" style="width:100px;" />
          <input type="number" id="new-shop-stock" placeholder="Stock (vide = illimite)" aria-label="Stock (roadmap n°299)" min="1" style="width:150px;" />
          <select id="new-shop-role" aria-label="Role attribue par l'article">
            <option value="">Aucun role</option>
            ${roleOptions()}
          </select>
          <button class="btn secondary" id="add-shop-item">Ajouter</button>
        </div>
        <h2 style="margin-top:18px; font-size:0.85rem;">💸 Taxe sur /pay</h2>
        <p class="muted">Pourcentage preleve (et detruit) sur chaque transfert entre membres — freine l'inflation. 0 = aucun.</p>
        <div class="row" style="gap:8px;">
          <select id="pay-tax-percent" aria-label="Taxe sur les transferts" style="margin:0;">
            ${[0, 2, 5, 10, 15, 25].map((p) => `<option value="${p}" ${(config?.payTaxPercent || 0) === p ? 'selected' : ''}>${p}%</option>`).join('')}
          </select>
          <button class="btn secondary" id="save-pay-tax">Enregistrer</button>
        </div>

        <h2 style="margin-top:18px; font-size:0.85rem;">🎨 Personnalisation de la monnaie (roadmap n°425)</h2>
        <div class="row" style="gap:8px;">
          <input type="text" id="currency-name" placeholder="pieces" value="${escapeHtml(config?.currencyName || '')}" style="flex:1; margin:0;" />
          <input type="text" id="currency-emoji" placeholder="🪙" value="${escapeHtml(config?.currencyEmoji || '')}" style="width:70px; margin:0;" />
          <button class="btn secondary" id="save-currency">Enregistrer</button>
        </div>

        <h2 style="margin-top:18px; font-size:0.85rem;">👋 Bonus de bienvenue (roadmap n°427)</h2>
        <label for="welcome-bonus">Montant offert a l'arrivee d'un nouveau membre (0 = desactive)</label>
        <input type="number" id="welcome-bonus" value="${config?.welcomeBonusAmount || 0}" min="0" />
        <button class="btn secondary" id="save-welcome-bonus" style="margin-top:8px;">Enregistrer</button>

        <h2 style="margin-top:18px; font-size:0.85rem;">📈 Plafond de richesse (roadmap n°686)</h2>
        <label for="wealth-cap">Solde maximum par membre (0 = illimite)</label>
        <input type="number" id="wealth-cap" value="${config?.wealthCap || 0}" min="0" />
        <button class="btn secondary" id="save-wealth-cap" style="margin-top:8px;">Enregistrer</button>

        <h2 style="margin-top:18px; font-size:0.85rem;">🎟️ Loterie hebdomadaire (roadmap n°496)</h2>
        <p class="muted">Chaque /daily reclame achete automatiquement 1 ticket. Un gagnant tire au sort chaque semaine remporte la cagnotte. Pour un tirage au sort ponctuel (pas automatique/hebdomadaire), voir <button type="button" class="btn secondary" id="economie-goto-giveaways" style="display:inline; padding:2px 8px; font-size:0.78rem;">🎉 Giveaways</button>.</p>
        <label class="dp-toggle-row"><span>Loterie active</span><input type="checkbox" id="lottery-enabled" ${config?.lotteryEnabled ? 'checked' : ''} /></label>
        <label for="lottery-ticket-price">Prix du ticket (deduit du solde a chaque /daily si active)</label>
        <input type="number" id="lottery-ticket-price" value="${config?.lotteryTicketPrice ?? 10}" min="0" />
        <button class="btn secondary" id="save-lottery" style="margin-top:8px;">Enregistrer</button>

        <h2 style="margin-top:18px; font-size:0.85rem;">Classement richesse</h2>
        <div id="economy-leaderboard">${economyLeaderboardRows}</div>
      `, { id: 'economie' })}

      ${sectionHtml('Cooldowns par commande', `
        <p class="muted">Delai minimum (en secondes) entre deux utilisations de la meme commande par un membre. 0 = pas de limite. Les commandes de moderation/configuration (staff uniquement) ne sont pas concernees. Pour un garde-fou anti-spam plus large (pas commande par commande), voir <button type="button" class="dp-quickjump-btn" data-jump-to="automod" style="display:inline; vertical-align:baseline;">🚫 Auto-moderation</button>.</p>
        <div class="dp-form-grid">
          ${COOLDOWN_COMMANDS.map((cmd) => `
            <div>
              <label for="cooldown-${cmd}">/${cmd}</label>
              <input type="number" id="cooldown-${cmd}" min="0" max="86400" value="${config?.commandCooldowns?.[cmd] || 0}" />
            </div>`).join('')}
        </div>
        <button class="btn secondary" id="save-cooldowns" style="margin-top:8px;">Enregistrer les cooldowns</button>
      `, { id: 'cooldowns' })}

      ${sectionHtml('Auto-moderation', `
        <p class="muted" style="font-size:0.78rem;">Pour une reaction a un evenement precis (mot-cle, arrivee d'un membre) plutot qu'un filtre general, voir <button type="button" class="dp-quickjump-btn" data-jump-to="regles" style="display:inline; vertical-align:baseline;">⚡ Regles si → alors</button>. Pour limiter une commande precise, voir <button type="button" class="dp-quickjump-btn" data-jump-to="cooldowns" style="display:inline; vertical-align:baseline;">⏳ Cooldowns</button>.</p>
        <label class="dp-toggle-row"><span>Auto-moderation active</span><input type="checkbox" id="am-enabled" ${modConfig.autoModEnabled ? 'checked' : ''} /></label>
        <label class="dp-toggle-row" style="margin-top:6px;"><span>Bloquer les liens d'invitation Discord</span><input type="checkbox" id="am-invites" ${modConfig.blockInvites ? 'checked' : ''} /></label>
        <label class="dp-toggle-row" style="margin-top:6px;"><span>Bloquer tous les liens</span><input type="checkbox" id="am-links" ${modConfig.blockLinks ? 'checked' : ''} /></label>
        <label for="am-spam-threshold">Seuil anti-spam (messages)</label>
        <input type="number" id="am-spam-threshold" value="${modConfig.spamMessageThreshold}" min="1" />
        <label for="am-banned-words">Mots bannis (separes par des virgules, prefixe "re:" pour une regex) — le message est SUPPRIME</label>
        <textarea id="am-banned-words">${escapeHtml((modConfig.bannedWords || []).join(', '))}</textarea>
        <label for="am-alert-keywords">Mots surveilles (separes par des virgules) — alerte le staff en modlog, le message N'EST PAS supprime (roadmap n°276)</label>
        <textarea id="am-alert-keywords" placeholder="suicide, arnaque, scam">${escapeHtml((modConfig.alertKeywords || []).join(', '))}</textarea>
        <label for="am-link-whitelist">Domaines autorises meme si "Bloquer tous les liens" est actif (separes par des virgules)</label>
        <textarea id="am-link-whitelist" placeholder="youtube.com, twitch.tv">${escapeHtml((modConfig.linkWhitelist || []).join(', '))}</textarea>
        <label class="dp-toggle-row" style="margin-top:6px;"><span>Anti-raid actif</span><input type="checkbox" id="am-antiraid" ${modConfig.antiRaidEnabled ? 'checked' : ''} /></label>
        <label for="am-antiraid-threshold">Seuil anti-raid (arrivees rapprochees)</label>
        <input type="number" id="am-antiraid-threshold" value="${modConfig.antiRaidJoinThreshold}" min="1" />
        <label for="am-warn-expiry">Expiration des avertissements apres N jours (roadmap n°280, 0 = jamais)</label>
        <input type="number" id="am-warn-expiry" value="${config?.warnExpiryDays ?? 0}" min="0" />
        <p class="muted" style="font-size:0.76rem; margin-top:-6px;">Un avertissement expire n'apparait plus dans /warnings mais reste visible (attenue) dans le casier du dashboard.</p>
        <label for="am-auto-timeout">Timeout automatique apres N infractions en 1 h (0 = jamais)</label>
        <input type="number" id="am-auto-timeout" value="${modConfig.autoTimeoutAfterWarns ?? 3}" min="0" />
        <label for="am-auto-timeout-min">Duree du timeout automatique (minutes)</label>
        <input type="number" id="am-auto-timeout-min" value="${modConfig.autoTimeoutMinutes ?? 10}" min="1" />
        <div class="dp-subsection-divider"></div>
        <p class="dp-block-title">📶 Escalade configurable (roadmap n°271)</p>
        <p class="muted" style="font-size:0.76rem;">Sur le total d'avertissements actifs (/warn + automod). Distinct du timeout ci-dessus (limite a l'automod sur 1h). 0 = palier desactive.</p>
        <label for="am-escalation-timeout">Timeout a partir de N avertissements</label>
        <input type="number" id="am-escalation-timeout" value="${modConfig.escalationTimeoutWarns ?? 0}" min="0" />
        <label for="am-escalation-timeout-min">Duree de ce timeout (minutes)</label>
        <input type="number" id="am-escalation-timeout-min" value="${modConfig.escalationTimeoutMinutes ?? 10}" min="1" />
        <label for="am-escalation-kick">Exclusion (kick) a partir de N avertissements</label>
        <input type="number" id="am-escalation-kick" value="${modConfig.escalationKickWarns ?? 0}" min="0" />
        <label for="am-escalation-ban">Bannissement a partir de N avertissements</label>
        <input type="number" id="am-escalation-ban" value="${modConfig.escalationBanWarns ?? 0}" min="0" />
        <div class="dp-subsection-divider"></div>
        <label class="dp-toggle-row" style="margin-top:6px;"><span>Slowmode automatique en cas de pic de messages</span><input type="checkbox" id="am-auto-slowmode" ${modConfig.autoSlowmodeEnabled ? 'checked' : ''} /></label>
        <label for="am-slowmode-threshold">Seuil du slowmode (messages par 10 s dans un salon)</label>
        <input type="number" id="am-slowmode-threshold" value="${modConfig.autoSlowmodeMsgPer10s ?? 20}" min="5" />
        <div class="dp-subsection-divider"></div>
        <p class="dp-block-title">🆕 Comptes recents (roadmap n°275)</p>
        <p class="muted" style="font-size:0.76rem;">Action automatique a l'arrivee quand le compte Discord du membre a moins de N jours — utile contre les vagues de faux comptes.</p>
        <label class="dp-toggle-row"><span>Garde-fou comptes recents actif</span><input type="checkbox" id="am-newaccount-enabled" ${modConfig.newAccountGuardEnabled ? 'checked' : ''} /></label>
        <label for="am-newaccount-age">Age maximum du compte (jours)</label>
        <input type="number" id="am-newaccount-age" value="${modConfig.newAccountMaxAgeDays ?? 7}" min="1" />
        <label for="am-newaccount-action">Action</label>
        <select id="am-newaccount-action">
          <option value="alert" ${modConfig.newAccountAction === 'alert' ? 'selected' : ''}>Alerter le staff en modlog</option>
          <option value="role" ${modConfig.newAccountAction === 'role' ? 'selected' : ''}>Attribuer un role de quarantaine</option>
          <option value="kick" ${modConfig.newAccountAction === 'kick' ? 'selected' : ''}>Exclure (kick)</option>
          <option value="ban" ${modConfig.newAccountAction === 'ban' ? 'selected' : ''}>Bannir</option>
        </select>
        <label for="am-newaccount-role">Role de quarantaine (si action = role)</label>
        <select id="am-newaccount-role"><option value="">Aucun</option>${roleOptions(modConfig.newAccountRoleId)}</select>
        <button class="btn" id="save-modconfig" style="margin-top:12px;">Enregistrer</button>

        <div class="dp-subsection-divider"></div>
        <p class="dp-block-title">📝 Motifs de sanction (roadmap n°272)</p>
        <p class="muted" style="font-size:0.78rem;">Suggeres par autocompletion dans le champ "raison" de /warn, /timeout et /tempban — un par ligne. Vide = liste par defaut.</p>
        <textarea id="am-sanction-reasons" placeholder="Spam&#10;Propos injurieux ou insultants&#10;Contenu NSFW hors salon dedie">${escapeHtml((config?.sanctionReasonPresets || []).join('\n'))}</textarea>
        <button class="btn secondary" id="save-sanction-reasons" style="margin-top:8px;">Enregistrer les motifs et l'expiration</button>
      `, { id: 'automod' })}

      ${sectionHtml('Contestations de sanction', `
        <p class="muted">Formulaire rempli par un membre sanctionne depuis le bouton "⚖️ Contester cette sanction" dans son DM (roadmap n°279).</p>
        <div id="sanction-contests-list">
          ${(() => {
    const pending = sanctionContests.filter((c) => c.status !== 'resolved');
    if (!pending.length) return '<p class="muted">Aucune contestation en attente.</p>';
    const typeLabels = { warn: 'Avertissement', timeout: 'Timeout', kick: 'Exclusion', ban: 'Bannissement', tempban: 'Bannissement temporaire' };
    return pending.map((c) => `
              <div class="row" data-contest="${c.id}" style="justify-content:space-between; align-items:flex-start; gap:10px; padding:8px 0; border-bottom:1px solid var(--border);">
                <div style="flex:1;">
                  <p style="margin:0; font-size:0.84rem;"><strong>${escapeHtml(c.targetTag || c.targetId)}</strong> — ${escapeHtml(typeLabels[c.sanctionType] || c.sanctionType)} <span class="muted">(${new Date(c.createdAt).toLocaleString('fr-FR')})</span></p>
                  <p class="muted" style="margin:4px 0 0; font-size:0.82rem; white-space:pre-wrap;">${escapeHtml(c.message || '')}</p>
                </div>
                <button type="button" class="btn secondary resolve-contest" data-contest-id="${c.id}">Marquer traitee</button>
              </div>`).join('');
  })()}
        </div>
      `, { id: 'contestations' })}

      ${sectionHtml('Roles de niveau (XP)', `
        <div id="level-roles-list">${levelRoleRows}</div>
        <div class="row" style="margin-top:10px; flex-wrap:wrap; gap:8px;">
          <input type="number" id="new-level" placeholder="Niveau" aria-label="Niveau" min="1" style="width:100px; margin:0;" />
          <select id="new-level-role" aria-label="Role attribue a ce niveau" style="margin:0;"><option value="">Aucun role</option>${roleOptions()}</select>
          <input type="number" id="new-level-bonus" placeholder="Bonus 🪙 (optionnel)" aria-label="Bonus economie" min="1" style="width:150px; margin:0;" />
        </div>
        <input type="text" id="new-level-announce" placeholder="Annonce custom (optionnel) — {user} et {level} remplaces" aria-label="Annonce personnalisee" maxlength="200" style="margin-top:8px;" />
        <button class="btn secondary" id="add-level-role" style="margin-top:8px;">Ajouter le palier</button>
        <h2 style="margin-top:18px; font-size:0.85rem;">⚡ Vitesse de progression</h2>
        <label for="xp-rate">Taux d'XP global (s'applique aux messages et au vocal)</label>
        <select id="xp-rate">
          ${[['0.5', 'x0.5 — progression lente'], ['1', 'x1 — normal'], ['1.5', 'x1.5 — rapide'], ['2', 'x2 — tres rapide'], ['3', 'x3 — evenement special']]
    .map(([v, l]) => `<option value="${v}"${String(config?.xpRate || 1) === v ? ' selected' : ''}>${l}</option>`).join('')}
        </select>
        <label for="xp-booster-mult">Multiplicateur XP pour les boosters du serveur (roadmap n°293)</label>
        <select id="xp-booster-mult">
          ${[['1', 'x1 — aucun bonus'], ['1.5', 'x1.5'], ['2', 'x2'], ['3', 'x3']]
    .map(([v, l]) => `<option value="${v}"${String(config?.xpBoosterMultiplier || 1) === v ? ' selected' : ''}>${l}</option>`).join('')}
        </select>
        <label for="weekly-quest-goal">Objectif hebdo (roadmap n°297) : messages a atteindre pour un bonus (0 = desactive)</label>
        <input type="number" id="weekly-quest-goal" value="${config?.weeklyQuestGoal ?? 0}" min="0" />
        <label for="weekly-quest-bonus">Bonus XP a l'objectif atteint</label>
        <input type="number" id="weekly-quest-bonus" value="${config?.weeklyQuestBonusXp ?? 200}" min="1" />
        <label for="xp-boost-channel">Salon booste (XP multipliee dans ce salon uniquement)</label>
        <div class="row" style="gap:8px; flex-wrap:wrap;">
          <select id="xp-boost-channel" style="flex:2; min-width:150px;">${channels.filter((c) => c.type === 0).map((c) => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('')}</select>
          <select id="xp-boost-mult" aria-label="Multiplicateur" style="flex:1; min-width:90px;">
            <option value="">Aucun boost</option>
            <option value="1.5">x1.5</option>
            <option value="2">x2</option>
            <option value="3">x3</option>
          </select>
        </div>
        <div id="xp-boosts-list" class="muted" style="font-size:0.8rem; margin-top:6px;">
          ${Object.entries(config?.xpChannelBoosts || {}).map(([cid, m]) => `• #${escapeHtml(channels.find((c) => c.id === cid)?.name || cid)} : x${m}`).join('<br>') || 'Aucun salon booste.'}
        </div>
        <label style="margin-top:14px;">Salons exclus de l'XP (roadmap n°294 — ex. bot-commandes)</label>
        <div class="channel-picker">
          ${channels.filter((c) => c.type === 0 || c.type === 2).map((c) => `
            <label><input type="checkbox" value="${c.id}" class="xp-excluded-channel" ${(config?.xpExcludedChannels || []).includes(c.id) ? 'checked' : ''} /> ${c.type === 2 ? '🔊' : '#'} ${escapeHtml(c.name)}</label>
          `).join('')}
        </div>
        <button class="btn" id="save-xp-config" style="margin-top:10px;">Enregistrer la vitesse d'XP</button>

        <h2 style="margin-top:18px; font-size:0.85rem;">📣 Annonce de niveau (roadmap n°296)</h2>
        <label for="levelup-mode">Ou annoncer un passage de niveau</label>
        <select id="levelup-mode">
          <option value="channel" ${(config?.levelUpAnnounceMode || 'channel') === 'channel' ? 'selected' : ''}>Dans un salon (celui du message par defaut, ou un salon dedie ci-dessous)</option>
          <option value="dm" ${config?.levelUpAnnounceMode === 'dm' ? 'selected' : ''}>En message prive au membre</option>
          <option value="off" ${config?.levelUpAnnounceMode === 'off' ? 'selected' : ''}>Ne jamais annoncer</option>
        </select>
        <label for="levelup-channel">Salon dedie (optionnel — sinon le message du niveau atteint reste dans le salon d'origine)</label>
        <select id="levelup-channel">
          <option value="">Aucun (salon d'origine)</option>
          ${channels.filter((c) => c.type === 0).map((c) => `<option value="${c.id}" ${config?.levelUpAnnounceChannelId === c.id ? 'selected' : ''}>#${escapeHtml(c.name)}</option>`).join('')}
        </select>
        <button class="btn secondary" id="save-levelup-announce" style="margin-top:8px;">Enregistrer</button>
        <p class="muted" style="font-size:0.76rem; margin-top:6px;">Le bot applique les changements sous 5 minutes.</p>
        <h2 style="margin-top:18px; font-size:0.85rem;">♻️ Reinitialisation XP</h2>
        <p class="muted">Remet l'XP a zero — un membre precis (ID) ou tout le serveur. Irreversible.</p>
        <div class="row" style="gap:8px; flex-wrap:wrap;">
          <input type="text" id="xp-reset-user" placeholder="ID du membre (vide = tout le serveur)" aria-label="ID du membre a reinitialiser" style="width:260px; margin:0;" />
          <button class="btn danger" id="xp-reset-btn">Reinitialiser</button>
        </div>

        <h2 style="margin-top:18px; font-size:0.85rem;">🌍 Classement public</h2>
        <p class="muted">Un lien en lecture seule du top 20 (pseudo, niveau, XP — aucun identifiant), a partager hors Discord.</p>
        ${config?.publicLeaderboardToken
    ? `<div class="row" style="gap:8px; flex-wrap:wrap;">
             <input type="text" readonly id="public-lb-link" aria-label="Lien du classement public" value="https://yolscript.github.io/DiscordServeurCreator/leaderboard.html?g=${id}&t=${escapeHtml(config.publicLeaderboardToken)}" style="flex:1; min-width:220px; margin:0;" />
             <button class="btn secondary" id="copy-public-lb">📋 Copier</button>
             <button class="btn danger" id="toggle-public-lb" data-enable="false">Desactiver</button>
           </div>`
    : '<button class="btn secondary" id="toggle-public-lb" data-enable="true">Activer le lien public</button>'}
      `, { id: 'niveaux' })}

      ${sectionHtml('Suggestions des membres', `
        <p class="muted">Les suggestions postees via /suggest, avec leurs votes et le statut pose par le staff (boutons sous chaque suggestion dans Discord).</p>
        <div id="suggestions-list">${(await Api.suggestions(id).catch(() => [])).slice().reverse().slice(0, 30).map((s) => {
    const statusInfo = { pending: ['🟡 A l\'etude', 'var(--warning)'], approved: ['🟢 Acceptee', 'var(--success)'], denied: ['🔴 Refusee', 'var(--danger)'] }[s.status] || ['🟡 A l\'etude', 'var(--warning)'];
    return `
          <div class="suggestion-row">
            <div class="suggestion-text">${escapeHtml((s.text || '').slice(0, 200))}</div>
            <div class="muted" style="font-size:0.76rem;">${escapeHtml(s.authorTag || '')} · 👍 ${(s.upvotes || []).length} · 👎 ${(s.downvotes || []).length}</div>
            <span class="suggestion-status" style="color:${statusInfo[1]}">${statusInfo[0]}</span>
          </div>`;
  }).join('') || '<p class="muted">Aucune suggestion pour le moment.</p>'}</div>
      `, { id: 'suggestions' })}

      ${sectionHtml('Signalements', `
        <p class="muted">Les membres signalent un message via clic droit → Applications → « Signaler au staff ». Tout arrive ici (et dans le journal de moderation). Si un signalement necessite un suivi individuel, ouvre plutot un <button type="button" class="dp-quickjump-btn" data-jump-to="tickets" style="display:inline; vertical-align:baseline;">🎫 Ticket</button> avec le membre.</p>
        <div id="reports-list">${(await Api.reports(id).catch(() => [])).slice().reverse().slice(0, 30).map((r) => `
          <div class="row" style="justify-content:space-between; margin-bottom:6px; ${r.status === 'resolved' ? 'opacity:0.55;' : ''}">
            <span style="min-width:0; font-size:0.84rem;">
              ${r.status === 'resolved' ? '✅' : '🚩'} <strong>${escapeHtml(r.authorTag)}</strong> — « ${escapeHtml(r.excerpt.slice(0, 120))} »
              <span class="muted" style="font-size:0.74rem;">signale par ${escapeHtml(r.reporterTag)} le ${new Date(r.reportedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}${r.resolvedBy ? ` · traite par ${escapeHtml(r.resolvedBy)}` : ''}</span>
            </span>
            <span style="flex:none; display:flex; gap:6px;">
              <a class="btn secondary" href="https://discord.com/channels/${id}/${r.channelId}/${r.messageId}" target="_blank" rel="noopener">Voir</a>
              ${r.status === 'open' ? `<button class="btn secondary report-resolve" data-report-id="${r.id}">Traite</button>` : ''}
            </span>
          </div>`).join('') || '<p class="muted">Aucun signalement. C\'est bon signe.</p>'}</div>
      `, { id: 'signalements' })}

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
        <p class="muted" style="font-size:0.78rem;">Pour suivre un blog/site externe (pas Twitch/YouTube), voir <button type="button" class="dp-quickjump-btn" data-jump-to="rss" style="display:inline; vertical-align:baseline;">📰 Flux RSS</button>.</p>
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

        <h2 style="margin-top:18px; font-size:0.85rem;">💜 Abonnes Twitch</h2>
        ${config?.twitchBroadcasterLogin
    ? await (async () => {
      const data = await Api.twitchSubs(id).catch(() => null);
      const subsRows = (data?.subs || []).slice(0, 30).map((s) => `<span class="dp-chip" style="margin:2px;">${escapeHtml(s.name)} · T${s.tier}${s.isGift ? ' 🎁' : ''}</span>`).join('') || '<p class="muted">Aucun abonne dans la derniere sync.</p>';
      return `
            <p class="muted">Compte connecte : <strong>${escapeHtml(config.twitchBroadcasterLogin)}</strong>${data ? ` — ${data.total} abonne(s), sync ${new Date(data.syncedAt).toLocaleString('fr-FR')}` : ' — aucune sync encore.'} Sync automatique chaque nuit a 4h.</p>
            <div style="margin:8px 0; display:flex; flex-wrap:wrap; gap:2px;">${subsRows}</div>
            <div class="row" style="gap:8px;">
              <button class="btn secondary" id="twitch-sync-now">🔄 Synchroniser maintenant</button>
              <button class="btn danger" id="twitch-disconnect">Deconnecter</button>
            </div>`;
    })()
    : `
          <p class="muted">Connecte le compte Twitch du streamer pour synchroniser la liste de ses abonnes (nombre, pseudos, tiers) dans le dashboard. Sync automatique quotidienne.</p>
          <a class="btn secondary" href="${escapeHtml(window.API_BASE_URL)}/twitch/login?guild=${id}">💜 Connecter un compte Twitch</a>`}
      `, { id: 'streamers' })}

      ${sectionHtml('Annonces programmees', `
        <p class="muted" style="font-size:0.78rem;">Pour une alerte navigateur (pas un message Discord), voir <button type="button" class="dp-quickjump-btn" data-jump-to="notifications" style="display:inline; vertical-align:baseline;">🔔 Notifications push</button>.</p>
        <label class="dp-toggle-row" style="margin-bottom:12px;">
          <span>Publication croisee automatique (les messages des salons d'annonces sont publies vers les serveurs abonnes)</span>
          <input type="checkbox" id="auto-crosspost-toggle" ${config?.autoCrosspost ? 'checked' : ''} />
        </label>
        <div id="scheduled-list">${scheduledRows}</div>
        <div style="margin-top:10px;">
          <label for="new-scheduled-channel">Salon</label>
          <select id="new-scheduled-channel">${textChannelOptions}</select>
          <label for="new-scheduled-message">Message</label>
          <textarea id="new-scheduled-message"></textarea>
          <label for="new-scheduled-mention">Mentionner (roadmap n°185)</label>
          <select id="new-scheduled-mention">
            <option value="">Personne</option>
            <option value="@everyone">@everyone (tout le serveur)</option>
            ${roles.filter((r) => r.name !== '@everyone').map((r) => `<option value="<@&${r.id}>">@${escapeHtml(r.name)}</option>`).join('')}
          </select>
          <label for="new-scheduled-date">Date et heure</label>
          <input type="datetime-local" id="new-scheduled-date" />
          <label class="dp-toggle-row" style="margin-top:10px;">
            <span>Repeter tous les jours a cette heure</span>
            <input type="checkbox" id="new-scheduled-daily" />
          </label>
          <button class="btn secondary" id="add-scheduled" style="margin-top:8px;">Programmer</button>
        </div>

        <h2 style="margin-top:18px; font-size:0.85rem;">🗓️ Compte a rebours</h2>
        ${config?.countdown
    ? `<p class="muted">Salon actif : <strong>${escapeHtml(config.countdown.label)}</strong> — echeance le ${new Date(config.countdown.targetAt).toLocaleDateString('fr-FR')}. Le nom du salon se met a jour chaque heure, puis il est nettoye 2 jours apres la date.</p>
           <button class="btn danger" id="delete-countdown">Retirer le compte a rebours</button>`
    : `<p class="muted">Cree un salon vocal verrouille dont le nom affiche « J-N » jusqu'a ton evenement.</p>
           <div class="row" style="gap:8px; flex-wrap:wrap;">
             <input type="text" id="countdown-label" maxlength="60" placeholder="Ex : Grand tournoi" aria-label="Nom de l'evenement" style="width:200px; margin:0;" />
             <input type="date" id="countdown-date" aria-label="Date de l'evenement" style="margin:0;" />
             <button class="btn secondary" id="create-countdown">Creer</button>
           </div>`}

        <h2 style="margin-top:18px; font-size:0.85rem;">☀️ Question du jour</h2>
        <p class="muted">Chaque jour a l'heure choisie, le bot poste une question de ta liste (rotation) sous forme de sondage Oui/Non/Sans avis.</p>
        <div class="dp-form-grid">
          <div>
            <label for="dailypoll-channel">Salon</label>
            <select id="dailypoll-channel"><option value="">— Desactive —</option>${textChannelOptions}</select>
          </div>
          <div>
            <label for="dailypoll-hour">Heure de publication (locale)</label>
            <select id="dailypoll-hour">${Array.from({ length: 24 }, (_, h) => `<option value="${h}">${h}h00</option>`).join('')}</select>
          </div>
          <div class="dp-form-full">
            <label for="dailypoll-questions">Questions (une par ligne, 30 max)</label>
            <textarea id="dailypoll-questions" maxlength="4000" placeholder="Pizza ananas : pour ou contre ?&#10;Plutot lever tot ou coucher tard ?"></textarea>
          </div>
        </div>
        <button class="btn secondary" id="save-dailypoll" style="margin-top:8px;">Enregistrer la question du jour</button>

        <h2 style="margin-top:18px; font-size:0.85rem;">📅 Calendrier externe</h2>
        <p class="muted">Un flux iCal des evenements Discord planifies et des annonces programmees, a abonner dans Google Agenda, Outlook ou Apple Calendar (Ajouter un agenda &gt; Par URL).</p>
        ${config?.calendarToken
    ? `<div class="row" style="gap:8px; flex-wrap:wrap;">
             <input type="text" readonly id="calendar-feed-link" aria-label="Lien du calendrier externe" value="${escapeHtml(window.API_BASE_URL)}/public/calendar?guild=${id}&token=${escapeHtml(config.calendarToken)}" style="flex:1; min-width:220px; margin:0;" />
             <button class="btn secondary" id="copy-calendar-feed">📋 Copier</button>
             <button class="btn danger" id="toggle-calendar-feed" data-enable="false">Desactiver</button>
           </div>`
    : '<button class="btn secondary" id="toggle-calendar-feed" data-enable="true">Activer le flux calendrier</button>'}
      `, { id: 'annonces' })}

      ${sectionHtml('Regles si → alors', `
        <p class="muted">Quand un evenement se produit, le bot agit automatiquement. 10 regles maximum. Pour un filtre general (spam, liens, mots bannis) plutot qu'un evenement precis, voir <button type="button" class="dp-quickjump-btn" data-jump-to="automod" style="display:inline; vertical-align:baseline;">🚫 Auto-moderation</button>.</p>
        <div id="rules-list">${(config?.autoRules || []).map((r) => {
    const trigLabel = r.trigger?.type === 'member_join' ? 'Un membre arrive' : `Message contenant « ${escapeHtml(r.trigger?.keyword || '')} »${r.trigger?.channelId ? ` dans #${escapeHtml(channels.find((c) => c.id === r.trigger.channelId)?.name || '?')}` : ''}`;
    const actLabel = r.action?.type === 'add_role'
      ? `donner le role ${escapeHtml(roles.find((ro) => ro.id === r.action.roleId)?.name || '?')}`
      : r.action?.type === 'react'
        ? `reagir ${escapeHtml(r.action.emoji || '')}`
        : r.action?.type === 'reply'
          ? 'repondre au message'
          : `envoyer un message dans #${escapeHtml(channels.find((c) => c.id === r.action?.channelId)?.name || '?')}`;
    return `
          <div class="row" style="justify-content:space-between; margin-bottom:6px;">
            <span style="font-size:0.85rem;">⚡ Si <strong>${trigLabel}</strong> → ${actLabel}</span>
            <button class="btn danger delete-rule" data-rule-id="${r.id}">Supprimer</button>
          </div>`;
  }).join('') || '<p class="muted">Aucune regle pour le moment.</p>'}</div>
        <div class="dp-form-grid" style="margin-top:10px;">
          <div>
            <label for="rule-trigger">Si...</label>
            <select id="rule-trigger">
              <option value="member_join">Un membre arrive</option>
              <option value="keyword">Un message contient un mot-cle</option>
            </select>
          </div>
          <div id="rule-keyword-wrap" style="display:none;">
            <label for="rule-keyword">Mot-cle</label>
            <input type="text" id="rule-keyword" maxlength="50" placeholder="ex : bienvenue" />
          </div>
          <div id="rule-trigchan-wrap" style="display:none;">
            <label for="rule-trigchan">Dans le salon (optionnel)</label>
            <select id="rule-trigchan"><option value="">Tous les salons</option>${textChannelOptions}</select>
          </div>
          <div>
            <label for="rule-action">Alors...</label>
            <select id="rule-action">
              <option value="add_role">Donner un role</option>
              <option value="send_message">Envoyer un message</option>
              <option value="reply">Repondre au message (repondeur)</option>
              <option value="react">Reagir avec un emoji</option>
            </select>
          </div>
          <div id="rule-role-wrap">
            <label for="rule-role">Role a donner</label>
            <select id="rule-role">${roles.filter((r) => r.name !== '@everyone').map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}</select>
          </div>
          <div id="rule-chan-wrap" style="display:none;">
            <label for="rule-chan">Salon du message</label>
            <select id="rule-chan">${textChannelOptions}</select>
          </div>
          <div id="rule-emoji-wrap" style="display:none;">
            <label for="rule-emoji">Emoji</label>
            <input type="text" id="rule-emoji" maxlength="8" placeholder="👍" />
          </div>
          <div id="rule-msg-wrap" class="dp-form-full" style="display:none;">
            <label for="rule-msg">Message ({user} et {server} disponibles)</label>
            <textarea id="rule-msg" maxlength="1000" placeholder="Bienvenue {user} sur {server} !"></textarea>
          </div>
        </div>
        <button class="btn secondary" id="rule-add" style="margin-top:8px;">Ajouter la regle</button>
        <p class="muted" style="font-size:0.76rem; margin-top:6px;">Le bot applique les changements sous 1 minute. Anti-spam : une regle mot-cle ne se declenche qu'une fois toutes les 30 s.</p>
      `, { id: 'regles' })}

      ${sectionHtml('Service (Staff en service)', `
        <p class="muted">Le salon vocal SERVICE STAFF (categorie 🛡️ Staff) sert d'interrupteur : un membre du staff qui s'y connecte est immediatement deconnecte et bascule son statut "en service", qui revele la categorie Staff et les categories/salons choisis ci-dessous.</p>
        <p class="muted" style="font-size:0.78rem;">💡 Pour masquer/reveler un salon ou une categorie precis sans passer par les listes ci-dessous, utilise le bouton 🛡️ « Service staff » dans le menu ⋮ de ce salon/categorie, a gauche.</p>

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
        <p class="muted" style="font-size:0.78rem;">Voir aussi <button type="button" class="dp-quickjump-btn" data-jump-to="signalements" style="display:inline; vertical-align:baseline;">🚩 Signalements</button> (origine possible d'un ticket) et <button type="button" class="dp-quickjump-btn" data-jump-to="contestations" style="display:inline; vertical-align:baseline;">⚖️ Contestations de sanction</button>.</p>
        <label>Roles autorises a voir/repondre aux tickets (si non limite au service)</label>
        <div class="channel-picker" style="max-height:160px">
          ${roles.filter((r) => r.name !== '@everyone').map((r) => `
            <label><input type="checkbox" class="ticket-role" value="${r.id}" ${(config?.ticketAllowedRoleIds || [config?.moderateurRoleId, config?.adminRoleId].filter(Boolean)).includes(r.id) ? 'checked' : ''} /> ${escapeHtml(r.name)}</label>
          `).join('') || '<p class="muted">Aucun role.</p>'}
        </div>
        <button class="btn secondary" id="save-ticket-roles" style="margin-top:8px;">Enregistrer les roles autorises</button>

        <h2 style="margin-top:18px; font-size:0.85rem;">💬 Reponses pre-ecrites (/reponse)</h2>
        <p class="muted">Le staff les insere dans un ticket avec /reponse (autocomplete). 10 maximum.</p>
        <div id="canned-list">${(config?.cannedResponses || []).map((r) => `
          <div class="row" style="justify-content:space-between; margin-bottom:6px;">
            <span style="font-size:0.84rem; min-width:0;"><strong>${escapeHtml(r.name)}</strong> — <span class="muted">${escapeHtml(r.text.slice(0, 80))}</span></span>
            <button class="btn danger delete-canned" data-canned-id="${r.id}">Supprimer</button>
          </div>`).join('') || '<p class="muted">Aucune reponse pre-ecrite.</p>'}</div>
        <div class="row" style="margin-top:8px; gap:8px; flex-wrap:wrap;">
          <input type="text" id="new-canned-name" placeholder="Nom court (ex: bienvenue-ticket)" aria-label="Nom de la reponse" maxlength="50" style="width:220px; margin:0;" />
          <button class="btn secondary" id="add-canned">Ajouter</button>
        </div>
        <textarea id="new-canned-text" maxlength="1900" placeholder="Texte de la reponse..." style="margin-top:6px;"></textarea>

        <label class="dp-toggle-row" style="margin-top:18px;"><span>Assignation automatique equitable (roadmap n°306, au staff en service ayant le moins de tickets ouverts)</span><input type="checkbox" id="auto-assign-tickets" ${config?.autoAssignTickets ? 'checked' : ''} /></label>
        <label style="margin-top:18px;" for="max-open-tickets">Tickets ouverts simultanes maximum par membre (roadmap n°313)</label>
        <input type="number" id="max-open-tickets" value="${config?.maxOpenTicketsPerMember || 1}" min="1" style="max-width:120px;" />
        <button class="btn secondary" id="save-max-tickets" style="margin-top:8px;">Enregistrer</button>

        <h2 style="margin-top:18px; font-size:0.85rem;">⭐ Satisfaction moyenne par membre du staff (prive, roadmap n°311)</h2>
        <div id="staff-ratings-list">${staffRatingRows}</div>

        <h2 style="margin-top:18px; font-size:0.85rem;">Tickets</h2>
        <div id="tickets-list">${ticketRows}</div>
      `, { id: 'tickets' })}
    </div>
  `;
  wireQuickJump(container);

  document.getElementById('arrivee-goto-botstatus')?.addEventListener('click', () => {
    window.UISound?.select();
    withViewTransition(() => renderSettingsPanel(id, 'botstatus'));
  });
  document.getElementById('economie-goto-giveaways')?.addEventListener('click', () => {
    window.UISound?.select();
    withViewTransition(() => renderSettingsPanel(id, 'giveaways'));
  });
  document.getElementById('bots-goto-customcommands')?.addEventListener('click', () => {
    window.UISound?.select();
    withViewTransition(() => renderSettingsPanel(id, 'customcommands'));
  });

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

  document.getElementById('save-tenure-role').addEventListener('click', async () => {
    try {
      await Api.updateConfig(id, {
        tenureRoleId: document.getElementById('tenure-role-select').value || null,
        tenureDays: Math.max(1, Number(document.getElementById('tenure-days').value) || 30),
      });
      showToast('Role d\'anciennete enregistre.');
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
      await Api.updateConfig(id, {
        birthdayChannelId: document.getElementById('birthday-channel-select').value || null,
        birthdayRoleId: document.getElementById('birthday-role-select').value || null,
      });
      showToast('Salon d\'anniversaire enregistre.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('add-autoreact').addEventListener('click', async () => {
    const channelId = document.getElementById('new-autoreact-channel').value;
    const emoji = document.getElementById('new-autoreact-emoji').value.trim();
    if (!channelId || !emoji) { showToast('Choisis un salon et un emoji.', 'error'); return; }
    try {
      const autoReactChannels = { ...(config?.autoReactChannels || {}), [channelId]: emoji };
      await Api.updateConfig(id, { autoReactChannels });
      showToast('Reaction automatique ajoutee.');
      await renderAutomationsPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  container.querySelectorAll('.delete-autoreact').forEach((btn) => {
    btn.addEventListener('click', () => {
      undoableDelete(btn, 'Reaction automatique supprimee.', async () => {
        const autoReactChannels = { ...(config?.autoReactChannels || {}) };
        delete autoReactChannels[btn.dataset.channel];
        await Api.updateConfig(id, { autoReactChannels });
      });
    });
  });

  document.getElementById('save-thread-autoclose').addEventListener('click', async () => {
    try {
      const threadAutoCloseDays = Math.max(0, Number(document.getElementById('thread-autoclose-days').value) || 0);
      await Api.updateConfig(id, { threadAutoCloseDays });
      showToast('Fermeture automatique des threads enregistree.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  wirePushToggle(id, container);

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
      btn.addEventListener('click', () => {
        undoableDelete(btn, 'Webhook supprime.', async () => {
          currentWebhooks = currentWebhooks.filter((_, i) => i !== Number(btn.dataset.index));
          await Api.updateConfig(id, { outgoingWebhooks: currentWebhooks });
          refreshWebhookRows();
        });
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

  // Taxe /pay (roadmap n°201).
  document.getElementById('save-pay-tax')?.addEventListener('click', async () => {
    try {
      await Api.updateConfig(id, { payTaxPercent: Number(document.getElementById('pay-tax-percent').value) });
      showToast('Taxe sur les transferts enregistree.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('save-currency')?.addEventListener('click', async () => {
    try {
      await Api.updateConfig(id, {
        currencyName: document.getElementById('currency-name').value.trim() || undefined,
        currencyEmoji: document.getElementById('currency-emoji').value.trim() || undefined,
      });
      showToast('Monnaie personnalisee.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  document.getElementById('save-welcome-bonus')?.addEventListener('click', async () => {
    try {
      await Api.updateConfig(id, { welcomeBonusAmount: Math.max(0, Number(document.getElementById('welcome-bonus').value) || 0) });
      showToast('Bonus de bienvenue enregistre.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  document.getElementById('save-wealth-cap')?.addEventListener('click', async () => {
    try {
      await Api.updateConfig(id, { wealthCap: Math.max(0, Number(document.getElementById('wealth-cap').value) || 0) });
      showToast('Plafond de richesse enregistre.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  document.getElementById('save-lottery')?.addEventListener('click', async () => {
    try {
      await Api.updateConfig(id, {
        lotteryEnabled: document.getElementById('lottery-enabled').checked,
        lotteryTicketPrice: Math.max(0, Number(document.getElementById('lottery-ticket-price').value) || 0),
      });
      showToast('Loterie enregistree.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('add-shop-item').addEventListener('click', async () => {
    const name = document.getElementById('new-shop-name').value.trim();
    const price = Number(document.getElementById('new-shop-price').value);
    const roleId = document.getElementById('new-shop-role').value || null;
    const stockRaw = document.getElementById('new-shop-stock').value.trim();
    const stock = stockRaw ? Math.max(1, Number(stockRaw)) : null;
    if (!name || !price || price < 1) { showToast('Nom et prix valides requis.', 'error'); return; }
    try {
      await Api.addShopItem(id, { name, price, roleId, stock });
      showToast('Article ajoute.');
      await renderAutomationsPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  container.querySelectorAll('.delete-shop-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      undoableDelete(btn, 'Article de boutique supprime.', () => Api.deleteShopItem(id, btn.dataset.id));
    });
  });

  document.getElementById('save-membercount-template')?.addEventListener('click', async () => {
    try {
      await Api.updateConfig(id, {
        memberCountChannelNameTemplate: document.getElementById('membercount-template').value.trim() || '👥 Membres : {count}',
        memberCountGoal: Number(document.getElementById('membercount-goal').value) || null,
      });
      showToast('Salon compteur mis a jour (visible sous ~10 min).');
    } catch (err) {
      showToast(err.message, 'error');
    }
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
        alertKeywords: document.getElementById('am-alert-keywords').value.split(',').map((w) => w.trim()).filter(Boolean),
        linkWhitelist: document.getElementById('am-link-whitelist').value.split(',').map((w) => w.trim()).filter(Boolean),
        antiRaidEnabled: document.getElementById('am-antiraid').checked,
        antiRaidJoinThreshold: Number(document.getElementById('am-antiraid-threshold').value) || 8,
        autoTimeoutAfterWarns: Math.max(0, Number(document.getElementById('am-auto-timeout').value) || 0),
        autoTimeoutMinutes: Math.max(1, Number(document.getElementById('am-auto-timeout-min').value) || 10),
        autoSlowmodeEnabled: document.getElementById('am-auto-slowmode').checked,
        autoSlowmodeMsgPer10s: Math.max(5, Number(document.getElementById('am-slowmode-threshold').value) || 20),
        escalationTimeoutWarns: Math.max(0, Number(document.getElementById('am-escalation-timeout').value) || 0),
        escalationTimeoutMinutes: Math.max(1, Number(document.getElementById('am-escalation-timeout-min').value) || 10),
        escalationKickWarns: Math.max(0, Number(document.getElementById('am-escalation-kick').value) || 0),
        escalationBanWarns: Math.max(0, Number(document.getElementById('am-escalation-ban').value) || 0),
        newAccountGuardEnabled: document.getElementById('am-newaccount-enabled').checked,
        newAccountMaxAgeDays: Math.max(1, Number(document.getElementById('am-newaccount-age').value) || 7),
        newAccountAction: document.getElementById('am-newaccount-action').value,
        newAccountRoleId: document.getElementById('am-newaccount-role').value || null,
      });
      showToast('Auto-moderation enregistree.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  container.querySelectorAll('.resolve-contest').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await Api.resolveSanctionContest(id, btn.dataset.contestId);
        btn.closest('[data-contest]').remove();
        showToast('Contestation marquee comme traitee.');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  document.getElementById('save-sanction-reasons').addEventListener('click', async () => {
    try {
      const sanctionReasonPresets = document.getElementById('am-sanction-reasons').value
        .split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 25);
      const warnExpiryDays = Math.max(0, Number(document.getElementById('am-warn-expiry').value) || 0);
      await Api.updateConfig(id, { sanctionReasonPresets, warnExpiryDays });
      showToast('Motifs de sanction et expiration enregistres.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Flux RSS (roadmap n°099) : liste stockee dans config.rssFeeds, lue par
  // le bot toutes les 10 minutes.
  document.getElementById('add-rss-feed').addEventListener('click', async () => {
    const url = document.getElementById('new-rss-url').value.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) { showToast('URL de flux invalide.', 'error'); return; }
    const rssFeeds = [...(config?.rssFeeds || [])];
    if (rssFeeds.length >= 10) { showToast('10 flux maximum.', 'error'); return; }
    if (rssFeeds.some((f) => f.url === url)) { showToast('Ce flux est deja suivi.', 'error'); return; }
    rssFeeds.push({ url, channelId: document.getElementById('new-rss-channel').value });
    try {
      await Api.updateConfig(id, { rssFeeds });
      showToast('Flux suivi : les prochains articles seront postes.');
      await renderAutomationsPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  document.querySelectorAll('.delete-rss-feed').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Ne plus suivre ce flux ?')) return;
      const rssFeeds = (config?.rssFeeds || []).filter((_, i) => i !== Number(btn.dataset.index));
      try {
        await Api.updateConfig(id, { rssFeeds });
        showToast('Flux retire.');
        await renderAutomationsPage(id, container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  // Publication croisee automatique (roadmap n°101).
  document.getElementById('auto-crosspost-toggle').addEventListener('change', async (e) => {
    try {
      await Api.updateConfig(id, { autoCrosspost: e.target.checked });
      showToast(e.target.checked ? 'Publication croisee activee.' : 'Publication croisee desactivee.');
    } catch (err) {
      showToast(err.message, 'error');
      e.target.checked = !e.target.checked;
    }
  });

  // Webhook entrant (roadmap n°100).
  document.getElementById('toggle-inbound-webhook')?.addEventListener('click', async (e) => {
    const enable = e.currentTarget.dataset.enable === 'true';
    if (!enable && !window.confirm('Desactiver le webhook entrant ? L\'URL actuelle cessera de fonctionner.')) return;
    try {
      await Api.setInboundWebhook(id, enable, enable ? document.getElementById('inbound-webhook-channel').value : undefined);
      showToast(enable ? 'Webhook entrant actif : copie l\'URL.' : 'Webhook entrant desactive.');
      await renderAutomationsPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  document.getElementById('copy-inbound-webhook')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(document.getElementById('inbound-webhook-url').value);
      showToast('URL copiee.');
    } catch {
      showToast('Copie impossible (permission navigateur).', 'error');
    }
  });

  // Reset XP (roadmap n°200) : double confirmation pour le serveur entier.
  document.getElementById('xp-reset-btn')?.addEventListener('click', async () => {
    const userId = document.getElementById('xp-reset-user').value.trim();
    if (userId && !/^\d{5,25}$/.test(userId)) { showToast('ID de membre invalide.', 'error'); return; }
    if (!window.confirm(userId ? `Reinitialiser l'XP du membre ${userId} ?` : 'Reinitialiser l\'XP de TOUT le serveur ?')) return;
    if (!userId && window.prompt('Action irreversible. Tape RESET pour confirmer :') !== 'RESET') {
      showToast('Reinitialisation annulee.');
      return;
    }
    try {
      await Api.resetXp(id, userId);
      showToast(userId ? 'XP du membre reinitialisee.' : 'XP du serveur entierement reinitialisee.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Calendrier externe (roadmap n°102) : active/revoque le flux iCal.
  document.getElementById('toggle-calendar-feed')?.addEventListener('click', async (e) => {
    const enable = e.currentTarget.dataset.enable === 'true';
    if (!enable && !window.confirm('Desactiver le flux calendrier ? Les agendas abonnes cesseront de se mettre a jour.')) return;
    try {
      await Api.setCalendarFeed(id, enable);
      showToast(enable ? 'Flux calendrier active.' : 'Flux calendrier desactive.');
      await renderAutomationsPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  document.getElementById('copy-calendar-feed')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(document.getElementById('calendar-feed-link').value);
      showToast('Lien copie.');
    } catch {
      showToast('Copie impossible (permission navigateur).', 'error');
    }
  });

  // Classement public (roadmap n°087) : active/revoque le token de partage.
  document.getElementById('toggle-public-lb')?.addEventListener('click', async (e) => {
    const enable = e.currentTarget.dataset.enable === 'true';
    if (!enable && !window.confirm('Desactiver le lien public ? Le lien actuel cessera de fonctionner.')) return;
    try {
      await Api.setPublicLeaderboard(id, enable);
      showToast(enable ? 'Lien public active.' : 'Lien public desactive.');
      await renderAutomationsPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  document.getElementById('save-levelup-announce').addEventListener('click', async () => {
    try {
      await Api.updateConfig(id, {
        levelUpAnnounceMode: document.getElementById('levelup-mode').value,
        levelUpAnnounceChannelId: document.getElementById('levelup-channel').value || null,
      });
      showToast('Annonce de niveau enregistree.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('copy-public-lb')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(document.getElementById('public-lb-link').value);
      showToast('Lien copie.');
    } catch {
      showToast('Copie impossible (permission navigateur).', 'error');
    }
  });

  // Courbe d'XP (roadmap n°082) : taux global + boost par salon. Le select
  // multiplicateur vide retire le boost du salon choisi.
  document.getElementById('save-xp-config').addEventListener('click', async () => {
    const boosts = { ...(config?.xpChannelBoosts || {}) };
    const boostChannel = document.getElementById('xp-boost-channel').value;
    const boostMult = document.getElementById('xp-boost-mult').value;
    if (boostMult) boosts[boostChannel] = Number(boostMult);
    else delete boosts[boostChannel];
    const xpExcludedChannels = [...container.querySelectorAll('.xp-excluded-channel:checked')].map((el) => el.value);
    try {
      await Api.updateConfig(id, {
        xpRate: Number(document.getElementById('xp-rate').value) || 1,
        xpBoosterMultiplier: Number(document.getElementById('xp-booster-mult').value) || 1,
        weeklyQuestGoal: Math.max(0, Number(document.getElementById('weekly-quest-goal').value) || 0),
        weeklyQuestBonusXp: Math.max(1, Number(document.getElementById('weekly-quest-bonus').value) || 200),
        xpChannelBoosts: boosts,
        xpExcludedChannels,
      });
      showToast("Vitesse d'XP enregistree.");
      await renderAutomationsPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('add-level-role').addEventListener('click', async () => {
    const level = Number(document.getElementById('new-level').value);
    const roleId = document.getElementById('new-level-role').value;
    const bonus = Number(document.getElementById('new-level-bonus').value) || undefined;
    const announce = document.getElementById('new-level-announce').value.trim() || undefined;
    if (!level || (!roleId && !bonus && !announce)) { showToast('Niveau requis, avec au moins role, bonus ou annonce.', 'error'); return; }
    try {
      await Api.setLevelRole(id, level, { roleId: roleId || undefined, bonus, announce });
      showToast('Palier de niveau ajoute.');
      await renderAutomationsPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  container.querySelectorAll('.delete-level-role').forEach((btn) => {
    btn.addEventListener('click', () => {
      undoableDelete(btn, 'Role de niveau supprime.', () => Api.deleteLevelRole(id, btn.dataset.level));
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
    btn.addEventListener('click', () => {
      undoableDelete(btn, 'Role de parrainage supprime.', () => Api.deleteReferralRole(id, btn.dataset.count));
    });
  });

  // Abonnes Twitch (roadmap n°098) : sync manuelle et deconnexion.
  document.getElementById('twitch-sync-now')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const result = await Api.twitchSync(id);
      showToast(`${result.total} abonne(s) Twitch synchronise(s).`);
      await renderAutomationsPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
    }
  });
  document.getElementById('twitch-disconnect')?.addEventListener('click', async () => {
    if (!window.confirm('Deconnecter le compte Twitch ? La liste des abonnes sera supprimee du dashboard.')) return;
    try {
      await Api.twitchDisconnect(id);
      showToast('Compte Twitch deconnecte.');
      await renderAutomationsPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
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
    btn.addEventListener('click', () => {
      undoableDelete(btn, 'Streamer retire.', () => Api.deleteStreamer(id, btn.dataset.user, btn.dataset.platform));
    });
  });

  // Lien d'invitation du bot (roadmap n°190) : permissions Administrator —
  // le bot cree salons/roles/permissions, un mask partiel casserait tout.
  document.getElementById('copy-bot-invite')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('https://discord.com/oauth2/authorize?client_id=1526237674355036401&permissions=8&scope=bot%20applications.commands');
      showToast('Lien d\'invitation copie : partage-le pour installer le bot ailleurs.');
    } catch {
      showToast('Copie impossible (permission navigateur).', 'error');
    }
  });

  // Cooldowns par commande (roadmap n°184).
  document.getElementById('save-cooldowns')?.addEventListener('click', async () => {
    const commandCooldowns = {};
    COOLDOWN_COMMANDS.forEach((cmd) => {
      const val = Number(document.getElementById(`cooldown-${cmd}`).value) || 0;
      if (val > 0) commandCooldowns[cmd] = val;
    });
    try {
      await Api.updateConfig(id, { commandCooldowns });
      showToast('Cooldowns enregistres.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Reponses pre-ecrites (roadmap n°159) : CRUD dans config.cannedResponses.
  document.getElementById('add-canned')?.addEventListener('click', async () => {
    const name = document.getElementById('new-canned-name').value.trim();
    const text = document.getElementById('new-canned-text').value.trim();
    if (!name || !text) { showToast('Nom et texte requis.', 'error'); return; }
    const existing = config?.cannedResponses || [];
    if (existing.length >= 10) { showToast('10 reponses maximum.', 'error'); return; }
    if (existing.some((r) => r.name === name)) { showToast('Ce nom existe deja.', 'error'); return; }
    try {
      await Api.updateConfig(id, {
        cannedResponses: [...existing, { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name, text }],
      });
      showToast('Reponse ajoutee : disponible via /reponse.');
      await renderAutomationsPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  container.querySelectorAll('.delete-canned').forEach((btn) => {
    btn.addEventListener('click', () => {
      undoableDelete(btn, 'Reponse supprimee.', () => Api.updateConfig(id, {
        cannedResponses: (config?.cannedResponses || []).filter((r) => r.id !== btn.dataset.cannedId),
      }));
    });
  });

  // Signalements (roadmap n°147) : marquer traite.
  container.querySelectorAll('.report-resolve').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await Api.resolveReport(id, btn.dataset.reportId);
        showToast('Signalement marque comme traite.');
        await renderAutomationsPage(id, container);
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    });
  });

  // Compte a rebours (roadmap n°186).
  document.getElementById('create-countdown')?.addEventListener('click', async () => {
    const label = document.getElementById('countdown-label').value.trim();
    const dateVal = document.getElementById('countdown-date').value;
    if (!label || !dateVal) { showToast('Nom et date requis.', 'error'); return; }
    try {
      await Api.createCountdownChannel(id, label, new Date(`${dateVal}T20:00:00`).getTime());
      showToast('Salon compte a rebours cree en haut du serveur.');
      await renderAutomationsPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  document.getElementById('delete-countdown')?.addEventListener('click', async () => {
    if (!window.confirm('Retirer le compte a rebours ? Le salon sera supprime.')) return;
    try {
      await Api.deleteCountdownChannel(id);
      showToast('Compte a rebours retire.');
      await renderAutomationsPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Question du jour (roadmap n°162) : heure saisie en LOCAL, stockee en UTC
  // (le bot Render tourne en UTC).
  const utcOffsetHours = -Math.round(new Date().getTimezoneOffset() / 60);
  if (config?.dailyPoll) {
    document.getElementById('dailypoll-channel').value = config.dailyPoll.channelId || '';
    document.getElementById('dailypoll-hour').value = String((((config.dailyPoll.hourUtc ?? 17) + utcOffsetHours) + 24) % 24);
    document.getElementById('dailypoll-questions').value = (config.dailyPoll.questions || []).join('\n');
  }
  document.getElementById('save-dailypoll').addEventListener('click', async () => {
    const channelId = document.getElementById('dailypoll-channel').value;
    const questions = document.getElementById('dailypoll-questions').value
      .split('\n').map((q) => q.trim()).filter(Boolean).slice(0, 30);
    const localHour = Number(document.getElementById('dailypoll-hour').value);
    try {
      await Api.updateConfig(id, {
        dailyPoll: channelId && questions.length
          ? { channelId, hourUtc: ((localHour - utcOffsetHours) + 24) % 24, questions }
          : null,
      });
      showToast(channelId && questions.length ? 'Question du jour activee.' : 'Question du jour desactivee.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Regles si → alors (roadmap n°151) : formulaire dynamique + CRUD via
  // config.autoRules (le bot les lit avec un cache de 60 s).
  const ruleTriggerSel = document.getElementById('rule-trigger');
  const ruleActionSel = document.getElementById('rule-action');
  const refreshRuleForm = () => {
    const isKeyword = ruleTriggerSel.value === 'keyword';
    const action = ruleActionSel.value;
    document.getElementById('rule-keyword-wrap').style.display = isKeyword ? '' : 'none';
    document.getElementById('rule-trigchan-wrap').style.display = isKeyword ? '' : 'none';
    document.getElementById('rule-role-wrap').style.display = action === 'add_role' ? '' : 'none';
    document.getElementById('rule-chan-wrap').style.display = action === 'send_message' ? '' : 'none';
    document.getElementById('rule-msg-wrap').style.display = (action === 'send_message' || action === 'reply') ? '' : 'none';
    document.getElementById('rule-emoji-wrap').style.display = action === 'react' ? '' : 'none';
  };
  ruleTriggerSel.addEventListener('change', refreshRuleForm);
  ruleActionSel.addEventListener('change', refreshRuleForm);
  refreshRuleForm();

  document.getElementById('rule-add').addEventListener('click', async () => {
    const existingRules = config?.autoRules || [];
    if (existingRules.length >= 10) { showToast('10 regles maximum.', 'error'); return; }
    const triggerType = ruleTriggerSel.value;
    const actionType = ruleActionSel.value;
    const trigger = { type: triggerType };
    if (triggerType === 'keyword') {
      trigger.keyword = document.getElementById('rule-keyword').value.trim();
      if (!trigger.keyword) { showToast('Mot-cle requis.', 'error'); return; }
      const trigChan = document.getElementById('rule-trigchan').value;
      if (trigChan) trigger.channelId = trigChan;
    }
    if ((actionType === 'react' || actionType === 'reply') && triggerType !== 'keyword') {
      showToast('« Reagir » et « Repondre » ne marchent qu\'avec un declencheur mot-cle.', 'error');
      return;
    }
    const action = { type: actionType };
    if (actionType === 'add_role') action.roleId = document.getElementById('rule-role').value;
    if (actionType === 'send_message' || actionType === 'reply') {
      if (actionType === 'send_message') action.channelId = document.getElementById('rule-chan').value;
      action.message = document.getElementById('rule-msg').value.trim();
      if (!action.message) { showToast('Message requis.', 'error'); return; }
    }
    if (actionType === 'react') {
      action.emoji = document.getElementById('rule-emoji').value.trim();
      if (!action.emoji) { showToast('Emoji requis.', 'error'); return; }
    }
    try {
      await Api.updateConfig(id, {
        autoRules: [...existingRules, {
          id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, trigger, action, enabled: true,
        }],
      });
      showToast('Regle ajoutee.');
      await renderAutomationsPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  container.querySelectorAll('.delete-rule').forEach((btn) => {
    btn.addEventListener('click', () => {
      undoableDelete(btn, 'Regle supprimee.', () => Api.updateConfig(id, { autoRules: (config?.autoRules || []).filter((r) => r.id !== btn.dataset.ruleId) }));
    });
  });

  // Brouillon automatique (roadmap n°117) : le texte d'annonce en cours de
  // redaction survit a un refresh ou une navigation.
  const scheduledDraftKey = `dsc-draft-scheduled:${id}`;
  const scheduledMsgEl = document.getElementById('new-scheduled-message');
  const savedDraft = localStorage.getItem(scheduledDraftKey);
  if (savedDraft && !scheduledMsgEl.value) {
    scheduledMsgEl.value = savedDraft;
    scheduledMsgEl.insertAdjacentHTML('afterend', '<p class="muted" id="scheduled-draft-note" style="font-size:0.74rem; margin:4px 0 0;">📝 Brouillon restaure.</p>');
  }
  scheduledMsgEl.addEventListener('input', () => {
    if (scheduledMsgEl.value.trim()) localStorage.setItem(scheduledDraftKey, scheduledMsgEl.value);
    else localStorage.removeItem(scheduledDraftKey);
    document.getElementById('scheduled-draft-note')?.remove();
  });

  document.getElementById('add-scheduled').addEventListener('click', async () => {
    const channelId = document.getElementById('new-scheduled-channel').value;
    let message = document.getElementById('new-scheduled-message').value.trim();
    const dateVal = document.getElementById('new-scheduled-date').value;
    const daily = document.getElementById('new-scheduled-daily').checked;
    if (!channelId || !message || !dateVal) { showToast('Salon, message et date requis.', 'error'); return; }
    // Mention avec garde-fou (roadmap n°185).
    const mention = document.getElementById('new-scheduled-mention').value;
    if (mention === '@everyone' || /@everyone/.test(message)) {
      const membersCount = allGuilds.find((g) => g.guildId === id)?.memberCount;
      if (!window.confirm(`⚠️ Ce message notifiera TOUT le serveur${membersCount ? ` (${membersCount} membres)` : ''}${daily ? ', CHAQUE JOUR' : ''}. Confirmer ?`)) return;
    }
    if (mention && !message.includes(mention)) message = `${mention} ${message}`;
    try {
      await Api.addScheduled(id, {
        channelId, message, runAt: new Date(dateVal).getTime(), repeatIntervalMs: daily ? 86400000 : undefined,
      });
      localStorage.removeItem(scheduledDraftKey);
      showToast('Annonce programmee.');
      await renderAutomationsPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  container.querySelectorAll('.delete-scheduled').forEach((btn) => {
    btn.addEventListener('click', () => {
      undoableDelete(btn, 'Annonce programmee supprimee.', () => Api.deleteScheduled(id, btn.dataset.id));
    });
  });

  document.getElementById('save-max-tickets').addEventListener('click', async () => {
    try {
      const maxOpenTicketsPerMember = Math.max(1, Number(document.getElementById('max-open-tickets').value) || 1);
      await Api.updateConfig(id, { maxOpenTicketsPerMember });
      showToast('Limite enregistree.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('auto-assign-tickets').addEventListener('change', async (e) => {
    try {
      await Api.updateConfig(id, { autoAssignTickets: e.target.checked });
      showToast(e.target.checked ? 'Assignation automatique activee.' : 'Assignation automatique desactivee.');
    } catch (err) {
      showToast(err.message, 'error');
      e.target.checked = !e.target.checked;
    }
  });

  container.querySelectorAll('.ticket-priority-select').forEach((sel) => {
    sel.addEventListener('change', async () => {
      try {
        await Api.updateTicket(id, sel.dataset.id, { priority: sel.value });
        showToast('Priorite mise a jour.');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  container.querySelectorAll('.ticket-edit-tags').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const answer = window.prompt('Tags (separes par des virgules) :', btn.dataset.tags || '');
      if (answer === null) return;
      const tags = answer.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10);
      try {
        await Api.updateTicket(id, btn.dataset.id, { tags });
        showToast('Tags mis a jour.');
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

  // Reouverture d'un ticket ferme (roadmap n°202).
  container.querySelectorAll('.ticket-reopen').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Rouvrir ce ticket ? Un nouveau salon prive sera cree pour le membre.')) return;
      btn.disabled = true;
      try {
        await Api.reopenTicket(id, btn.dataset.id);
        showToast('Ticket rouvert : nouveau salon cree.');
        await renderAutomationsPage(id, container);
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    });
  });

  // Transcription HTML (roadmap n°158) : generee cote client depuis le
  // texte stocke par le bot a la fermeture.
  container.querySelectorAll('.ticket-transcript').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const tr = await Api.ticketTranscript(id, btn.dataset.id);
        const lines = tr.text.split('\n').map((l) => `<div class="line">${escapeHtml(l)}</div>`).join('');
        const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Transcription ${escapeHtml(tr.channelName || 'ticket')}</title><style>body{font:14px/1.7 ui-monospace,monospace;background:#1a1013;color:#ece1d8;padding:24px;max-width:900px;margin:auto}h1{font-size:1.05rem;color:#c97a5c}.line{padding:2px 0;border-bottom:1px solid #2a2023;white-space:pre-wrap}</style></head><body><h1>Transcription — ${escapeHtml(tr.channelName || 'ticket')} (fermee le ${new Date(tr.closedAt).toLocaleString('fr-FR')})</h1>${lines}</body></html>`;
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transcription-${btn.dataset.id}.html`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('Transcription telechargee.');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

// Export "aperçu Discord" de la structure (roadmap n°020, redessine sur
// demande explicite du user) : un vrai mockup 3 colonnes (salons / messages
// / membres) avec avatars et pseudos PLACEHOLDER — jamais de vraies donnees
// de membre, seuls les salons/roles/couleurs viennent du serveur reel.
const MOCKUP_FAKE_NAMES = [
  'Alex_92', 'Julie.k', 'MaxPower', 'Nova_', 'Sacha.TTV', 'Lea_exe', 'Theo91', 'Camille.gg',
  'Yanis_FR', 'Zoe', 'Lucas92', 'Manon_', 'Ryu', 'Chloe.dev', 'Nathan', 'Emma_YT',
  'Hugo', 'Sarah.k', 'Enzo_92', 'Ines', 'Tom_TTV', 'Lina', 'Noah.gg', 'Jade_',
];
function mockupSeedColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360}, 58%, 52%)`;
}
function mockupRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function mockupAvatar(ctx, cx, cy, radius, name, opacity, online) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = mockupSeedColor(name);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `${Math.round(radius * 0.85)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.slice(0, 1).toUpperCase(), cx, cy + 1);
  ctx.restore();
  if (online) {
    ctx.beginPath();
    ctx.arc(cx + radius * 0.72, cy + radius * 0.72, radius * 0.34, 0, Math.PI * 2);
    ctx.fillStyle = '#171013';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + radius * 0.72, cy + radius * 0.72, radius * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = '#35c48a';
    ctx.fill();
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}
const MOCKUP_MESSAGES = [
  'Salut tout le monde ! 👋',
  'Quelqu\'un a le lien du reglement ?',
  'GG pour le stream d\'hier soir 🎉',
  'N\'oubliez pas de recuperer vos roles dans #roles',
  'Le giveaway se termine ce soir, tentez votre chance !',
];

async function exportStructureMockup(guildName, channels, structRoles, realMemberCount) {
  let nameIdx = 0;
  const nextFakeName = () => MOCKUP_FAKE_NAMES[(nameIdx++) % MOCKUP_FAKE_NAMES.length];

  const categories = channels.filter((c) => c.type === 4).sort((a, b) => a.position - b.position);
  const lines = [];
  channels.filter((c) => c.type !== 4 && !c.parent_id).sort((a, b) => a.position - b.position)
    .forEach((c) => lines.push({ text: c.name, indent: 0, kind: 'channel', voice: c.type === 2 }));
  categories.forEach((cat) => {
    lines.push({ text: cat.name.toUpperCase(), kind: 'cat' });
    channels.filter((c) => c.parent_id === cat.id).sort((a, b) => a.position - b.position)
      .forEach((c) => lines.push({ text: c.name, indent: 1, kind: 'channel', voice: c.type === 2 }));
  });
  const rolesSorted = structRoles.filter((r) => r.name !== '@everyone').sort((a, b) => b.position - a.position);
  const activeChannel = channels.find((c) => c.type === 0) || { name: 'general', topic: '' };

  // Groupes de membres factices : jusqu'a 5 roles hauts + un groupe "En
  // ligne" sans role special + un groupe "Hors ligne" grise.
  const memberGroups = [];
  rolesSorted.slice(0, 5).forEach((r, i) => {
    const count = Math.max(1, 4 - i);
    memberGroups.push({
      label: r.name.toUpperCase(), color: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : '#c9beb8',
      online: true, members: Array.from({ length: count }, () => nextFakeName()),
    });
  });
  memberGroups.push({
    label: 'EN LIGNE', color: '#c9beb8', online: true,
    members: Array.from({ length: 4 }, () => nextFakeName()),
  });
  const offlineCount = Math.max(2, Math.min(9, (realMemberCount || 20) - nameIdx));
  memberGroups.push({
    label: 'HORS LIGNE', color: '#75696f', online: false,
    members: Array.from({ length: offlineCount }, () => nextFakeName()),
  });

  const SIDEBAR_W = 240;
  const MEMBERS_W = 240;
  const CHAT_W = 640;
  const WIDTH = SIDEBAR_W + CHAT_W + MEMBERS_W;
  const ROW_H = 30;
  const sidebarContentH = 56 + lines.length * ROW_H + 20;
  const membersContentH = 56 + memberGroups.reduce((sum, g) => sum + 26 + g.members.length * 30, 0) + 20;
  const chatContentH = 56 + MOCKUP_MESSAGES.length * 62 + 40;
  const HEIGHT = Math.max(sidebarContentH, membersContentH, chatContentH, 480);

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');

  // Fond general (zone message) + colonnes laterales legerement plus sombres.
  ctx.fillStyle = '#1c1517';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#171013';
  ctx.fillRect(0, 0, SIDEBAR_W, HEIGHT);
  ctx.fillRect(SIDEBAR_W + CHAT_W, 0, MEMBERS_W, HEIGHT);

  // --- Colonne salons ---
  ctx.fillStyle = '#221a1c';
  ctx.fillRect(0, 0, SIDEBAR_W, 56);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath(); ctx.moveTo(0, 56); ctx.lineTo(SIDEBAR_W, 56); ctx.stroke();
  ctx.fillStyle = '#f0e7e3';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(guildName.slice(0, 24), 16, 34);
  ctx.fillStyle = '#a5958f';
  ctx.font = '11px sans-serif';
  ctx.fillText('▾', SIDEBAR_W - 24, 34);

  let y = 78;
  lines.forEach((l) => {
    if (l.kind === 'cat') {
      ctx.fillStyle = '#8f7f87';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`▾  ${l.text.slice(0, 26)}`, 14, y);
    } else {
      const active = l.text === activeChannel.name;
      if (active) {
        mockupRoundedRect(ctx, 8, y - 18, SIDEBAR_W - 16, 26, 6);
        ctx.fillStyle = 'rgba(201,122,92,0.16)';
        ctx.fill();
      }
      ctx.fillStyle = active ? '#f0e7e3' : '#a5958f';
      ctx.font = '13px sans-serif';
      ctx.fillText(`${l.voice ? '🔊' : '#'}  ${l.text.slice(0, 24)}`, 18 + l.indent * 14, y);
    }
    y += ROW_H;
  });

  // --- Colonne centrale (messages) ---
  const chatX = SIDEBAR_W;
  ctx.fillStyle = '#221a1c';
  ctx.fillRect(chatX, 0, CHAT_W, 56);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath(); ctx.moveTo(chatX, 56); ctx.lineTo(chatX + CHAT_W, 56); ctx.stroke();
  ctx.fillStyle = '#f0e7e3';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(`# ${activeChannel.name}`, chatX + 20, 34);
  if (activeChannel.topic) {
    ctx.fillStyle = '#8f7f87';
    ctx.font = '12px sans-serif';
    ctx.fillText(activeChannel.topic.slice(0, 60), chatX + 200, 34);
  }

  let my = 92;
  let msgHour = 14;
  MOCKUP_MESSAGES.forEach((messageText) => {
    const author = nextFakeName();
    const role = rolesSorted[Math.floor(Math.random() * Math.max(1, Math.min(rolesSorted.length, 5)))];
    mockupAvatar(ctx, chatX + 38, my - 4, 18, author, 1, false);
    ctx.fillStyle = role?.color ? `#${role.color.toString(16).padStart(6, '0')}` : '#e0a97e';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(author, chatX + 66, my - 6);
    const authorWidth = ctx.measureText(author).width;
    ctx.fillStyle = '#6f6266';
    ctx.font = '11px sans-serif';
    ctx.fillText(`Aujourd'hui à ${String(msgHour).padStart(2, '0')}:${String((msgHour * 7) % 60).padStart(2, '0')}`, chatX + 74 + authorWidth, my - 6);
    ctx.fillStyle = '#d8cec9';
    ctx.font = '14px sans-serif';
    ctx.fillText(messageText, chatX + 66, my + 14);
    my += 62;
    msgHour += 1;
  });

  // --- Colonne membres ---
  const membersX = SIDEBAR_W + CHAT_W;
  ctx.fillStyle = '#221a1c';
  ctx.fillRect(membersX, 0, MEMBERS_W, 56);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath(); ctx.moveTo(membersX, 56); ctx.lineTo(membersX + MEMBERS_W, 56); ctx.stroke();
  ctx.fillStyle = '#f0e7e3';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(`MEMBRES — ${realMemberCount || memberGroups.reduce((s, g) => s + g.members.length, 0)}`, membersX + 16, 34);

  let gy = 76;
  memberGroups.forEach((group) => {
    ctx.fillStyle = group.color;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`${group.label} — ${group.members.length}`, membersX + 16, gy);
    gy += 22;
    group.members.forEach((name) => {
      mockupAvatar(ctx, membersX + 26, gy - 6, 12, name, group.online ? 1 : 0.45, group.online);
      ctx.fillStyle = group.online ? group.color : 'rgba(201,190,184,0.45)';
      ctx.font = '13px sans-serif';
      ctx.fillText(name, membersX + 44, gy - 2);
      gy += 30;
    });
    gy += 10;
  });

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `structure-discord-${guildName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      resolve();
    });
  });
}

/* ---------- Pages: securite ---------- */

// Export chiffre des sauvegardes (roadmap n°337) : AES-GCM via Web Crypto
// API (native navigateur, pas de librairie), cle derivee du mot de passe
// par PBKDF2. Le fichier .json contient {v, salt, iv, data} en base64.
async function deriveBackupKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}
function bufToB64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function b64ToBuf(b64) { return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); }
async function encryptBackupJson(obj, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return {
    v: 1, salt: bufToB64(salt), iv: bufToB64(iv), data: bufToB64(ciphertext),
  };
}
async function decryptBackupJson(payload, password) {
  const key = await deriveBackupKey(password, b64ToBuf(payload.salt));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(payload.iv) }, key, b64ToBuf(payload.data));
  return JSON.parse(new TextDecoder().decode(plain));
}

async function renderSecurityPage(id, container = app) {
  container.innerHTML = skeletonHtml();
  const [snapshots, trashItems, currentChannels, currentRoles, securityConfig] = await Promise.all([
    Api.securitySnapshots(id),
    Api.trash(id).catch(() => []),
    Api.channels(id).catch(() => []),
    Api.roles(id).catch(() => []),
    Api.config(id).catch(() => ({})),
  ]);

  // Detection de permissions dangereuses sur @everyone (roadmap n°334).
  const DANGEROUS_EVERYONE_PERMS = ['Administrator', 'BanMembers', 'KickMembers', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'ManageWebhooks', 'MentionEveryone'];
  const everyoneRole = currentRoles.find((r) => r.id === id);
  const everyoneMask = BigInt(everyoneRole?.permissions || 0);
  const dangerousOnEveryone = DANGEROUS_EVERYONE_PERMS.filter((name) => (everyoneMask & PERMISSION_BITS[name]) === PERMISSION_BITS[name]);

  // Corbeille (roadmap n°138) : elements supprimes restaurables 24h.
  const trashRows = trashItems.slice().reverse().map((t) => {
    const icon = t.kind === 'role' ? '🏷️' : t.kind === 'category' ? '📁' : '#️⃣';
    const remaining = Math.max(1, Math.round((24 * 3600000 - (Date.now() - t.deletedAt)) / 3600000));
    return `
      <div class="row" style="justify-content:space-between; margin-bottom:6px;">
        <span>${icon} ${escapeHtml(t.name)} <span class="muted" style="font-size:0.76rem;">— supprime ${new Date(t.deletedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}, expire dans ~${remaining}h</span></span>
        <button class="btn secondary trash-restore" data-trash-id="${t.id}">♻️ Restaurer</button>
      </div>`;
  }).join('') || '<p class="muted">Corbeille vide. Les salons et roles supprimes via le dashboard restent restaurables ici pendant 24h.</p>';

  const snapshotRows = snapshots.map((s, idx) => `
    <div class="row" data-idx="${idx}" style="justify-content:space-between; margin-bottom:6px;">
      <span>${new Date(s.exportedAt).toLocaleString('fr-FR')} — ${s.roles.length} role(s), ${s.categories.length} categorie(s), ${s.channels.length} salon(s)</span>
      <button class="btn secondary preview-snapshot" data-idx="${idx}">Comparer et restaurer</button>
    </div>
  `).join('') || '<p class="muted">Aucun snapshot pour le moment. Un snapshot automatique est pris chaque jour.</p>';

  // Diff visuel avant restauration (roadmap n°168) : ne montre que ce qui
  // MANQUERAIT et serait recree (la restauration est additive, jamais de
  // suppression) — compare par nom normalise, insensible a la casse/accents.
  const normalizeName = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');
  function snapshotDiffHtml(snapshot) {
    const currentRoleNames = new Set(currentRoles.map((r) => normalizeName(r.name)));
    const currentChannelNames = new Set(currentChannels.map((c) => normalizeName(c.name)));
    const missingRoles = (snapshot.roles || []).filter((r) => !currentRoleNames.has(normalizeName(r.name)));
    const missingCategories = (snapshot.categories || []).filter((c) => !currentChannelNames.has(normalizeName(c.name)));
    const missingChannels = (snapshot.channels || []).filter((c) => !currentChannelNames.has(normalizeName(c.name)));
    const total = missingRoles.length + missingCategories.length + missingChannels.length;
    if (!total) return '<p class="muted">Rien a recreer : tout ce que contient ce snapshot existe deja sur le serveur.</p>';
    return `
      <p class="muted">${total} element(s) seront recrees (rien d'existant ne sera touche ni supprime) :</p>
      ${missingRoles.length ? `<p style="margin:8px 0 2px; font-size:0.78rem; font-weight:700;">🏷️ Roles (${missingRoles.length})</p>${missingRoles.map((r) => `<div style="padding:2px 0; font-size:0.82rem;">+ ${escapeHtml(r.name)}</div>`).join('')}` : ''}
      ${missingCategories.length ? `<p style="margin:8px 0 2px; font-size:0.78rem; font-weight:700;">📁 Categories (${missingCategories.length})</p>${missingCategories.map((c) => `<div style="padding:2px 0; font-size:0.82rem;">+ ${escapeHtml(c.name)}</div>`).join('')}` : ''}
      ${missingChannels.length ? `<p style="margin:8px 0 2px; font-size:0.78rem; font-weight:700;">#️⃣ Salons (${missingChannels.length})</p>${missingChannels.map((c) => `<div style="padding:2px 0; font-size:0.82rem;">+ ${escapeHtml(c.name)}</div>`).join('')}` : ''}`;
  }

  container.innerHTML = `
    <div class="inner">
      ${quickJumpBarHtml([
    ['sec-export', 'Export / Restauration'], ['sec-copy-config', 'Copier ma config'], ['sec-config-export', 'Configuration complete'],
    ...(dangerousOnEveryone.length ? [['sec-everyone-danger', 'Alerte @everyone']] : []),
    ['sec-webhook-scan', 'Scan des webhooks'], ['sec-snapshots', 'Snapshots automatiques'], ['sec-trash', 'Corbeille'],
    ['sec-lockdown', 'Lockdown'], ['sec-purge', 'Purge de messages'], ['sec-autocleanup', 'Nettoyage programme'],
    ['sec-protected-ids', 'Liste blanche'], ['sec-maintenance', 'Mode maintenance'],
  ], 'securite')}
      ${sectionHtml('Export / Restauration manuelle', `
        <p class="muted">Exporte la structure (noms/couleurs des roles, categories, salons) en fichier JSON. La restauration est additive : elle recree uniquement ce qui manque, sans jamais toucher a l'existant.</p>
        <button class="btn secondary" id="export-structure">⬇️ Telecharger la structure (.json)</button>
        <button class="btn secondary" id="export-structure-image" style="margin-left:8px;">🖼️ Exporter en image (.png)</button>
        <label for="structure-file-input" style="margin-top:14px;">Restaurer depuis un fichier</label>
        <div class="dp-dropzone" id="structure-dropzone" tabindex="0">
          <span class="dp-dropzone-icon">📄</span>
          <span class="dp-dropzone-text" id="structure-dropzone-text">Glisse un fichier .json ici, ou clique pour parcourir</span>
          <input type="file" id="structure-file-input" accept="application/json" class="dp-dropzone-input" />
        </div>
        <button class="btn secondary" id="restore-structure" style="margin-top:10px;" disabled>Restaurer depuis ce fichier</button>
      `, { id: 'sec-export' })}

      ${sectionHtml('Copier ma config (roadmap n°343)', `
        <p class="muted">Copie un resume lisible (pas de JSON technique) a coller sur le serveur d'entraide pour obtenir de l'aide contextualisee — aucune donnee sensible (pas d'ID brut, pas de token).</p>
        <button class="btn secondary" id="copy-config-summary">📋 Copier ma config</button>
      `, { id: 'sec-copy-config' })}

      ${sectionHtml('Configuration complete (JSON versionne)', `
        <p class="muted">Exporte TOUS les reglages du bot pour ce serveur (niveaux, paliers, parrainage, boutique, commandes perso, modeles d'embed, reaction-roles, roles de jeu) — pas la structure (roles/salons), voir ci-dessus. Utile pour dupliquer une config sur un autre serveur ou revenir en arriere.</p>
        <button class="btn secondary" id="export-config">⬇️ Telecharger la configuration (.json)</button>
        <button class="btn secondary" id="export-config-encrypted" style="margin-top:6px;">🔒 Telecharger chiffree (mot de passe)</button>
        <label for="config-file-input-encrypted" style="margin-top:14px;">Importer un export chiffre</label>
        <input type="file" id="config-file-input-encrypted" accept="application/json" />
        <label for="config-file-input" style="margin-top:14px;">Importer depuis un fichier (non chiffre)</label>
        <div class="dp-dropzone" id="config-dropzone" tabindex="0">
          <span class="dp-dropzone-icon">⚙️</span>
          <span class="dp-dropzone-text" id="config-dropzone-text">Glisse un fichier .json ici, ou clique pour parcourir</span>
          <input type="file" id="config-file-input" accept="application/json" class="dp-dropzone-input" />
        </div>
        <p class="muted" style="font-size:0.76rem; margin-top:6px;">L'import REMPLACE les paliers/boutique/commandes/modeles/reaction-roles/roles de jeu existants (les reglages generaux sont fusionnes, rien d'autre n'est efface).</p>
        <button class="btn danger" id="import-config" style="margin-top:10px;" disabled>Importer ce fichier</button>
      `, { id: 'sec-config-export' })}

      ${dangerousOnEveryone.length ? sectionHtml('🛡️ Permission dangereuse sur @everyone (roadmap n°334)', `
        <div class="inline-banner error">
          <span class="icon">⚠️</span>
          <span class="msg">@everyone a actuellement : <strong>${dangerousOnEveryone.map((p) => escapeHtml(PERMISSION_LABELS[p] || p)).join(', ')}</strong>. Ces droits s'appliquent a absolument tous les membres.</span>
        </div>
        <button type="button" class="btn danger" id="fix-everyone-perms" style="margin-top:10px;">Retirer ces permissions de @everyone</button>
      `, { id: 'sec-everyone-danger' }) : ''}

      ${sectionHtml('🔎 Scan des webhooks (roadmap n°338)', `
        <p class="muted">Liste tous les webhooks Discord actifs sur ce serveur (integrations tierces incluses) — revoque ceux que tu ne reconnais pas.</p>
        <div id="server-webhooks-list"><p class="muted" style="font-size:0.8rem;">Chargement...</p></div>
      `, { id: 'sec-webhook-scan' })}

      ${sectionHtml('Snapshots automatiques', `
        <p class="muted">Un snapshot de la structure est pris automatiquement chaque jour (5 derniers conserves).</p>
        <button class="btn secondary" id="snapshot-now" style="margin-bottom:10px;">Creer un snapshot maintenant</button>
        <div id="snapshots-list">${snapshotRows}</div>
      `, { id: 'sec-snapshots' })}

      ${sectionHtml('Corbeille (24h)', `
        <p class="muted">Tout salon, categorie ou role supprime depuis le dashboard atterrit ici et peut etre recree a l'identique (nom, reglages, permissions — nouvel identifiant Discord).</p>
        <div id="trash-list">${trashRows}</div>
      `, { id: 'sec-trash' })}

      ${sectionHtml('Lockdown', `
        <p class="muted">Verrouille immediatement le serveur (verification maximale : email verifie + compte Discord de plus de 10 minutes requis pour interagir). Utile en cas de raid en cours.</p>
        <div class="row">
          <button class="btn danger" id="lockdown-btn">Verrouiller le serveur</button>
          <button class="btn secondary" id="unlock-btn">Deverrouiller</button>
        </div>
        <h2 style="margin-top:18px; font-size:0.85rem;">🐌 Mode lent global</h2>
        <p class="muted">Applique un slowmode d'un coup sur TOUS les salons texte publics (les salons staff ne sont pas touches). Pour calmer une surchauffe sans verrouiller.</p>
        <div class="row" style="gap:8px; flex-wrap:wrap;">
          <select id="slowmode-all-seconds" aria-label="Duree du slowmode" style="margin:0;">
            <option value="10">10 secondes</option>
            <option value="30" selected>30 secondes</option>
            <option value="60">1 minute</option>
            <option value="300">5 minutes</option>
          </select>
          <button class="btn secondary" id="slowmode-all-apply">Appliquer partout</button>
          <button class="btn secondary" id="slowmode-all-clear">Retirer partout</button>
        </div>
      `, { id: 'sec-lockdown' })}

      ${sectionHtml('Purge de messages par filtre', `
        <p class="muted">Supprime en masse les messages recents d'un salon (100 derniers maximum) correspondant a un filtre. Irreversible.</p>
        <label for="purge-channel">Salon</label>
        <select id="purge-channel">${currentChannels.filter((c) => c.type === 0).map((c) => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('')}</select>
        <label for="purge-author">ID de l'auteur (optionnel — vide = tous les auteurs)</label>
        <input type="text" id="purge-author" placeholder="ID Discord de l'auteur" />
        <label for="purge-contains">Contient le texte (optionnel)</label>
        <input type="text" id="purge-contains" placeholder="Mot ou expression" />
        <label class="dp-toggle-row" style="margin-top:6px;"><span>Uniquement les messages avec un lien</span><input type="checkbox" id="purge-links-only" /></label>
        <button class="btn danger" id="purge-btn" style="margin-top:10px;">🧹 Purger</button>
      `, { id: 'sec-purge' })}

      ${sectionHtml('Nettoyage programme (roadmap n°290)', `
        <p class="muted">Vide automatiquement un salon (spam bot, test...) a intervalle regulier. Desactive si aucun salon choisi.</p>
        <label for="autocleanup-channel">Salon a nettoyer</label>
        <select id="autocleanup-channel">
          <option value="">Desactive</option>
          ${currentChannels.filter((c) => c.type === 0).map((c) => `<option value="${c.id}" ${securityConfig?.autoCleanupChannelId === c.id ? 'selected' : ''}>#${escapeHtml(c.name)}</option>`).join('')}
        </select>
        <label for="autocleanup-interval">Frequence</label>
        <select id="autocleanup-interval">
          <option value="24" ${(securityConfig?.autoCleanupIntervalHours ?? 24) === 24 ? 'selected' : ''}>Quotidien (toutes les 24h)</option>
          <option value="168" ${securityConfig?.autoCleanupIntervalHours === 168 ? 'selected' : ''}>Hebdomadaire (tous les 7 jours)</option>
          <option value="1" ${securityConfig?.autoCleanupIntervalHours === 1 ? 'selected' : ''}>Toutes les heures</option>
        </select>
        <button class="btn secondary" id="save-autocleanup" style="margin-top:10px;">Enregistrer</button>
      `, { id: 'sec-autocleanup' })}

      ${sectionHtml('Liste blanche (roadmap n°333)', `
        <p class="muted">IDs Discord jamais bannables depuis le dashboard ou via /tempban, meme par erreur.</p>
        <div id="protected-ids-list">${(securityConfig?.protectedUserIds || []).map((uid) => `
          <div class="row" style="justify-content:space-between; margin-bottom:6px;">
            <span>${escapeHtml(uid)}</span>
            <button type="button" class="btn danger delete-protected-id" data-id="${uid}">Retirer</button>
          </div>`).join('') || '<p class="muted">Aucun ID protege.</p>'}</div>
        <div class="row" style="margin-top:10px; gap:8px;">
          <input type="text" id="new-protected-id" placeholder="ID Discord a proteger" style="flex:1; margin:0;" />
          <button class="btn secondary" id="add-protected-id">Ajouter</button>
        </div>
      `, { id: 'sec-protected-ids' })}

      ${sectionHtml('Mode maintenance (roadmap n°339)', `
        <p class="muted">Verrouille ce serveur en LECTURE SEULE sur le dashboard (aucune modification possible, meme par un acces delegue) — utile pendant une intervention manuelle sur le serveur Discord.</p>
        <label class="dp-toggle-row"><span>Dashboard en lecture seule</span><input type="checkbox" id="maintenance-toggle" ${securityConfig?.dashboardMaintenanceMode ? 'checked' : ''} /></label>
      `, { id: 'sec-maintenance' })}
    </div>
  `;
  wireQuickJump(container);

  // Mode lent global (roadmap n°198).
  const applySlowmodeAll = async (seconds) => {
    try {
      const res = await Api.setSlowmodeAll(id, seconds);
      showToast(seconds
        ? `Mode lent ${seconds}s applique sur ${res.updated} salon(s) public(s).`
        : `Mode lent retire de ${res.updated} salon(s).`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
  document.getElementById('slowmode-all-apply')?.addEventListener('click', () => {
    const seconds = Number(document.getElementById('slowmode-all-seconds').value);
    if (!window.confirm(`Appliquer ${seconds}s de mode lent sur tous les salons publics ?`)) return;
    applySlowmodeAll(seconds);
  });
  document.getElementById('slowmode-all-clear')?.addEventListener('click', () => applySlowmodeAll(0));

  // Corbeille (roadmap n°138) : restauration en un clic.
  container.querySelectorAll('.trash-restore').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await Api.restoreTrash(id, btn.dataset.trashId);
        showToast('Element restaure sur le serveur.');
        await renderSecurityPage(id, container);
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    });
  });

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

  // Export image de la structure (roadmap n°020) : canvas cote client,
  // salons a gauche, roles colores a droite, telecharge en PNG.
  document.getElementById('export-structure-image').addEventListener('click', async () => {
    let channels = paletteCtx.channels;
    let structRoles = paletteCtx.roles;
    if (!channels.length) {
      [channels, structRoles] = await Promise.all([Api.channels(id).catch(() => []), Api.roles(id).catch(() => [])]);
    }
    const guildName = allGuilds.find((g) => g.guildId === id)?.name || 'Serveur';
    const memberCount = allGuilds.find((g) => g.guildId === id)?.memberCount;
    await exportStructureMockup(guildName, channels, structRoles, memberCount);
    showToast('Aperçu Discord de la structure telecharge.');
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

  // Copier ma config (roadmap n°343) : resume lisible, anonymise (noms
  // uniquement, pas d'ID brut) a coller sur le serveur d'entraide.
  document.getElementById('copy-config-summary').addEventListener('click', async () => {
    const guildName = allGuilds.find((g) => g.guildId === id)?.name || 'mon serveur';
    const channelName = (cid) => currentChannels.find((c) => c.id === cid)?.name;
    const check = (v) => (v ? '✅' : '▫️');
    const lines = [
      `Config de "${guildName}" (${currentChannels.filter((c) => c.type !== 4).length} salons, ${currentRoles.length} roles) :`,
      `${check(securityConfig?.arrivalDepartureChannelId)} Bienvenue : ${channelName(securityConfig?.arrivalDepartureChannelId) ? `#${channelName(securityConfig.arrivalDepartureChannelId)}` : 'non configure'}`,
      `${check(securityConfig?.modLogChannelId)} Journal de moderation : ${securityConfig?.modLogChannelId ? 'configure' : 'non configure'}`,
      `${check(securityConfig?.announceChannelId)} Annonces : ${securityConfig?.announceChannelId ? 'configure' : 'non configure'}`,
      `${check(securityConfig?.autoRoleId)} Role automatique : ${securityConfig?.autoRoleId ? 'actif' : 'aucun'}`,
      `${check(securityConfig?.xpRate)} Vitesse XP : x${securityConfig?.xpRate || 1}`,
      `${check(securityConfig?.ticketPanelChannelId)} Tickets : ${securityConfig?.ticketPanelChannelId ? 'actif' : 'non configure'}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      showToast('Resume copie, colle-le sur le serveur d\'entraide.');
    } catch {
      showToast('Copie impossible (permission navigateur).', 'error');
    }
  });

  // Export/import de la configuration complete, JSON versionne (roadmap n°210).
  document.getElementById('export-config').addEventListener('click', async () => {
    try {
      const bundle = await Api.configExport(id);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `configuration-${id}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Fichier telecharge.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('export-config-encrypted').addEventListener('click', async () => {
    const password = window.prompt('Mot de passe pour chiffrer cette sauvegarde (a retenir, non recuperable) :');
    if (!password) return;
    try {
      const bundle = await Api.configExport(id);
      const payload = await encryptBackupJson(bundle, password);
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `configuration-${id}-${Date.now()}.enc.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Fichier chiffre telecharge.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('config-file-input-encrypted').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const password = window.prompt('Mot de passe de ce fichier chiffre :');
    if (!password) { e.target.value = ''; return; }
    try {
      const payload = JSON.parse(await file.text());
      if (!payload.salt || !payload.iv || !payload.data) throw new Error('Ce fichier ne semble pas etre un export chiffre.');
      const bundle = await decryptBackupJson(payload, password);
      if (!window.confirm('Importer cette configuration ? Les paliers, boutique, commandes perso, modeles d\'embed, reaction-roles et roles de jeu existants seront remplaces.')) return;
      const result = await Api.configImport(id, bundle);
      showToast(`Configuration dechiffree et importee (${result.sectionsImported} section(s)).`);
      await renderSecurityPage(id, container);
    } catch (err) {
      showToast(err.name === 'OperationError' ? 'Mot de passe incorrect.' : (err.message || 'Fichier invalide.'), 'error');
    } finally {
      e.target.value = '';
    }
  });

  const configDropzone = document.getElementById('config-dropzone');
  const configFileInput = document.getElementById('config-file-input');
  const configDropzoneText = document.getElementById('config-dropzone-text');
  const importConfigBtn = document.getElementById('import-config');

  function setConfigFile(file) {
    if (!file) return;
    if (!file.name.endsWith('.json')) { showToast('Choisis un fichier .json.', 'error'); return; }
    const dt = new DataTransfer();
    dt.items.add(file);
    configFileInput.files = dt.files;
    configDropzoneText.textContent = `📄 ${file.name}`;
    configDropzone.classList.add('has-file');
    importConfigBtn.disabled = false;
  }

  configDropzone.addEventListener('click', () => configFileInput.click());
  configDropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); configFileInput.click(); }
  });
  configFileInput.addEventListener('change', () => setConfigFile(configFileInput.files[0]));
  configDropzone.addEventListener('dragover', (e) => { e.preventDefault(); configDropzone.classList.add('drag-over'); });
  configDropzone.addEventListener('dragleave', () => configDropzone.classList.remove('drag-over'));
  configDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    configDropzone.classList.remove('drag-over');
    setConfigFile(e.dataTransfer.files[0]);
  });

  importConfigBtn.addEventListener('click', async () => {
    const file = configFileInput.files[0];
    if (!file) { showToast('Choisis un fichier.', 'error'); return; }
    if (!window.confirm('Importer cette configuration ? Les paliers, boutique, commandes perso, modeles d\'embed, reaction-roles et roles de jeu existants seront remplaces.')) return;
    try {
      const bundle = JSON.parse(await file.text());
      const result = await Api.configImport(id, bundle);
      showToast(`Configuration importee (${result.sectionsImported} section(s)).`);
      await renderSecurityPage(id, container);
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

  container.querySelectorAll('.preview-snapshot').forEach((btn) => {
    btn.addEventListener('click', () => {
      const snapshot = snapshots[Number(btn.dataset.idx)];
      const existingPop = document.getElementById('dp-snapshot-diff');
      existingPop?.remove();
      const pop = document.createElement('div');
      pop.id = 'dp-snapshot-diff';
      pop.className = 'dp-modal-pop';
      pop.innerHTML = `
        <div class="dp-modal-pop-inner">
          <p class="dp-block-title" style="margin:0 0 8px;">🔍 A recreer — snapshot du ${new Date(snapshot.exportedAt).toLocaleString('fr-FR')}</p>
          <div style="max-height:50vh; overflow-y:auto;">${snapshotDiffHtml(snapshot)}</div>
          <div class="row" style="justify-content:flex-end; gap:8px; margin-top:12px;">
            <button type="button" class="btn secondary" id="dp-snapshot-cancel">Annuler</button>
            <button type="button" class="btn" id="dp-snapshot-confirm">Restaurer</button>
          </div>
        </div>`;
      document.body.appendChild(pop);
      pop.querySelector('#dp-snapshot-cancel').addEventListener('click', () => pop.remove());
      pop.addEventListener('click', (e) => { if (e.target === pop) pop.remove(); });
      pop.querySelector('#dp-snapshot-confirm').addEventListener('click', async () => {
        pop.remove();
        try {
          const result = await Api.securityRestore(id, snapshot);
          showToast(`Restaure : ${result.roles} role(s), ${result.categories} categorie(s), ${result.channels} salon(s) crees.`);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  });

  document.getElementById('purge-btn').addEventListener('click', async () => {
    const channelId = document.getElementById('purge-channel').value;
    const authorId = document.getElementById('purge-author').value.trim() || undefined;
    const contains = document.getElementById('purge-contains').value.trim() || undefined;
    const linksOnly = document.getElementById('purge-links-only').checked;
    if (!channelId) { showToast('Choisis un salon.', 'error'); return; }
    if (!authorId && !contains && !linksOnly) { showToast('Choisis au moins un filtre (auteur, texte ou liens).', 'error'); return; }
    if (!window.confirm('Supprimer les messages correspondants (100 derniers maximum) ? Action irreversible.')) return;
    const btn = document.getElementById('purge-btn');
    btn.disabled = true;
    try {
      const result = await Api.purgeMessages(id, channelId, { authorId, contains, linksOnly, limit: 100 });
      showToast(`${result.deleted} message(s) supprime(s) sur ${result.matched} correspondant(s).`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('add-protected-id').addEventListener('click', async () => {
    const uid = document.getElementById('new-protected-id').value.trim();
    if (!/^\d{5,25}$/.test(uid)) { showToast('ID Discord invalide.', 'error'); return; }
    try {
      const protectedUserIds = [...new Set([...(securityConfig?.protectedUserIds || []), uid])];
      await Api.updateConfig(id, { protectedUserIds });
      showToast('ID protege ajoute.');
      await renderSecurityPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  container.querySelectorAll('.delete-protected-id').forEach((btn) => {
    btn.addEventListener('click', () => {
      undoableDelete(btn, 'ID retire de la liste blanche.', async () => {
        const protectedUserIds = (securityConfig?.protectedUserIds || []).filter((u) => u !== btn.dataset.id);
        await Api.updateConfig(id, { protectedUserIds });
      });
    });
  });

  // Mode maintenance (roadmap n°339) : le toggle lui-meme passe par PATCH
  // config, exempte du blocage cote worker (sinon impossible a desactiver).
  document.getElementById('maintenance-toggle').addEventListener('change', async (e) => {
    try {
      await Api.updateConfig(id, { dashboardMaintenanceMode: e.target.checked });
      showToast(e.target.checked ? 'Mode maintenance active : dashboard en lecture seule.' : 'Mode maintenance desactive.');
    } catch (err) {
      showToast(err.message, 'error');
      e.target.checked = !e.target.checked;
    }
  });

  // Scan des webhooks (roadmap n°338) : charge a part, une revocation
  // retire juste la ligne concernee sans re-rendre toute la page.
  Api.serverWebhooks(id).then((hooks) => {
    const listEl = document.getElementById('server-webhooks-list');
    if (!listEl) return;
    listEl.innerHTML = hooks.length ? hooks.map((h) => `
      <div class="row" data-webhook-id="${h.id}" style="justify-content:space-between; margin-bottom:6px;">
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${escapeHtml(h.name || 'Sans nom')} → ${escapeHtml(currentChannels.find((c) => c.id === h.channel_id)?.name || h.channel_id)}
          ${h.user ? `<span class="muted" style="font-size:0.76rem;"> — cree par ${escapeHtml(h.user.username)}</span>` : '<span class="muted" style="font-size:0.76rem;"> — integration Discord</span>'}
        </span>
        <button type="button" class="btn danger delete-server-webhook" data-webhook-id="${h.id}">Revoquer</button>
      </div>`).join('') : '<p class="muted" style="font-size:0.8rem;">Aucun webhook actif sur ce serveur.</p>';
    listEl.querySelectorAll('.delete-server-webhook').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!window.confirm('Revoquer ce webhook ? Toute integration qui l\'utilise cessera de fonctionner immediatement.')) return;
        try {
          await Api.deleteServerWebhook(id, btn.dataset.webhookId);
          btn.closest('[data-webhook-id]').remove();
          showToast('Webhook revoque.');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  }).catch(() => {
    const listEl = document.getElementById('server-webhooks-list');
    if (listEl) listEl.innerHTML = '<p class="muted" style="font-size:0.8rem;">Impossible de charger les webhooks.</p>';
  });

  document.getElementById('fix-everyone-perms')?.addEventListener('click', async () => {
    try {
      const dangerousMask = dangerousOnEveryone.reduce((mask, name) => mask | PERMISSION_BITS[name], 0n);
      const cleaned = everyoneMask & ~dangerousMask;
      await Api.setRolePermissions(id, id, cleaned.toString());
      showToast('Permissions dangereuses retirees de @everyone.');
      await renderSecurityPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('save-autocleanup').addEventListener('click', async () => {
    try {
      await Api.updateConfig(id, {
        autoCleanupChannelId: document.getElementById('autocleanup-channel').value || null,
        autoCleanupIntervalHours: Number(document.getElementById('autocleanup-interval').value) || 24,
      });
      showToast('Nettoyage programme enregistre.');
    } catch (err) {
      showToast(err.message, 'error');
    }
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
  container.innerHTML = skeletonHtml('list');
  const [logs, members, roles, logins, modStats] = await Promise.all([
    Api.auditLog(id), Api.members(id).catch(() => []), Api.roles(id).catch(() => []),
    Api.dashboardLogins(id).catch(() => []), Api.moderationStats(id).catch(() => []),
  ]);
  const memberTag = (userId) => members.find((m) => m.userId === userId)?.displayName || userId;

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
        <p class="muted" style="font-size:0.78rem;">💡 Ces logs se remplissent une fois qu'un salon « Journal de moderation » est choisi (module Createur de salons &amp; roles).</p>
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
        <h2 style="margin-top:20px; font-size:0.85rem;">🔑 Connexions au dashboard</h2>
        <p class="muted">Qui s'est connecte au dashboard de ce serveur (une entree par personne et par demi-journee, 50 dernieres).</p>
        <div class="audit-log-list">${logins.slice().reverse().map((l) => `
          <div class="audit-row">
            <div class="audit-row-header">
              <strong>${escapeHtml(l.username || l.userId)}</strong>
              <span class="muted">${new Date(l.at).toLocaleString('fr-FR')}</span>
            </div>
          </div>`).join('') || '<p class="muted">Aucune connexion enregistree (le journal demarre a partir de maintenant).</p>'}</div>

        <h2 style="margin-top:20px; font-size:0.85rem;">📊 Statistiques de moderation par moderateur (roadmap n°278)</h2>
        <p class="muted">Avertissements poses (manuels et automod), regroupes par moderateur.</p>
        <div class="audit-log-list">${modStats.length ? modStats.map((s) => `
          <div class="stats-top-row">
            <span class="stats-top-name">${s.source === 'automod' ? '🤖 Auto-moderation' : escapeHtml(memberTag(s.moderatorId))}</span>
            <span class="stats-top-value">${s.last7} cette semaine · ${s.last30} ce mois · ${s.total} au total</span>
          </div>`).join('') : '<p class="muted">Aucun avertissement enregistre pour le moment.</p>'}</div>
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
  container.innerHTML = skeletonHtml('list');
  const [members, roles, xpData] = await Promise.all([
    Api.members(id).catch(() => []), Api.roles(id).catch(() => []), Api.xp(id).catch(() => ({})),
  ]);
  const roleById = new Map(roles.map((r) => [r.id, r]));
  // Bots masques par defaut (demande utilisateur) : flag bot renvoye par le
  // worker, avec repli sur le role nomme "Bot" pour les donnees en cache.
  const isBot = (m) => m.bot || (m.roles || []).some((rid) => roleById.get(rid)?.name === 'Bot');
  const botCount = members.filter(isBot).length;
  let showBots = false;

  // Tri memorise entre sessions (roadmap n°213), par navigateur (localStorage,
  // pas cote serveur : c'est une preference d'affichage, pas une donnee).
  const MEMBER_SORTS = {
    name_asc: { label: 'Nom (A-Z)', cmp: (a, b) => (a.displayName || '').localeCompare(b.displayName || '') },
    name_desc: { label: 'Nom (Z-A)', cmp: (a, b) => (b.displayName || '').localeCompare(a.displayName || '') },
    joined_recent: { label: "Arrivee (recent d'abord)", cmp: (a, b) => (b.joinedAt || 0) - (a.joinedAt || 0) },
    joined_old: { label: "Arrivee (ancien d'abord)", cmp: (a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) },
  };
  let currentSort = localStorage.getItem('dsc-member-sort') || 'name_asc';
  if (!MEMBER_SORTS[currentSort]) currentSort = 'name_asc';
  let sorted = [...members].sort(MEMBER_SORTS[currentSort].cmp);

  const rowHtml = (m, q) => {
    const roleChips = (m.roles || [])
      .map((rid) => roleById.get(rid))
      .filter((r) => r && r.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map((r) => `<span class="member-lookup-chip" style="--rc:${r.color ? `#${r.color.toString(16).padStart(6, '0')}` : 'var(--text-faint)'}">${escapeHtml(r.name)}</span>`)
      .join('') || '<span class="muted">Aucun role</span>';
    return `
      <div class="member-lookup-row">
        <img class="member-lookup-avatar" src="${memberAvatarUrl(m)}" alt="" width="36" height="36" loading="lazy" decoding="async" />
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

  // Membres inactifs (roadmap n°331) : derniere activite = dernier message
  // suivi par xpManager, repli sur la date d'arrivee si jamais poste.
  const inactiveThresholdDays = 60;
  const inactiveMembers = members.filter((m) => {
    if (isBot(m)) return false;
    const lastActive = xpData[m.userId]?.lastMessageAt || (m.joinedAt ? new Date(m.joinedAt).getTime() : 0);
    if (!lastActive) return false;
    return (Date.now() - lastActive) >= inactiveThresholdDays * 86400000;
  }).sort((a, b) => (xpData[a.userId]?.lastMessageAt || 0) - (xpData[b.userId]?.lastMessageAt || 0));

  container.innerHTML = `
    <div class="inner">
      ${sectionHtml(`Membres inactifs (${inactiveThresholdDays}j+, roadmap n°331)`, `
        <p class="muted">${inactiveMembers.length} membre(s) sans activite suivie depuis au moins ${inactiveThresholdDays} jours.</p>
        ${inactiveMembers.length ? `
        <div class="channel-picker" style="max-height:220px;">
          ${inactiveMembers.map((m) => {
    const lastActive = xpData[m.userId]?.lastMessageAt || new Date(m.joinedAt).getTime();
    const days = Math.floor((Date.now() - lastActive) / 86400000);
    return `<label><input type="checkbox" value="${m.userId}" class="inactive-member-check" /> ${escapeHtml(m.displayName || m.userId)} — inactif depuis ${days}j</label>`;
  }).join('')}
        </div>
        <div class="row" style="gap:8px; margin-top:10px; flex-wrap:wrap; align-items:center;">
          <button type="button" class="btn secondary" id="inactive-select-all">Tout selectionner</button>
          <select id="inactive-action-role" aria-label="Role a attribuer">${roles.filter((r) => r.name !== '@everyone').map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}</select>
          <button type="button" class="btn secondary" id="inactive-apply-role">🏷️ Attribuer ce role aux selectionnes</button>
        </div>
        <div class="row" style="gap:8px; margin-top:8px; flex-wrap:wrap;">
          <input type="text" id="inactive-dm-message" placeholder="Message a envoyer par MP..." style="flex:1; min-width:200px;" maxlength="1000" />
          <button type="button" class="btn secondary" id="inactive-apply-dm">✉️ Envoyer un MP aux selectionnes</button>
        </div>` : ''}
      `, { id: 'inactive-members' })}
      ${sectionHtml('Recherche de membres', `
        <p class="muted">${members.length - botCount} membre(s)${botCount ? ` + ${botCount} bot(s) masques` : ''}. Recherche par pseudo ou par ID.</p>
        <div class="row" style="gap:8px; flex-wrap:wrap; margin-bottom:10px; align-items:center;">
          <input type="text" id="member-search" placeholder="Rechercher un membre..." aria-label="Rechercher un membre" style="flex:1; min-width:180px; margin:0;" />
          <select id="member-sort" aria-label="Trier les membres" style="margin:0; max-width:200px;">
            ${Object.entries(MEMBER_SORTS).map(([k, s]) => `<option value="${k}" ${k === currentSort ? 'selected' : ''}>${s.label}</option>`).join('')}
          </select>
          ${botCount ? `<label class="dp-toggle-row" style="margin:0; padding:8px 12px; flex:none;"><span style="font-size:0.82rem;">Afficher les bots (${botCount})</span><input type="checkbox" id="member-show-bots" /></label>` : ''}
        </div>
        <div class="member-lookup-list" id="member-lookup-list"></div>
      `, { alwaysOpen: true })}
    </div>
  `;

  // Rendu limite (roadmap n°175) : 100 lignes affichees a la fois, le reste
  // via « Afficher plus » — 1000 lignes DOM figeaient le scroll.
  let memberDisplayLimit = 100;
  const repaintMembers = () => {
    const q = document.getElementById('member-search').value.trim();
    const ql = q.toLowerCase();
    const base = showBots ? sorted : sorted.filter((m) => !isBot(m));
    const filtered = ql
      ? base.filter((m) => (m.displayName || '').toLowerCase().includes(ql) || m.userId.includes(ql))
      : base;
    const visible = filtered.slice(0, memberDisplayLimit);
    const remaining = filtered.length - visible.length;
    document.getElementById('member-lookup-list').innerHTML = (visible.map((m) => rowHtml(m, q)).join('')
      + (remaining > 0 ? `<button type="button" class="btn secondary" id="member-show-more" style="width:100%; margin-top:6px;">Afficher ${Math.min(100, remaining)} membre(s) de plus (${remaining} restants)</button>` : ''))
      || '<p class="muted">Aucun resultat.</p>';
    document.getElementById('member-show-more')?.addEventListener('click', () => {
      memberDisplayLimit += 100;
      repaintMembers();
    });
  };
  repaintMembers();
  document.getElementById('member-search').addEventListener('input', () => {
    memberDisplayLimit = 100;
    repaintMembers();
  });
  document.getElementById('member-show-bots')?.addEventListener('change', (e) => {
    showBots = e.target.checked;
    repaintMembers();
  });

  // Action groupee sur membres inactifs (roadmap n°331).
  document.getElementById('inactive-select-all')?.addEventListener('click', () => {
    container.querySelectorAll('.inactive-member-check').forEach((c) => { c.checked = true; });
  });
  document.getElementById('inactive-apply-role')?.addEventListener('click', async () => {
    const userIds = [...container.querySelectorAll('.inactive-member-check:checked')].map((c) => c.value);
    const roleId = document.getElementById('inactive-action-role').value;
    if (!userIds.length) { showToast('Choisis au moins un membre.', 'error'); return; }
    try {
      const result = await Api.membersBulkAction(id, { userIds, action: 'role', roleId });
      showToast(`Role attribue a ${result.ok} membre(s)${result.failed ? `, ${result.failed} en erreur` : ''}.`, result.failed ? 'error' : 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  document.getElementById('inactive-apply-dm')?.addEventListener('click', async () => {
    const userIds = [...container.querySelectorAll('.inactive-member-check:checked')].map((c) => c.value);
    const message = document.getElementById('inactive-dm-message').value.trim();
    if (!userIds.length) { showToast('Choisis au moins un membre.', 'error'); return; }
    if (!message) { showToast('Message requis.', 'error'); return; }
    try {
      const result = await Api.membersBulkAction(id, { userIds, action: 'dm', message });
      showToast(`MP envoye a ${result.ok} membre(s)${result.failed ? `, ${result.failed} en erreur (MP fermes ?)` : ''}.`, result.failed ? 'error' : 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  document.getElementById('member-sort').addEventListener('change', (e) => {
    currentSort = MEMBER_SORTS[e.target.value] ? e.target.value : 'name_asc';
    localStorage.setItem('dsc-member-sort', currentSort);
    sorted = [...members].sort(MEMBER_SORTS[currentSort].cmp);
    memberDisplayLimit = 100;
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
    const targetUserId = warnsBtn.dataset.warnsUser;
    // Casier unifie (roadmap n°149) : warns + note interne (n°148) +
    // inventaire boutique (n°156).
    const [warns, note, inventory] = await Promise.all([
      Api.memberWarns(id, targetUserId).catch(() => []),
      Api.memberNote(id, targetUserId).catch(() => ({ text: '' })),
      Api.memberInventory(id, targetUserId).catch(() => []),
    ]);
    const rows = warns.slice().reverse().map((w) => `
      <div class="member-warn-row"${w.expired ? ' style="opacity:0.5;"' : ''}>
        <span>${escapeHtml(w.reason || 'Sans raison')}${w.expired ? ' <span class="muted">(expire)</span>' : ''}</span>
        <span class="muted">${w.source === 'automod' ? '🤖 automod' : '👮 manuel'} — ${new Date(w.createdAt).toLocaleString('fr-FR')}</span>
      </div>`).join('');
    row.insertAdjacentHTML('afterend', `
      <div class="member-warns-detail">
        ${rows || '<p class="muted" style="margin:0;">Aucune sanction enregistree.</p>'}
        ${inventory.length ? `
          <label style="margin-top:8px; font-size:0.76rem;">🎒 Inventaire (${inventory.length} achat(s)) — roadmap n°472</label>
          <div style="display:flex; flex-wrap:wrap; gap:3px;">${inventory.slice().reverse().slice(0, 12).map((it, revIdx) => `<span class="dp-chip" title="Achete le ${new Date(it.boughtAt).toLocaleString('fr-FR')} pour ${it.price} pieces">${escapeHtml(it.name)} <button type="button" class="member-refund-btn" data-user="${targetUserId}" data-index="${inventory.length - 1 - revIdx}" data-name="${escapeHtml(it.name)}" title="Rembourser cet achat" aria-label="Rembourser ${escapeHtml(it.name)}">↩️</button></span>`).join('')}</div>` : ''}
        <label style="margin-top:8px; font-size:0.76rem;">📝 Note interne (staff uniquement)${note.author ? ` <span class="muted">— ${escapeHtml(note.author)}, ${new Date(note.updatedAt).toLocaleString('fr-FR')}</span>` : ''}</label>
        <textarea class="member-note-text" maxlength="2000" placeholder="Contexte, historique, points d'attention..." style="min-height:56px;">${escapeHtml(note.text || '')}</textarea>
        <button type="button" class="btn secondary member-note-save" data-note-user="${targetUserId}" style="align-self:flex-start;">Enregistrer la note</button>
      </div>`);
    row.nextElementSibling.querySelector('.member-note-save').addEventListener('click', async (ev) => {
      const detail = ev.currentTarget.closest('.member-warns-detail');
      try {
        await Api.saveMemberNote(id, targetUserId, detail.querySelector('.member-note-text').value);
        showToast('Note enregistree.');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    row.nextElementSibling.querySelectorAll('.member-refund-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const reason = window.prompt(`Rembourser "${btn.dataset.name}" ? Motif (optionnel) :`, '');
        if (reason === null) return;
        try {
          const result = await Api.refundPurchase(id, btn.dataset.user, Number(btn.dataset.index), reason);
          showToast(`Rembourse : ${result.refunded}.`);
          btn.closest('.dp-chip').remove();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
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
  { key: 'suggestions', icon: '💡', label: 'Suggestions & sondages', desc: 'Les membres proposent leurs idees et creent des sondages (panneau avec bouton inclus).', configKey: 'suggestionChannelId' },
  { key: 'modlog', icon: '📋', label: 'Journal de moderation', desc: 'Visible du staff uniquement, le bot y ecrit chaque action automod.', configKey: 'modLogChannelId' },
  { key: 'bienvenue', icon: '👋', label: 'Bienvenue', desc: 'Arrivees et departs annonces par le bot, lecture seule.', configKey: 'arrivalDepartureChannelId' },
  { key: 'support', icon: '🎫', label: 'Support / tickets', desc: 'Salon du panneau de tickets, lecture seule.', configKey: 'ticketPanelChannelId' },
  { key: 'avis', icon: '⭐', label: 'Avis', desc: 'Les notes laissees apres chaque ticket y sont publiees automatiquement, avec le staff en charge.', configKey: 'reviewChannelId' },
  { key: 'starboard', icon: '🌟', label: 'Hall of fame', desc: 'Les messages qui atteignent 4 reactions ⭐ y sont republies automatiquement.', configKey: 'starboardChannelId' },
  { key: 'staff', icon: '🛡️', label: 'Categorie Staff complete', desc: 'Categorie privee avec mod-log, salon staff, vocal SERVICE STAFF et createur de vocal — construite par le bot.', configKey: 'staffCategoryId' },
];

async function renderCreatorPage(id, container = app) {
  container.innerHTML = skeletonHtml('grid');
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
      ${sectionHtml('Templates de serveur', `
        <p class="muted">Applique une structure complete en un clic (roles, categories, salons avec permissions). Additif : rien d'existant n'est touche, seuls les elements manquants sont crees.</p>
        <div class="creator-grid">
          <div class="creator-card">
            <div class="creator-card-head"><span class="icon">🎮</span><strong>Gaming</strong></div>
            <p class="muted creator-card-desc">Accueil, regles, clips, recherche de team, 3 vocaux, roles Joueur et VIP.</p>
            <button type="button" class="btn apply-template-btn" data-template="gaming">Appliquer</button>
          </div>
          <div class="creator-card">
            <div class="creator-card-head"><span class="icon">🏡</span><strong>Communaute</strong></div>
            <p class="muted creator-card-desc">Infos, reglement, discussions, presentations, vocaux detente, roles Membre actif et Booster.</p>
            <button type="button" class="btn apply-template-btn" data-template="communaute">Appliquer</button>
          </div>
          <div class="creator-card">
            <div class="creator-card-head"><span class="icon">🎓</span><strong>Etudes</strong></div>
            <p class="muted creator-card-desc">Planning, ressources, entraide, salles de travail vocales, roles Etudiant et Tuteur.</p>
            <button type="button" class="btn apply-template-btn" data-template="etudes">Appliquer</button>
          </div>
        </div>
      `, { alwaysOpen: true })}

      ${sectionHtml('Salons fonctionnels', `
        <p class="muted">Chaque salon est cree avec les bonnes permissions et branche automatiquement sur la fonctionnalite du bot.</p>
        <div class="creator-grid">${FEATURE_CHANNEL_CARDS.map(featureCardHtml).join('')}</div>
      `, { alwaysOpen: true })}

      ${sectionHtml('Roles', `
        <p class="muted">Cree un role rapidement, puis attribue-le : choisis le role, les membres sont detectes automatiquement, un petit + suffit.</p>
        <div class="row" style="gap:8px; flex-wrap:wrap; margin-bottom:8px;">
          <input type="text" id="creator-role-name" placeholder="Nom du nouveau role" aria-label="Nom du nouveau role" maxlength="100" style="flex:2; min-width:160px; margin:0;" />
          <input type="color" id="creator-role-color" value="${DISCORD_ROLE_COLORS[Math.floor(Math.random() * DISCORD_ROLE_COLORS.length)]}" aria-label="Couleur du role" style="flex:none;" class="dp-role-color-input" />
          <button type="button" class="btn secondary" id="creator-role-create">➕ Creer le role</button>
        </div>
        <p class="muted" style="font-size:0.78rem; margin:0 0 6px;">Permissions du nouveau role (optionnel) :</p>
        <div class="creator-perm-chips" role="group" aria-label="Permissions du nouveau role">
          ${['KickMembers', 'BanMembers', 'ModerateMembers', 'ManageMessages', 'ManageChannels', 'ManageRoles', 'ManageNicknames', 'MentionEveryone', 'ViewAuditLog', 'ManageWebhooks', 'Administrator']
    .map((k) => `<button type="button" class="creator-perm-chip" data-perm="${k}" aria-pressed="false" title="${escapeHtml(PERMISSION_DESCRIPTIONS[k] || '')}">${PERMISSION_LABELS[k]}</button>`).join('')}
        </div>
        <label for="creator-assign-role">Role a attribuer</label>
        <select id="creator-assign-role">${assignableRoles.map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}</select>
        <input type="text" id="creator-member-search" placeholder="Filtrer les membres..." aria-label="Filtrer les membres" style="margin-top:10px;" />
        <div class="creator-member-list" id="creator-member-list"></div>
      `, { alwaysOpen: true })}
    </div>
  `;

  // Templates de serveur (roadmap n°143) : application additive confirmee.
  container.querySelectorAll('.apply-template-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Appliquer ce template ? Les roles, categories et salons manquants seront crees (rien d\'existant ne sera modifie).')) return;
      btn.disabled = true;
      btn.textContent = 'Creation...';
      try {
        const res = await Api.applyServerTemplate(id, btn.dataset.template);
        showToast(`Template applique : ${res.createdChannels} salon(s) et ${res.createdRoles} role(s) crees${res.skipped ? `, ${res.skipped} deja presents` : ''}.`);
        await renderCreatorPage(id, container);
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Appliquer';
      }
    });
  });

  container.querySelectorAll('.creator-channel-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const res = await Api.createFeatureChannel(id, btn.dataset.feature);
        showToast(res.queued
          ? 'Le bot construit la categorie Staff complete (~10 s).'
          : `Salon ${res.name} cree et configure.`);
        await renderCreatorPage(id, container);
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    });
  });

  // Chips de permissions (demande utilisateur) : multi-selection, bitmask
  // calcule a la creation. Administrator implique tout : les autres chips
  // se desactivent visuellement quand il est actif.
  container.querySelectorAll('.creator-perm-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const active = chip.getAttribute('aria-pressed') !== 'true';
      chip.setAttribute('aria-pressed', String(active));
      chip.classList.toggle('active', active);
      if (chip.dataset.perm === 'Administrator') {
        container.querySelectorAll('.creator-perm-chip:not([data-perm="Administrator"])')
          .forEach((c) => c.classList.toggle('overridden', active));
      }
    });
  });

  container.querySelector('#creator-role-create').addEventListener('click', async () => {
    const name = container.querySelector('#creator-role-name').value.trim();
    if (!name) { showToast('Nom du role requis.', 'error'); return; }
    const activePerms = [...container.querySelectorAll('.creator-perm-chip.active')].map((c) => c.dataset.perm);
    if (activePerms.includes('Administrator')
      && !window.confirm('Ce role aura la permission Administrateur (acces total au serveur). Confirmer ?')) return;
    const mask = activePerms.reduce((acc, k) => acc | (PERMISSION_BITS[k] ?? 0n), 0n);
    try {
      await Api.createRole(id, name, hexToInt(container.querySelector('#creator-role-color').value), mask ? mask.toString() : undefined);
      showToast(`Role "${name}" cree${activePerms.length ? ` avec ${activePerms.length} permission(s)` : ''}.`);
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
          <img class="member-lookup-avatar" src="${memberAvatarUrl(m)}" alt="" width="28" height="28" loading="lazy" decoding="async" />
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

// Confettis visuels (roadmap n°321) : anime a la volee en CSS, pas de
// librairie externe. Desactive si l'utilisateur a demande moins de mouvement.
function launchConfetti() {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#e5484d', '#30a46c', '#d3a13a', '#5865f2', '#c97a5c'];
  const layer = document.createElement('div');
  layer.className = 'dp-confetti-layer';
  for (let i = 0; i < 40; i += 1) {
    const piece = document.createElement('span');
    piece.className = 'dp-confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.4}s`;
    piece.style.animationDuration = `${1.8 + Math.random() * 1.2}s`;
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 3200);
}

async function renderGiveawaysPage(id, container = app) {
  container.innerHTML = skeletonHtml('list');
  const [giveaways, channels, roles, gwConfig] = await Promise.all([
    Api.giveaways(id).catch(() => []),
    Api.channels(id).catch(() => []),
    Api.roles(id).catch(() => []),
    Api.config(id).catch(() => ({})),
  ]);
  const textChannels = channels.filter((c) => c.type === 0);
  const roleName = (rid) => roles.find((r) => r.id === rid)?.name || rid;

  // Confettis a la premiere visite d'un giveaway termine avec gagnant(s)
  // (roadmap n°321) : marque "vu" en localStorage pour ne feter qu'une fois.
  const celebratedKey = `dsc-gw-celebrated-${id}`;
  const celebrated = new Set(JSON.parse(localStorage.getItem(celebratedKey) || '[]'));
  const newlyWon = giveaways.filter((g) => g.closed && g.winners?.length && !celebrated.has(g.id));
  if (newlyWon.length) {
    newlyWon.forEach((g) => celebrated.add(g.id));
    localStorage.setItem(celebratedKey, JSON.stringify([...celebrated]));
    setTimeout(launchConfetti, 300);
  }

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
        ${g.closed && g.entrants?.length ? `<button type="button" class="btn secondary giveaway-reroll-btn" data-giveaway-id="${g.id}" title="Tirer un nouveau gagnant">🔁 Retirer</button>` : ''}
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
        <div id="giveaways-list">${sorted.map(rowHtml).join('') || `
          <div class="dp-empty-state">
            <span style="font-size:1.6rem;">🎁</span>
            <p class="muted" style="margin:6px 0 10px;">Aucun giveaway pour le moment. Lance le premier : les membres participent en un clic dans Discord.</p>
            <button type="button" class="btn secondary" id="gw-empty-cta">Creer le premier giveaway</button>
          </div>`}</div>
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

  // Etat vide avec action (roadmap n°115) : focus direct sur le formulaire.
  container.querySelector('#gw-empty-cta')?.addEventListener('click', () => {
    const input = container.querySelector('#gw-prize');
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.focus();
  });

  // Retirage (roadmap n°161) : nouveau gagnant annonce dans le salon.
  container.querySelectorAll('.giveaway-reroll-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await Api.rerollGiveaway(id, btn.dataset.giveawayId);
        showToast('Nouveau gagnant tire et annonce !');
        await renderGiveawaysPage(id, container);
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    });
  });
}

/* ---------- Pages: statistiques ---------- */

function lineChartSvg(points, {
  width = 560, height = 140, color = 'var(--accent)', gradId = `lc${Math.random().toString(36).slice(2, 8)}`, annotations = [],
} = {}) {
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
  // Annotations d'evenements (roadmap n°325) : ligne pointillee + marqueur,
  // le titre SVG natif sert de tooltip (pas de JS supplementaire requis).
  const annotationMarks = annotations
    .filter((a) => a.index >= 0 && a.index < coords.length)
    .map((a) => {
      const [x] = coords[a.index];
      return `
        <line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${height}" stroke="var(--warning)" stroke-width="1" stroke-dasharray="3,3" opacity="0.7" />
        <circle cx="${x.toFixed(1)}" cy="8" r="4" fill="var(--warning)"><title>${escapeHtml(a.label)}</title></circle>`;
    }).join('');
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
      ${annotationMarks}
    </svg>`;
}

// Decalage horaire (en heures, arrondi) d'un fuseau IANA par rapport a l'UTC
// a l'instant present (roadmap n°203) : pas de librairie de dates dans ce
// projet, Intl suffit pour une approximation correcte au jour pres (DST
// inclus pour la date du jour, ce qui est suffisant pour une heatmap sur
// 28 jours glissants).
function tzOffsetHours(timeZone) {
  try {
    const now = new Date();
    const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const local = new Date(now.toLocaleString('en-US', { timeZone }));
    return Math.round((local - utc) / 3600000);
  } catch {
    return 0;
  }
}

const TIMEZONE_OPTIONS = [
  ['Europe/Paris', 'Europe/Paris (UTC+1/+2)'],
  ['Europe/London', 'Europe/Londres (UTC+0/+1)'],
  ['America/Montreal', 'Amerique/Montreal (UTC-5/-4)'],
  ['America/New_York', 'Amerique/New York (UTC-5/-4)'],
  ['America/Los_Angeles', 'Amerique/Los Angeles (UTC-8/-7)'],
  ['America/Guadeloupe', 'Amerique/Guadeloupe (UTC-4)'],
  ['Indian/Reunion', 'Ocean Indien/Reunion (UTC+4)'],
  ['Pacific/Noumea', 'Pacifique/Noumea (UTC+11)'],
  ['Asia/Dubai', 'Asie/Dubai (UTC+4)'],
  ['Australia/Sydney', 'Australie/Sydney (UTC+10/+11)'],
  ['UTC', 'UTC'],
];

async function renderStatsPage(id, container = app) {
  container.innerHTML = skeletonHtml('chart');
  const [stats, xpData, statMembers, ecoAccounts, statChannels, voiceChannelStats, statConfig, statRoles, channelMsgStats, statPolls, statGiveaways] = await Promise.all([
    Api.stats(id),
    Api.xp(id).catch(() => ({})),
    Api.members(id).catch(() => []),
    Api.economyAccounts(id).catch(() => ({})),
    Api.channels(id).catch(() => []),
    Api.voiceChannelStats(id).catch(() => ({})),
    Api.config(id).catch(() => ({})),
    Api.roles(id).catch(() => []),
    Api.channelMessageStats(id).catch(() => ({})),
    Api.polls(id).catch(() => []),
    Api.giveaways(id).catch(() => []),
  ]);

  // Taux de reponse aux sondages / participation aux giveaways (roadmap
  // n°328) : moyenne, sur chaque sondage/giveaway cloture, du % de membres
  // humains ayant vote/participe.
  const humanMemberCount = statMembers.filter((m) => !m.bot).length || 1;
  const pollParticipationRate = (() => {
    const closedPolls = statPolls.filter((p) => p.options?.length);
    if (!closedPolls.length) return null;
    const rates = closedPolls.map((p) => {
      const voters = new Set();
      p.options.forEach((o) => (o.votes || []).forEach((v) => voters.add(v)));
      return voters.size / humanMemberCount;
    });
    return Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100);
  })();
  const giveawayParticipationRate = (() => {
    const closedGiveaways = statGiveaways.filter((g) => g.closed);
    if (!closedGiveaways.length) return null;
    const rates = closedGiveaways.map((g) => (g.entrants?.length || 0) / humanMemberCount);
    return Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100);
  })();

  const memberPoints = stats.map((s) => s.memberCount);
  const messagePoints = stats.map((s) => s.messageCount);
  const lastDate = stats.length ? stats[stats.length - 1].date : null;
  const firstDate = stats.length ? stats[0].date : null;

  // Compteur de boosts avec historique (roadmap n°330) : reutilise le
  // releve journalier existant (statsStore), zero nouveau store.
  const boostPoints = stats.map((s) => s.boostCount || 0);
  const currentBoosts = boostPoints.length ? boostPoints[boostPoints.length - 1] : 0;

  // Anciennete moyenne des membres actifs (roadmap n°499).
  const humanMembers = statMembers.filter((m) => !m.bot && m.joinedAt);
  const avgTenureDays = humanMembers.length
    ? Math.round(humanMembers.reduce((sum, m) => sum + (Date.now() - new Date(m.joinedAt).getTime()), 0) / humanMembers.length / 86400000)
    : 0;

  // Statistique d'inflation : monnaie totale en circulation (roadmap n°536).
  const totalCurrencyInCirculation = Object.values(ecoAccounts).reduce((sum, acc) => sum + (acc?.balance || 0), 0);

  // Top salons par messages sur 7/30 jours (roadmap n°324).
  const topChannelsFor = (days) => {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const totals = Object.entries(channelMsgStats).map(([channelId, byDate]) => {
      const total = Object.entries(byDate).filter(([d]) => d >= cutoff).reduce((sum, [, c]) => sum + c, 0);
      return { channelId, total };
    }).filter((e) => e.total > 0).sort((a, b) => b.total - a.total).slice(0, 10);
    return totals;
  };
  const topChannels7 = topChannelsFor(7);
  const topChannels30 = topChannelsFor(30);
  const topChannelRowsHtml = (entries) => entries.map((e) => `
    <div class="stats-top-row"><span class="stats-top-name">🔤 ${escapeHtml(statChannels.find((c) => c.id === e.channelId)?.name || 'salon supprime')}</span><span class="stats-top-value">${e.total.toLocaleString('fr-FR')} msg</span></div>
  `).join('') || '<p class="muted">Pas encore assez de donnees.</p>';

  // Repartition des membres par role, en camembert SVG (roadmap n°326).
  const roleDistribution = (() => {
    const realRoles = statRoles.filter((r) => r.name !== '@everyone').sort((a, b) => b.position - a.position);
    const counts = realRoles.map((r) => ({
      role: r,
      count: statMembers.filter((m) => (m.roles || []).includes(r.id)).length,
    })).filter((e) => e.count > 0).sort((a, b) => b.count - a.count).slice(0, 10);
    const total = counts.reduce((sum, e) => sum + e.count, 0) || 1;
    let angle = 0;
    const R = 70;
    const CX = 80;
    const CY = 80;
    const slices = counts.map((e) => {
      const frac = e.count / total;
      const startAngle = angle;
      angle += frac * 360;
      const endAngle = angle;
      const large = (endAngle - startAngle) > 180 ? 1 : 0;
      const toXY = (deg) => [CX + R * Math.cos((deg - 90) * Math.PI / 180), CY + R * Math.sin((deg - 90) * Math.PI / 180)];
      const [x1, y1] = toXY(startAngle);
      const [x2, y2] = toXY(endAngle);
      const color = e.role.color ? `#${e.role.color.toString(16).padStart(6, '0')}` : '#7289da';
      return { path: `M${CX},${CY} L${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`, color, role: e.role, count: e.count, pct: Math.round(frac * 100) };
    });
    return { slices, total: counts.reduce((sum, e) => sum + e.count, 0) };
  })();
  const roleDistributionSvg = roleDistribution.slices.length
    ? `<svg viewBox="0 0 160 160" width="160" height="160" role="img" aria-label="Repartition des membres par role">
        ${roleDistribution.slices.map((s) => `<path d="${s.path}" fill="${s.color}"><title>${escapeHtml(s.role.name)} : ${s.count} (${s.pct}%)</title></path>`).join('')}
      </svg>`
    : '<p class="muted">Pas assez de donnees de roles.</p>';
  const roleDistributionLegend = roleDistribution.slices.map((s) => `
    <div class="row" style="justify-content:space-between; gap:8px; font-size:0.8rem; margin-bottom:2px;"><span><span style="display:inline-block; width:9px; height:9px; border-radius:2px; background:${s.color}; margin-right:6px;"></span>${escapeHtml(s.role.name)}</span><span class="muted">${s.count} (${s.pct}%)</span></div>
  `).join('');

  // Comparaison de periode (roadmap n°035) : 7 derniers jours vs 7 precedents.
  const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);
  const last7 = sum(messagePoints.slice(-7));
  const prev7 = sum(messagePoints.slice(-14, -7));
  const trendHtml = prev7 > 0
    ? (() => {
      const pct = Math.round(((last7 - prev7) / prev7) * 100);
      const cls = pct >= 0 ? 'up' : 'down';
      return `<span class="stats-trend ${cls}" title="${last7} messages ces 7 jours contre ${prev7} les 7 precedents">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)} % vs semaine precedente</span>`;
    })()
    : '';

  // Heatmap heure x jour (roadmap n°030, double fuseau n°203) : repartition
  // des messages sur les 28 derniers jours. Deux vues au choix : heure locale
  // du navigateur (par defaut) ou fuseau configure pour le serveur — utile
  // quand le staff n'est pas dans le meme fuseau que la communaute.
  const localTzShift = -Math.round(new Date().getTimezoneOffset() / 60);
  const serverTimezone = statConfig?.serverTimezone || 'Europe/Paris';
  const serverTzShift = tzOffsetHours(serverTimezone);
  const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const dayOrder = [1, 2, 3, 4, 5, 6, 0];
  let hasHours = false;
  const buildHeatmapHtml = (shift) => {
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
    stats.slice(-28).forEach((s) => {
      if (!Array.isArray(s.hours)) return;
      hasHours = true;
      const day = new Date(`${s.date}T12:00:00Z`).getDay();
      s.hours.forEach((count, utcHour) => {
        if (!count) return;
        grid[day][(utcHour + shift + 24) % 24] += count;
      });
    });
    const maxCell = Math.max(1, ...grid.flat());
    if (!hasHours) return '<p class="muted">La repartition horaire se remplit a partir de maintenant (donnees collectees depuis la mise a jour du bot).</p>';
    return `<div class="stats-heatmap" role="img" aria-label="Repartition des messages par heure et jour de la semaine">
        ${dayOrder.map((d) => `
          <div class="stats-heatmap-row">
            <span class="stats-heatmap-day">${dayNames[d]}</span>
            ${grid[d].map((v, h) => `<span class="stats-heatmap-cell" style="--heat:${(v / maxCell).toFixed(2)}" title="${dayNames[d]} ${h}h : ${v} message(s)"></span>`).join('')}
          </div>`).join('')}
        <div class="stats-heatmap-row stats-heatmap-hours">
          <span class="stats-heatmap-day"></span>
          ${Array.from({ length: 24 }, (_, h) => `<span class="stats-heatmap-hour">${h % 6 === 0 ? h : ''}</span>`).join('')}
        </div>
      </div>`;
  };
  const heatmapHtml = buildHeatmapHtml(localTzShift);

  // Retention (roadmap n°163) : parmi les arrivees brutes d'une fenetre
  // passee (collectees par le bot depuis cette mise a jour), combien de
  // membres sont encore la (joined_at dans la fenetre).
  const retentionHtml = (() => {
    const dayMs = 86400000;
    const now = Date.now();
    const windowStats = (fromDays, toDays) => stats
      .filter((s) => {
        const t = new Date(`${s.date}T12:00:00Z`).getTime();
        return t >= now - fromDays * dayMs && t < now - toDays * dayMs;
      })
      .reduce((acc, s) => acc + (s.joins || 0), 0);
    const stillHere = (fromDays, toDays) => statMembers.filter((m) => {
      if (!m.joinedAt || m.bot) return false;
      const t = new Date(m.joinedAt).getTime();
      return t >= now - fromDays * dayMs && t < now - toDays * dayMs;
    }).length;
    const block = (label, fromDays, toDays) => {
      const joins = windowStats(fromDays, toDays);
      const kept = stillHere(fromDays, toDays);
      if (!joins) return `<div class="stats-top-row"><span class="stats-top-name">${label}</span><span class="muted">collecte en cours (donnees d'arrivees depuis la mise a jour du bot)</span></div>`;
      const pct = Math.min(100, Math.round((kept / joins) * 100));
      return `<div class="stats-top-row"><span class="stats-top-name">${label}</span><span class="stats-top-value">${pct}% (${kept}/${joins} restes)</span></div>`;
    };
    return block('Retention 7 jours', 14, 7) + block('Retention 30 jours', 60, 30);
  })();

  // Top membres (n°031) + stats vocales (n°032) depuis les donnees XP.
  const nameById = new Map(statMembers.map((m) => [m.userId, m.displayName || m.userId]));
  const xpEntries = Object.entries(xpData);
  // Podium visuel or/argent/bronze sur les 3 premiers (roadmap n°588).
  const PODIUM_MEDALS = ['🥇', '🥈', '🥉'];
  const topRow = (uid, value, unit, rank) => `
    <div class="stats-top-row">
      <span class="stats-top-name">${PODIUM_MEDALS[rank] ? `${PODIUM_MEDALS[rank]} ` : ''}${escapeHtml(nameById.get(uid) || 'Membre parti')}</span>
      <span class="stats-top-value">${value.toLocaleString('fr-FR')} ${unit}</span>
    </div>`;
  const topMessages = xpEntries.filter(([, d]) => d.messageCount > 0)
    .sort((a, b) => b[1].messageCount - a[1].messageCount).slice(0, 10)
    .map(([uid, d], i) => topRow(uid, d.messageCount, 'msg', i)).join('') || '<p class="muted">Pas encore de donnees.</p>';
  const topVoice = xpEntries.filter(([, d]) => d.voiceMinutes > 0)
    .sort((a, b) => b[1].voiceMinutes - a[1].voiceMinutes).slice(0, 10)
    .map(([uid, d], i) => topRow(uid, Math.round(d.voiceMinutes / 60 * 10) / 10, 'h vocal', i)).join('') || '<p class="muted">Pas encore de donnees vocales.</p>';

  // Vocal cumule par salon (roadmap n°188) : minutes accumulees par le bot
  // (tick toutes les 5 min, un salon occupe par au moins un humain compte)
  // converties en heures, classees par popularite.
  const voiceChannelRows = (() => {
    const nameById = new Map(statChannels.map((c) => [c.id, c.name]));
    const maxMinutes = Math.max(1, ...Object.values(voiceChannelStats));
    const entries = Object.entries(voiceChannelStats)
      .filter(([, minutes]) => minutes > 0)
      .sort((a, b) => b[1] - a[1]).slice(0, 12);
    if (!entries.length) return '<p class="muted">Pas encore de donnees vocales par salon (collecte depuis la mise a jour du bot).</p>';
    return `<div class="stats-voice-channels">${entries.map(([channelId, minutes]) => {
      const hours = Math.round((minutes / 60) * 10) / 10;
      const pct = Math.round((minutes / maxMinutes) * 100);
      return `
        <div class="stats-top-row" style="flex-direction:column; align-items:stretch; gap:4px;">
          <span class="row" style="justify-content:space-between;">
            <span class="stats-top-name">🔊 ${escapeHtml(nameById.get(channelId) || 'Salon supprime')}</span>
            <span class="stats-top-value">${hours.toLocaleString('fr-FR')} h</span>
          </span>
          <span class="progress-gauge"><span class="progress-gauge-fill" style="width:${pct}%"></span></span>
        </div>`;
    }).join('')}</div>`;
  })();

  // Classement richesse (roadmap n°157) depuis les comptes economie du bot.
  const topWealth = Object.entries(ecoAccounts)
    .filter(([, acc]) => (acc?.balance || 0) > 0)
    .sort((a, b) => (b[1].balance || 0) - (a[1].balance || 0)).slice(0, 10)
    .map(([uid, acc], i) => topRow(uid, acc.balance, 'pieces', i)).join('') || '<p class="muted">Pas encore de comptes actifs.</p>';

  // Tendance sur la croissance des membres (roadmap n°165) : delta net des
  // 7 derniers jours vs les 7 precedents.
  const memberTrendHtml = (() => {
    if (memberPoints.length < 15) return '';
    const deltaLast = memberPoints[memberPoints.length - 1] - memberPoints[memberPoints.length - 8];
    const deltaPrev = memberPoints[memberPoints.length - 8] - memberPoints[memberPoints.length - 15];
    const cls = deltaLast >= deltaPrev ? 'up' : 'down';
    const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
    return `<span class="stats-trend ${cls}" title="Delta net de membres : 7 derniers jours vs 7 precedents">${deltaLast >= deltaPrev ? '▲' : '▼'} ${sign(deltaLast)} membres (vs ${sign(deltaPrev)})</span>`;
  })();

  // Annotations d'evenements sur le graphique de croissance (roadmap n°325) :
  // texte libre pose par le staff sur une date, resolu vers l'index du
  // releve journalier correspondant.
  const growthAnnotations = (statConfig?.growthAnnotations || [])
    .map((a) => ({ ...a, index: stats.findIndex((s) => s.date === a.date) }));

  container.innerHTML = `
    <div class="inner">
      ${quickJumpBarHtml([
    ['stats-members', 'Membres'], ['stats-activity', 'Activite'], ['stats-voice-channels', 'Vocal par salon'],
    ['stats-top-channels', 'Top salons'], ['stats-role-distribution', 'Repartition roles'], ['stats-boosts', 'Boosts'],
    ['stats-participation', 'Participation'], ['stats-misc', 'Autres indicateurs'],
  ], 'stats')}
      ${sectionHtml('Membres', `
        <p class="muted">Evolution du nombre de membres (${stats.length} jour(s) enregistre(s)${firstDate ? `, depuis le ${firstDate}` : ''}). ${memberTrendHtml}</p>
        ${lineChartSvg(memberPoints, { color: 'var(--accent)', annotations: growthAnnotations })}
        ${lastDate ? `<p class="muted" style="margin-top:8px;">Dernier releve : ${lastDate} — ${memberPoints[memberPoints.length - 1]} membre(s)</p>` : ''}
        <button type="button" class="btn secondary chart-export-png" data-chart="membres" style="margin-top:6px;">🖼️ Exporter en PNG</button>
        <div class="dp-subsection-divider"></div>
        <p class="dp-block-title">🚩 Annotations d'evenements</p>
        <div id="growth-annotations-list">${(statConfig?.growthAnnotations || []).map((a, i) => `
          <div class="row" style="justify-content:space-between; margin-bottom:4px;">
            <span class="muted" style="font-size:0.82rem;">${a.date} — ${escapeHtml(a.label)}</span>
            <button type="button" class="btn danger delete-growth-annotation" data-index="${i}">Supprimer</button>
          </div>`).join('') || '<p class="muted" style="font-size:0.8rem;">Aucune annotation.</p>'}</div>
        <div class="row" style="margin-top:8px; gap:8px; flex-wrap:wrap;">
          <input type="date" id="new-growth-annotation-date" aria-label="Date de l'evenement" style="flex:none;" />
          <input type="text" id="new-growth-annotation-label" placeholder="Ex : lancement du giveaway Noel" maxlength="80" style="flex:1; min-width:160px;" />
          <button type="button" class="btn secondary" id="add-growth-annotation">Ajouter</button>
        </div>
      `, { id: 'stats-members' })}
      ${sectionHtml('Activite (messages/jour)', `
        <p class="muted">Nombre de messages envoyes par jour (hors bots). ${trendHtml}</p>
        ${lineChartSvg(messagePoints, { color: 'var(--success)' })}
        <button type="button" class="btn secondary chart-export-png" data-chart="messages" style="margin-top:6px;">🖼️ Exporter en PNG</button>
        <h2 style="margin-top:18px; font-size:0.85rem;">🕐 Heures d'activite (28 derniers jours)</h2>
        <div class="row" role="group" aria-label="Fuseau horaire affiche" style="gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:8px;">
          <button type="button" class="btn heatmap-tz-btn" data-shift="${localTzShift}">🕐 Mon heure (navigateur)</button>
          <button type="button" class="btn secondary heatmap-tz-btn" data-shift="${serverTzShift}">🌍 Heure serveur (${escapeHtml(serverTimezone)})</button>
        </div>
        <div id="stats-heatmap-container">${heatmapHtml}</div>
        <div class="row" style="gap:8px; flex-wrap:wrap; align-items:center; margin-top:10px;">
          <label for="stats-server-tz" style="margin:0;">Fuseau du serveur :</label>
          <select id="stats-server-tz" style="margin:0; max-width:220px;">
            ${TIMEZONE_OPTIONS.map(([tz, label]) => `<option value="${tz}" ${tz === serverTimezone ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
          <button type="button" class="btn secondary" id="stats-server-tz-save">💾 Enregistrer</button>
        </div>
        <div class="stats-top-grid">
          <div>
            <h2 style="font-size:0.85rem;">💬 Top membres (messages)</h2>
            ${topMessages}
          </div>
          <div>
            <h2 style="font-size:0.85rem;">🔊 Top membres (vocal)</h2>
            ${topVoice}
          </div>
          <div>
            <h2 style="font-size:0.85rem;">🪙 Top richesse</h2>
            ${topWealth}
          </div>
        </div>
        <h2 style="font-size:0.85rem; margin-top:16px;">🧲 Retention des nouveaux membres</h2>
        <p class="muted" style="font-size:0.78rem;">Parmi les membres arrives dans la fenetre, combien sont encore la aujourd'hui.</p>
        ${retentionHtml}
        <button type="button" class="btn secondary" id="stats-export-csv" style="margin-top:14px;">⬇️ Exporter en CSV</button>
      `, { id: 'stats-activity' })}
      ${sectionHtml('Vocal par salon', `
        <p class="muted">Temps cumule d'occupation de chaque salon vocal (heures totales, tous membres confondus).</p>
        ${voiceChannelRows}
      `, { id: 'stats-voice-channels' })}

      ${sectionHtml('Top salons par messages (roadmap n°324)', `
        <div class="row" style="gap:8px; margin-bottom:10px;">
          <button type="button" class="btn top-channels-period" data-days="7">7 jours</button>
          <button type="button" class="btn secondary top-channels-period" data-days="30">30 jours</button>
        </div>
        <div id="top-channels-list">${topChannelRowsHtml(topChannels7)}</div>
      `, { id: 'stats-top-channels' })}

      ${sectionHtml('Repartition des membres par role (roadmap n°326)', `
        <div class="row" style="gap:20px; align-items:flex-start; flex-wrap:wrap;">
          <div>${roleDistributionSvg}</div>
          <div style="flex:1; min-width:180px;">${roleDistributionLegend || '<p class="muted">Pas assez de donnees.</p>'}</div>
        </div>
      `, { id: 'stats-role-distribution' })}

      ${sectionHtml('Compteur de boosts (roadmap n°330)', `
        <p class="muted">Actuellement : <strong>${currentBoosts}</strong> boost(s).</p>
        ${boostPoints.some((v) => v > 0) ? lineChartSvg(boostPoints, { color: '#f47fff' }) : '<p class="muted">Pas encore de boost enregistre.</p>'}
      `, { id: 'stats-boosts' })}

      ${sectionHtml('Participation sondages & giveaways (roadmap n°328)', `
        <p class="muted">Moyenne, sur les sondages et giveaways clotures, du pourcentage de membres humains ayant vote ou participe.</p>
        <div class="stats-top-grid">
          <div class="dp-block" style="text-align:center;">
            <p class="dp-block-title" style="margin:0;">🗳️ Sondages</p>
            <p style="font-size:1.6rem; font-weight:700; margin:6px 0 0;">${pollParticipationRate === null ? '—' : `${pollParticipationRate}%`}</p>
            <p class="muted" style="font-size:0.76rem; margin:2px 0 0;">${statPolls.length ? `${statPolls.length} sondage(s)` : 'Aucun sondage cree'}</p>
          </div>
          <div class="dp-block" style="text-align:center;">
            <p class="dp-block-title" style="margin:0;">🎉 Giveaways</p>
            <p style="font-size:1.6rem; font-weight:700; margin:6px 0 0;">${giveawayParticipationRate === null ? '—' : `${giveawayParticipationRate}%`}</p>
            <p class="muted" style="font-size:0.76rem; margin:2px 0 0;">${statGiveaways.filter((g) => g.closed).length ? `${statGiveaways.filter((g) => g.closed).length} giveaway(s) termine(s)` : 'Aucun giveaway termine'}</p>
          </div>
        </div>
      `, { id: 'stats-participation' })}

      ${sectionHtml('Autres indicateurs', `
        <div class="stats-top-row"><span class="stats-top-name">📅 Anciennete moyenne des membres (n°499)</span><span class="stats-top-value">${avgTenureDays} jour(s)</span></div>
        <div class="stats-top-row"><span class="stats-top-name">🪙 Monnaie totale en circulation (n°536)</span><span class="stats-top-value">${totalCurrencyInCirculation.toLocaleString('fr-FR')}</span></div>
      `, { id: 'stats-misc' })}
    </div>
  `;
  wireQuickJump(container);

  // Bascule 7/30 jours pour le top salons (roadmap n°324).
  container.querySelectorAll('.top-channels-period').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.top-channels-period').forEach((b) => b.classList.add('secondary'));
      btn.classList.remove('secondary');
      const entries = Number(btn.dataset.days) === 30 ? topChannels30 : topChannels7;
      container.querySelector('#top-channels-list').innerHTML = topChannelRowsHtml(entries);
    });
  });

  // Bascule heure locale / heure serveur sur la heatmap (roadmap n°203).
  container.querySelectorAll('.heatmap-tz-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.heatmap-tz-btn').forEach((b) => b.classList.add('secondary'));
      btn.classList.remove('secondary');
      container.querySelector('#stats-heatmap-container').innerHTML = buildHeatmapHtml(Number(btn.dataset.shift));
    });
  });
  container.querySelector('#stats-server-tz-save').addEventListener('click', async () => {
    try {
      await Api.updateConfig(id, { serverTimezone: container.querySelector('#stats-server-tz').value });
      showToast('Fuseau du serveur enregistre.');
      await renderStatsPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Export PNG d'un graphique SVG (roadmap n°164) : les couleurs en
  // var(--...) ne se resolvent pas hors du document, on copie donc les
  // stroke/fill CALCULES sur un clone avant serialisation.
  container.querySelectorAll('.chart-export-png').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const svgEl = btn.closest('.section-panel')?.querySelector('svg');
      if (!svgEl) { showToast('Aucun graphique a exporter.', 'error'); return; }
      try {
        const clone = svgEl.cloneNode(true);
        const origEls = [svgEl, ...svgEl.querySelectorAll('*')];
        const cloneEls = [clone, ...clone.querySelectorAll('*')];
        origEls.forEach((el, i) => {
          const cs = getComputedStyle(el);
          if (cs.stroke && cs.stroke !== 'none') cloneEls[i].setAttribute('stroke', cs.stroke);
          if (cs.fill && cs.fill !== 'none') cloneEls[i].setAttribute('fill', cs.fill);
        });
        const rect = svgEl.getBoundingClientRect();
        clone.setAttribute('width', rect.width);
        clone.setAttribute('height', rect.height);
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
        });
        const canvas = document.createElement('canvas');
        canvas.width = rect.width * 2;
        canvas.height = rect.height * 2;
        const c = canvas.getContext('2d');
        c.fillStyle = getComputedStyle(document.body).backgroundColor || '#14100e';
        c.fillRect(0, 0, canvas.width, canvas.height);
        c.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `graphique-${btn.dataset.chart || 'stats'}-${id}.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          showToast('Graphique exporte en PNG.');
        }, 'image/png');
      } catch (err) {
        showToast(`Export impossible : ${err.message}`, 'error');
      }
    });
  });

  document.getElementById('add-growth-annotation')?.addEventListener('click', async () => {
    const date = document.getElementById('new-growth-annotation-date').value;
    const label = document.getElementById('new-growth-annotation-label').value.trim();
    if (!date || !label) { showToast('Date et texte requis.', 'error'); return; }
    try {
      const annotations = [...(statConfig?.growthAnnotations || []), { date, label }];
      await Api.updateConfig(id, { growthAnnotations: annotations });
      showToast('Annotation ajoutee.');
      await renderStatsPage(id, container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  container.querySelectorAll('.delete-growth-annotation').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const annotations = (statConfig?.growthAnnotations || []).filter((_, i) => i !== Number(btn.dataset.index));
        await Api.updateConfig(id, { growthAnnotations: annotations });
        showToast('Annotation supprimee.');
        await renderStatsPage(id, container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  // Export CSV (roadmap n°036).
  container.querySelector('#stats-export-csv').addEventListener('click', () => {
    const rows = [['date', 'membres', 'messages'], ...stats.map((s) => [s.date, s.memberCount, s.messageCount])];
    const csv = rows.map((r) => r.join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `stats-${id}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('CSV telecharge.');
  });
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
      <button type="button" class="btn secondary embed-field-duplicate" title="Dupliquer ce champ" aria-label="Dupliquer ce champ">⧉</button>
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
function messagePreviewHtml(content, embeds, buttons = []) {
  const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const embedsHtml = embeds.map(embedPreviewHtml).join('');
  const contentHtml = content ? `<div class="embed-preview-content">${renderMarkdownLite(content)}</div>` : '';
  const buttonsHtml = buttons.length
    ? `<div class="embed-preview-buttons">${buttons.map((b) => `<span class="embed-preview-btn ${b.kind}">${b.emoji ? `${escapeHtml(b.emoji)} ` : ''}${escapeHtml(b.label)}${b.kind === 'link' ? ' ↗' : ''}</span>`).join('')}</div>`
    : '';
  if (!contentHtml && !embedsHtml && !buttonsHtml) {
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
        ${buttonsHtml}
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
  // Bibliotheque etendue (roadmap n°126).
  {
    key: 'faq',
    label: '❓ FAQ',
    embed: {
      title: '❓ Questions frequentes',
      color: 0x5b8def,
      fields: [
        { name: 'Comment obtenir mes roles ?', value: 'Rends-toi dans le salon des roles et clique sur les boutons.', inline: false },
        { name: 'Comment contacter le staff ?', value: 'Ouvre un ticket dans le salon support.', inline: false },
        { name: 'Comment monter de niveau ?', value: 'Participe aux discussions : chaque message et minute en vocal rapporte de l\'XP.', inline: false },
      ],
      footer: { text: 'Une autre question ? Ouvre un ticket !' },
    },
  },
  {
    key: 'evenement',
    label: '🗓️ Evenement',
    embed: {
      title: '🗓️ Evenement communautaire',
      description: '**Quoi :** ...\n**Quand :** ...\n**Ou :** salon vocal principal\n\nReagis avec ✅ pour t\'inscrire !',
      color: 0x30a46c,
      footer: { text: '{server} — on t\'attend !' },
    },
  },
  {
    key: 'partenariat',
    label: '🤝 Partenariat',
    embed: {
      title: '🤝 Nouveau partenariat',
      description: 'Nous sommes fiers de nous associer avec **...** !\n\n**Ce que ca apporte :**\n- ...\n- ...\n\nLien d\'invitation : ...',
      color: 0xd9a03c,
    },
  },
  {
    key: 'recrutement',
    label: '🧑‍💼 Recrutement staff',
    embed: {
      title: '🧑‍💼 On recrute !',
      description: 'Le staff de **{server}** s\'agrandit.\n\n**Postes ouverts :** moderateur, animateur\n**Conditions :** actif, majeur, motive\n**Pour postuler :** ouvre un ticket avec le motif « candidature ».',
      color: 0xc97a5c,
      footer: { text: 'Candidatures ouvertes jusqu\'au ...' },
    },
  },
];

// Variables dynamiques (n°004) : resolues dans l'apercu ET au moment de
// poster/programmer (cote client, avec les valeurs du serveur courant).
let embedVarContext = null;
function resolveEmbedVars(text) {
  if (typeof text !== 'string' || !text) return text;
  let out = text.replaceAll('{date}', new Date().toLocaleDateString('fr-FR'));
  if (embedVarContext?.server) out = out.replaceAll('{server}', embedVarContext.server);
  if (embedVarContext?.memberCount != null) out = out.replaceAll('{memberCount}', String(embedVarContext.memberCount));
  // Variables etendues (roadmap n°240).
  if (embedVarContext?.online != null) out = out.replaceAll('{online}', String(embedVarContext.online));
  if (embedVarContext?.boosts != null) out = out.replaceAll('{boosts}', String(embedVarContext.boosts));
  if (embedVarContext?.owner) out = out.replaceAll('{owner}', embedVarContext.owner);
  if (embedVarContext?.ageServeur != null) out = out.replaceAll('{age_serveur}', `${embedVarContext.ageServeur} j`);
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

function buildButtonsFromForm(root) {
  return [...root.querySelectorAll('.embed-btn-row')].map((row) => {
    const kind = row.querySelector('.embed-btn-kind').value;
    return {
      kind,
      label: row.querySelector('.embed-btn-label').value.trim(),
      emoji: row.querySelector('.embed-btn-emoji').value.trim() || undefined,
      url: kind === 'link' ? row.querySelector('.embed-btn-url').value.trim() : undefined,
      roleId: kind === 'role' ? row.querySelector('.embed-btn-role').value : undefined,
    };
  }).filter((b) => b.label);
}

// Pour l'apercu uniquement : les references attachment:// (fichiers locaux
// pas encore envoyes) sont remplacees par leur objectURL en memoire.
function resolveAttachmentUrls(embed) {
  const resolve = (url) => {
    if (typeof url !== 'string' || !url.startsWith('attachment://')) return url;
    const name = url.slice('attachment://'.length);
    for (const entry of window.__embedLocalFiles.values()) {
      if (entry.filename === name) return entry.objectUrl;
    }
    return '';
  };
  const out = { ...embed };
  if (out.image?.url) out.image = { url: resolve(out.image.url) };
  if (out.thumbnail?.url) out.thumbnail = { url: resolve(out.thumbnail.url) };
  if (out.author?.icon_url) out.author = { ...out.author, icon_url: resolve(out.author.icon_url) };
  if (out.footer?.icon_url) out.footer = { ...out.footer, icon_url: resolve(out.footer.icon_url) };
  return out;
}

function updateEmbedPreview(root) {
  const { embed, content } = buildEmbedFromForm(root);
  const state = root.__mb;
  if (state) state.embeds[state.active] = embed;
  const embeds = state ? state.embeds : [embed];
  root.querySelector('#embed-preview-slot').innerHTML = messagePreviewHtml(resolveEmbedVars(content), embeds.map((e) => resolveAttachmentUrls(substituteEmbedVars(e))), buildButtonsFromForm(root));

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
    <span class="embed-tab-group" draggable="true" data-index="${i}">
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
    // Alternative clavier au drag&drop (roadmap n°239), meme logique que les
    // champs d'embed : Alt+fleche gauche/droite deplace l'onglet.
    btn.addEventListener('keydown', (e) => {
      if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault();
      const i = Number(btn.dataset.index);
      const j = e.key === 'ArrowLeft' ? i - 1 : i + 1;
      if (j < 0 || j >= state.embeds.length) return;
      moveEmbedTab(root, i, j);
      root.querySelector(`.embed-tab-btn[data-index="${j}"]`)?.focus();
    });
  });
  const addTabBtn = root.querySelector('#embed-tab-add');
  if (addTabBtn) addTabBtn.addEventListener('click', () => addEmbedTab(root));
  const dupTabBtn = root.querySelector('#embed-tab-duplicate');
  if (dupTabBtn) dupTabBtn.addEventListener('click', () => duplicateEmbedTab(root));

  // Glisser-deposer pour reordonner les embeds multiples (roadmap n°239).
  if (state.embeds.length > 1) {
    root.querySelectorAll('.embed-tab-group').forEach((group) => {
      group.ondragstart = (e) => {
        group.classList.add('dragging');
        e.dataTransfer.setData('text/plain', '');
        e.dataTransfer.effectAllowed = 'move';
      };
      group.ondragover = (e) => {
        e.preventDefault();
        const list = group.parentElement;
        const dragging = list.querySelector('.embed-tab-group.dragging');
        if (!dragging || dragging === group) return;
        const rect = group.getBoundingClientRect();
        const before = (e.clientX - rect.left) < rect.width / 2;
        const target = before ? group : group.nextSibling;
        if (dragging.nextSibling === target) return;
        list.insertBefore(dragging, target);
      };
      group.ondragend = () => {
        group.classList.remove('dragging');
        const domOrder = [...root.querySelector('#embed-tabs').querySelectorAll('.embed-tab-group')].map((g) => Number(g.dataset.index));
        if (domOrder.every((idx, pos) => idx === pos)) return; // rien deplace
        const activeEmbed = state.embeds[state.active];
        state.embeds = domOrder.map((idx) => state.embeds[idx]);
        state.active = state.embeds.indexOf(activeEmbed);
        renderEmbedTabs(root);
      };
    });
  }
}

// Deplace l'embed d'index i vers j (roadmap n°239, utilise par le raccourci
// clavier Alt+fleches).
function moveEmbedTab(root, i, j) {
  const state = root.__mb;
  const activeEmbed = state.embeds[state.active];
  const [moved] = state.embeds.splice(i, 1);
  state.embeds.splice(j, 0, moved);
  state.active = state.embeds.indexOf(activeEmbed);
  renderEmbedTabs(root);
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
  // Duplication d'un champ (roadmap n°132) : copie nom/valeur/inline juste
  // en dessous de l'original.
  root.querySelectorAll('.embed-field-duplicate').forEach((btn) => {
    btn.onclick = () => {
      if (root.querySelectorAll('.embed-field-row').length >= 25) {
        showToast('25 champs maximum par embed.', 'error');
        return;
      }
      const row = btn.closest('.embed-field-row');
      row.insertAdjacentHTML('afterend', embedFieldRowHtml({
        name: row.querySelector('.embed-field-name').value,
        value: row.querySelector('.embed-field-value').value,
        inline: row.querySelector('.embed-field-inline-input').checked,
      }));
      wireEmbedFieldRows(root);
      updateEmbedPreview(root);
    };
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

// Navigation clavier par fleches (pattern ARIA toolbar/grid, roadmap n°173) :
// un seul element du groupe reste dans l'ordre de tabulation (tabindex 0),
// les autres passent a -1 ; les fleches deplacent le focus a l'interieur du
// groupe sans le quitter au Tab. Utilise sur la barre markdown et les
// swatches de couleur du generateur d'embed.
function wireRovingKeyboardGroup(container, itemSelector) {
  const items = [...container.querySelectorAll(itemSelector)];
  if (!items.length) return;
  items.forEach((el, i) => { el.tabIndex = i === 0 ? 0 : -1; });
  items.forEach((el, i) => {
    el.addEventListener('keydown', (e) => {
      let target = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') target = items[(i + 1) % items.length];
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') target = items[(i - 1 + items.length) % items.length];
      else if (e.key === 'Home') target = items[0];
      else if (e.key === 'End') target = items[items.length - 1];
      if (!target) return;
      e.preventDefault();
      items.forEach((x) => { x.tabIndex = -1; });
      target.tabIndex = 0;
      target.focus();
    });
  });
}

async function renderEmbedBuilderPage(id, container = app) {
  container.innerHTML = skeletonHtml();
  const [channels, templates, members, embedRoles, embedHistory] = await Promise.all([
    Api.channels(id),
    Api.embedTemplates(id).catch(() => []),
    Api.members(id).catch(() => null),
    Api.roles(id).catch(() => []),
    Api.embedHistory(id).catch(() => []),
  ]);
  const textChannels = channels.filter((c) => c.type === 0);
  const channelOptions = textChannels.map((c) => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');
  embedVarContext = {
    server: allGuilds.find((g) => g.guildId === id)?.name || null,
    memberCount: Array.isArray(members) ? members.length : null,
    // Age du serveur (n°240) : calcule cote client depuis le snowflake de
    // l'ID, aucun appel reseau necessaire (meme trick que threadAutoClose).
    ageServeur: Math.floor((Date.now() - Number((BigInt(id) >> 22n) + 1420070400000n)) / 86400000),
  };
  Api.guildDetails(id).then((d) => {
    if (embedVarContext) Object.assign(embedVarContext, { online: d.online, boosts: d.boosts, owner: d.ownerTag });
  }).catch(() => {});

  // Recherche dans les modeles sauvegardes (roadmap n°243) : filtre cote
  // client sur le nom, la liste grandissant vite des qu'on en enregistre
  // regulierement.
  const templateRows = (query = '') => {
    const q = query.trim().toLowerCase();
    const filtered = q ? templates.filter((t) => t.name.toLowerCase().includes(q)) : templates;
    return filtered.map((t) => `
    <div class="embed-template-row" data-id="${t.id}">
      <span class="embed-template-name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</span>
      <button class="btn secondary embed-load-template" data-id="${t.id}">Charger</button>
      <button class="btn secondary embed-share-template" data-id="${t.id}" title="Partager vers un autre serveur (code court)" aria-label="Partager le modele ${escapeHtml(t.name)}">📤</button>
      <button class="btn danger embed-delete-template" data-id="${t.id}" title="Supprimer le modele" aria-label="Supprimer le modele ${escapeHtml(t.name)}">✕</button>
    </div>
  `).join('') || `<p class="muted">${q ? 'Aucun modele ne correspond a la recherche.' : 'Aucun modele enregistre.'}</p>`;
  };

  container.innerHTML = `
    <div class="inner" style="max-width:none;">
      <div class="embed-mobile-tabs" role="group" aria-label="Basculer formulaire / apercu">
        <button type="button" class="btn secondary" id="embed-mobile-form-btn" aria-pressed="true">📝 Formulaire</button>
        <button type="button" class="btn secondary" id="embed-mobile-preview-btn" aria-pressed="false">👁️ Apercu</button>
      </div>
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
            <div class="embed-md-toolbar" role="toolbar" aria-label="Mise en forme markdown">
              <button type="button" class="embed-md-btn" data-md="bold" title="Gras"><strong>B</strong></button>
              <button type="button" class="embed-md-btn" data-md="italic" title="Italique"><em>I</em></button>
              <button type="button" class="embed-md-btn" data-md="underline" title="Souligne"><u>S</u></button>
              <button type="button" class="embed-md-btn" data-md="strike" title="Barre"><s>T</s></button>
              <button type="button" class="embed-md-btn" data-md="code" title="Code">&lt;/&gt;</button>
              <button type="button" class="embed-md-btn" data-md="link" title="Lien [texte](url)">🔗</button>
              <button type="button" class="embed-md-btn" data-md="list" title="Liste a puces">•—</button>
            </div>
            <textarea id="embed-description" maxlength="4096" placeholder="Texte principal (markdown Discord supporte)" data-charcount data-md-link></textarea>
            <div class="embed-vars-row" role="group" aria-label="Variables dynamiques">
              <span>Variables :</span>
              <button type="button" class="embed-var-chip" data-var="{server}" title="Nom du serveur">{server}</button>
              <button type="button" class="embed-var-chip" data-var="{memberCount}" title="Nombre de membres">{memberCount}</button>
              <button type="button" class="embed-var-chip" data-var="{date}" title="Date du jour">{date}</button>
              <button type="button" class="embed-var-chip" data-var="{online}" title="Membres en ligne (approx.)">{online}</button>
              <button type="button" class="embed-var-chip" data-var="{boosts}" title="Nombre de boosts">{boosts}</button>
              <button type="button" class="embed-var-chip" data-var="{owner}" title="Pseudo du proprietaire">{owner}</button>
              <button type="button" class="embed-var-chip" data-var="{age_serveur}" title="Age du serveur en jours">{age_serveur}</button>
              <button type="button" class="embed-var-chip" id="embed-ts-btn" aria-expanded="false" title="Inserer un timestamp Discord dynamique">🕒 Timestamp</button>
            </div>
            <div class="row" id="embed-ts-row" style="display:none; gap:6px; align-items:center; flex-wrap:wrap;">
              <input type="datetime-local" id="embed-ts-date" aria-label="Date et heure du timestamp" style="margin:0;" />
              <select id="embed-ts-format" aria-label="Format du timestamp" style="margin:0; max-width:200px;">
                <option value="R">Relatif (dans 2 jours)</option>
                <option value="F">Complet (jour + date + heure)</option>
                <option value="f">Court (date + heure)</option>
                <option value="t">Heure seule</option>
              </select>
              <button type="button" class="btn secondary" id="embed-ts-insert">Inserer</button>
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
                <input type="text" id="embed-thumbnail" placeholder="Miniature : https://... ou glisse une image" />
              </div>
              <div>
                <label for="embed-image">Image (grande image, en bas)</label>
                <input type="text" id="embed-image" placeholder="Grande image : https://... ou glisse une image" />
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
            <div class="row" style="gap:8px; align-items:center; margin-top:6px; flex-wrap:wrap;">
              <button type="button" class="btn secondary" id="embed-save-signature">💾 Enregistrer comme signature d'equipe</button>
              <label class="dp-toggle-row" style="margin:0;">
                <span>Signature d'equipe automatique</span>
                <input type="checkbox" id="embed-team-signature" />
              </label>
            </div>
            <label class="dp-toggle-row" style="margin-top:8px;">
              <span>Inclure la date/heure actuelles</span>
              <input type="checkbox" id="embed-timestamp" />
            </label>

            <div class="dp-subsection-divider"></div>
            <p class="dp-block-title">🔘 Boutons sous le message</p>
            <p class="muted" style="font-size:0.78rem; margin:0 0 6px;">Lien = ouvre une page. Role = donne/retire le role au clic (max 5, non inclus dans les envois programmes).</p>
            <div id="embed-buttons-list"></div>
            <button type="button" class="btn secondary" id="embed-add-button" style="margin-top:8px;">+ Ajouter un bouton</button>

            <div class="dp-subsection-divider"></div>
            <p class="dp-block-title">💾 Modeles</p>
            <div class="embed-presets-row" role="group" aria-label="Modeles prets a l'emploi">
              ${EMBED_PRESETS.map((p) => `<button type="button" class="embed-preset-btn" data-preset="${p.key}">${p.label}</button>`).join('')}
            </div>
            <div id="embed-draft-row"></div>
            ${templates.length > 5 ? '<input type="text" id="embed-template-search" placeholder="Rechercher un modele..." aria-label="Rechercher un modele" style="margin-bottom:8px;" />' : ''}
            <button type="button" class="btn secondary" id="embed-import-shared" style="margin-bottom:8px;">📥 Importer via un code</button>
            <div id="embed-templates-list">${templateRows()}</div>
            <details class="dp-activity-details" id="embed-trash-details">
              <summary class="dp-block-title">🗑️ Corbeille d'embeds (roadmap n°222)</summary>
              <div id="embed-trash-list"><p class="muted" style="font-size:0.8rem;">Chargement...</p></div>
            </details>

            <div class="dp-subsection-divider"></div>
            <p class="dp-block-title">🕘 Derniers envois</p>
            <div id="embed-history-list">${embedHistory.slice().reverse().map((h) => `
              <div class="embed-template-row">
                <span class="embed-template-name" title="${escapeHtml(h.embeds?.[0]?.title || h.content || 'Sans titre')}">
                  ${escapeHtml((h.embeds?.[0]?.title || h.content || 'Sans titre').slice(0, 40))}
                  <span class="muted" style="font-size:0.72rem;">— #${escapeHtml(textChannels.find((c) => c.id === h.channelId)?.name || '?')}, ${new Date(h.postedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                </span>
                <button class="btn secondary embed-history-load" data-history-id="${h.id}">Recharger</button>
                ${h.messageId ? `<button class="btn secondary embed-history-edit" data-history-id="${h.id}" title="Recharge le formulaire puis mettra a jour CE message a l'envoi">✏️ Editer</button>` : ''}
              </div>`).join('') || '<p class="muted">Aucun envoi encore. Les 15 derniers embeds postes apparaitront ici.</p>'}</div>

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
            <button type="button" class="embed-json-jump" id="embed-preview-theme-btn" aria-pressed="false" title="Simuler le theme clair de Discord">☀️ Theme clair</button>
          </div>
          <div id="embed-preview-slot"></div>
          <p class="embed-char-total" id="embed-char-total" aria-live="polite"></p>
          <label style="margin-top:14px;" for="embed-target-channel">Salon de destination</label>
          <select id="embed-target-channel">${channelOptions}</select>
          <details class="dp-activity-details" id="embed-multi-channel-details">
            <summary style="font-size:0.8rem;">➕ Envoyer aussi vers d'autres salons (roadmap n°234)</summary>
            <div class="channel-picker" style="max-height:140px; margin-top:8px;">
              ${textChannels.map((c) => `<label><input type="checkbox" value="${c.id}" class="embed-extra-channel" /> #${escapeHtml(c.name)}</label>`).join('')}
            </div>
          </details>
          <label style="margin-top:10px;" for="embed-target-message-id">ID du message a editer (optionnel — laisse vide pour poster un nouveau message)</label>
          <input type="text" id="embed-target-message-id" placeholder="Clic droit sur le message > Copier l'ID" />
          <button class="btn secondary" id="embed-load-message-btn" style="margin-top:8px; width:100%;">📥 Charger le contenu de ce message</button>
          <button class="btn secondary" id="embed-test-dm-btn" style="margin-top:10px; width:100%;">🧪 Tester en MP</button>
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
  // Repart proprement : les fichiers locaux d'une session precedente sont
  // liberes (objectURL) et oublies.
  window.__embedLocalFiles.forEach((entry) => URL.revokeObjectURL(entry.objectUrl));
  window.__embedLocalFiles.clear();
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
  wireRovingKeyboardGroup(container, '.dp-color-swatches .embed-color-swatch-btn');
  wireRovingKeyboardGroup(container, '.embed-md-toolbar .embed-md-btn');

  container.querySelector('#embed-clear-btn').addEventListener('click', () => {
    if (!window.confirm("Vider l'embed affiche ? Le texte du message et les autres embeds sont conserves.")) return;
    populateEmbedForm(container, {}, container.querySelector('#embed-content').value);
  });

  // Embed genere par l'IA (roadmap n°249) : consomme-et-efface, sinon il se
  // rechargerait a chaque navigation vers ce module.
  if (window.__aiGeneratedEmbed) {
    populateEmbedForm(container, window.__aiGeneratedEmbed, container.querySelector('#embed-content').value);
    window.__aiGeneratedEmbed = null;
  }

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

  // Barre d'outils markdown (roadmap n°128) : entoure la selection (ou
  // insere un gabarit) dans la derniere zone de texte utilisee.
  const MD_WRAPPERS = {
    bold: ['**', '**'], italic: ['*', '*'], underline: ['__', '__'], strike: ['~~', '~~'], code: ['`', '`'],
  };
  container.querySelectorAll('.embed-md-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const area = container.__lastMdArea || container.querySelector('#embed-description');
      const start = area.selectionStart ?? area.value.length;
      const end = area.selectionEnd ?? start;
      const selected = area.value.slice(start, end);
      const kind = btn.dataset.md;
      let insert;
      if (kind === 'link') insert = `[${selected || 'texte'}](https://)`;
      else if (kind === 'list') insert = (selected || 'element').split('\n').map((l) => `- ${l}`).join('\n');
      else insert = MD_WRAPPERS[kind][0] + (selected || 'texte') + MD_WRAPPERS[kind][1];
      area.value = area.value.slice(0, start) + insert + area.value.slice(end);
      const pos = start + insert.length;
      area.setSelectionRange(pos, pos);
      area.focus();
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  // Timestamp Discord (roadmap n°129) : insere <t:unix:format> au curseur.
  // Discord le rend dans le fuseau de CHAQUE lecteur, d'ou l'interet vs date en dur.
  container.querySelector('#embed-ts-btn').addEventListener('click', (e) => {
    const row = container.querySelector('#embed-ts-row');
    const open = row.style.display === 'none';
    row.style.display = open ? 'flex' : 'none';
    e.currentTarget.setAttribute('aria-expanded', String(open));
    if (open && !container.querySelector('#embed-ts-date').value) {
      const now = new Date(Date.now() + 3600000);
      now.setMinutes(0, 0, 0);
      const pad = (n) => String(n).padStart(2, '0');
      container.querySelector('#embed-ts-date').value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }
  });
  container.querySelector('#embed-ts-insert').addEventListener('click', () => {
    const dateVal = container.querySelector('#embed-ts-date').value;
    if (!dateVal) { showToast('Choisis une date et une heure.', 'error'); return; }
    const unix = Math.floor(new Date(dateVal).getTime() / 1000);
    const token = `<t:${unix}:${container.querySelector('#embed-ts-format').value}>`;
    const area = container.__lastMdArea || container.querySelector('#embed-description');
    const start = area.selectionStart ?? area.value.length;
    area.value = area.value.slice(0, start) + token + area.value.slice(area.selectionEnd ?? start);
    const pos = start + token.length;
    area.setSelectionRange(pos, pos);
    area.focus();
    area.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // Apercu mobile (n°009) : simule la largeur d'un telephone.
  container.querySelector('#embed-preview-width-btn').addEventListener('click', (e) => {
    const wrap = container.querySelector('.embed-builder-preview-wrap');
    const mobile = wrap.classList.toggle('mobile-preview');
    e.currentTarget.setAttribute('aria-pressed', String(mobile));
    e.currentTarget.textContent = mobile ? '🖥️ Apercu bureau' : '📱 Apercu mobile';
  });

  // Simulation du theme clair Discord (roadmap n°238).
  container.querySelector('#embed-preview-theme-btn').addEventListener('click', (e) => {
    const slot = container.querySelector('#embed-preview-slot');
    const light = slot.classList.toggle('light-theme');
    e.currentTarget.setAttribute('aria-pressed', String(light));
    e.currentTarget.textContent = light ? '🌙 Theme sombre' : '☀️ Theme clair';
  });

  // Validation en direct des URL d'images (n°010), avec dimensions + poids
  // (roadmap n°237). Le poids depend d'un HEAD Content-Length qui echoue
  // silencieusement si le CDN ne pose pas de header CORS (pas de bug, juste
  // une info indisponible pour ce cas) : on affiche alors les dimensions
  // seules plutot que de pretendre avoir le poids.
  const imgUrlIds = ['embed-author-icon', 'embed-thumbnail', 'embed-image', 'embed-footer-icon'];
  const formatBytes = (n) => (n < 1024 ? `${n} o` : n < 1024 * 1024 ? `${Math.round(n / 1024)} Ko` : `${(n / (1024 * 1024)).toFixed(1)} Mo`);
  imgUrlIds.forEach((fieldId) => {
    const input = container.querySelector(`#${fieldId}`);
    const info = document.createElement('span');
    info.className = 'embed-img-info';
    input.insertAdjacentElement('afterend', info);
    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      input.classList.remove('url-ok', 'url-bad');
      info.textContent = '';
      const v = input.value.trim();
      if (!v) return;
      if (v.startsWith('attachment://')) return; // fichier local joint : pas d'URL a tester
      timer = setTimeout(async () => {
        if (!/^https?:\/\/\S+$/i.test(v)) { input.classList.add('url-bad'); return; }
        const probe = new Image();
        probe.onload = async () => {
          if (input.value.trim() !== v) return;
          input.classList.add('url-ok');
          let sizeLabel = '';
          try {
            const res = await fetch(v, { method: 'HEAD' });
            const len = res.headers.get('content-length');
            if (len) sizeLabel = ` — ${formatBytes(Number(len))}`;
          } catch { /* CORS ou reseau : poids simplement indisponible */ }
          if (input.value.trim() === v) info.textContent = `📐 ${probe.naturalWidth}×${probe.naturalHeight}px${sizeLabel}`;
        };
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

  // Signature d'equipe (roadmap n°242) : sauvegarde le pied de page courant
  // en localStorage par serveur, reapplicable en un clic sur d'autres embeds.
  const teamSigKey = `dsc-team-signature-${id}`;
  container.querySelector('#embed-save-signature').addEventListener('click', () => {
    const text = container.querySelector('#embed-footer-text').value.trim();
    const iconUrl = container.querySelector('#embed-footer-icon').value.trim();
    if (!text && !iconUrl) { showToast('Renseigne un texte ou une icone de pied de page a sauvegarder.', 'error'); return; }
    localStorage.setItem(teamSigKey, JSON.stringify({ text, iconUrl }));
    showToast('Signature d\'equipe enregistree.');
  });
  container.querySelector('#embed-team-signature').addEventListener('change', (e) => {
    if (!e.target.checked) return;
    const saved = JSON.parse(localStorage.getItem(teamSigKey) || 'null');
    if (!saved) { showToast('Aucune signature d\'equipe enregistree pour ce serveur.', 'error'); e.target.checked = false; return; }
    container.querySelector('#embed-footer-text').value = saved.text || '';
    container.querySelector('#embed-footer-icon').value = saved.iconUrl || '';
  });

  container.querySelector('#embed-add-field').addEventListener('click', () => {
    if (container.querySelectorAll('.embed-field-row').length >= 25) {
      showToast('Maximum 25 champs (limite Discord).', 'error');
      return;
    }
    container.querySelector('#embed-fields-list').insertAdjacentHTML('beforeend', embedFieldRowHtml());
    wireEmbedFieldRows(container);
    updateEmbedPreview(container);
    // Focus direct sur le nouveau champ (roadmap n°173) : un clavieriste qui
    // vient d'activer "+ Ajouter un champ" n'a pas a re-tabuler depuis le haut.
    container.querySelector('#embed-fields-list .embed-field-row:last-child .embed-field-name')?.focus();
  });

  // Boutons sous le message (roadmap n°003) : lien ou role auto-attribue.
  const embedRoleOptions = embedRoles
    .filter((r) => r.name !== '@everyone')
    .sort((a, b) => b.position - a.position)
    .map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
  const embedButtonRowHtml = () => `
    <div class="embed-btn-row">
      <select class="embed-btn-kind" aria-label="Type de bouton">
        <option value="link">🔗 Lien</option>
        <option value="role">🏷️ Role</option>
      </select>
      <input type="text" class="embed-btn-label" placeholder="Texte du bouton" maxlength="80" aria-label="Texte du bouton" />
      <input type="text" class="embed-btn-emoji" placeholder="😀" maxlength="4" aria-label="Emoji du bouton (optionnel)" />
      <input type="text" class="embed-btn-url" placeholder="https://..." aria-label="URL du lien" />
      <select class="embed-btn-role" aria-label="Role a attribuer" style="display:none;">${embedRoleOptions}</select>
      <button type="button" class="btn danger embed-btn-remove" title="Supprimer ce bouton" aria-label="Supprimer ce bouton">✕</button>
    </div>`;
  const wireButtonRows = () => {
    container.querySelectorAll('.embed-btn-row').forEach((row) => {
      const kind = row.querySelector('.embed-btn-kind');
      kind.onchange = () => {
        const isLink = kind.value === 'link';
        row.querySelector('.embed-btn-url').style.display = isLink ? '' : 'none';
        row.querySelector('.embed-btn-role').style.display = isLink ? 'none' : '';
        updateEmbedPreview(container);
      };
      row.querySelector('.embed-btn-remove').onclick = () => { row.remove(); updateEmbedPreview(container); };
    });
  };
  container.querySelector('#embed-add-button').addEventListener('click', () => {
    if (container.querySelectorAll('.embed-btn-row').length >= 5) { showToast('5 boutons maximum (limite Discord par rangee).', 'error'); return; }
    container.querySelector('#embed-buttons-list').insertAdjacentHTML('beforeend', embedButtonRowHtml());
    wireButtonRows();
    updateEmbedPreview(container);
    // Meme logique que pour les champs (n°173) : focus direct sur le nouveau bouton.
    container.querySelector('#embed-buttons-list .embed-btn-row:last-child .embed-btn-label')?.focus();
  });
  container.querySelector('#embed-buttons-list').addEventListener('input', () => updateEmbedPreview(container));
  container.querySelector('#embed-buttons-list').addEventListener('change', () => updateEmbedPreview(container));

  // Onglets Formulaire/Apercu sur mobile (roadmap n°046) : sous 700px les
  // deux colonnes s'empilent, la bascule evite de scroller sans fin.
  const embedLayout = container.querySelector('.embed-builder-layout');
  const mobileFormBtn = container.querySelector('#embed-mobile-form-btn');
  const mobilePreviewBtn = container.querySelector('#embed-mobile-preview-btn');
  const setMobileTab = (preview) => {
    embedLayout.classList.toggle('show-preview', preview);
    mobileFormBtn.setAttribute('aria-pressed', String(!preview));
    mobilePreviewBtn.setAttribute('aria-pressed', String(preview));
  };
  mobileFormBtn.addEventListener('click', () => setMobileTab(false));
  mobilePreviewBtn.addEventListener('click', () => setMobileTab(true));

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

  container.querySelector('#embed-test-dm-btn').addEventListener('click', async (e) => {
    const state = container.__mb;
    state.embeds[state.active] = buildEmbedFromForm(container).embed;
    const embeds = state.embeds.map(substituteEmbedVars);
    const content = resolveEmbedVars(container.querySelector('#embed-content').value.trim());
    if (!embeds.some((em) => em.title || em.description || (em.fields || []).length)) {
      showToast('Ajoute au moins un titre, une description ou un champ.', 'error');
      return;
    }
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await Api.postEmbedDm(id, embeds, content);
      showToast('Apercu envoye en MP.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
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
        const buttons = buildButtonsFromForm(container);
        const localFiles = [...window.__embedLocalFiles.values()];
        // Envoi multi-salons (roadmap n°234) : le salon principal plus les
        // salons additionnels coches, un post independant dans chacun.
        const extraChannelIds = [...container.querySelectorAll('.embed-extra-channel:checked')].map((el) => el.value);
        const targetChannelIds = [...new Set([channelId, ...extraChannelIds])];
        const results = await Promise.allSettled(targetChannelIds.map((cid) => (
          localFiles.length
            ? Api.postEmbedWithFiles(id, cid, embeds, content, buttons.length ? buttons : undefined, localFiles)
            : Api.postEmbed(id, cid, embeds, content, buttons.length ? buttons : undefined)
        )));
        const failed = results.filter((r) => r.status === 'rejected').length;
        showToast(failed
          ? `Poste dans ${targetChannelIds.length - failed}/${targetChannelIds.length} salon(s), ${failed} en erreur.`
          : `Embed${embeds.length > 1 ? 's' : ''} poste dans ${targetChannelIds.length} salon(s).`, failed ? 'error' : 'success');
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
    if (window.__embedLocalFiles.size) {
      showToast('Les images jointes (fichiers locaux) ne sont pas supportees pour les envois programmes : utilise un lien https.', 'error');
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

  // Delegue (roadmap n°243) : la liste est re-rendue a chaque frappe dans la
  // recherche, re-cabler individuellement chaque bouton a chaque fois.
  function wireTemplateButtons() {
    container.querySelectorAll('.embed-load-template').forEach((btn) => {
      btn.onclick = () => {
        const template = templates.find((t) => t.id === btn.dataset.id);
        if (template) {
          populateEmbedForm(container, template.embed, '');
          showToast('Modele charge.');
        }
      };
    });
    container.querySelectorAll('.embed-delete-template').forEach((btn) => {
      btn.onclick = () => {
        undoableDelete(btn, 'Modele supprime.', () => Api.deleteEmbedTemplate(id, btn.dataset.id));
      };
    });
    // Partage entre serveurs (roadmap n°244) : code court a 6 caracteres,
    // valable 30 jours, independant du serveur d'origine.
    container.querySelectorAll('.embed-share-template').forEach((btn) => {
      btn.onclick = async () => {
        const template = templates.find((t) => t.id === btn.dataset.id);
        if (!template) return;
        try {
          const { code } = await Api.shareEmbedTemplate(template.name, template.embed);
          await navigator.clipboard?.writeText(code).catch(() => {});
          window.prompt('Code de partage (copie, valable 30 jours) — a coller sur l\'autre serveur via "Importer via un code" :', code);
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    });
  }
  wireTemplateButtons();

  // Corbeille d'embeds (roadmap n°222) : chargee a part, restauration remet
  // le modele dans la liste principale et retire l'entree de la corbeille.
  function loadEmbedTrash() {
    Api.embedTrash(id).then((trash) => {
      const listEl = container.querySelector('#embed-trash-list');
      if (!listEl) return;
      listEl.innerHTML = trash.length ? trash.map((t) => `
        <div class="embed-template-row" data-trash-id="${t.id}">
          <span class="embed-template-name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</span>
          <span class="muted" style="font-size:0.72rem;">${new Date(t.deletedAt).toLocaleDateString('fr-FR')}</span>
          <button class="btn secondary embed-restore-trash" data-trash-id="${t.id}">♻️ Restaurer</button>
        </div>`).join('') : '<p class="muted" style="font-size:0.8rem;">Corbeille vide.</p>';
      listEl.querySelectorAll('.embed-restore-trash').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            const restored = await Api.restoreEmbedTrash(id, btn.dataset.trashId);
            templates.push(restored);
            container.querySelector('#embed-templates-list').innerHTML = templateRows();
            wireTemplateButtons();
            showToast('Modele restaure.');
            loadEmbedTrash();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    }).catch(() => {});
  }
  loadEmbedTrash();

  container.querySelector('#embed-template-search')?.addEventListener('input', (e) => {
    container.querySelector('#embed-templates-list').innerHTML = templateRows(e.target.value);
    wireTemplateButtons();
  });
  container.querySelector('#embed-import-shared').addEventListener('click', async () => {
    const code = window.prompt('Colle le code de partage (6 caracteres) :');
    if (!code) return;
    try {
      const data = await Api.importSharedEmbedTemplate(code.trim());
      const entry = await Api.saveEmbedTemplate(id, data.name, data.embed);
      templates.push(entry);
      container.querySelector('#embed-templates-list').innerHTML = templateRows(container.querySelector('#embed-template-search')?.value || '');
      wireTemplateButtons();
      showToast(`Modele « ${data.name} » importe.`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Historique des envois (roadmap n°130) : recharger une copie, ou editer
  // le message d'origine (n°131 — pre-remplit salon + ID, l'envoi PATCHera).
  container.querySelectorAll('.embed-history-load, .embed-history-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const entry = embedHistory.find((h) => h.id === btn.dataset.historyId);
      if (!entry) return;
      container.__mb = { embeds: JSON.parse(JSON.stringify(entry.embeds || [{}])), active: 0 };
      populateEmbedForm(container, container.__mb.embeds[0] || {}, entry.content || '');
      renderEmbedTabs(container);
      const isEdit = btn.classList.contains('embed-history-edit');
      const channelSel = container.querySelector('#embed-target-channel');
      if ([...channelSel.options].some((o) => o.value === entry.channelId)) channelSel.value = entry.channelId;
      container.querySelector('#embed-target-message-id').value = isEdit ? (entry.messageId || '') : '';
      showToast(isEdit
        ? 'Charge : l\'envoi mettra a jour le message d\'origine.'
        : 'Envoi recharge dans le formulaire (nouvelle copie).');
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
  { value: 'mistral', label: 'Mistral (Large)' },
];

async function renderAiConfigPage(guildId, container = app) {
  container.innerHTML = skeletonHtml();
  const [config, guildConfig] = await Promise.all([
    Api.aiConfig(guildId).catch(() => null),
    Api.config(guildId).catch(() => ({})),
  ]);

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
      ${sectionHtml('Limite d\'usage', `
        <p class="dp-block-title">📉 Limite quotidienne (roadmap n°252)</p>
        <p class="muted" style="margin:0 0 12px;">Nombre maximum de messages envoyes a l'assistant IA par jour, tous membres confondus. Utile pour plafonner le cout si la cle est partagee par toute la communaute.</p>
        <label for="ai-daily-limit">Limite par jour (0 = illimite)</label>
        <input type="number" id="ai-daily-limit" min="0" value="${guildConfig?.aiDailyMessageLimit || 0}" />
        <button class="btn secondary" id="ai-save-limit" style="margin-top:8px;">Enregistrer</button>
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

  container.querySelector('#ai-save-limit').addEventListener('click', async () => {
    try {
      const limit = Math.max(0, Number(container.querySelector('#ai-daily-limit').value) || 0);
      await Api.updateConfig(guildId, { aiDailyMessageLimit: limit });
      showToast('Limite enregistree.');
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
    btn.addEventListener('click', () => {
      undoableDelete(btn, 'Template supprime.', () => Api.deleteTemplate(btn.dataset.id));
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
    btn.addEventListener('click', () => {
      undoableDelete(btn, 'Commande supprimee.', () => Api.deleteCustomCommand(guildId, btn.dataset.id));
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

// Tooltips stylises sur les icones de la topbar (roadmap n°211) : les
// boutons ont deja un attribut title (tooltip natif du navigateur, lent et
// non stylable) — on le remplace par une bulle CSS a l'affichage immediat,
// sans dupliquer le texte (data-tooltip prend le relais de title pour ne
// pas avoir les deux bulles superposees).
function wireTopbarTooltips() {
  const topbar = document.getElementById('content-topbar');
  if (!topbar) return;
  const bubble = document.createElement('div');
  bubble.className = 'dp-tooltip';
  bubble.hidden = true;
  document.body.appendChild(bubble);

  let hideTimer = null;
  const show = (el) => {
    clearTimeout(hideTimer);
    bubble.textContent = el.dataset.tooltip;
    bubble.hidden = false;
    const rect = el.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    bubble.style.left = `${Math.min(window.innerWidth - bubbleRect.width - 8, Math.max(8, rect.left + rect.width / 2 - bubbleRect.width / 2))}px`;
    bubble.style.top = `${rect.bottom + 8}px`;
    bubble.classList.add('visible');
  };
  const hide = () => {
    bubble.classList.remove('visible');
    hideTimer = setTimeout(() => { bubble.hidden = true; }, 150);
  };

  topbar.querySelectorAll('[title]').forEach((el) => {
    el.dataset.tooltip = el.getAttribute('title');
    el.removeAttribute('title');
    el.addEventListener('mouseenter', () => show(el));
    el.addEventListener('mouseleave', hide);
    el.addEventListener('focus', () => show(el));
    el.addEventListener('blur', hide);
  });
}

async function init() {
  wireTopbarTooltips();

  // Mode demo (roadmap n°171) : bandeau visible + bouton de sortie qui
  // nettoie le flag et revient a l'ecran de connexion.
  if (window.DEMO_MODE) {
    const banner = document.getElementById('demo-banner');
    if (banner) {
      banner.hidden = false;
      document.getElementById('demo-exit-btn')?.addEventListener('click', () => window.exitDemoMode());
    }
  }

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
    if (window.DEMO_MODE) { window.exitDemoMode(); return; }
    await Api.logout();
    location.href = 'index.html';
  });

  // 4 themes predefinis (roadmap n°180) : le bouton cycle sombre chaud →
  // sombre froid → AMOLED noir → clair.
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  if (themeToggleBtn) {
    const systemPrefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
    const THEME_CYCLE = ['dark', 'cold', 'amoled', 'light'];
    const THEME_META = {
      dark: ['🌙', 'Sombre chaud'], cold: ['❄️', 'Sombre froid'], amoled: ['⬛', 'AMOLED noir'], light: ['☀️', 'Clair'],
    };
    const savedTheme = () => localStorage.getItem('theme') || (systemPrefersLight ? 'light' : 'dark');
    const currentTheme = () => document.documentElement.getAttribute('data-theme') || savedTheme();
    const paintTheme = () => {
      const [icon, label] = THEME_META[currentTheme()] || THEME_META.dark;
      themeToggleBtn.textContent = icon;
      themeToggleBtn.title = `Theme : ${label} (cliquer pour changer)`;
    };
    paintTheme();

    // Apercu en direct au survol (roadmap n°361) : le menu deroulant liste
    // les 4 themes, un survol applique temporairement le theme (preview),
    // seul un clic le confirme et le sauvegarde ; en quittant sans cliquer
    // le theme reellement sauvegarde est restaure.
    themeToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const existing = document.getElementById('dp-theme-menu');
      if (existing) { existing.remove(); return; }
      const menu = document.createElement('div');
      menu.id = 'dp-theme-menu';
      menu.className = 'dp-theme-menu';
      menu.innerHTML = THEME_CYCLE.map((t) => `
        <button type="button" class="dp-theme-menu-item${t === savedTheme() ? ' active' : ''}" data-theme-choice="${t}">
          <span>${THEME_META[t][0]}</span> ${THEME_META[t][1]}
        </button>`).join('');
      document.body.appendChild(menu);
      const rect = themeToggleBtn.getBoundingClientRect();
      menu.style.top = `${rect.bottom + 6}px`;
      menu.style.right = `${window.innerWidth - rect.right}px`;
      menu.querySelectorAll('[data-theme-choice]').forEach((item) => {
        item.addEventListener('mouseenter', () => {
          document.documentElement.setAttribute('data-theme', item.dataset.themeChoice);
        });
        item.addEventListener('click', () => {
          const next = item.dataset.themeChoice;
          document.documentElement.setAttribute('data-theme', next);
          localStorage.setItem('theme', next);
          paintTheme();
          showToast(`Theme : ${THEME_META[next][1]}`);
          window.UISound?.click();
          menu.remove();
        });
      });
      menu.addEventListener('mouseleave', () => {
        document.documentElement.setAttribute('data-theme', savedTheme());
      });
    });
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('dp-theme-menu');
      if (menu && !menu.contains(e.target) && e.target !== themeToggleBtn) {
        document.documentElement.setAttribute('data-theme', savedTheme());
        menu.remove();
      }
    });
  }

  // Couleur d'accent personnalisable (roadmap n°181) : double-clic sur le
  // bouton theme ouvre un color picker, la couleur remplace --accent.
  const accentPicker = document.createElement('input');
  accentPicker.type = 'color';
  accentPicker.style.display = 'none';
  document.body.appendChild(accentPicker);
  const applyCustomAccent = (hex) => {
    if (!hex) return;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const root = document.documentElement.style;
    root.setProperty('--accent', hex);
    root.setProperty('--accent-hover', hex);
    root.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, 0.16)`);
    root.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.38)`);
  };
  if (localStorage.getItem('dsc-accent')) applyCustomAccent(localStorage.getItem('dsc-accent'));
  themeToggleBtn?.addEventListener('dblclick', () => {
    accentPicker.value = localStorage.getItem('dsc-accent') || '#ad5940';
    accentPicker.click();
  });
  accentPicker.addEventListener('change', () => {
    if (accentPicker.value === '#ad5940') {
      // Couleur par defaut re-choisie = retour aux accents du theme.
      localStorage.removeItem('dsc-accent');
      ['--accent', '--accent-hover', '--accent-soft', '--accent-glow'].forEach((v) => document.documentElement.style.removeProperty(v));
      showToast('Accent par defaut retabli.');
      return;
    }
    localStorage.setItem('dsc-accent', accentPicker.value);
    applyCustomAccent(accentPicker.value);
    showToast('Couleur d\'accent personnalisee. Re-choisir la couleur par defaut pour revenir au theme.');
  });

  // Echap uniforme (roadmap n°116) : ferme d'abord tout tiroir/menu ouvert,
  // sinon agit comme retour (panneau salon/categorie/role ou module de
  // reglages). Un seul listener global plutot qu'un par re-rendu.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const openDrawer = document.querySelector('.dp-sidebar.touch-open, .dp-roles-panel.touch-open');
    if (openDrawer) { openDrawer.classList.remove('touch-open'); return; }
    const serverMenu = document.getElementById('dp-server-menu');
    if (serverMenu && !serverMenu.hidden) {
      serverMenu.hidden = true;
      document.getElementById('dp-server-switch')?.setAttribute('aria-expanded', 'false');
      return;
    }
    const backBtn = document.getElementById('dp-settings-back') || document.getElementById('dp-actionchat-back');
    backBtn?.click();
  });

  // Indicateur de modifications non enregistrees (roadmap n°120) : toute
  // saisie dans un panneau de section pose un point orange, efface au
  // re-rendu (chaque enregistrement re-rend sa page). Les champs de
  // recherche/filtre sont exclus (ils ne modifient rien).
  document.addEventListener('input', (e) => {
    if (!e.target.matches || e.target.matches('[type="search"], [id*="search"], [id*="filter"]')) return;
    const panel = e.target.closest('.section-panel');
    if (panel && panel.querySelector('.btn')) panel.classList.add('dirty');
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

  // Barre de navigation inferieure mobile (roadmap n°123) : 5 onglets fixes
  // en bas d'ecran, visibles uniquement en contexte tactile/etroit et quand
  // un serveur est ouvert.
  // Demande explicite du user : les fonctions mobiles ne s'activent QUE sur
  // telephone. Les media queries (hover/pointer) matchent sur certains PC
  // tactiles, donc on se base sur l'appareil lui-meme (User-Agent).
  const isPhone = navigator.userAgentData?.mobile
    ?? /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  const tabbar = document.getElementById('mobile-tabbar');
  if (tabbar) {
    const updateTabbar = () => {
      tabbar.hidden = !(isPhone || window.innerWidth <= 700) || !guildId;
      document.body.classList.toggle('has-tabbar', !tabbar.hidden);
    };
    updateTabbar();
    window.addEventListener('resize', updateTabbar);
    tabbar.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!guildId) return;
        tabbar.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
        window.UISound?.select();
        const tab = btn.dataset.tab;
        if (tab === 'home') withViewTransition(() => renderPreviewPage(guildId));
        else withViewTransition(() => renderSettingsPanel(guildId, tab, btn.dataset.tabSection || undefined));
      });
    });
    // renderPreviewPage / navigation ailleurs : re-evaluer a chaque rendu.
    window.__updateMobileTabbar = updateTabbar;
  }

  // Bandeau hors-ligne (roadmap n°207) : previent que les donnees affichees
  // viennent du cache tant que la connexion n'est pas revenue.
  const offlineBanner = document.createElement('div');
  offlineBanner.id = 'dsc-offline-banner';
  offlineBanner.textContent = '📡 Hors ligne — donnees en cache, les modifications sont impossibles.';
  offlineBanner.style.cssText = 'display:none; position:fixed; top:0; left:0; right:0; z-index:300; background:var(--warning); color:#1a1013; font-size:0.8rem; font-weight:600; text-align:center; padding:6px;';
  document.body.appendChild(offlineBanner);
  const paintOnline = () => { offlineBanner.style.display = navigator.onLine ? 'none' : 'block'; };
  window.addEventListener('online', () => { paintOnline(); showToast('Connexion retablie.'); });
  window.addEventListener('offline', paintOnline);
  paintOnline();

  // Bannière bot Render injoignable (roadmap n°192) : verifie /health (route
  // publique, pas d'auth) au chargement — le bot peut etre endormi/plante
  // meme si le worker (donc le dashboard) repond normalement.
  if (guildId) {
    fetch(`${window.API_BASE_URL}/health`).then((r) => r.json()).then((health) => {
      if (health.bot && health.bot.online === false) {
        const banner = document.createElement('div');
        banner.id = 'dsc-bot-offline-banner';
        banner.textContent = '🤖 Le bot semble hors ligne (dernier signal il y a plus de 25 min). Les actions instantanees marchent encore, mais les fonctions du bot peuvent etre en retard.';
        banner.style.cssText = 'position:fixed; top:0; left:0; right:0; z-index:299; background:var(--danger); color:#fff; font-size:0.8rem; font-weight:600; text-align:center; padding:6px;';
        document.body.appendChild(banner);
      }
    }).catch(() => { /* /health injoignable : pas d'alerte supplementaire, le bandeau hors-ligne suffit */ });
  }

  // Pull-to-refresh (roadmap n°125), telephone uniquement : tirer vers le
  // bas tout en haut de la page pour recharger les donnees fraiches.
  if (isPhone) {
    let pullStart = null;
    const appEl = document.getElementById('app');
    document.addEventListener('touchstart', (e) => {
      pullStart = (appEl?.scrollTop || 0) <= 2 && window.scrollY <= 2 && e.touches.length === 1
        ? e.touches[0].clientY
        : null;
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (pullStart === null) return;
      const delta = e.touches[0].clientY - pullStart;
      if (delta > 90 && !document.getElementById('dsc-ptr')) {
        document.body.insertAdjacentHTML('afterbegin', '<div id="dsc-ptr" style="position:fixed; top:10px; left:50%; transform:translateX(-50%); z-index:200; background:var(--bg-elevated); border:1px solid var(--border-strong); border-radius:999px; padding:6px 14px; font-size:0.8rem;">↻ Relache pour actualiser</div>');
      }
    }, { passive: true });
    document.addEventListener('touchend', (e) => {
      const indicator = document.getElementById('dsc-ptr');
      if (pullStart !== null && indicator && (e.changedTouches[0].clientY - pullStart) > 90) {
        location.reload();
      }
      indicator?.remove();
      pullStart = null;
    }, { passive: true });
  }

  // Nouveautes (roadmap n°341) : popover topbar avec le changelog produit,
  // badge tant que la derniere entree n'a pas ete vue.
  const whatsNewBtn = document.getElementById('whatsnew-toggle-btn');
  if (whatsNewBtn) {
    const lastSeen = localStorage.getItem('dsc-whatsnew-seen');
    if (lastSeen !== CHANGELOG[0]?.id) whatsNewBtn.classList.add('has-badge');
    whatsNewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const existingPop = document.getElementById('dp-whatsnew-pop');
      if (existingPop) { existingPop.remove(); return; }
      localStorage.setItem('dsc-whatsnew-seen', CHANGELOG[0]?.id || '');
      whatsNewBtn.classList.remove('has-badge');
      const pop = document.createElement('div');
      pop.id = 'dp-whatsnew-pop';
      pop.innerHTML = `
        <p class="dp-block-title" style="margin:0 0 8px;">🆕 Nouveautes</p>
        ${CHANGELOG.map((entry) => `
          <div class="dp-history-row">
            <strong>${escapeHtml(entry.title)}</strong>
            <span class="muted" style="font-size:0.7rem;">${escapeHtml(entry.date)}</span>
            <ul style="margin:4px 0 0; padding-left:18px; font-size:0.82rem; color:var(--text-muted);">
              ${entry.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}
            </ul>
          </div>`).join('')}`;
      document.body.appendChild(pop);
    });
    document.addEventListener('click', (e) => {
      const pop = document.getElementById('dp-whatsnew-pop');
      if (pop && !pop.contains(e.target) && e.target !== whatsNewBtn) pop.remove();
    });
  }

  // Historique des dernieres actions (roadmap n°113) : popover topbar avec
  // les 10 dernieres entrees de l'audit log ; les suppressions pointent vers
  // la corbeille (l'« annuler » de ces actions).
  const historyBtn = document.getElementById('history-toggle-btn');
  if (historyBtn && guildId) {
    historyBtn.style.display = '';
    historyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const existingPop = document.getElementById('dp-history-pop');
      if (existingPop) { existingPop.remove(); return; }
      const pop = document.createElement('div');
      pop.id = 'dp-history-pop';
      pop.innerHTML = '<p class="muted" style="margin:0;">Chargement...</p>';
      document.body.appendChild(pop);
      try {
        // L'audit log est stocke plus recent en premier (unshift cote worker).
        const entries = (await Api.auditLog(guildId)).slice(0, 10);
        pop.innerHTML = `
          <p class="dp-block-title" style="margin:0 0 8px;">🕘 Dernieres actions</p>
          ${entries.map((entry) => `
            <div class="dp-history-row">
              <strong>${escapeHtml(entry.title || '')}</strong>
              <span class="muted">${escapeHtml((entry.description || '').slice(0, 90))}</span>
              <span class="muted" style="font-size:0.7rem;">${new Date(entry.timestamp || Date.now()).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}${/supprim/i.test(entry.title || '') ? ' · <a href="#" class="dp-history-trash">corbeille ♻️</a>' : ''}</span>
            </div>`).join('') || '<p class="muted">Aucune action recente.</p>'}
          <button type="button" class="btn secondary" id="dp-history-all" style="width:100%; margin-top:8px;">Tout l'historique</button>`;
        pop.querySelector('#dp-history-all').addEventListener('click', () => {
          pop.remove();
          withViewTransition(() => renderSettingsPanel(guildId, 'auditlog'));
        });
        pop.querySelectorAll('.dp-history-trash').forEach((link) => {
          link.addEventListener('click', (ev) => {
            ev.preventDefault();
            pop.remove();
            withViewTransition(() => renderSettingsPanel(guildId, 'securite', 'sec-trash'));
          });
        });
      } catch (err) {
        pop.innerHTML = `<p class="muted" style="margin:0;">${escapeHtml(err.message)}</p>`;
      }
    });
    document.addEventListener('click', (e) => {
      const pop = document.getElementById('dp-history-pop');
      if (pop && !pop.contains(e.target) && e.target !== historyBtn) pop.remove();
    });
  }

  // Reglages d'affichage regroupes (roadmap n°111, n°349, n°363) : densite,
  // taille de texte et coins arrondis dans un seul popover plutot que 3
  // boutons separes dans la topbar (deja chargee).
  const displaySettingsBtn = document.getElementById('display-settings-btn');
  if (displaySettingsBtn) {
    const applyDensity = () => {
      document.body.classList.toggle('density-compact', localStorage.getItem('dsc-density') === 'compact');
    };
    const FONT_SIZE_LABELS = { s: 'Petite', m: 'Normale', l: 'Grande' };
    const applyFontSize = () => {
      const size = localStorage.getItem('dsc-font-size') || 'm';
      document.body.classList.toggle('font-size-s', size === 's');
      document.body.classList.toggle('font-size-l', size === 'l');
    };
    const CORNERS_LABELS = { sharp: 'Net', soft: 'Doux', round: 'Tres arrondi' };
    const applyCorners = () => {
      const mode = localStorage.getItem('dsc-corners') || 'soft';
      document.body.classList.toggle('corners-sharp', mode === 'sharp');
      document.body.classList.toggle('corners-round', mode === 'round');
    };
    applyDensity();
    applyFontSize();
    applyCorners();

    const DISPLAY_SETTINGS = [
      {
        label: 'Densite', storageKey: 'dsc-density', cycle: ['normal', 'compact'], default: 'normal',
        labels: { normal: 'Confortable', compact: 'Compact' }, apply: applyDensity,
      },
      {
        label: 'Taille du texte', storageKey: 'dsc-font-size', cycle: ['s', 'm', 'l'], default: 'm', labels: FONT_SIZE_LABELS, apply: applyFontSize,
      },
      {
        label: 'Coins', storageKey: 'dsc-corners', cycle: ['sharp', 'soft', 'round'], default: 'soft', labels: CORNERS_LABELS, apply: applyCorners,
      },
    ];

    displaySettingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const existing = document.getElementById('dp-display-settings-menu');
      if (existing) { existing.remove(); return; }
      const menu = document.createElement('div');
      menu.id = 'dp-display-settings-menu';
      menu.className = 'dp-theme-menu';
      menu.innerHTML = DISPLAY_SETTINGS.map((setting) => {
        const current = localStorage.getItem(setting.storageKey) || setting.default;
        return `
        <div class="dp-display-setting-row">
          <span>${setting.label}</span>
          <button type="button" class="btn secondary" data-setting="${setting.storageKey}">${setting.labels[current]}</button>
        </div>`;
      }).join('');
      document.body.appendChild(menu);
      const rect = displaySettingsBtn.getBoundingClientRect();
      menu.style.top = `${rect.bottom + 6}px`;
      menu.style.right = `${window.innerWidth - rect.right}px`;
      menu.querySelectorAll('[data-setting]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const setting = DISPLAY_SETTINGS.find((s) => s.storageKey === btn.dataset.setting);
          const current = localStorage.getItem(setting.storageKey) || setting.default;
          const next = setting.cycle[(setting.cycle.indexOf(current) + 1) % setting.cycle.length];
          localStorage.setItem(setting.storageKey, next);
          setting.apply();
          btn.textContent = setting.labels[next];
          window.UISound?.click();
        });
      });
    });
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('dp-display-settings-menu');
      if (menu && !menu.contains(e.target) && e.target !== displaySettingsBtn) menu.remove();
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

  // Raccourcis PWA (roadmap n°179) : app.html?shortcut=embedbuilder|tickets|
  // stats ouvre directement le module sur le dernier serveur consulte.
  const shortcut = params.get('shortcut');
  const shortcutGuild = guildId || localStorage.getItem('dsc-last-guild');
  if (shortcut && shortcutGuild) {
    if (shortcut === 'tickets') await renderSettingsPanel(shortcutGuild, 'automatisations', 'tickets');
    else await renderSettingsPanel(shortcutGuild, shortcut);
    return;
  }

  if (guildId) {
    localStorage.setItem('dsc-last-guild', guildId);
    await renderGuildDetail(guildId);
  } else {
    await renderGuildList();
  }
}

init().catch((err) => {
  app.innerHTML = `<div class="inner"><div class="card"><p class="muted">Erreur : ${escapeHtml(err.message)}</p></div></div>`;
});
