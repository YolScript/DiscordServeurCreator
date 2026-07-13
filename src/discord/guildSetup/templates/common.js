const { PermissionFlagsBits: P, ChannelType } = require('discord.js');
const { BASE_ROLE_COLORS } = require('../colors');

// Ordre du haut (pouvoir max) vers le bas — sert à la fois à la création des rôles
// et à guild.roles.setPositions(). Les rôles de jeu générés dynamiquement
// s'intercalent entre 'reglementValidated' et 'plus16' (cf gameRoleManager).
const ROLE_BLUEPRINT = [
  {
    key: 'bot', name: 'Bot', color: BASE_ROLE_COLORS.administrateur, hoist: false, mentionable: false,
    permissions: [P.Administrator],
  },
  {
    key: 'administrateur', name: 'Administrateur', color: BASE_ROLE_COLORS.administrateur, hoist: true, mentionable: true,
    permissions: [P.Administrator],
  },
  {
    key: 'moderateur', name: 'Modérateur', color: BASE_ROLE_COLORS.moderateur, hoist: true, mentionable: true,
    permissions: [
      P.KickMembers, P.BanMembers, P.ManageMessages, P.ManageNicknames,
      P.MuteMembers, P.DeafenMembers, P.ModerateMembers, P.ViewAuditLog, P.MoveMembers,
    ],
  },
  {
    key: 'streameur', name: 'Streameur', color: BASE_ROLE_COLORS.streameur, hoist: true, mentionable: true,
    permissions: [],
  },
  {
    key: 'contributeur', name: 'Contributeur', color: BASE_ROLE_COLORS.contributeur, hoist: true, mentionable: false,
    permissions: [],
  },
  {
    key: 'follow', name: 'Follow', color: BASE_ROLE_COLORS.follow, hoist: true, mentionable: false,
    permissions: [],
  },
  {
    key: 'verifie', name: 'Vérifié', color: BASE_ROLE_COLORS.verifie, hoist: false, mentionable: false,
    permissions: [],
  },
  {
    key: 'reglementValidated', name: 'Règlement validé', color: BASE_ROLE_COLORS.reglementValidated, hoist: false, mentionable: false,
    permissions: [],
  },
  {
    key: 'plus16', name: '+16', color: BASE_ROLE_COLORS.plus16, hoist: false, mentionable: false,
    permissions: [],
  },
  {
    key: 'minus16', name: '-16', color: BASE_ROLE_COLORS.minus16, hoist: false, mentionable: false,
    permissions: [],
  },
];

// Blueprint des salons. Chaque salon définit SES PROPRES permissionOverwrites
// explicites (les salons Discord ne héritent pas automatiquement des permissions
// de leur catégorie via l'API, seul le client copie visuellement à la création).
function getChannelBlueprint(roleIds) {
  const readOnlyCommunity = (extraDeny = []) => [
    { id: roleIds.everyone, deny: [P.ViewChannel] },
    { id: roleIds.reglementValidated, allow: [P.ViewChannel, P.ReadMessageHistory], deny: [P.SendMessages, ...extraDeny] },
    { id: roleIds.moderateur, allow: [P.ViewChannel, P.ReadMessageHistory, P.SendMessages, P.ManageMessages] },
  ];

  const writableCommunity = () => [
    { id: roleIds.everyone, deny: [P.ViewChannel] },
    { id: roleIds.reglementValidated, allow: [P.ViewChannel, P.ReadMessageHistory, P.SendMessages] },
  ];

  const publicVoice = () => [
    { id: roleIds.everyone, deny: [P.ViewChannel, P.Connect] },
    { id: roleIds.reglementValidated, allow: [P.ViewChannel, P.Connect, P.Speak] },
  ];

  return [
    {
      key: 'bienvenue',
      name: '📋 Bienvenue',
      permissionOverwrites: [{ id: roleIds.everyone, allow: [P.ViewChannel] }],
      channels: [
        {
          key: 'reglement', name: 'règlement', type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: roleIds.everyone, allow: [P.ViewChannel, P.ReadMessageHistory], deny: [P.SendMessages, P.AddReactions] },
            { id: roleIds.moderateur, allow: [P.SendMessages] },
          ],
        },
        {
          key: 'arrivee-depart', name: 'arrivée-départ', type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: roleIds.everyone, allow: [P.ViewChannel, P.ReadMessageHistory], deny: [P.SendMessages, P.AddReactions] },
            { id: roleIds.moderateur, allow: [P.SendMessages] },
          ],
        },
      ],
    },
    {
      key: 'communaute',
      name: '💬 Communauté',
      permissionOverwrites: [
        { id: roleIds.everyone, deny: [P.ViewChannel] },
        { id: roleIds.reglementValidated, allow: [P.ViewChannel] },
      ],
      channels: [
        { key: 'annonces', name: 'annonces', type: ChannelType.GuildText, permissionOverwrites: readOnlyCommunity() },
        { key: 'info', name: 'info', type: ChannelType.GuildText, permissionOverwrites: readOnlyCommunity() },
        { key: 'roles', name: 'rôles', type: ChannelType.GuildText, permissionOverwrites: readOnlyCommunity() },
        { key: 'liens', name: 'liens', type: ChannelType.GuildText, permissionOverwrites: readOnlyCommunity() },
        { key: 'general', name: 'général', type: ChannelType.GuildText, permissionOverwrites: writableCommunity() },
      ],
    },
    {
      key: 'vocaux',
      name: '🔊 Vocaux',
      permissionOverwrites: [
        { id: roleIds.everyone, deny: [P.ViewChannel, P.Connect] },
        { id: roleIds.reglementValidated, allow: [P.ViewChannel, P.Connect] },
      ],
      // Pas de "Vocal Staff" statique ici : ce salon est cree/supprime
      // dynamiquement par staffVoiceManager selon la presence en ligne du staff.
      channels: [
        { key: 'vocal-public-1', name: 'Vocal Public 1', type: ChannelType.GuildVoice, permissionOverwrites: publicVoice() },
        { key: 'vocal-public-2', name: 'Vocal Public 2', type: ChannelType.GuildVoice, permissionOverwrites: publicVoice() },
      ],
    },
  ];
}

module.exports = { ROLE_BLUEPRINT, getChannelBlueprint };
