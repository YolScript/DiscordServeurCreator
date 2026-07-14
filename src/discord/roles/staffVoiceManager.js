const { Routes } = require('discord.js');
const guildConfigStore = require('../../kv/guildConfigStore');
const { ensureStaffCategory } = require('./staffCategory');
const { syncCreatorChannel } = require('./staffVoiceCreator');
const logger = require('../../shared/logger');

function isStaff(member, config) {
  return member.roles.cache.has(config.moderateurRoleId) || member.roles.cache.has(config.adminRoleId);
}

// Utilise le "voice channel status" natif Discord pour afficher qui est
// actuellement en service, sans avoir a renommer le salon (rate-limite a 2
// renommages/10min) ni faire semblant d'avoir des membres connectes.
async function updateServiceStaffStatus(guild, config) {
  if (!config?.serviceStaffChannelId || !config.staffActifRoleId) return;
  try {
    const activeMembers = guild.members.cache.filter((m) => m.roles.cache.has(config.staffActifRoleId));
    const status = activeMembers.size
      ? `🟢 En service : ${activeMembers.map((m) => m.displayName).join(', ')}`.slice(0, 500)
      : '';
    await guild.client.rest.put(Routes.channelVoiceStatus(config.serviceStaffChannelId), { body: { status } });
  } catch (err) {
    logger.error('staffVoiceManager.updateServiceStaffStatus', err);
  }
}

// SERVICE STAFF sert d'interrupteur : un staff qui s'y connecte est
// immediatement deconnecte (le salon ne sert jamais a un vrai appel), et
// bascule sa visibilite sur le reste de la categorie Staff via le role
// "Staff Actif" (ajoute si absent, retire si present). Le statut du salon
// vocal affiche en direct qui est en service.
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

    await updateServiceStaffStatus(guild, await guildConfigStore.find(guild.id));
    await syncCreatorChannel(guild);
  } catch (err) {
    logger.error('staffVoiceManager.handleVoiceStateUpdate', err);
  }
}

module.exports = { handleVoiceStateUpdate, updateServiceStaffStatus };
