const client = require('../client');
const guildConfigStore = require('../../kv/guildConfigStore');
const economyStore = require('../../kv/economyStore');
const logger = require('../../shared/logger');

// Salaire de role : revenu quotidien automatique par role (roadmap n°302).
// Un seul versement group toutes les 24h (pas un timer par membre) : plus
// simple et evite tout risque de double-paiement individuel a suivre.
const TICK_MS = 60 * 60_000;
const DAY_MS = 24 * 3600_000;

async function tick() {
  for (const guild of client.guilds.cache.values()) {
    // eslint-disable-next-line no-await-in-loop
    const config = await guildConfigStore.find(guild.id).catch(() => null);
    const salaries = config?.roleSalaries;
    if (!salaries || !Object.keys(salaries).length) continue;
    const lastPayout = config?.lastRoleSalaryPayout || 0;
    if (Date.now() - lastPayout < DAY_MS) continue;

    // eslint-disable-next-line no-await-in-loop
    await guild.members.fetch().catch(() => {});
    for (const [roleId, amount] of Object.entries(salaries)) {
      if (!amount || amount <= 0) continue;
      const role = guild.roles.cache.get(roleId);
      if (!role) continue;
      for (const member of role.members.values()) {
        if (member.user.bot) continue;
        // eslint-disable-next-line no-await-in-loop
        await economyStore.addBalance(guild.id, member.id, amount, `salaire de role : ${role.name}`).catch((err) => logger.error('roleSalary.pay', err));
      }
    }
    // eslint-disable-next-line no-await-in-loop
    await guildConfigStore.upsert(guild.id, { lastRoleSalaryPayout: Date.now() }).catch((err) => logger.error('roleSalary.markPaid', err));
  }
}

function start() {
  setInterval(() => { tick().catch((err) => logger.error('roleSalary.tick', err)); }, TICK_MS);
  logger.info('Salaire de role demarre');
}

module.exports = { start };
