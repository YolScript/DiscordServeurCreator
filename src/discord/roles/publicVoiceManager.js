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

async function handleVoiceStateUpdate(oldState, newState) {
  const guild = newState.guild ?? oldState.guild;
  const config = await guildConfigStore.find(guild.id);
  if (!config?.publicVoiceCreatorChannelId) return;

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

    if (newState.channelId === config.publicVoiceCreatorChannelId && newState.member) {
      const room = await guild.channels.create({
        name: `Vocal de ${newState.member.displayName}`.slice(0, 100),
        type: ChannelType.GuildVoice,
        parent: config.vocauxCategoryId,
        permissionOverwrites: publicVoicePermissionOverwrites(guild, config),
      });
      await newState.member.voice.setChannel(room.id).catch(() => {});
      state.spawnedChannelIds.push(room.id);
      await publicVoiceStore.set(guild.id, state);
      logger.info(`Vocal public personnel cree sur ${guild.id}`);
    }
  });
}

module.exports = { ensurePublicVoiceCreator, handleVoiceStateUpdate };
