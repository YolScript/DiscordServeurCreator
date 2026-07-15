const { ChannelType } = require('discord.js');
const guildConfigStore = require('../../../kv/guildConfigStore');
const gameRoleStore = require('../../../kv/gameRoleStore');
const moderationConfigStore = require('../../../kv/moderationConfigStore');

// Serveur de reference par defaut : "ServeurCreator" est administre a la
// main et sert de modele vivant. Au lieu d'un snapshot fige, /setup relit sa
// structure REELLE a chaque utilisation (roles, categories, salons, textes)
// -> le template reste automatiquement a jour sans synchronisation a
// maintenir. N'importe quel serveur configure par le bot peut aussi servir
// de source (cf templateRegistryStore) : buildLiveTemplate accepte alors son
// guildId a la place de cette constante.
const SOURCE_GUILD_ID = '1526242972989915307';

// Roles "de base" du template, dans l'ordre du haut vers le bas (identique a
// l'ancien ROLE_BLUEPRINT statique commun.js, mais lu en direct). Les roles
// de jeu (gameRoleStore) et les roles "managed" (integrations/bots, jamais
// recreables via l'API) sont geres a part, jamais inclus ici.
const BASE_ROLE_CONFIG_KEYS = {
  bot: 'botRoleId',
  administrateur: 'adminRoleId',
  moderateur: 'moderateurRoleId',
  streameur: 'streameurRoleId',
  contributeur: 'contributeurRoleId',
  follow: 'followRoleId',
  verifie: 'verifieRoleId',
  reglementValidated: 'reglementValidatedRoleId',
  plus16: 'plus16RoleId',
  minus16: 'minus16RoleId',
};

// Categories creees/gerees dynamiquement par des modules dedies (staff,
// jeux, tickets) : jamais dupliquees telles quelles, elles seront
// regenerees par leurs propres fonctions ensureX apres la creation de base.
function excludedIds(sourceConfig) {
  return {
    categories: new Set([
      sourceConfig.staffCategoryId, sourceConfig.gamesCategoryId, sourceConfig.ticketCategoryId,
    ].filter(Boolean)),
    channels: new Set([
      sourceConfig.publicVoiceCreatorChannelId, sourceConfig.staffChatChannelId,
      sourceConfig.gameVoiceCreatorChannelId, sourceConfig.serviceStaffChannelId,
      sourceConfig.staffVoiceCreatorChannelId,
    ].filter(Boolean)),
  };
}

// Traduit les permission overwrites source (qui referencent des IDs de role
// du serveur de reference) vers le serveur nouvellement cree. Toute
// permission overwrite qui reference un role non traduisible (role custom,
// managed/integration, role dynamique exclu) est simplement ignoree plutot
// que de faire echouer toute la creation.
function toBigIntBits(value) {
  if (typeof value === 'bigint') return value;
  if (value && typeof value.bitfield === 'bigint') return value.bitfield;
  if (value === undefined || value === null) return 0n;
  return BigInt(value);
}

function translateOverwrites(sourceOverwrites, roleIdToKey, roleIds) {
  const result = [];
  for (const ow of sourceOverwrites || []) {
    const key = roleIdToKey[ow.id];
    const targetId = key && roleIds[key];
    if (!targetId) continue;
    result.push({ id: targetId, allow: toBigIntBits(ow.allow), deny: toBigIntBits(ow.deny) });
  }
  return result;
}

async function buildLiveTemplate(client, sourceGuildId = SOURCE_GUILD_ID, label) {
  const sourceGuild = await client.guilds.fetch(sourceGuildId).catch(() => null);
  if (!sourceGuild) throw new Error("Serveur source introuvable (le bot n'y est peut-etre plus).");
  const sourceConfig = await guildConfigStore.find(sourceGuildId);
  if (!sourceConfig) throw new Error('Serveur source introuvable ou non configure.');

  const allRoles = await sourceGuild.roles.fetch();
  const roleIdToKey = { [sourceGuildId]: 'everyone' };
  const ROLE_BLUEPRINT = [];
  for (const [key, configField] of Object.entries(BASE_ROLE_CONFIG_KEYS)) {
    const role = allRoles.get(sourceConfig[configField]);
    if (!role) continue;
    roleIdToKey[role.id] = key;
    ROLE_BLUEPRINT.push({
      key, name: role.name, color: role.color, hoist: role.hoist, mentionable: role.mentionable,
      permissions: role.permissions.toArray(),
    });
  }

  const gameRoles = (await gameRoleStore.list(sourceGuildId))
    .filter((r) => allRoles.get(r.roleId) && !allRoles.get(r.roleId).managed);

  const { categories: excludedCategoryIds, channels: excludedChannelIds } = excludedIds(sourceConfig);
  const allChannels = await sourceGuild.channels.fetch();
  const categoryChannels = [...allChannels.values()]
    .filter((c) => c && c.type === ChannelType.GuildCategory && !excludedCategoryIds.has(c.id))
    .sort((a, b) => a.position - b.position);

  const categoryBlueprintSource = categoryChannels.map((cat) => ({
    key: cat.id,
    name: cat.name,
    sourceOverwrites: cat.permissionOverwrites?.cache ? [...cat.permissionOverwrites.cache.values()] : cat.permissionOverwrites,
    channels: [...allChannels.values()]
      .filter((c) => c && c.parentId === cat.id && !excludedChannelIds.has(c.id)
        && (c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice))
      .sort((a, b) => a.position - b.position)
      .map((ch) => ({
        key: ch.id,
        name: ch.name,
        type: ch.type,
        sourceOverwrites: ch.permissionOverwrites?.cache ? [...ch.permissionOverwrites.cache.values()] : ch.permissionOverwrites,
      })),
  }));

  function getChannelBlueprint(roleIds) {
    return categoryBlueprintSource.map((cat) => ({
      key: cat.key,
      name: cat.name,
      permissionOverwrites: translateOverwrites(cat.sourceOverwrites, roleIdToKey, roleIds),
      channels: cat.channels.map((ch) => ({
        key: ch.key,
        name: ch.name,
        type: ch.type,
        permissionOverwrites: translateOverwrites(ch.sourceOverwrites, roleIdToKey, roleIds),
      })),
    }));
  }

  return {
    key: 'live',
    label: label || `Copie de ${sourceGuild.name} (a jour)`,
    ROLE_BLUEPRINT,
    getChannelBlueprint,
    specialKeys: {
      reglement: sourceConfig.rulesChannelId,
      arrivalDeparture: sourceConfig.arrivalDepartureChannelId,
      roles: sourceConfig.rolesChannelId,
      vocaux: sourceConfig.vocauxCategoryId,
    },
    gameRoles,
    guildIconURL: sourceGuild.iconURL({ size: 256, extension: 'png' }),
    content: {
      reglementText: sourceConfig.reglementText,
      welcomeMessageTemplate: sourceConfig.welcomeMessageTemplate,
      leaveMessageTemplate: sourceConfig.leaveMessageTemplate,
      captchaEnabled: sourceConfig.captchaEnabled,
      reglementTranslations: sourceConfig.reglementTranslations,
    },
    modConfig: await moderationConfigStore.find(sourceGuildId),
  };
}

module.exports = { SOURCE_GUILD_ID, buildLiveTemplate };
