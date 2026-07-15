const { ChannelType, PermissionFlagsBits: P } = require('discord.js');
const guildConfigStore = require('../../kv/guildConfigStore');
const gameRoleStore = require('../../kv/gameRoleStore');
const { toSmallCaps } = require('../../shared/smallCaps');

// Categorie Jeux : un salon textuel prive par role de jeu (visible seulement
// par ceux qui l'ont), plus un salon declencheur "Creer un vocal" permanent
// (cf gameVoiceCreator.js) pour les groupes de jeu.
async function ensureGamesCategory(guild) {
  let config = await guildConfigStore.find(guild.id);

  let category = config?.gamesCategoryId
    ? await guild.channels.fetch(config.gamesCategoryId).catch(() => null)
    : null;
  if (!category) {
    category = await guild.channels.create({ name: `🎮 ${toSmallCaps('Jeux')}`, type: ChannelType.GuildCategory });
    await guildConfigStore.upsert(guild.id, { gamesCategoryId: category.id });
    config = await guildConfigStore.find(guild.id);
  }

  let creatorChannel = config?.gameVoiceCreatorChannelId
    ? await guild.channels.fetch(config.gameVoiceCreatorChannelId).catch(() => null)
    : null;
  if (!creatorChannel) {
    creatorChannel = await guild.channels.create({
      name: '➕ Creer un vocal', type: ChannelType.GuildVoice, parent: category.id,
    });
    await guildConfigStore.upsert(guild.id, { gameVoiceCreatorChannelId: creatorChannel.id });
  }

  return { category, creatorChannel };
}

// Cree un salon textuel pour chaque role de jeu qui n'en a pas encore, et
// supprime ceux dont le role de jeu associe a ete supprime. Appele par
// gameRolesSync des que la liste des roles de jeu change (preset dashboard OU
// detection auto par presence).
async function syncGameChannels(guild) {
  const roles = await gameRoleStore.list(guild.id);
  const { category } = await ensureGamesCategory(guild);

  let changed = false;
  for (const role of roles) {
    const existing = role.channelId ? await guild.channels.fetch(role.channelId).catch(() => null) : null;
    if (existing) continue;

    const channel = await guild.channels.create({
      name: toSmallCaps(role.displayName),
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
        { id: role.roleId, allow: [P.ViewChannel, P.ReadMessageHistory] },
      ],
    });
    role.channelId = channel.id;
    changed = true;
  }

  const validChannelIds = new Set(roles.map((r) => r.channelId).filter(Boolean));
  const gameTextChannels = guild.channels.cache.filter((c) => c.parentId === category.id && c.type === ChannelType.GuildText);
  for (const channel of gameTextChannels.values()) {
    if (!validChannelIds.has(channel.id)) await channel.delete().catch(() => {});
  }

  if (changed) await gameRoleStore.replaceAll(guild.id, roles);
}

module.exports = { ensureGamesCategory, syncGameChannels };
