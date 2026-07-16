const xpStore = require('../../kv/xpStore');
const levelRoleStore = require('../../kv/levelRoleStore');
const guildConfigStore = require('../../kv/guildConfigStore');
const { checkAndAwardBadges } = require('./badgeManager');
const logger = require('../../shared/logger');

const XP_PER_MESSAGE = 15;
const MESSAGE_COOLDOWN_MS = 60_000;
const XP_PER_VOICE_TICK = 10;

// Courbe d'XP configurable (roadmap n°082) : xpRate global (x0.5 a x3) et
// multiplicateurs par salon (config.xpChannelBoosts = { channelId: mult }).
// Cache memoire 5 min pour ne pas relire la config a chaque message.
const xpConfigCache = new Map(); // guildId -> { rate, boosts, expires }
async function getXpConfig(guildId) {
  const cached = xpConfigCache.get(guildId);
  if (cached && cached.expires > Date.now()) return cached;
  const config = await guildConfigStore.find(guildId).catch(() => null);
  const entry = {
    rate: Math.min(3, Math.max(0.5, Number(config?.xpRate) || 1)),
    boosts: config?.xpChannelBoosts || {},
    expires: Date.now() + 5 * 60_000,
  };
  xpConfigCache.set(guildId, entry);
  return entry;
}

const messageCooldowns = new Map(); // `${guildId}:${userId}` -> timestamp

// Tampon d'ecritures XP : le KV gratuit est limite a 1000 put()/jour, or un
// put par message (meme avec cooldown) explose ce quota sur un serveur
// actif. Les gains s'accumulent en memoire et partent par lots toutes les
// 3 min (flush immediat au passage de niveau pour que le dashboard le voie).
// Un redemarrage du bot peut perdre au pire ~3 min de gains : acceptable.
const pendingXpWrites = new Map(); // `${guildId}:${userId}` -> { guildId, userId, data }
const XP_FLUSH_MS = 3 * 60_000;

async function getMemberBuffered(guildId, userId) {
  const key = `${guildId}:${userId}`;
  if (pendingXpWrites.has(key)) return pendingXpWrites.get(key).data;
  return xpStore.getMember(guildId, userId);
}

function queueXpWrite(guildId, userId, data) {
  pendingXpWrites.set(`${guildId}:${userId}`, { guildId, userId, data });
}

async function flushXpWrites() {
  const entries = [...pendingXpWrites.values()];
  pendingXpWrites.clear();
  for (const e of entries) {
    // eslint-disable-next-line no-await-in-loop
    await xpStore.setMember(e.guildId, e.userId, e.data).catch((err) => logger.error('xpManager.flush', err));
  }
}

async function flushMemberNow(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const entry = pendingXpWrites.get(key);
  if (!entry) return;
  pendingXpWrites.delete(key);
  await xpStore.setMember(guildId, userId, entry.data).catch((err) => logger.error('xpManager.flushMember', err));
}

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
    const { rate, boosts } = await getXpConfig(message.guild.id);
    const boost = Math.min(5, Math.max(0.5, Number(boosts[message.channel.id]) || 1));
    const data = await getMemberBuffered(message.guild.id, message.author.id);
    data.xp += Math.round(XP_PER_MESSAGE * rate * boost);
    data.messageCount += 1;
    const newLevel = levelFromXp(data.xp);
    const leveledUp = newLevel > data.level;
    data.level = newLevel;
    queueXpWrite(message.guild.id, message.author.id, data);

    if (leveledUp) {
      await flushMemberNow(message.guild.id, message.author.id);
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
          const { rate } = await getXpConfig(guild.id);
          const data = await getMemberBuffered(guild.id, member.id);
          data.xp += Math.round(XP_PER_VOICE_TICK * rate);
          data.voiceMinutes += 5;
          const newLevel = levelFromXp(data.xp);
          const leveledUp = newLevel > data.level;
          data.level = newLevel;
          queueXpWrite(guild.id, member.id, data);
          if (leveledUp) {
            await flushMemberNow(guild.id, member.id);
            await applyLevelRoles(member, newLevel);
          }
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
  setInterval(() => { flushXpWrites().catch((err) => logger.error('xpManager.flushTimer', err)); }, XP_FLUSH_MS);
}

module.exports = {
  awardMessageXp, tickVoiceXp, levelFromXp, xpForLevel, start,
};
