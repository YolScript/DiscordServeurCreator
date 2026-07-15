const client = require('../client');
const guildConfigStore = require('../../kv/guildConfigStore');
const logger = require('../../shared/logger');

const TICK_MS = 20_000;
let index = 0;

function applyPlaceholders(text, guild) {
  return text.replaceAll('{membercount}', String(guild?.memberCount ?? 0));
}

async function tick() {
  const guild = client.guilds.cache.first();
  if (!guild) return;
  const config = await guildConfigStore.find(guild.id);
  const statuses = config?.botStatuses;
  if (!statuses?.length) return;

  const text = applyPlaceholders(statuses[index % statuses.length], guild);
  index += 1;
  client.user?.setActivity(text);
}

function start() {
  tick().catch((err) => logger.error('statusRotator.tick initial', err));
  setInterval(() => { tick().catch((err) => logger.error('statusRotator.tick', err)); }, TICK_MS);
  logger.info('Rotation de statut demarree');
}

module.exports = { start };
