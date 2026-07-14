// Miroir de src/shared/smallCaps.js cote bot (runtime Worker distinct,
// pas de partage de module possible entre Node CommonJS et Worker ESM).
const MAP = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
  j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
  s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
};

const DIACRITICS_START = 0x0300;
const DIACRITICS_END = 0x036f;
const COMBINING_DIACRITICS = new RegExp(
  `[\\u${DIACRITICS_START.toString(16).padStart(4, '0')}-\\u${DIACRITICS_END.toString(16).padStart(4, '0')}]`,
  'g',
);

function stripDiacritics(str) {
  return str.normalize('NFD').replace(COMBINING_DIACRITICS, '');
}

export function toSmallCaps(str) {
  return stripDiacritics(str.toLowerCase()).split('').map((c) => MAP[c] ?? c).join('');
}
