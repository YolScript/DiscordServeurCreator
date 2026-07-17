const client = require('../client');
const guildConfigStore = require('../../kv/guildConfigStore');
const logger = require('../../shared/logger');

// Compte a rebours dans le nom d'un salon (roadmap n°186) : le salon vocal
// cree par le dashboard est renomme chaque heure (« 🗓️ Event J-3 », puis
// « 🎉 Event : c'est aujourd'hui ! » le jour J, nettoye 2 jours apres).
const TICK_MS = 60 * 60 * 1000;

function buildCountdownName(countdown) {
  const days = Math.ceil((countdown.targetAt - Date.now()) / 86400000);
  if (days > 0) return `🗓️ ${countdown.label} J-${days}`.slice(0, 100);
  return `🎉 ${countdown.label} : c'est aujourd'hui !`.slice(0, 100);
}

async function tick() {
  for (const guild of client.guilds.cache.values()) {
    try {
      const config = await guildConfigStore.find(guild.id);
      const countdown = config?.countdown;
      if (!countdown?.channelId || !countdown.targetAt) continue;

      // Deux jours apres la date : le salon et la config sont nettoyes.
      if (Date.now() - countdown.targetAt > 2 * 86400000) {
        const channel = await guild.channels.fetch(countdown.channelId).catch(() => null);
        if (channel) await channel.delete().catch(() => {});
        await guildConfigStore.upsert(guild.id, { countdown: null });
        continue;
      }

      const channel = await guild.channels.fetch(countdown.channelId).catch(() => null);
      if (!channel) continue;
      const name = buildCountdownName(countdown);
      if (channel.name !== name) await channel.setName(name).catch((err) => logger.error('countdownChannel.setName', err));
    } catch (err) {
      logger.error('countdownChannel.tick', err);
    }
  }
}

function start() {
  setInterval(() => { tick().catch((err) => logger.error('countdownChannel.tick', err)); }, TICK_MS);
  logger.info('countdownChannel demarre');
}

module.exports = { start };
