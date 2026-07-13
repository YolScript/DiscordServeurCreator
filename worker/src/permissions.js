import { PermissionFlagsBits } from 'discord-api-types/v10';
import { botFetch, botFetchJson } from './discordApi.js';

export function bitmaskFromNames(names = []) {
  let mask = 0n;
  for (const name of names) {
    const bit = PermissionFlagsBits[name];
    if (bit === undefined) throw new Error(`Permission inconnue: ${name}`);
    mask |= BigInt(bit);
  }
  return mask.toString();
}

export async function setChannelRoleOverwrite(env, channelId, roleId, { allow = [], deny = [] }) {
  const res = await botFetch(env, `/channels/${channelId}/permissions/${roleId}`, {
    method: 'PUT',
    body: JSON.stringify({ type: 0, allow: bitmaskFromNames(allow), deny: bitmaskFromNames(deny) }),
  });
  if (!res.ok) throw new Error(`Echec edition permission salon ${channelId}: ${res.status} ${await res.text()}`);
}

// Selectionne plusieurs salons + une modification de permissions -> applique
// en un clic sur tous les salons choisis.
export async function bulkEditPermissions(env, { channelIds, roleId, allow, deny }) {
  const results = [];
  for (const channelId of channelIds) {
    try {
      await setChannelRoleOverwrite(env, channelId, roleId, { allow, deny });
      results.push({ channelId, ok: true });
    } catch (err) {
      results.push({ channelId, ok: false, error: String(err.message || err) });
    }
  }
  return results;
}

// Export : renvoie les permission overwrites bruts d'un salon (copiable/collable).
export async function exportChannelPermissions(env, channelId) {
  const channel = await botFetchJson(env, `/channels/${channelId}`);
  return {
    channelId: channel.id,
    channelName: channel.name,
    permissionOverwrites: channel.permission_overwrites ?? [],
  };
}

// Import : applique un blob permissionOverwrites (colle depuis un export) sur un salon cible.
export async function importChannelPermissions(env, channelId, permissionOverwrites) {
  for (const overwrite of permissionOverwrites) {
    const res = await botFetch(env, `/channels/${channelId}/permissions/${overwrite.id}`, {
      method: 'PUT',
      body: JSON.stringify({ type: overwrite.type, allow: overwrite.allow, deny: overwrite.deny }),
    });
    if (!res.ok) throw new Error(`Echec import de l'overwrite ${overwrite.id} sur ${channelId}: ${res.status}`);
  }
}

// Presets de permissions par defaut, alignes sur src/discord/guildSetup/templates/common.js
// cote bot (a garder synchronise si les roles de base evoluent).
export const DEFAULT_ROLE_PERMISSIONS = {
  administrateur: ['Administrator'],
  moderateur: [
    'KickMembers', 'BanMembers', 'ManageMessages', 'ManageNicknames',
    'MuteMembers', 'DeafenMembers', 'ModerateMembers', 'ViewAuditLog', 'MoveMembers',
  ],
};

export async function resetRoleToDefault(env, guildId, roleId, presetKey) {
  const names = DEFAULT_ROLE_PERMISSIONS[presetKey];
  if (!names) throw new Error(`Preset de role inconnu: ${presetKey}`);
  const res = await botFetch(env, `/guilds/${guildId}/roles/${roleId}`, {
    method: 'PATCH',
    body: JSON.stringify({ permissions: bitmaskFromNames(names) }),
  });
  if (!res.ok) throw new Error(`Echec de la reinitialisation du role ${roleId}: ${res.status} ${await res.text()}`);
}
