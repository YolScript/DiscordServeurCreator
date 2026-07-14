import { botFetchJson } from './discordApi.js';

// Meme interpolation HSL cyan -> violet que src/discord/guildSetup/colors.js
// (duplique cote Worker, comme smallCaps.js, car les deux runtimes sont separes).
const COLD_START = { h: 195, s: 60, l: 50 };
const COLD_END = { h: 260, s: 55, l: 45 };
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

// Catalogue de jeux pregeneres : evite d'attendre qu'un membre soit vu en
// train d'y jouer (detection auto via presence) pour proposer le role.
export const GAME_ROLE_CATALOG = [
  { key: 'valorant', name: 'Valorant', category: 'FPS' },
  { key: 'counter-strike-2', name: 'Counter-Strike 2', category: 'FPS' },
  { key: 'overwatch-2', name: 'Overwatch 2', category: 'FPS' },
  { key: 'apex-legends', name: 'Apex Legends', category: 'FPS' },
  { key: 'rainbow-six-siege', name: 'Rainbow Six Siege', category: 'FPS' },
  { key: 'call-of-duty', name: 'Call of Duty', category: 'FPS' },
  { key: 'fortnite', name: 'Fortnite', category: 'Battle Royale' },
  { key: 'pubg', name: 'PUBG: Battlegrounds', category: 'Battle Royale' },
  { key: 'league-of-legends', name: 'League of Legends', category: 'MOBA' },
  { key: 'dota-2', name: 'Dota 2', category: 'MOBA' },
  { key: 'rocket-league', name: 'Rocket League', category: 'Sport' },
  { key: 'ea-fc', name: 'EA Sports FC', category: 'Sport' },
  { key: 'minecraft', name: 'Minecraft', category: 'Sandbox' },
  { key: 'roblox', name: 'Roblox', category: 'Sandbox' },
  { key: 'terraria', name: 'Terraria', category: 'Sandbox' },
  { key: 'rust', name: 'Rust', category: 'Survie' },
  { key: 'ark-survival-evolved', name: 'ARK: Survival Evolved', category: 'Survie' },
  { key: 'the-forest', name: 'The Forest', category: 'Survie' },
  { key: 'gta-v', name: 'GTA V', category: 'Monde ouvert' },
  { key: 'elden-ring', name: 'Elden Ring', category: 'RPG' },
  { key: 'baldurs-gate-3', name: "Baldur's Gate 3", category: 'RPG' },
  { key: 'genshin-impact', name: 'Genshin Impact', category: 'RPG' },
  { key: 'diablo-4', name: 'Diablo IV', category: 'RPG' },
  { key: 'world-of-warcraft', name: 'World of Warcraft', category: 'MMO' },
  { key: 'final-fantasy-xiv', name: 'Final Fantasy XIV', category: 'MMO' },
  { key: 'stardew-valley', name: 'Stardew Valley', category: 'Detente' },
  { key: 'among-us', name: 'Among Us', category: 'Party' },
  { key: 'fall-guys', name: 'Fall Guys', category: 'Party' },
  { key: 'phasmophobia', name: 'Phasmophobia', category: 'Coop' },
  { key: 'dead-by-daylight', name: 'Dead by Daylight', category: 'Coop' },
];

export async function createGameRolePreset(env, guildId, config, gameKey, existingRoles) {
  const preset = GAME_ROLE_CATALOG.find((g) => g.key === gameKey);
  if (!preset) throw new Error(`Jeu inconnu au catalogue: ${gameKey}`);
  if (!config?.minus16RoleId) throw new Error("Le serveur n'est pas encore configure (/setup).");

  const normalizedKey = preset.name.trim().toLowerCase();
  if (existingRoles.some((r) => r.gameKey === normalizedKey)) {
    throw new Error('Ce role de jeu existe deja.');
  }

  const colorIndex = existingRoles.length;
  const colorHex = colorForGameIndex(colorIndex);
  const colorInt = parseInt(colorHex.slice(1), 16);

  const role = await botFetchJson(env, `/guilds/${guildId}/roles`, {
    method: 'POST',
    body: JSON.stringify({ name: preset.name.slice(0, 100), color: colorInt, hoist: false, mentionable: false }),
  });

  const guildRoles = await botFetchJson(env, `/guilds/${guildId}/roles`);
  const minus16 = guildRoles.find((r) => r.id === config.minus16RoleId);
  if (minus16) {
    await botFetchJson(env, `/guilds/${guildId}/roles`, {
      method: 'PATCH',
      body: JSON.stringify([{ id: role.id, position: minus16.position + 1 }]),
    });
  }

  return {
    gameKey: normalizedKey, displayName: preset.name, roleId: role.id, colorHex, colorIndex, createdAt: Date.now(),
  };
}
