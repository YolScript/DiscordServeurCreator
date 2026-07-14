const guildConfigStore = require('../../kv/guildConfigStore');
const { ensureStaffCategory } = require('./staffCategory');
const logger = require('../../shared/logger');

function isStaff(member, config) {
  return member.roles.cache.has(config.moderateurRoleId) || member.roles.cache.has(config.adminRoleId);
}

// SERVICE STAFF sert d'interrupteur : un staff qui s'y connecte est
// immediatement deconnecte (le salon ne sert jamais a un vrai appel), et
// bascule sa visibilite sur le reste de la categorie Staff via le role
// "Staff Actif" (ajoute si absent, retire si present).
async function handleVoiceStateUpdate(oldState, newState) {
  try {
    const guild = newState.guild ?? oldState.guild;
    const config = await guildConfigStore.find(guild.id);
    if (!config?.moderateurRoleId || !newState.channelId) return;
    if (newState.channelId !== config.serviceStaffChannelId) return;

    const member = newState.member;
    if (!member || !isStaff(member, config)) return;

    await member.voice.disconnect().catch(() => {});

    const { staffActifRoleId } = await ensureStaffCategory(guild);
    if (member.roles.cache.has(staffActifRoleId)) {
      await member.roles.remove(staffActifRoleId).catch(() => {});
    } else {
      await member.roles.add(staffActifRoleId).catch(() => {});
    }
  } catch (err) {
    logger.error('staffVoiceManager.handleVoiceStateUpdate', err);
  }
}

module.exports = { handleVoiceStateUpdate };
