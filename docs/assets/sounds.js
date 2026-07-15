// Petits sons d'interface synthetises via Web Audio (aucun fichier audio a
// charger). Toujours declenches depuis un geste utilisateur (clic), donc
// jamais bloques par les politiques d'autoplay des navigateurs.
window.UISound = (function uiSound() {
  let ctx = null;

  function getCtx() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!ctx) ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function isEnabled() {
    return localStorage.getItem('soundEnabled') !== 'off';
  }

  function setEnabled(on) {
    localStorage.setItem('soundEnabled', on ? 'on' : 'off');
  }

  function tone({
    freq, duration = 0.09, type = 'sine', volume = 0.05, delay = 0, glideTo = null,
  }) {
    if (!isEnabled()) return;
    const audioCtx = getCtx();
    if (!audioCtx) return;
    try {
      const now = audioCtx.currentTime + delay;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch {
      // Web Audio indisponible : on reste silencieux plutot que de planter.
    }
  }

  return {
    click: () => tone({ freq: 720, duration: 0.045, volume: 0.04 }),
    select: () => tone({ freq: 480, duration: 0.06, volume: 0.045 }),
    success: () => {
      tone({ freq: 660, duration: 0.09, volume: 0.05 });
      tone({ freq: 880, duration: 0.12, volume: 0.05, delay: 0.07 });
    },
    error: () => tone({
      freq: 220, duration: 0.16, type: 'sawtooth', volume: 0.035, glideTo: 140,
    }),
    isEnabled,
    setEnabled,
  };
}());
