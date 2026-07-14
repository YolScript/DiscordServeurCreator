import { botFetch } from './discordApi.js';
import { bitmaskFromNames } from './permissions.js';

// Applique immediatement (une seule fois, pas un etat continu) les
// permissions du systeme de service : le salon SERVICE STAFF devient visible
// pour les roles staff choisis, et chaque categorie/salon selectionne devient
// cache par defaut, revele uniquement via le role "Staff Actif". Comme le
// masquage repose sur ce role (ajoute/retire automatiquement au bascule), la
// visibilite se met ensuite a jour toute seule sans re-appel a cette route.
export async function applyServiceVisibility(env, guildId, config) {
  if (!config?.staffActifRoleId) {
    throw new Error("Le systeme de service n'est pas encore initialise sur ce serveur (connecte-toi une fois au salon SERVICE STAFF, ou relance le bot).");
  }

  const staffRoleIds = config.staffRoleIds?.length
    ? config.staffRoleIds
    : [config.moderateurRoleId, config.adminRoleId].filter(Boolean);

  if (config.serviceStaffChannelId) {
    const overwrites = [
      { id: guildId, type: 0, allow: '0', deny: bitmaskFromNames(['ViewChannel', 'Connect']) },
      ...staffRoleIds.map((roleId) => ({
        id: roleId, type: 0, allow: bitmaskFromNames(['ViewChannel', 'Connect']), deny: '0',
      })),
    ];
    await botFetch(env, `/channels/${config.serviceStaffChannelId}`, {
      method: 'PATCH',
      body: JSON.stringify({ permission_overwrites: overwrites }),
    });
  }

  const targets = [
    ...(config.onDutyHiddenCategoryIds || []),
    ...(config.onDutyHiddenChannelIds || []),
  ];

  for (const channelId of targets) {
    const overwrites = [
      { id: guildId, type: 0, allow: '0', deny: bitmaskFromNames(['ViewChannel']) },
      {
        id: config.staffActifRoleId,
        type: 0,
        allow: bitmaskFromNames(['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'Connect', 'Speak']),
        deny: '0',
      },
    ];
    // eslint-disable-next-line no-await-in-loop
    await botFetch(env, `/channels/${channelId}`, {
      method: 'PATCH',
      body: JSON.stringify({ permission_overwrites: overwrites }),
    });
  }

  return { staffRoleIds, appliedTargets: targets.length };
}
