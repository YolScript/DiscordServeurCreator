const moderationConfigStore = require('../../kv/moderationConfigStore');
const { postModLog } = require('./modLog');
const logger = require('../../shared/logger');

const DAY_MS = 86400000;

// Garde-fou comptes recents (roadmap n°275) : les comptes Discord crees il y
// a moins de N jours declenchent une action auto a l'arrivee (alerte staff,
// kick, ban ou role de quarantaine), utile contre les vagues de faux comptes.
async function handleGuildMemberAdd(member) {
  try {
    const modConfig = await moderationConfigStore.find(member.guild.id);
    if (!modConfig.newAccountGuardEnabled) return;

    const ageMs = Date.now() - member.user.createdTimestamp;
    const maxAgeMs = Math.max(0, modConfig.newAccountMaxAgeDays) * DAY_MS;
    if (ageMs >= maxAgeMs) return;

    const ageDays = Math.floor(ageMs / DAY_MS);
    const summary = `<@${member.id}> (compte cree il y a ${ageDays} jour(s), seuil : ${modConfig.newAccountMaxAgeDays} jours).`;

    switch (modConfig.newAccountAction) {
      case 'kick':
        if (member.kickable) {
          await member.kick('Compte recent (garde-fou automatique)');
          await postModLog(member.guild, {
            title: 'Exclusion automatique (compte recent)',
            description: summary,
            color: 0xe5484d,
          });
        }
        break;
      case 'ban':
        if (member.bannable) {
          await member.ban({ reason: 'Compte recent (garde-fou automatique)' });
          await postModLog(member.guild, {
            title: 'Bannissement automatique (compte recent)',
            description: summary,
            color: 0xe5484d,
          });
        }
        break;
      case 'role':
        if (modConfig.newAccountRoleId) {
          await member.roles.add(modConfig.newAccountRoleId).catch((err) => logger.error('newAccountGuard.role', err));
          await postModLog(member.guild, {
            title: 'Role de quarantaine applique (compte recent)',
            description: summary,
            color: 0xd3a13a,
          });
        }
        break;
      default:
        await postModLog(member.guild, {
          title: 'Alerte : compte recent',
          description: summary,
          color: 0xd3a13a,
        });
    }
  } catch (err) {
    logger.error('newAccountGuard', err);
  }
}

module.exports = { handleGuildMemberAdd };
