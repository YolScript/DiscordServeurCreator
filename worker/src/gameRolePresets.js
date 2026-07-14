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
// "emoji" sert d'icone visuelle sur les chips du dashboard (pas d'image
// reelle : eviter le hotlink d'artworks externes non verifiables).
export const GAME_ROLE_CATALOG = [
  // --- FPS ---
  { key: 'valorant', name: 'Valorant', category: 'FPS', emoji: '🎯' },
  { key: 'counter-strike-2', name: 'Counter-Strike 2', category: 'FPS', emoji: '🔫' },
  { key: 'overwatch-2', name: 'Overwatch 2', category: 'FPS', emoji: '🦾' },
  { key: 'apex-legends', name: 'Apex Legends', category: 'FPS', emoji: '🪂' },
  { key: 'rainbow-six-siege', name: 'Rainbow Six Siege', category: 'FPS', emoji: '💣' },
  { key: 'call-of-duty', name: 'Call of Duty', category: 'FPS', emoji: '🎖️' },
  { key: 'battlefield', name: 'Battlefield', category: 'FPS', emoji: '🪖' },
  { key: 'destiny-2', name: 'Destiny 2', category: 'FPS', emoji: '🌌' },
  { key: 'escape-from-tarkov', name: 'Escape from Tarkov', category: 'FPS', emoji: '🎒' },
  { key: 'the-finals', name: 'The Finals', category: 'FPS', emoji: '🏆' },
  // --- Battle Royale ---
  { key: 'fortnite', name: 'Fortnite', category: 'Battle Royale', emoji: '🏗️' },
  { key: 'pubg', name: 'PUBG: Battlegrounds', category: 'Battle Royale', emoji: '🪖' },
  { key: 'warzone', name: 'Call of Duty: Warzone', category: 'Battle Royale', emoji: '☢️' },
  // --- MOBA / Strategie ---
  { key: 'league-of-legends', name: 'League of Legends', category: 'MOBA', emoji: '⚔️' },
  { key: 'dota-2', name: 'Dota 2', category: 'MOBA', emoji: '🛡️' },
  { key: 'smite', name: 'Smite', category: 'MOBA', emoji: '⚡' },
  { key: 'age-of-empires', name: 'Age of Empires', category: 'Strategie', emoji: '🏰' },
  { key: 'civilization-vi', name: 'Civilization VI', category: 'Strategie', emoji: '🌍' },
  { key: 'starcraft-2', name: 'StarCraft II', category: 'Strategie', emoji: '👽' },
  { key: 'total-war', name: 'Total War', category: 'Strategie', emoji: '🗡️' },
  { key: 'hearthstone', name: 'Hearthstone', category: 'Carte', emoji: '🃏' },
  { key: 'clash-royale', name: 'Clash Royale', category: 'Carte', emoji: '👑' },
  { key: 'teamfight-tactics', name: 'Teamfight Tactics', category: 'Carte', emoji: '♟️' },
  // --- Sport / Course ---
  { key: 'rocket-league', name: 'Rocket League', category: 'Sport', emoji: '🚗' },
  { key: 'ea-fc', name: 'EA Sports FC', category: 'Sport', emoji: '⚽' },
  { key: 'nba-2k', name: 'NBA 2K', category: 'Sport', emoji: '🏀' },
  { key: 'efootball', name: 'eFootball', category: 'Sport', emoji: '🥅' },
  { key: 'forza-horizon', name: 'Forza Horizon', category: 'Course', emoji: '🏎️' },
  { key: 'gran-turismo', name: 'Gran Turismo', category: 'Course', emoji: '🏁' },
  { key: 'mario-kart', name: 'Mario Kart', category: 'Course', emoji: '🍌' },
  { key: 'trackmania', name: 'Trackmania', category: 'Course', emoji: '🛣️' },
  // --- Sandbox / Construction ---
  { key: 'minecraft', name: 'Minecraft', category: 'Sandbox', emoji: '⛏️' },
  { key: 'roblox', name: 'Roblox', category: 'Sandbox', emoji: '🧱' },
  { key: 'terraria', name: 'Terraria', category: 'Sandbox', emoji: '🌳' },
  { key: 'satisfactory', name: 'Satisfactory', category: 'Sandbox', emoji: '🏭' },
  { key: 'lego-fortnite', name: 'LEGO Fortnite', category: 'Sandbox', emoji: '🧩' },
  // --- Survie ---
  { key: 'rust', name: 'Rust', category: 'Survie', emoji: '🪓' },
  { key: 'ark-survival-evolved', name: 'ARK: Survival Evolved', category: 'Survie', emoji: '🦖' },
  { key: 'the-forest', name: 'The Forest', category: 'Survie', emoji: '🌲' },
  { key: 'sons-of-the-forest', name: 'Sons of the Forest', category: 'Survie', emoji: '🪵' },
  { key: 'valheim', name: 'Valheim', category: 'Survie', emoji: '⚒️' },
  { key: 'dont-starve', name: "Don't Starve Together", category: 'Survie', emoji: '🔥' },
  { key: 'green-hell', name: 'Green Hell', category: 'Survie', emoji: '🌴' },
  // --- Monde ouvert / Action-aventure ---
  { key: 'gta-v', name: 'GTA V', category: 'Monde ouvert', emoji: '🚔' },
  { key: 'red-dead-redemption-2', name: 'Red Dead Redemption 2', category: 'Monde ouvert', emoji: '🤠' },
  { key: 'cyberpunk-2077', name: 'Cyberpunk 2077', category: 'Monde ouvert', emoji: '🌆' },
  { key: 'assassins-creed', name: "Assassin's Creed", category: 'Monde ouvert', emoji: '🗡️' },
  { key: 'the-legend-of-zelda', name: 'The Legend of Zelda', category: 'Monde ouvert', emoji: '🗺️' },
  { key: 'spider-man', name: 'Spider-Man', category: 'Monde ouvert', emoji: '🕷️' },
  // --- RPG ---
  { key: 'elden-ring', name: 'Elden Ring', category: 'RPG', emoji: '💍' },
  { key: 'baldurs-gate-3', name: "Baldur's Gate 3", category: 'RPG', emoji: '🎲' },
  { key: 'genshin-impact', name: 'Genshin Impact', category: 'RPG', emoji: '✨' },
  { key: 'diablo-4', name: 'Diablo IV', category: 'RPG', emoji: '👹' },
  { key: 'the-witcher-3', name: 'The Witcher 3', category: 'RPG', emoji: '🐺' },
  { key: 'path-of-exile', name: 'Path of Exile', category: 'RPG', emoji: '☠️' },
  { key: 'starfield', name: 'Starfield', category: 'RPG', emoji: '🚀' },
  { key: 'dark-souls', name: 'Dark Souls', category: 'RPG', emoji: '⚰️' },
  { key: 'persona-5', name: 'Persona 5', category: 'RPG', emoji: '🎭' },
  // --- MMO ---
  { key: 'world-of-warcraft', name: 'World of Warcraft', category: 'MMO', emoji: '🐉' },
  { key: 'final-fantasy-xiv', name: 'Final Fantasy XIV', category: 'MMO', emoji: '🔮' },
  { key: 'lost-ark', name: 'Lost Ark', category: 'MMO', emoji: '⛵' },
  { key: 'new-world', name: 'New World', category: 'MMO', emoji: '🏝️' },
  { key: 'guild-wars-2', name: 'Guild Wars 2', category: 'MMO', emoji: '🛡️' },
  // --- Horreur ---
  { key: 'phasmophobia', name: 'Phasmophobia', category: 'Horreur', emoji: '👻' },
  { key: 'dead-by-daylight', name: 'Dead by Daylight', category: 'Horreur', emoji: '🔪' },
  { key: 'resident-evil', name: 'Resident Evil', category: 'Horreur', emoji: '🧟' },
  { key: 'silent-hill', name: 'Silent Hill', category: 'Horreur', emoji: '🌫️' },
  { key: 'lethal-company', name: 'Lethal Company', category: 'Horreur', emoji: '🛸' },
  // --- Detente / Simulation ---
  { key: 'stardew-valley', name: 'Stardew Valley', category: 'Detente', emoji: '🌾' },
  { key: 'animal-crossing', name: 'Animal Crossing', category: 'Detente', emoji: '🍃' },
  { key: 'the-sims-4', name: 'The Sims 4', category: 'Detente', emoji: '🏠' },
  { key: 'planet-zoo', name: 'Planet Zoo', category: 'Detente', emoji: '🦁' },
  { key: 'euro-truck-simulator-2', name: 'Euro Truck Simulator 2', category: 'Detente', emoji: '🚚' },
  { key: 'flight-simulator', name: 'Microsoft Flight Simulator', category: 'Detente', emoji: '✈️' },
  // --- Party / Coop ---
  { key: 'among-us', name: 'Among Us', category: 'Party', emoji: '🔴' },
  { key: 'fall-guys', name: 'Fall Guys', category: 'Party', emoji: '🫘' },
  { key: 'overcooked', name: 'Overcooked', category: 'Party', emoji: '🍳' },
  { key: 'it-takes-two', name: 'It Takes Two', category: 'Party', emoji: '🧸' },
  { key: 'jackbox-party-pack', name: 'Jackbox Party Pack', category: 'Party', emoji: '📦' },
  { key: 'gang-beasts', name: 'Gang Beasts', category: 'Party', emoji: '🥊' },
  // --- Combat ---
  { key: 'street-fighter-6', name: 'Street Fighter 6', category: 'Combat', emoji: '🥋' },
  { key: 'tekken-8', name: 'Tekken 8', category: 'Combat', emoji: '👊' },
  { key: 'super-smash-bros', name: 'Super Smash Bros', category: 'Combat', emoji: '⭐' },
  { key: 'mortal-kombat', name: 'Mortal Kombat', category: 'Combat', emoji: '🐲' },
  // --- Mobile ---
  { key: 'brawl-stars', name: 'Brawl Stars', category: 'Mobile', emoji: '📱' },
  { key: 'clash-of-clans', name: 'Clash of Clans', category: 'Mobile', emoji: '🏘️' },
  { key: 'mobile-legends', name: 'Mobile Legends', category: 'Mobile', emoji: '🌟' },
  { key: 'pokemon-go', name: 'Pokemon GO', category: 'Mobile', emoji: '🐾' },
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
