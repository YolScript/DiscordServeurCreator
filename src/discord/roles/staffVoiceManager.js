const { ChannelType, PermissionFlagsBits: P } = require('discord.js');
const guildConfigStore = require('../../kv/guildConfigStore');
const staffVoiceStore = require('../../kv/staffVoiceStore');
const logger = require('../../shared/logger');

// File sequentielle par guilde : evite les creations/suppressions concurrentes
// du hub quand plusieurs evenements de presence/voix arrivent en rafale.
const guildQueues = new Map();
function enqueue(guildId, task) {
  const previous = guildQueues.get(guildId) || Promise.resolve();
  const next = previous.then(task, task);
  guildQueues.set(guildId, next.catch(() => {}));
  return next;
}

function isStaff(member, config) {
  return member.roles.cache.has(config.moderateurRoleId) || member.roles.cache.has(config.adminRoleId);
}

function anyStaffOnline(guild, config) {
  return guild.members.cache.some((m) => isStaff(m, config) && m.presence && m.presence.status !== 'offline');
}

function staffVoicePermissionOverwrites(guild, config) {
  return [
    { id: guild.roles.everyone.id, deny: [P.ViewChannel, P.Connect] },
    { id: config.moderateurRoleId, allow: [P.ViewChannel, P.Connect, P.Speak] },
    { id: config.adminRoleId, allow: [P.ViewChannel, P.Connect, P.Speak] },
  ];
}

// A appeler sur presenceUpdate (et au ready pour l'etat initial) : cree le hub
// "Vocal Staff" des qu'un staff est en ligne (mobile ou PC), le supprime des
// que plus aucun staff n'est en ligne.
async function syncHub(guild) {
  const config = await guildConfigStore.find(guild.id);
  if (!config?.vocauxCategoryId || !config.moderateurRoleId) return;

  await enqueue(guild.id, async () => {
    const state = await staffVoiceStore.get(guild.id);
    const online = anyStaffOnline(guild, config);

    if (online && !state.hubChannelId) {
      const hub = await guild.channels.create({
        name: 'Vocal Staff',
        type: ChannelType.GuildVoice,
        parent: config.vocauxCategoryId,
        permissionOverwrites: staffVoicePermissionOverwrites(guild, config),
      });
      state.hubChannelId = hub.id;
      await staffVoiceStore.set(guild.id, state);
      logger.info(`Hub Vocal Staff cree (${guild.id})`);
    } else if (!online && state.hubChannelId) {
      const hub = await guild.channels.fetch(state.hubChannelId).catch(() => null);
      if (hub) await hub.delete().catch(() => {});
      state.hubChannelId = null;
      await staffVoiceStore.set(guild.id, state);
      logger.info(`Hub Vocal Staff supprime (${guild.id})`);
    }
  });
}

// A appeler sur voiceStateUpdate : quand un staff rejoint le hub, cree un
// salon dedie et l'y deplace immediatement. Nettoie les salons dedies
// devenus vides.
async function handleVoiceStateUpdate(oldState, newState) {
  const guild = newState.guild ?? oldState.guild;
  const config = await guildConfigStore.find(guild.id);
  if (!config?.vocauxCategoryId) return;

  await enqueue(guild.id, async () => {
    const state = await staffVoiceStore.get(guild.id);

    if (newState.channelId && state.hubChannelId && newState.channelId === state.hubChannelId) {
      const member = newState.member;
      const room = await guild.channels.create({
        name: `Staff - ${member.displayName}`.slice(0, 100),
        type: ChannelType.GuildVoice,
        parent: config.vocauxCategoryId,
        permissionOverwrites: staffVoicePermissionOverwrites(guild, config),
      });
      state.spawnedChannelIds.push(room.id);
      await staffVoiceStore.set(guild.id, state);
      await member.voice.setChannel(room.id).catch(() => {});
    }

    if (oldState.channelId && state.spawnedChannelIds.includes(oldState.channelId)) {
      const channel = await guild.channels.fetch(oldState.channelId).catch(() => null);
      if (channel && channel.members.size === 0) {
        await channel.delete().catch(() => {});
        state.spawnedChannelIds = state.spawnedChannelIds.filter((id) => id !== oldState.channelId);
        await staffVoiceStore.set(guild.id, state);
      }
    }
  });
}

module.exports = { syncHub, handleVoiceStateUpdate, anyStaffOnline };
