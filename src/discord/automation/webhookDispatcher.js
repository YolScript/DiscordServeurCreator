const guildConfigStore = require('../../kv/guildConfigStore');
const logger = require('../../shared/logger');

// Envoie un POST JSON {event, guildId, timestamp, ...data} vers chaque
// webhook configure pour cet evenement (config.outgoingWebhooks: liste de
// {event, url}). Best-effort : une erreur reseau sur un webhook n'affecte
// jamais le reste du bot.
async function fireEvent(guildId, event, data = {}) {
  try {
    const config = await guildConfigStore.find(guildId);
    const webhooks = (config?.outgoingWebhooks || []).filter((w) => w.event === event);
    if (!webhooks.length) return;

    const payload = JSON.stringify({ event, guildId, timestamp: Date.now(), ...data });
    await Promise.all(webhooks.map((w) => fetch(w.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    }).catch((err) => logger.error(`webhookDispatcher ${w.url}`, err))));
  } catch (err) {
    logger.error('webhookDispatcher.fireEvent', err);
  }
}

module.exports = { fireEvent };
