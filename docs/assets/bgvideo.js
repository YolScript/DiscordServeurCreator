// Lance la video de fond en boucle, sauf si l'utilisateur a demande une
// interface moins animee (prefers-reduced-motion) : dans ce cas on reste
// sur l'image poster (deja affichee) sans jamais lancer la lecture.
(function () {
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('.bg-video').forEach((v) => {
    if (reduceMotion) {
      v.pause();
      v.removeAttribute('autoplay');
      return;
    }
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
