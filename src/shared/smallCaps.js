// Discord force les noms de salons TEXTE en minuscules et convertit tout
// espace en tiret cote serveur (verifie empiriquement via l'API : aucune
// astuce Unicode ne contourne cette regle pour les espaces). Les petites
// capitales Unicode, elles, n'ont pas d'equivalent minuscule standard et
// survivent intactes : on s'en sert pour un rendu "majuscule" stylise.
const MAP = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
  j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
  s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
};

// Plage Unicode des diacritiques combinants (U+0300-U+036F), construite via
// codepoints numeriques pour eviter d'ecrire des caracteres combinants bruts
// dans le fichier source.
const DIACRITICS_START = 0x0300;
const DIACRITICS_END = 0x036f;
const COMBINING_DIACRITICS = new RegExp(
  `[\\u${DIACRITICS_START.toString(16).padStart(4, '0')}-\\u${DIACRITICS_END.toString(16).padStart(4, '0')}]`,
  'g',
);

function stripDiacritics(str) {
  return str.normalize('NFD').replace(COMBINING_DIACRITICS, '');
}

function toSmallCaps(str) {
  return stripDiacritics(str.toLowerCase()).split('').map((c) => MAP[c] ?? c).join('');
}

module.exports = { toSmallCaps };
