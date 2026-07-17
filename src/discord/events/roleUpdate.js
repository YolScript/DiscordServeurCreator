const { Events, PermissionFlagsBits } = require('discord.js');
const client = require('../client');
const { postModLog } = require('../moderation/modLog');
const logger = require('../../shared/logger');

// Detection de permissions dangereuses sur @everyone (roadmap n°334) : ce
// role s'applique a TOUT le serveur, une permission comme Administrator ou
// BanMembers dessus est presque toujours une erreur de manipulation.
const DANGEROUS_PERMS = [
  ['Administrator', PermissionFlagsBits.Administrator],
  ['BanMembers', PermissionFlagsBits.BanMembers],
  ['KickMembers', PermissionFlagsBits.KickMembers],
  ['ManageGuild', PermissionFlagsBits.ManageGuild],
  ['ManageRoles', PermissionFlagsBits.ManageRoles],
  ['ManageChannels', PermissionFlagsBits.ManageChannels],
  ['ManageWebhooks', PermissionFlagsBits.ManageWebhooks],
  ['MentionEveryone', PermissionFlagsBits.MentionEveryone],
];

client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
  try {
    if (newRole.id !== newRole.guild.id) return; // seul @everyone a le meme ID que la guilde
    const newlyDangerous = DANGEROUS_PERMS.filter(([, bit]) => newRole.permissions.has(bit) && !oldRole.permissions.has(bit));
    if (!newlyDangerous.length) return;

    const names = newlyDangerous.map(([label]) => label).join(', ');
    await postModLog(newRole.guild, {
      title: '🛡️ Permission dangereuse sur @everyone',
      description: `Le role @everyone vient de recevoir : **${names}**. Cette permission s'applique a TOUT le serveur — verifie que c'est voulu.`,
      color: 0xe5484d,
    });
    const owner = await newRole.guild.fetchOwner().catch(() => null);
    await owner?.send(
      `🛡️ **Alerte securite — ${newRole.guild.name}**\n`
      + `Le role @everyone vient de recevoir la permission **${names}**, ce qui l'accorde a absolument tous les membres.\n`
      + 'Si ce n\'est pas voulu, corrige-le immediatement depuis les parametres du serveur ou le dashboard.',
    ).catch(() => {});
  } catch (err) {
    logger.error('roleUpdate.dangerousEveryone', err);
  }
});
