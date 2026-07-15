import { botFetchJson } from './discordApi.js';
import { bitmaskFromNames } from './permissions.js';
import { toSmallCaps } from './smallCaps.js';

function writableOverwrites(config, everyoneId) {
  if (!config?.reglementValidatedRoleId) return undefined;
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
  if (!config?.reglementValidatedRoleId) return undefined;
  return [
    { id: everyoneId, type: 0, deny: bitmaskFromNames(['ViewChannel']), allow: '0' },
    { id: config.reglementValidatedRoleId, type: 0, allow: bitmaskFromNames(['ViewChannel']), deny: '0' },
  ];
}

const DISCORD_CHANNEL_TYPE = {
  text: 0, voice: 2, 'voice-temp': 2, forum: 15,
};

export async function createCustomChannel(env, guildId, config, {
  name, type, categoryId, isPrivate,
}) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Nom du salon requis.');
  const discordType = DISCORD_CHANNEL_TYPE[type];
  if (discordType === undefined) throw new Error(`Type de salon invalide: ${type}`);
  const isVoiceLike = discordType === 2;
  // isPrivate === undefined -> comportement historique (prive par defaut si
  // le serveur a un role "reglement valide"). isPrivate === false -> aucun
  // overwrite, le salon herite de la visibilite de sa categorie.
  const overwrites = isPrivate === false ? undefined : writableOverwrites(config, guildId);

  return botFetchJson(env, `/guilds/${guildId}/channels`, {
    method: 'POST',
    body: JSON.stringify({
      name: isVoiceLike ? trimmed : toSmallCaps(trimmed),
      type: discordType,
      parent_id: categoryId || undefined,
      permission_overwrites: overwrites,
    }),
  });
}

export async function createCustomCategory(env, guildId, config, { name }) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Nom de la categorie requis.');

  return botFetchJson(env, `/guilds/${guildId}/channels`, {
    method: 'POST',
    body: JSON.stringify({
      name: toSmallCaps(trimmed),
      type: 4,
      permission_overwrites: categoryOverwrites(config, guildId),
    }),
  });
}
