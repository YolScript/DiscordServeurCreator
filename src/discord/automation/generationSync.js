const client = require('../client');
const pendingGenerationStore = require('../../kv/pendingGenerationStore');
const generationProgressStore = require('../../kv/generationProgressStore');
const { setupGuild, AlreadySetupError } = require('../guildSetup/setupGuild');
const logger = require('../../shared/logger');

const TICK_MS = 5_000;

async function processGuild(guild, pending) {
  // Efface la demande AVANT de traiter (setupGuild prend 15-40s) pour eviter
  // qu'un tick suivant ne la reprenne en double pendant l'execution.
  await pendingGenerationStore.clear(guild.id);

  try {
    await setupGuild({
      guild,
      templateKey: pending.templateKey,
      requestedByUserId: pending.requestedByUserId,
      reglementText: pending.reglementText || '',
      onStep: (step) => {
        generationProgressStore.appendStep(guild.id, step).catch((err) => logger.error('generationSync.appendStep', err));
      },
    });
  } catch (err) {
    const message = err instanceof AlreadySetupError ? err.message : 'Une erreur est survenue pendant la generation.';
    await generationProgressStore.appendStep(guild.id, { kind: 'error', label: message }).catch(() => {});
    logger.error('generationSync.processGuild', err);
  }
}

async function tick() {
  for (const guild of client.guilds.cache.values()) {
    let pending;
    try {
      pending = await pendingGenerationStore.get(guild.id);
    } catch (err) {
      logger.error('generationSync.get', err);
      continue;
    }
    if (!pending) continue;

    await processGuild(guild, pending);
  }
}

function start() {
  setInterval(() => { tick().catch((err) => logger.error('generationSync.tick', err)); }, TICK_MS);
  logger.info('Synchronisation de la generation de serveur demarree');
}

module.exports = { start, tick };
