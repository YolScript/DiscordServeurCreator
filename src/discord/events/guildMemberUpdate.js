const { Events, PermissionFlagsBits } = require('discord.js');
const client = require('../client');
const logger = require('../../shared/logger');

// Alerte securite (roadmap n°167) : MP au proprietaire du serveur des qu'un
// role portant la permission Administrator est attribue a un membre — un
// vol de compte staff ou une erreur de manipulation se voit immediatement.
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  try {
    const addedRoles = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
    if (!addedRoles.size) return;
    const adminRole = addedRoles.find((r) => r.permissions.has(PermissionFlagsBits.Administrator));
    if (!adminRole) return;
    if (newMember.id === newMember.guild.ownerId) return;

    const owner = await newMember.guild.fetchOwner().catch(() => null);
    if (!owner || owner.id === newMember.id) return;
    await owner.send(
      `🛡️ **Alerte securite — ${newMember.guild.name}**\n`
      + `Le role administrateur **${adminRole.name}** vient d'etre attribue a **${newMember.user.tag}** (<@${newMember.id}>).\n`
      + 'Si ce n\'est pas voulu, retire-le immediatement et verifie qui a fait cette action dans les logs du serveur.',
    ).catch(() => { /* MP fermes */ });
  } catch (err) {
    logger.error('guildMemberUpdate.adminAlert', err);
  }
});
