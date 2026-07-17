const guildConfigStore = require('../../kv/guildConfigStore');
const logger = require('../../shared/logger');

// Role automatique "en vocal" (roadmap n°384) : ajoute a la connexion,
// retire a la deconnexion. Simple diff channelId avant/apres.
async function handleVoiceStateUpdate(oldState, newState) {
  const joined = !oldState.channelId && newState.channelId;
  const left = oldState.channelId && !newState.channelId;
  if (!joined && !left) return;

  try {
    const guild = newState.guild;
    const config = await guildConfigStore.find(guild.id).catch(() => null);
    const roleId = config?.inVoiceRoleId;
    if (!roleId) return;
    const member = newState.member || oldState.member;
    if (!member) return;
    if (joined) await member.roles.add(roleId).catch(() => {});
    else await member.roles.remove(roleId).catch(() => {});
  } catch (err) {
    logger.error('inVoiceRole.handleVoiceStateUpdate', err);
  }
}

module.exports = { handleVoiceStateUpdate };
