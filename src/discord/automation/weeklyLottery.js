const client = require('../client');
const guildConfigStore = require('../../kv/guildConfigStore');
const lotteryStore = require('../../kv/lotteryStore');
const economyStore = require('../../kv/economyStore');
const { getCurrencyLabel } = require('../../shared/currency');
const logger = require('../../shared/logger');

// Tirage hebdomadaire de la loterie (roadmap n°496) : chaque serveur tire
// independamment 7 jours apres son dernier tirage (pas un jour fixe commun),
// pour repartir la charge et rester simple (pas de cron externe necessaire).
const TICK_MS = 60 * 60_000;
const WEEK_MS = 7 * 86400000;

async function tick() {
  for (const guild of client.guilds.cache.values()) {
    // eslint-disable-next-line no-await-in-loop
    const config = await guildConfigStore.find(guild.id).catch(() => null);
    if (!config?.lotteryEnabled) continue;
    // eslint-disable-next-line no-await-in-loop
    const state = await lotteryStore.get(guild.id);
    if (Date.now() - (state.lastDrawAt || 0) < WEEK_MS) continue;
    if (!state.tickets.length) continue;

    // eslint-disable-next-line no-await-in-loop
    const { winner, pot } = await lotteryStore.drawAndReset(guild.id);
    if (!winner || !pot) continue;
    // eslint-disable-next-line no-await-in-loop
    await economyStore.addBalance(guild.id, winner, pot, 'gain loterie hebdomadaire').catch((err) => logger.error('weeklyLottery.pay', err));

    // Annonce dans le salon d'arrivee/annonces s'il est configure, sinon
    // versement silencieux (le gagnant le voit via /balance).
    if (config.arrivalDepartureChannelId) {
      // eslint-disable-next-line no-await-in-loop
      const currency = await getCurrencyLabel(guild.id);
      // eslint-disable-next-line no-await-in-loop
      const channel = await guild.channels.fetch(config.arrivalDepartureChannelId).catch(() => null);
      if (channel) {
        // eslint-disable-next-line no-await-in-loop
        await channel.send(`🎟️ **Loterie hebdomadaire** : <@${winner}> remporte **${pot}** ${currency.name} ${currency.emoji} !`).catch(() => {});
      }
    }
  }
}

function start() {
  setInterval(() => { tick().catch((err) => logger.error('weeklyLottery.tick', err)); }, TICK_MS);
  logger.info('Loterie hebdomadaire demarree');
}

module.exports = { start };
