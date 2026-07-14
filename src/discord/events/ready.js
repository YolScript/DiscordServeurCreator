const { Events } = require('discord.js');
const client = require('../client');
const staffVoiceManager = require('../roles/staffVoiceManager');
const scheduler = require('../automation/scheduler');
const liveNotifier = require('../automation/liveNotifier');
const xpManager = require('../engagement/xpManager');
const pollManager = require('../engagement/pollManager');
const logger = require('../../shared/logger');

client.once(Events.ClientReady, async (readyClient) => {
  logger.info(`Connecte en tant que ${readyClient.user.tag} (${readyClient.guilds.cache.size} serveur(s))`);

  // Etat initial du hub Vocal Staff : au cas ou un staff etait deja en ligne
  // avant le demarrage du bot (sinon on attendrait son prochain changement
  // de presence pour s'en rendre compte).
  for (const guild of readyClient.guilds.cache.values()) {
    await guild.members.fetch().catch(() => {});
    await staffVoiceManager.syncHub(guild).catch((err) => logger.error('syncHub initial', err));
  }

  scheduler.start();
  liveNotifier.start();
  xpManager.start(readyClient);
  pollManager.start();
});
