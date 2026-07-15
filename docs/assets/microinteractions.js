// Micro-interactions "poste de controle" : lueur qui suit le curseur sur les
// boutons, leger tilt 3D sur les cartes/panels au survol. Delegation sur
// document (pas de dependance a app.js), desactive si l'utilisateur demande
// moins de mouvement.
(function () {
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  var TILT_SELECTOR = '.card, .guild-row';
  var TILT_MAX_DEG = 4;
  var raf = null;
  var pending = null;

  function applyGlow(el, e) {
    var rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', ((e.clientX - rect.left) / rect.width) * 100 + '%');
    el.style.setProperty('--my', ((e.clientY - rect.top) / rect.height) * 100 + '%');
  }

  function applyTilt(el, e) {
    var rect = el.getBoundingClientRect();
    var px = (e.clientX - rect.left) / rect.width - 0.5;
    var py = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = 'perspective(700px) rotateX(' + (-py * TILT_MAX_DEG).toFixed(2) + 'deg) rotateY(' + (px * TILT_MAX_DEG).toFixed(2) + 'deg)';
  }

  function schedule(fn) {
    pending = fn;
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = null;
      if (pending) pending();
    });
  }

  document.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    var btn = e.target.closest && e.target.closest('.btn');
    if (btn) schedule(function () { applyGlow(btn, e); });

    var tiltEl = e.target.closest && e.target.closest(TILT_SELECTOR);
    if (tiltEl) schedule(function () { applyTilt(tiltEl, e); });
  }, { passive: true });

  document.addEventListener('pointerout', function (e) {
    var tiltEl = e.target.closest && e.target.closest(TILT_SELECTOR);
    if (tiltEl && !tiltEl.contains(e.relatedTarget)) {
      tiltEl.style.transform = '';
    }
  }, { passive: true });
}());
