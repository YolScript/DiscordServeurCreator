// Templates de serveur complets (roadmap n°143) : appliques de facon
// ADDITIVE — seuls les elements dont le nom n'existe pas encore sont crees,
// jamais de suppression ni de modification de l'existant. Noms de salons en
// petites majuscules sans emoji (convention du createur), via toSmallCaps.

import { botFetchJson } from './discordApi.js';
import { toSmallCaps } from './smallCaps.js';

const READONLY_DENY = '2048'; // SendMessages
const STAFF_HIDE_DENY = '1024'; // ViewChannel

export const SERVER_TEMPLATES = {
  gaming: {
    label: 'Gaming',
    roles: [
      { name: 'Joueur', color: 0x30a46c },
      { name: 'VIP', color: 0xd9a03c, hoist: true },
    ],
    categories: [
      {
        name: 'accueil',
        channels: [
          { name: 'bienvenue', readonly: true },
          { name: 'regles', readonly: true },
          { name: 'annonces', readonly: true },
        ],
      },
      {
        name: 'communaute',
        channels: [
          { name: 'general' },
          { name: 'clips-et-screens' },
          { name: 'recherche-team' },
        ],
      },
      {
        name: 'vocaux',
        channels: [
          { name: 'Salon 1', type: 2 },
          { name: 'Salon 2', type: 2 },
          { name: 'AFK', type: 2 },
        ],
      },
    ],
  },
  communaute: {
    label: 'Communaute',
    roles: [
      { name: 'Membre actif', color: 0x5b8def },
      { name: 'Booster', color: 0xc97a5c, hoist: true },
    ],
    categories: [
      {
        name: 'infos',
        channels: [
          { name: 'bienvenue', readonly: true },
          { name: 'reglement', readonly: true },
          { name: 'annonces', readonly: true },
          { name: 'roles', readonly: true },
        ],
      },
      {
        name: 'discussions',
        channels: [
          { name: 'general' },
          { name: 'photos-et-medias' },
          { name: 'suggestions' },
          { name: 'presentations' },
        ],
      },
      {
        name: 'detente',
        channels: [
          { name: 'blabla', type: 2 },
          { name: 'musique', type: 2 },
        ],
      },
    ],
  },
  etudes: {
    label: 'Etudes',
    roles: [
      { name: 'Etudiant', color: 0x30a46c },
      { name: 'Tuteur', color: 0xd9a03c, hoist: true },
    ],
    categories: [
      {
        name: 'organisation',
        channels: [
          { name: 'infos', readonly: true },
          { name: 'planning', readonly: true },
          { name: 'ressources' },
        ],
      },
      {
        name: 'entraide',
        channels: [
          { name: 'questions' },
          { name: 'exercices' },
          { name: 'general' },
        ],
      },
      {
        name: 'salles-de-travail',
        channels: [
          { name: 'Focus 1', type: 2 },
          { name: 'Focus 2', type: 2 },
          { name: 'Pause', type: 2 },
        ],
      },
    ],
  },
};

function normalizeName(name) {
  return (name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');
}

// Applique un template : renvoie { createdChannels, createdRoles, skipped }.
export async function applyServerTemplate(env, guildId, templateKey) {
  const template = SERVER_TEMPLATES[templateKey];
  if (!template) throw new Error(`Template inconnu : ${templateKey}`);

  const [existingChannels, existingRoles] = await Promise.all([
    botFetchJson(env, `/guilds/${guildId}/channels`),
    botFetchJson(env, `/guilds/${guildId}/roles`),
  ]);
  const channelNames = new Set(existingChannels.map((c) => normalizeName(c.name)));
  const roleNames = new Set(existingRoles.map((r) => normalizeName(r.name)));

  let createdChannels = 0;
  let createdRoles = 0;
  let skipped = 0;

  for (const role of template.roles) {
    if (roleNames.has(normalizeName(role.name))) { skipped += 1; continue; }
    // eslint-disable-next-line no-await-in-loop
    await botFetchJson(env, `/guilds/${guildId}/roles`, {
      method: 'POST',
      body: JSON.stringify({ name: role.name, color: role.color, hoist: Boolean(role.hoist), mentionable: false }),
    });
    createdRoles += 1;
  }

  for (const category of template.categories) {
    let categoryId = existingChannels.find((c) => c.type === 4 && normalizeName(c.name) === normalizeName(category.name))?.id;
    if (!categoryId) {
      // eslint-disable-next-line no-await-in-loop
      const created = await botFetchJson(env, `/guilds/${guildId}/channels`, {
        method: 'POST',
        body: JSON.stringify({ name: toSmallCaps(category.name), type: 4 }),
      });
      categoryId = created.id;
      createdChannels += 1;
    }
    for (const channel of category.channels) {
      if (channelNames.has(normalizeName(channel.name))) { skipped += 1; continue; }
      const isVoice = channel.type === 2;
      // eslint-disable-next-line no-await-in-loop
      await botFetchJson(env, `/guilds/${guildId}/channels`, {
        method: 'POST',
        body: JSON.stringify({
          name: isVoice ? channel.name : toSmallCaps(channel.name),
          type: isVoice ? 2 : 0,
          parent_id: categoryId,
          permission_overwrites: channel.readonly
            ? [{ id: guildId, type: 0, deny: READONLY_DENY, allow: '0' }]
            : channel.staffOnly
              ? [{ id: guildId, type: 0, deny: STAFF_HIDE_DENY, allow: '0' }]
              : undefined,
        }),
      });
      createdChannels += 1;
    }
  }

  return { createdChannels, createdRoles, skipped };
}
