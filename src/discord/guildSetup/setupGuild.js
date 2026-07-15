const {
  ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const guildConfigStore = require('../../kv/guildConfigStore');
const gameRoleStore = require('../../kv/gameRoleStore');
const moderationConfigStore = require('../../kv/moderationConfigStore');
const { getTemplate } = require('./templates');
const { DEFAULT_REGLEMENT_TEXT } = require('./defaultReglement');
const { AGE_PLUS16, AGE_MINUS16 } = require('../interactions/customIds');
const { postReglementPanel } = require('../roles/reglementPanel');
const { ensureStaffCategory } = require('../roles/staffCategory');
const { ensureGamesCategory, syncGameChannels } = require('../roles/gameChannels');
const { ensurePublicVoiceCreator } = require('../roles/publicVoiceManager');
const rolesMessageManager = require('../roles/rolesMessageManager');
const { colorForGameIndex } = require('./colors');
const logger = require('../../shared/logger');

class AlreadySetupError extends Error {}

// Recree sur la nouvelle guilde les roles de jeu du serveur de reference
// (colorHex/colorIndex/gameKey conserves), positionnes juste au-dessus de
// -16, et les enregistre dans gameRoleStore : sans ca ils existeraient sur
// Discord mais seraient invisibles pour gameRolesSync (pas de salon #jeux
// dedie, pas d'entree dans le select menu #roles).
async function replicateGameRoles(guild, sourceGameRoles, minus16Role) {
  for (const sourceRole of sourceGameRoles) {
    const currentRoles = await gameRoleStore.list(guild.id);
    const colorIndex = currentRoles.length;
    const colorHex = sourceRole.colorHex || colorForGameIndex(colorIndex);
    const role = await guild.roles.create({
      name: sourceRole.displayName.slice(0, 100), color: colorHex, hoist: false, mentionable: false,
    });
    await role.setPosition(minus16Role.position + 1).catch(() => {});
    await gameRoleStore.add(guild.id, {
      gameKey: sourceRole.gameKey, displayName: sourceRole.displayName, roleId: role.id, colorHex, colorIndex,
    });
  }
}

async function setupGuild({ guild, templateKey, requestedByUserId, reglementText }) {
  const existing = await guildConfigStore.find(guild.id);
  if (existing) {
    throw new AlreadySetupError('Ce serveur a deja ete configure. Utilise le dashboard pour le modifier.');
  }

  const template = await getTemplate(templateKey, guild.client);

  // Le bot n'est plus owner (il a ete invite classiquement) : toute action de
  // gestion de roles reste bornee par la position de SON PROPRE role le plus
  // haut (regle de hierarchie Discord, Administrator ne bypasse pas ca). Pas
  // de verification de marge ici : Discord ne peut de toute facon jamais
  // laisser le bot creer un role au-dessus de son propre role, donc le role
  // du bot se retrouve mecaniquement pousse au-dessus de tout ce qu'il vient
  // de creer. On recalcule sa position REELLE apres coup (ligne ~50) plutot
  // que de deviner une marge avant meme que les roles existent.

  // Creation sequentielle de tous les roles de base (pas de Promise.all - rate limits).
  const roleObjects = {};
  for (const roleSpec of template.ROLE_BLUEPRINT) {
    const role = await guild.roles.create({
      name: roleSpec.name,
      color: roleSpec.color,
      hoist: roleSpec.hoist,
      mentionable: roleSpec.mentionable,
      permissions: roleSpec.permissions,
    });
    roleObjects[roleSpec.key] = role;
  }

  // Reordonnancement en un seul appel bulk (l'ordre a la creation n'est pas fiable).
  // On relit la position REELLE du role du bot maintenant que les 10 roles
  // existent : Discord l'a forcement poussee au-dessus d'eux au fil des
  // creations (impossible pour le bot de creer un role au-dessus de lui-meme).
  await guild.members.fetch(guild.members.me.id);
  const botCeiling = guild.members.me.roles.highest.position;
  const orderedKeys = template.ROLE_BLUEPRINT.map((r) => r.key).reverse(); // bas -> haut
  const startPosition = Math.max(1, botCeiling - orderedKeys.length);
  await guild.roles.setPositions(
    orderedKeys.map((key, idx) => ({ role: roleObjects[key].id, position: startPosition + idx })),
  ).catch(async (err) => {
    logger.warn('setPositions en bulk a echoue, fallback un par un', err.message);
    for (let idx = 0; idx < orderedKeys.length; idx += 1) {
      await roleObjects[orderedKeys[idx]].setPosition(startPosition + idx).catch(() => {});
    }
  });

  // Le bot porte aussi son role interne, pour rester garanti au-dessus des
  // roles qu'il gere a l'execution (Reglement valide, +16/-16, roles de jeu).
  await guild.members.me.roles.add(roleObjects.bot.id);

  const roleIds = {
    everyone: guild.roles.everyone.id,
    ...Object.fromEntries(Object.entries(roleObjects).map(([key, role]) => [key, role.id])),
  };

  // Creation sequentielle des categories puis des salons enfants. Setup
  // purement additif : on ne touche jamais aux salons/roles preexistants.
  const channelObjects = {};
  for (const categorySpec of template.getChannelBlueprint(roleIds)) {
    const category = await guild.channels.create({
      name: categorySpec.name,
      type: ChannelType.GuildCategory,
      permissionOverwrites: categorySpec.permissionOverwrites,
    });
    channelObjects[categorySpec.key] = category;

    for (const channelSpec of categorySpec.channels) {
      const channel = await guild.channels.create({
        name: channelSpec.name,
        type: channelSpec.type,
        parent: category.id,
        permissionOverwrites: channelSpec.permissionOverwrites,
      });
      channelObjects[channelSpec.key] = channel;
    }
  }

  const reglementChannel = channelObjects[template.specialKeys.reglement];
  const arrivalChannel = channelObjects[template.specialKeys.arrivalDeparture];
  const rolesChannel = channelObjects[template.specialKeys.roles];

  // Boutons +16/-16 (le reglement lui-meme est poste plus bas, une fois la
  // config enregistree, via postReglementPanel).
  const ageEmbed = new EmbedBuilder()
    .setTitle('Verification age (obligatoire)')
    .setDescription("Selectionne ta tranche d'age pour acceder au serveur.")
    .setColor(0x5a189a);
  const ageRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(AGE_PLUS16).setLabel('+16').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(AGE_MINUS16).setLabel('-16').setStyle(ButtonStyle.Secondary),
  );
  if (rolesChannel) await rolesChannel.send({ embeds: [ageEmbed], components: [ageRow] });

  const finalReglementText = reglementText || template.content?.reglementText || DEFAULT_REGLEMENT_TEXT;

  const config = await guildConfigStore.upsert(guild.id, {
    requestedByUserId,
    template: templateKey,
    reglementText: finalReglementText,
    welcomeMessageTemplate: template.content?.welcomeMessageTemplate || 'Bienvenue {user} sur {server} !',
    leaveMessageTemplate: template.content?.leaveMessageTemplate || '{username} a quitte le serveur.',
    captchaEnabled: template.content?.captchaEnabled !== false,
    reglementTranslations: template.content?.reglementTranslations || undefined,
    arrivalDepartureChannelId: arrivalChannel?.id,
    rulesChannelId: reglementChannel?.id,
    rolesChannelId: rolesChannel?.id,
    vocauxCategoryId: channelObjects[template.specialKeys.vocaux]?.id,
    botRoleId: roleObjects.bot.id,
    adminRoleId: roleObjects.administrateur.id,
    moderateurRoleId: roleObjects.moderateur.id,
    streameurRoleId: roleObjects.streameur.id,
    contributeurRoleId: roleObjects.contributeur.id,
    followRoleId: roleObjects.follow.id,
    verifieRoleId: roleObjects.verifie.id,
    reglementValidatedRoleId: roleObjects.reglementValidated.id,
    plus16RoleId: roleObjects.plus16.id,
    minus16RoleId: roleObjects.minus16.id,
  });

  if (reglementChannel) await postReglementPanel(guild).catch((err) => logger.error('postReglementPanel initial', err));

  if (template.modConfig) {
    await moderationConfigStore.upsert(guild.id, template.modConfig).catch((err) => logger.error('moderationConfigStore.upsert initial', err));
  }

  if (template.guildIconURL) {
    await guild.setIcon(template.guildIconURL).catch((err) => logger.warn('guild.setIcon initial a echoue', err.message));
  }

  if (template.gameRoles?.length) {
    await replicateGameRoles(guild, template.gameRoles, roleObjects.minus16).catch((err) => logger.error('replicateGameRoles', err));
    await rolesMessageManager.refresh(guild).catch((err) => logger.error('rolesMessageManager.refresh initial', err));
  }

  // Structures dynamiques (staff/jeux/vocal public) : memes fonctions que
  // celles rappelees a chaque redemarrage pour les guildes existantes.
  await ensureStaffCategory(guild).catch((err) => logger.error('ensureStaffCategory initial', err));
  await ensureGamesCategory(guild).catch((err) => logger.error('ensureGamesCategory initial', err));
  await syncGameChannels(guild).catch((err) => logger.error('syncGameChannels initial', err));
  await ensurePublicVoiceCreator(guild).catch((err) => logger.error('ensurePublicVoiceCreator initial', err));

  logger.info(`Serveur ${guild.id} configure (template ${templateKey}) par ${requestedByUserId}`);
  return {
    guild, config: await guildConfigStore.find(guild.id), templateLabel: template.label,
  };
}

module.exports = { setupGuild, AlreadySetupError };
