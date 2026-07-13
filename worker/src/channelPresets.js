import { botFetchJson } from './discordApi.js';
import { bitmaskFromNames } from './permissions.js';

// Catalogue de salons pregeneres, ajoutables en un clic depuis le dashboard.
export const CHANNEL_PRESETS = [
  { key: 'screenshots', name: 'screenshots', type: 'text', profile: 'writable', description: "Partage de captures d'ecran" },
  { key: 'clips', name: 'clips', type: 'text', profile: 'writable', description: 'Partage de clips/videos' },
  { key: 'suggestions', name: 'suggestions', type: 'text', profile: 'writable', description: 'Boite a idees' },
  { key: 'partenariats', name: 'partenariats', type: 'text', profile: 'readonly', description: 'Annonces de partenariats' },
  { key: 'evenements', name: 'evenements', type: 'text', profile: 'readonly', description: "Annonces d'evenements" },
  { key: 'support', name: 'support', type: 'text', profile: 'writable', description: "Demandes d'aide" },
  { key: 'memes', name: 'memes', type: 'text', profile: 'writable', description: 'Detente / memes' },
  { key: 'vocal-detente', name: 'Vocal Detente', type: 'voice', profile: 'voice-public', description: 'Salon vocal supplementaire' },
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

export async function createPresetChannel(env, guildId, config, presetKey, categoryId) {
  const preset = CHANNEL_PRESETS.find((p) => p.key === presetKey);
  if (!preset) throw new Error(`Preset de salon inconnu: ${presetKey}`);

  const body = {
    name: preset.name,
    type: preset.type === 'voice' ? 2 : 0,
    parent_id: categoryId || undefined,
    permission_overwrites: overwritesForProfile(preset.profile, config, guildId),
  };
  return botFetchJson(env, `/guilds/${guildId}/channels`, { method: 'POST', body: JSON.stringify(body) });
}
