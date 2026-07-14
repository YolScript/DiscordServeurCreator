import { botFetchJson } from './discordApi.js';
import { bitmaskFromNames } from './permissions.js';
import { toSmallCaps } from './smallCaps.js';

// Catalogue de salons pregeneres, ajoutables en un clic depuis le dashboard.
export const CHANNEL_PRESETS = [
  { key: 'screenshots', name: 'screenshots', type: 'text', profile: 'writable', description: "Partage de captures d'ecran" },
  { key: 'clips', name: 'clips', type: 'text', profile: 'writable', description: 'Partage de clips/videos' },
  { key: 'galerie', name: 'galerie', type: 'text', profile: 'writable', description: 'Fanart / creations des membres' },
  { key: 'suggestions', name: 'suggestions', type: 'text', profile: 'writable', description: 'Boite a idees' },
  { key: 'sondages', name: 'sondages', type: 'text', profile: 'writable', description: 'Sondages communautaires' },
  { key: 'partenariats', name: 'partenariats', type: 'text', profile: 'readonly', description: 'Annonces de partenariats' },
  { key: 'evenements', name: 'evenements', type: 'text', profile: 'readonly', description: "Annonces d'evenements" },
  { key: 'changelog', name: 'changelog', type: 'text', profile: 'readonly', description: 'Notes de mise a jour du serveur' },
  { key: 'recrutement', name: 'recrutement', type: 'text', profile: 'readonly', description: 'Annonces de recrutement staff' },
  { key: 'faq', name: 'faq', type: 'text', profile: 'readonly', description: 'Questions frequentes' },
  { key: 'support', name: 'support', type: 'text', profile: 'writable', description: "Demandes d'aide" },
  { key: 'bug-report', name: 'bug-report', type: 'text', profile: 'writable', description: 'Signalement de bugs' },
  { key: 'memes', name: 'memes', type: 'text', profile: 'writable', description: 'Detente / memes' },
  { key: 'presentation', name: 'presentation', type: 'text', profile: 'writable', description: 'Presentation des nouveaux membres' },
  { key: 'vocal-detente', name: 'Vocal Detente', type: 'voice', profile: 'voice-public', description: 'Salon vocal supplementaire' },
  { key: 'vocal-musique', name: 'Vocal Musique', type: 'voice', profile: 'voice-public', description: "Salon vocal pour ecouter de la musique" },
  { key: 'vocal-duo', name: 'Vocal Duo', type: 'voice', profile: 'voice-public', description: 'Petit salon vocal (2-4 personnes)' },
];

// Categories pregenerees : creent la categorie + tous ses salons enfants en un
// clic (chaque salon reutilise un preset de CHANNEL_PRESETS ci-dessus).
export const CATEGORY_PRESETS = [
  {
    key: 'contenu',
    name: 'Contenu',
    description: 'Partage de contenu communautaire (screenshots, clips, memes, galerie)',
    channelKeys: ['screenshots', 'clips', 'galerie', 'memes'],
  },
  {
    key: 'support',
    name: 'Support',
    description: 'Aide, bugs et FAQ',
    channelKeys: ['support', 'bug-report', 'faq'],
  },
  {
    key: 'evenements',
    name: 'Evenements & Annonces',
    description: 'Annonces, sondages, partenariats et evenements',
    channelKeys: ['evenements', 'sondages', 'partenariats', 'changelog'],
  },
  {
    key: 'vocaux-detente',
    name: 'Vocaux Detente',
    description: 'Salons vocaux additionnels',
    channelKeys: ['vocal-detente', 'vocal-musique', 'vocal-duo'],
  },
];

function overwritesForProfile(profile, config, everyoneId) {
  if (profile === 'readonly') {
    return [
      { id: everyoneId, type: 0, deny: bitmaskFromNames(['ViewChannel']), allow: '0' },
      {
        id: config.reglementValidatedRoleId, type: 0,
        allow: bitmaskFromNames(['ViewChannel', 'ReadMessageHistory']),
        deny: bitmaskFromNames(['SendMessages']),
      },
      {
        id: config.moderateurRoleId, type: 0,
        allow: bitmaskFromNames(['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'ManageMessages']),
        deny: '0',
      },
    ];
  }
  if (profile === 'voice-public') {
    return [
      { id: everyoneId, type: 0, deny: bitmaskFromNames(['ViewChannel', 'Connect']), allow: '0' },
      {
        id: config.reglementValidatedRoleId, type: 0,
        allow: bitmaskFromNames(['ViewChannel', 'Connect', 'Speak']),
        deny: '0',
      },
    ];
  }
  // writable (par defaut)
  return [
    { id: everyoneId, type: 0, deny: bitmaskFromNames(['ViewChannel']), allow: '0' },
    {
      id: config.reglementValidatedRoleId, type: 0,
      allow: bitmaskFromNames(['ViewChannel', 'ReadMessageHistory', 'SendMessages']),
      deny: '0',
    },
  ];
}

function categoryOverwrites(config, everyoneId) {
  return [
    { id: everyoneId, type: 0, deny: bitmaskFromNames(['ViewChannel']), allow: '0' },
    { id: config.reglementValidatedRoleId, type: 0, allow: bitmaskFromNames(['ViewChannel']), deny: '0' },
  ];
}

export async function createPresetChannel(env, guildId, config, presetKey, categoryId) {
  const preset = CHANNEL_PRESETS.find((p) => p.key === presetKey);
  if (!preset) throw new Error(`Preset de salon inconnu: ${presetKey}`);

  const body = {
    name: preset.type === 'voice' ? preset.name : toSmallCaps(preset.name),
    type: preset.type === 'voice' ? 2 : 0,
    parent_id: categoryId || undefined,
    permission_overwrites: overwritesForProfile(preset.profile, config, guildId),
  };
  return botFetchJson(env, `/guilds/${guildId}/channels`, { method: 'POST', body: JSON.stringify(body) });
}

export async function createPresetCategory(env, guildId, config, categoryKey) {
  const preset = CATEGORY_PRESETS.find((p) => p.key === categoryKey);
  if (!preset) throw new Error(`Preset de categorie inconnu: ${categoryKey}`);

  const category = await botFetchJson(env, `/guilds/${guildId}/channels`, {
    method: 'POST',
    body: JSON.stringify({
      name: toSmallCaps(preset.name),
      type: 4,
      permission_overwrites: categoryOverwrites(config, guildId),
    }),
  });

  const channels = [];
  for (const channelKey of preset.channelKeys) {
    // Sequentiel (pas Promise.all) pour eviter le rate-limit sur la creation de salons.
    // eslint-disable-next-line no-await-in-loop
    const channel = await createPresetChannel(env, guildId, config, channelKey, category.id);
    channels.push(channel);
  }
  return { category, channels };
}
