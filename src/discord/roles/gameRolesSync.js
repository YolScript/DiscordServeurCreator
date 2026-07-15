const client = require('../client');
const gameRoleStore = require('../../kv/gameRoleStore');
const guildConfigStore = require('../../kv/guildConfigStore');
const rolesMessageManager = require('./rolesMessageManager');
const { syncGameChannels } = require('./gameChannels');
const logger = require('../../shared/logger');

const TICK_MS = 20_000;

// Les roles de jeu ajoutes depuis le catalogue du dashboard passent par le
// Worker Cloudflare (process separe du bot) : ils sont crees sur Discord et
// enregistres en KV, mais rien ne previent le bot pour qu'il regenere le
// message a select menus du salon #roles. On compense par un sondage
// periodique leger : si la liste des roles de jeu a change depuis le dernier
// passage, on relance rolesMessageManager.refresh (idempotent).
const lastSeen = new Map();

function fingerprint(roles) {
  return roles.map((r) => r.roleId).sort().join(',');
}

async function tick() {
  for (const guild of client.guilds.cache.values()) {
    try {
      const config = await guildConfigStore.find(guild.id);
      if (!config?.rolesChannelId) continue;

      const roles = await gameRoleStore.list(guild.id);
      const fp = fingerprint(roles);
      if (lastSeen.get(guild.id) === fp) continue;
      lastSeen.set(guild.id, fp);

      await rolesMessageManager.refresh(guild);
      await syncGameChannels(guild);
    } catch (err) {
      logger.error('gameRolesSync.tick', err);
    }
  }
}

function start() {
  tick().catch((err) => logger.error('gameRolesSync.tick initial', err));
  setInterval(() => { tick().catch((err) => logger.error('gameRolesSync.tick', err)); }, TICK_MS);
  logger.info('Synchronisation du salon #roles demarree');
}

module.exports = { start, tick };
