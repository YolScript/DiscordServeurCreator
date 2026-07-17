const client = require('../client');
const guildConfigStore = require('../../kv/guildConfigStore');
const logger = require('../../shared/logger');

// Role automatique apres N jours de presence (roadmap n°283) : recompense
// les membres fideles sans action manuelle du staff.
const TICK_MS = 60 * 60_000;

async function tick() {
  for (const guild of client.guilds.cache.values()) {
    // eslint-disable-next-line no-await-in-loop
    const config = await guildConfigStore.find(guild.id).catch(() => null);
    if (!config?.tenureRoleId || !(config.tenureDays > 0)) continue;
    const thresholdMs = config.tenureDays * 86400000;
    const role = guild.roles.cache.get(config.tenureRoleId);
    if (!role) continue;

    const eligible = guild.members.cache.filter((m) => (
      !m.user.bot && m.joinedTimestamp && Date.now() - m.joinedTimestamp >= thresholdMs && !m.roles.cache.has(role.id)
    ));
    // eslint-disable-next-line no-restricted-syntax
    for (const member of eligible.values()) {
      // eslint-disable-next-line no-await-in-loop
      await member.roles.add(role).catch((err) => logger.error('tenureRole.add', err));
    }
  }
}

function start() {
  setInterval(() => { tick().catch((err) => logger.error('tenureRole.tick', err)); }, TICK_MS);
  logger.info('Role d\'anciennete demarre');
}

module.exports = { start };
