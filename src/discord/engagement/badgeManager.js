const badgeStore = require('../../kv/badgeStore');
const xpStore = require('../../kv/xpStore');
const referralStore = require('../../kv/referralStore');
const guildConfigStore = require('../../kv/guildConfigStore');
const logger = require('../../shared/logger');

const BADGE_DEFINITIONS = [
  {
    key: 'bavard', emoji: '💬', label: 'Bavard', description: '100 messages envoyes',
    check: (stats) => stats.messageCount >= 100,
  },
  {
    key: 'pilier_vocal', emoji: '🎙️', label: 'Pilier vocal', description: '10h passees en vocal',
    check: (stats) => stats.voiceMinutes >= 600,
  },
  {
    key: 'parrain', emoji: '🤝', label: 'Parrain', description: '5 membres invites',
    check: (stats) => stats.referralCount >= 5,
  },
  {
    key: 'niveau_10', emoji: '⭐', label: 'Niveau 10', description: 'Atteint le niveau 10',
    check: (stats) => stats.level >= 10,
  },
];

async function checkAndAwardBadges(guild, userId) {
  try {
    const [xp, referralCounts] = await Promise.all([
      xpStore.getMember(guild.id, userId),
      referralStore.getCounts(guild.id),
    ]);
    const stats = {
      messageCount: xp.messageCount,
      voiceMinutes: xp.voiceMinutes,
      level: xp.level,
      referralCount: referralCounts[userId] ?? 0,
    };

    for (const def of BADGE_DEFINITIONS) {
      if (!def.check(stats)) continue;
      const unlocked = await badgeStore.unlock(guild.id, userId, def.key);
      if (unlocked) {
        const config = await guildConfigStore.find(guild.id);
        const channel = config?.arrivalDepartureChannelId
          ? await guild.channels.fetch(config.arrivalDepartureChannelId).catch(() => null)
          : null;
        if (channel) await channel.send(`${def.emoji} <@${userId}> a obtenu le badge **${def.label}** !`).catch(() => {});
      }
    }
  } catch (err) {
    logger.error('badgeManager.check', err);
  }
}

module.exports = { checkAndAwardBadges, BADGE_DEFINITIONS };
