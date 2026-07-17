const xpStore = require('../../kv/xpStore');
const levelRoleStore = require('../../kv/levelRoleStore');
const guildConfigStore = require('../../kv/guildConfigStore');
const economyStore = require('../../kv/economyStore');
const voiceChannelStatsStore = require('../../kv/voiceChannelStatsStore');
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
    // Salons exclus de l'XP (roadmap n°294) : ex. bot-commandes, spam.
    excluded: new Set(config?.xpExcludedChannels || []),
    // Pause globale des automatisations (roadmap n°494).
    paused: !!config?.automationsPaused,
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

// Minutes cumulees par salon vocal (roadmap n°188) : meme logique de tampon
// que l'XP (quota KV gratuit = 1000 put()/jour), un salon occupe par au
// moins un humain non-sourd compte 5 min a chaque tick.
const pendingVoiceChannelMinutes = new Map(); // guildId -> Map(channelId -> minutes)

function queueChannelMinutes(guildId, channelId, minutes) {
  if (!pendingVoiceChannelMinutes.has(guildId)) pendingVoiceChannelMinutes.set(guildId, new Map());
  const perChannel = pendingVoiceChannelMinutes.get(guildId);
  perChannel.set(channelId, (perChannel.get(channelId) || 0) + minutes);
}

async function flushVoiceChannelStats() {
  const entries = [...pendingVoiceChannelMinutes.entries()];
  pendingVoiceChannelMinutes.clear();
  for (const [guildId, perChannel] of entries) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await voiceChannelStatsStore.get(guildId).catch(() => ({}));
    for (const [channelId, minutes] of perChannel) {
      existing[channelId] = (existing[channelId] || 0) + minutes;
    }
    // eslint-disable-next-line no-await-in-loop
    await voiceChannelStatsStore.put(guildId, existing).catch((err) => logger.error('xpManager.flushVoiceChannelStats', err));
  }
}

function xpForLevel(level) {
  return 50 * level * (level + 1);
}

function levelFromXp(xp) {
  let level = 0;
  while (xpForLevel(level + 1) <= xp) level += 1;
  return level;
}

// Applique les roles de tous les paliers atteints (rattrapage inclus si un
// ajout precedent avait echoue) mais ne renvoie que les paliers FRANCHIS par
// ce gain d'XP (oldLevel < lr.level <= newLevel), pour ne verser le bonus
// economie et l'annonce qu'une seule fois par palier.
async function applyLevelRewards(member, oldLevel, newLevel) {
  const levelRoles = await levelRoleStore.list(member.guild.id);
  const rolesToApply = levelRoles.filter((lr) => lr.roleId && lr.level <= newLevel && !member.roles.cache.has(lr.roleId));
  for (const lr of rolesToApply) {
    await member.roles.add(lr.roleId).catch(() => {});
  }
  return levelRoles.filter((lr) => lr.level > oldLevel && lr.level <= newLevel);
}

function formatAnnounce(template, userId, level) {
  return template.replace(/\{user\}/g, `<@${userId}>`).replace(/\{level\}/g, String(level));
}

// Destination de l'annonce de niveau (roadmap n°296) : salon ou le message a
// declenche le passage de niveau (comportement historique, defaut), un salon
// dedie choisi au dashboard, ou MP au membre. Le vocal n'a pas de "salon
// declencheur" : il beneficie donc directement du mode salon-dedie/MP la ou
// avant il n'annoncait jamais rien.
async function sendLevelAnnounce(guild, member, text, fallbackChannel) {
  const config = await guildConfigStore.find(guild.id).catch(() => null);
  const mode = config?.levelUpAnnounceMode || 'channel';
  if (mode === 'off') return;
  if (mode === 'dm') {
    await member.send(text).catch(() => {});
    return;
  }
  if (mode === 'channel' && config?.levelUpAnnounceChannelId) {
    const channel = await guild.channels.fetch(config.levelUpAnnounceChannelId).catch(() => null);
    if (channel) { await channel.send(text).catch(() => {}); return; }
  }
  if (fallbackChannel) await fallbackChannel.send(text).catch(() => {});
}

async function awardLevelRewards(guildId, userId, triggered) {
  for (const lr of triggered) {
    if (lr.bonus) {
      // eslint-disable-next-line no-await-in-loop
      await economyStore.addBalance(guildId, userId, lr.bonus, `bonus palier niveau ${lr.level}`).catch(() => {});
    }
  }
}

async function awardMessageXp(message) {
  if (message.author.bot || !message.guild || !message.member) return;

  try {
    const { rate, boosts, excluded, paused } = await getXpConfig(message.guild.id);
    // Pause globale des automatisations (roadmap n°494).
    if (paused) return;
    // Salon exclu (roadmap n°294) : sort AVANT de consommer le cooldown, pour
    // qu'un message dans #bot-commandes n'empeche pas de gagner de l'XP au
    // prochain message dans un salon normal.
    if (excluded.has(message.channel.id)) return;
    const cooldownKey = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    if ((messageCooldowns.get(cooldownKey) ?? 0) > now) return;
    messageCooldowns.set(cooldownKey, now + MESSAGE_COOLDOWN_MS);

    const boost = Math.min(5, Math.max(0.5, Number(boosts[message.channel.id]) || 1));
    const data = await getMemberBuffered(message.guild.id, message.author.id);
    const oldLevel = data.level;
    data.xp += Math.round(XP_PER_MESSAGE * rate * boost);
    data.messageCount += 1;
    const newLevel = levelFromXp(data.xp);
    const leveledUp = newLevel > data.level;
    data.level = newLevel;
    queueXpWrite(message.guild.id, message.author.id, data);

    if (leveledUp) {
      await flushMemberNow(message.guild.id, message.author.id);
      const triggered = await applyLevelRewards(message.member, oldLevel, newLevel);
      await awardLevelRewards(message.guild.id, message.author.id, triggered);
      const customAnnounces = triggered.filter((lr) => lr.announce).map((lr) => formatAnnounce(lr.announce, message.author.id, lr.level));
      const text = customAnnounces.length ? customAnnounces.join('\n') : `🎉 <@${message.author.id}> passe niveau **${newLevel}** !`;
      await sendLevelAnnounce(message.guild, message.member, text, message.channel);
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
      const activeMembers = [...channel.members.values()].filter((m) => !m.user.bot && !m.voice.selfDeaf && !m.voice.deaf);
      // Les statistiques d'occupation (n°188) restent suivies meme sur un
      // salon exclu de l'XP : ce sont deux informations distinctes.
      if (activeMembers.length) queueChannelMinutes(guild.id, channel.id, 5);
      // eslint-disable-next-line no-await-in-loop
      const { rate, excluded, paused } = await getXpConfig(guild.id);
      // Pause globale des automatisations (roadmap n°494) : les stats
      // d'occupation restent suivies au-dessus, seul l'XP s'arrete.
      if (paused || excluded.has(channel.id)) continue;
      for (const member of activeMembers) {
        try {
          const data = await getMemberBuffered(guild.id, member.id);
          const oldLevel = data.level;
          data.xp += Math.round(XP_PER_VOICE_TICK * rate);
          data.voiceMinutes += 5;
          const newLevel = levelFromXp(data.xp);
          const leveledUp = newLevel > data.level;
          data.level = newLevel;
          queueXpWrite(guild.id, member.id, data);
          if (leveledUp) {
            await flushMemberNow(guild.id, member.id);
            const triggered = await applyLevelRewards(member, oldLevel, newLevel);
            await awardLevelRewards(guild.id, member.id, triggered);
            // Pas de "salon declencheur" en vocal : uniquement salon dedie ou
            // MP (roadmap n°296) — silencieux si aucun des deux n'est
            // configure, comme avant cette fonctionnalite.
            const customAnnounces = triggered.filter((lr) => lr.announce).map((lr) => formatAnnounce(lr.announce, member.id, lr.level));
            const text = customAnnounces.length ? customAnnounces.join('\n') : `🎉 <@${member.id}> passe niveau **${newLevel}** !`;
            await sendLevelAnnounce(guild, member, text, null);
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
  setInterval(() => { flushVoiceChannelStats().catch((err) => logger.error('xpManager.flushVoiceChannelStatsTimer', err)); }, XP_FLUSH_MS);
}

module.exports = {
  awardMessageXp, tickVoiceXp, levelFromXp, xpForLevel, start,
};
