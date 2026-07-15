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

async function takeAction(message, guildConfig, reason) {
  await message.delete().catch(() => {});
  await warnStore.add(message.guild.id, message.author.id, {
    reason, moderatorId: message.client.user.id, source: 'automod',
  });
  await postModLog(message.guild, {
    title: 'Auto-moderation',
    description: `Message de <@${message.author.id}> supprime dans <#${message.channel.id}>.`,
    color: 0xe5484d,
    fields: [{ name: 'Raison', value: reason }],
  });
  await message.author.send(`Ton message a ete supprime sur **${message.guild.name}** : ${reason}`).catch(() => {});
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
      await takeAction(message, guildConfig, 'lien d\'invitation Discord non autorise');
      return;
    }
    if (modConfig.blockLinks) {
      const disallowed = disallowedHostnames(content, modConfig.linkWhitelist || []);
      if (disallowed.length) {
        await takeAction(message, guildConfig, `lien externe non autorise (${disallowed[0]})`);
        return;
      }
    }
    const bannedHit = modConfig.bannedWords.find((w) => matchesBannedWord(content, w));
    if (bannedHit) {
      await takeAction(message, guildConfig, `mot interdit ("${bannedHit}")`);
      return;
    }
    if (checkSpam(message.guild.id, message.author.id, modConfig)) {
      await takeAction(message, guildConfig, 'spam (trop de messages en peu de temps)');
    }
  } catch (err) {
    logger.error('autoMod', err);
  }
}

module.exports = { handleMessageCreate };
