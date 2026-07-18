// Lance la video de fond en boucle. Le check prefers-reduced-motion a ete
// retire : il bloquait la lecture (v.pause() + removeAttribute('autoplay'))
// des que le navigateur le signalait vrai, meme quand ce n'etait pas
// l'intention reelle de l'utilisateur - regression identifiee par bissection
// git (absente avant l'introduction de ce script) et confirmee par
// comparaison avec d'autres sites (playtesteur) qui autoplay sans condition.
(function () {
  document.querySelectorAll('.bg-video').forEach((v) => {
    const tryPlay = () => v.play().catch(() => {});
    tryPlay();
    // 'pause' seul ne suffit pas : un decode qui cale (stall, erreur, ou un
    // 'ended' qui echappe au bouclage 'loop' sur certains GPU/drivers) ne
    // declenche pas forcement 'pause', et laisserait la video figee sans
    // jamais se relancer. On ecoute tous les evenements d'arret connus...
    ['pause', 'ended', 'stalled', 'suspend', 'error'].forEach((evt) => v.addEventListener(evt, tryPlay));
    // Bug Chrome connu (issue 375973479) : une video muette sans piste
    // audio (notre cas) peut etre suspendue par l'economie d'energie quand
    // l'onglet reste en arriere-plan, et la reprise auto promise par Chrome
    // ne se declenche pas toujours a la reprise du focus.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tryPlay(); });
    // ...et on garde un filet de secours : si la video est en pause ou que
    // currentTime n'a pas avance depuis le dernier controle, on relance.
    let lastTime = -1;
    setInterval(() => {
      if (v.paused || v.currentTime === lastTime) tryPlay();
      lastTime = v.currentTime;
    }, 3000);
  });
}());

// Bouton de coupure manuelle de la video (partage entre app.html et
// index.html, qui ont chacun leur propre #video-toggle-btn) : n'importe
// quel opt-out utilisateur reste independant du check prefers-reduced-motion
// retire ci-dessus, cf commentaire en tete de fichier.
(function () {
  const btn = document.getElementById('video-toggle-btn');
  if (!btn) return;
  const applyVideoState = () => {
    const off = localStorage.getItem('bgVideoOff') === '1';
    document.body.classList.toggle('bg-video-off', off);
    btn.classList.toggle('is-off', off);
    btn.title = off ? 'Reactiver la video de fond' : 'Couper la video de fond';
  };
  applyVideoState();
  btn.addEventListener('click', () => {
    localStorage.setItem('bgVideoOff', localStorage.getItem('bgVideoOff') === '1' ? '0' : '1');
    applyVideoState();
    window.UISound?.click();
  });
}());
