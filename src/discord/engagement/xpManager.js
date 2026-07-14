const xpStore = require('../../kv/xpStore');
const levelRoleStore = require('../../kv/levelRoleStore');
const { checkAndAwardBadges } = require('./badgeManager');
const logger = require('../../shared/logger');

const XP_PER_MESSAGE = 15;
const MESSAGE_COOLDOWN_MS = 60_000;
const XP_PER_VOICE_TICK = 10;

const messageCooldowns = new Map(); // `${guildId}:${userId}` -> timestamp

function xpForLevel(level) {
  return 50 * level * (level + 1);
}

function levelFromXp(xp) {
  let level = 0;
  while (xpForLevel(level + 1) <= xp) level += 1;
  return level;
}

async function applyLevelRoles(member, newLevel) {
  const levelRoles = await levelRoleStore.list(member.guild.id);
  const toApply = levelRoles.filter((lr) => lr.level <= newLevel && !member.roles.cache.has(lr.roleId));
  for (const lr of toApply) {
    await member.roles.add(lr.roleId).catch(() => {});
  }
}

async function awardMessageXp(message) {
  if (message.author.bot || !message.guild || !message.member) return;
  const cooldownKey = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  if ((messageCooldowns.get(cooldownKey) ?? 0) > now) return;
  messageCooldowns.set(cooldownKey, now + MESSAGE_COOLDOWN_MS);

  try {
    const data = await xpStore.getMember(message.guild.id, message.author.id);
    data.xp += XP_PER_MESSAGE;
    data.messageCount += 1;
    const newLevel = levelFromXp(data.xp);
    const leveledUp = newLevel > data.level;
    data.level = newLevel;
    await xpStore.setMember(message.guild.id, message.author.id, data);

    if (leveledUp) {
      await applyLevelRoles(message.member, newLevel);
      await message.channel.send(`🎉 <@${message.author.id}> passe niveau **${newLevel}** !`).catch(() => {});
    }
    await checkAndAwardBadges(message.guild, message.author.id);
  } catch (err) {
    logger.error('xpManager.awardMessageXp', err);
  }
}

async function tickVoiceXp(client) {
  for (const guild of client.guilds.cache.values()) {
    for (const channel of guild.channels.cache.values()) {
      if (channel.type !== 2 || !channel.members) continue; // 2 = GuildVoice
      for (const member of channel.members.values()) {
        if (member.user.bot) continue;
        if (member.voice.selfDeaf || member.voice.deaf) continue;
        try {
          const data = await xpStore.getMember(guild.id, member.id);
          data.xp += XP_PER_VOICE_TICK;
          data.voiceMinutes += 5;
          const newLevel = levelFromXp(data.xp);
          const leveledUp = newLevel > data.level;
          data.level = newLevel;
          await xpStore.setMember(guild.id, member.id, data);
          if (leveledUp) await applyLevelRoles(member, newLevel);
          await checkAndAwardBadges(guild, member.id);
        } catch (err) {
          logger.error('xpManager.tickVoiceXp', err);
        }
      }
    }
  }
}

const VOICE_TICK_MS = 5 * 60_000;

function start(client) {
  setInterval(() => { tickVoiceXp(client).catch((err) => logger.error('xpManager.tick', err)); }, VOICE_TICK_MS);
}

module.exports = {
  awardMessageXp, tickVoiceXp, levelFromXp, xpForLevel, start,
};
