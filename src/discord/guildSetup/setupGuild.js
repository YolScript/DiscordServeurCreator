const {
  ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const guildConfigStore = require('../../kv/guildConfigStore');
const { getTemplate } = require('./templates');
const { DEFAULT_REGLEMENT_TEXT } = require('./defaultReglement');
const { REGLEMENT_ACCEPT, REGLEMENT_TRANSLATE, AGE_PLUS16, AGE_MINUS16 } = require('../interactions/customIds');
const logger = require('../../shared/logger');

class AlreadySetupError extends Error {}

async function setupGuild({ guild, templateKey, requestedByUserId, reglementText }) {
  const existing = await guildConfigStore.find(guild.id);
  if (existing) {
    throw new AlreadySetupError('Ce serveur a deja ete configure. Utilise le dashboard pour le modifier.');
  }

  const template = getTemplate(templateKey);

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

  // Contenu initial : embed reglement + bouton, puis boutons +16/-16.
  const finalReglementText = reglementText || DEFAULT_REGLEMENT_TEXT;
  const reglementEmbed = new EmbedBuilder()
    .setTitle('Reglement du serveur')
    .setDescription(finalReglementText)
    .setColor(0xe63946);
  const reglementRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(REGLEMENT_ACCEPT).setLabel("J'accepte le reglement").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(REGLEMENT_TRANSLATE).setLabel('Autres langues').setEmoji('🌐').setStyle(ButtonStyle.Secondary),
  );
  const reglementMessage = await channelObjects.reglement.send({ embeds: [reglementEmbed], components: [reglementRow] });

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
    reglementText: finalReglementText,
    welcomeMessageTemplate: 'Bienvenue {user} sur {server} !',
    leaveMessageTemplate: '{username} a quitte le serveur.',
    arrivalDepartureChannelId: channelObjects['arrivee-depart'].id,
    rulesChannelId: channelObjects.reglement.id,
    reglementMessageId: reglementMessage.id,
    rolesChannelId: channelObjects.roles.id,
    vocauxCategoryId: channelObjects.vocaux.id,
    publicVoiceBaseChannelIds: [channelObjects['vocal-public-1'].id, channelObjects['vocal-public-2'].id],
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

module.exports = { setupGuild, AlreadySetupError };
