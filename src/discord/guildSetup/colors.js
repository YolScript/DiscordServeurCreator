// Rôles de jeu : interpolation HSL cyan -> violet selon la position d'apparition.
// ASSUMED_MAX plafonne la progression pour ne pas dépendre du nombre total de jeux
// (inconnu à l'avance puisqu'ils sont détectés dynamiquement) : au-delà, la teinte
// reste au violet final plutôt que de continuer à varier.
const COLD_START = { h: 195, s: 60, l: 50 }; // cyan
const COLD_END = { h: 260, s: 55, l: 45 }; // violet
const ASSUMED_MAX = 60;

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (n) => Math.round(f(n) * 255).toString(16).padStart(2, '0');
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
}

function colorForGameIndex(index) {
  const t = Math.min(index / ASSUMED_MAX, 1);
  const h = COLD_START.h + (COLD_END.h - COLD_START.h) * t;
  const s = COLD_START.s + (COLD_END.s - COLD_START.s) * t;
  const l = COLD_START.l + (COLD_END.l - COLD_START.l) * t;
  return hslToHex(h, s, l);
}

module.exports = { colorForGameIndex, hslToHex };
