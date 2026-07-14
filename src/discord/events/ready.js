const { Events } = require('discord.js');
const client = require('../client');
const { ensureStaffCategory } = require('../roles/staffCategory');
const guildConfigStore = require('../../kv/guildConfigStore');
const scheduler = require('../automation/scheduler');
const liveNotifier = require('../automation/liveNotifier');
const xpManager = require('../engagement/xpManager');
const pollManager = require('../engagement/pollManager');
const giveawayManager = require('../engagement/giveawayManager');
const inviteTracker = require('../engagement/inviteTracker');
const logger = require('../../shared/logger');

client.once(Events.ClientReady, async (readyClient) => {
  logger.info(`Connecte en tant que ${readyClient.user.tag} (${readyClient.guilds.cache.size} serveur(s))`);

  for (const guild of readyClient.guilds.cache.values()) {
    await guild.members.fetch().catch(() => {});
    const config = await guildConfigStore.find(guild.id).catch(() => null);
    if (config) {
      await ensureStaffCategory(guild).catch((err) => logger.error('ensureStaffCategory initial', err));
    }
    await inviteTracker.snapshotGuildInvites(guild).catch((err) => logger.error('snapshotGuildInvites', err));
  }

  scheduler.start();
  liveNotifier.start();
  xpManager.start(readyClient);
  pollManager.start();
  giveawayManager.start();
});
