const { colorForGameIndex } = require('../guildSetup/colors');
const gameRoleStore = require('../../kv/gameRoleStore');
const guildConfigStore = require('../../kv/guildConfigStore');
const rolesMessageManager = require('./rolesMessageManager');
const logger = require('../../shared/logger');

// Cache memoire des jeux deja vus par guilde, pour eviter de re-consulter le
// KV a chaque presenceUpdate (evenement tres frequent).
const seenGames = new Map();

// File sequentielle par guilde : evite deux creations de role concurrentes
// pour le meme jeu quand plusieurs membres passent en ligne en meme temps.
const guildQueues = new Map();
function enqueue(guildId, task) {
  const previous = guildQueues.get(guildId) || Promise.resolve();
  const next = previous.then(task, task);
  guildQueues.set(guildId, next.catch(() => {}));
  return next;
}

async function ensureRoleForGame(guild, gameName) {
  const gameKey = gameRoleStore.normalizeGameKey(gameName);
  if (!gameKey) return;

  let seen = seenGames.get(guild.id);
  if (!seen) {
    seen = new Set();
    seenGames.set(guild.id, seen);
  }
  if (seen.has(gameKey)) return;

  await enqueue(guild.id, async () => {
    if (seen.has(gameKey)) return;

    const existing = await gameRoleStore.findByKey(guild.id, gameKey);
    if (existing) {
      seen.add(gameKey);
      return;
    }

    const config = await guildConfigStore.find(guild.id);
    if (!config?.minus16RoleId) return; // serveur pas encore configure via /setup

    const currentRoles = await gameRoleStore.list(guild.id);
    const colorIndex = currentRoles.length;
    const colorHex = colorForGameIndex(colorIndex);

    const role = await guild.roles.create({
      name: gameName.slice(0, 100),
      color: colorHex,
      hoist: false,
      mentionable: false,
    });

    const minus16Role = await guild.roles.fetch(config.minus16RoleId).catch(() => null);
    if (minus16Role) await role.setPosition(minus16Role.position + 1).catch(() => {});

    await gameRoleStore.add(guild.id, {
      gameKey, displayName: gameName, roleId: role.id, colorHex, colorIndex,
    });
    seen.add(gameKey);
    logger.info(`Role de jeu cree: "${gameName}" sur ${guild.id}`);

    await rolesMessageManager.refresh(guild).catch((err) => logger.error('rolesMessageManager.refresh', err));
  });
}

module.exports = { ensureRoleForGame };
