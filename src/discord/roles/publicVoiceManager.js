const { ChannelType, PermissionFlagsBits: P } = require('discord.js');
const guildConfigStore = require('../../kv/guildConfigStore');
const publicVoiceStore = require('../../kv/publicVoiceStore');
const logger = require('../../shared/logger');

// File sequentielle par guilde : evite les creations/suppressions concurrentes
// quand plusieurs membres rejoignent/quittent en meme temps.
const guildQueues = new Map();
function enqueue(guildId, task) {
  const previous = guildQueues.get(guildId) || Promise.resolve();
  const next = previous.then(task, task);
  guildQueues.set(guildId, next.catch(() => {}));
  return next;
}

function publicVoicePermissionOverwrites(guild, config) {
  if (!config.reglementValidatedRoleId) return [];
  return [
    { id: guild.roles.everyone.id, deny: [P.ViewChannel, P.Connect] },
    { id: config.reglementValidatedRoleId, allow: [P.ViewChannel, P.Connect, P.Speak] },
  ];
}

// Salon declencheur "Creer un vocal" dans la categorie Vocaux : rejoindre ce
// salon genere un vocal personnel dedie (meme principe que le createur staff,
// cf staffVoiceCreator.js), plutot que des salons "Vocal Public" partages a
// capacite fixe.
async function ensurePublicVoiceCreator(guild) {
  const config = await guildConfigStore.find(guild.id);
  if (!config?.vocauxCategoryId) return null;

  const existing = config.publicVoiceCreatorChannelId
    ? await guild.channels.fetch(config.publicVoiceCreatorChannelId).catch(() => null)
    : null;
  if (existing) return existing;

  const channel = await guild.channels.create({
    name: '➕ Creer un vocal',
    type: ChannelType.GuildVoice,
    parent: config.vocauxCategoryId,
    permissionOverwrites: publicVoicePermissionOverwrites(guild, config),
  });
  await guildConfigStore.upsert(guild.id, { publicVoiceCreatorChannelId: channel.id });
  return channel;
}

// Salons "hub" additionnels crees a la volee depuis le dashboard (categorie
// > Creer un salon > Vocal temporaire) : contrairement au hub principal
// (config.publicVoiceCreatorChannelId, cible config.vocauxCategoryId), ces
// hubs generent leur salon dans leur PROPRE categorie parente, lue en direct
// au moment ou quelqu'un les rejoint.
async function handleExtraHubJoin(guild, config, newState) {
  const hubIds = config.extraVoiceHubChannelIds || [];
  if (!hubIds.includes(newState.channelId)) return null;
  const hub = await guild.channels.fetch(newState.channelId).catch(() => null);
  if (!hub) return null;
  return guild.channels.create({
    name: `Vocal de ${newState.member.displayName}`.slice(0, 100),
    type: ChannelType.GuildVoice,
    parent: hub.parentId || undefined,
    permissionOverwrites: publicVoicePermissionOverwrites(guild, config),
  });
}

async function handleVoiceStateUpdate(oldState, newState) {
  const guild = newState.guild ?? oldState.guild;
  const config = await guildConfigStore.find(guild.id);
  const hasMainHub = Boolean(config?.publicVoiceCreatorChannelId);
  const hasExtraHubs = Boolean(config?.extraVoiceHubChannelIds?.length);
  if (!hasMainHub && !hasExtraHubs) return;

  await enqueue(guild.id, async () => {
    const state = await publicVoiceStore.get(guild.id);

    if (oldState.channelId && state.spawnedChannelIds.includes(oldState.channelId)) {
      const channel = await guild.channels.fetch(oldState.channelId).catch(() => null);
      if (channel && channel.members.size === 0) {
        await channel.delete().catch(() => {});
        state.spawnedChannelIds = state.spawnedChannelIds.filter((id) => id !== oldState.channelId);
        await publicVoiceStore.set(guild.id, state);
      }
    }

    if (newState.channelId && newState.member) {
      let room = null;
      if (newState.channelId === config.publicVoiceCreatorChannelId) {
        room = await guild.channels.create({
          name: `Vocal de ${newState.member.displayName}`.slice(0, 100),
          type: ChannelType.GuildVoice,
          parent: config.vocauxCategoryId,
          permissionOverwrites: publicVoicePermissionOverwrites(guild, config),
        });
      } else if (hasExtraHubs) {
        room = await handleExtraHubJoin(guild, config, newState);
      }
      if (room) {
        await newState.member.voice.setChannel(room.id).catch(() => {});
        state.spawnedChannelIds.push(room.id);
        await publicVoiceStore.set(guild.id, state);
        logger.info(`Vocal temporaire personnel cree sur ${guild.id}`);
      }
    }
  });
}

module.exports = { ensurePublicVoiceCreator, handleVoiceStateUpdate };
