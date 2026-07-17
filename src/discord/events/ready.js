const { Events } = require('discord.js');
const client = require('../client');
const { ensureStaffCategory, syncStaffChatChannel } = require('../roles/staffCategory');
const { syncCreatorChannel } = require('../roles/staffVoiceCreator');
const { ensureGamesCategory } = require('../roles/gameChannels');
const { ensurePublicVoiceCreator } = require('../roles/publicVoiceManager');
const guildConfigStore = require('../../kv/guildConfigStore');
const scheduler = require('../automation/scheduler');
const liveNotifier = require('../automation/liveNotifier');
const xpManager = require('../engagement/xpManager');
const pollManager = require('../engagement/pollManager');
const giveawayManager = require('../engagement/giveawayManager');
const inviteTracker = require('../engagement/inviteTracker');
const gameRolesSync = require('../roles/gameRolesSync');
const panelActionsSync = require('../automation/panelActionsSync');
const statsTracker = require('../automation/statsTracker');
const statusRotator = require('../automation/statusRotator');
const tempBanExpiry = require('../automation/tempBanExpiry');
const birthdayAnnouncer = require('../automation/birthdayAnnouncer');
const memberCountChannel = require('../automation/memberCountChannel');
const botStatusHeartbeat = require('../automation/botStatusHeartbeat');
const generationSync = require('../automation/generationSync');
const reminderManager = require('../automation/reminderManager');
const rssWatcher = require('../automation/rssWatcher');
const dailyPoll = require('../engagement/dailyPoll');
const countdownChannel = require('../automation/countdownChannel');
const threadAutoClose = require('../automation/threadAutoClose');
const roleSalary = require('../automation/roleSalary');
const dailyQuote = require('../automation/dailyQuote');
const voiceAfkKick = require('../automation/voiceAfkKick');
const logger = require('../../shared/logger');

client.once(Events.ClientReady, async (readyClient) => {
  logger.info(`Connecte en tant que ${readyClient.user.tag} (${readyClient.guilds.cache.size} serveur(s))`);

  // Alerte de demarrage (roadmap n°105) : MP au proprietaire de l'application
  // a chaque (re)demarrage - un crash-redemarrage inattendu se voit ainsi
  // immediatement, sans surveiller les logs Render.
  try {
    const appInfo = await readyClient.application.fetch();
    const owner = appInfo.owner?.user ?? appInfo.owner;
    if (typeof owner?.send === 'function') {
      const version = (process.env.RENDER_GIT_COMMIT || 'locale').slice(0, 7);
      await owner.send(`🤖 Bot demarre — ${readyClient.guilds.cache.size} serveur(s), version \`${version}\`.`);
    }
  } catch (err) {
    logger.error('alerte demarrage', err);
  }

  for (const guild of readyClient.guilds.cache.values()) {
    await guild.members.fetch().catch(() => {});
    const config = await guildConfigStore.find(guild.id).catch(() => null);
    if (config) {
      await ensureStaffCategory(guild).catch((err) => logger.error('ensureStaffCategory initial', err));
      await syncCreatorChannel(guild).catch((err) => logger.error('syncCreatorChannel initial', err));
      await syncStaffChatChannel(guild).catch((err) => logger.error('syncStaffChatChannel initial', err));
      await ensureGamesCategory(guild).catch((err) => logger.error('ensureGamesCategory initial', err));
      await ensurePublicVoiceCreator(guild).catch((err) => logger.error('ensurePublicVoiceCreator initial', err));
    }
    await inviteTracker.snapshotGuildInvites(guild).catch((err) => logger.error('snapshotGuildInvites', err));
  }

  scheduler.start();
  liveNotifier.start();
  xpManager.start(readyClient);
  pollManager.start();
  giveawayManager.start();
  gameRolesSync.start();
  panelActionsSync.start();
  statsTracker.start();
  statusRotator.start();
  tempBanExpiry.start();
  birthdayAnnouncer.start();
  memberCountChannel.start();
  botStatusHeartbeat.start();
  generationSync.start();
  reminderManager.start();
  rssWatcher.start();
  dailyPoll.start();
  countdownChannel.start();
  threadAutoClose.start();
  roleSalary.start();
  dailyQuote.start();
  voiceAfkKick.start();
});
