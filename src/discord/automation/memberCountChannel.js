const client = require('../client');
const guildConfigStore = require('../../kv/guildConfigStore');
const logger = require('../../shared/logger');

// Discord limite le renommage d'un salon a ~2 fois toutes les 10 minutes :
// on ne tick donc pas plus souvent que ca.
const TICK_MS = 10 * 60_000;

function buildName(template, guild) {
  return (template || '👥 Membres : {count}').replaceAll('{count}', String(guild.memberCount)).slice(0, 100);
}

async function tick() {
  for (const guild of client.guilds.cache.values()) {
    try {
      const config = await guildConfigStore.find(guild.id);
      if (!config?.memberCountChannelId) continue;

      const channel = await guild.channels.fetch(config.memberCountChannelId).catch(() => null);
      if (!channel) continue;

      const name = buildName(config.memberCountChannelNameTemplate, guild);
      if (channel.name !== name) await channel.setName(name).catch((err) => logger.error('memberCountChannel.setName', err));
    } catch (err) {
      logger.error('memberCountChannel.tick', err);
    }
  }
}

function start() {
  setInterval(() => { tick().catch((err) => logger.error('memberCountChannel.tick', err)); }, TICK_MS);
  logger.info('Synchronisation du salon compteur de membres demarree');
}

module.exports = { start, tick };
