const client = require('../client');
const guildConfigStore = require('../../kv/guildConfigStore');
const logger = require('../../shared/logger');

// Fermeture automatique des threads inactifs (roadmap n°286), au-dela du
// simple "auto-archive" natif de Discord (fixe a la creation du thread,
// jamais reconfigurable retroactivement) : ici l'admin choisit un delai en
// JOURS depuis le dashboard, applique a tous les threads actifs existants.
const TICK_MS = 60 * 60_000;

// Timestamp d'un ID Discord (snowflake) sans appel API : evite un fetch par
// thread pour connaitre son dernier message, couteux sur un serveur actif.
function snowflakeTimestamp(id) {
  return Number((BigInt(id) >> 22n) + 1420070400000n);
}

async function tick() {
  for (const guild of client.guilds.cache.values()) {
    // eslint-disable-next-line no-await-in-loop
    const config = await guildConfigStore.find(guild.id).catch(() => null);
    const days = config?.threadAutoCloseDays;
    if (!days || days <= 0) continue;
    const cutoff = Date.now() - days * 86400000;
    const threads = guild.channels.cache.filter((c) => c.isThread?.() && !c.archived);
    for (const thread of threads.values()) {
      const lastActivity = thread.lastMessageId ? snowflakeTimestamp(thread.lastMessageId) : thread.createdTimestamp;
      if (lastActivity >= cutoff) continue;
      // eslint-disable-next-line no-await-in-loop
      await thread.setArchived(true, `Inactif depuis plus de ${days} jour(s) (fermeture automatique)`).catch((err) => logger.error('threadAutoClose.archive', err));
    }
  }
}

function start() {
  setInterval(() => { tick().catch((err) => logger.error('threadAutoClose.tick', err)); }, TICK_MS);
  logger.info('Fermeture automatique des threads inactifs demarree');
}

module.exports = { start };
