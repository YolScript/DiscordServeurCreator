const moderationConfigStore = require('../../kv/moderationConfigStore');
const guildConfigStore = require('../../kv/guildConfigStore');
const warnStore = require('../../kv/warnStore');
const { postModLog } = require('./modLog');
const logger = require('../../shared/logger');

const INVITE_REGEX = /(discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]+/i;
const URL_REGEX = /https?:\/\/[^\s]+/gi;

// Fenetres de spam en memoire (par process) : pas besoin de persistance KV
// pour une detection de rafale sur quelques secondes.
const messageWindows = new Map();

function isStaff(member, config) {
  return member.roles.cache.has(config.moderateurRoleId) || member.roles.cache.has(config.adminRoleId);
}

// Un mot prefixe par "re:" est traite comme une regex (ex: "re:\bfree\s*nitro\b").
function matchesBannedWord(content, word) {
  if (word.startsWith('re:')) {
    try { return new RegExp(word.slice(3), 'i').test(content); } catch { return false; }
  }
  return content.toLowerCase().includes(word.toLowerCase());
}

// Liens externes bloques SAUF ceux dont le domaine figure dans la whitelist
// (ex: "youtube.com", "twitch.tv") : permet d'autoriser certains sites tout
// en bloquant le reste, plutot que tout ou rien.
function disallowedHostnames(content, whitelist) {
  const urls = content.match(URL_REGEX) || [];
  const hosts = urls.map((u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } }).filter(Boolean);
  return hosts.filter((h) => !whitelist.some((allowed) => h === allowed || h.endsWith(`.${allowed}`)));
}

function checkSpam(guildId, userId, modConfig) {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const timestamps = (messageWindows.get(key) ?? []).filter((t) => now - t < modConfig.spamIntervalMs);
  timestamps.push(now);
  messageWindows.set(key, timestamps);
  return timestamps.length > modConfig.spamMessageThreshold;
}

// Slowmode automatique (roadmap n°080) : quand un salon depasse N messages
// (tous auteurs confondus) sur 10 s, on active un mode lent temporaire puis
// on le retire une fois le calme revenu. En memoire process uniquement.
const channelWindows = new Map();
const activeSlowmodes = new Map();

async function maybeAutoSlowmode(message, modConfig) {
  if (!modConfig.autoSlowmodeEnabled) return;
  const channel = message.channel;
  if (!channel?.setRateLimitPerUser || channel.rateLimitPerUser > 0) return;
  if (activeSlowmodes.has(channel.id)) return;

  const now = Date.now();
  const stamps = (channelWindows.get(channel.id) ?? []).filter((t) => now - t < 10000);
  stamps.push(now);
  channelWindows.set(channel.id, stamps);
  if (stamps.length <= (modConfig.autoSlowmodeMsgPer10s ?? 20)) return;

  const seconds = modConfig.autoSlowmodeSeconds ?? 5;
  const durationMs = (modConfig.autoSlowmodeDurationMin ?? 5) * 60000;
  await channel.setRateLimitPerUser(seconds, 'Slowmode automatique (pic de messages)').catch(() => { activeSlowmodes.delete(channel.id); });
  activeSlowmodes.set(channel.id, setTimeout(async () => {
    activeSlowmodes.delete(channel.id);
    await channel.setRateLimitPerUser(0, 'Fin du slowmode automatique').catch(() => {});
  }, durationMs));
  await postModLog(message.guild, {
    title: 'Slowmode automatique',
    description: `Mode lent ${seconds} s active dans <#${channel.id}> pendant ${Math.round(durationMs / 60000)} min (pic d'activite).`,
    color: 0xd3a13a,
  });
}

async function takeAction(message, guildConfig, reason, modConfig) {
  await message.delete().catch(() => {});
  const warns = await warnStore.add(message.guild.id, message.author.id, {
    reason, moderatorId: message.client.user.id, source: 'automod',
  });
  await postModLog(message.guild, {
    title: 'Auto-moderation',
    description: `Message de <@${message.author.id}> supprime dans <#${message.channel.id}>.`,
    color: 0xe5484d,
    fields: [{ name: 'Raison', value: reason }],
  });
  await message.author.send(`Ton message a ete supprime sur **${message.guild.name}** : ${reason}`).catch(() => {});

  // Escalade progressive (roadmap n°073/074) : au-dela de N infractions
  // automod dans la derniere heure, timeout automatique.
  const threshold = modConfig?.autoTimeoutAfterWarns ?? 0;
  if (threshold > 0) {
    const oneHourAgo = Date.now() - 3600000;
    const recent = warns.filter((w) => w.source === 'automod' && w.createdAt > oneHourAgo);
    if (recent.length >= threshold && message.member?.moderatable) {
      const minutes = modConfig.autoTimeoutMinutes ?? 10;
      await message.member.timeout(minutes * 60000, `Automod : ${recent.length} infractions en 1 h`).catch(() => {});
      await postModLog(message.guild, {
        title: 'Timeout automatique',
        description: `<@${message.author.id}> reduit au silence ${minutes} min (${recent.length} infractions automod en 1 h).`,
        color: 0xe5484d,
      });
      await message.author.send(`Tu es reduit au silence ${minutes} min sur **${message.guild.name}** (infractions repetees).`).catch(() => {});
    }
  }
}

async function handleMessageCreate(message) {
  try {
    if (message.author.bot || !message.guild || !message.member) return;

    const guildConfig = await guildConfigStore.find(message.guild.id);
    if (!guildConfig) return; // serveur pas encore configure via /setup

    const modConfig = await moderationConfigStore.find(message.guild.id);
    const content = message.content ?? '';

    if (modConfig.alertKeywords.length) {
      const hit = modConfig.alertKeywords.find((w) => content.toLowerCase().includes(w.toLowerCase()));
      if (hit) {
        await postModLog(message.guild, {
          title: 'Mot-cle sensible detecte',
          description: `<@${message.author.id}> dans <#${message.channel.id}> : "${content.slice(0, 200)}"`,
          color: 0xd3a13a,
          fields: [{ name: 'Mot-cle', value: hit }],
        });
      }
    }

    if (!modConfig.autoModEnabled || isStaff(message.member, guildConfig)) return;

    if (modConfig.blockInvites && INVITE_REGEX.test(content)) {
      await takeAction(message, guildConfig, 'lien d\'invitation Discord non autorise', modConfig);
      return;
    }
    if (modConfig.blockLinks) {
      const disallowed = disallowedHostnames(content, modConfig.linkWhitelist || []);
      if (disallowed.length) {
        await takeAction(message, guildConfig, `lien externe non autorise (${disallowed[0]})`, modConfig);
        return;
      }
    }
    const bannedHit = modConfig.bannedWords.find((w) => matchesBannedWord(content, w));
    if (bannedHit) {
      await takeAction(message, guildConfig, `mot interdit ("${bannedHit}")`, modConfig);
      return;
    }
    if (checkSpam(message.guild.id, message.author.id, modConfig)) {
      await takeAction(message, guildConfig, 'spam (trop de messages en peu de temps)', modConfig);
      return;
    }
    await maybeAutoSlowmode(message, modConfig);
  } catch (err) {
    logger.error('autoMod', err);
  }
}

module.exports = { handleMessageCreate };
