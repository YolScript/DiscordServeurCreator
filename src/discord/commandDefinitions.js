const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType, ContextMenuCommandBuilder, ApplicationCommandType,
} = require('discord.js');

// Signalement par clic droit sur un message (roadmap n°147).
const reportMessageCommand = new ContextMenuCommandBuilder()
  .setName('Signaler au staff')
  .setType(ApplicationCommandType.Message)
  .toJSON();

// Reponses pre-ecrites (roadmap n°159).
const cannedResponseCommand = new SlashCommandBuilder()
  .setName('reponse')
  .setDescription('Poste une reponse pre-ecrite configuree dans le dashboard.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addStringOption((o) => o.setName('nom').setDescription('Nom de la reponse (tape pour rechercher)').setRequired(true).setAutocomplete(true))
  .toJSON();

// Resume de configuration (roadmap n°183).
const configSummaryCommand = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Resume ce qui est configure sur ce serveur.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .toJSON();

// Aide interactive (roadmap n°182).
const helpCommand = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Liste les commandes du bot par categorie.')
  .toJSON();

const setupCommand = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Configure ce serveur avec un template (salons, roles, permissions).')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((option) => option
    .setName('template')
    .setDescription('Template a appliquer (tape pour rechercher)')
    .setRequired(true)
    .setAutocomplete(true))
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

const tempbanCommand = new SlashCommandBuilder()
  .setName('tempban')
  .setDescription('Bannit temporairement un membre (deban automatique).')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption((o) => o.setName('membre').setDescription('Membre a bannir').setRequired(true))
  .addIntegerOption((o) => o.setName('duree_heures').setDescription('Duree du ban en heures').setRequired(true).setMinValue(1))
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
  .addStringOption((o) => o.setName('id').setDescription('ID (tape pour rechercher)').setRequired(true).setAutocomplete(true))
  .toJSON();

const reglementTranslationCommand = new SlashCommandBuilder()
  .setName('reglement-translation')
  .setDescription('Gere les traductions du reglement.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) => s.setName('set').setDescription('Definit une traduction')
    .addStringOption((o) => o.setName('langue').setDescription('Code langue (ex: en, es)').setRequired(true))
    .addStringOption((o) => o.setName('texte').setDescription('Texte traduit').setRequired(true)))
  .addSubcommand((s) => s.setName('remove').setDescription('Retire une traduction')
    .addStringOption((o) => o.setName('langue').setDescription('Code langue a retirer').setRequired(true)))
  .addSubcommand((s) => s.setName('list').setDescription('Liste les langues disponibles'))
  .toJSON();

const streamerLinkCommand = new SlashCommandBuilder()
  .setName('streamer-link')
  .setDescription('Lie un membre a une chaine Twitch/YouTube pour les notifs de live.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((o) => o.setName('plateforme').setDescription('Plateforme').setRequired(true)
    .addChoices({ name: 'Twitch', value: 'twitch' }, { name: 'YouTube', value: 'youtube' }))
  .addUserOption((o) => o.setName('membre').setDescription('Membre a lier').setRequired(true))
  .addStringOption((o) => o.setName('identifiant').setDescription('Login Twitch OU ID de chaine YouTube').setRequired(true))
  .toJSON();

const streamerUnlinkCommand = new SlashCommandBuilder()
  .setName('streamer-unlink')
  .setDescription('Retire un lien Twitch/YouTube.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((o) => o.setName('plateforme').setDescription('Plateforme').setRequired(true)
    .addChoices({ name: 'Twitch', value: 'twitch' }, { name: 'YouTube', value: 'youtube' }))
  .addUserOption((o) => o.setName('membre').setDescription('Membre a delier').setRequired(true))
  .toJSON();

const streamerListCommand = new SlashCommandBuilder()
  .setName('streamer-list')
  .setDescription('Liste les streamers lies.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .toJSON();

const rankCommand = new SlashCommandBuilder()
  .setName('rank')
  .setDescription('Affiche ton niveau/XP (ou celui d\'un membre).')
  .addUserOption((o) => o.setName('membre').setDescription('Membre a consulter').setRequired(false))
  .toJSON();

const leaderboardCommand = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Classement XP du serveur.')
  .toJSON();

const levelroleCommand = new SlashCommandBuilder()
  .setName('levelrole')
  .setDescription('Configure les roles automatiques par palier de niveau.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) => s.setName('set').setDescription('Definit un palier')
    .addIntegerOption((o) => o.setName('niveau').setDescription('Niveau requis').setRequired(true).setMinValue(1))
    .addRoleOption((o) => o.setName('role').setDescription('Role a attribuer').setRequired(true)))
  .addSubcommand((s) => s.setName('remove').setDescription('Retire un palier')
    .addIntegerOption((o) => o.setName('niveau').setDescription('Niveau a retirer').setRequired(true)))
  .addSubcommand((s) => s.setName('list').setDescription('Liste les paliers configures'))
  .toJSON();

const pollCommand = new SlashCommandBuilder()
  .setName('poll')
  .setDescription('Lance un sondage avec boutons (5 options max).')
  .addStringOption((o) => o.setName('question').setDescription('Question posee').setRequired(true))
  .addStringOption((o) => o.setName('options').setDescription('Options separees par des virgules (2 a 5)').setRequired(true))
  .addIntegerOption((o) => o.setName('duree_minutes').setDescription('Duree du sondage en minutes (omis = sans limite de temps)').setRequired(false).setMinValue(1))
  .toJSON();

const giveawayCommand = new SlashCommandBuilder()
  .setName('giveaway')
  .setDescription('Lance un giveaway avec bouton de participation.')
  .addStringOption((o) => o.setName('prix').setDescription('Ce qui est a gagner').setRequired(true))
  .addIntegerOption((o) => o.setName('duree_minutes').setDescription('Duree en minutes').setRequired(true).setMinValue(1))
  .addIntegerOption((o) => o.setName('gagnants').setDescription('Nombre de gagnants (defaut 1)').setRequired(false).setMinValue(1))
  .addRoleOption((o) => o.setName('role_requis').setDescription('Role obligatoire pour participer (optionnel)').setRequired(false))
  .toJSON();

const giveawayRerollCommand = new SlashCommandBuilder()
  .setName('giveaway-reroll')
  .setDescription('Tire de nouveaux gagnants pour un giveaway termine.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((o) => o.setName('message_id').setDescription('ID du message du giveaway (clic droit sur le message > Copier l\'ID)').setRequired(true))
  .toJSON();

const invitesCommand = new SlashCommandBuilder()
  .setName('invites')
  .setDescription('Affiche le nombre d\'invitations d\'un membre.')
  .addUserOption((o) => o.setName('membre').setDescription('Membre a consulter').setRequired(false))
  .toJSON();

const referralroleCommand = new SlashCommandBuilder()
  .setName('referralrole')
  .setDescription('Configure les roles automatiques par nombre d\'invitations.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) => s.setName('set').setDescription('Definit un palier')
    .addIntegerOption((o) => o.setName('invitations').setDescription('Nombre d\'invitations requis').setRequired(true).setMinValue(1))
    .addRoleOption((o) => o.setName('role').setDescription('Role a attribuer').setRequired(true)))
  .addSubcommand((s) => s.setName('remove').setDescription('Retire un palier')
    .addIntegerOption((o) => o.setName('invitations').setDescription('Palier a retirer').setRequired(true)))
  .addSubcommand((s) => s.setName('list').setDescription('Liste les paliers configures'))
  .toJSON();

const suggestCommand = new SlashCommandBuilder()
  .setName('suggest')
  .setDescription('Propose une suggestion (vote + validation staff).')
  .addStringOption((o) => o.setName('texte').setDescription('Ta suggestion').setRequired(true).setMaxLength(1000))
  .toJSON();

const birthdayCommand = new SlashCommandBuilder()
  .setName('birthday')
  .setDescription('Enregistre ta date d\'anniversaire (annonce automatique le jour J).')
  .addIntegerOption((o) => o.setName('mois').setDescription('Mois (1-12)').setRequired(true).setMinValue(1).setMaxValue(12))
  .addIntegerOption((o) => o.setName('jour').setDescription('Jour (1-31)').setRequired(true).setMinValue(1).setMaxValue(31))
  .toJSON();

const badgesCommand = new SlashCommandBuilder()
  .setName('badges')
  .setDescription('Affiche tes badges (ou ceux d\'un membre).')
  .addUserOption((o) => o.setName('membre').setDescription('Membre a consulter').setRequired(false))
  .toJSON();

const linkGameCommand = new SlashCommandBuilder()
  .setName('link-jeu')
  .setDescription('Lie ton pseudo Steam/Epic Games/Riot Games a ton profil.')
  .addStringOption((o) => o.setName('plateforme').setDescription('Plateforme').setRequired(true)
    .addChoices({ name: 'Steam', value: 'steam' }, { name: 'Epic Games', value: 'epic' }, { name: 'Riot Games', value: 'riot' }))
  .addStringOption((o) => o.setName('pseudo').setDescription('Ton pseudo sur cette plateforme').setRequired(true).setMaxLength(64))
  .toJSON();

const gameProfileCommand = new SlashCommandBuilder()
  .setName('profil-jeu')
  .setDescription('Affiche les pseudos Steam/Epic/Riot lies (les tiens ou ceux d\'un membre).')
  .addUserOption((o) => o.setName('membre').setDescription('Membre a consulter').setRequired(false))
  .toJSON();

const balanceCommand = new SlashCommandBuilder()
  .setName('balance')
  .setDescription('Affiche ton solde de pieces (ou celui d\'un membre).')
  .addUserOption((o) => o.setName('membre').setDescription('Membre a consulter').setRequired(false))
  .toJSON();

const dailyCommand = new SlashCommandBuilder()
  .setName('daily')
  .setDescription('Recupere ta recompense quotidienne de pieces.')
  .toJSON();

const payCommand = new SlashCommandBuilder()
  .setName('pay')
  .setDescription('Envoie des pieces a un autre membre.')
  .addUserOption((o) => o.setName('membre').setDescription('Destinataire').setRequired(true))
  .addIntegerOption((o) => o.setName('montant').setDescription('Montant a envoyer').setRequired(true).setMinValue(1))
  .toJSON();

const shopCommand = new SlashCommandBuilder()
  .setName('shop')
  .setDescription('Affiche la boutique du serveur.')
  .toJSON();

const economyLeaderboardCommand = new SlashCommandBuilder()
  .setName('economy-leaderboard')
  .setDescription('Classement des membres les plus riches.')
  .toJSON();

const ticketCommand = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Ouvre un ticket de support prive avec le staff.')
  .toJSON();

const ticketPanelCommand = new SlashCommandBuilder()
  .setName('ticket-panel')
  .setDescription('Poste un panneau avec un bouton "Ouvrir un ticket" dans un salon.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((o) => o.setName('salon').setDescription('Salon ou poster le panneau (defaut : ce salon)').addChannelTypes(ChannelType.GuildText).setRequired(false))
  .toJSON();

const pollPanelCommand = new SlashCommandBuilder()
  .setName('poll-panel')
  .setDescription('Poste un panneau avec un bouton "Creer un sondage" dans un salon.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((o) => o.setName('salon').setDescription('Salon ou poster le panneau (defaut : ce salon)').addChannelTypes(ChannelType.GuildText).setRequired(false))
  .toJSON();

const reglementPanelCommand = new SlashCommandBuilder()
  .setName('reglement-panel')
  .setDescription('Reposte/rafraichit l\'embed du reglement avec le texte actuel.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .toJSON();

const rolesPanelCommand = new SlashCommandBuilder()
  .setName('roles-panel')
  .setDescription('Force la mise a jour du message a select menus du salon #roles.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .toJSON();

const remindCommand = new SlashCommandBuilder()
  .setName('remind')
  .setDescription('Te rappelle quelque chose en MP apres un delai.')
  .addStringOption((o) => o.setName('duree').setDescription('Ex : 10m, 2h, 1j (max 30j)').setRequired(true).setMaxLength(10))
  .addStringOption((o) => o.setName('message').setDescription('Ce que je dois te rappeler').setRequired(true).setMaxLength(500))
  .toJSON();

module.exports = [
  reportMessageCommand,
  cannedResponseCommand,
  configSummaryCommand,
  helpCommand,
  remindCommand,
  setupCommand, warnCommand, warningsCommand, clearwarnsCommand, timeoutCommand, tempbanCommand, unlockCommand, automodCommand,
  scheduleAnnouncementCommand, scheduleEventCommand, scheduledListCommand, scheduledCancelCommand,
  rankCommand, leaderboardCommand, levelroleCommand, pollCommand, pollPanelCommand, giveawayCommand,
  giveawayRerollCommand,
  invitesCommand, referralroleCommand, badgesCommand, birthdayCommand, suggestCommand, ticketCommand, ticketPanelCommand,
  reglementTranslationCommand, streamerLinkCommand, streamerUnlinkCommand, streamerListCommand,
  reglementPanelCommand, rolesPanelCommand, linkGameCommand, gameProfileCommand,
  balanceCommand, dailyCommand, payCommand, shopCommand, economyLeaderboardCommand,
];
