const { postModLog } = require('./modLog');
const logger = require('../../shared/logger');

// Escalade configurable (roadmap n°271) : X avertissements -> timeout,
// Y -> kick, Z -> ban. Se declenche a l'EGALITE exacte (warns.length ===
// seuil) pour ne s'appliquer qu'une seule fois par palier franchi, que
// l'avertissement vienne d'un staff (/warn) ou de l'automod.
async function applyEscalation(guild, member, warns, modConfig) {
  if (!member) return;
  const count = warns.length;
  try {
    if (modConfig.escalationBanWarns > 0 && count === modConfig.escalationBanWarns && member.bannable) {
      await member.ban({ reason: `Escalade : ${count} avertissements` });
      await postModLog(guild, {
        title: 'Bannissement automatique (escalade)',
        description: `<@${member.id}> banni automatiquement apres ${count} avertissements.`,
        color: 0xe5484d,
      });
      return;
    }
    if (modConfig.escalationKickWarns > 0 && count === modConfig.escalationKickWarns && member.kickable) {
      await member.send(`Tu as ete exclu de **${guild.name}** (${count} avertissements cumules).`).catch(() => {});
      await member.kick(`Escalade : ${count} avertissements`);
      await postModLog(guild, {
        title: 'Exclusion automatique (escalade)',
        description: `<@${member.id}> exclu automatiquement apres ${count} avertissements.`,
        color: 0xe5484d,
      });
      return;
    }
    if (modConfig.escalationTimeoutWarns > 0 && count === modConfig.escalationTimeoutWarns && member.moderatable) {
      const minutes = modConfig.escalationTimeoutMinutes ?? 10;
      await member.timeout(minutes * 60000, `Escalade : ${count} avertissements`);
      await postModLog(guild, {
        title: 'Timeout automatique (escalade)',
        description: `<@${member.id}> reduit au silence ${minutes} min apres ${count} avertissements.`,
        color: 0xd3a13a,
      });
    }
  } catch (err) {
    logger.error('escalation.applyEscalation', err);
  }
}

module.exports = { applyEscalation };
