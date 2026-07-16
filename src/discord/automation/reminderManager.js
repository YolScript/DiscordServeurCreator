const client = require('../client');
const reminderStore = require('../../kv/reminderStore');
const logger = require('../../shared/logger');

const TICK_MS = 30_000;

// Rappels personnels (/remind, roadmap n°096) : MP a l'heure dite puis
// retrait de la liste. Ecritures KV uniquement quand un rappel est du.
async function tick() {
  for (const guild of client.guilds.cache.values()) {
    const reminders = await reminderStore.list(guild.id).catch(() => []);
    if (!reminders.length) continue;

    const now = Date.now();
    const due = reminders.filter((r) => r.runAt <= now);
    if (!due.length) continue;

    for (const reminder of due) {
      // eslint-disable-next-line no-await-in-loop
      const member = await guild.members.fetch(reminder.userId).catch(() => null);
      if (member) {
        // eslint-disable-next-line no-await-in-loop
        await member.send(`⏰ **Rappel** (serveur ${guild.name}) : ${reminder.text}`).catch(() => {});
      }
    }
    await reminderStore.replaceAll(guild.id, reminders.filter((r) => r.runAt > now))
      .catch((err) => logger.error('reminderManager.save', err));
  }
}

function start() {
  setInterval(() => { tick().catch((err) => logger.error('reminderManager.tick', err)); }, TICK_MS);
  logger.info('Rappels personnels demarres');
}

module.exports = { start, tick };
