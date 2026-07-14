const { GuildVerificationLevel } = require('discord.js');
const moderationConfigStore = require('../../kv/moderationConfigStore');
const { postModLog } = require('./modLog');
const logger = require('../../shared/logger');

// Etat en memoire (par process) : suffisant pour une fenetre de detection de
// quelques secondes, pas besoin de persistance KV pour ca.
const joinWindows = new Map();
const raidState = new Map(); // guildId -> { active, previousLevel }

async function triggerLockdown(guild, reason) {
  const previousLevel = guild.verificationLevel;
  raidState.set(guild.id, { active: true, previousLevel });
  await guild.setVerificationLevel(GuildVerificationLevel.VeryHigh).catch(() => {});
  await postModLog(guild, {
    title: 'Anti-raid declenche',
    description: `Verification du serveur relevee au maximum. Raison : ${reason}. Utilise /unlock une fois la situation calmee.`,
    color: 0xe5484d,
  });
}

async function liftLockdown(guild) {
  const state = raidState.get(guild.id);
  const target = state?.previousLevel ?? GuildVerificationLevel.Low;
  await guild.setVerificationLevel(target).catch(() => {});
  raidState.set(guild.id, { active: false, previousLevel: null });
}

function isLocked(guildId) {
  return Boolean(raidState.get(guildId)?.active);
}

async function handleGuildMemberAdd(member) {
  try {
    const modConfig = await moderationConfigStore.find(member.guild.id);
    if (!modConfig.antiRaidEnabled || isLocked(member.guild.id)) return;

    const now = Date.now();
    const timestamps = (joinWindows.get(member.guild.id) ?? []).filter((t) => now - t < modConfig.antiRaidIntervalMs);
    timestamps.push(now);
    joinWindows.set(member.guild.id, timestamps);

    if (timestamps.length > modConfig.antiRaidJoinThreshold) {
      await triggerLockdown(member.guild, `${timestamps.length} arrivees en ${Math.round(modConfig.antiRaidIntervalMs / 1000)}s`);
    }
  } catch (err) {
    logger.error('antiRaid', err);
  }
}

module.exports = { handleGuildMemberAdd, triggerLockdown, liftLockdown, isLocked };
