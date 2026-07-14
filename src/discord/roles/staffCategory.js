const { ChannelType, PermissionFlagsBits: P } = require('discord.js');
const guildConfigStore = require('../../kv/guildConfigStore');
const { toSmallCaps } = require('../../shared/smallCaps');

// Categorie Staff permanente : le salon vocal SERVICE STAFF y est toujours
// visible pour Moderateur/Administrateur (sert de declencheur), les autres
// salons de la categorie ne sont visibles que via le role "Staff Actif",
// bascule quand un staff rejoint puis quitte SERVICE STAFF (cf staffToggle.js).
async function ensureStaffCategory(guild) {
  let config = await guildConfigStore.find(guild.id);

  let staffActifRole = config?.staffActifRoleId
    ? await guild.roles.fetch(config.staffActifRoleId).catch(() => null)
    : null;
  if (!staffActifRole) {
    staffActifRole = await guild.roles.create({
      name: '🔓 Staff Actif', hoist: false, mentionable: false, permissions: [],
    });
    await guildConfigStore.upsert(guild.id, { staffActifRoleId: staffActifRole.id });
    config = await guildConfigStore.find(guild.id);
  }

  let category = config?.staffCategoryId
    ? await guild.channels.fetch(config.staffCategoryId).catch(() => null)
    : null;
  if (!category) {
    category = await guild.channels.create({
      name: `🛡️ ${toSmallCaps('Staff')}`,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [P.ViewChannel] }],
    });
    await guildConfigStore.upsert(guild.id, { staffCategoryId: category.id });
    config = await guildConfigStore.find(guild.id);
  }

  let serviceStaffChannel = config?.serviceStaffChannelId
    ? await guild.channels.fetch(config.serviceStaffChannelId).catch(() => null)
    : null;
  if (!serviceStaffChannel) {
    const overwrites = [{ id: guild.roles.everyone.id, deny: [P.ViewChannel, P.Connect] }];
    if (config?.moderateurRoleId) overwrites.push({ id: config.moderateurRoleId, allow: [P.ViewChannel, P.Connect] });
    if (config?.adminRoleId) overwrites.push({ id: config.adminRoleId, allow: [P.ViewChannel, P.Connect] });

    serviceStaffChannel = await guild.channels.create({
      name: 'SERVICE STAFF',
      type: ChannelType.GuildVoice,
      parent: category.id,
      permissionOverwrites: overwrites,
    });
    await guildConfigStore.upsert(guild.id, { serviceStaffChannelId: serviceStaffChannel.id });
  }

  return { category, serviceStaffChannel, staffActifRoleId: staffActifRole.id };
}

// Permissions standard pour un salon "cache par defaut, revele via le role
// Staff Actif" a l'interieur de la categorie Staff.
function toggleOnlyOverwrites(guild, staffActifRoleId, extraAllow = []) {
  return [
    { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
    { id: staffActifRoleId, allow: [P.ViewChannel, P.ReadMessageHistory, ...extraAllow] },
  ];
}

module.exports = { ensureStaffCategory, toggleOnlyOverwrites };
