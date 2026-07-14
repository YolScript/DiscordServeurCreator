const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { TEMPLATES } = require('./guildSetup/templates');

const setupCommand = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Configure ce serveur avec un template (salons, roles, permissions).')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((option) => {
    option.setName('template').setDescription('Template a appliquer').setRequired(true);
    for (const template of Object.values(TEMPLATES)) {
      option.addChoices({ name: template.label, value: template.key });
    }
    return option;
  })
  .addStringOption((option) => option
    .setName('reglement')
    .setDescription('Texte du reglement (modifiable ensuite depuis le dashboard)')
    .setRequired(false))
  .toJSON();

const warnCommand = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('Avertit un membre.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((o) => o.setName('membre').setDescription('Membre a avertir').setRequired(true))
  .addStringOption((o) => o.setName('raison').setDescription('Raison de l\'avertissement').setRequired(true))
  .toJSON();

const warningsCommand = new SlashCommandBuilder()
  .setName('warnings')
  .setDescription('Affiche les avertissements d\'un membre.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((o) => o.setName('membre').setDescription('Membre a consulter').setRequired(true))
  .toJSON();

const clearwarnsCommand = new SlashCommandBuilder()
  .setName('clearwarns')
  .setDescription('Reinitialise les avertissements d\'un membre.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((o) => o.setName('membre').setDescription('Membre a reinitialiser').setRequired(true))
  .toJSON();

const timeoutCommand = new SlashCommandBuilder()
  .setName('timeout')
  .setDescription('Met un membre en timeout.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((o) => o.setName('membre').setDescription('Membre a timeout').setRequired(true))
  .addIntegerOption((o) => o.setName('minutes').setDescription('Duree en minutes').setRequired(true).setMinValue(1).setMaxValue(40320))
  .addStringOption((o) => o.setName('raison').setDescription('Raison').setRequired(false))
  .toJSON();

const unlockCommand = new SlashCommandBuilder()
  .setName('unlock')
  .setDescription('Leve le verrouillage anti-raid.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .toJSON();

const automodCommand = new SlashCommandBuilder()
  .setName('automod')
  .setDescription('Configure l\'auto-moderation.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addSubcommand((s) => s.setName('addword').setDescription('Ajoute un mot interdit')
    .addStringOption((o) => o.setName('mot').setDescription('Mot a interdire').setRequired(true)))
  .addSubcommand((s) => s.setName('removeword').setDescription('Retire un mot interdit')
    .addStringOption((o) => o.setName('mot').setDescription('Mot a retirer').setRequired(true)))
  .addSubcommand((s) => s.setName('addkeyword').setDescription('Ajoute un mot-cle d\'alerte staff')
    .addStringOption((o) => o.setName('mot').setDescription('Mot-cle a surveiller').setRequired(true)))
  .addSubcommand((s) => s.setName('removekeyword').setDescription('Retire un mot-cle d\'alerte')
    .addStringOption((o) => o.setName('mot').setDescription('Mot-cle a retirer').setRequired(true)))
  .addSubcommand((s) => s.setName('toggle-invites').setDescription('Active/desactive le blocage des invitations Discord')
    .addBooleanOption((o) => o.setName('actif').setDescription('Activer ?').setRequired(true)))
  .addSubcommand((s) => s.setName('toggle-links').setDescription('Active/desactive le blocage des liens externes')
    .addBooleanOption((o) => o.setName('actif').setDescription('Activer ?').setRequired(true)))
  .addSubcommand((s) => s.setName('status').setDescription('Affiche la config auto-mod actuelle'))
  .toJSON();

const scheduleAnnouncementCommand = new SlashCommandBuilder()
  .setName('schedule-announcement')
  .setDescription('Programme une annonce (unique ou recurrente).')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addChannelOption((o) => o.setName('salon').setDescription('Salon de destination').addChannelTypes(ChannelType.GuildText).setRequired(true))
  .addStringOption((o) => o.setName('message').setDescription('Contenu du message').setRequired(true))
  .addIntegerOption((o) => o.setName('delai_minutes').setDescription('Dans combien de minutes').setRequired(true).setMinValue(1))
  .addIntegerOption((o) => o.setName('repeter_minutes').setDescription('Repeter toutes les X minutes (optionnel)').setRequired(false).setMinValue(1))
  .toJSON();

const scheduleEventCommand = new SlashCommandBuilder()
  .setName('schedule-event')
  .setDescription('Programme un evenement avec rappel automatique.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addChannelOption((o) => o.setName('salon').setDescription('Salon de destination').addChannelTypes(ChannelType.GuildText).setRequired(true))
  .addStringOption((o) => o.setName('nom').setDescription('Nom de l\'evenement').setRequired(true))
  .addIntegerOption((o) => o.setName('delai_minutes').setDescription('Dans combien de minutes commence l\'evenement').setRequired(true).setMinValue(1))
  .addIntegerOption((o) => o.setName('rappel_minutes').setDescription('Rappel X minutes avant (optionnel)').setRequired(false).setMinValue(1))
  .toJSON();

const scheduledListCommand = new SlashCommandBuilder()
  .setName('scheduled-list')
  .setDescription('Liste les annonces/evenements programmes.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .toJSON();

const scheduledCancelCommand = new SlashCommandBuilder()
  .setName('scheduled-cancel')
  .setDescription('Annule une annonce/evenement programme.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((o) => o.setName('id').setDescription('ID (voir /scheduled-list)').setRequired(true))
  .toJSON();

module.exports = [
  setupCommand, warnCommand, warningsCommand, clearwarnsCommand, timeoutCommand, unlockCommand, automodCommand,
  scheduleAnnouncementCommand, scheduleEventCommand, scheduledListCommand, scheduledCancelCommand,
];
