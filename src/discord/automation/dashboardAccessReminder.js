const client = require('../client');
const guildConfigStore = require('../../kv/guildConfigStore');
const logger = require('../../shared/logger');

// Rappel mensuel des acces dashboard delegues (roadmap n°335) : un MP au
// proprietaire du serveur tous les 30 jours, listant qui a un acces
// edition/lecture delegue, pour qu'il pense a retirer les comptes plus
// necessaires.
const TICK_MS = 6 * 3600_000;
const MONTH_MS = 30 * 24 * 3600_000;

async function tick() {
  for (const guild of client.guilds.cache.values()) {
    // eslint-disable-next-line no-await-in-loop
    const config = await guildConfigStore.find(guild.id).catch(() => null);
    const editors = config?.dashboardAllowedUserIds || [];
    const viewers = config?.dashboardViewerUserIds || [];
    if (!editors.length && !viewers.length) continue;
    const lastReminder = config?.lastDashboardAccessReminderAt || 0;
    if (Date.now() - lastReminder < MONTH_MS) continue;

    // eslint-disable-next-line no-await-in-loop
    const owner = await guild.fetchOwner().catch(() => null);
    if (owner) {
      const lines = [
        editors.length ? `**Edition :** ${editors.map((uid) => `<@${uid}>`).join(', ')}` : null,
        viewers.length ? `**Lecture seule :** ${viewers.map((uid) => `<@${uid}>`).join(', ')}` : null,
      ].filter(Boolean).join('\n');
      // eslint-disable-next-line no-await-in-loop
      await owner.send(`🔑 Rappel mensuel — acces dashboard delegues sur **${guild.name}** :\n${lines}\n\nSi certains ne sont plus necessaires, retire-les depuis Securite > Acces dashboard.`).catch(() => {});
    }
    // eslint-disable-next-line no-await-in-loop
    await guildConfigStore.upsert(guild.id, { lastDashboardAccessReminderAt: Date.now() }).catch((err) => logger.error('dashboardAccessReminder.markSent', err));
  }
}

function start() {
  setInterval(() => { tick().catch((err) => logger.error('dashboardAccessReminder.tick', err)); }, TICK_MS);
  logger.info('Rappel mensuel des acces dashboard demarre');
}

module.exports = { start };
