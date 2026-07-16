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
    v.play().catch(() => {});
    v.addEventListener('pause', () => v.play().catch(() => {}));
  });
}());
