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

export async function createCustomChannel(env, guildId, config, { name, type, categoryId }) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Nom du salon requis.');
  const isVoice = type === 'voice';

  return botFetchJson(env, `/guilds/${guildId}/channels`, {
    method: 'POST',
    body: JSON.stringify({
      name: isVoice ? trimmed : toSmallCaps(trimmed),
      type: isVoice ? 2 : 0,
      parent_id: categoryId || undefined,
      permission_overwrites: writableOverwrites(config, guildId),
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
