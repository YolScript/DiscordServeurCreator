const {
  ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const guildConfigStore = require('../../kv/guildConfigStore');
const { getTemplate } = require('./templates');
const { REGLEMENT_ACCEPT, AGE_PLUS16, AGE_MINUS16 } = require('../interactions/customIds');
const logger = require('../../shared/logger');

class AlreadySetupError extends Error {}
class InsufficientRoleHeadroomError extends Error {}

async function setupGuild({ guild, templateKey, requestedByUserId, reglementText }) {
  const existing = await guildConfigStore.find(guild.id);
  if (existing) {
    throw new AlreadySetupError('Ce serveur a deja ete configure. Utilise le dashboard pour le modifier.');
  }

  const template = getTemplate(templateKey);
  const roleCount = template.ROLE_BLUEPRINT.length;

  // Le bot n'est plus owner (il a ete invite classiquement) : toute action de
  // gestion de roles reste bornee par la position de SON PROPRE role le plus
  // haut (regle de hierarchie Discord, Administrator ne bypasse pas ca). On
  // verifie qu'il y a assez de marge avant de commencer, plutot que d'echouer
  // a mi-chemin avec une structure a moitie construite.
  const botCeiling = guild.members.me.roles.highest.position;
  if (botCeiling < roleCount + 1) {
    throw new InsufficientRoleHeadroomError(
      `Le role du bot est trop bas dans la hierarchie du serveur (position ${botCeiling}). ` +
      `Va dans Parametres du serveur > Roles et fais glisser le role du bot au-dessus des ` +
      `roles standards (au moins ${roleCount + 1} crans au-dessus de @everyone), puis relance /setup.`,
    );
  }

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
  // Les positions restent toujours strictement en-dessous de botCeiling : le bot
  // ne peut jamais positionner un role au-dessus de son propre role le plus haut.
  const orderedKeys = template.ROLE_BLUEPRINT.map((r) => r.key).reverse(); // bas -> haut
  const startPosition = botCeiling - orderedKeys.length;
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

  // Contenu initial : embed reglement + bouton, puis boutons +16/-16.
  const reglementEmbed = new EmbedBuilder()
    .setTitle('Reglement du serveur')
    .setDescription(reglementText || 'Reglement a definir depuis le dashboard.')
    .setColor(0xe63946);
  const reglementRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(REGLEMENT_ACCEPT).setLabel("J'accepte le reglement").setStyle(ButtonStyle.Success),
  );
  await channelObjects.reglement.send({ embeds: [reglementEmbed], components: [reglementRow] });

  const ageEmbed = new EmbedBuilder()
    .setTitle('Verification age (obligatoire)')
    .setDescription("Selectionne ta tranche d'age pour acceder au serveur.")
    .setColor(0x5a189a);
  const ageRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(AGE_PLUS16).setLabel('+16').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(AGE_MINUS16).setLabel('-16').setStyle(ButtonStyle.Secondary),
  );
  await channelObjects.roles.send({ embeds: [ageEmbed], components: [ageRow] });

  const config = await guildConfigStore.upsert(guild.id, {
    requestedByUserId,
    template: templateKey,
    reglementText: reglementText || '',
    welcomeMessageTemplate: 'Bienvenue {user} sur {server} !',
    leaveMessageTemplate: '{username} a quitte le serveur.',
    arrivalDepartureChannelId: channelObjects['arrivee-depart'].id,
    rulesChannelId: channelObjects.reglement.id,
    rolesChannelId: channelObjects.roles.id,
    vocauxCategoryId: channelObjects.vocaux.id,
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

  logger.info(`Serveur ${guild.id} configure (template ${templateKey}) par ${requestedByUserId}`);
  return { guild, config };
}

module.exports = { setupGuild, AlreadySetupError, InsufficientRoleHeadroomError };
